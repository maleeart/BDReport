import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, timestamp, editedSummary, originalSummary } = body;

    if (!userId || !timestamp) {
      return NextResponse.json({ error: 'Missing userId or timestamp' }, { status: 400 });
    }

    const docId = `${userId}_${timestamp}`;

    if (editedSummary === null) {
      // Revert: Delete the edited document
      await db.collection('edited_reports').doc(docId).delete();
      return NextResponse.json({ success: true, reverted: true });
    } else {
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
