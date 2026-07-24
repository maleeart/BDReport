import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

const DEFAULT_KEYWORD_GROUPS = [
  { 
    name: 'งานบำรุงรักษา', 
    keywords: ['งาน', 'ใบงาน', 'ซ่อม', 'ใบแจ้งซ่อม', 'เลขที่', 'เปลี่ยน', 'ตรวจ', 'สำรวจ', 'test', 'ทดสอบ', 'ท.', 'ต.', 'ล้าง', 'PM', 'ประจำ', 'เดือน', 'สัปดาห์', 'อาทิตย์'] 
  }
];

export async function GET() {
  try {
    if (!db) {
      return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });
    }
    const snapshot = await db.collection('keyword_groups').orderBy('createdAt', 'asc').get();
    
    let groups = snapshot.docs.map(doc => ({
      id: doc.id,
      name: doc.data().name,
      keywords: doc.data().keywords || []
    }));

    // If empty, return the default one (and seed it to Firestore)
    if (groups.length === 0) {
      const defaultGroup = DEFAULT_KEYWORD_GROUPS[0];
      const docRef = await db.collection('keyword_groups').add({
        name: defaultGroup.name,
        keywords: defaultGroup.keywords,
        createdAt: new Date()
      });
      groups = [{
        id: docRef.id,
        name: defaultGroup.name,
        keywords: defaultGroup.keywords
      }];
    }

    return NextResponse.json({ groups });
  } catch (error: any) {
    console.error('Error fetching keyword groups:', error);
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
    const { name, keywords } = body;

    if (!name || !keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return NextResponse.json({ error: 'Invalid group name or keywords' }, { status: 400 });
    }

    const docRef = await db.collection('keyword_groups').add({
      name,
      keywords,
      createdAt: new Date()
    });

    return NextResponse.json({ success: true, id: docRef.id });
  } catch (error: any) {
    console.error('Error creating keyword group:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const adminPassword = req.headers.get('x-admin-password');
    if (adminPassword !== '8888') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!db) {
      return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing document id' }, { status: 400 });
    }

    await db.collection('keyword_groups').doc(id).delete();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting keyword group:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
