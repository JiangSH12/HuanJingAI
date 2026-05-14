import { NextRequest, NextResponse } from 'next/server';
import { S3Storage } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { buildCustomApiHeaders, fetchWithRetry, parseCustomApiError } from '@/lib/custom-api-fetch';
import { getAspectRatioPromptHint } from '@/lib/model-config';
import { getAdapter } from '@/lib/api-adapters';
import type { VideoAdapterParams } from '@/lib/api-adapters/types';

// 硅基流动默认配置
const SILICONFLOW_CONFIG = {
  apiKey: process.env.SILICONFLOW_API_KEY,
  apiUrl: process.env.SILICONFLOW_API_URL || 'https://api.siliconflow.cn/v1',
  modelName: process.env.SILICONFLOW_VIDEO_MODEL || 'Wan-AI/Wan2.2-I2V-A14B',
};

const GENERATION_TIMEOUT = 300_000; // 5分钟

async function persistMediaToStorage(dataUrl: string, prefix: string): Promise<string> {
  if (!dataUrl.startsWith('data:')) return dataUrl;

  try {
    const match = dataUrl.match(/^data:((?:image|video)\/[^;]+);base64,(.+)$/);
    if (!match) return dataUrl;
    const [, mimeType, base64Data] = match;
    const ext = mimeType.split('/')[1] || 'mp4';
    const buffer = Buffer.from(base64Data, 'base64');
    const fileName = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const s3Client = new S3Storage({});
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: process.env.S3_BUCKET || 'media',
        Key: fileName,
        Body: buffer,
        ContentType: mimeType,
      },
    });

    await upload.done();
    return `https://${process.env.S3_BUCKET || 'media'}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${fileName}`;
  } catch (err) {
    console.error('[Persist Media Error]', err instanceof Error ? err.message : err);
    return dataUrl;
  }
}

async function persistRemoteUrlToStorage(url: string, prefix: string): Promise<string> {
  if (!url.startsWith('http')) return url;
  return url;
}

async function persistAllMediaUrls(urls: string[], prefix: string): Promise<string[]> {
  const results = await Promise.all(
    urls.map(async (url) => {
      if (url.startsWith('data:')) {
        return persistMediaToStorage(url, prefix);
      }
      if (url.startsWith('http')) {
        return persistRemoteUrlToStorage(url, prefix);
      }
      return url;
    }),
  );
  return results;
}

async function uploadDataUrlAndGetPublicUrl(dataUrl: string): Promise<string | null> {
  try {
    const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (!match) return null;
    const [, mimeType, base64Data] = match;
    const ext = mimeType.split('/')[1] || 'png';
    const buffer = Buffer.from(base64Data, 'base64');
    const fileName = `img2vid-ref/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const s3Client = new S3Storage({});
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: process.env.S3_BUCKET || 'media',
        Key: fileName,
        Body: buffer,
        ContentType: mimeType,
      },
    });

    await upload.done();
    return `https://${process.env.S3_BUCKET || 'media'}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${fileName}`;
  } catch (err) {
    console.error('[Upload Ref Image Error]', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      prompt,
      negativePrompt,
      aspectRatio = '16:9',
      duration = 5,
      fps = 30,
      image,
      customApiConfig,
    } = body as {
      prompt?: string;
      negativePrompt?: string;
      aspectRatio?: string;
      duration?: number;
      fps?: number;
      image?: string;
      customApiConfig?: {
        apiUrl: string;
        modelName: string;
        apiKey: string;
        provider: string;
        apiFormat?: string;
      };
    };

    if (!prompt && !image) {
      return NextResponse.json({ error: '请提供视频描述或上传图片' }, { status: 400 });
    }

    // ---- Custom API mode ----
    if (customApiConfig && customApiConfig.apiKey) {
      try {
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
          image,
        };

        const requestBody = adapter.buildVideoRequest(params);

        console.log('[Custom API Video] format:', customApiConfig.apiFormat || 'openai', '| model:', customApiConfig.modelName);

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
            return NextResponse.json({ error: '自定义API请求超时' }, { status: 504 });
          }
          const msg = fetchError instanceof Error ? fetchError.message : '请求失败';
          return NextResponse.json({ error: `自定义API网络错误: ${msg}` }, { status: 502 });
        }

        if (!customResponse.ok) {
          const errorText = await customResponse.text();
          return NextResponse.json({ error: parseCustomApiError(customResponse.status, errorText) }, { status: customResponse.status });
        }

        const customData = await customResponse.json();
        const videos = adapter.parseVideoResponse(customData as Record<string, unknown>);

        if (videos.length === 0) {
          return NextResponse.json({ error: '自定义API未返回有效视频数据', raw: customData }, { status: 502 });
        }

        const persistedVideos = await persistAllMediaUrls(videos, 'generated/videos');
        return NextResponse.json({ videos: persistedVideos });
      } catch (customError: unknown) {
        const msg = customError instanceof Error ? customError.message : '自定义API请求异常';
        console.error('[Custom API Video Exception]', msg);
        return NextResponse.json({ error: `自定义API异常: ${msg}` }, { status: 502 });
      }
    }

    // ---- SiliconFlow default mode ----
    if (!SILICONFLOW_CONFIG.apiKey) {
      return NextResponse.json({ error: '请在环境变量中配置 SILICONFLOW_API_KEY 或使用自定义API' }, { status: 503 });
    }

    try {
      // 上传参考图
      let imageUrl: string | undefined;
      if (image) {
        if (image.startsWith('data:')) {
          const uploadedUrl = await uploadDataUrlAndGetPublicUrl(image);
          if (uploadedUrl) imageUrl = uploadedUrl;
        } else {
          imageUrl = image;
        }
      }

      // 构建提示词
      let fullPrompt = prompt || '';
      if (negativePrompt) {
        fullPrompt += `\n\n避免: ${negativePrompt}`;
      }

      // 使用适配器构建请求
      const adapter = getAdapter('openai');
      const params: VideoAdapterParams = {
        apiUrl: SILICONFLOW_CONFIG.apiUrl,
        modelName: SILICONFLOW_CONFIG.modelName,
        apiKey: SILICONFLOW_CONFIG.apiKey,
        prompt: fullPrompt,
        aspectRatio,
        duration,
        fps,
        image: imageUrl,
      };

      const requestBody = adapter.buildVideoRequest(params);

      console.log('[SiliconFlow Video] model:', SILICONFLOW_CONFIG.modelName, '| hasImage:', !!imageUrl);

      const response = await fetchWithRetry(
        `${SILICONFLOW_CONFIG.apiUrl}/video/submit`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SILICONFLOW_CONFIG.apiKey}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          body: JSON.stringify(requestBody),
        },
        GENERATION_TIMEOUT,
        1,
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[SiliconFlow Video Error]', response.status, errorText.slice(0, 500));
        return NextResponse.json({ error: parseCustomApiError(response.status, errorText) }, { status: response.status });
      }

      const data = await response.json();
      console.log('[SiliconFlow Video] Submit response:', JSON.stringify(data).slice(0, 500));

      // 异步等待视频生成结果
      if (data.task_id) {
        const taskId = data.task_id;
        const queryEndpoint = `${SILICONFLOW_CONFIG.apiUrl}/video/query/${taskId}`;
        let retries = 60;

        while (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 5000));

          try {
            const queryResponse = await fetch(queryEndpoint, {
              headers: {
                'Authorization': `Bearer ${SILICONFLOW_CONFIG.apiKey}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              },
            });

            if (queryResponse.ok) {
              const queryData = await queryResponse.json();
              console.log('[SiliconFlow Video] Query response:', JSON.stringify(queryData).slice(0, 300));

              if (queryData.status === 'succeed' && queryData.data?.video_url) {
                const videos = [queryData.data.video_url];
                const persistedVideos = await persistAllMediaUrls(videos, 'generated/videos');
                return NextResponse.json({ videos: persistedVideos, provider: 'siliconflow' });
              } else if (queryData.status === 'failed') {
                return NextResponse.json({ error: '视频生成失败，请稍后重试' }, { status: 500 });
              }
            }
          } catch (e) {
            console.warn('[SiliconFlow Video] Query error:', e);
          }
          retries--;
        }
      }

      // 如果没有返回 task_id，尝试直接解析响应
      const videos = adapter.parseVideoResponse(data as Record<string, unknown>);
      if (videos.length > 0) {
        const persistedVideos = await persistAllMediaUrls(videos, 'generated/videos');
        return NextResponse.json({ videos: persistedVideos, provider: 'siliconflow' });
      }

      return NextResponse.json({ error: '视频生成超时，请稍后重试' }, { status: 500 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '视频生成失败';
      console.error('[Video Generation Error]', message);
      return NextResponse.json({ error: `生成失败: ${message}` }, { status: 500 });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '视频生成失败';
    console.error('[Video Generation Error]', message);
    return NextResponse.json({ error: `生成失败: ${message}` }, { status: 500 });
  }
}
