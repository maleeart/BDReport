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
    const { userId, timestamp, editedSummary, originalSummary } = body;

    if (!userId || !timestamp) {
      return NextResponse.json({ error: 'Missing userId or timestamp' }, { status: 400 });
    }

    const docId = `${userId}_${timestamp}`;

    if (editedSummary === null) {
      // Revert: Check if this was a merged primary report
      if (!db) {
        return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });
      }
      
      const docRef = db.collection('edited_reports').doc(docId);
      const docSnap = await docRef.get();
      
      if (docSnap.exists) {
        const data = docSnap.data();
        if (data && data.isMergedPrimary && Array.isArray(data.mergedSecondaries)) {
          // It's a merged report! Revert primary and all secondaries in batch
          const batch = db.batch();
          batch.delete(docRef);
          
          data.mergedSecondaries.forEach((secId: string) => {
            batch.delete(db.collection('edited_reports').doc(secId));
          });
          
          await batch.commit();
          return NextResponse.json({ success: true, reverted: true, mergedReverted: true });
        }
      }

      // Simple edit revert: just delete
      await docRef.delete();
      return NextResponse.json({ success: true, reverted: true });
    } else {
      if (!db) {
        return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });
      }
      // Save/Update edits
      await db.collection('edited_reports').doc(docId).set({
        userId,
        timestamp,
        editedSummary,
        originalSummary: originalSummary || [],
        updatedAt: new Date(),
      }, { merge: true });
      return NextResponse.json({ success: true, saved: true });
    }
  } catch (error: any) {
    console.error('Error saving report edit:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
