import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { Jimp } from 'jimp';
import { db } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';

export const dynamic = 'force-dynamic';

async function trackWriteAndCleanup(data: any) {
  if (!db) return;
  try {
    const docSizeBytes = Buffer.byteLength(JSON.stringify(data), 'utf8');
    const statsRef = db.collection('metadata').doc('db_stats');
    
    // Increment the size counter
    await statsRef.set({
      estimatedSizeBytes: FieldValue.increment(docSizeBytes)
    }, { merge: true });

    // Check size and run cleanup if needed
    const statsDoc = await statsRef.get();
    const currentSize = statsDoc.data()?.estimatedSizeBytes || 0;

    // Limit check: 1 GB (1,073,741,824 bytes). 50 MB remaining is 1,022,361,600 bytes.
    if (currentSize > 1022361600) {
      console.log(`Database size (${currentSize} bytes) exceeds 950MB (within 50MB of 1GB limit). Triggering cleanup of the oldest reports...`);
      
      // Fetch the oldest reports (limit to 150 docs to stay safe with execution limits)
      const oldestDocs = await db.collection('line_reports')
        .orderBy('createdAt', 'asc')
        .limit(150)
        .get();

      if (!oldestDocs.empty) {
        const batch = db.batch();
        let reclaimedBytes = 0;

        oldestDocs.docs.forEach((doc: any) => {
          batch.delete(doc.ref);
          reclaimedBytes += Buffer.byteLength(JSON.stringify(doc.data()), 'utf8');
        });

        await batch.commit();

        // Update stats
        await statsRef.update({
          estimatedSizeBytes: FieldValue.increment(-reclaimedBytes)
        });
        console.log(`Cleanup complete. Reclaimed ${reclaimedBytes} bytes by deleting ${oldestDocs.size} oldest documents.`);
      }
    }
  } catch (err) {
    console.error('Error in database size tracking / cleanup:', err);
  }
}

async function cacheUserProfileInBackground(userId: string, groupId: string) {
  if (!db) return;
  try {
    const profileRef = db.collection('line_profiles').doc(userId);
    const profileDoc = await profileRef.get();
    const profileData = profileDoc.data();
    
    const isValidCache = profileDoc.exists && 
                         profileData && 
                         profileData.displayName && 
                         !profileData.displayName.startsWith('ผู้ใช้ LINE (');

    if (!isValidCache) {
      const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
      if (accessToken) {
        let url = `https://api.line.me/v2/bot/profile/${userId}`;
        if (groupId && groupId !== 'private' && groupId !== 'unknown') {
          url = `https://api.line.me/v2/bot/group/${groupId}/member/${userId}`;
        }
        
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        
        if (res.ok) {
          const data = await res.json();
          if (data.displayName) {
            await profileRef.set({ displayName: data.displayName }, { merge: true });
            console.log(`Pre-cached display name for user ${userId}: ${data.displayName}`);
          }
        } else if (groupId && groupId !== 'private') {
          // Fallback to standard profile endpoint
          const fallbackRes = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
          });
          if (fallbackRes.ok) {
            const data = await fallbackRes.json();
            if (data.displayName) {
              await profileRef.set({ displayName: data.displayName }, { merge: true });
              console.log(`Pre-cached display name (fallback) for user ${userId}: ${data.displayName}`);
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('Error pre-caching user profile:', err);
  }
}

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
        const groupId = event.source?.groupId || event.source?.roomId || 'private';
        const timestamp = event.timestamp;
        const message = event.message;

        // Pre-cache profile asynchronously in background
        if (userId !== 'unknown') {
          cacheUserProfileInBackground(userId, groupId).catch(err => console.error('Cache profile error:', err));
        }

        if (message.type === 'text') {
          const reportData = {
            userId,
            groupId,
            type: 'text',
            messageId: message.id,
            content: message.text,
            timestamp,
            createdAt: new Date(),
          };
          await db.collection('line_reports').add(reportData);
          await trackWriteAndCleanup(reportData);
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

          // Compress the image using Jimp (100% pure JS, zero native compile dependencies)
          // to keep the Base64 payload well under the Firestore 1MB document limit
          const image = await Jimp.read(buffer);
          
          // Resize to max dimension of 1000px, keeping aspect ratio automatically
          if (image.width > 1000 || image.height > 1000) {
            if (image.width > image.height) {
              image.resize({ w: 1000 });
            } else {
              image.resize({ h: 1000 });
            }
          }
          
          const compressedBuffer = await image.getBuffer('image/jpeg', { quality: 75 });

          const base64Image = `data:image/jpeg;base64,${compressedBuffer.toString('base64')}`;

          const reportData = {
            userId,
            groupId,
            type: 'image',
            messageId: message.id,
            base64Image,
            timestamp,
            createdAt: new Date(),
          };
          // Save directly to Firestore
          await db.collection('line_reports').add(reportData);
          await trackWriteAndCleanup(reportData);
        }
      }
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
