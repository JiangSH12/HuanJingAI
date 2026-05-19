import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Download a file from a URL using the server-side proxy to bypass CORS.
 *
 * Why not fetch() directly? S3 presigned URLs and other remote URLs
 * often don't have CORS headers for the browser origin, causing
 * client-side fetch() to fail. The /api/download proxy fetches
 * server-side (no CORS restriction) and returns the file with
 * Content-Disposition header.
 */
export async function downloadFile(
  url: string,
  filename: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const triggerNativeDownload = (): boolean => {
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return true;
    } catch {
      return false;
    }
  };

  try {
    const proxyUrl = `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
    const response = await fetch(proxyUrl, { cache: 'no-store' });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: '下载失败' }));
      if (triggerNativeDownload()) {
        return { ok: true };
      }
      return { ok: false, error: data.error || '下载失败' };
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    return { ok: true };
  } catch (err) {
    if (triggerNativeDownload()) {
      return { ok: true };
    }
    const msg = err instanceof Error ? err.message : '下载失败';
    return { ok: false, error: msg };
  }
}


/**
 * Safely parse a fetch Response as JSON.
 * Handles empty bodies, HTML error pages, and non-JSON responses gracefully.
 * Returns { ok, data, error } instead of throwing.
 */
export async function safeParseJson<T = Record<string, unknown>>(res: Response): Promise<{
  ok: boolean;
  data: T | null;
  error: string | null;
}> {
  // Check Content-Type to detect HTML responses early
  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  if (!res.ok) {
    // Error response - try to extract meaningful message
    try {
      const text = await res.text();

      // HTML error page (Cloudflare, nginx, etc.)
      if (text.trim().startsWith('<!') || text.trim().startsWith('<html') || text.trim().startsWith('<HTML')) {
        return {
          ok: false,
          data: null,
          error: `服务器返回错误页面 (HTTP ${res.status})，可能原因：API 服务异常或代理防火墙拦截了请求`,
        };
      }

      // Try parsing as JSON error
      try {
        const json = JSON.parse(text);
        const errorMsg = json.error || json.message || json.msg || `请求失败 (HTTP ${res.status})`;
        return { ok: false, data: null, error: typeof errorMsg === 'string' ? errorMsg : String(errorMsg) };
      } catch {
        // Plain text error
        return {
          ok: false,
          data: null,
          error: text.slice(0, 200) || `请求失败 (HTTP ${res.status})`,
        };
      }
    } catch {
      return { ok: false, data: null, error: `请求失败 (HTTP ${res.status})` };
    }
  }

  // Success response - parse JSON
  try {
    const text = await res.text();

    if (!text.trim()) {
      return { ok: false, data: null, error: '服务器返回了空响应' };
    }

    try {
      const data = JSON.parse(text) as T;
      return { ok: true, data, error: null };
    } catch {
      // Response is not JSON
      if (!isJson && (text.trim().startsWith('<!') || text.trim().startsWith('<html'))) {
        return { ok: false, data: null, error: '服务器返回了错误页面而非 JSON 数据，可能是代理防火墙拦截' };
      }
      return { ok: false, data: null, error: '服务器返回了无法解析的响应' };
    }
  } catch {
    return { ok: false, data: null, error: '读取响应失败' };
  }
}
