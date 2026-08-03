import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { getPreviousISOWeekString, getWeekRangeFromWeekStr } from '@/lib/dateUtils';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    if (!db) {
      return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });
    }

    const previousWeek = getPreviousISOWeekString(new Date());
    const range = getWeekRangeFromWeekStr(previousWeek);

    const reportsSnapshot = await db.collection('line_reports')
      .where('createdAt', '>=', range.start)
      .where('createdAt', '<=', range.end)
      .get();

    const reports = reportsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        groupId: data.groupId,
        userName: data.userName,
        createdAt: data.createdAt,
        content: data.content
      };
    });

    // Group counts
    const counts: Record<string, number> = {};
    reports.forEach(r => {
      const g = r.groupId || 'no-group';
      counts[g] = (counts[g] || 0) + 1;
    });

    return NextResponse.json({
      week: previousWeek,
      range,
      totalReports: reports.length,
      counts,
      reports
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
