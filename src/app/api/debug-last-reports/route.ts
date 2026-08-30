import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    if (!db) {
      return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });
    }

    const groupId = 'Ce96900ec1b6844a7bb4ca679d1cf4eba';
    
    // Fetch last 150 reports overall (using native single-field index on createdAt)
    const allSnapshot = await db.collection('line_reports')
      .orderBy('createdAt', 'desc')
      .limit(150)
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

    // Filter for our target group in memory
    const groupReports = allReports.filter(r => r.groupId === groupId);

    return NextResponse.json({
      groupName: "งานอาคารและบริเวณ",
      scannedReportsCount: allReports.length,
      matchingGroupReportsCount: groupReports.length,
      groupReports,
      latestReportsInSystem: allReports.slice(0, 15)
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
