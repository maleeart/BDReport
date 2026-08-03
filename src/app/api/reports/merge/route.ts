import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const adminPassword = req.headers.get('x-admin-password');
    if (adminPassword !== '8888') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { primary, secondaries } = body;

    if (!primary || !secondaries || !Array.isArray(secondaries) || secondaries.length === 0) {
      return NextResponse.json({ error: 'Invalid merge payload' }, { status: 400 });
    }

    if (!db) {
      return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });
    }

    const primaryDocId = `${primary.userId}_${primary.sortTimestamp}`;
    
    // Combine summaries and imageIds
    let combinedSummary = [...primary.summary];
    let combinedImageIds = [...(primary.imageIds || [])];

    secondaries.forEach((sec: any) => {
      combinedSummary = [...combinedSummary, ...sec.summary];
      combinedImageIds = [...combinedImageIds, ...(sec.imageIds || [])];
    });

    const batch = db.batch();

    // 1. Update primary report in edited_reports
    const primaryRef = db.collection('edited_reports').doc(primaryDocId);
    batch.set(primaryRef, {
      userId: primary.userId,
      timestamp: primary.sortTimestamp,
      editedSummary: combinedSummary,
      mergedImageIds: combinedImageIds,
      isMergedPrimary: true,
      mergedSecondaries: secondaries.map((sec: any) => `${sec.userId}_${sec.sortTimestamp}`),
      originalSummary: primary.originalSummary || primary.summary,
      updatedAt: new Date()
    }, { merge: true });

    // 2. Hide secondary reports in edited_reports
    secondaries.forEach((sec: any) => {
      const secDocId = `${sec.userId}_${sec.sortTimestamp}`;
      const secRef = db.collection('edited_reports').doc(secDocId);
      batch.set(secRef, {
        userId: sec.userId,
        timestamp: sec.sortTimestamp,
        isHidden: true,
        mergedInto: primaryDocId,
        updatedAt: new Date()
      }, { merge: true });
    });

    await batch.commit();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Merge API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
