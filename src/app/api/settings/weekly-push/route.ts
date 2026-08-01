import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    if (!db) {
      return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });
    }
    const doc = await db.collection('settings').doc('weekly_push').get();
    const data = doc.data();
    // Default to Monday (1)
    const sendDay = doc.exists && data && data.sendDay !== undefined ? data.sendDay : 1;
    // Default to 08:00 AM (8)
    const sendHour = doc.exists && data && data.sendHour !== undefined ? data.sendHour : 8;
    return NextResponse.json({ sendDay, sendHour });
  } catch (error: any) {
    console.error('Error fetching weekly push setting:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const adminPassword = req.headers.get('x-admin-password');
    if (adminPassword !== '8888') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!db) {
      return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });
    }

    const body = await req.json();
    const { sendDay, sendHour } = body;

    if (sendDay === undefined || sendHour === undefined) {
      return NextResponse.json({ error: 'Missing sendDay or sendHour' }, { status: 400 });
    }

    await db.collection('settings').doc('weekly_push').set({
      sendDay: Number(sendDay),
      sendHour: Number(sendHour)
    }, { merge: true });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error saving weekly push setting:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
