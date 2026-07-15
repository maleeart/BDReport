import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const weekParam = searchParams.get('week') || '';

    const host = req.headers.get('host') || 'localhost:3000';
    const protocol = req.url.startsWith('https') ? 'https' : 'http';
    const cronSecret = process.env.CRON_SECRET || '';

    // Securely invoke /api/cron/generate on the server-side by appending the secret
    const generateUrl = `${protocol}://${host}/api/cron/generate?secret=${cronSecret}&week=${weekParam}`;

    const generateRes = await fetch(generateUrl);
    
    if (!generateRes.ok) {
      const errMsg = await generateRes.text();
      return NextResponse.json({ error: `PPTX generation failed: ${errMsg}` }, { status: generateRes.status });
    }

    const contentType = generateRes.headers.get('Content-Type') || 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    const contentDisposition = generateRes.headers.get('Content-Disposition') || `attachment; filename="report-${weekParam}.pptx"`;
    const contentLength = generateRes.headers.get('Content-Length');

    const buffer = await generateRes.arrayBuffer();

    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Content-Disposition', contentDisposition);
    if (contentLength) {
      headers.set('Content-Length', contentLength);
    }

    return new Response(buffer, { headers });
  } catch (error: any) {
    console.error('Download proxy error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
