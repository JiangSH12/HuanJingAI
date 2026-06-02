import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * POST /api/gallery/publish — publish a work to the public gallery
 *
 * Saves the work to Supabase `works` table with is_public = true.
 * In Demo mode, returns 503 (cannot persist to database).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      userId,
      type,
      prompt,
      negativePrompt,
      resultUrl,
      thumbnailUrl,
      width,
      height,
      duration,
      params,
      model,
      modelLabel,
      creditsCost,
    } = body;

    if (!resultUrl) {
      return NextResponse.json({ error: '缺少作品 URL' }, { status: 400 });
    }

    let supabase;
    try {
      supabase = getSupabaseClient();
    } catch {
      // Demo mode — can't save to database, but return success so localStorage still works
      return NextResponse.json({ success: true, demo: true, message: 'Demo 模式下作品仅保存在本地' });
    }

    const workType = type === 'video' ? (body.referenceImage ? 'img2video' : 'text2video')
      : type === 'image' ? (body.referenceImage ? 'img2img' : 'text2img')
      : type;
    const resolvedThumbnailUrl = thumbnailUrl || (workType === 'text2img' || workType === 'img2img' ? resultUrl : body.referenceImage || null);

    // Validate userId is a valid UUID, otherwise use default system user UUID
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';
    const safeUserId = (userId && UUID_REGEX.test(userId)) ? userId : SYSTEM_USER_ID;

    const { data, error } = await supabase
      .from('works')
      .insert({
        user_id: safeUserId,
        type: workType,
        title: body.title || null,
        prompt: prompt || null,
        negative_prompt: negativePrompt || null,
        result_url: resultUrl,
        thumbnail_url: resolvedThumbnailUrl,
        width: width || null,
        height: height || null,
        duration: duration || null,
        is_public: true,
        likes_count: 0,
        credits_cost: creditsCost || 0,
        status: 'completed',
        params: {
          ...((params as Record<string, unknown>) || {}),
          model,
          modelLabel,
          referenceImage: body.referenceImage || undefined,
        },
      })
      .select('id')
      .single();

    if (error) {
      console.error('[gallery/publish] POST error:', error);
      return NextResponse.json({ error: '发布作品失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true, workId: data.id });
  } catch (err) {
    console.error('[gallery/publish] POST error:', err);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
