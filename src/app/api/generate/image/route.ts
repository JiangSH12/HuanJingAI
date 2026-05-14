import { NextRequest, NextResponse } from 'next/server';
import { ImageGenerationClient, Config, HeaderUtils, S3Storage } from 'coze-coding-dev-sdk';
import { buildCustomApiHeaders, fetchWithRetry, parseCustomApiError } from '@/lib/custom-api-fetch';
import { getAspectRatioPromptHint } from '@/lib/model-config';
import { getAdapter } from '@/lib/api-adapters';
import type { ImageAdapterParams } from '@/lib/api-adapters/types';

interface CustomApiConfig {
  apiUrl: string;
  modelName: string;
  apiKey: string;
  provider: string;
  apiFormat?: string;
}

const GENERATION_TIMEOUT = 120_000;

/**
 * Upload a media data URL to S3 storage and return a presigned URL.
 * Used for persisting generated images/videos so they can be displayed in the browser
 * and stored in localStorage history without the huge data URL payload.
 *
 * Includes a 30s timeout to prevent blocking the response if S3 is slow.
 */
async function persistMediaToStorage(dataUrl: string, prefix: string): Promise<string> {
  // Only handle data URLs — remote URLs are handled separately
  if (!dataUrl.startsWith('data:')) return dataUrl;

  try {
    const match = dataUrl.match(/^data:((?:image|video)\/[^;]+);base64,(.+)$/);
    if (!match) return dataUrl;
    const [, mimeType, base64Data] = match;
    const ext = mimeType.split('/')[1] || 'png';
    const buffer = Buffer.from(base64Data, 'base64');
    const fileName = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const storage = new S3Storage();

    // Wrap upload in a 30s timeout
    const uploadPromise = storage.uploadFile({
      fileContent: buffer,
      fileName,
      contentType: mimeType,
    });

    const fileKey = await withTimeout(uploadPromise, 30_000, 'S3 uploadFile');
    if (!fileKey) {
      console.error('[Persist Media] uploadFile returned empty key');
      return dataUrl;
    }

    const presignedUrl = await withTimeout(
      storage.generatePresignedUrl({ key: fileKey, expireTime: 2592000 }),
      10_000,
      'S3 generatePresignedUrl',
    );

    if (presignedUrl) {
      console.log('[Persist Media] Success, key:', fileKey, 'size:', buffer.length, 'bytes');
      return presignedUrl;
    }

    return dataUrl;
  } catch (err) {
    console.error('[Persist Media Error]', err instanceof Error ? err.message : err);
    return dataUrl;
  }
}

/**
 * Upload remote URL content to S3 for persistent access.
 * Includes a 30s timeout for the download+upload operation.
 */
async function persistRemoteUrlToStorage(url: string, prefix: string): Promise<string> {
  if (!url.startsWith('http')) return url;

  try {
    const storage = new S3Storage();
    const fileKey = await withTimeout(
      storage.uploadFromUrl({ url, timeout: 30000 }),
      45_000,
      'S3 uploadFromUrl',
    );
    if (!fileKey) return url;

    const presignedUrl = await withTimeout(
      storage.generatePresignedUrl({ key: fileKey, expireTime: 2592000 }),
      10_000,
      'S3 generatePresignedUrl (remote)',
    );

    if (presignedUrl) {
      console.log('[Persist Remote URL] Success, key:', fileKey);
      return presignedUrl;
    }
    return url;
  } catch (err) {
    console.warn('[Persist Remote URL] Failed, using original URL:', err instanceof Error ? err.message : err);
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

/**
 * Process an array of image/video URLs: upload data URLs and remote URLs to S3,
 * return presigned URLs for persistent browser-accessible results.
 *
 * If S3 upload fails and the fallback data URL is too large (>5MB),
 * skip that image to avoid returning a huge JSON response.
 */
async function persistAllMediaUrls(urls: string[], prefix: string): Promise<string[]> {
  const MAX_DATA_URL_SIZE = 5 * 1024 * 1024; // 5MB limit for data URLs in JSON
  const results = await Promise.all(
    urls.map(async (url) => {
      try {
        if (url.startsWith('data:')) {
          const result = await persistMediaToStorage(url, prefix);
          // If S3 upload failed and data URL is too large, skip it
          if (result.startsWith('data:') && result.length > MAX_DATA_URL_SIZE) {
            console.warn('[Persist Media] Data URL too large (' + Math.round(result.length / 1024 / 1024) + 'MB), skipping');
            return null;
          }
          return result;
        }
        if (url.startsWith('http')) {
          return persistRemoteUrlToStorage(url, prefix);
        }
        return url;
      } catch (err) {
        console.error('[persistAllMediaUrls] Error for URL prefix=' + url.slice(0, 30), err instanceof Error ? err.message : err);
        // If data URL is too large, skip it
        if (url.startsWith('data:') && url.length > MAX_DATA_URL_SIZE) return null;
        return url;
      }
    }),
  );
  return results.filter((u): u is string => u !== null);
}

/**
 * Upload a base64 data URL to S3 storage and return a presigned URL.
 */
async function uploadDataUrlAndGetPublicUrl(dataUrl: string): Promise<string | null> {
  try {
    const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (!match) return null;
    const [, mimeType, base64Data] = match;
    const ext = mimeType.split('/')[1] || 'png';
    const buffer = Buffer.from(base64Data, 'base64');
    const fileName = `img2img-ref/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const storage = new S3Storage();
    const fileKey = await storage.uploadFile({
      fileContent: buffer,
      fileName,
      contentType: mimeType,
    });

    if (!fileKey) {
      console.error('[Upload Ref Image] uploadFile returned empty key');
      return null;
    }

    const presignedUrl = await storage.generatePresignedUrl({
      key: fileKey,
      expireTime: 3600,
    });

    console.log('[Upload Ref Image] Success, key:', fileKey, 'url length:', presignedUrl?.length);
    return presignedUrl || null;
  } catch (err) {
    console.error('[Upload Ref Image Error]', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Derive the chat completions endpoint URL from an images/generations URL.
 */
function deriveChatCompletionsUrl(imagesUrl: string): string {
  if (imagesUrl.includes('/chat/completions')) return imagesUrl;
  return imagesUrl
    .replace(/\/images\/(generations|edits).*/i, '/chat/completions')
    .replace(/\/+$/, '');
}

/**
 * Derive the images/edits endpoint URL from an images/generations URL.
 * This is the official OpenAI endpoint for image-to-image.
 */
function deriveImagesEditsUrl(imagesUrl: string): string {
  if (imagesUrl.includes('/images/edits')) return imagesUrl;
  return imagesUrl
    .replace(/\/images\/generations.*/i, '/images/edits')
    .replace(/\/+$/, '');
}

/**
 * Extract image URLs/data from a chat completions response.
 */
function extractImagesFromChatResponse(data: Record<string, unknown>): string[] {
  const images: string[] = [];
  const choices = data.choices as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(choices)) {
    for (const choice of choices) {
      const message = choice.message as Record<string, unknown> | undefined;
      if (!message) continue;
      const content = message.content;

      if (typeof content === 'string') {
        if (content.startsWith('data:image/') || content.startsWith('http')) {
          images.push(content);
        }
        const mdMatch = content.match(/!\[.*?\]\((data:image\/[^)]+)\)/);
        if (mdMatch) images.push(mdMatch[1]);
        const urlMatch = content.match(/(https?:\/\/[^\s"']+\.(png|jpg|jpeg|webp)[^\s"']*)/i);
        if (urlMatch) images.push(urlMatch[1]);
      } else if (Array.isArray(content)) {
        for (const item of content as Array<Record<string, unknown>>) {
          if (item.type === 'image_url' && item.image_url) {
            const url = (item.image_url as Record<string, unknown>).url;
            if (typeof url === 'string') images.push(url);
          }
          if (item.type === 'image' && item.image) {
            const imgData = item.image as Record<string, unknown>;
            if (typeof imgData.url === 'string') images.push(imgData.url);
            if (typeof imgData.b64_json === 'string') {
              images.push(`data:image/png;base64,${imgData.b64_json}`);
            }
          }
          if (item.type === 'text' && typeof item.text === 'string') {
            const text = item.text as string;
            if (text.startsWith('data:image/')) images.push(text);
            if (text.startsWith('http') && /\.(png|jpg|jpeg|webp)/i.test(text)) images.push(text);
            const mdMatch = text.match(/!\[.*?\]\((data:image\/[^)]+)\)/);
            if (mdMatch) images.push(mdMatch[1]);
            const urlMatch = text.match(/(https?:\/\/[^\s"']+\.(png|jpg|jpeg|webp)[^\s"']*)/i);
            if (urlMatch) images.push(urlMatch[1]);
          }
        }
      }
    }
  }
  return images;
}

/**
 * Extract images from images/generations or images/edits response format.
 */
function extractImagesFromGenerationsResponse(data: Record<string, unknown>): string[] {
  const images: string[] = [];
  if (Array.isArray(data.data)) {
    for (const item of data.data as Array<Record<string, unknown>>) {
      if (typeof item === 'string') { images.push(item); continue; }
      if (item.b64_json && typeof item.b64_json === 'string') {
        images.push(`data:image/png;base64,${item.b64_json}`);
      }
      if (item.url && typeof item.url === 'string') images.push(item.url);
    }
  } else if (typeof data.url === 'string') {
    images.push(data.url);
  } else if (typeof data.image_url === 'string') {
    images.push(data.image_url);
  }
  return images;
}

/** Track which strategy produced a result */
interface StrategyResult {
  success: boolean;
  images?: string[];
  error?: string;
  strategyName: string;
}

/**
 * Try a single API request strategy and return the result.
 */
async function tryImageStrategy(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  strategyName: string,
  isChatFormat: boolean,
): Promise<StrategyResult> {
  console.log(`[Custom API img2img → ${strategyName}] URL:`, url,
    '| model:', body.model,
    '| body_keys:', Object.keys(body).join(','));

  try {
    const response = await fetchWithRetry(
      url,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      },
      GENERATION_TIMEOUT,
      1,
    );

    if (response.ok) {
      const data = await response.json();
      let images = isChatFormat
        ? extractImagesFromChatResponse(data as Record<string, unknown>)
        : [];
      if (images.length === 0) {
        images = extractImagesFromGenerationsResponse(data as Record<string, unknown>);
      }

      if (images.length > 0) {
        console.log(`[Custom API img2img → ${strategyName} SUCCESS] Got`, images.length, 'images');
        return { success: true, images, strategyName };
      }

      console.warn(`[Custom API img2img → ${strategyName}] OK but no images extracted, keys:`, Object.keys(data));
      return { success: false, error: '响应中无图片数据', strategyName };
    }

    const errorText = await response.text();
    console.warn(`[Custom API img2img → ${strategyName} FAILED]`, response.status, errorText.slice(0, 200));
    return { success: false, error: `${response.status}: ${errorText.slice(0, 100)}`, strategyName };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '请求异常';
    console.warn(`[Custom API img2img → ${strategyName} ERROR]`, msg);
    return { success: false, error: msg, strategyName };
  }
}

/**
 * Try images/edits endpoint with multipart/form-data format.
 *
 * CRITICAL: This is the format Cherry Studio (Electron app) uses for img2img.
 * OpenAI's official /v1/images/edits endpoint uses multipart/form-data, NOT JSON.
 * API proxies like mozhevip.top route based on Content-Type:
 * - multipart/form-data → routed to img2img account pool → WORKS
 * - application/json → routed to wrong pool → 503 "No available compatible accounts"
 *
 * This is why the same API+Key works in Cherry Studio but not from our server.
 */
async function tryEditsWithFormData(
  url: string,
  apiKey: string,
  model: string,
  prompt: string,
  imageBuffer: Buffer,
  imageMimeType: string,
  size: string | undefined,
  strength: number | undefined,
  count: number,
): Promise<StrategyResult> {
  const strategyName = '策略2: images/edits (FormData)';
  console.log(`[Custom API img2img → ${strategyName}] URL:`, url, '| model:', model);

  try {
    // Build multipart/form-data manually (Node.js doesn't have native FormData that works with fetch)
    const boundary = `----FormBoundary${Date.now()}${Math.random().toString(36).slice(2)}`;
    const parts: Buffer[] = [];

    // Add text fields
    const textFields: Record<string, string> = {
      model,
      prompt,
    };
    if (size) textFields.size = size;
    if (count > 1) textFields.n = String(count);
    if (strength !== undefined) textFields.strength = String(strength);

    for (const [key, value] of Object.entries(textFields)) {
      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`
      ));
    }

    // Add image file field
    const ext = imageMimeType.split('/')[1] || 'png';
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="image.${ext}"\r\nContent-Type: ${imageMimeType}\r\n\r\n`
    ));
    parts.push(imageBuffer);
    parts.push(Buffer.from(`\r\n`));

    // Close boundary
    parts.push(Buffer.from(`--${boundary}--\r\n`));

    const bodyBuffer = Buffer.concat(parts);

    const response = await fetchWithRetry(
      url,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        },
        body: bodyBuffer,
      },
      GENERATION_TIMEOUT,
      1,
    );

    if (response.ok) {
      const data = await response.json();
      const images = extractImagesFromGenerationsResponse(data as Record<string, unknown>);
      if (images.length > 0) {
        console.log(`[Custom API img2img → ${strategyName} SUCCESS] Got`, images.length, 'images');
        return { success: true, images, strategyName };
      }
      console.warn(`[Custom API img2img → ${strategyName}] OK but no images, keys:`, Object.keys(data));
      return { success: false, error: '响应中无图片数据', strategyName };
    }

    const errorText = await response.text();
    console.warn(`[Custom API img2img → ${strategyName} FAILED]`, response.status, errorText.slice(0, 200));
    return { success: false, error: `${response.status}: ${errorText.slice(0, 100)}`, strategyName };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '请求异常';
    console.warn(`[Custom API img2img → ${strategyName} ERROR]`, msg);
    return { success: false, error: msg, strategyName };
  }
}

/**
 * Image-to-image via custom API with multi-strategy approach.
 * Tries 3 different endpoint formats in order:
 * 1. /v1/chat/completions with image_url (Cherry Studio / OpenAI multimodal style)
 * 2. /v1/images/edits with image (Official OpenAI image edit endpoint)
 * 3. /v1/images/generations with init_image (Reference code / Stable Diffusion style)
 */
async function customApiImageToImage(
  customApiConfig: CustomApiConfig,
  prompt: string,
  negativePrompt: string | undefined,
  image: string,
  strength: number | undefined,
  aspectRatio?: string,
): Promise<NextResponse> {
  const adapter = getAdapter(customApiConfig.apiFormat);
  const endpoint = customApiConfig.apiUrl;
  if (!endpoint) {
    return NextResponse.json({ error: '自定义API未配置请求地址' }, { status: 400 });
  }
  if (!customApiConfig.modelName) {
    return NextResponse.json({ error: '自定义API未配置模型名称，请在设置中填写模型名称（如 gpt-image-2）' }, { status: 400 });
  }

  // Build adapter params
  const params: ImageAdapterParams = {
    apiUrl: endpoint,
    modelName: customApiConfig.modelName,
    apiKey: customApiConfig.apiKey,
    prompt,
    negativePrompt,
    aspectRatio,
    image,
    strength,
  };
  const requestBody = adapter.buildImageRequest(params);

  // Upload reference image to S3 if adapter didn't handle it
  let imageUrl = image;
  if (image.startsWith('data:')) {
    console.log('[Custom API img2img] Uploading reference image to S3...');
    const uploadedUrl = await uploadDataUrlAndGetPublicUrl(image);
    if (uploadedUrl) {
      imageUrl = uploadedUrl;
      console.log('[Custom API img2img] Using S3 URL, size reduction:', image.length, '→', imageUrl.length);
    }
  }

  // Send request using adapter's format
  console.log(`[Custom API img2img] format=${customApiConfig.apiFormat || 'openai'}, endpoint=${endpoint}`);
  try {
    const response = await fetchWithRetry(
      endpoint,
      {
        method: 'POST',
        headers: buildCustomApiHeaders(customApiConfig.apiKey, customApiConfig.apiFormat),
        body: JSON.stringify(requestBody),
      },
      GENERATION_TIMEOUT,
      1,
    );

    if (response.ok) {
      const data = await response.json();
      const images = adapter.parseImageResponse(data as Record<string, unknown>);
      if (images.length > 0) {
        const persistedImages = await persistAllMediaUrls(images, 'generated/images');
        return NextResponse.json({ images: persistedImages });
      }
      console.warn(`[Custom API img2img] OK but no images, keys:`, Object.keys(data));
    } else {
      const errorText = await response.text();
      console.warn(`[Custom API img2img] FAILED: ${response.status}`, errorText.slice(0, 200));
    }
  } catch (err) {
    console.warn(`[Custom API img2img] Error:`, err instanceof Error ? err.message : 'unknown');
  }

  // Fallback: for OpenAI format, try multi-strategy approach
  if ((customApiConfig.apiFormat || 'openai') === 'openai') {
    console.log('[Custom API img2img] Falling back to multi-strategy approach for OpenAI format...');
    return await customApiImageToImageOpenAI(customApiConfig, prompt, negativePrompt, image, strength, aspectRatio);
  }

  return NextResponse.json(
    {
      error: `图生图失败：无法从响应中提取图片。请检查 API 格式配置是否正确。`,
    },
    { status: 502 }
  );
}

/** OpenAI-specific multi-strategy fallback */
async function customApiImageToImageOpenAI(
  customApiConfig: CustomApiConfig,
  prompt: string,
  negativePrompt: string | undefined,
  image: string,
  strength: number | undefined,
  aspectRatio?: string,
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
  } else {
    try {
      const imgRes = await fetch(image);
      if (imgRes.ok) {
        const contentType = imgRes.headers.get('content-type') || 'image/png';
        imageMimeType = contentType.split(';')[0];
        const arrayBuf = await imgRes.arrayBuffer();
        imageBuffer = Buffer.from(arrayBuf);
      }
    } catch (e) {
      console.warn('[Custom API img2img] Failed to download reference image from URL:', e);
    }
  }

  let imageUrl = image;
  if (image.startsWith('data:')) {
    const uploadedUrl = await uploadDataUrlAndGetPublicUrl(image);
    if (uploadedUrl) imageUrl = uploadedUrl;
  }

  let promptText = prompt;
  if (negativePrompt) promptText += `\n\n负面提示词（排除以下元素）: ${negativePrompt}`;
  if (strength !== undefined && strength !== 0.5) {
    promptText += `\n\n[重绘幅度: ${strength.toFixed(2)}]`;
  }
  if (aspectRatio) {
    const hint = getAspectRatioPromptHint(aspectRatio);
    if (hint) promptText += `\n\n[${hint}]`;
  }

  const denoisingStrength = strength ?? 0.5;

  // Strategy 1: images/edits with multipart/form-data
  if (imageBuffer) {
    const editsUrl = endpoint.replace(/\/images\/generations.*/i, '/images/edits').replace(/\/+$/, '');
    const result1 = await tryEditsWithFormData(editsUrl, customApiConfig.apiKey, customApiConfig.modelName, promptText, imageBuffer, imageMimeType, undefined, denoisingStrength, 1);
    if (result1.success && result1.images) {
      const persistedImages = await persistAllMediaUrls(result1.images, 'generated/images');
      return NextResponse.json({ images: persistedImages });
    }
  }

  // Strategy 2: chat/completions with image_url
  const chatUrl = endpoint.replace(/\/images\/generations.*/i, '/chat/completions').replace(/\/+$/, '');
  const chatBody: Record<string, unknown> = {
    model: customApiConfig.modelName,
    stream: false,
    messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: imageUrl } }, { type: 'text', text: promptText }] }],
  };
  const result2 = await tryImageStrategy(chatUrl, headers, chatBody, '策略2: chat/completions', true);
  if (result2.success && result2.images) {
    const persistedImages = await persistAllMediaUrls(result2.images, 'generated/images');
    return NextResponse.json({ images: persistedImages });
  }

  // Strategy 3: images/generations with init_image
  let rawBase64 = image.startsWith('data:') ? image.substring(image.indexOf(',') + 1) : image;
  const imgBody: Record<string, unknown> = {
    model: customApiConfig.modelName,
    prompt: promptText,
    n: 1,
    response_format: 'b64_json',
    init_image: rawBase64,
  };
  const result3 = await tryImageStrategy(endpoint, headers, imgBody, '策略3: images/generations+init_image', false);
  if (result3.success && result3.images) {
    const persistedImages = await persistAllMediaUrls(result3.images, 'generated/images');
    return NextResponse.json({ images: persistedImages });
  }

  return NextResponse.json(
    { error: `图生图失败：API代理返回503错误。建议：在Cherry Studio中查看实际端点URL和模型名。` },
    { status: 502 }
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      prompt,
      negativePrompt,
      model = 'doubao-seedream-5-0-260128',
      quality = '2K',
      size,
      aspectRatio,
      resolution,
      count = 1,
      guidanceScale = 7,
      image,
      strength,
      customApiConfig,
    } = body as {
      prompt?: string;
      negativePrompt?: string;
      model?: string;
      quality?: string;
      size?: string;
      aspectRatio?: string;
      resolution?: string;
      count?: number;
      guidanceScale?: number;
      image?: string;
      strength?: number;
      customApiConfig?: CustomApiConfig;
    };

    if (!prompt) {
      return NextResponse.json({ error: '请提供创作描述' }, { status: 400 });
    }

    if (prompt.length < 2) {
      return NextResponse.json({ error: '创作描述过短，请输入更详细的描述' }, { status: 400 });
    }

    // Log all incoming parameters for debugging
    console.log('[Image Generation] Params:', JSON.stringify({
      model,
      size,
      aspectRatio,
      resolution,
      count,
      guidanceScale,
      hasCustomApi: !!customApiConfig,
      customApiUrl: customApiConfig?.apiUrl,
      customApiModel: customApiConfig?.modelName,
      hasImage: !!image,
      strength,
      promptLength: prompt.length,
    }));

    // ---- Custom API mode ----
    if (customApiConfig && customApiConfig.apiKey) {
      try {
        // Image-to-image: use multi-strategy approach
        if (image) {
          return await customApiImageToImage(
            customApiConfig, prompt, negativePrompt, image, strength, aspectRatio,
          );
        }

        // Text-to-image: use adapter
        const adapter = getAdapter(customApiConfig.apiFormat);
        const n = Math.max(1, count || 1);
        const params: ImageAdapterParams = {
          apiUrl: customApiConfig.apiUrl,
          modelName: customApiConfig.modelName,
          apiKey: customApiConfig.apiKey,
          prompt,
          negativePrompt,
          aspectRatio,
          resolution,
          count: n,
          guidanceScale,
        };
        const requestBody = adapter.buildImageRequest(params);

        console.log('[Custom API Image] Text-to-image, format:', customApiConfig.apiFormat || 'openai',
          '| model:', customApiConfig.modelName,
          '| prompt_length:', prompt.length);

        let customResponse: Response;
        try {
          customResponse = await fetchWithRetry(
            customApiConfig.apiUrl,
            { method: 'POST', headers: buildCustomApiHeaders(customApiConfig.apiKey, customApiConfig.apiFormat), body: JSON.stringify(requestBody) },
            GENERATION_TIMEOUT,
            1,
          );
        } catch (fetchError: unknown) {
          if (fetchError instanceof DOMException && fetchError.name === 'AbortError') {
            return NextResponse.json({ error: '自定义API请求超时（120秒）' }, { status: 504 });
          }
          const msg = fetchError instanceof Error ? fetchError.message : '请求失败';
          if (msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND') || msg.includes('fetch failed')) {
            return NextResponse.json({ error: `无法连接到自定义API: ${msg}。请检查 API 地址` }, { status: 502 });
          }
          return NextResponse.json({ error: `自定义API网络错误: ${msg}` }, { status: 502 });
        }

        if (!customResponse.ok) {
          const errorText = await customResponse.text();
          console.error('[Custom API Image Error]', customResponse.status, errorText.slice(0, 500));
          return NextResponse.json(
            { error: parseCustomApiError(customResponse.status, errorText) },
            { status: customResponse.status >= 500 ? 502 : customResponse.status }
          );
        }

        const customData = await customResponse.json();
        let images = adapter.parseImageResponse(customData as Record<string, unknown>);
        console.log('[Custom API Image] Extracted', images.length, 'images from API response',
          '| format:', customApiConfig.apiFormat || 'openai',
          '| data type:', images.length > 0 ? (images[0].startsWith('data:') ? 'b64_json' : images[0].startsWith('http') ? 'url' : 'unknown') : 'none',
          '| response keys:', Object.keys(customData).join(','));

        // If API returned fewer images than requested, make additional requests
        if (n > 1 && images.length > 0 && images.length < n) {
          console.log(`[Custom API Image] Got ${images.length}/${n} images, making additional requests`);
          const remainingCount = n - images.length;
          const additionalPromises = Array.from({ length: remainingCount }, async () => {
            try {
              const addResponse = await fetchWithRetry(
                customApiConfig.apiUrl,
                {
                  method: 'POST',
                  headers: buildCustomApiHeaders(customApiConfig.apiKey, customApiConfig.apiFormat),
                  body: JSON.stringify(adapter.buildImageRequest({ ...params, count: 1 })),
                },
                GENERATION_TIMEOUT,
                1,
              );
              if (addResponse.ok) {
                const addData = await addResponse.json();
                return adapter.parseImageResponse(addData as Record<string, unknown>);
              }
            } catch {
              // Ignore individual failures
            }
            return [];
          });
          const additionalImages = await Promise.all(additionalPromises);
          for (const batch of additionalImages) {
            images = images.concat(batch);
          }
        }

        if (images.length === 0) {
          console.error('[Custom API Image] No images extracted from response. Raw data preview:',
            JSON.stringify(customData).slice(0, 500));
          return NextResponse.json({ error: '自定义API未返回有效图片数据', raw: customData }, { status: 502 });
        }
        // Persist all data URLs and remote URLs to S3 for browser display and history storage
        const persistedImages = await persistAllMediaUrls(images, 'generated/images');
        console.log('[Custom API Image] Persisted', persistedImages.length, '/', images.length, 'images',
          '| types:', persistedImages.map(u => u.startsWith('data:') ? 'data' : u.startsWith('http') ? 'url' : 'other').join(','));
        return NextResponse.json({ images: persistedImages });
      } catch (customError: unknown) {
        const msg = customError instanceof Error ? customError.message : '自定义API请求异常';
        console.error('[Custom API Image Exception]', msg);
        return NextResponse.json({ error: `自定义API异常: ${msg}` }, { status: 502 });
      }
    }

    // ---- Default mode: use coze-coding-dev-sdk ----
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new ImageGenerationClient(config, customHeaders);

    let sdkSize: string;
    if (size) {
      sdkSize = size;
    } else if (aspectRatio && resolution) {
      // Resolve from aspect ratio + resolution
      const sizeMap: Record<string, Record<string, string>> = {
        '1:1': { '1080P': '1024x1024', '2K': '2048x2048', '4K': '4096x4096' },
        '16:9': { '1080P': '1920x1080', '2K': '2560x1440', '4K': '3840x2160' },
        '9:16': { '1080P': '1080x1920', '2K': '1440x2560', '4K': '2160x3840' },
        '4:3': { '1080P': '1440x1080', '2K': '2560x1920', '4K': '4096x3072' },
        '3:4': { '1080P': '1080x1440', '2K': '1920x2560', '4K': '3072x4096' },
      };
      sdkSize = sizeMap[aspectRatio]?.[resolution] || '1024x1024';
    } else {
      sdkSize = quality === '4K' ? '4K' : quality === '1K' ? '1K' : '2K';
    }

    const generateRequest: Record<string, unknown> = {
      prompt,
      model,
      size: sdkSize,
      watermark: false,
    };

    if (negativePrompt) {
      generateRequest.negativePrompt = negativePrompt;
    }

    if (image) {
      if (image.startsWith('data:')) {
        const uploadedUrl = await uploadDataUrlAndGetPublicUrl(image);
        if (uploadedUrl) {
          generateRequest.image = uploadedUrl;
        } else {
          console.warn('[Image Gen] Failed to upload reference image, skipping');
        }
      } else {
        generateRequest.image = image;
      }
    }

    let response;
    try {
      const debugRequest = { ...generateRequest };
      if (typeof debugRequest.image === 'string' && debugRequest.image.length > 100) {
        debugRequest.image = `${debugRequest.image.substring(0, 60)}... (${debugRequest.image.length} chars)`;
      }
      console.log('[SDK Image Request]', JSON.stringify(debugRequest));
      response = await client.generate(generateRequest as unknown as Parameters<typeof client.generate>[0]);
    } catch (sdkError: unknown) {
      const sdkMessage = sdkError instanceof Error ? sdkError.message : '图片生成请求失败';
      let detail = '';
      try {
        const errObj = sdkError as { response?: { status?: number; data?: unknown; statusText?: string } };
        if (errObj.response) {
          const dataStr = errObj.response.data ? JSON.stringify(errObj.response.data) : '';
          detail = `status=${errObj.response.status} data=${dataStr.substring(0, 500)}`;
        }
      } catch { /* ignore */ }
      console.error('[Image Generation SDK Error]', sdkMessage, detail);
      if (image) {
        return NextResponse.json({
          error: '图生图生成失败: 内置模型图生图功能暂不可用。建议使用自定义API重试。',
        }, { status: 503 });
      }
      return NextResponse.json({ error: `图片生成服务暂时不可用: ${sdkMessage}` }, { status: 503 });
    }

    const helper = client.getResponseHelper(response);
    if (!helper.success) {
      const errorMsg = helper.errorMessages.length > 0 ? helper.errorMessages.join('; ') : '图片生成失败';
      return NextResponse.json({ error: errorMsg }, { status: 500 });
    }

    const images = helper.imageUrls;
    if (images.length === 0) {
      return NextResponse.json({ error: '图片生成失败，请稍后重试' }, { status: 500 });
    }

    // Persist SDK image URLs to S3 for reliable browser access
    const persistedImages = await persistAllMediaUrls(images, 'generated/images');
    return NextResponse.json({ images: persistedImages });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '图片生成失败';
    console.error('[Image Generation Error]', message, error instanceof Error ? error.stack : '');
    return NextResponse.json({ error: `生成失败: ${message}` }, { status: 500 });
  }
}
