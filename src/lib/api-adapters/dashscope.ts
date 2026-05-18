/**
 * 阿里 DashScope (wan2.7-image / happyhorse-video) API 适配器
 *
 * DashScope 多模态生成 API 格式特点：
 * - 基础 URL：用户配置的 https://dashscope.aliyuncs.com/api/v1
 * - 图片端点：/api/v1/services/aigc/multimodal-generation/generation
 * - 视频端点：/api/v1/services/aigc/video-generation/video-synthesis
 * - 任务查询：/api/v1/tasks/{task_id}
 * - 异步模式：提交返回 task_id，需轮询获取结果
 *
 * 文档参考：
 * - 图片: https://help.aliyun.com/zh/model-studio/wan-image-generation-and-editing-api-reference
 * - 视频: https://help.aliyun.com/zh/model-studio/happyhorse-text-to-video-api-reference
 */
import type { ApiAdapter, ImageAdapterParams, VideoAdapterParams, TestAdapterParams } from './types';

/** DashScope 图片生成 API 端点路径 */
export const DASHSCOPE_GENERATION_PATH = '/api/v1/services/aigc/multimodal-generation/generation';
/** DashScope 视频生成 API 端点路径 */
export const DASHSCOPE_VIDEO_SYNTHESIS_PATH = '/api/v1/services/aigc/video-generation/video-synthesis';
/** DashScope 任务查询端点路径 */
export const DASHSCOPE_TASKS_PATH = '/api/v1/tasks';

/**
 * 从用户配置的基础 URL 构建完整的生成请求 URL
 */
export function buildDashScopeGenerationUrl(baseUrl: string): string {
  if (baseUrl.includes('/services/aigc/multimodal-generation')) {
    return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  }
  const base = baseUrl.replace(/\/api\/v1$/, '').replace(/\/+$/, '');
  return `${base}${DASHSCOPE_GENERATION_PATH}`;
}

/**
 * 从用户配置的基础 URL 构建完整的视频生成请求 URL
 *
 * 支持多种 URL 格式：
 * - https://dashscope.aliyuncs.com/api/v1 (百炼国内版)
 * - https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis (完整路径)
 * - https://dashscope-intl.aliyuncs.com/api/v1 (百炼国际版)
 * - 自定义中转代理 URL
 */
export function buildDashScopeVideoSynthesisUrl(baseUrl: string): string {
  const trimmedUrl = baseUrl.trim();

  // 如果已经包含完整的视频端点路径，直接返回
  if (trimmedUrl.includes('/services/aigc/video-generation/video-synthesis')) {
    return trimmedUrl.endsWith('/') ? trimmedUrl.slice(0, -1) : trimmedUrl;
  }

  // 移除末尾斜杠
  const cleanUrl = trimmedUrl.replace(/\/+$/, '');

  // 如果是百炼 API URL，移除 /api/v1 后缀并拼接视频端点
  if (cleanUrl.includes('dashscope.aliyuncs.com')) {
    const base = cleanUrl.replace(/\/api\/v1$/, '');
    return `${base}${DASHSCOPE_VIDEO_SYNTHESIS_PATH}`;
  }

  // 对于其他格式（如自定义中转），尝试直接拼接
  // 如果 URL 以 /v1 结尾，移除它并拼接完整路径
  if (cleanUrl.match(/\/v1$/)) {
    const base = cleanUrl.replace(/\/v1$/, '');
    return `${base}${DASHSCOPE_VIDEO_SYNTHESIS_PATH}`;
  }

  // 其他情况，直接拼接
  const base = cleanUrl.replace(/\/api\/v1$/, '');
  return `${base}${DASHSCOPE_VIDEO_SYNTHESIS_PATH}`;
}

/**
 * 从基础 URL 和 taskId 构建轮询 URL
 *
 * 支持的 URL 格式：
 * - https://dashscope.aliyuncs.com/api/v1
 * - https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis
 */
export function buildDashScopePollUrl(baseUrl: string, taskId: string): string {
  const trimmedUrl = baseUrl.trim().replace(/\/+$/, '');

  let base: string;

  // 如果包含完整路径，提取基础域名
  if (trimmedUrl.includes('/services/aigc/')) {
    base = trimmedUrl
      .replace(/\/api\/v1\/services\/aigc\/multimodal-generation.*/i, '')
      .replace(/\/api\/v1\/services\/aigc\/video-generation.*/i, '');
  } else {
    // 如果只是基础 URL（https://dashscope.aliyuncs.com/api/v1），移除 /api/v1
    base = trimmedUrl.replace(/\/api\/v1$/, '');
  }

  return `${base}${DASHSCOPE_TASKS_PATH}/${taskId}`;
}

/** 将画面比例转换为 DashScope size 参数 */
function resolveDashScopeSize(aspectRatio?: string, resolution?: string): string {
  // DashScope wan2.7-image 支持: "1:1", "16:9", "9:16", "4:3", "3:4" 等
  // 同时支持 "2K" 等 resolution 标识
  if (resolution && ['2K', '4K'].includes(resolution)) {
    return resolution;
  }
  // 默认返回 resolution，如果没有则按比例推断
  const sizeMap: Record<string, string> = {
    '1:1': '1024*1024',
    '16:9': '1920*1080',
    '9:16': '1080*1920',
    '4:3': '1440*1080',
    '3:4': '1080*1440',
  };
  return sizeMap[aspectRatio || ''] || '1024*1024';
}

/**
 * 解析 DashScope 同步响应，提取图片 URL
 *
 * 同步响应格式（wan2.7-image）：
 * {
 *   "output": {
 *     "task_id": "...",
 *     "task_status": "SUCCEEDED",
 *     "results": [{ "url": "https://..." }]
 *   },
 *   "request_id": "..."
 * }
 *
 * 异步轮询成功响应：
 * {
 *   "output": {
 *     "task_id": "...",
 *     "task_status": "SUCCEEDED",
 *     "results": [{ "url": "https://..." }]
 *   }
 * }
 */
function parseDashScopeImageResponse(data: Record<string, unknown>): string[] {
  const images: string[] = [];
  const output = data.output as Record<string, unknown> | undefined;

  if (!output) {
    // 有可能直接在顶层
    if (data.request_id && data.code) {
      // DashScope 错误响应
      return images;
    }
  }

  // 格式1: output.choices[].message.content[].result_image
  if (output?.choices) {
    const choices = output.choices as Array<Record<string, unknown>>;
    for (const choice of choices) {
      const message = choice.message as Record<string, unknown> | undefined;
      if (!message) continue;
      const content = message.content;
      if (Array.isArray(content)) {
        for (const item of content as Array<Record<string, unknown>>) {
          if (item.result_image && typeof item.result_image === 'string') {
            images.push(item.result_image);
          }
          if (item.image && typeof item.image === 'string') {
            images.push(item.image);
          }
          if (item.url && typeof item.url === 'string') {
            images.push(item.url);
          }
        }
      } else if (typeof content === 'string') {
        if (content.startsWith('http')) images.push(content);
      }
    }
  }

  // 格式2: output.results[].url
  if (images.length === 0 && output?.results) {
    const results = output.results as Array<Record<string, unknown>>;
    for (const r of results) {
      if (r.url && typeof r.url === 'string') images.push(r.url);
      if (r.b64_json && typeof r.b64_json === 'string') {
        images.push(`data:image/png;base64,${r.b64_json}`);
      }
    }
  }

  // 格式3: output.task_status === "SUCCEEDED" 且 output.results_url
  if (images.length === 0 && output?.results_url) {
    const url = output.results_url as string;
    if (typeof url === 'string') images.push(url);
  }

  // 兼容: data.data[] (OpenAI 格式中转)
  if (images.length === 0 && Array.isArray(data.data)) {
    for (const item of data.data as Array<Record<string, unknown>>) {
      if (item.url && typeof item.url === 'string') images.push(item.url);
      if (item.b64_json && typeof item.b64_json === 'string') {
        images.push(`data:image/png;base64,${item.b64_json}`);
      }
    }
  }

  return images;
}

/**
 * 解析 DashScope 视频响应
 *
 * HappyHorse API 响应格式：
 * - 提交成功: { output: { task_status: "PENDING", task_id: "xxx" } }
 * - 轮询成功: { output: { task_status: "SUCCEEDED", video_url: "..." } }
 * - 轮询失败: { output: { task_status: "FAILED", ... } }
 */
function parseDashScopeVideoResponse(data: Record<string, unknown>): string[] {
  const videos: string[] = [];
  const output = data.output as Record<string, unknown> | undefined;

  if (!output) return videos;

  // 成功时返回 video_url
  if (output.task_status === 'SUCCEEDED' && output.video_url) {
    videos.push(output.video_url as string);
  }

  // 兼容其他格式
  if (output.results) {
    const results = output.results as Array<Record<string, unknown>>;
    for (const r of results) {
      if (r.url && typeof r.url === 'string') videos.push(r.url);
      if (r.video_url && typeof r.video_url === 'string') videos.push(r.video_url);
    }
  }

  return videos;
}

/**
 * 从视频响应中提取 task_id（用于异步任务轮询）
 */
export function extractVideoTaskId(data: Record<string, unknown>): string | null {
  const output = data.output as Record<string, unknown> | undefined;
  if (!output) return null;

  // HappyHorse 异步提交成功返回 task_id
  if (output.task_id && typeof output.task_id === 'string') {
    return output.task_id;
  }

  return null;
}

/**
 * 从轮询响应中提取任务状态
 */
export function extractVideoTaskStatus(data: Record<string, unknown>): {
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'unknown';
  videoUrl?: string;
  error?: string;
} {
  const output = data.output as Record<string, unknown> | undefined;
  if (!output) return { status: 'unknown' };

  const taskStatus = output.task_status as string;

  switch (taskStatus) {
    case 'PENDING':
    case 'RUNNING':
      return { status: taskStatus === 'PENDING' ? 'pending' : 'running' };
    case 'SUCCEEDED':
      return {
        status: 'succeeded',
        videoUrl: output.video_url as string | undefined,
      };
    case 'FAILED':
      return {
        status: 'failed',
        // 优先使用 code + message 组合，其次使用 message
        error: output.code && output.message
          ? `${output.code}: ${output.message}`
          : (output.message as string || '视频生成失败'),
      };
    default:
      return { status: 'unknown' };
  }
}

export const dashscopeAdapter: ApiAdapter = {
  format: 'dashscope',

  buildImageRequest(params: ImageAdapterParams): Record<string, unknown> {
    const content: Array<Record<string, string>> = [];

    // 判断是文生图还是图生图
    const hasReferenceImage = !!params.image;

    // 图生图 / 图像编辑：先放图片，再放文本
    if (hasReferenceImage) {
      content.push({ image: params.image! });
      // 额外图片（多图编辑）
      if ((params as unknown as Record<string, unknown>).extraImages) {
        const extra = (params as unknown as Record<string, unknown>).extraImages as string[];
        for (const img of extra) {
          content.push({ image: img });
        }
      }
    }

    // 文本提示词（最后放）
    content.push({ text: params.prompt });

    const body: Record<string, unknown> = {
      model: params.modelName,
      input: {
        messages: [
          {
            role: 'user',
            content,
          },
        ],
      },
      parameters: {
        size: resolveDashScopeSize(params.aspectRatio, params.resolution),
        n: Math.max(1, params.count || 1),
        // 默认关闭思考模式，提升响应速度
        thinking_mode: false,
      },
    };

    // 负面提示词（DashScope 支持）
    if (params.negativePrompt) {
      (body.parameters as Record<string, unknown>).negative_prompt = params.negativePrompt;
    }

    return body;
  },

  /**
   * 构建视频生成请求（HappyHorse 格式）
   *
   * HappyHorse API 格式：
   * - 端点: /api/v1/services/aigc/video-generation/video-synthesis
   * - 必需请求头: X-DashScope-Async: enable
   * - 文生视频: input.prompt
   * - 图生视频: input.prompt + input.media (类型为 image)
   * - 参数: resolution, ratio, duration, watermark, seed
   */
  buildVideoRequest(params: VideoAdapterParams): Record<string, unknown> {
    const input: Record<string, unknown> = {
      prompt: params.prompt || '',
    };

    // 图生视频: 添加 media 字段（HappyHorse API 格式）
    if (params.image) {
      input.media = [{
        type: 'first_frame',
        url: params.image,
      }];
    }

    const parameters: Record<string, unknown> = {};

    // 分辨率: 720P / 1080P
    if (params.resolution) {
      parameters.resolution = params.resolution.toUpperCase().includes('2K') ? '1080P' :
        params.resolution.toUpperCase().includes('4K') ? '1080P' : '720P';
    } else {
      parameters.resolution = '720P';
    }

    // 画面比例: 16:9 / 9:16 / 1:1 / 4:3 / 3:4
    if (params.aspectRatio) {
      parameters.ratio = params.aspectRatio;
    } else {
      parameters.ratio = '16:9';
    }

    // 时长: 3-15秒
    if (params.duration) {
      parameters.duration = Math.min(15, Math.max(3, params.duration));
    } else {
      parameters.duration = 5;
    }

    // 关闭水印
    parameters.watermark = false;

    const body: Record<string, unknown> = {
      model: params.modelName,
      input,
      parameters,
    };

    return body;
  },

  parseImageResponse(data: Record<string, unknown>): string[] {
    return parseDashScopeImageResponse(data);
  },

  parseVideoResponse(data: Record<string, unknown>): string[] {
    return parseDashScopeVideoResponse(data);
  },

  buildTestRequest(params: TestAdapterParams): { url: string; body: Record<string, unknown>; method: string; headers?: Record<string, string> } {
    // 检测是否为视频模型（happyhorse, wan-video 等）
    const modelName = params.modelName || '';
    const isVideoModel = modelName.includes('video') ||
                        modelName.includes('happyhorse') ||
                        modelName.includes('wan2') && modelName.includes('i2v') ||
                        modelName.includes('t2v');

    if (isVideoModel) {
      // 视频模型测试请求（HappyHorse 格式）
      const fullUrl = buildDashScopeVideoSynthesisUrl(params.apiUrl);
      return {
        url: fullUrl,
        body: {
          model: modelName || 'happyhorse-1.0-t2v',
          input: {
            prompt: 'a cute cat walking',
          },
          parameters: {
            resolution: '720P',
            ratio: '16:9',
            duration: 3,
          },
        },
        method: 'POST',
        headers: {
          'X-DashScope-Async': 'enable',
        },
      };
    }

    // 图片模型测试请求（原始格式）
    const fullUrl = buildDashScopeGenerationUrl(params.apiUrl);
    return {
      url: fullUrl,
      body: {
        model: params.modelName || 'wan2.7-image',
        input: {
          messages: [
            { role: 'user', content: [{ text: 'a cute cat' }] },
          ],
        },
        parameters: { n: 1, size: '1K' },
      },
      method: 'POST',
    };
  },

  parseTestResponse(_data: Record<string, unknown>, status: number, rawBody: string): { success: boolean; message: string } {
    if (status === 200 || status === 202) {
      try {
        const data = JSON.parse(rawBody);
        const output = data.output as Record<string, unknown> | undefined;

        // 视频 API 异步提交成功（HappyHorse）
        if (output?.task_id) {
          const taskId = output.task_id as string;
          const taskStatus = output.task_status as string;
          if (taskStatus === 'PENDING' || taskStatus === 'RUNNING') {
            return { success: true, message: `连接成功，API 可用（任务已提交: ${taskId.slice(0, 8)}...）` };
          }
        }

        // 同步成功
        if (output?.task_status === 'SUCCEEDED') {
          return { success: true, message: '连接成功，API 可用' };
        }

        // 通用成功判断
        if (data.request_id || data.output) {
          return { success: true, message: '连接成功，API 可用' };
        }
      } catch {
        // ignore
      }
      return { success: true, message: '连接成功' };
    }

    // 错误处理
    try {
      const data = JSON.parse(rawBody);
      // HappyHorse / 百炼常见错误
      if (data.message) {
        return { success: false, message: `连接失败: ${data.message}` };
      }
      if (data.error?.message) {
        return { success: false, message: `连接失败: ${data.error.message}` };
      }
      if (data.code && data.message) {
        return { success: false, message: `连接失败 [${data.code}]: ${data.message}` };
      }
      if (data.detail?.error_code) {
        return { success: false, message: `连接失败 [${data.detail.error_code}]: ${data.detail.error_msg || '未知错误'}` };
      }
      // 处理 error.message 格式
      if (data.error) {
        const err = data.error;
        if (typeof err === 'string') {
          return { success: false, message: `连接失败: ${err}` };
        }
        if (err.message) {
          return { success: false, message: `连接失败: ${err.message}` };
        }
      }
    } catch {
      // ignore
    }

    return { success: false, message: `连接失败 (${status}): ${rawBody.slice(0, 200)}` };
  },
};
