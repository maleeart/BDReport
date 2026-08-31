import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    if (!db) {
      return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });
    }

    const userId = 'Ud6e9a1c7375b84ad1b8aa877b83981ab';
    
    // Fetch all reports in Week 35 (Monday Aug 24 - Sunday Aug 30) using only single-field index on createdAt
    const monday = new Date('2026-08-23T17:00:00Z');
    const sunday = new Date('2026-08-30T16:59:59.999Z');

    const snapshot = await db.collection('line_reports')
      .where('createdAt', '>=', monday)
      .where('createdAt', '<=', sunday)
      .get();

    // Filter by userId in memory to avoid composite index requirement
    const allReports = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId,
        groupId: data.groupId,
        type: data.type,
        content: data.content || null,
        timestamp: data.timestamp,
        createdAt: data.createdAt ? new Date(data.createdAt.seconds * 1000).toISOString() : null
      };
    });

    const reports = allReports.filter(r => r.userId === userId);

    // Sort chronologically
    reports.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    // Let's run the exact clustering logic from reports/route.ts
    const taskGroups: any[][] = [];
    let currentGroup: any[] = [];

    for (const report of reports) {
      if (currentGroup.length === 0) {
        currentGroup.push(report);
      } else {
        const lastReport = currentGroup[currentGroup.length - 1];
        const timeDiff = Math.abs((report.timestamp || 0) - (lastReport.timestamp || 0));

        const hasText = currentGroup.some(r => r.type === 'text');
        const hasImage = currentGroup.some(r => r.type === 'image');
        const isCompleteJob = hasText && hasImage;

        const isTimeGapLarge = timeDiff > 300000;
        const isSecondText = report.type === 'text' && hasText;

        const shouldSplit = (isTimeGapLarge && isCompleteJob) || isSecondText;

        if (shouldSplit) {
          taskGroups.push(currentGroup);
          currentGroup = [report];
        } else {
          currentGroup.push(report);
        }
      }
    }
    if (currentGroup.length > 0) {
      taskGroups.push(currentGroup);
    }

    const processedReports = taskGroups.map(group => {
      const textReports = group
        .filter((r) => r.type === 'text')
        .map((r) => r.content)
        .join('\n');

      const imageReports = group.filter((r) => r.type === 'image');
      
      let summary = textReports
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

      if (summary.length === 0) {
        summary = imageReports.length > 0 ? ['ไม่มีข้อความประกอบ'] : ['ไม่มีรายงานข้อความ'];
      }

      const rep = group[0];
      const repDate = rep.createdAt ? new Date(rep.createdAt) : new Date(rep.timestamp);

      return {
        repId: rep.id,
        date: repDate.toISOString(),
        summary,
        imagesCount: imageReports.length,
        groupId: rep.groupId
      };
    });

    return NextResponse.json({
      totalScannedReportsInWeek35: allReports.length,
      reportsCount: reports.length,
      reports,
      taskGroupsCount: taskGroups.length,
      processedReports
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
