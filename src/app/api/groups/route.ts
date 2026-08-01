import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const adminPassword = req.headers.get('x-admin-password');
    if (adminPassword !== '8888') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!db) {
      return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });
    }
    const snapshot = await db.collection('line_groups').get();
    const groups = snapshot.docs
      .map(doc => ({
        groupId: doc.id,
        groupName: doc.data()?.groupName || `กลุ่ม LINE (${doc.id.substring(0, 6)})`,
        isHidden: doc.data()?.isHidden || false,
        disableWeeklyPush: doc.data()?.disableWeeklyPush || false
      }))
      .filter(g => g.groupName && !g.groupName.startsWith('แชทส่วนตัว') && !g.groupId.startsWith('private_'));

    return NextResponse.json({ groups });
  } catch (error: any) {
    console.error('Error fetching groups:', error);
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
    const { groupId, isHidden, disableWeeklyPush } = body;

    if (!groupId) {
      return NextResponse.json({ error: 'Missing groupId' }, { status: 400 });
    }

    const updateData: any = {};
    if (isHidden !== undefined) updateData.isHidden = !!isHidden;
    if (disableWeeklyPush !== undefined) updateData.disableWeeklyPush = !!disableWeeklyPush;

    await db.collection('line_groups').doc(groupId).set(updateData, { merge: true });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error updating group status:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
