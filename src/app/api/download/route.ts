import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const weekParam = searchParams.get('week') || '';
    const indicesParam = searchParams.get('indices') || '';
    const groupIdParam = searchParams.get('groupId') || '';

    const host = req.headers.get('host') || 'localhost:3000';
    const protocol = req.url.startsWith('https') ? 'https' : 'http';
    const cronSecret = process.env.CRON_SECRET || '';

    // Securely invoke /api/cron/generate on the server-side by appending the secret
    let generateUrl = `${protocol}://${host}/api/cron/generate?secret=${cronSecret}&week=${weekParam}`;
    if (indicesParam) {
      generateUrl += `&indices=${indicesParam}`;
    }

    const generateRes = await fetch(generateUrl);
    
    if (!generateRes.ok) {
      const errMsg = await generateRes.text();
      return NextResponse.json({ error: `PPTX generation failed: ${errMsg}` }, { status: generateRes.status });
    }

    // Resolve group name for the filename
    let groupName = 'หบอว-ธ.';
    if (groupIdParam && groupIdParam !== 'all') {
      if (groupIdParam === 'private') {
        groupName = 'แชทส่วนตัว';
      } else {
        try {
          const groupDoc = await db.collection('line_groups').doc(groupIdParam).get();
          const groupData = groupDoc.data();
          if (groupDoc.exists && groupData && groupData.groupName) {
            groupName = groupData.groupName;
          }
        } catch (err) {
          console.error('Error fetching group name for download filename:', err);
        }
      }
    }

    const contentType = generateRes.headers.get('Content-Type') || 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    let weekNumber = weekParam;
    let year = '2026';
    if (weekParam.includes('-W')) {
      const parts = weekParam.split('-W');
      year = parts[0];
      weekNumber = parts[1];
    }
    const filename = `Weekly Report (${groupName}) (week ${weekNumber}-${year}).pptx`;
    const safeFilename = encodeURIComponent(filename);
    const contentDisposition = `attachment; filename*=UTF-8''${safeFilename}`;
    const contentLength = generateRes.headers.get('Content-Length');

    const buffer = await generateRes.arrayBuffer();

    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Content-Disposition', contentDisposition);
    headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    if (contentLength) {
      headers.set('Content-Length', contentLength);
    }

    return new Response(buffer, { headers });
  } catch (error: any) {
    console.error('Download proxy error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
