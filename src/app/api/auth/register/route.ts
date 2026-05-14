import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// Admin invitation code — set via env variable or fallback
const ADMIN_INVITE_CODE = process.env.ADMIN_INVITE_CODE || 'miaojing-admin-2024';

export async function POST(request: NextRequest) {
  try {
    const { email, password, nickname, phone, inviteCode } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: '请填写邮箱和密码' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: '密码至少6位' }, { status: 400 });
    }

    // Determine if this should be an admin registration
    const isAdminRegistration = inviteCode === ADMIN_INVITE_CODE;

    // Check if Supabase is configured
    let supabase;
    try {
      supabase = getSupabaseClient();
    } catch {
      // Demo mode — no Supabase configured
      const isAdmin = isAdminRegistration || email.toLowerCase().includes('admin');
      const isVip = email.toLowerCase().includes('vip');
      const role = isAdmin ? 'admin' : isVip ? 'vip' : 'user';

      return NextResponse.json({
        user: {
          id: `demo-${Date.now()}`,
          email,
          nickname: nickname || email.split('@')[0],
          role,
          membership_tier: isAdmin ? 'enterprise' : isVip ? 'pro' : 'free',
          credits_balance: isAdmin ? 9999 : isVip ? 200 : 10,
          daily_quota_used: 0,
          daily_quota_limit: isAdmin ? 999 : isVip ? 50 : 5,
          avatar_url: null,
        },
        message: '注册成功',
        demo: true,
      });
    }

    // If admin registration, check if any admin already exists
    if (isAdminRegistration) {
      const { data: existingAdmin } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'admin')
        .limit(1)
        .maybeSingle();

      if (existingAdmin) {
        return NextResponse.json(
          { error: '管理员账号已存在，如需重置请联系现有管理员' },
          { status: 400 }
        );
      }
    }

    // Production mode: register with Supabase
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          nickname: nickname || email.split('@')[0],
          phone: phone || null,
        },
      },
    });

    if (authError) {
      // Handle common registration errors
      const errMsg = authError.message || '';
      if (errMsg.includes('already registered') || errMsg.includes('already been registered')) {
        return NextResponse.json(
          { error: '该邮箱已注册，请直接登录' },
          { status: 400 }
        );
      }
      return NextResponse.json({ error: errMsg || '注册失败' }, { status: 400 });
    }

    // Create profile
    if (authData.user) {
      // Auto-confirm email using admin API (bypass email verification)
      // This prevents "Invalid login credentials" for newly registered users
      if (!authData.user.email_confirmed_at) {
        try {
          await supabase.auth.admin.updateUserById(
            authData.user.id,
            { email_confirm: true }
          );
        } catch (confirmErr) {
          console.warn('[Auto Confirm Email] Failed:', confirmErr);
        }
      }

      const role = isAdminRegistration ? 'admin' : 'user';
      const membershipTier = isAdminRegistration ? 'enterprise' : 'free';
      const creditsBalance = isAdminRegistration ? 9999 : 10;
      const dailyQuotaLimit = isAdminRegistration ? 999 : 5;

      const { error: profileError } = await supabase.from('profiles').insert({
        id: authData.user.id,
        email,
        nickname: nickname || email.split('@')[0],
        phone: phone || null,
        role,
        membership_tier: membershipTier,
        credits_balance: creditsBalance,
        daily_quota_used: 0,
        daily_quota_limit: dailyQuotaLimit,
      });

      if (profileError) {
        console.error('[Profile Creation Error]', profileError.message);
      }

      // Record welcome bonus
      try {
        await supabase.from('credit_transactions').insert({
          user_id: authData.user.id,
          amount: creditsBalance,
          balance_after: creditsBalance,
          type: 'gift',
          description: isAdminRegistration ? '管理员初始积分' : '新用户注册奖励',
        });
      } catch {
        // Ignore credit transaction errors
      }
    }

    const resultRole = isAdminRegistration ? 'admin' : 'user';
    return NextResponse.json({
      user: {
        id: authData.user?.id,
        email: authData.user?.email,
        nickname: nickname || email.split('@')[0],
        role: resultRole,
        membership_tier: isAdminRegistration ? 'enterprise' : 'free',
        credits_balance: isAdminRegistration ? 9999 : 10,
        daily_quota_used: 0,
        daily_quota_limit: isAdminRegistration ? 999 : 5,
        avatar_url: null,
      },
      message: isAdminRegistration ? '管理员账号注册成功' : '注册成功',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '注册失败';
    console.error('[Register Error]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
