import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

const DEFAULT_ADMIN_NICKNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_DEFAULT_PASSWORD || 'admin123';
const DEFAULT_ADMIN_EMAIL = 'admin@huanjing-aigc.local';

/**
 * GET /api/auth/admin-exists — check if any admin account exists
 * If no admin exists, auto-create the default admin account.
 * Returns: { exists: boolean, autoCreated?: boolean, nickname?: string, defaultPassword?: string }
 */
export async function GET() {
  let supabase;
  try {
    supabase = getSupabaseClient();
  } catch {
    // No Supabase — demo mode, treat as "admin exists"
    return NextResponse.json({ exists: true });
  }

  try {
    const { data: existingAdmin } = await supabase
      .from('profiles')
      .select('id, nickname')
      .eq('role', 'admin')
      .limit(1)
      .maybeSingle();

    if (existingAdmin) {
      return NextResponse.json({ exists: true, nickname: existingAdmin.nickname });
    }

    // No admin exists — auto-create the default admin account
    const result = await createDefaultAdmin(supabase);
    if (result.success) {
      return NextResponse.json({
        exists: true,
        autoCreated: true,
        nickname: DEFAULT_ADMIN_NICKNAME,
        defaultPassword: DEFAULT_ADMIN_PASSWORD,
      });
    }

    // Creation failed — still report as not existing
    return NextResponse.json({ exists: false });
  } catch (err) {
    console.error('[admin-exists] Error:', err);
    return NextResponse.json({ exists: false });
  }
}

/**
 * POST /api/auth/admin-exists — kept for backward compatibility
 * Creates the first admin account if none exists.
 * Body: { email?, password?, nickname? }
 */
export async function POST(request: NextRequest) {
  try {
    const { email, password, nickname } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: '请填写邮箱和密码' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: '密码至少6位' }, { status: 400 });
    }

    let supabase;
    try {
      supabase = getSupabaseClient();
    } catch {
      return NextResponse.json({ error: '数据库未配置，无法创建管理员' }, { status: 503 });
    }

    // Check if admin already exists
    const { data: existingAdmin } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .limit(1)
      .maybeSingle();

    if (existingAdmin) {
      return NextResponse.json({ error: '管理员账号已存在' }, { status: 400 });
    }

    // Create auth user with provided email
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          nickname: nickname || '管理员',
        },
      },
    });

    if (authError) {
      const errMsg = authError.message || '';
      if (errMsg.includes('already registered') || errMsg.includes('already been registered')) {
        // User exists in auth but not admin in profiles — promote them
        const { data: adminUsers } = await supabase.auth.admin.listUsers();
        const existingAuthUser = adminUsers?.users?.find(
          (u: { email?: string }) => u.email === email
        );
        if (existingAuthUser) {
          await supabase.auth.admin.updateUserById(existingAuthUser.id, { email_confirm: true });
          const { data: existingProfile } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', existingAuthUser.id)
            .maybeSingle();

          if (existingProfile) {
            await supabase.from('profiles').update({
              role: 'admin',
              membership_tier: 'enterprise',
              credits_balance: 9999,
              daily_quota_limit: 999,
              nickname: nickname || '管理员',
            }).eq('id', existingAuthUser.id);
          } else {
            await supabase.from('profiles').insert({
              id: existingAuthUser.id,
              email,
              nickname: nickname || '管理员',
              role: 'admin',
              membership_tier: 'enterprise',
              credits_balance: 9999,
              daily_quota_limit: 999,
              daily_quota_used: 0,
            });
          }

          return NextResponse.json({
            user: {
              id: existingAuthUser.id,
              email,
              nickname: nickname || '管理员',
              role: 'admin',
              membership_tier: 'enterprise',
              credits_balance: 9999,
              daily_quota_limit: 999,
              daily_quota_used: 0,
              avatar_url: null,
            },
            message: '管理员账号创建成功',
          });
        }
      }
      return NextResponse.json({ error: errMsg || '创建管理员失败' }, { status: 400 });
    }

    // Auto-confirm email
    if (authData.user && !authData.user.email_confirmed_at) {
      try {
        await supabase.auth.admin.updateUserById(authData.user.id, { email_confirm: true });
      } catch { /* non-critical */ }
    }

    // Create admin profile
    if (authData.user) {
      await supabase.from('profiles').insert({
        id: authData.user.id,
        email,
        nickname: nickname || '管理员',
        role: 'admin',
        membership_tier: 'enterprise',
        credits_balance: 9999,
        daily_quota_limit: 999,
        daily_quota_used: 0,
      });

      try {
        await supabase.from('credit_transactions').insert({
          user_id: authData.user.id,
          amount: 9999,
          balance_after: 9999,
          type: 'gift',
          description: '管理员初始积分',
        });
      } catch { /* non-critical */ }
    }

    return NextResponse.json({
      user: {
        id: authData.user?.id,
        email,
        nickname: nickname || '管理员',
        role: 'admin',
        membership_tier: 'enterprise',
        credits_balance: 9999,
        daily_quota_limit: 999,
        daily_quota_used: 0,
        avatar_url: null,
      },
      message: '管理员账号创建成功',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '创建管理员失败';
    console.error('[Admin Setup Error]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Auto-create the default admin account with nickname "admin"
 */
async function createDefaultAdmin(supabase: ReturnType<typeof getSupabaseClient>): Promise<{ success: boolean; error?: string }> {
  try {
    // First check if a user with this email already exists in auth
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingAuthUser = existingUsers?.users?.find(
      (u: { email?: string }) => u.email === DEFAULT_ADMIN_EMAIL
    );

    let userId: string;

    if (existingAuthUser) {
      // Email already in auth — just promote to admin
      userId = existingAuthUser.id;
      await supabase.auth.admin.updateUserById(userId, {
        email_confirm: true,
        password: DEFAULT_ADMIN_PASSWORD,
      });
    } else {
      // Create new auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: DEFAULT_ADMIN_EMAIL,
        password: DEFAULT_ADMIN_PASSWORD,
        options: {
          data: { nickname: DEFAULT_ADMIN_NICKNAME },
        },
      });

      if (authError) {
        console.error('[admin-exists] Auto-create admin auth error:', authError);
        return { success: false, error: authError.message };
      }

      if (!authData.user) {
        return { success: false, error: 'Failed to create admin auth user' };
      }

      userId = authData.user.id;

      // Auto-confirm email
      if (!authData.user.email_confirmed_at) {
        try {
          await supabase.auth.admin.updateUserById(userId, { email_confirm: true });
        } catch { /* non-critical */ }
      }
    }

    // Check if profile already exists
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (existingProfile) {
      // Update existing profile to admin
      await supabase.from('profiles').update({
        role: 'admin',
        nickname: DEFAULT_ADMIN_NICKNAME,
        membership_tier: 'enterprise',
        credits_balance: 9999,
        daily_quota_limit: 999,
      }).eq('id', userId);
    } else {
      // Create admin profile
      await supabase.from('profiles').insert({
        id: userId,
        email: DEFAULT_ADMIN_EMAIL,
        nickname: DEFAULT_ADMIN_NICKNAME,
        role: 'admin',
        membership_tier: 'enterprise',
        credits_balance: 9999,
        daily_quota_limit: 999,
        daily_quota_used: 0,
      });
    }

    // Record initial credits
    try {
      await supabase.from('credit_transactions').insert({
        user_id: userId,
        amount: 9999,
        balance_after: 9999,
        type: 'gift',
        description: '管理员初始积分',
      });
    } catch { /* non-critical */ }

    console.log('[admin-exists] Default admin account created: nickname=admin, password=***');
    return { success: true };
  } catch (err) {
    console.error('[admin-exists] Auto-create admin error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
