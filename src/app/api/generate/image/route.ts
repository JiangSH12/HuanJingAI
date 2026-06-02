import { NextRequest, NextResponse } from 'next/server';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { buildCustomApiHeaders, fetchWithRetry, parseCustomApiError } from '@/lib/custom-api-fetch';
import { resolveCustomApiImageSize } from '@/lib/model-config';
import { getAdapter } from '@/lib/api-adapters';
import { buildDashScopeGenerationUrl } from '@/lib/api-adapters/dashscope';
import { buildVolcEngineImageUrl } from '@/lib/api-adapters/volcengine';
import type { ImageAdapterParams } from '@/lib/api-adapters/types';

// 硅基流动默认配置
const SILICONFLOW_CONFIG = {
  apiKey: process.env.SILICONFLOW_API_KEY,
  apiUrl: process.env.SILICONFLOW_API_URL || 'https://api.siliconflow.cn/v1',
  modelName: process.env.SILICONFLOW_IMAGE_MODEL || 'Tongyi-MAI/Z-Image-Turbo',
};

const GENERATION_TIMEOUT = 120_000;

async function persistMediaToStorage(dataUrl: string, prefix: string): Promise<string> {
  if (!dataUrl.startsWith('data:')) return dataUrl;

  try {
    return await uploadDataUrlToMinio(dataUrl, prefix, 'png') || dataUrl;
  } catch (err) {
    console.error('[Persist Media Error]', err instanceof Error ? err.message : err);
    return dataUrl;
  }
}

async function persistAllMediaUrls(urls: string[], prefix: string): Promise<string[]> {
  const MAX_DATA_URL_SIZE = 5 * 1024 * 1024;
  const results = await Promise.all(
    urls.map(async (url) => {
      try {
        if (url.startsWith('data:')) {
          const result = await persistMediaToStorage(url, prefix);
          if (result.startsWith('data:') && result.length > MAX_DATA_URL_SIZE) {
            console.warn('[Persist Media] Data URL too large, skipping');
            return null;
          }
          return result;
        }
        return url;
      } catch (err) {
        console.error('[persistAllMediaUrls] Error:', err instanceof Error ? err.message : err);
        if (url.startsWith('data:') && url.length > MAX_DATA_URL_SIZE) return null;
        return url;
      }
    }),
  );
  return results.filter((u): u is string => u !== null);
}

async function uploadDataUrlAndGetPublicUrl(dataUrl: string): Promise<string | null> {
  try {
    return await uploadDataUrlToMinio(dataUrl, 'img2img-ref', 'png');
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
      quality = '2K',
      size,
      aspectRatio,
      resolution,
      count = 1,
      guidanceScale = 7,
      image,
      strength,
      extraImages,
      customApiConfig,
    } = body as {
      prompt?: string;
      negativePrompt?: string;
      quality?: string;
      size?: string;
      aspectRatio?: string;
      resolution?: string;
      count?: number;
      guidanceScale?: number;
      image?: string;
      strength?: number;
      extraImages?: string[];
      customApiConfig?: {
        apiUrl: string;
        modelName: string;
        apiKey: string;
        provider: string;
        apiFormat?: string;
      };
    };

    if (!prompt) {
      return NextResponse.json({ error: '请提供创作描述' }, { status: 400 });
    }

    if (prompt.length < 2) {
      return NextResponse.json({ error: '创作描述过短，请输入更详细的描述' }, { status: 400 });
    }

    // ---- Custom API mode ----
    if (customApiConfig && customApiConfig.apiKey) {
      try {
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

        // 图生图：上传参考图到 S3 获取公网 URL
        let imageUrl = image;
        if (image) {
          if (image.startsWith('data:')) {
            const uploadedUrl = await uploadDataUrlAndGetPublicUrl(image);
            if (uploadedUrl) imageUrl = uploadedUrl;
          }
          params.image = imageUrl;
          params.strength = strength;
        }

        // 额外参考图（多图编辑）：上传到 S3 获取公网 URL
        if (extraImages && extraImages.length > 0) {
          const uploadedExtras: string[] = [];
          for (const extraImg of extraImages) {
            if (extraImg.startsWith('data:')) {
              const uploadedUrl = await uploadDataUrlAndGetPublicUrl(extraImg);
              if (uploadedUrl) uploadedExtras.push(uploadedUrl);
            } else {
              uploadedExtras.push(extraImg);
            }
          }
          params.extraImages = uploadedExtras;
        }

        const requestBody = adapter.buildImageRequest(params);

        console.log('[Custom API Image] format:', customApiConfig.apiFormat || 'openai', '| model:', customApiConfig.modelName);

        // ---- DashScope 同步模式 ----
        if (customApiConfig.apiFormat === 'dashscope') {
          const dashscopeUrl = buildDashScopeGenerationUrl(customApiConfig.apiUrl);
          const headers = buildCustomApiHeaders(customApiConfig.apiKey, customApiConfig.apiFormat);

          console.log('[DashScope Image] URL:', dashscopeUrl, '| model:', customApiConfig.modelName, '| hasImage:', !!image);

          let response: Response;
          try {
            response = await fetchWithRetry(
              dashscopeUrl,
              { method: 'POST', headers, body: JSON.stringify(requestBody) },
              GENERATION_TIMEOUT,
              1,
            );
          } catch (fetchError: unknown) {
            if (fetchError instanceof DOMException && fetchError.name === 'AbortError') {
              return NextResponse.json({ error: 'DashScope API 请求超时（120秒）' }, { status: 504 });
            }
            const msg = fetchError instanceof Error ? fetchError.message : '请求失败';
            return NextResponse.json({ error: `DashScope API 网络错误: ${msg}` }, { status: 502 });
          }

          if (!response.ok) {
            const errorText = await response.text();
            console.error('[DashScope Error]', response.status, errorText.slice(0, 500));
            return NextResponse.json({ error: parseCustomApiError(response.status, errorText) }, { status: response.status });
          }

          const data = await response.json() as Record<string, unknown>;
          const images = adapter.parseImageResponse(data);

          if (images.length > 0) {
            const persistedImages = await persistAllMediaUrls(images, 'generated/images');
            console.log('[DashScope Image] Success, images:', images.length);
            return NextResponse.json({ images: persistedImages });
          }

          console.error('[DashScope Image] No images in response:', JSON.stringify(data).slice(0, 500));
          return NextResponse.json({ error: 'DashScope 未返回图片', raw: data }, { status: 502 });
        }

        // ---- Volcengine (火山引擎) 图片生成模式 ----
        if (customApiConfig.apiFormat === 'volcengine') {
          const volcUrl = buildVolcEngineImageUrl(customApiConfig.apiUrl);
          const volcHeaders = buildCustomApiHeaders(customApiConfig.apiKey, customApiConfig.apiFormat);

          console.log('[VolcEngine Image] URL:', volcUrl, '| model:', customApiConfig.modelName, '| hasImage:', !!image);

          let volcResponse: Response;
          try {
            volcResponse = await fetchWithRetry(
              volcUrl,
              { method: 'POST', headers: volcHeaders, body: JSON.stringify(requestBody) },
              GENERATION_TIMEOUT,
              1,
            );
          } catch (fetchError: unknown) {
            if (fetchError instanceof DOMException && fetchError.name === 'AbortError') {
              return NextResponse.json({ error: '火山引擎 API 请求超时（120秒）' }, { status: 504 });
            }
            const msg = fetchError instanceof Error ? fetchError.message : '请求失败';
            return NextResponse.json({ error: `火山引擎 API 网络错误: ${msg}` }, { status: 502 });
          }

          if (!volcResponse.ok) {
            const errorText = await volcResponse.text();
            console.error('[VolcEngine Error]', volcResponse.status, errorText.slice(0, 500));
            return NextResponse.json({ error: parseCustomApiError(volcResponse.status, errorText) }, { status: volcResponse.status });
          }

          const volcData = await volcResponse.json() as Record<string, unknown>;
          const volcImages = adapter.parseImageResponse(volcData);

          if (volcImages.length > 0) {
            const persistedImages = await persistAllMediaUrls(volcImages, 'generated/images');
            console.log('[VolcEngine Image] Success, images:', volcImages.length);
            return NextResponse.json({ images: persistedImages });
          }

          console.error('[VolcEngine Image] No images in response:', JSON.stringify(volcData).slice(0, 500));
          return NextResponse.json({ error: '火山引擎未返回图片', raw: volcData }, { status: 502 });
        }

        // ---- 同步模式 (openai/kling) ----
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
          return NextResponse.json({ error: `自定义API网络错误: ${msg}` }, { status: 502 });
        }

        if (!customResponse.ok) {
          const errorText = await customResponse.text();
          return NextResponse.json({ error: parseCustomApiError(customResponse.status, errorText) }, { status: customResponse.status });
        }

        const customData = await customResponse.json();
        let images = adapter.parseImageResponse(customData as Record<string, unknown>);

        if (images.length === 0) {
          return NextResponse.json({ error: '自定义API未返回有效图片数据', raw: customData }, { status: 502 });
        }

        const persistedImages = await persistAllMediaUrls(images, 'generated/images');
        return NextResponse.json({ images: persistedImages });
      } catch (customError: unknown) {
        const msg = customError instanceof Error ? customError.message : '自定义API请求异常';
        console.error('[Custom API Image Exception]', msg);
        return NextResponse.json({ error: `自定义API异常: ${msg}` }, { status: 502 });
      }
    }

    // ---- SiliconFlow default mode ----
    if (!SILICONFLOW_CONFIG.apiKey) {
      return NextResponse.json({ error: '请在环境变量中配置 SILICONFLOW_API_KEY 或使用自定义API' }, { status: 503 });
    }

    try {
      const resolvedAspectRatio = aspectRatio || '1:1';
      const resolvedSize = resolveCustomApiImageSize(resolvedAspectRatio);

      // 如果有参考图，上传后使用
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
      let fullPrompt = prompt;
      if (negativePrompt) {
        fullPrompt += `\n\n避免: ${negativePrompt}`;
      }

      // 使用适配器构建请求
      const adapter = getAdapter('openai');
      const params: ImageAdapterParams = {
        apiUrl: SILICONFLOW_CONFIG.apiUrl,
        modelName: SILICONFLOW_CONFIG.modelName,
        apiKey: SILICONFLOW_CONFIG.apiKey,
        prompt: fullPrompt,
        aspectRatio: resolvedAspectRatio,
        count: count || 1,
        guidanceScale,
        image: imageUrl,
        strength,
      };

      const requestBody = adapter.buildImageRequest(params);

      console.log('[SiliconFlow Image] model:', SILICONFLOW_CONFIG.modelName, '| size:', resolvedSize, '| hasImage:', !!imageUrl);

      const response = await fetchWithRetry(
        `${SILICONFLOW_CONFIG.apiUrl}/images/generations`,
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
        console.error('[SiliconFlow Image Error]', response.status, errorText.slice(0, 500));
        return NextResponse.json({ error: parseCustomApiError(response.status, errorText) }, { status: response.status });
      }

      const data = await response.json();
      let images = adapter.parseImageResponse(data as Record<string, unknown>);

      if (images.length === 0) {
        console.error('[SiliconFlow Image] No images extracted, keys:', Object.keys(data));
        return NextResponse.json({ error: 'API未返回有效图片数据', raw: data }, { status: 502 });
      }

      const persistedImages = await persistAllMediaUrls(images, 'generated/images');
      return NextResponse.json({ images: persistedImages, provider: 'siliconflow' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '图片生成失败';
      console.error('[Image Generation Error]', message);
      return NextResponse.json({ error: `生成失败: ${message}` }, { status: 500 });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '图片生成失败';
    console.error('[Image Generation Error]', message);
    return NextResponse.json({ error: `生成失败: ${message}` }, { status: 500 });
  }
}
