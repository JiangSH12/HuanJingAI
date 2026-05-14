/**
 * Shared utility for making custom API requests from the server side.
 *
 * Key fixes for 502 Cloudflare errors:
 * 1. Adds User-Agent header (Node.js fetch omits it by default, triggering WAF blocks)
 * 2. Adds Accept header to look like a normal HTTP client
 * 3. Automatic retry with delay for transient 5xx errors (502/503/504)
 * 4. AbortController timeout for all requests
 */

/**
 * Default headers that mimic a browser-like HTTP client.
 *
 * CRITICAL: Many API proxies (e.g., mozhevip.top) route requests based on User-Agent.
 * Desktop clients like Cherry Studio (Electron/Chromium) send browser-like User-Agent
 * and get routed to working account pools. Custom/unknown User-Agent strings get routed
 * to empty/broken pools, resulting in 503 "No available compatible accounts".
 *
 * Using a Chrome-like User-Agent ensures the proxy routes our requests the same way
 * as Cherry Studio and other desktop clients.
 */
const STANDARD_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Accept': '*/*',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

/** Build request headers, merging standard headers with the Authorization header */
export function buildCustomApiHeaders(apiKey: string, apiFormat?: string): Record<string, string> {
  // 可灵 API 使用 accessKey:secretKey 格式的鉴权
  // apiKey 字段存储格式为 "accessKey:secretKey"
  if (apiFormat === 'kling') {
    return {
      ...STANDARD_HEADERS,
      'Authorization': `Bearer ${apiKey}`,
    };
  }
  return {
    ...STANDARD_HEADERS,
    'Authorization': `Bearer ${apiKey}`,
  };
}

/**
 * Fetch with automatic retry for transient server errors (502/503/504).
 * Many Cloudflare/proxy errors are transient and succeed on retry.
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  maxRetries: number = 1,
): Promise<Response> {
  const retryableStatuses = new Set([502, 503, 504]);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // If it's a retryable server error and we have retries left, wait and retry
      if (retryableStatuses.has(response.status) && attempt < maxRetries) {
        const errorBody = await response.text().catch(() => '');
        console.warn(
          `[Custom API Retry] Attempt ${attempt + 1} got ${response.status}, retrying in 2s...`,
          errorBody.slice(0, 100),
        );

        // Wait 2 seconds before retrying (don't consume the body yet)
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }

      return response;
    } catch (error: unknown) {
      clearTimeout(timeoutId);

      // Don't retry on abort (timeout) - throw immediately
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error;
      }

      // Network errors: retry once if we have retries left
      if (attempt < maxRetries) {
        const msg = error instanceof Error ? error.message : '';
        console.warn(`[Custom API Retry] Attempt ${attempt + 1} network error: ${msg}, retrying in 2s...`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }

      throw error;
    }
  }

  // Should never reach here, but TypeScript needs it
  throw new Error('Max retries exceeded');
}

/**
 * Parse error response from custom API, detecting HTML pages (Cloudflare etc.)
 * and returning user-friendly messages.
 */
export function parseCustomApiError(status: number, rawBody: string): string {
  const trimmed = rawBody.trim();

  // Detect HTML error pages (Cloudflare, nginx, etc.)
  if (trimmed.startsWith('<!') || trimmed.startsWith('<html') || trimmed.startsWith('<HTML')) {
    // Try to extract the Cloudflare ray ID for debugging
    const rayIdMatch = rawBody.match(/cf-ray[_-]id?[:\s]*([a-f0-9]+)/i) ||
                       rawBody.match(/Ray ID[:\s]*([a-f0-9]+)/i);
    const rayId = rayIdMatch ? ` (CF-Ray: ${rayIdMatch[1]})` : '';

    const htmlMessages: Record<number, string> = {
      400: `请求格式错误 (400)${rayId}。请检查 API 地址和请求参数是否正确`,
      403: `访问被拒绝 (403 Forbidden)${rayId}。可能原因：①API 代理防火墙拦截了服务器请求 ②IP 被封禁 ③需要特定 Referer/Origin 头`,
      502: `API 网关错误 (502 Bad Gateway)${rayId}。可能原因：①API 服务端宕机或未启动 ②代理（如 Cloudflare）无法连接后端 ③代理防火墙拦截了服务器 IP`,
      503: `API 服务不可用 (503)${rayId}。可能原因：①API 服务维护中 ②请求过载 ③代理限制了服务器 IP 访问`,
      504: `API 网关超时 (504)${rayId}。可能原因：①API 服务响应过慢 ②代理超时 ③网络不稳定`,
      429: `请求频率超限 (429)${rayId}。请稍后重试`,
    };
    return htmlMessages[status] || `API 返回 HTTP ${status} 错误页面${rayId}。可能原因：API 服务异常或代理防火墙拦截`;
  }

  // Try to parse JSON error
  try {
    const errorData = JSON.parse(rawBody);
    if (errorData.error) {
      if (typeof errorData.error === 'string') {
        return errorData.error;
      }
      if (errorData.error.message) {
        return errorData.error.message;
      }
    }
    if (errorData.message) {
      return errorData.message;
    }
  } catch {
    // Not JSON
  }

  // Plain text error - truncate
  if (rawBody.length > 200) {
    return rawBody.slice(0, 200) + '...';
  }
  return rawBody || `HTTP ${status}`;
}
