import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import sharp from 'sharp';
import { db } from '@/lib/firebaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const signature = req.headers.get('x-line-signature');
    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }

    const bodyText = await req.text();
    const channelSecret = process.env.LINE_CHANNEL_SECRET;

    if (!channelSecret) {
      return NextResponse.json({ error: 'Channel secret not configured' }, { status: 500 });
    }

    // Verify signature
    const hash = crypto
      .createHmac('sha256', channelSecret)
      .update(bodyText)
      .digest('base64');

    if (hash !== signature) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const payload = JSON.parse(bodyText);
    const events = payload.events || [];

    for (const event of events) {
      if (event.type === 'message') {
        const userId = event.source?.userId || 'unknown';
        const timestamp = event.timestamp;
        const message = event.message;

        if (message.type === 'text') {
          await db.collection('line_reports').add({
            userId,
            type: 'text',
            messageId: message.id,
            content: message.text,
            timestamp,
            createdAt: new Date(),
          });
        } else if (message.type === 'image') {
          const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
          if (!accessToken) {
            console.error('Missing LINE_CHANNEL_ACCESS_TOKEN');
            continue;
          }

          // Fetch image from LINE API
          const lineRes = await fetch(`https://api-data.line.me/v2/bot/message/${message.id}/content`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });

          if (!lineRes.ok) {
            console.error(`Failed to fetch image from LINE: ${lineRes.statusText}`);
            continue;
          }

          const arrayBuffer = await lineRes.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          // Compress the image using sharp to fit inside Firestore 1MB document limit
          const compressedBuffer = await sharp(buffer)
            .resize({ width: 1000, height: 1000, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 75 })
            .toBuffer();

          const base64Image = `data:image/jpeg;base64,${compressedBuffer.toString('base64')}`;

          // Save directly to Firestore
          await db.collection('line_reports').add({
            userId,
            type: 'image',
            messageId: message.id,
            base64Image,
            timestamp,
            createdAt: new Date(),
          });
        }
      }
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
