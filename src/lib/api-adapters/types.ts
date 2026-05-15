/**
 * API 适配器接口定义
 *
 * 不同供应商的 API 格式差异较大（字段名、响应结构等），
 * 通过适配器模式解耦，支持未来扩展更多供应商。
 */

/** 适配器类型标识 */
export type ApiFormat = 'openai' | 'kling' | 'dashscope';

/** 模型类型 */
export type ModelType = 'image' | 'video' | 'text';

/** 图片生成适配器参数 */
export interface ImageAdapterParams {
  apiUrl: string;
  modelName: string;
  apiKey: string;
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: string;
  resolution?: string;
  count?: number;
  guidanceScale?: number;
  /** 图生图专用：参考图（data URL 或 http URL） */
  image?: string;
  /** 图生图专用：重绘幅度 0~1 */
  strength?: number;
  /** 图像编辑专用：额外参考图（多图编辑场景） */
  extraImages?: string[];
}

/** 视频生成适配器参数 */
export interface VideoAdapterParams {
  apiUrl: string;
  modelName: string;
  apiKey: string;
  prompt?: string;
  negativePrompt?: string;
  aspectRatio?: string;
  duration?: number;
  fps?: number;
  /** 图生视频专用：参考图 */
  image?: string;
}

/** 测试连接参数 */
export interface TestAdapterParams {
  apiUrl: string;
  modelName: string;
  apiKey: string;
}

/** 测试连接结果 */
export interface TestAdapterResult {
  success: boolean;
  message: string;
}

/**
 * API 适配器接口
 *
 * 每个供应商实现一个适配器，负责：
 * - 构建符合该供应商格式的请求体
 * - 解析该供应商的响应，提取图片/视频 URL
 */
export interface ApiAdapter {
  /** 适配器类型标识 */
  format: ApiFormat;

  /** 构建图片生成请求体 */
  buildImageRequest(params: ImageAdapterParams): Record<string, unknown>;

  /** 构建视频生成请求体 */
  buildVideoRequest(params: VideoAdapterParams): Record<string, unknown>;

  /**
   * 解析图片生成响应，提取图片 URL 数组
   * @returns string[] 图片 URL（data URL 或 http URL）
   */
  parseImageResponse(data: Record<string, unknown>): string[];

  /**
   * 解析视频生成响应，提取视频 URL 数组
   * @returns string[] 视频 URL（data URL 或 http URL）
   */
  parseVideoResponse(data: Record<string, unknown>): string[];

  /** 构建测试连接的请求体 */
  buildTestRequest(params: TestAdapterParams): { url: string; body: Record<string, unknown>; method: string };

  /** 解析测试连接响应 */
  parseTestResponse(data: Record<string, unknown>, status: number, rawBody: string): TestAdapterResult;
}
