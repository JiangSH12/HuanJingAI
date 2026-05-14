/**
 * 创作中心 - 模型配置与参数规则
 *
 * 图片生成参数：
 * - 画面比例 (aspectRatio): 1:1 / 16:9 / 9:16 / 4:3 / 3:4
 * - 分辨率 (resolution): 1080P / 2K / 4K
 *
 * 视频生成参数：
 * - 画面比例 + 时长 + 帧率
 *
 * 默认使用硅基流动 API，通过环境变量配置
 */

// ---- 图片生成模型 ----

export interface ImageModelConfig {
  id: string;
  label: string;
  provider: string;
  description: string;
}

// 默认使用硅基流动图片模型
export const IMAGE_MODELS: ImageModelConfig[] = [
  {
    id: 'siliconflow-default',
    label: '通义图像 (Z-Image-Turbo)',
    provider: '硅基流动',
    description: '通义图像Turbo模型，支持多种风格',
  },
];

// ---- 画面比例选项 ----

export const ASPECT_RATIOS = [
  { value: '1:1', label: '1:1 方形', credits: 8 },
  { value: '16:9', label: '16:9 横版', credits: 8 },
  { value: '9:16', label: '9:16 竖版', credits: 8 },
  { value: '4:3', label: '4:3 横版', credits: 8 },
  { value: '3:4', label: '3:4 竖版', credits: 8 },
] as const;

// 图生图额外画面比例选项
export const IMG2IMG_ASPECT_RATIOS = [
  { value: 'original', label: '原比例', desc: '使用参考图比例', credits: 8 },
  ...ASPECT_RATIOS,
] as const;

// ---- 分辨率选项 ----

export const RESOLUTION_OPTIONS = [
  { value: '1080P', label: '1080P', credits: 5 },
  { value: '2K', label: '2K', credits: 10 },
  { value: '4K', label: '4K', credits: 20 },
] as const;

// 将画面比例+分辨率转换为具体像素尺寸
/**
 * Resolve pixel size for SDK (built-in) models.
 * These high-res sizes are supported by the official coze-coding-dev-sdk.
 */
export function resolveImageSize(aspectRatio: string, resolution: string): string {
  const sizeMap: Record<string, Record<string, string>> = {
    '1:1': { '1080P': '1024x1024', '2K': '2048x2048', '4K': '4096x4096' },
    '16:9': { '1080P': '1920x1080', '2K': '2560x1440', '4K': '3840x2160' },
    '9:16': { '1080P': '1080x1920', '2K': '1440x2560', '4K': '2160x3840' },
    '4:3': { '1080P': '1440x1080', '2K': '2560x1920', '4K': '4096x3072' },
    '3:4': { '1080P': '1080x1440', '2K': '1920x2560', '4K': '3072x4096' },
  };
  return sizeMap[aspectRatio]?.[resolution] || '1024x1024';
}

/**
 * Resolve pixel size for custom/system API models.
 * Uses standard OpenAI-compatible sizes that most API providers support.
 * Falls back to 1024x1024 for unknown ratios.
 */
export function resolveCustomApiImageSize(aspectRatio: string): string {
  const sizeMap: Record<string, string> = {
    '1:1': '1024x1024',
    '16:9': '1792x1024',
    '9:16': '1024x1792',
    '4:3': '1152x896',
    '3:4': '896x1152',
  };
  return sizeMap[aspectRatio] || '1024x1024';
}

/**
 * Get aspect ratio description for prompt augmentation.
 * Many APIs ignore size/aspect_ratio parameters, so we embed the ratio
 * in the prompt as a fallback to guide the model's output orientation.
 */
export function getAspectRatioPromptHint(aspectRatio: string): string {
  const hints: Record<string, string> = {
    '1:1': 'square format, 1:1 aspect ratio',
    '16:9': 'landscape/widescreen format, 16:9 aspect ratio, horizontal orientation',
    '9:16': 'portrait/vertical format, 9:16 aspect ratio, vertical orientation',
    '4:3': 'standard landscape format, 4:3 aspect ratio',
    '3:4': 'standard portrait format, 3:4 aspect ratio',
  };
  return hints[aspectRatio] || '';
}

// ---- 视频生成模型 ----

export interface VideoModelConfig {
  id: string;
  label: string;
  provider: string;
  description: string;
}

// 默认使用硅基流动视频模型
export const VIDEO_MODELS: VideoModelConfig[] = [
  {
    id: 'siliconflow-default',
    label: '万梦视频 (Wan2.2-I2V)',
    provider: '硅基流动',
    description: '万梦视频模型，支持文生视频和图生视频',
  },
];

// ---- 通用 ----

export const STYLE_PRESETS = [
  '写实照片', '动漫插画', '水墨国风', '油画质感', '赛博朋克',
  '水彩淡雅', '像素复古', '极简线条', '梦幻童话', '暗黑哥特',
];

export const IMG2IMG_STYLE_PRESETS = [
  '风格迁移', '场景变换', '人物换装', '背景替换', '艺术化处理',
  '色彩调整', '细节增强', '概念融合', '超分辨率', '线稿上色',
];

export const CAMERA_MOVEMENTS = ['固定镜头', '平移', '推拉', '摇臂', '航拍'];
export const IMG2VIDEO_CAMERA_MOVEMENTS = ['固定镜头', '缓慢推进', '环绕', '航拍推移', '焦点切换'];

export const VIDEO_STYLES = ['真实电影', '动画', '纪录片', '科幻', '奇幻', '新闻'];

export const VIDEO_ASPECT_RATIOS = [
  { value: '16:9', label: '16:9 横版' },
  { value: '9:16', label: '9:16 竖版' },
  { value: '1:1', label: '1:1 方形' },
  { value: '4:3', label: '4:3 横版' },
] as const;

export const VIDEO_DURATIONS = [
  { value: '4', label: '4秒', credits: 20 },
  { value: '6', label: '6秒', credits: 30 },
  { value: '8', label: '8秒', credits: 40 },
  { value: '10', label: '10秒', credits: 50 },
] as const;

export const VIDEO_DURATIONS_SHORT = [
  { value: '4', label: '4秒', credits: 20 },
  { value: '6', label: '6秒', credits: 30 },
  { value: '8', label: '8秒', credits: 40 },
] as const;

// 辅助：根据模型 ID 获取模型配置
export function getImageModelConfig(modelId: string): ImageModelConfig | undefined {
  return IMAGE_MODELS.find(m => m.id === modelId);
}

// 判断是否为硅基流动默认模型
export function isSiliconFlowDefault(modelId: string): boolean {
  return modelId === 'siliconflow-default';
}

// 辅助：计算积分消耗（硅基流动/自定义模型不消耗积分，系统模型按管理员配置消耗）
export function calcImageCredits(modelId: string, resolution?: string, aspectRatio?: string, count: number = 1, systemCreditsPerUse?: number): number {
  if (isCustomModel(modelId)) return 0;
  if (isSiliconFlowDefault(modelId)) return 0; // 硅基流动默认不消耗积分
  if (isSystemModel(modelId) && systemCreditsPerUse !== undefined) return systemCreditsPerUse * count;
  // Resolution credits
  const r = RESOLUTION_OPTIONS.find(o => o.value === resolution);
  return (r?.credits ?? 10) * count;
}

export function calcVideoCredits(duration: string, modelId?: string, systemCreditsPerUse?: number): number {
  if (modelId && isCustomModel(modelId)) return 0;
  if (modelId && isSiliconFlowDefault(modelId)) return 0; // 硅基流动默认不消耗积分
  if (modelId && isSystemModel(modelId) && systemCreditsPerUse !== undefined) return systemCreditsPerUse;
  const d = VIDEO_DURATIONS.find(o => o.value === duration);
  return d?.credits ?? 20;
}

// ---- 自定义模型 (用户添加的 API 密钥对应的模型) ----

// 自定义模型 ID 前缀，用于区分内置模型和自定义模型
export const CUSTOM_MODEL_PREFIX = 'custom:';

// 判断是否为自定义模型
export function isCustomModel(modelId: string): boolean {
  return modelId.startsWith(CUSTOM_MODEL_PREFIX);
}

// 从自定义模型 ID 中提取 apiKey ID
export function getCustomKeyId(modelId: string): string {
  return modelId.slice(CUSTOM_MODEL_PREFIX.length);
}

// 构建自定义模型 ID
export function buildCustomModelId(keyId: string): string {
  return `${CUSTOM_MODEL_PREFIX}${keyId}`;
}

// ---- 系统模型 (管理员配置的默认API) ----

// 系统模型 ID 前缀，用于区分内置模型、自定义模型和系统模型
export const SYSTEM_MODEL_PREFIX = 'system:';

// 判断是否为系统模型
export function isSystemModel(modelId: string): boolean {
  return modelId.startsWith(SYSTEM_MODEL_PREFIX);
}

// 从系统模型 ID 中提取系统 API ID
export function getSystemApiId(modelId: string): string {
  return modelId.slice(SYSTEM_MODEL_PREFIX.length);
}

// 构建系统模型 ID
export function buildSystemModelId(apiId: string): string {
  return `${SYSTEM_MODEL_PREFIX}${apiId}`;
}

// ---- API 格式选项 ----

export const API_FORMAT_OPTIONS = [
  { value: 'openai', label: 'OpenAI 兼容', desc: '适用于 OpenAI、硅基流动、Stability AI 等' },
  { value: 'kling', label: '可灵 (Kling)', desc: '适用于可灵官方 API' },
] as const;

export type ApiFormat = 'openai' | 'kling';

/** 根据供应商名称获取默认 API 格式 */
export function getDefaultFormatForProvider(provider: string): ApiFormat {
  const p = provider.toLowerCase();
  if (p.includes('kling') || p.includes('可灵')) return 'kling';
  return 'openai';
}
