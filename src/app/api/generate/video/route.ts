import { NextRequest, NextResponse } from 'next/server';
import { VideoGenerationClient, Config, HeaderUtils, S3Storage } from 'coze-coding-dev-sdk';
import { buildCustomApiHeaders, fetchWithRetry, parseCustomApiError } from '@/lib/custom-api-fetch';
import { getAspectRatioPromptHint } from '@/lib/model-config';
import { getAdapter } from '@/lib/api-adapters';
import type { VideoAdapterParams } from '@/lib/api-adapters/types';

interface CustomApiConfig {
  apiUrl: string;
  modelName: string;
  apiKey: string;
  provider: string;
  apiFormat?: string;
}

const GENERATION_TIMEOUT = 180_000;

/**
 * Upload a media data URL to S3 storage and return a presigned URL.
 * Includes a 45s timeout to prevent blocking the response.
 */
async function persistMediaToStorage(dataUrl: string, prefix: string): Promise<string> {
  if (!dataUrl.startsWith('data:')) return dataUrl;

  try {
    const match = dataUrl.match(/^data:((?:image|video)\/[^;]+);base64,(.+)$/);
    if (!match) return dataUrl;
    const [, mimeType, base64Data] = match;
    const ext = mimeType.split('/')[1] || 'mp4';
    const buffer = Buffer.from(base64Data, 'base64');
    const fileName = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const storage = new S3Storage();
    const fileKey = await withTimeout(
      storage.uploadFile({ fileContent: buffer, fileName, contentType: mimeType }),
      45_000,
      'S3 uploadFile (video)',
    );

    if (!fileKey) {
      console.error('[Persist Video Media] uploadFile returned empty key');
      return dataUrl;
    }

    const presignedUrl = await withTimeout(
      storage.generatePresignedUrl({ key: fileKey, expireTime: 2592000 }),
      10_000,
      'S3 generatePresignedUrl (video)',
    );

    if (presignedUrl) {
      console.log('[Persist Video Media] Success, key:', fileKey, 'size:', buffer.length, 'bytes');
      return presignedUrl;
    }

    return dataUrl;
  } catch (err) {
    console.error('[Persist Video Media Error]', err instanceof Error ? err.message : err);
    return dataUrl;
  }
}

async function persistRemoteUrlToStorage(url: string, prefix: string): Promise<string> {
  if (!url.startsWith('http')) return url;

  try {
    const storage = new S3Storage();
    const fileKey = await withTimeout(
      storage.uploadFromUrl({ url, timeout: 60000 }),
      60_000,
      'S3 uploadFromUrl (video)',
    );
    if (!fileKey) return url;

    const presignedUrl = await withTimeout(
      storage.generatePresignedUrl({ key: fileKey, expireTime: 2592000 }),
      10_000,
      'S3 generatePresignedUrl (video remote)',
    );

    if (presignedUrl) {
      console.log('[Persist Remote Video URL] Success, key:', fileKey);
      return presignedUrl;
    }
    return url;
  } catch (err) {
    console.warn('[Persist Remote Video URL] Failed, using original URL:', err instanceof Error ? err.message : err);
    return url;
  }
}

/** Helper: wrap a promise with a timeout that rejects with a descriptive message */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

async function persistAllMediaUrls(urls: string[], prefix: string): Promise<string[]> {
  const MAX_DATA_URL_SIZE = 10 * 1024 * 1024; // 10MB limit for video data URLs
  const results = await Promise.all(
    urls.map(async (url) => {
      try {
        if (url.startsWith('data:')) {
          const result = await persistMediaToStorage(url, prefix);
          if (result.startsWith('data:') && result.length > MAX_DATA_URL_SIZE) {
            console.warn('[Persist Video] Data URL too large (' + Math.round(result.length / 1024 / 1024) + 'MB), skipping');
            return null;
          }
          return result;
        }
        if (url.startsWith('http')) return persistRemoteUrlToStorage(url, prefix);
        return url;
      } catch (err) {
        console.error('[persistAllMediaUrls video] Error:', err instanceof Error ? err.message : err);
        if (url.startsWith('data:') && url.length > MAX_DATA_URL_SIZE) return null;
        return url;
      }
    }),
  );
  return results.filter((u): u is string => u !== null);
}

async function uploadDataUrlAndGetPublicUrl(dataUrl: string): Promise<string | null> {
  try {
    const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (!match) return null;
    const [, mimeType, base64Data] = match;
    const ext = mimeType.split('/')[1] || 'png';
    const buffer = Buffer.from(base64Data, 'base64');
    const fileName = `img2vid-ref/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const storage = new S3Storage();
    const fileKey = await storage.uploadFile({ fileContent: buffer, fileName, contentType: mimeType });
    if (!fileKey) return null;

    const presignedUrl = await storage.generatePresignedUrl({ key: fileKey, expireTime: 3600 });
    console.log('[Upload Ref Video Image] Success, key:', fileKey);
    return presignedUrl || null;
  } catch (err) {
    console.error('[Upload Ref Video Image Error]', err instanceof Error ? err.message : err);
    return null;
  }
}

function deriveChatCompletionsUrl(originalUrl: string): string {
  if (originalUrl.includes('/chat/completions')) return originalUrl;
  return originalUrl
    .replace(/\/(videos|images)\/(generations|edits).*/i, '/chat/completions')
    .replace(/\/+$/, '');
}

function deriveImagesEditsUrl(originalUrl: string): string {
  if (originalUrl.includes('/images/edits')) return originalUrl;
  return originalUrl
    .replace(/\/(videos|images)\/generations.*/i, '/images/edits')
    .replace(/\/+$/, '');
}

function extractVideosFromChatResponse(data: Record<string, unknown>): string[] {
  const videos: string[] = [];
  const choices = data.choices as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(choices)) {
    for (const choice of choices) {
      const message = choice.message as Record<string, unknown> | undefined;
      if (!message) continue;
      const content = message.content;
      if (typeof content === 'string') {
        if (content.startsWith('http') || content.startsWith('data:video/')) videos.push(content);
        const urlMatch = content.match(/(https?:\/\/[^\s"']+\.(mp4|mov|webm)[^\s"']*)/i);
        if (urlMatch) videos.push(urlMatch[1]);
      } else if (Array.isArray(content)) {
        for (const item of content as Array<Record<string, unknown>>) {
          if (item.type === 'video_url' && item.video_url) {
            const url = (item.video_url as Record<string, unknown>).url;
            if (typeof url === 'string') videos.push(url);
          }
          if (item.type === 'text' && typeof item.text === 'string') {
            const text = item.text as string;
            if (text.startsWith('http') || text.startsWith('data:video/')) videos.push(text);
            const urlMatch = text.match(/(https?:\/\/[^\s"']+\.(mp4|mov|webm)[^\s"']*)/i);
            if (urlMatch) videos.push(urlMatch[1]);
          }
        }
      }
    }
  }
  return videos;
}

function extractVideosFromGenerationsResponse(data: Record<string, unknown>): string[] {
  const videos: string[] = [];
  if (Array.isArray(data.data)) {
    for (const item of data.data as Array<Record<string, unknown>>) {
      if (typeof item === 'string') { videos.push(item); continue; }
      if (item.url && typeof item.url === 'string') videos.push(item.url);
      if (item.video_url && typeof item.video_url === 'string') videos.push(item.video_url);
      if (item.b64_json && typeof item.b64_json === 'string') {
        videos.push(`data:video/mp4;base64,${item.b64_json}`);
      }
    }
  } else if (typeof data.url === 'string') {
    videos.push(data.url);
  } else if (typeof data.video_url === 'string') {
    videos.push(data.video_url);
  }
  return videos;
}

async function customApiImageToVideo(
  customApiConfig: CustomApiConfig,
  prompt: string | undefined,
  negativePrompt: string | undefined,
  image: string,
  aspectRatio?: string,
  duration?: number,
  fps?: number,
): Promise<NextResponse> {
  const adapter = getAdapter(customApiConfig.apiFormat);
  const endpoint = customApiConfig.apiUrl;
  if (!endpoint) {
    return NextResponse.json({ error: '自定义API未配置请求地址' }, { status: 400 });
  }
  if (!customApiConfig.modelName) {
    return NextResponse.json({ error: '自定义API未配置模型名称' }, { status: 400 });
  }

  // Try adapter-based approach first
  const params: VideoAdapterParams = {
    apiUrl: endpoint,
    modelName: customApiConfig.modelName,
    apiKey: customApiConfig.apiKey,
    prompt,
    negativePrompt,
    aspectRatio,
    duration,
    fps,
    image,
  };
  const requestBody = adapter.buildVideoRequest(params);

  try {
    const response = await fetchWithRetry(
      endpoint,
      { method: 'POST', headers: buildCustomApiHeaders(customApiConfig.apiKey, customApiConfig.apiFormat), body: JSON.stringify(requestBody) },
      GENERATION_TIMEOUT, 1,
    );
    if (response.ok) {
      const data = await response.json();
      const videos = adapter.parseVideoResponse(data as Record<string, unknown>);
      if (videos.length > 0) {
        const persistedVideos = await persistAllMediaUrls(videos, 'generated/videos');
        return NextResponse.json({ videos: persistedVideos });
      }
    }
  } catch {
    // ignore, will fall back to multi-strategy
  }

  // Fallback: for OpenAI format, try multi-strategy approach
  if ((customApiConfig.apiFormat || 'openai') === 'openai') {
    return await customApiImageToVideoOpenAI(customApiConfig, prompt, negativePrompt, image, aspectRatio, duration, fps);
  }

  return NextResponse.json({ error: `图生视频失败：无法从响应中提取视频。请检查 API 格式配置是否正确。` }, { status: 502 });
}

/** OpenAI-specific multi-strategy fallback for image-to-video */
async function customApiImageToVideoOpenAI(
  customApiConfig: CustomApiConfig,
  prompt: string | undefined,
  negativePrompt: string | undefined,
  image: string,
  aspectRatio?: string,
  duration?: number,
  fps?: number,
): Promise<NextResponse> {
  const endpoint = customApiConfig.apiUrl;
  const headers = buildCustomApiHeaders(customApiConfig.apiKey, customApiConfig.apiFormat);

  // Prepare image buffer for FormData upload
  let imageBuffer: Buffer | null = null;
  let imageMimeType = 'image/png';
  if (image.startsWith('data:')) {
    const match = image.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (match) {
      imageMimeType = match[1];
      imageBuffer = Buffer.from(match[2], 'base64');
    }
  }

  // Upload reference image to S3
  let imageUrl = image;
  if (image.startsWith('data:')) {
    const uploadedUrl = await uploadDataUrlAndGetPublicUrl(image);
    if (uploadedUrl) imageUrl = uploadedUrl;
  }

  let promptText = prompt || '根据参考图生成视频';
  if (negativePrompt) promptText += `\n\n负面提示词: ${negativePrompt}`;
  // Augment prompt with aspect ratio hint
  if (aspectRatio) {
    const hint = getAspectRatioPromptHint(aspectRatio);
    if (hint) promptText += `\n\n[${hint}]`;
  }

  // Get raw base64 for strategies that need it
  let rawBase64 = image;
  if (image.startsWith('data:')) {
    const commaIndex = image.indexOf(',');
    if (commaIndex !== -1) rawBase64 = image.substring(commaIndex + 1);
  }

  const strategyResults: string[] = [];

  // --- Strategy 1: images/edits with multipart/form-data ---
  // Same as img2img - Cherry Studio uses multipart/form-data for image-based requests
  if (imageBuffer) {
    const editsUrl = deriveImagesEditsUrl(endpoint);
    console.log('[Custom API img2vid → 策略1: images/edits (FormData)] URL:', editsUrl, '| model:', customApiConfig.modelName);
    try {
      const boundary = `----FormBoundary${Date.now()}${Math.random().toString(36).slice(2)}`;
      const parts: Buffer[] = [];

      const textFields: Record<string, string> = {
        model: customApiConfig.modelName,
        prompt: promptText,
      };
      if (aspectRatio) textFields.aspect_ratio = aspectRatio;
      if (duration) textFields.duration = String(duration);
      if (fps) textFields.fps = String(fps);

      for (const [key, value] of Object.entries(textFields)) {
        parts.push(Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`
        ));
      }

      const ext = imageMimeType.split('/')[1] || 'png';
      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="image.${ext}"\r\nContent-Type: ${imageMimeType}\r\n\r\n`
      ));
      parts.push(imageBuffer);
      parts.push(Buffer.from(`\r\n`));
      parts.push(Buffer.from(`--${boundary}--\r\n`));

      const bodyBuffer = Buffer.concat(parts);

      const editsResponse = await fetchWithRetry(
        editsUrl,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${customApiConfig.apiKey}`,
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          },
          body: bodyBuffer,
        },
        GENERATION_TIMEOUT,
        1,
      );
      if (editsResponse.ok) {
        const editsData = await editsResponse.json();
        let videos = extractVideosFromGenerationsResponse(editsData as Record<string, unknown>);
        if (videos.length === 0) videos = extractVideosFromChatResponse(editsData as Record<string, unknown>);
        if (videos.length > 0) {
          const persistedVideos = await persistAllMediaUrls(videos, 'generated/videos');
          return NextResponse.json({ videos: persistedVideos });
        }
        strategyResults.push('策略1(images/edits FormData): 响应中无视频数据');
      } else {
        const errorText = await editsResponse.text();
        strategyResults.push(`策略1(images/edits FormData): ${editsResponse.status} ${errorText.slice(0, 100)}`);
      }
    } catch (err) {
      strategyResults.push(`策略1(images/edits FormData): ${err instanceof Error ? err.message : '异常'}`);
    }
  }

  // --- Strategy 2: chat/completions with image_url ---
  const chatUrl = deriveChatCompletionsUrl(endpoint);
  const chatBody: Record<string, unknown> = {
    model: customApiConfig.modelName,
    stream: false,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageUrl } },
          { type: 'text', text: promptText },
        ],
      },
    ],
  };
  if (aspectRatio) chatBody.aspect_ratio = aspectRatio;
  if (duration) chatBody.duration = duration;
  if (fps) chatBody.fps = fps;

  console.log('[Custom API img2vid → 策略2: chat/completions] URL:', chatUrl, '| model:', customApiConfig.modelName);
  try {
    const chatResponse = await fetchWithRetry(chatUrl, { method: 'POST', headers, body: JSON.stringify(chatBody) }, GENERATION_TIMEOUT, 1);
    if (chatResponse.ok) {
      const chatData = await chatResponse.json();
      let videos = extractVideosFromChatResponse(chatData as Record<string, unknown>);
      if (videos.length === 0) videos = extractVideosFromGenerationsResponse(chatData as Record<string, unknown>);
      if (videos.length > 0) {
        const persistedVideos = await persistAllMediaUrls(videos, 'generated/videos');
        return NextResponse.json({ videos: persistedVideos });
      }
    } else {
      const errorText = await chatResponse.text();
      strategyResults.push(`策略2(chat/completions): ${chatResponse.status} ${errorText.slice(0, 100)}`);
    }
  } catch (err) {
    strategyResults.push(`策略2(chat/completions): ${err instanceof Error ? err.message : '异常'}`);
  }

  // --- Strategy 3: images/generations with init_image ---
  const imgBody: Record<string, unknown> = {
    model: customApiConfig.modelName,
    prompt: promptText,
    n: 1,
    size: '1024x1024',
    response_format: 'b64_json',
    init_image: rawBase64,
  };
  if (aspectRatio) imgBody.aspect_ratio = aspectRatio;
  if (duration) imgBody.duration = duration;
  if (fps) imgBody.fps = fps;

  console.log('[Custom API img2vid → 策略3: images/generations] URL:', endpoint, '| model:', customApiConfig.modelName);
  try {
    const imgResponse = await fetchWithRetry(endpoint, { method: 'POST', headers, body: JSON.stringify(imgBody) }, GENERATION_TIMEOUT, 1);
    if (!imgResponse.ok) {
      const errorText = await imgResponse.text();
      strategyResults.push(`策略3(images/generations): ${imgResponse.status} ${errorText.slice(0, 100)}`);
    } else {
      const imgData = await imgResponse.json();
      const videos = extractVideosFromGenerationsResponse(imgData as Record<string, unknown>);
      if (videos.length > 0) {
        const persistedVideos = await persistAllMediaUrls(videos, 'generated/videos');
        return NextResponse.json({ videos: persistedVideos });
      }
      strategyResults.push('策略3(images/generations): 响应中无视频数据');
    }
  } catch (err) {
    strategyResults.push(`策略3(images/generations): ${err instanceof Error ? err.message : '异常'}`);
  }

  return NextResponse.json(
    {
      error: `图生视频失败：API代理返回503错误，可能原因：①该Key在代理上没有图生视频权限/余额 ②代理当前无可用图生视频账户 ③请求参数格式不被代理支持。`,
    },
    { status: 502 }
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      prompt,
      negativePrompt,
      model = 'doubao-seedance-1-5-pro-251215',
      aspectRatio = '16:9',
      duration = 5,
      fps = 30,
      image,
      customApiConfig,
    } = body as {
      prompt?: string;
      negativePrompt?: string;
      model?: string;
      aspectRatio?: string;
      duration?: number;
      fps?: number;
      image?: string;
      customApiConfig?: CustomApiConfig;
    };

    if (!prompt && !image) {
      return NextResponse.json({ error: '请提供视频描述或上传图片' }, { status: 400 });
    }

    // ---- Custom API mode ----
    if (customApiConfig && customApiConfig.apiKey) {
      try {
        if (image) {
          return await customApiImageToVideo(customApiConfig, prompt, negativePrompt, image, aspectRatio, duration, fps);
        }

        // Text-to-video: use adapter
        const adapter = getAdapter(customApiConfig.apiFormat);
        const params: VideoAdapterParams = {
          apiUrl: customApiConfig.apiUrl,
          modelName: customApiConfig.modelName,
          apiKey: customApiConfig.apiKey,
          prompt,
          negativePrompt,
          aspectRatio,
          duration,
          fps,
        };
        const requestBody = adapter.buildVideoRequest(params);

        console.log('[Custom API Video] Text-to-video, format:', customApiConfig.apiFormat || 'openai', '| model:', customApiConfig.modelName);

        let customResponse: Response;
        try {
          customResponse = await fetchWithRetry(
            customApiConfig.apiUrl,
            { method: 'POST', headers: buildCustomApiHeaders(customApiConfig.apiKey, customApiConfig.apiFormat), body: JSON.stringify(requestBody) },
            GENERATION_TIMEOUT, 1,
          );
        } catch (fetchError: unknown) {
          if (fetchError instanceof DOMException && fetchError.name === 'AbortError') {
            return NextResponse.json({ error: '自定义API请求超时（180秒）' }, { status: 504 });
          }
          const msg = fetchError instanceof Error ? fetchError.message : '请求失败';
          return NextResponse.json({ error: `自定义API网络错误: ${msg}` }, { status: 502 });
        }

        if (!customResponse.ok) {
          const errorText = await customResponse.text();
          return NextResponse.json(
            { error: parseCustomApiError(customResponse.status, errorText) },
            { status: customResponse.status >= 500 ? 502 : customResponse.status }
          );
        }

        const customData = await customResponse.json();
        const videos = adapter.parseVideoResponse(customData as Record<string, unknown>);
        if (videos.length === 0) {
          return NextResponse.json({ error: '自定义API未返回有效视频数据', raw: customData, format: customApiConfig?.apiFormat || 'openai' }, { status: 502 });
        }
        // Persist all data URLs and remote URLs to S3
        const persistedVideos = await persistAllMediaUrls(videos, 'generated/videos');
        return NextResponse.json({ videos: persistedVideos });
      } catch (customError: unknown) {
        const msg = customError instanceof Error ? customError.message : '自定义API请求异常';
        console.error('[Custom API Video Exception]', msg);
        return NextResponse.json({ error: `自定义API异常: ${msg}` }, { status: 502 });
      }
    }

    // ---- Default mode: use coze-coding-dev-sdk ----
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new VideoGenerationClient(config, customHeaders);

    const contentItems: Array<{ type: string; text?: string; image_url?: { url: string }; role?: string }> = [];
    if (image) {
      contentItems.push({ type: 'image_url', image_url: { url: image }, role: 'first_frame' });
    }
    if (prompt) {
      contentItems.push({ type: 'text', text: prompt });
    }

    const ratioMap: Record<string, '16:9' | '9:16' | '1:1' | '4:3' | '3:4'> = {
      '16:9': '16:9', '9:16': '9:16', '1:1': '1:1', '4:3': '4:3', '3:4': '3:4',
    };

    const response = await client.videoGeneration(contentItems as Parameters<typeof client.videoGeneration>[0], {
      model,
      duration: Math.min(Math.max(duration, 4), 12),
      ratio: ratioMap[aspectRatio] || '16:9',
      resolution: '720p',
      generateAudio: true,
    });

    const videos: string[] = [];
    if (response.videoUrl) videos.push(response.videoUrl);
    if (videos.length === 0) return NextResponse.json({ error: '视频生成失败，请稍后重试' }, { status: 500 });

    // Persist SDK video URLs to S3 for reliable browser access
    const persistedVideos = await persistAllMediaUrls(videos, 'generated/videos');
    return NextResponse.json({ videos: persistedVideos });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '视频生成失败';
    console.error('[Video Generation Error]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
