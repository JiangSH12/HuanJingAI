/**
 * 火山引擎 (Volcengine / Ark) API 适配器
 *
 * 火山方舟平台 API 格式特点：
 * - 基础 URL：https://ark.cn-beijing.volces.com/api/v3
 * - 鉴权：Bearer token（API Key）
 * - 图片生成端点：POST /api/v3/images/generations
 * - 视频生成端点：POST /api/v3/contents/generations/tasks
 * - 视频任务查询：GET /api/v3/contents/generations/tasks/{task_id}
 * - 异步模式：提交返回 id，需轮询获取结果
 *
 * Seedance 视频格式：
 * - 提交请求体：{ model, content: [{type:"text",text:...}, {type:"image_url",image_url:{url:...},role:"first_frame"}], resolution, duration, ... }
 * - 提交响应：{ id: "task_id", status: "submitted" }
 * - 轮询成功响应（实际格式）：{ id: "task_id", status: "succeeded", content: { video_url: "..." } }
 * - 轮询成功响应（旧格式）：{ id: "task_id", status: "succeeded", content: [{type:"video",video_url:{url:"..."}}] }
 *
 * 文档参考：
 * - Seedance: https://www.volcengine.com/docs/82379/1399876
 * - 图片生成: https://www.volcengine.com/docs/82379/1291742
 */
import type { ApiAdapter, ImageAdapterParams, VideoAdapterParams, TestAdapterParams } from './types';

/** 火山引擎图片生成 API 端点路径 */
export const VOLCENGINE_IMAGE_PATH = '/images/generations';
/** 火山引擎视频生成 API 端点路径 */
export const VOLCENGINE_VIDEO_SUBMIT_PATH = '/contents/generations/tasks';
/** 火山引擎视频任务查询端点路径模板 */
export const VOLCENGINE_VIDEO_POLL_PATH = '/contents/generations/tasks';

/**
 * 从用户配置的基础 URL 构建完整的图片生成请求 URL
 */
export function buildVolcEngineImageUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  // 如果已经包含完整路径，直接返回
  if (base.includes('/images/generations')) {
    return base;
  }
  // 移除末尾的 /v3 或 /api/v3，统一拼接
  const clean = base.replace(/\/api\/v3$/, '').replace(/\/v3$/, '');
  return `${clean}/api/v3${VOLCENGINE_IMAGE_PATH}`;
}

/**
 * 从用户配置的基础 URL 构建完整的视频生成提交 URL
 */
export function buildVolcEngineVideoSubmitUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  // 如果已经包含完整路径，直接返回
  if (base.includes('/contents/generations/tasks')) {
    return base;
  }
  // 如果 URL 以 /api/v3 结尾，直接拼接
  if (base.endsWith('/api/v3')) {
    return `${base}${VOLCENGINE_VIDEO_SUBMIT_PATH}`;
  }
  // 移除末尾的路径后缀，统一拼接
  const clean = base.replace(/\/api\/v3\/.*$/, '').replace(/\/v3\/.*$/, '');
  return `${clean}/api/v3${VOLCENGINE_VIDEO_SUBMIT_PATH}`;
}

/**
 * 从基础 URL 和 taskId 构建轮询 URL
 */
export function buildVolcEnginePollUrl(baseUrl: string, taskId: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  // 移除末尾的 submit 路径，保留到 /api/v3
  let cleanBase = base;
  if (cleanBase.includes('/contents/generations/tasks')) {
    // 使用全局替换，移除所有 /contents/generations/tasks 及其后的部分
    cleanBase = cleanBase.replace(/\/contents\/generations\/tasks.*$/, '');
  }
  // 清理 URL，确保只有基础部分
  cleanBase = cleanBase.replace(/\/api\/v3\/.*$/, '').replace(/\/v3\/.*$/, '');
  // 确保有 /api/v3 前缀
  if (!cleanBase.endsWith('/api/v3')) {
    cleanBase = `${cleanBase}/api/v3`;
  }
  return `${cleanBase}${VOLCENGINE_VIDEO_POLL_PATH}/${taskId}`;
}

/**
 * 从视频提交响应中提取 task_id
 *
 * 响应格式：{ id: "task_id", status: "submitted", ... }
 * 或：{ id: "task_id", task_id: "task_id", status: "submitted", ... }
 */
export function extractVolcEngineTaskId(data: Record<string, unknown>): string | null {
  // 优先使用顶层 id 字段（VolcEngine 格式）
  if (typeof data.id === 'string' && data.id) {
    return data.id;
  }
  // 兼容 task_id 字段
  if (typeof data.task_id === 'string' && data.task_id) {
    return data.task_id;
  }
  // 兼容嵌套格式
  const output = data.output as Record<string, unknown> | undefined;
  if (output) {
    if (typeof output.task_id === 'string') return output.task_id;
    if (typeof output.id === 'string') return output.id;
  }
  return null;
}

/**
 * 从轮询响应中提取任务状态和视频 URL
 *
 * 成功响应格式：
 * { id: "...", status: "succeeded", content: [{ type: "video", video_url: { url: "..." } }] }
 *
 * 失败响应格式：
 * { id: "...", status: "failed", error: { code: "...", message: "..." } }
 */
export function extractVolcEngineTaskStatus(data: Record<string, unknown>): {
  status: 'submitted' | 'processing' | 'succeeded' | 'failed' | 'unknown';
  videoUrl?: string;
  error?: string;
} {
  const status = data.status as string;

  switch (status) {
    case 'submitted':
      return { status: 'submitted' };
    case 'processing':
    case 'running':
    case 'in_progress':
      return { status: 'processing' };
    case 'succeeded':
    case 'success': {
      // 格式 A: content 是对象 { video_url: "..." } （豆包 Seedance 实际返回格式）
      const contentObj = data.content as Record<string, unknown> | undefined;
      if (contentObj && !Array.isArray(contentObj)) {
        // 直接 video_url 字符串
        if (typeof contentObj.video_url === 'string') {
          return { status: 'succeeded', videoUrl: contentObj.video_url as string };
        }
        // video_url 是对象 { url: "..." }
        const videoUrlObj = contentObj.video_url as Record<string, unknown> | undefined;
        if (videoUrlObj && typeof videoUrlObj.url === 'string') {
          return { status: 'succeeded', videoUrl: videoUrlObj.url as string };
        }
      }

      // 格式 B: content 是数组 [{type:"video", video_url:{url:"..."}}]
      const content = data.content as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(content)) {
        for (const item of content) {
          if (item.type === 'video' && item.video_url) {
            const videoUrlObj = item.video_url as Record<string, unknown>;
            if (typeof videoUrlObj.url === 'string') {
              return { status: 'succeeded', videoUrl: videoUrlObj.url };
            }
          }
          // 兼容直接返回 URL 字符串
          if (typeof item.url === 'string' && (item.url.includes('.mp4') || item.url.includes('video'))) {
            return { status: 'succeeded', videoUrl: item.url };
          }
        }
      }
      // 兼容 data.video_url 格式
      const dataVideoUrl = (data.data as Record<string, unknown>)?.video_url;
      if (typeof dataVideoUrl === 'string') {
        return { status: 'succeeded', videoUrl: dataVideoUrl };
      }
      return { status: 'succeeded' };
    }
    case 'failed':
    case 'expired': {
      const error = data.error as Record<string, unknown> | undefined;
      const errorMsg = error?.message
        ? `${error.code || 'Error'}: ${error.message}`
        : typeof data.error === 'string'
          ? data.error
          : '视频生成失败';
      return { status: 'failed', error: errorMsg as string };
    }
    default:
      return { status: 'unknown' };
  }
}

/**
 * 解析火山引擎图片生成响应
 */
function parseVolcEngineImageResponse(data: Record<string, unknown>): string[] {
  const images: string[] = [];

  // 格式1: data[].url (标准格式)
  if (Array.isArray(data.data)) {
    for (const item of data.data as Array<Record<string, unknown>>) {
      if (typeof item.url === 'string') images.push(item.url);
      if (typeof item.b64_json === 'string') {
        images.push(`data:image/png;base64,${item.b64_json}`);
      }
    }
  }

  // 格式2: content[] (Seedance 图片格式)
  if (images.length === 0 && Array.isArray(data.content)) {
    for (const item of data.content as Array<Record<string, unknown>>) {
      if (item.type === 'image_url' && item.image_url) {
        const urlObj = item.image_url as Record<string, unknown>;
        if (typeof urlObj.url === 'string') images.push(urlObj.url);
      }
      if (typeof item.url === 'string') images.push(item.url);
    }
  }

  // 格式3: 直接 url
  if (images.length === 0 && typeof data.url === 'string') {
    images.push(data.url);
  }

  return images;
}

/**
 * 解析火山引擎视频生成响应
 */
function parseVolcEngineVideoResponse(data: Record<string, unknown>): string[] {
  const videos: string[] = [];

  // 格式1: content[] (Seedance 视频格式)
  if (Array.isArray(data.content)) {
    for (const item of data.content as Array<Record<string, unknown>>) {
      if (item.type === 'video' && item.video_url) {
        const urlObj = item.video_url as Record<string, unknown>;
        if (typeof urlObj.url === 'string') videos.push(urlObj.url);
      }
    }
  }

  // 格式2: data.video_url
  if (videos.length === 0 && data.data) {
    const d = data.data as Record<string, unknown>;
    if (typeof d.video_url === 'string') videos.push(d.video_url);
    if (typeof d.url === 'string') videos.push(d.url);
  }

  // 格式3: 直接 url
  if (videos.length === 0 && typeof data.url === 'string') {
    videos.push(data.url);
  }

  return videos;
}

/** 将画面比例转换为 Seedance 支持的 resolution 参数 */
function resolveVolcEngineResolution(aspectRatio?: string): string {
  const map: Record<string, string> = {
    '1:1': '1:1',
    '16:9': '16:9',
    '9:16': '9:16',
    '4:3': '4:3',
    '3:4': '3:4',
  };
  return map[aspectRatio || ''] || '16:9';
}

/** 将画面比例转换为 Seedance 的 ratio 参数 */
function resolveVolcEngineRatio(aspectRatio?: string): string {
  return resolveVolcEngineResolution(aspectRatio);
}

export const volcengineAdapter: ApiAdapter = {
  format: 'volcengine',

  buildImageRequest(params: ImageAdapterParams): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: params.modelName,
      prompt: params.prompt,
      n: Math.max(1, params.count || 1),
      size: params.aspectRatio || '1:1',
    };

    if (params.negativePrompt) {
      body.negative_prompt = params.negativePrompt;
    }

    // 图生图
    if (params.image) {
      const content: Array<Record<string, unknown>> = [];

      // 先放图片
      if (params.image.startsWith('data:')) {
        content.push({
          type: 'image_url',
          image_url: { url: params.image },
        });
      } else {
        content.push({
          type: 'image_url',
          image_url: { url: params.image },
        });
      }

      // 再放文本
      content.push({ type: 'text', text: params.prompt });

      body.content = content;
      delete body.prompt; // content 模式不使用顶层 prompt
    }

    return body;
  },

  /**
   * 构建视频生成请求（Seedance 格式）
   *
   * Seedance API 格式：
   * - 端点: POST /api/v3/contents/generations/tasks
   * - 文生视频: { model, content: [{type:"text",text:...}], ... }
   * - 图生视频: { model, content: [{type:"text",text:...}, {type:"image_url",image_url:{url:...}}], ... }
   * - 参数: resolution, duration, ratio, watermark, seed
   *
   * 注意：根据官方文档，image_url 对象内只有 url 字段，不带 role。
   * 图生视频通过 content 数组中同时包含 text 和 image_url 来区分。
   */
  buildVideoRequest(params: VideoAdapterParams): Record<string, unknown> {
    const content: Array<Record<string, unknown>> = [];

    // 文本提示词（必须包含）
    content.push({
      type: 'text',
      text: params.prompt || 'Generate a video',
    });

    // 图生视频：添加参考图
    if (params.image) {
      content.push({
        type: 'image_url',
        image_url: {
          url: params.image,
        },
      });
    }

    const body: Record<string, unknown> = {
      model: params.modelName,
      content,
    };

    // 图生视频(i2v)：才传 resolution 和 ratio
    // 文生视频(t2v) 不支持 resolution 参数
    if (params.image && params.aspectRatio) {
      body.resolution = resolveVolcEngineResolution(params.aspectRatio);
      body.ratio = resolveVolcEngineRatio(params.aspectRatio);
    }

    // 时长（Seedance 支持 4-10 秒）
    if (params.duration) {
      body.duration = params.duration;
    }

    // 关闭水印
    body.watermark = false;

    // 负面提示词
    if (params.negativePrompt) {
      body.negative_prompt = params.negativePrompt;
    }

    return body;
  },

  parseImageResponse(data: Record<string, unknown>): string[] {
    return parseVolcEngineImageResponse(data);
  },

  parseVideoResponse(data: Record<string, unknown>): string[] {
    return parseVolcEngineVideoResponse(data);
  },

  buildTestRequest(params: TestAdapterParams): { url: string; body: Record<string, unknown>; method: string; headers?: Record<string, string> } {
    // 检测是否为视频模型
    const modelName = params.modelName || '';
    const isVideoModel = modelName.includes('seedance') ||
                        modelName.includes('video') ||
                        modelName.includes('doubao-seedance');

    if (isVideoModel) {
      // 视频模型测试请求（Seedance 格式）
      const submitUrl = buildVolcEngineVideoSubmitUrl(params.apiUrl);
      return {
        url: submitUrl,
        body: {
          model: modelName || 'doubao-seedance-1-0-pro-fast-251015',
          content: [
            { type: 'text', text: 'a cute cat walking' },
          ],
        },
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${params.apiKey}`,
        },
      };
    }

    // 图片模型测试请求
    const imageUrl = buildVolcEngineImageUrl(params.apiUrl);
    return {
      url: imageUrl,
      body: {
        model: modelName || 'doubao-seedream-1-0-lite-250415',
        prompt: 'a cute cat',
        n: 1,
        size: '1:1',
      },
      method: 'POST',
    };
  },

  parseTestResponse(_data: Record<string, unknown>, status: number, rawBody: string): { success: boolean; message: string } {
    if (status === 200 || status === 201 || status === 202) {
      try {
        const data = JSON.parse(rawBody);

        // 异步提交成功（Seedance 视频返回 id + status: submitted）
        if (data.id && (data.status === 'submitted' || data.status === 'processing' || data.status === 'succeeded')) {
          return { success: true, message: `连接成功，API 可用（任务已提交: ${data.id.slice(0, 8)}...）` };
        }

        // 同步成功
        if (data.data || data.content) {
          return { success: true, message: '连接成功，API 可用' };
        }

        // 通用成功
        return { success: true, message: '连接成功' };
      } catch {
        // ignore
      }
      return { success: true, message: '连接成功' };
    }

    // 错误处理
    try {
      const data = JSON.parse(rawBody);
      if (data.error) {
        if (typeof data.error === 'string') {
          return { success: false, message: `连接失败: ${data.error}` };
        }
        if (data.error.message) {
          return { success: false, message: `连接失败: ${data.error.message}` };
        }
      }
      if (data.message) {
        return { success: false, message: `连接失败: ${data.message}` };
      }
      if (data.code && data.message) {
        return { success: false, message: `连接失败 [${data.code}]: ${data.message}` };
      }
    } catch {
      // ignore
    }

    return { success: false, message: `连接失败 (${status}): ${rawBody.slice(0, 200)}` };
  },
};
