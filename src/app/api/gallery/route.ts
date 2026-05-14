import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * GET /api/gallery — fetch public works for the gallery
 *
 * All visitors (including non-logged-in users) can see public works.
 * In Demo mode (Supabase not configured), returns an empty array.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams;
  const type = url.get('type'); // image, video, or null (all)
  const limit = Math.min(parseInt(url.get('limit') || '50', 10), 100);
  const offset = parseInt(url.get('offset') || '0', 10);
  const sort = url.get('sort') || 'newest'; // newest | popular

  let supabase;
  try {
    supabase = getSupabaseClient(); // service role key — bypasses RLS for reading
  } catch {
    // Demo mode — no database, return empty
    return NextResponse.json({ works: [], total: 0, demo: true });
  }

  try {
    let query = supabase
      .from('works')
      .select('id, type, title, prompt, negative_prompt, result_url, thumbnail_url, width, height, duration, is_public, likes_count, credits_cost, status, created_at, user_id, params', { count: 'exact' })
      .eq('is_public', true)
      .eq('status', 'completed')
      .range(offset, offset + limit - 1);

    if (type === 'image') {
      query = query.in('type', ['text2img', 'img2img']);
    } else if (type === 'video') {
      query = query.in('type', ['text2video', 'img2video']);
    }

    if (sort === 'popular') {
      query = query.order('likes_count', { ascending: false });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[gallery] GET error:', error);
      return NextResponse.json({ error: '获取作品列表失败' }, { status: 500 });
    }

    // Fetch publisher nicknames for the works
    const userIds = [...new Set((data || []).map((w: Record<string, unknown>) => w.user_id as string))];
    const nicknameMap: Record<string, string> = {};

    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, nickname, email')
        .in('id', userIds);

      if (profiles) {
        for (const p of profiles) {
          nicknameMap[p.id as string] = (p.nickname as string) || ((p.email as string) || '').split('@')[0] || '匿名用户';
        }
      }
    }

    const works = (data || []).map((w: Record<string, unknown>) => ({
      id: w.id,
      type: w.type,
      title: w.title,
      prompt: w.prompt,
      negativePrompt: w.negative_prompt,
      url: w.result_url,
      thumbnailUrl: w.thumbnail_url,
      width: w.width,
      height: w.height,
      duration: w.duration,
      likes: w.likes_count || 0,
      creditsCost: w.credits_cost || 0,
      params: w.params || {},
      referenceImage: (w.params as Record<string, unknown>)?.referenceImage as string | undefined,
      publisherId: w.user_id,
      publisherNickname: nicknameMap[w.user_id as string] || '匿名用户',
      publishedAt: w.created_at,
    }));

    return NextResponse.json({ works, total: count || 0 });
  } catch (err) {
    console.error('[gallery] GET error:', err);
    return NextResponse.json({ error: '获取作品列表失败' }, { status: 500 });
  }
}
