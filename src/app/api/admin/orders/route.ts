import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/admin/orders — list all orders (admin only)
export async function GET() {
  let supabase;
  try {
    supabase = getSupabaseClient();
  } catch {
    return NextResponse.json({ error: '数据库未配置，无法获取订单列表。请配置 COZE_SUPABASE_URL 等环境变量。' }, { status: 503 });
  }

  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('[admin/orders] GET error:', error);
    return NextResponse.json({ error: '获取订单列表失败' }, { status: 500 });
  }

  return NextResponse.json({ orders: data || [] });
}

// POST /api/admin/orders — create order
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    let supabase;
    try {
      supabase = getSupabaseClient();
    } catch {
      return NextResponse.json({ error: '数据库未配置' }, { status: 503 });
    }

    const { error } = await supabase
      .from('orders')
      .insert(body);

    if (error) {
      console.error('[admin/orders] POST error:', error);
      return NextResponse.json({ error: '创建订单失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[admin/orders] POST error:', err);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// PUT /api/admin/orders — update order
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderId, ...updates } = body;

    if (!orderId) {
      return NextResponse.json({ error: '缺少订单ID' }, { status: 400 });
    }

    let supabase;
    try {
      supabase = getSupabaseClient();
    } catch {
      return NextResponse.json({ error: '数据库未配置' }, { status: 503 });
    }

    const { error } = await supabase
      .from('orders')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', orderId);

    if (error) {
      console.error('[admin/orders] PUT error:', error);
      return NextResponse.json({ error: '更新订单失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[admin/orders] PUT error:', err);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
