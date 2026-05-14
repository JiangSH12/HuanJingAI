import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    const userEmail = request.nextUrl.searchParams.get('email');

    let supabase;
    try {
      supabase = getSupabaseClient();
    } catch {
      // Demo mode: infer profile from email
      const email = userEmail || 'user@demo.ai';
      const isAdmin = email.toLowerCase().includes('admin');
      const isVip = email.toLowerCase().includes('vip');

      const profile = {
        nickname: isAdmin ? '管理员' : isVip ? 'VIP用户' : email.split('@')[0],
        email,
        phone: null,
        role: isAdmin ? 'admin' : isVip ? 'vip' : 'user',
        membership_tier: isAdmin ? 'enterprise' : isVip ? 'pro' : 'free',
        credits_balance: isAdmin ? 9999 : isVip ? 200 : 10,
        daily_quota_used: isAdmin ? 0 : isVip ? 5 : 2,
        daily_quota_limit: isAdmin ? 999 : isVip ? 50 : 5,
        created_at: '2024-01-15',
        avatar_url: null,
      };

      return NextResponse.json({ profile });
    }

    // Production: query Supabase
    let query = supabase.from('profiles').select('*');

    if (userId) {
      query = query.eq('id', userId);
    } else if (userEmail) {
      query = query.eq('email', userEmail);
    } else {
      return NextResponse.json({ error: '缺少用户标识' }, { status: 400 });
    }

    const { data, error } = await query.single();

    if (error || !data) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    return NextResponse.json({ profile: data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '获取用户信息失败';
    console.error('[Profile Error]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, nickname, phone } = body;

    let supabase;
    try {
      supabase = getSupabaseClient();
    } catch {
      // Demo mode
      return NextResponse.json({
        success: true,
        profile: { nickname, phone },
      });
    }

    const updateData: Record<string, unknown> = {};
    if (nickname !== undefined) updateData.nickname = nickname;
    if (phone !== undefined) updateData.phone = phone;
    updateData.updated_at = new Date().toISOString();

    const { error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, profile: updateData });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '更新用户信息失败';
    console.error('[Profile Update Error]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
