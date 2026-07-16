import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return new NextResponse('Missing image ID', { status: 400 });
    }

    if (!db) {
      return new NextResponse('Firebase Admin not initialized', { status: 500 });
    }

    const doc = await db.collection('line_reports').doc(id).get();
    const data = doc.data();

    if (!doc.exists || !data || !data.base64Image) {
      return new NextResponse('Image not found', { status: 404 });
    }

    // Parse base64 string
    const base64Str = data.base64Image.replace(/^data:image\/(jpeg|png|jpg);base64,/, '');
    const buffer = Buffer.from(base64Str, 'base64');

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable', // Cache for 1 year
      },
    });
  } catch (error: any) {
    console.error('Image API error:', error);
    return new NextResponse(error.message, { status: 500 });
  }
}
