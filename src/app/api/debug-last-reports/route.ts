import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    if (!db) {
      return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });
    }

    const groupId = 'Ce96900ec1b6844a7bb4ca679d1cf4eba';
    
    // Fetch last 50 reports for this group without orderby to avoid missing index error
    const reportsSnapshot = await db.collection('line_reports')
      .where('groupId', '==', groupId)
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

    // Sort desc in memory
    reports.sort((a, b) => b.createdSeconds - a.createdSeconds);
    reports = reports.slice(0, 15);

    // Also get the last 5 reports overall in the system
    const allSnapshot = await db.collection('line_reports')
      .get();

    let allReports = allSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        groupId: data.groupId,
        userName: data.userName,
        createdAt: data.createdAt ? new Date(data.createdAt.seconds * 1000).toISOString() : null,
        createdSeconds: data.createdAt ? data.createdAt.seconds : 0,
        content: data.content
      };
    });

    allReports.sort((a, b) => b.createdSeconds - a.createdSeconds);
    allReports = allReports.slice(0, 10);

    return NextResponse.json({
      groupName: "งานอาคารและบริเวณ",
      reportsCount: reportsSnapshot.size,
      reports,
      allReports
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
