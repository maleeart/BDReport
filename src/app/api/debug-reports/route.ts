import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';

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

// Helper Date Functions (duplicated from api/reports/route.ts for timezone safety)
function getISOWeekString(date: Date): string {
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  const weekNum = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  const year = new Date(firstThursday).getFullYear();
  return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

function getPreviousISOWeekString(date: Date): string {
  const prevDate = new Date(date.getTime());
  prevDate.setDate(prevDate.getDate() - 7);
  return getISOWeekString(prevDate);
}

function getWeekRangeFromWeekStr(weekStr: string) {
  const [year, week] = weekStr.split('-W').map(Number);
  const simple = new Date(year, 0, 1 + (week - 1) * 7);
  const dayOfWeek = simple.getDay();
  const ISOweekStart = new Date(simple);
  if (dayOfWeek <= 4) {
    ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
  } else {
    ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
  }

  const monday = new Date(ISOweekStart);
  monday.setHours(-7, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 7);
  sunday.setMilliseconds(-1);

  return { start: monday, end: sunday };
}
