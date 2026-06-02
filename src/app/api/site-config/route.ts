import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// Ensure site-assets storage bucket exists
async function ensureBucket(supabase: ReturnType<typeof getSupabaseClient>) {
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some(b => b.name === 'site-assets');
  if (!exists) {
    await supabase.storage.createBucket('site-assets', { public: true });
  }
}

// GET /api/site-config — public, returns site branding config
export async function GET() {
  let supabase;
  try {
    supabase = getSupabaseClient();
  } catch {
    // Demo mode: return defaults
    return NextResponse.json({
      siteName: '幻境AIGC',
      siteTabTitle: '幻境AIGC',
      logoUrl: null,
      faviconUrl: null,
    });
  }

  const { data, error } = await supabase
    .from('site_config')
    .select('site_name, site_tab_title, logo_url, favicon_url')
    .eq('id', 1)
    .single();

  if (error || !data) {
    return NextResponse.json({
      siteName: '幻境AIGC',
      siteTabTitle: '幻境AIGC',
      logoUrl: null,
      faviconUrl: null,
    });
  }

  return NextResponse.json({
    siteName: data.site_name,
    siteTabTitle: data.site_tab_title,
    logoUrl: data.logo_url,
    faviconUrl: data.favicon_url,
  });
}

// PUT /api/site-config — admin only, updates site branding
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body) {
      return NextResponse.json({ error: '无效的请求体' }, { status: 400 });
    }

    const { siteName, siteTabTitle, logoBase64, faviconBase64 } = body as {
      siteName?: string;
      siteTabTitle?: string;
      logoBase64?: string;
      faviconBase64?: string;
    };

    let supabase;
    try {
      supabase = getSupabaseClient();
    } catch {
      return NextResponse.json({ error: '数据库未配置，无法保存网站设置。请配置 SUPABASE_URL 等环境变量。' }, { status: 503 });
    }

    await ensureBucket(supabase);

    const updates: Record<string, string | null> = {};

    if (typeof siteName === 'string') updates.site_name = siteName;
    if (typeof siteTabTitle === 'string') updates.site_tab_title = siteTabTitle;
    updates.updated_at = new Date().toISOString();

    // Upload logo if provided
    if (logoBase64) {
      const { buffer, contentType, ext } = base64ToBuffer(logoBase64);
      const filename = `logo.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('site-assets')
        .upload(filename, buffer, { contentType, upsert: true });

      if (uploadErr) {
        console.error('[site-config] Logo upload failed:', uploadErr);
        return NextResponse.json({ error: 'Logo 上传失败' }, { status: 500 });
      }

      const { data: urlData } = supabase.storage.from('site-assets').getPublicUrl(filename);
      updates.logo_url = urlData.publicUrl;
    }

    // Upload favicon if provided
    if (faviconBase64) {
      const { buffer, contentType, ext } = base64ToBuffer(faviconBase64);
      const filename = `favicon.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('site-assets')
        .upload(filename, buffer, { contentType, upsert: true });

      if (uploadErr) {
        console.error('[site-config] Favicon upload failed:', uploadErr);
        return NextResponse.json({ error: '图标上传失败' }, { status: 500 });
      }

      const { data: urlData } = supabase.storage.from('site-assets').getPublicUrl(filename);
      updates.favicon_url = urlData.publicUrl;
    }

    // Upsert the config row
    const { error: upsertErr } = await supabase
      .from('site_config')
      .upsert({ id: 1, ...updates }, { onConflict: 'id' });

    if (upsertErr) {
      console.error('[site-config] Upsert failed:', upsertErr);
      return NextResponse.json({ error: '保存配置失败' }, { status: 500 });
    }

    // Return updated config
    const { data } = await supabase
      .from('site_config')
      .select('site_name, site_tab_title, logo_url, favicon_url')
      .eq('id', 1)
      .single();

    return NextResponse.json({
      siteName: data?.site_name,
      siteTabTitle: data?.site_tab_title,
      logoUrl: data?.logo_url,
      faviconUrl: data?.favicon_url,
    });
  } catch (err) {
    console.error('[site-config] PUT error:', err);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

/** Convert a data URL (base64) to a Buffer + metadata */
function base64ToBuffer(dataUrl: string): { buffer: Buffer; contentType: string; ext: string } {
  const matches = dataUrl.match(/^data:(image\/[\w+.-]+);base64,(.+)$/);
  if (!matches) throw new Error('Invalid data URL');

  const contentType = matches[1];
  const base64 = matches[2];
  const ext = contentType.split('/')[1].replace('svg+xml', 'svg').replace('jpeg', 'jpg');

  return {
    buffer: Buffer.from(base64, 'base64'),
    contentType,
    ext,
  };
}
