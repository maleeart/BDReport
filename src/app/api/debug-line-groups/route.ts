import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!accessToken) {
      return NextResponse.json({ error: 'LINE_CHANNEL_ACCESS_TOKEN not configured' }, { status: 500 });
    }

    const groupsToCheck = [
      { id: "Ce96900ec1b6844a7bb4ca679d1cf4eba", name: "งานอาคารและบริเวณ" },
      { id: "C1b823c14add36f084cc0b6cf0369905e", name: "EGAT IOT notify" },
      { id: "C39557adefc0e4b06ced1cbf105992dc0", name: "การไฟฟ้า สำนักงานไทรน้อย" }
    ];

    const results = await Promise.all(
      groupsToCheck.map(async (group) => {
        try {
          const res = await fetch(`https://api.line.me/v2/bot/group/${group.id}/summary`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          });

          if (res.ok) {
            const data = await res.json();
            return {
              groupId: group.id,
              configuredName: group.name,
              lineResponseName: data.groupName,
              status: "OK",
              isMember: true,
              data
            };
          } else {
            const errText = await res.text();
            return {
              groupId: group.id,
              configuredName: group.name,
              status: `Error (HTTP ${res.status})`,
              isMember: false,
              error: errText
            };
          }
        } catch (err: any) {
          return {
            groupId: group.id,
            configuredName: group.name,
            status: "Exception",
            isMember: false,
            error: err.message
          };
        }
      })
    );

    return NextResponse.json({
      results
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
