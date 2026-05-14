/**
 * 可灵（Kling）API 适配器
 *
 * 可灵 API 鉴权方式：
 * - 使用 AccessKey + SecretKey 鉴权
 * - 请求头格式：
 *   Authorization: Bearer {accessKey}:{secretKey}
 *   Content-Type: application/json
 *
 * 可灵 API 格式特点：
 * - 使用 model_name 而非 model
 * - 使用 resolution 字段（如 "2k"）而非 size
 * - 支持 result_type: "series" 生成多张
 * - 支持 aspect_ratio: "auto" | "16:9" | "9:16" | "1:1" | "4:3" | "3:4"
 * - 图生图使用 image_list 字段传图片
 *
 * 文档参考：https://platform.kling.ai/docs
 */
import type { ApiAdapter, ImageAdapterParams, VideoAdapterParams, TestAdapterParams } from './types';

/**
 * 可灵图片生成响应解析
 * 可灵返回格式（推测，基于行业标准）：
 * {
 *   "code": 0,
 *   "data": {
 *     "task_id": "...",
 *     "works": [ { "url": "..." } ]
 *   }
 * }
 * 或直接返回图片 URL 数组
 */
function parseKlingImageResponse(data: Record<string, unknown>): string[] {
  const images: string[] = [];

  // 可灵标准响应格式：code === 0 成功
  if (data.code !== undefined && data.code !== 0) {
    return images;
  }

  // 尝试 data.works[].url（可灵官方格式）
  const respData = (data.data ?? data) as Record<string, unknown> | undefined;
  if (respData) {
    const works = respData.works as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(works)) {
      for (const w of works) {
        if (typeof w.url === 'string') images.push(w.url);
      }
    }

    // 尝试 data.images[].url
    const imgs = respData.images as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(imgs)) {
      for (const img of imgs) {
        if (typeof img.url === 'string') images.push(img.url);
        if (typeof img.b64_json === 'string') {
          images.push(`data:image/png;base64,${img.b64_json}`);
        }
      }
    }
  }

  // 兼容 OpenAI 格式（部分可灵中转 API 使用）
  if (images.length === 0 && Array.isArray((data as Record<string, unknown>).data)) {
    const items = (data as Record<string, unknown>).data as Array<Record<string, unknown>>;
    for (const item of items) {
      if (typeof item.url === 'string') images.push(item.url);
      if (typeof item.b64_json === 'string') {
        images.push(`data:image/png;base64,${item.b64_json}`);
      }
    }
  }

  return images;
}

/**
 * 可灵视频生成响应解析
 */
function parseKlingVideoResponse(data: Record<string, unknown>): string[] {
  const videos: string[] = [];

  if (data.code !== undefined && data.code !== 0) {
    return videos;
  }

  const respData = (data.data ?? data) as Record<string, unknown> | undefined;
  if (respData) {
    const works = respData.works as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(works)) {
      for (const w of works) {
        if (typeof w.url === 'string') videos.push(w.url);
      }
    }
  }

  return videos;
}

/** 将 resolution 参数转换为可灵格式 */
function resolveKlingResolution(resolution?: string): string {
  const map: Record<string, string> = {
    '1080P': '1k',
    '2K': '2k',
    '4K': '4k',
  };
  return map[resolution || ''] || '2k';
}

/** 将画面比例转换为可灵格式 */
function resolveKlingAspectRatio(aspectRatio?: string): string {
  if (!aspectRatio || aspectRatio === 'original') return 'auto';
  // 可灵支持: "16:9" | "9:16" | "1:1" | "4:3" | "3:4" | "auto"
  const valid = ['16:9', '9:16', '1:1', '4:3', '3:4'];
  return valid.includes(aspectRatio) ? aspectRatio : 'auto';
}

export const klingAdapter: ApiAdapter = {
  format: 'kling',

  buildImageRequest(params: ImageAdapterParams): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model_name: params.modelName,
      prompt: params.prompt,
      resolution: resolveKlingResolution(params.resolution),
      aspect_ratio: resolveKlingAspectRatio(params.aspectRatio),
      result_type: (params.count && params.count > 1) ? 'series' : 'single',
    };

    if (params.count && params.count > 1) {
      body.series_amount = params.count;
    }

    if (params.negativePrompt) {
      body.negative_prompt = params.negativePrompt;
    }

    // 图生图：将参考图转为 base64 放入 image_list
    if (params.image) {
      if (params.image.startsWith('data:')) {
        const commaIndex = params.image.indexOf(',');
        if (commaIndex !== -1) {
          body.image_list = [
            { image: params.image.substring(commaIndex + 1) },
          ];
        }
      } else if (params.image.startsWith('http')) {
        body.image_list = [
          { url: params.image },
        ];
      }
      if (params.strength !== undefined) {
        body.strength = params.strength;
      }
    }

    return body;
  },

  buildVideoRequest(params: VideoAdapterParams): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model_name: params.modelName,
      prompt: params.prompt || 'Generate a video',
      aspect_ratio: resolveKlingAspectRatio(params.aspectRatio),
    };

    if (params.duration) {
      body.duration = params.duration; // 可灵使用秒数：4, 5, 6, 7, 8, 9, 10
    }
    if (params.negativePrompt) {
      body.negative_prompt = params.negativePrompt;
    }

    // 图生视频
    if (params.image) {
      if (params.image.startsWith('data:')) {
        const commaIndex = params.image.indexOf(',');
        if (commaIndex !== -1) {
          body.image_list = [
            { image: params.image.substring(commaIndex + 1) },
          ];
        }
      } else if (params.image.startsWith('http')) {
        body.image_list = [
          { url: params.image },
        ];
      }
    }

    return body;
  },

  parseImageResponse(data: Record<string, unknown>): string[] {
    return parseKlingImageResponse(data);
  },

  parseVideoResponse(data: Record<string, unknown>): string[] {
    return parseKlingVideoResponse(data);
  },

  buildTestRequest(params: TestAdapterParams): { url: string; body: Record<string, unknown>; method: string } {
    // 可灵的测试请求：用一个极简的 generations 请求
    // 或者调用 /models 端点（如果支持）
    const testUrl = params.apiUrl || 'https://api.kling.ai/v1/images/generations';

    return {
      url: testUrl,
      body: {
        model_name: params.modelName || 'kling-v1',
        prompt: 'test',
        resolution: '1k',
        result_type: 'single',
      },
      method: 'POST',
    };
  },

  parseTestResponse(_data: Record<string, unknown>, status: number, rawBody: string): { success: boolean; message: string } {
    if (status === 200) {
      let modelInfo = '';
      try {
        const data = JSON.parse(rawBody);
        // 可灵成功响应 code === 0
        if (data.code === 0 || data.data) {
          modelInfo = `，模型 ${data?.data?.model_name || ''} 可用`;
        }
      } catch {
        // ignore
      }
      return { success: true, message: `连接成功${modelInfo}` };
    }

    // 可灵错误格式：{ code: xxx, message: "..." }
    try {
      const data = JSON.parse(rawBody);
      if (data.message) {
        return { success: false, message: `连接失败: ${data.message}` };
      }
    } catch {
      // ignore
    }

    return { success: false, message: `连接失败 (${status}): ${rawBody.slice(0, 100)}` };
  },
};
