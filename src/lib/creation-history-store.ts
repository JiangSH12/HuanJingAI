/**
 * 创作历史记录存储
 *
 * 保存用户所有生成记录（图片/视频 + 提示词 + 参数），
 * 在个人中心的历史记录中展示。
 */

export interface CreationRecord {
  id: string;
  type: 'image' | 'video';
  url: string;           // 图片/视频地址（可以是 data URL 或远程 URL）
  prompt: string;        // 用户输入的提示词
  negativePrompt?: string;
  model: string;         // 模型ID（如 doubao-seedream-5-0-260128 或 custom:xxx）
  modelLabel: string;    // 模型显示名称（如 "See Dream" 或 "gpt-image-2"）
  isCustomModel: boolean;
  params: Record<string, unknown>;
  createdAt: string;     // ISO date string
  published?: boolean;   // Whether this work is published to the gallery
  referenceImage?: string; // For img2img: the reference image URL
  publisherNickname?: string; // Set when publishing
}

/* ---------- Published Work (shared gallery) ---------- */
export interface PublishedWork {
  id: string;
  type: 'image' | 'video';
  url: string;
  prompt: string;
  negativePrompt?: string;
  model: string;
  modelLabel: string;
  isCustomModel: boolean;
  params: Record<string, unknown>;
  referenceImage?: string;
  publisherId: string;
  publisherNickname: string;
  publishedAt: string;
  likes: number;
}

const STORAGE_KEY = 'miaojing_creation_history';
const PUBLISHED_KEY = 'miaojing_published_gallery';
const MAX_RECORDS = 200;
const MAX_PUBLISHED = 200;
// Max localStorage size for history data (3MB, leaving room for other stores)
const MAX_STORAGE_BYTES = 3 * 1024 * 1024;

export function isPlaceholder(url: string): boolean {
  return url === '[data-url]';
}

function estimateByteSize(str: string): number {
  return new Blob([str]).size;
}

function loadRecords(): CreationRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CreationRecord[];
  } catch {
    // If parsing fails, clear corrupted data
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    return [];
  }
}

function saveRecords(records: CreationRecord[]): void {
  if (typeof window === 'undefined') return;
  const trimmed = records.slice(0, MAX_RECORDS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Quota exceeded — progressively remove oldest records
    let shrinking = [...trimmed];
    while (shrinking.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(shrinking));
        break;
      } catch {
        shrinking = shrinking.slice(0, -1);
      }
    }
  }
  window.dispatchEvent(new CustomEvent('creation-history-updated'));
}

export function addCreationRecord(record: Omit<CreationRecord, 'id' | 'createdAt'>): CreationRecord {
  const records = loadRecords();
  const newRecord: CreationRecord = {
    ...record,
    // Note: since API now returns S3 presigned URLs instead of data URLs,
    // we store the URL directly — no compression needed
    id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  records.unshift(newRecord);

  // Enforce count limit
  if (records.length > MAX_RECORDS) {
    records.length = MAX_RECORDS;
  }

  // Enforce storage size limit
  while (records.length > 0 && estimateByteSize(JSON.stringify(records)) > MAX_STORAGE_BYTES) {
    records.pop();
  }

  saveRecords(records);
  return newRecord;
}

export function getCreationRecords(): CreationRecord[] {
  return loadRecords();
}

export function deleteCreationRecord(id: string): void {
  const records = loadRecords().filter(r => r.id !== id);
  saveRecords(records);
}

export function clearCreationRecords(): void {
  saveRecords([]);
}

/**
 * React Hook - 订阅创作历史变更
 */
import { useState, useEffect, useCallback } from 'react';

export function useCreationHistory() {
  const [records, setRecords] = useState<CreationRecord[]>([]);

  useEffect(() => {
    setRecords(loadRecords());

    const handler = () => setRecords(loadRecords());
    window.addEventListener('creation-history-updated', handler);
    window.addEventListener('storage', handler);

    return () => {
      window.removeEventListener('creation-history-updated', handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  const add = useCallback((record: Omit<CreationRecord, 'id' | 'createdAt'>) => {
    const newRecord = addCreationRecord(record);
    setRecords(loadRecords());
    return newRecord;
  }, []);

  const remove = useCallback((id: string) => {
    deleteCreationRecord(id);
    setRecords(loadRecords());
  }, []);

  const clear = useCallback(() => {
    clearCreationRecords();
    setRecords([]);
  }, []);

  return { records, add, remove, clear };
}

/* ========== Published Gallery API ========== */

function loadPublished(): PublishedWork[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PUBLISHED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    try { localStorage.removeItem(PUBLISHED_KEY); } catch { /* ignore */ }
    return [];
  }
}

function savePublished(works: PublishedWork[]): void {
  if (typeof window === 'undefined') return;
  const trimmed = works.slice(0, MAX_PUBLISHED);
  try {
    localStorage.setItem(PUBLISHED_KEY, JSON.stringify(trimmed));
  } catch {
    let shrinking = [...trimmed];
    while (shrinking.length > 0) {
      try {
        localStorage.setItem(PUBLISHED_KEY, JSON.stringify(shrinking));
        break;
      } catch {
        shrinking = shrinking.slice(0, -1);
      }
    }
  }
  window.dispatchEvent(new CustomEvent('published-works-updated'));
}

/** Publish a creation record to the public gallery */
export function publishWork(
  record: CreationRecord,
  publisherId: string,
  publisherNickname: string,
): void {
  // Mark as published in history
  const records = loadRecords();
  const idx = records.findIndex(r => r.id === record.id);
  if (idx !== -1) {
    records[idx].published = true;
    records[idx].publisherNickname = publisherNickname;
    saveRecords(records);
  }

  // Add to published works (prevent duplicates)
  const works = loadPublished();
  if (works.some(w => w.id === record.id)) return;

  works.unshift({
    id: record.id,
    type: record.type,
    url: record.url,
    prompt: record.prompt,
    negativePrompt: record.negativePrompt,
    model: record.model,
    modelLabel: record.modelLabel,
    isCustomModel: record.isCustomModel,
    params: record.params,
    referenceImage: record.referenceImage,
    publisherId,
    publisherNickname,
    publishedAt: new Date().toISOString(),
    likes: 0,
  });
  savePublished(works);
}

/** Unpublish a work */
export function unpublishWork(id: string): void {
  const records = loadRecords();
  const idx = records.findIndex(r => r.id === id);
  if (idx !== -1) {
    records[idx].published = false;
    saveRecords(records);
  }
  const works = loadPublished().filter(w => w.id !== id);
  savePublished(works);
}

/** Quick-share a generated result to gallery (no existing record needed) */
export async function shareToGallery(options: {
  type: 'image' | 'video';
  url: string;
  prompt?: string;
  model?: string;
  modelLabel?: string;
  publisherId?: string;
  publisherNickname?: string;
  negativePrompt?: string;
  referenceImage?: string;
  params?: Record<string, unknown>;
  creditsCost?: number;
}): Promise<void> {
  // Save to localStorage for immediate local display
  const works = loadPublished();
  // Prevent duplicates by URL
  if (works.some(w => w.url === options.url)) return;

  works.unshift({
    id: `pub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: options.type,
    url: options.url,
    prompt: options.prompt || '',
    negativePrompt: options.negativePrompt,
    model: options.model || '',
    modelLabel: options.modelLabel || '',
    isCustomModel: false,
    params: options.params || {},
    referenceImage: options.referenceImage,
    publisherId: options.publisherId || 'anonymous',
    publisherNickname: options.publisherNickname || '匿名用户',
    publishedAt: new Date().toISOString(),
    likes: 0,
  });
  savePublished(works);
  window.dispatchEvent(new CustomEvent('creation-history-updated'));

  // Also persist to Supabase
  try {
    const res = await fetch('/api/gallery/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: options.publisherId,
        type: options.type,
        prompt: options.prompt,
        negativePrompt: options.negativePrompt,
        resultUrl: options.url,
        model: options.model,
        modelLabel: options.modelLabel,
        referenceImage: options.referenceImage,
        params: options.params,
        creditsCost: options.creditsCost,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.demo) {
      console.warn('[shareToGallery] Demo mode — work only saved locally');
    }
  } catch {
    // Non-critical — localStorage version is already saved
  }

  // Mark the corresponding creation record as published
  markRecordAsPublished(options.url);
}

/** Mark a creation record as published by URL */
export function markRecordAsPublished(url: string): void {
  const records = loadRecords();
  const idx = records.findIndex(r => r.url === url);
  if (idx !== -1 && !records[idx].published) {
    records[idx].published = true;
    saveRecords(records);
    window.dispatchEvent(new CustomEvent('creation-history-updated'));
  }
}

/** Check if a URL has already been published to gallery */
export function isUrlPublished(url: string): boolean {
  // Check creation records
  const records = loadRecords();
  if (records.some(r => r.url === url && r.published)) return true;
  // Check published works
  const published = loadPublished();
  if (published.some(w => w.url === url)) return true;
  return false;
}

/**
 * Sync localStorage published works AND published creation records to Supabase.
 * This ensures that previously shared works (stored only in localStorage)
 * are visible to all visitors, not just the publisher's browser.
 * Returns the number of works that were synced.
 */
export async function syncPublishedToSupabase(): Promise<number> {
  // Collect all URLs to sync from both published gallery and creation history
  const published = loadPublished();
  const records = loadRecords();

  // Gather all works to sync
  const toSync: Array<{
    url: string;
    type: string;
    prompt: string;
    negativePrompt?: string;
    model: string;
    modelLabel: string;
    referenceImage?: string;
    params: Record<string, unknown>;
    publisherId?: string;
    publisherNickname?: string;
  }> = [];

  // From published gallery
  for (const work of published) {
    if (work.url && !work.url.startsWith('data:') && !work.url.startsWith('[')) {
      toSync.push({
        url: work.url,
        type: work.type,
        prompt: work.prompt || '',
        negativePrompt: work.negativePrompt,
        model: work.model || '',
        modelLabel: work.modelLabel || '',
        referenceImage: work.referenceImage,
        params: work.params || {},
        publisherId: work.publisherId,
        publisherNickname: work.publisherNickname,
      });
    }
  }

  // From creation history with published flag
  for (const r of records) {
    if (r.published && r.url && !r.url.startsWith('data:') && !r.url.startsWith('[') && !toSync.some(w => w.url === r.url)) {
      toSync.push({
        url: r.url,
        type: r.type,
        prompt: r.prompt,
        negativePrompt: r.negativePrompt,
        model: r.model || '',
        modelLabel: r.modelLabel || '',
        referenceImage: r.referenceImage,
        params: r.params || {},
      });
    }
  }

  if (toSync.length === 0) return 0;

  let synced = 0;
  // Get the list of URLs already in Supabase to avoid duplicates
  let existingUrls = new Set<string>();
  try {
    const res = await fetch('/api/gallery?limit=200');
    if (res.ok) {
      const data = await res.json();
      existingUrls = new Set((data.works || []).map((w: { url: string }) => w.url));
    }
  } catch { /* proceed anyway */ }

  for (const work of toSync) {
    const url = work.url;
    // Skip if already in Supabase
    if (existingUrls.has(url)) { synced++; continue; }

    try {
      const res = await fetch('/api/gallery/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: work.publisherId && work.publisherId !== 'anonymous' ? work.publisherId : undefined,
          type: work.type,
          prompt: work.prompt,
          negativePrompt: work.negativePrompt,
          resultUrl: url,
          model: work.model,
          modelLabel: work.modelLabel,
          referenceImage: work.referenceImage,
          params: work.params,
        }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        // Demo mode returns 200 but doesn't actually persist
        if (data.demo) {
          console.warn('[gallery sync] Skipped (demo mode):', url.slice(0, 60));
        } else {
          synced++;
        }
      } else {
        console.warn('[gallery sync] Failed to publish:', url.slice(0, 60), await res.text().catch(() => ''));
      }
    } catch (err) {
      console.warn('[gallery sync] Error publishing:', url.slice(0, 60), err);
    }
  }

  return synced;
}

/** Get all published works */
export function getPublishedWorks(): PublishedWork[] {
  return loadPublished();
}

/** Like a published work */
export function likePublishedWork(id: string): void {
  const works = loadPublished();
  const idx = works.findIndex(w => w.id === id);
  if (idx !== -1) {
    works[idx].likes += 1;
    savePublished(works);
  }
}

/**
 * React Hook - 订阅已发布作品变更
 */
export function usePublishedWorks() {
  const [works, setWorks] = useState<PublishedWork[]>([]);

  useEffect(() => {
    setWorks(loadPublished());

    const handler = () => setWorks(loadPublished());
    window.addEventListener('published-works-updated', handler);
    window.addEventListener('storage', handler);

    return () => {
      window.removeEventListener('published-works-updated', handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  const publish = useCallback((record: CreationRecord, publisherId: string, publisherNickname: string) => {
    publishWork(record, publisherId, publisherNickname);
    setWorks(loadPublished());
  }, []);

  const unpublish = useCallback((id: string) => {
    unpublishWork(id);
    setWorks(loadPublished());
  }, []);

  const like = useCallback((id: string) => {
    likePublishedWork(id);
    setWorks(loadPublished());
  }, []);

  return { works, publish, unpublish, like };
}
