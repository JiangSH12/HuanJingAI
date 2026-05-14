import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import type { SupabaseClient, User } from '@supabase/supabase-js';

/**
 * GET /api/admin/data-export — export all platform data as JSON
 * Exports: profiles, works, credit_transactions, orders, user_api_keys,
 *          work_likes, site_config, announcements, site_stats, auth_users
 */
export async function GET() {
  let supabase: SupabaseClient;
  try {
    supabase = getSupabaseClient();
  } catch {
    return NextResponse.json({ error: '数据库未配置' }, { status: 503 });
  }

  try {
    const data: Record<string, unknown[]> = {};

    // --- Paginated table fetcher ---
    async function fetchAllRows(table: string, select: string): Promise<unknown[]> {
      const allRows: unknown[] = [];
      let page = 0;
      const pageSize = 500;
      let hasMore = true;
      while (hasMore) {
        const { data: rows, error } = await supabase
          .from(table)
          .select(select)
          .order('created_at', { ascending: true })
          .range(page * pageSize, (page + 1) * pageSize - 1);
        if (error) {
          console.error(`[data-export] Error fetching ${table}:`, error);
          break;
        }
        allRows.push(...(rows || []));
        hasMore = (rows || []).length === pageSize;
        page++;
      }
      return allRows;
    }

    // --- Fetch all data tables ---
    data.profiles = await fetchAllRows('profiles', '*');
    data.works = await fetchAllRows('works', '*');
    data.credit_transactions = await fetchAllRows('credit_transactions', '*');
    data.orders = await fetchAllRows('orders', '*');
    data.user_api_keys = await fetchAllRows('user_api_keys', '*');
    data.work_likes = await fetchAllRows('work_likes', '*');
    data.announcements = await fetchAllRows('announcements', '*');

    // site_config and site_stats are single-row tables
    const { data: siteConfigRows } = await supabase.from('site_config').select('*');
    data.site_config = siteConfigRows || [];

    const { data: siteStatsRows } = await supabase.from('site_stats').select('*');
    data.site_stats = siteStatsRows || [];

    // --- Fetch auth users ---
    const allAuthUsers: unknown[] = [];
    let authPage = 1;
    let authHasMore = true;
    while (authHasMore) {
      const { data: authData, error: authError } = await supabase.auth.admin.listUsers({
        page: authPage,
        perPage: 200,
      });
      if (authError) {
        console.error('[data-export] Error fetching auth users:', authError);
        break;
      }
      // Only export fields needed for recreation
      const cleanedUsers = (authData?.users || []).map((u: User) => ({
        id: u.id,
        email: u.email,
        email_confirmed_at: u.email_confirmed_at,
        phone: u.phone,
        created_at: u.created_at,
        user_metadata: u.user_metadata,
        app_metadata: u.app_metadata,
      }));
      allAuthUsers.push(...cleanedUsers);
      authHasMore = (authData?.users || []).length === 200;
      authPage++;
    }
    data.auth_users = allAuthUsers;

    // --- Build export package ---
    const exportData = {
      _meta: {
        version: '1.0',
        platform: 'miaojing',
        exported_at: new Date().toISOString(),
        tables: Object.keys(data),
        counts: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])),
      },
      data,
    };

    return NextResponse.json(exportData);
  } catch (err) {
    console.error('[data-export] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '导出失败' },
      { status: 500 }
    );
  }
}
