import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * GET /api/admin/users — list ALL users (admin only)
 * Paginates through both profiles and auth.users to ensure completeness.
 */
export async function GET() {
  let supabase;
  try {
    supabase = getSupabaseClient(); // service role key — bypasses RLS
  } catch {
    return NextResponse.json({ error: '数据库未配置，无法获取用户列表。' }, { status: 503 });
  }

  try {
    // 1. Fetch ALL profiles (paginate to avoid limit)
    const allProfiles: Array<Record<string, unknown>> = [];
    let page = 0;
    const pageSize = 500;
    let hasMore = true;
    while (hasMore) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, nickname, role, membership_tier, credits_balance, daily_quota_limit, daily_quota_used, is_active, avatar_url, phone, created_at')
        .order('created_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (error) {
        console.error('[admin/users] GET profiles error:', error);
        break;
      }
      allProfiles.push(...(data || []));
      hasMore = (data || []).length === pageSize;
      page++;
    }

    // 2. Fetch ALL auth users (paginate to avoid limit)
    const allAuthUsers: Array<{ id: string; email?: string; created_at: string; user_metadata?: Record<string, unknown>; email_confirmed_at?: string | null }> = [];
    let authPage = 1;
    let authHasMore = true;
    while (authHasMore) {
      const { data, error } = await supabase.auth.admin.listUsers({
        page: authPage,
        perPage: 200,
      });
      if (error) {
        console.error('[admin/users] GET auth users error:', error);
        break;
      }
      allAuthUsers.push(...(data?.users || []));
      authHasMore = (data?.users || []).length === 200;
      authPage++;
    }

    // 3. Build an email map from auth.users for enrichment
    const authEmailMap = new Map<string, string>();
    const authConfirmedMap = new Map<string, boolean>();
    for (const u of allAuthUsers) {
      if (u.id && u.email) authEmailMap.set(u.id, u.email);
      authConfirmedMap.set(u.id, !!u.email_confirmed_at);
    }

    // 4. Enrich profiles with correct email from auth
    const enrichedProfiles = allProfiles.map(p => ({
      ...p,
      email: authEmailMap.get(p.id as string) || p.email || '',
      email_confirmed: authConfirmedMap.get(p.id as string) ?? true,
    }));

    // 5. Find auth users not in profiles and create synthetic entries
    const profileIds = new Set(allProfiles.map(p => p.id as string));
    const missingUsers = allAuthUsers
      .filter(u => !profileIds.has(u.id))
      .map(u => ({
        id: u.id,
        email: u.email || '',
        nickname: (u.user_metadata?.nickname as string) || (u.email || '').split('@')[0],
        role: 'user' as const,
        membership_tier: 'free' as const,
        credits_balance: 0,
        daily_quota_limit: 5,
        daily_quota_used: 0,
        is_active: true,
        avatar_url: null,
        phone: null,
        created_at: u.created_at,
        email_confirmed: !!u.email_confirmed_at,
      }));

    const allUsers = [...enrichedProfiles, ...missingUsers];

    return NextResponse.json({ users: allUsers, total: allUsers.length });
  } catch (err) {
    console.error('[admin/users] GET error:', err);
    return NextResponse.json({ error: '获取用户列表失败' }, { status: 500 });
  }
}

/**
 * PUT /api/admin/users — update user (admin only)
 * Supports: role, membership, credits, quota, status, nickname, phone, email, password reset
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, ...updates } = body;

    if (!userId) {
      return NextResponse.json({ error: '缺少用户ID' }, { status: 400 });
    }

    let supabase;
    try {
      supabase = getSupabaseClient();
    } catch {
      return NextResponse.json({ error: '数据库未配置' }, { status: 503 });
    }

    // --- Handle password reset separately ---
    if (updates.newPassword) {
      const { error: pwError } = await supabase.auth.admin.updateUserById(userId, {
        password: updates.newPassword,
      });
      if (pwError) {
        console.error('[admin/users] Password reset error:', pwError);
        return NextResponse.json({ error: '重置密码失败: ' + pwError.message }, { status: 500 });
      }
      // If only resetting password, return early
      if (Object.keys(updates).length === 1) {
        return NextResponse.json({ success: true, message: '密码已重置' });
      }
    }

    // --- Handle email update in auth.users ---
    if (updates.email) {
      const { error: emailError } = await supabase.auth.admin.updateUserById(userId, {
        email: updates.email,
        email_confirm: true, // auto-confirm the new email
      });
      if (emailError) {
        console.error('[admin/users] Email update error:', emailError);
        // Don't fail the whole request — just log
      }
    }

    // --- Update profiles table ---
    const supabaseUpdates: Record<string, unknown> = {};
    if (updates.role !== undefined) supabaseUpdates.role = updates.role;
    if (updates.membershipTier !== undefined) supabaseUpdates.membership_tier = updates.membershipTier;
    if (updates.membership_tier !== undefined) supabaseUpdates.membership_tier = updates.membership_tier;
    if (updates.creditsBalance !== undefined) supabaseUpdates.credits_balance = updates.creditsBalance;
    if (updates.credits_balance !== undefined) supabaseUpdates.credits_balance = updates.credits_balance;
    if (updates.dailyQuotaLimit !== undefined) supabaseUpdates.daily_quota_limit = updates.dailyQuotaLimit;
    if (updates.daily_quota_limit !== undefined) supabaseUpdates.daily_quota_limit = updates.daily_quota_limit;
    if (updates.dailyQuotaUsed !== undefined) supabaseUpdates.daily_quota_used = updates.dailyQuotaUsed;
    if (updates.daily_quota_used !== undefined) supabaseUpdates.daily_quota_used = updates.daily_quota_used;
    if (updates.status !== undefined) supabaseUpdates.is_active = updates.status !== 'suspended';
    if (updates.is_active !== undefined) supabaseUpdates.is_active = updates.is_active;
    if (updates.nickname !== undefined) supabaseUpdates.nickname = updates.nickname;
    if (updates.phone !== undefined) supabaseUpdates.phone = updates.phone;
    if (updates.email !== undefined) supabaseUpdates.email = updates.email;
    supabaseUpdates.updated_at = new Date().toISOString();

    // Only proceed if there are profile fields to update
    if (Object.keys(supabaseUpdates).length > 1) { // >1 because updated_at is always set
      // Check if profile exists for this user
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle();

      let error;
      if (existing) {
        ({ error } = await supabase
          .from('profiles')
          .update(supabaseUpdates)
          .eq('id', userId));
      } else {
        ({ error } = await supabase
          .from('profiles')
          .insert({
            id: userId,
            email: updates.email || '',
            nickname: updates.nickname || '新用户',
            ...supabaseUpdates,
          }));
      }

      if (error) {
        console.error('[admin/users] PUT error:', error);
        return NextResponse.json({ error: '更新用户信息失败' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[admin/users] PUT error:', err);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
