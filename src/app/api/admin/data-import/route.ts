import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import type { SupabaseClient } from '@supabase/supabase-js';

interface ImportMeta {
  version: string;
  platform: string;
  exported_at: string;
  tables: string[];
  counts: Record<string, number>;
}

interface ImportPayload {
  _meta: ImportMeta;
  data: Record<string, unknown[]>;
  options?: {
    overwrite?: boolean;
    skipAuth?: boolean;
  };
}

interface TableResult {
  imported: number;
  skipped: number;
  errors: string[];
}

/**
 * POST /api/admin/data-import — import platform data from JSON
 *
 * Import order matters due to foreign key constraints:
 * 1. site_config, site_stats, announcements (independent)
 * 2. auth_users → creates auth accounts
 * 3. profiles (depends on auth users)
 * 4. works (depends on profiles)
 * 5. credit_transactions, orders, user_api_keys (depend on profiles)
 * 6. work_likes (depends on works + profiles)
 */
export async function POST(request: NextRequest) {
  let supabase: SupabaseClient;
  try {
    supabase = getSupabaseClient();
  } catch {
    return NextResponse.json({ error: '数据库未配置' }, { status: 503 });
  }

  try {
    const body: ImportPayload = await request.json();
    const { _meta, data, options = {} } = body;

    if (!_meta || !_meta.platform || _meta.platform !== 'huanjing-aigc') {
      return NextResponse.json(
        { error: '无效的导入文件：格式不匹配（必须为幻境AIGC平台导出文件）' },
        { status: 400 }
      );
    }

    const result: Record<string, TableResult> = {};

    // --- Helper: upsert rows into a table ---
    async function upsertTable(
      table: string,
      rows: unknown[],
      uniqueKey: string = 'id'
    ): Promise<TableResult> {
      if (!rows || rows.length === 0) return { imported: 0, skipped: 0, errors: [] };

      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];

      // Process in batches of 50
      const batchSize = 50;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const { error } = await supabase
          .from(table)
          .upsert(batch, { onConflict: uniqueKey });

        if (error) {
          // Try inserting one by one to identify problematic rows
          for (const row of batch) {
            const { error: singleError } = await supabase
              .from(table)
              .upsert(row, { onConflict: uniqueKey });
            if (singleError) {
              skipped++;
              errors.push(`${table}: ${singleError.message}`);
            } else {
              imported++;
            }
          }
        } else {
          imported += batch.length;
        }
      }

      return { imported, skipped, errors };
    }

    // --- 1. Import site_config ---
    if (data.site_config?.length) {
      result.site_config = await upsertTable('site_config', data.site_config, 'id');
    }

    // --- 2. Import site_stats ---
    if (data.site_stats?.length) {
      result.site_stats = await upsertTable('site_stats', data.site_stats, 'id');
    }

    // --- 3. Import announcements ---
    if (data.announcements?.length) {
      result.announcements = await upsertTable('announcements', data.announcements, 'id');
    }

    // --- 4. Import auth users ---
    if (data.auth_users?.length && !options.skipAuth) {
      let authImported = 0;
      let authSkipped = 0;
      const authErrors: string[] = [];

      // Get existing auth users to avoid duplicates
      const existingAuthEmails = new Set<string>();
      let existingPage = 1;
      let existingHasMore = true;
      while (existingHasMore) {
        const { data: existingData } = await supabase.auth.admin.listUsers({
          page: existingPage,
          perPage: 200,
        });
        for (const u of existingData?.users || []) {
          if (u.email) existingAuthEmails.add(u.email);
        }
        existingHasMore = (existingData?.users || []).length === 200;
        existingPage++;
      }

      for (const rawAuthUser of data.auth_users) {
        const u = rawAuthUser as Record<string, unknown>;
        const email = u.email as string;
        const id = u.id as string;

        if (existingAuthEmails.has(email)) {
          // User already exists — update their metadata
          try {
            const { error: updateError } = await supabase.auth.admin.updateUserById(id, {
              email_confirm: true,
              user_metadata: u.user_metadata as Record<string, unknown>,
            });
            if (updateError) {
              authSkipped++;
              authErrors.push(`auth update ${email}: ${updateError.message}`);
            } else {
              authImported++;
            }
          } catch {
            authSkipped++;
            authErrors.push(`auth update ${email}: exception`);
          }
        } else {
          // Create new auth user with a temporary password
          try {
            const { error: createError } = await supabase.auth.admin.createUser({
              id,
              email,
              password: 'TempPass_' + Math.random().toString(36).slice(2, 10),
              email_confirm: true,
              user_metadata: u.user_metadata as Record<string, unknown>,
            });
            if (createError) {
              authSkipped++;
              authErrors.push(`auth create ${email}: ${createError.message}`);
            } else {
              authImported++;
            }
          } catch {
            authSkipped++;
            authErrors.push(`auth create ${email}: exception`);
          }
        }
      }

      result.auth_users = { imported: authImported, skipped: authSkipped, errors: authErrors };
    } else if (data.auth_users?.length && options.skipAuth) {
      result.auth_users = { imported: 0, skipped: data.auth_users.length, errors: ['跳过（选项）'] };
    }

    // --- 5. Import profiles ---
    if (data.profiles?.length) {
      result.profiles = await upsertTable('profiles', data.profiles, 'id');
    }

    // --- 6. Import works ---
    if (data.works?.length) {
      result.works = await upsertTable('works', data.works, 'id');
    }

    // --- 7. Import credit_transactions ---
    if (data.credit_transactions?.length) {
      result.credit_transactions = await upsertTable('credit_transactions', data.credit_transactions, 'id');
    }

    // --- 8. Import orders ---
    if (data.orders?.length) {
      result.orders = await upsertTable('orders', data.orders, 'id');
    }

    // --- 9. Import user_api_keys ---
    if (data.user_api_keys?.length) {
      result.user_api_keys = await upsertTable('user_api_keys', data.user_api_keys, 'id');
    }

    // --- 10. Import work_likes ---
    if (data.work_likes?.length) {
      result.work_likes = await upsertTable('work_likes', data.work_likes, 'id');
    }

    return NextResponse.json({
      success: true,
      message: '数据导入完成',
      details: result,
      meta: _meta,
    });
  } catch (err) {
    console.error('[data-import] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '导入失败' },
      { status: 500 }
    );
  }
}
