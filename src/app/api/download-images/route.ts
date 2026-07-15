import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import JSZip from 'jszip';

export const dynamic = 'force-dynamic';

function getWeekRangeBangkok(weekStr: string) {
  const [year, week] = weekStr.split('-W');
  const y = parseInt(year);
  const w = parseInt(week);

  // Find the first day of the year
  const simple = new Date(Date.UTC(y, 0, 1 + (w - 1) * 7));
  const dow = simple.getUTCDay();
  const ISOweekStart = simple;
  if (dow <= 4) {
    ISOweekStart.setUTCDate(simple.getUTCDate() - simple.getUTCDay() + 1);
  } else {
    ISOweekStart.setUTCDate(simple.getUTCDate() + 8 - simple.getUTCDay());
  }

  // Set start to Monday 00:00:00 Bangkok time (UTC+7, which is UTC Monday - 7 hours, i.e. Sunday 17:00:00 UTC)
  const monday = new Date(ISOweekStart);
  monday.setUTCHours(-7, 0, 0, 0);

  // Set end to Sunday 23:59:59 Bangkok time (UTC+7, which is UTC Sunday + 17 hours)
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 7);
  sunday.setUTCMilliseconds(-1);

  return { start: monday, end: sunday };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const weekParam = searchParams.get('week') || '';

    if (!weekParam) {
      return NextResponse.json({ error: 'Missing week parameter' }, { status: 400 });
    }

    const { start, end } = getWeekRangeBangkok(weekParam);

    // Fetch reports for that week range
    const snapshot = await db
      .collection('line_reports')
      .where('createdAt', '>=', start)
      .where('createdAt', '<=', end)
      .get();

    if (snapshot.empty) {
      return NextResponse.json({ error: 'No reports found for this week' }, { status: 404 });
    }

    // Filter documents that have images
    const images: { base64: string; name: string }[] = [];
    const nameCounts: Record<string, number> = {};

    // Sort documents chronologically
    const docs = snapshot.docs.map((doc: any) => doc.data());
    docs.sort((a: any, b: any) => (a.timestamp || 0) - (b.timestamp || 0));

    for (const doc of docs) {
      if (doc.type === 'image' && doc.base64Image) {
        const dateObj = doc.createdAt?.toDate ? doc.createdAt.toDate() : new Date(doc.createdAt || doc.timestamp);
        
        // Format Date/Time in Bangkok timezone for filename: YYYY-MM-DD_HH-mm
        const dateStr = dateObj.toLocaleDateString('th-TH', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          timeZone: 'Asia/Bangkok',
        }).replace(/\//g, '-');
        
        const timeStr = dateObj.toLocaleTimeString('th-TH', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: 'Asia/Bangkok',
        }).replace(/:/g, '-');

        const userIdShort = (doc.userId || 'unknown').substring(0, 6);
        const baseName = `${dateStr}_${timeStr}_${userIdShort}`;
        
        if (!nameCounts[baseName]) {
          nameCounts[baseName] = 0;
        }
        nameCounts[baseName]++;
        
        const fileName = nameCounts[baseName] > 1 
          ? `${baseName}_${nameCounts[baseName]}.png`
          : `${baseName}.png`;

        images.push({ base64: doc.base64Image, name: fileName });
      }
    }

    if (images.length === 0) {
      return NextResponse.json({ error: 'No images found in this week\'s reports' }, { status: 404 });
    }

    // Generate ZIP file using JSZip
    const zip = new JSZip();
    for (const img of images) {
      const headerIndex = img.base64.indexOf(',');
      const cleanBase64 = headerIndex !== -1 ? img.base64.substring(headerIndex + 1) : img.base64;
      zip.file(img.name, cleanBase64, { base64: true });
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    const headers = new Headers();
    headers.set('Content-Type', 'application/zip');
    headers.set('Content-Disposition', `attachment; filename="images_${weekParam}.zip"`);
    headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    return new Response(zipBuffer as any, { headers });
  } catch (error: any) {
    console.error('Download images ZIP error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
