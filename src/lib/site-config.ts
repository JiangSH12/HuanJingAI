'use client';

import { useState, useEffect, useCallback } from 'react';

export interface SiteConfig {
  siteName: string;
  siteTabTitle: string;
  logoUrl: string | null;
  faviconUrl: string | null;
}

const DEFAULT_SITE_CONFIG: SiteConfig = {
  siteName: '幻镜',
  siteTabTitle: '幻镜 - AI创作平台',
  logoUrl: null,
  faviconUrl: null,
};

const CACHE_KEY = 'miaojing_site_config_cache';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CachedConfig {
  data: SiteConfig;
  timestamp: number;
}

function getCachedConfig(): SiteConfig | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached: CachedConfig = JSON.parse(raw);
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
  } catch { /* ignore */ }
  return null;
}

function setCachedConfig(config: SiteConfig) {
  try {
    const cached: CachedConfig = { data: config, timestamp: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
  } catch { /* ignore */ }
}

/**
 * Fetches site config from the server API.
 * Falls back to localStorage cache, then defaults.
 */
export function useSiteConfig() {
  const [config, setConfig] = useState<SiteConfig>(DEFAULT_SITE_CONFIG);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Try cache first for instant render
    const cached = getCachedConfig();
    if (cached) {
      setConfig(cached);
      setLoaded(true);
    }

    // Always fetch fresh from server
    fetch('/api/site-config')
      .then(res => res.ok ? res.json() : null)
      .then((data: SiteConfig | null) => {
        if (data) {
          const merged: SiteConfig = {
            siteName: data.siteName || DEFAULT_SITE_CONFIG.siteName,
            siteTabTitle: data.siteTabTitle || DEFAULT_SITE_CONFIG.siteTabTitle,
            logoUrl: data.logoUrl || null,
            faviconUrl: data.faviconUrl || null,
          };
          setConfig(merged);
          setCachedConfig(merged);
        }
        setLoaded(true);
      })
      .catch(() => {
        setLoaded(true);
      });
  }, []);

  /** Save site config to server */
  const saveSiteConfig = useCallback(async (updates: {
    siteName?: string;
    siteTabTitle?: string;
    logoBase64?: string;
    faviconBase64?: string;
  }): Promise<SiteConfig | null> => {
    try {
      const res = await fetch('/api/site-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '保存失败' }));
        throw new Error(err.error || '保存失败');
      }

      const data: SiteConfig = await res.json();
      const merged: SiteConfig = {
        siteName: data.siteName || DEFAULT_SITE_CONFIG.siteName,
        siteTabTitle: data.siteTabTitle || DEFAULT_SITE_CONFIG.siteTabTitle,
        logoUrl: data.logoUrl || null,
        faviconUrl: data.faviconUrl || null,
      };
      setConfig(merged);
      setCachedConfig(merged);
      return merged;
    } catch (err) {
      console.error('[useSiteConfig] Save failed:', err);
      throw err;
    }
  }, []);

  return { config, loaded, saveSiteConfig };
}
