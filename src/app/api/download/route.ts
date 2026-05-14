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

  // Only allow http/https URLs
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return NextResponse.json({ error: '仅支持 HTTP(S) URL' }, { status: 400 });
  }

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(60_000), // 60s timeout
      redirect: 'follow',
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `远程文件获取失败: ${response.status}` },
        { status: response.status }
      );
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const body = await response.arrayBuffer();

    // Determine file extension from content type
    let ext = '';
    if (contentType.includes('png')) ext = '.png';
    else if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = '.jpg';
    else if (contentType.includes('webp')) ext = '.webp';
    else if (contentType.includes('mp4')) ext = '.mp4';
    else if (contentType.includes('webm')) ext = '.webm';
    else if (contentType.includes('gif')) ext = '.gif';

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}${ext}"`,
        'Content-Length': String(body.byteLength),
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '下载失败';
    console.error('[Download Proxy Error]', msg);
    return NextResponse.json({ error: `下载失败: ${msg}` }, { status: 502 });
  }
}
