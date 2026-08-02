import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    if (!db) {
      return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });
    }
    
    // 1. Get weekly push settings
    const settingsDoc = await db.collection('settings').doc('weekly-push').get();
    const settings = settingsDoc.exists ? settingsDoc.data() : null;
    
    // 2. Get all groups
    const groupsSnap = await db.collection('line_groups').get();
    const groups = groupsSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // 3. Get keyword groups count
    const kwSnap = await db.collection('keyword_groups').get();
    const kwGroups = kwSnap.docs.map(doc => ({
      id: doc.id,
      name: doc.data().name,
      keywordsCount: (doc.data().keywords || []).length,
      defaultGroupId: doc.data().defaultGroupId || ''
    }));

    return NextResponse.json({
      settings,
      groups,
      kwGroups
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
