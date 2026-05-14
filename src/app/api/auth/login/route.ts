import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * POST /api/auth/login
 *
 * Supports multiple login methods:
 * - email + password (standard)
 * - phone + password → looks up email from profiles
 * - username/account + password → looks up email from profiles
 * - admin account name + password → admin login
 *
 * Request body:
 *   { email?, account?, phone?, password }
 *   - account: can be email, phone, nickname, or admin account name
 *   - If both email and account are provided, account takes priority
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email: rawEmail, account, phone: rawPhone, password } = body;

    // Determine the account identifier
    const identifier = account || rawEmail || rawPhone;
    if (!identifier || !password) {
      return NextResponse.json({ error: '请填写账号和密码' }, { status: 400 });
    }

    // Check if Supabase is configured
    let supabase;
    try {
      supabase = getSupabaseClient();
    } catch {
      // Demo mode — no Supabase configured
      const isAccountAdmin = identifier.toLowerCase().includes('admin');
      const isVip = identifier.toLowerCase().includes('vip');

      const role = isAccountAdmin ? 'admin' : isVip ? 'vip' : 'user';
      const membershipTier = isAccountAdmin ? 'enterprise' : isVip ? 'pro' : 'free';
      const creditsBalance = isAccountAdmin ? 9999 : isVip ? 200 : 10;
      const dailyQuotaLimit = isAccountAdmin ? 999 : isVip ? 50 : 5;
      const nickname = isAccountAdmin ? '管理员' : isVip ? 'VIP用户' : identifier.split('@')[0];

      return NextResponse.json({
        user: {
          id: isAccountAdmin ? 'demo-admin-id' : isVip ? 'demo-vip-id' : `demo-${Date.now()}`,
          email: identifier.includes('@') ? identifier : `${identifier}@demo.local`,
          nickname,
          role,
          membership_tier: membershipTier,
          credits_balance: creditsBalance,
          daily_quota_limit: dailyQuotaLimit,
          daily_quota_used: 0,
          avatar_url: null,
        },
        session: { access_token: `demo-token-${role}-${Date.now()}` },
        demo: true,
      });
    }

    // --- Production mode: resolve email from identifier ---

    const isEmailFormat = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
    const isPhoneFormat = /^1[3-9]\d{9}$/.test(identifier);

    let loginEmail = identifier;

    if (!isEmailFormat) {
      // Not an email — look up email from profiles table
      // Could be phone, nickname, or admin account name
      const { data: profileMatch } = await supabase
        .from('profiles')
        .select('id, email, nickname, phone, role')
        .or(`nickname.eq.${identifier},phone.eq.${identifier}`)
        .limit(1)
        .maybeSingle();

      if (profileMatch?.email) {
        loginEmail = profileMatch.email;
      } else {
        // No profile found — user doesn't exist
        return NextResponse.json(
          { error: '账号不存在，请检查输入或先注册' },
          { status: 401 }
        );
      }
    }

    // Authenticate with Supabase
    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password,
    });

    if (error) {
      // Provide friendlier error messages
      const errMsg = error.message || '';

      if (errMsg.includes('Invalid login credentials')) {
        // Check if the user exists but email is not confirmed
        const { data: existingUser } = await supabase
          .from('profiles')
          .select('id, email, nickname')
          .eq('email', loginEmail)
          .maybeSingle();

        if (existingUser) {
          // User exists in profiles — might be unconfirmed email
          // Try to check if the user exists in auth
          const { data: adminUsers } = await supabase.auth.admin.listUsers();
          const authUser = adminUsers?.users?.find(
            (u: { email?: string }) => u.email === loginEmail
          );

          if (authUser && !authUser.email_confirmed_at) {
            // Auto-confirm the email so the user can login
            try {
              await supabase.auth.admin.updateUserById(authUser.id, { email_confirm: true });
              // Retry login after confirmation
              const retryResult = await supabase.auth.signInWithPassword({
                email: loginEmail,
                password,
              });
              if (retryResult.data?.user && !retryResult.error) {
                // Login succeeded after auto-confirmation
                const { data: retryProfile } = await supabase
                  .from('profiles')
                  .select('nickname, role, membership_tier, credits_balance, daily_quota_used, daily_quota_limit, avatar_url, phone, created_at')
                  .eq('id', retryResult.data.user.id)
                  .single();

                const rp: Record<string, unknown> = retryProfile || {};
                return NextResponse.json({
                  user: {
                    id: retryResult.data.user.id,
                    email: retryResult.data.user.email,
                    nickname: (rp.nickname as string) || retryResult.data.user.user_metadata?.nickname || (loginEmail as string).split('@')[0],
                    role: (rp.role as string) || 'user',
                    membership_tier: (rp.membership_tier as string) || 'free',
                    credits_balance: (rp.credits_balance as number) ?? 0,
                    daily_quota_used: (rp.daily_quota_used as number) ?? 0,
                    daily_quota_limit: (rp.daily_quota_limit as number) ?? 5,
                    avatar_url: (rp.avatar_url as string) || null,
                    phone: (rp.phone as string) || null,
                    created_at: (rp.created_at as string) || null,
                  },
                  session: retryResult.data.session,
                });
              }
            } catch {
              // Auto-confirm failed, show message
            }

            return NextResponse.json(
              { error: '邮箱尚未验证，请查收验证邮件后重试，或联系管理员' },
              { status: 401 }
            );
          }
        }

        return NextResponse.json(
          { error: '账号或密码错误，请重新输入' },
          { status: 401 }
        );
      }

      return NextResponse.json({ error: errMsg || '登录失败' }, { status: 401 });
    }

    // Fetch user profile for role/credits info
    const { data: profile } = await supabase
      .from('profiles')
      .select('nickname, role, membership_tier, credits_balance, daily_quota_used, daily_quota_limit, avatar_url, phone, created_at')
      .eq('id', data.user.id)
      .single();

    const userProfile: Record<string, unknown> = profile || {};

    return NextResponse.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        nickname: (userProfile.nickname as string) || data.user.user_metadata?.nickname || (loginEmail as string).split('@')[0],
        role: (userProfile.role as string) || 'user',
        membership_tier: (userProfile.membership_tier as string) || 'free',
        credits_balance: (userProfile.credits_balance as number) ?? 0,
        daily_quota_used: (userProfile.daily_quota_used as number) ?? 0,
        daily_quota_limit: (userProfile.daily_quota_limit as number) ?? 5,
        avatar_url: (userProfile.avatar_url as string) || null,
        phone: (userProfile.phone as string) || null,
        created_at: (userProfile.created_at as string) || null,
      },
      session: data.session,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '登录失败';
    console.error('[Login Error]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
