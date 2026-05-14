import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/announcements — public, returns active announcements
export async function GET() {
  let supabase;
  try {
    supabase = getSupabaseClient();
  } catch {
    // Demo mode: no announcements
    return NextResponse.json([]);
  }

  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[announcements] GET error:', error);
    return NextResponse.json([]);
  }

  return NextResponse.json(data || []);
}

// POST /api/announcements — create
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, content, startDate, endDate, enabled } = body;

    if (!title || !content || !startDate || !endDate) {
      return NextResponse.json({ error: '请填写完整公告信息' }, { status: 400 });
    }

    let supabase;
    try {
      supabase = getSupabaseClient();
    } catch {
      return NextResponse.json({ error: '数据库未配置，无法管理公告。请配置 COZE_SUPABASE_URL 等环境变量。' }, { status: 503 });
    }

    const id = `ann-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const { error } = await supabase
      .from('announcements')
      .insert({
        id,
        title,
        content,
        start_date: new Date(startDate).toISOString(),
        end_date: new Date(endDate).toISOString(),
        enabled: enabled !== false,
      });

    if (error) {
      console.error('[announcements] POST error:', error);
      return NextResponse.json({ error: '创建公告失败' }, { status: 500 });
    }

    return NextResponse.json({ id, success: true });
  } catch (err) {
    console.error('[announcements] POST error:', err);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// PUT /api/announcements — update
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, title, content, startDate, endDate, enabled } = body;

    if (!id) {
      return NextResponse.json({ error: '缺少公告ID' }, { status: 400 });
    }

    let supabase;
    try {
      supabase = getSupabaseClient();
    } catch {
      return NextResponse.json({ error: '数据库未配置' }, { status: 503 });
    }

    const updates: Record<string, unknown> = {};

    if (title !== undefined) updates.title = title;
    if (content !== undefined) updates.content = content;
    if (startDate !== undefined) updates.start_date = new Date(startDate).toISOString();
    if (endDate !== undefined) updates.end_date = new Date(endDate).toISOString();
    if (enabled !== undefined) updates.enabled = enabled;

    const { error } = await supabase
      .from('announcements')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('[announcements] PUT error:', error);
      return NextResponse.json({ error: '更新公告失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[announcements] PUT error:', err);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// DELETE /api/announcements
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: '缺少公告ID' }, { status: 400 });
    }

    let supabase;
    try {
      supabase = getSupabaseClient();
    } catch {
      return NextResponse.json({ error: '数据库未配置' }, { status: 503 });
    }

    const { error } = await supabase
      .from('announcements')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[announcements] DELETE error:', error);
      return NextResponse.json({ error: '删除公告失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[announcements] DELETE error:', err);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
