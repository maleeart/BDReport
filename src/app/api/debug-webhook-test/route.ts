import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const channelSecret = process.env.LINE_CHANNEL_SECRET;
    if (!channelSecret) {
      return NextResponse.json({ error: 'LINE_CHANNEL_SECRET not configured' }, { status: 500 });
    }

    const host = req.headers.get('host') || 'localhost:3000';
    const protocol = 'https';
    const webhookUrl = `${protocol}://${host}/api/webhook`;

    // Create a mock text message payload
    const mockPayload = {
      events: [
        {
          type: 'message',
          replyToken: '0f7d1e624f4b4bb2a6d71b823c14a22b',
          source: {
            userId: 'Ue5025ca3734afbdd5f9db61cc66e5611',
            groupId: 'Ce96900ec1b6844a7bb4ca679d1cf4eba',
            type: 'group'
          },
          timestamp: Date.now(),
          mode: 'active',
          message: {
            type: 'text',
            id: 'mock_message_id_' + Date.now(),
            text: 'เทสส่งรายงานอัตโนมัติจากดีบักเกอร์ งานซ่อมแซม'
          }
        }
      ],
      destination: 'U90f5b4bd3e395dd814be8f3c58be4082'
    };

    const bodyText = JSON.stringify(mockPayload);

    // Calculate signature
    const signature = crypto
      .createHmac('sha256', channelSecret)
      .update(bodyText)
      .digest('base64');

    // Make local fetch call to the webhook endpoint
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-line-signature': signature
      },
      body: bodyText
    });

    const status = res.status;
    const responseText = await res.text();

    return NextResponse.json({
      webhookUrl,
      status,
      responseText,
      payload: mockPayload
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
