import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    if (!db) {
      return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });
    }

    const groupId = 'Ce96900ec1b6844a7bb4ca679d1cf4eba';
    
    // Fetch last 15 reports for this group by querying the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const reportsSnapshot = await db.collection('line_reports')
      .where('groupId', '==', groupId)
      .where('createdAt', '>=', sevenDaysAgo)
      .get();

    let reports = reportsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        userName: data.userName,
        createdAt: data.createdAt ? new Date(data.createdAt.seconds * 1000).toISOString() : null,
        createdSeconds: data.createdAt ? data.createdAt.seconds : 0,
        content: data.content
      };
    });

    reports.sort((a, b) => b.createdSeconds - a.createdSeconds);

    // Get the last 10 reports overall in the system (fast query using index on createdAt)
    const allSnapshot = await db.collection('line_reports')
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();

    const allReports = allSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        groupId: data.groupId,
        userName: data.userName,
        createdAt: data.createdAt ? new Date(data.createdAt.seconds * 1000).toISOString() : null,
        content: data.content
      };
    });

    return NextResponse.json({
      groupName: "งานอาคารและบริเวณ",
      reportsInLast7Days: reports.length,
      reports,
      allReportsInSystem: allReports
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
