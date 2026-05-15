/**
 * 自定义 API 密钥共享存储
 *
 * 使用 localStorage 持久化用户的自定义 API 密钥配置，
 * 并提供 React Hook 供各组件（个人中心、创作中心）共享访问。
 */

export interface CustomApiKey {
  id: string;
  provider: string;
  apiUrl: string;
  modelName: string;
  apiKey: string;        // 完整密钥，仅本地存储
  apiKeyPreview: string; // 脱敏预览
  type: 'image' | 'video' | 'text'; // 模型类型：生图模型 / 视频模型 / 文本模型
  apiFormat: 'openai' | 'kling' | 'dashscope'; // API 格式类型，默认 'openai'
  /** 可灵专用：accessKey（与 secretKey 组合使用） */
  accessKey?: string;
  /** 可灵专用：secretKey（与 accessKey 组合使用） */
  secretKey?: string;
  isActive: boolean;
  createdAt: string;
}

const STORAGE_KEY = 'miaojing_custom_api_keys';

function loadKeys(): CustomApiKey[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveKeys(keys: CustomApiKey[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  // Dispatch custom event so other tabs/components can react
  window.dispatchEvent(new CustomEvent('custom-api-keys-updated'));
}

export function getCustomApiKeys(): CustomApiKey[] {
  return loadKeys().filter(k => k.isActive);
}

export function addCustomApiKey(entry: Omit<CustomApiKey, 'id' | 'apiKeyPreview' | 'createdAt'>): CustomApiKey {
  const keys = loadKeys();
  // 可灵格式：apiKey 存储为 accessKey:secretKey 格式
  const keyToStore = entry.apiKey || (entry.accessKey && entry.secretKey ? `${entry.accessKey}:${entry.secretKey}` : '');
  const newKey: CustomApiKey = {
    ...entry,
    type: entry.type || 'image', // Default to image for backward compat
    apiFormat: (entry as CustomApiKey).apiFormat || 'openai', // Default to openai for backward compat
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    apiKeyPreview: keyToStore.length > 4 ? `***${keyToStore.slice(-4)}` : '****',
    createdAt: new Date().toISOString().split('T')[0],
  };
  keys.push(newKey);
  saveKeys(keys);
  return newKey;
}

export function updateCustomApiKey(id: string, updates: Partial<Omit<CustomApiKey, 'id' | 'createdAt'>>): CustomApiKey | null {
  const keys = loadKeys();
  const idx = keys.findIndex(k => k.id === id);
  if (idx === -1) return null;
  keys[idx] = { ...keys[idx], ...updates };
  if (updates.apiKey) {
    keys[idx].apiKeyPreview = updates.apiKey.length > 4 ? `***${updates.apiKey.slice(-4)}` : '****';
  }
  // 可灵格式更新时同步更新 apiKey
  if (updates.accessKey || updates.secretKey) {
    const access = updates.accessKey ?? keys[idx].accessKey ?? '';
    const secret = updates.secretKey ?? keys[idx].secretKey ?? '';
    if (access && secret) {
      keys[idx].apiKey = `${access}:${secret}`;
      keys[idx].apiKeyPreview = `***${keys[idx].apiKey.slice(-4)}`;
    }
  }
  saveKeys(keys);
  return keys[idx];
}

export function deleteCustomApiKey(id: string): void {
  const keys = loadKeys().filter(k => k.id !== id);
  saveKeys(keys);
}

export function getCustomApiKeyById(id: string): CustomApiKey | undefined {
  return loadKeys().find(k => k.id === id);
}

/**
 * React Hook - 订阅自定义 API 密钥变更
 */
import { useState, useEffect, useCallback } from 'react';

export function useCustomApiKeys() {
  const [keys, setKeys] = useState<CustomApiKey[]>([]);

  // Load on mount
  useEffect(() => {
    setKeys(loadKeys());

    // Listen for changes from this or other components
    const handler = () => setKeys(loadKeys());
    window.addEventListener('custom-api-keys-updated', handler);
    window.addEventListener('storage', handler); // cross-tab

    return () => {
      window.removeEventListener('custom-api-keys-updated', handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  const add = useCallback((entry: Omit<CustomApiKey, 'id' | 'apiKeyPreview' | 'createdAt'>) => {
    const newKey = addCustomApiKey(entry);
    setKeys(loadKeys());
    return newKey;
  }, []);

  const update = useCallback((id: string, updates: Partial<Omit<CustomApiKey, 'id' | 'createdAt'>>) => {
    const result = updateCustomApiKey(id, updates);
    setKeys(loadKeys());
    return result;
  }, []);

  const remove = useCallback((id: string) => {
    deleteCustomApiKey(id);
    setKeys(loadKeys());
  }, []);

  const toggleActive = useCallback((id: string) => {
    const key = loadKeys().find(k => k.id === id);
    if (key) {
      updateCustomApiKey(id, { isActive: !key.isActive });
      setKeys(loadKeys());
    }
  }, []);

  // Active keys for use in creation center
  const activeKeys = keys.filter(k => k.isActive);

  // Active keys that are image-capable (type === 'image')
  const imageKeys = activeKeys.filter(k => k.type === 'image');

  // Active keys that are video-capable (type === 'video')
  const videoKeys = activeKeys.filter(k => k.type === 'video');

  // Active keys that are text-capable (type === 'text')
  const textKeys = activeKeys.filter(k => k.type === 'text');

  return { keys, activeKeys, imageKeys, videoKeys, textKeys, add, update, remove, toggleActive };
}
