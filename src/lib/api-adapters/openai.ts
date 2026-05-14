/**
 * OpenAI 兼容 API 适配器
 *
 * 支持标准 OpenAI 格式（/v1/images/generations、/v1/chat/completions 等）
 * 适用于：OpenAI、硅基流动、Stability AI 等
 */
import type { ApiAdapter, ImageAdapterParams, VideoAdapterParams, TestAdapterParams } from './types';

function extractImagesFromChatResponse(data: Record<string, unknown>): string[] {
  const images: string[] = [];
  const choices = data.choices as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(choices)) {
    for (const choice of choices) {
      const message = choice.message as Record<string, unknown> | undefined;
      if (!message) continue;
      const content = message.content;
      if (typeof content === 'string') {
        if (content.startsWith('data:image/') || content.startsWith('http')) images.push(content);
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
            const urlMatch = text.match(/(https?:\/\/[^\s"']+\.(png|jpg|jpeg|webp)[^\s"']*)/i);
            if (urlMatch) images.push(urlMatch[1]);
          }
        }
      }
    }
  }
  return images;
}

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

/** 将画面比例转换为 OpenAI 兼容的 size 字符串 */
function resolveSize(aspectRatio?: string): string {
  const sizeMap: Record<string, string> = {
    '1:1': '1024x1024',
    '16:9': '1792x1024',
    '9:16': '1024x1792',
    '4:3': '1152x896',
    '3:4': '896x1152',
  };
  return sizeMap[aspectRatio || ''] || '1024x1024';
}

export const openaiAdapter: ApiAdapter = {
  format: 'openai',

  buildImageRequest(params: ImageAdapterParams): Record<string, unknown> {
    const size = resolveSize(params.aspectRatio);
    const n = Math.max(1, params.count || 1);

    const body: Record<string, unknown> = {
      model: params.modelName,
      prompt: params.prompt,
      n,
      size,
      response_format: 'b64_json',
    };

    if (params.negativePrompt) {
      body.negative_prompt = params.negativePrompt;
    }
    if (params.guidanceScale && params.guidanceScale !== 7) {
      body.guidance_scale = params.guidanceScale;
    }
    if (params.aspectRatio) {
      body.aspect_ratio = params.aspectRatio;
    }

    // 图生图：使用 init_image 字段（base64）
    if (params.image) {
      if (params.image.startsWith('data:')) {
        const commaIndex = params.image.indexOf(',');
        if (commaIndex !== -1) {
          body.init_image = params.image.substring(commaIndex + 1);
        }
        if (params.strength !== undefined) {
          body.denoising_strength = params.strength;
        }
      }
    }

    return body;
  },

  buildVideoRequest(params: VideoAdapterParams): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: params.modelName,
      prompt: params.prompt || 'Generate a video',
      n: 1,
      response_format: 'b64_json',
    };

    if (params.aspectRatio) body.aspect_ratio = params.aspectRatio;
    if (params.duration) body.duration = params.duration;
    if (params.fps) body.fps = params.fps;
    if (params.negativePrompt) body.negative_prompt = params.negativePrompt;

    return body;
  },

  parseImageResponse(data: Record<string, unknown>): string[] {
    let images = extractImagesFromGenerationsResponse(data);
    if (images.length === 0) {
      images = extractImagesFromChatResponse(data);
    }
    return images;
  },

  parseVideoResponse(data: Record<string, unknown>): string[] {
    let videos = extractVideosFromGenerationsResponse(data);
    if (videos.length === 0) {
      videos = extractVideosFromChatResponse(data);
    }
    return videos;
  },

  buildTestRequest(params: TestAdapterParams): { url: string; body: Record<string, unknown>; method: string } {
    // 优先尝试 /models 端点
    const baseUrl = params.apiUrl
      .replace(/\/images\/generations.*/i, '')
      .replace(/\/videos\/generations.*/i, '')
      .replace(/\/chat\/completions.*/i, '')
      .replace(/\/+$/, '');
    const modelsUrl = `${baseUrl}/models`;

    // 返回两个选项：先尝试 /models，失败再尝试实际端点
    return {
      url: modelsUrl,
      body: {},
      method: 'GET',
    };
  },

  parseTestResponse(_data: Record<string, unknown>, status: number, rawBody: string): { success: boolean; message: string } {
    if (status === 200) {
      let modelInfo = '';
      try {
        const data = JSON.parse(rawBody);
        if (Array.isArray(data.data)) {
          modelInfo = `，已连接（共 ${data.data.length} 个模型）`;
        }
      } catch {
        // ignore
      }
      return { success: true, message: `连接成功${modelInfo}` };
    }

    if (status === 404) {
      // /models 不支持，尝试实际端点
      return { success: false, message: '需要测试实际生成端点' };
    }

    return { success: false, message: `连接失败 (${status}): ${rawBody.slice(0, 100)}` };
  },
};
