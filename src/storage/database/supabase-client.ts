import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client for the Huanjing AIGC Platform.
 *
 * Required environment variables:
 * - SUPABASE_URL: Supabase project URL
 * - SUPABASE_ANON_KEY: Supabase anon/public key
 * - SUPABASE_SERVICE_ROLE_KEY: Supabase service role key (optional, for admin operations)
 *
 * If SUPABASE_URL is not set, getSupabaseClient() will throw,
 * and callers should fall back to demo mode.
 */

// Lazy-load dotenv only if available (development convenience)
let dotenvLoaded = false;
function loadDotenv(): void {
  if (dotenvLoaded) return;
  dotenvLoaded = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('dotenv').config();
  } catch {
    // dotenv not installed — env vars must be set externally
  }
}

function getSupabaseUrl(): string {
  loadDotenv();
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error('SUPABASE_URL is not set');
  return url;
}

function getSupabaseAnonKey(): string {
  loadDotenv();
  const key = process.env.SUPABASE_ANON_KEY;
  if (!key) throw new Error('SUPABASE_ANON_KEY is not set');
  return key;
}

function getSupabaseServiceRoleKey(): string | undefined {
  loadDotenv();
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}

/**
 * Get a Supabase client instance.
 *
 * @param token - Optional user JWT token for authenticated requests.
 *                When provided, uses anon key + Authorization header.
 *                When omitted, uses service role key (if available) or anon key.
 * @throws Error if SUPABASE_URL is not configured.
 */
function getSupabaseClient(token?: string): SupabaseClient {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();

  // Use service role key for server-side operations (no token = admin context)
  // Use anon key for user-context operations (with token)
  let key: string;
  if (token) {
    key = anonKey;
  } else {
    const serviceRoleKey = getSupabaseServiceRoleKey();
    key = serviceRoleKey ?? anonKey;
  }

  const globalOptions: Record<string, unknown> = {};
  if (token) {
    globalOptions.headers = { Authorization: `Bearer ${token}` };
  }

  return createClient(url, key, {
    global: globalOptions,
    db: {
      timeout: 60000,
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export { getSupabaseUrl, getSupabaseAnonKey, getSupabaseServiceRoleKey, getSupabaseClient };
