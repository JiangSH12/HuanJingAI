import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

function detectWorkType(type: 'image' | 'video', referenceImage?: string): string {
  if (type === 'image') return referenceImage ? 'img2img' : 'text2img';
  return referenceImage ? 'img2video' : 'text2video';
}

function isValidUuid(value: string | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      userId?: string;
      type?: 'image' | 'video';
      prompt?: string;
      negativePrompt?: string;
      resultUrls?: string[];
      referenceImage?: string;
      params?: Record<string, unknown>;
      model?: string;
      modelLabel?: string;
      creditsCost?: number;
      duration?: number;
      width?: number;
      height?: number;
      title?: string;
    };

    if (!body.type || !Array.isArray(body.resultUrls) || body.resultUrls.length === 0) {
      return NextResponse.json({ error: '缺少必要作品数据' }, { status: 400 });
    }

    let supabase;
    try {
      supabase = getSupabaseClient();
    } catch {
      return NextResponse.json({ success: true, demo: true, message: 'Demo 模式下作品仅保存在本地' });
    }

    const safeUserId = isValidUuid(body.userId) ? body.userId : undefined;
    const workType = detectWorkType(body.type, body.referenceImage);

    const rows = body.resultUrls.map((url) => ({
      user_id: safeUserId,
      type: workType,
      title: body.title || null,
      prompt: body.prompt || null,
      negative_prompt: body.negativePrompt || null,
      result_url: url,
      thumbnail_url: body.type === 'image' ? url : null,
      width: body.width ?? null,
      height: body.height ?? null,
      duration: body.duration ?? null,
      is_public: false,
      likes_count: 0,
      credits_cost: body.creditsCost || 0,
      status: 'completed',
      params: {
        ...(body.params || {}),
        model: body.model,
        modelLabel: body.modelLabel,
        referenceImage: body.referenceImage || undefined,
      },
    }));

    const payload = safeUserId ? rows : rows.map(({ user_id, ...rest }) => rest);

    const { data, error } = await supabase
      .from('works')
      .insert(payload)
      .select('id,result_url');

    if (error) {
      console.error('[works/create] POST error:', error);
      return NextResponse.json({ error: '保存作品记录失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true, works: data });
  } catch (error) {
    console.error('[works/create] POST error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
