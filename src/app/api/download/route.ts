import { NextRequest, NextResponse } from 'next/server';

/**
 * Download proxy — fetches a remote file server-side and returns it
 * with Content-Disposition to trigger browser download.
 * This bypasses CORS restrictions that prevent client-side fetch().
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  const filename = request.nextUrl.searchParams.get('filename') || 'download';

  if (!url) {
    return NextResponse.json({ error: '缺少 url 参数' }, { status: 400 });
  }

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return NextResponse.json({ error: '仅支持 HTTP(S) URL' }, { status: 400 });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Referer': request.nextUrl.origin,
      },
      cache: 'no-store',
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return NextResponse.json(
        { error: `远程文件获取失败: ${response.status}` },
        { status: response.status }
      );
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const body = await response.arrayBuffer();

    let ext = '';
    if (contentType.includes('png')) ext = '.png';
    else if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = '.jpg';
    else if (contentType.includes('webp')) ext = '.webp';
    else if (contentType.includes('mp4')) ext = '.mp4';
    else if (contentType.includes('webm')) ext = '.webm';
    else if (contentType.includes('gif')) ext = '.gif';

    const normalizedFilename = filename.includes('.') ? filename : `${filename}${ext}`;

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${normalizedFilename}"`,
        'Content-Length': String(body.byteLength),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const msg = err instanceof Error ? err.message : '下载失败';
    console.error('[Download Proxy Error]', msg, '| url =', url);
    return NextResponse.json({ error: `下载失败: ${msg}` }, { status: 502 });
  }
}
