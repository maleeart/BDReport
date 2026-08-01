import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const secretParam = searchParams.get('secret') || '';
    const cronSecret = process.env.CRON_SECRET || '';
    const authHeader = req.headers.get('Authorization') || '';
    const adminPasswordHeader = req.headers.get('x-admin-password') || '';

    // Verify auth
    const isAuthorized = !cronSecret ||
      (authHeader === `Bearer ${cronSecret}`) ||
      (secretParam === cronSecret) ||
      (adminPasswordHeader === '8888');

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const groupIdParam = searchParams.get('groupId') || '';
    const isManual = adminPasswordHeader === '8888';

    // If not manual trigger, check if today is the scheduled day and hour
    if (!isManual) {
      const settingsDoc = await db.collection('settings').doc('weekly_push').get();
      const settingsData = settingsDoc.data();
      // Default to Monday (1)
      const sendDay = settingsDoc.exists && settingsData && settingsData.sendDay !== undefined 
        ? Number(settingsData.sendDay) 
        : 1;
      // Default to 08:00 AM (8)
      const sendHour = settingsDoc.exists && settingsData && settingsData.sendHour !== undefined
        ? Number(settingsData.sendHour)
        : 8;

      if (sendDay === -1) {
        return NextResponse.json({ message: 'Automated weekly push is disabled in settings' });
      }

      // Check current day of week and hour in Bangkok timezone (UTC+7)
      const now = new Date();
      const bangkokDate = new Date(now.getTime() + 7 * 60 * 60 * 1000);
      const bangkokDay = bangkokDate.getUTCDay(); // 0 is Sunday, 1 is Monday, etc.
      const bangkokHour = bangkokDate.getUTCHours(); // 0 to 23

      if (bangkokDay !== sendDay || bangkokHour !== sendHour) {
        return NextResponse.json({ 
          message: `Skipping automated push. Today is day ${bangkokDay} (hour ${bangkokHour}), but scheduled is day ${sendDay} (hour ${sendHour}).` 
        });
      }
    }

    // Determine target week (previous week relative to today)
    const prevWeekStr = getPreviousISOWeekString(new Date());
    const range = getWeekRangeFromWeekStr(prevWeekStr);
    
    // Fetch all active LINE groups
    const groupsSnapshot = await db.collection('line_groups').get();
    if (groupsSnapshot.empty) {
      return NextResponse.json({ message: 'No groups found in database' });
    }

    const activeGroups = groupsSnapshot.docs
      .filter(doc => {
        if (groupIdParam) {
          return doc.id === groupIdParam;
        }
        return !doc.data()?.isHidden && !doc.data()?.disableWeeklyPush;
      })
      .map(doc => ({
        groupId: doc.id,
        groupName: doc.data()?.groupName || 'กลุ่ม LINE'
      }))
      .filter(g => g.groupId && !g.groupId.startsWith('private_'));

    if (activeGroups.length === 0) {
      return NextResponse.json({ message: 'No active groups to push to' });
    }

    // Fetch all keyword groups to use for filtering
    const kwSnapshot = await db.collection('keyword_groups').get();
    let activeKeywords: string[] = [];
    if (!kwSnapshot.empty) {
      activeKeywords = kwSnapshot.docs.flatMap(doc => doc.data().keywords || []);
    } else {
      activeKeywords = ['งาน', 'ใบงาน', 'ซ่อม', 'ใบแจ้งซ่อม', 'เลขที่', 'เปลี่ยน', 'ตรวจ', 'สำรวจ', 'test', 'ทดสอบ', 'ท.', 'ต.', 'ล้าง', 'PM', 'ประจำ', 'เดือน', 'สัปดาห์', 'อาทิตย์'];
    }

    const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!accessToken) {
      return NextResponse.json({ error: 'LINE_CHANNEL_ACCESS_TOKEN not configured' }, { status: 500 });
    }

    const host = req.headers.get('host') || 'localhost:3000';
    const protocol = req.url.startsWith('https') ? 'https' : 'http';

    // Query all reports for the previous week once
    const reportsSnapshot = await db.collection('line_reports')
      .where('createdAt', '>=', range.start)
      .where('createdAt', '<=', range.end)
      .get();

    const allReports = reportsSnapshot.docs.map(doc => doc.data());
    const results: any[] = [];

    // Loop through each active group
    for (const group of activeGroups) {
      // Filter reports for this group in memory
      const reports = allReports.filter(r => r.groupId === group.groupId);

      if (reports.length === 0) {
        results.push({ groupId: group.groupId, groupName: group.groupName, status: 'skipped', reason: 'No reports found' });
        continue;
      }

      // Convert reports to check if any matches active keywords
      const matchingReports = reports.filter(report => {
        const summary: string[] = report.summary || [report.content || ''];
        return summary.some((line: string) => 
          line !== 'ส่งเฉพาะรูปภาพประกอบ' && 
          line !== 'ไม่มีข้อความประกอบ' && 
          line !== 'ไม่มีรายงานข้อความ' &&
          activeKeywords.some((kw: string) => line.toLowerCase().includes(kw.toLowerCase()))
        );
      });

      if (matchingReports.length === 0) {
        results.push({ groupId: group.groupId, groupName: group.groupName, status: 'skipped', reason: 'No reports matched keyword filters' });
        continue;
      }

      // Build LINE Flex Message
      const weekParts = prevWeekStr.split('-W');
      const weekNum = weekParts[1];
      const displayWeekRange = formatThaiWeekRange(range.start, range.end);
      
      const downloadUrl = `${protocol}://${host}/api/download?week=${prevWeekStr}&groupId=${group.groupId}`;

      const flexMessage = {
        type: 'flex',
        altText: `📊 สรุปรายงานประจำสัปดาห์ที่ ${weekNum} (${group.groupName})`,
        contents: {
          type: "bubble",
          size: "mega",
          header: {
            type: "box",
            layout: "vertical",
            backgroundColor: "#1E3A8A",
            paddingAll: "20px",
            contents: [
              {
                type: "text",
                text: "📊 WEEKLY REPORT",
                color: "#FFFFFF",
                weight: "bold",
                size: "lg",
                letterSpacing: "0.05em"
              },
              {
                type: "text",
                text: group.groupName,
                color: "#93C5FD",
                size: "sm",
                weight: "bold",
                margin: "xs"
              }
            ]
          },
          body: {
            type: "box",
            layout: "vertical",
            paddingAll: "20px",
            backgroundColor: "#F8FAFC",
            contents: [
              {
                type: "text",
                text: "สรุปรายงานการปฏิบัติงานประจำสัปดาห์",
                weight: "bold",
                size: "md",
                color: "#0F172A"
              },
              {
                type: "text",
                text: `สัปดาห์ที่ ${weekNum} (${displayWeekRange})`,
                size: "sm",
                color: "#64748B",
                margin: "sm"
              },
              {
                type: "box",
                layout: "vertical",
                margin: "lg",
                spacing: "sm",
                contents: [
                  {
                    type: "box",
                    layout: "baseline",
                    spacing: "sm",
                    contents: [
                      {
                        type: "text",
                        text: "•",
                        color: "#3B82F6",
                        flex: 0
                      },
                      {
                        type: "text",
                        text: "คัดกรองเฉพาะหัวข้อรายงานสำคัญแล้ว",
                        size: "sm",
                        color: "#475569",
                        flex: 1
                      }
                    ]
                  },
                  {
                    type: "box",
                    layout: "baseline",
                    spacing: "sm",
                    contents: [
                      {
                        type: "text",
                        text: "•",
                        color: "#3B82F6",
                        flex: 0
                      },
                      {
                        type: "text",
                        text: "สามารถดาวน์โหลดเป็นไฟล์สไลด์เพื่อใช้เสนอต่อได้",
                        size: "sm",
                        color: "#475569",
                        flex: 1
                      }
                    ]
                  }
                ]
              }
            ]
          },
          footer: {
            type: "box",
            layout: "vertical",
            paddingAll: "16px",
            backgroundColor: "#F1F5F9",
            contents: [
              {
                type: "button",
                style: "primary",
                color: "#1E3A8A",
                height: "sm",
                action: {
                  type: "uri",
                  label: "📥 ดาวน์โหลดไฟล์ PPTX",
                  uri: downloadUrl
                }
              }
            ]
          }
        }
      };

      // Push message to the LINE group
      const linePushUrl = 'https://api.line.me/v2/bot/message/push';
      const pushRes = await fetch(linePushUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          to: group.groupId,
          messages: [flexMessage]
        })
      });

      if (!pushRes.ok) {
        const errorText = await pushRes.text();
        results.push({ groupId: group.groupId, groupName: group.groupName, status: 'failed', error: errorText });
      } else {
        results.push({ groupId: group.groupId, groupName: group.groupName, status: 'success' });
      }
    }

    return NextResponse.json({ prevWeek: prevWeekStr, results });
  } catch (error: any) {
    console.error('Weekly push error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Helper Date Functions (duplicated from api/reports/route.ts for timezone safety)
function getISOWeekString(date: Date): string {
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  const weekNum = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  const year = new Date(firstThursday).getFullYear();
  return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

function getPreviousISOWeekString(date: Date): string {
  const prevDate = new Date(date.getTime());
  prevDate.setDate(prevDate.getDate() - 7);
  return getISOWeekString(prevDate);
}

function getWeekRangeFromWeekStr(weekStr: string) {
  const [year, week] = weekStr.split('-W').map(Number);
  const simple = new Date(year, 0, 1 + (week - 1) * 7);
  const dayOfWeek = simple.getDay();
  const ISOweekStart = new Date(simple);
  if (dayOfWeek <= 4) {
    ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
  } else {
    ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
  }

  const monday = new Date(ISOweekStart);
  monday.setHours(-7, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 7);
  sunday.setMilliseconds(-1);

  return { start: monday, end: sunday };
}

function formatThaiWeekRange(mondayDate: Date, sundayDate: Date): string {
  const thaiMonthsShort = [
    'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
  ];

  const displayMonday = new Date(mondayDate.getTime() + 7 * 60 * 60 * 1000);
  const displaySunday = new Date(sundayDate.getTime() + 7 * 60 * 60 * 1000);

  const startDay = displayMonday.getUTCDate();
  const startMonth = thaiMonthsShort[displayMonday.getUTCMonth()];
  const startYear = displayMonday.getUTCFullYear() + 543;

  const endDay = displaySunday.getUTCDate();
  const endMonth = thaiMonthsShort[displaySunday.getUTCMonth()];
  const endYear = displaySunday.getUTCFullYear() + 543;

  return `${startDay} ${startMonth} ${startYear} - ${endDay} ${endMonth} ${endYear}`;
}
