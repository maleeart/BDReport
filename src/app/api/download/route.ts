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

    // If indicesParam is not provided, automatically filter by active keyword groups
    let finalIndicesParam = indicesParam;
    if (!indicesParam) {
      try {
        const reportsRes = await fetch(`${protocol}://${host}/api/reports?week=${weekParam}`);
        if (reportsRes.ok) {
          const reportData = await reportsRes.json();
          const allReports: any[] = reportData.reports || [];
          
          // Fetch keyword groups from DB
          const kwSnapshot = await db.collection('keyword_groups').get();
          let activeKeywords: string[] = [];
          if (!kwSnapshot.empty) {
            activeKeywords = kwSnapshot.docs.flatMap(doc => doc.data().keywords || []);
          } else {
            // Fallback to default keywords if DB is empty
            activeKeywords = ['งาน', 'ใบงาน', 'ซ่อม', 'ใบแจ้งซ่อม', 'เลขที่', 'เปลี่ยน', 'ตรวจ', 'สำรวจ', 'test', 'ทดสอบ', 'ท.', 'ต.', 'ล้าง', 'PM', 'ประจำ', 'เดือน', 'สัปดาห์', 'อาทิตย์'];
          }

          // Filter reports list by groupId if groupIdParam is provided and not 'all'
          let filteredReports = allReports;
          if (groupIdParam && groupIdParam !== 'all') {
            const mainGroupId = allReports.length > 0 ? (allReports.find(r => r.groupId && r.groupId !== 'private' && !r.groupId.startsWith('private_'))?.groupId || 'EGAT_IOT') : 'EGAT_IOT';
            filteredReports = filteredReports.filter(r => {
              if (r.groupId === groupIdParam) return true;
              if ((groupIdParam === mainGroupId || groupIdParam === 'EGAT_IOT' || groupIdParam.includes('อาคาร')) &&
                  (!r.groupId || r.groupId === 'private' || r.groupId.startsWith('private_'))) {
                return true;
              }
              return false;
            });
          }

          // Filter by active keywords
          filteredReports = filteredReports.filter(report => {
            const summary: string[] = report.summary || [];
            return summary.some((line: string) => 
              line !== 'ส่งเฉพาะรูปภาพประกอบ' && 
              line !== 'ไม่มีข้อความประกอบ' && 
              line !== 'ไม่มีรายงานข้อความ' &&
              activeKeywords.some((kw: string) => line.toLowerCase().includes(kw.toLowerCase()))
            );
          });

          // Find the indices of filteredReports in the original allReports list
          const matchingIndices = filteredReports
            .map(r => allReports.findIndex((orig: any) => orig.userId === r.userId && orig.sortTimestamp === r.sortTimestamp))
            .filter(idx => idx !== -1);

          finalIndicesParam = matchingIndices.join(',');
        }
      } catch (err) {
        console.error('Error auto-filtering download indices:', err);
      }
    }

    // Securely invoke /api/cron/generate on the server-side by appending the secret
    let generateUrl = `${protocol}://${host}/api/cron/generate?secret=${cronSecret}&week=${weekParam}`;
    if (groupIdParam) {
      generateUrl += `&groupId=${encodeURIComponent(groupIdParam)}`;
    }
    if (finalIndicesParam !== undefined && finalIndicesParam !== '') {
      generateUrl += `&indices=${finalIndicesParam}`;
    }

    const generateRes = await fetch(generateUrl);
    
    if (!generateRes.ok) {
      const errMsg = await generateRes.text();
      return NextResponse.json({ error: `PPTX generation failed: ${errMsg}` }, { status: generateRes.status });
    }

    // Resolve group name for the filename. Default to 'EGAT IOT' as clarified by the user.
    let groupName = 'EGAT IOT';

    // Find the first cached actual group name from firestore line_groups
    try {
      const groupsSnapshot = await db.collection('line_groups').get();
      const actualGroups = groupsSnapshot.docs
        .filter(doc => !doc.data()?.isHidden)
        .map(doc => doc.data()?.groupName)
        .filter(name => name && !name.startsWith('แชทส่วนตัว') && !name.startsWith('private') && !name.startsWith('กลุ่ม LINE'));
      
      if (actualGroups.length > 0) {
        groupName = actualGroups[0];
      }
    } catch (err) {
      console.error('Error looking up default group name:', err);
    }

    // If a specific actual group is selected, override with its name
    if (groupIdParam && groupIdParam !== 'all' && !groupIdParam.startsWith('private_')) {
      try {
        const groupDoc = await db.collection('line_groups').doc(groupIdParam).get();
        const groupData = groupDoc.data();
        if (groupDoc.exists && groupData && groupData.groupName) {
          groupName = groupData.groupName;
        }
      } catch (err) {
        console.error('Error fetching selected group name for filename:', err);
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
