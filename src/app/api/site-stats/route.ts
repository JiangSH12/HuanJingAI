import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * GET /api/site-stats — get site statistics (public)
 * POST /api/site-stats — increment visit count (called on page load)
 */
export async function GET() {
  let supabase;
  try {
    supabase = getSupabaseClient();
  } catch {
    // Demo mode
    return NextResponse.json({ totalVisits: 0, demo: true });
  }

  const { data, error } = await supabase
    .from('site_stats')
    .select('total_visits')
    .eq('id', 1)
    .single();

  if (error) {
    console.error('[site-stats] GET error:', error);
    return NextResponse.json({ totalVisits: 0 });
  }

  return NextResponse.json({ totalVisits: data?.total_visits || 0 });
}

export async function POST(request: NextRequest) {
  let supabase;
  try {
    supabase = getSupabaseClient();
  } catch {
    // Demo mode — can't track
    return NextResponse.json({ totalVisits: 0, demo: true });
  }

  // Use SQL function to atomically increment
  const { data, error } = await supabase.rpc('increment_visits');

  if (error) {
    // Fallback: manual increment
    const { data: current } = await supabase
      .from('site_stats')
      .select('total_visits')
      .eq('id', 1)
      .single();

    const newCount = (current?.total_visits || 0) + 1;
    await supabase
      .from('site_stats')
      .update({ total_visits: newCount, updated_at: new Date().toISOString() })
      .eq('id', 1);

    return NextResponse.json({ totalVisits: newCount });
  }

  return NextResponse.json({ totalVisits: data });
}
