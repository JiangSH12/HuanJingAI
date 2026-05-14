/**
 * API 适配器注册表与工厂函数
 *
 * 所有适配器在此注册，通过 apiFormat 标识获取对应适配器。
 * 新增适配器只需：
 * 1. 创建适配器文件（实现 ApiAdapter 接口）
 * 2. 在此文件 import 并加入 ADAPTERS_MAP
 */
import type { ApiAdapter, ApiFormat } from './types';
import { openaiAdapter } from './openai';
import { klingAdapter } from './kling';

/** 适配器注册表 */
const ADAPTERS_MAP: Record<ApiFormat, ApiAdapter> = {
  openai: openaiAdapter,
  kling: klingAdapter,
};

/**
 * 获取指定格式的适配器
 * @param format - API 格式标识，默认 'openai'（向后兼容）
 */
export function getAdapter(format: string | undefined): ApiAdapter {
  const key = (format || 'openai') as ApiFormat;
  const adapter = ADAPTERS_MAP[key];
  if (!adapter) {
    console.warn(`[API Adapter] Unknown format: ${format}, falling back to openai`);
    return ADAPTERS_MAP.openai;
  }
  return adapter;
}

/** 获取所有已注册的格式列表（用于 UI 下拉选项） */
export function getSupportedFormats(): { value: ApiFormat; label: string }[] {
  return [
    { value: 'openai', label: 'OpenAI 兼容' },
    { value: 'kling', label: '可灵 (Kling)' },
  ];
}

export type { ApiFormat };
export { ADAPTERS_MAP };
