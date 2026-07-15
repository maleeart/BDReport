import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';

// Helper to get YYYY-Www ISO week string from a Date object
function getISOWeekString(date: Date): string {
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7; // Monday is 0, Sunday is 6
  target.setDate(target.getDate() - dayNr + 3); // target is Thursday
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  const weekNum = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  const year = new Date(firstThursday).getFullYear();
  return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

// Parse YYYY-Www week string and return start (Monday) and end (Sunday) dates in Bangkok timezone
function getWeekRangeFromWeekStr(weekStr: string) {
  const [year, week] = weekStr.split('-W').map(Number);
  
  // Find Monday of this ISO week
  const simple = new Date(year, 0, 1 + (week - 1) * 7);
  const dayOfWeek = simple.getDay();
  const ISOweekStart = new Date(simple);
  
  if (dayOfWeek <= 4) {
    ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
  } else {
    ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
  }
  
  const monday = new Date(`${ISOweekStart.toISOString().split('T')[0]}T00:00:00+07:00`);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const sundayEnd = new Date(`${sunday.toISOString().split('T')[0]}T23:59:59.999+07:00`);
  
  return { monday, sunday: sundayEnd };
}

// Format week range in Thai: "ประจำวันที่ 13 - 19 กรกฎาคม 2569"
function formatThaiWeekRange(monday: Date, sunday: Date): string {
  const months = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];
  
  const mDay = monday.getDate();
  const mMonth = months[monday.getMonth()];
  const mYear = monday.getFullYear() + 543;
  
  const sDay = sunday.getDate();
  const sMonth = months[sunday.getMonth()];
  const sYear = sunday.getFullYear() + 543;
  
  if (mYear !== sYear) {
    return `ประจำวันที่ ${mDay} ${mMonth} ${mYear} - ${sDay} ${sMonth} ${sYear}`;
  }
  if (mMonth !== sMonth) {
    return `ประจำวันที่ ${mDay} ${mMonth} - ${sDay} ${sMonth} ${mYear}`;
  }
  return `ประจำวันที่ ${mDay} - ${sDay} ${mMonth} ${mYear}`;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const weekParam = searchParams.get('week'); // Expects YYYY-Www

    // Get current week in Asia/Bangkok if not provided
    const nowBangkok = new Date(new Date().getTime() + 7 * 60 * 60 * 1000);
    const targetWeek = weekParam || getISOWeekString(nowBangkok);

    // Calculate start and end date of the week in Bangkok timezone (+07:00)
    const { monday, sunday } = getWeekRangeFromWeekStr(targetWeek);

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return NextResponse.json({ error: 'Missing GEMINI_API_KEY' }, { status: 500 });
    }

    const snapshot = await db
      .collection('line_reports')
      .where('createdAt', '>=', monday)
      .where('createdAt', '<=', sunday)
      .get();

    const thaiWeekRange = formatThaiWeekRange(monday, sunday);

    if (snapshot.empty) {
      return NextResponse.json({ date: thaiWeekRange, reports: [] });
    }

    // Group by userId
    const userReportsMap: Record<string, any[]> = {};
    snapshot.docs.forEach((doc: any) => {
      const data = doc.data();
      const userId = data.userId;
      if (!userReportsMap[userId]) {
        userReportsMap[userId] = [];
      }
      userReportsMap[userId].push(data);
    });

    const reportsList: any[] = [];

    for (const [userId, reports] of Object.entries(userReportsMap)) {
      const textReports = reports
        .filter((r) => r.type === 'text')
        .map((r) => r.content)
        .join('\n');

      const imageReport = reports.find((r) => r.type === 'image');

      // Define default fallbacks depending on if they sent an image
      let summary: string[] = imageReport ? ['ส่งเฉพาะรูปภาพประกอบ'] : ['ไม่มีรายงานข้อความ'];
      let title = imageReport ? 'รายงานรูปภาพ' : 'ไม่มีรายงานข้อความ';

      if (textReports.trim()) {
        const prompt = `Analyze and summarize the following weekly work reports for a team member.
Return a JSON object containing:
{
  "title": "A short 3-5 word keyword title/subject of the main work done during the week",
  "summary": ["work 1", "work 2", ...]
}
Keep the title and summaries extremely concise, in Thai, and highly professional.
Do NOT wrap the output in markdown code blocks like \`\`\`json. Output raw JSON only.
Reports:
${textReports}`;

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
            }),
          }
        );

        if (geminiRes.ok) {
          const geminiData = await geminiRes.json();
          let responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
          // Clean up any markdown code block wrapping if present
          responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
          if (responseText) {
            try {
              const parsed = JSON.parse(responseText);
              summary = parsed.summary || summary;
              title = parsed.title || title;
            } catch (err) {
              console.error('Failed to parse Gemini response', err, 'Response was:', responseText);
            }
          }
        } else {
          const errText = await geminiRes.text();
          console.error(`Gemini API error: ${geminiRes.statusText} - Response: ${errText}`);
        }
      }

      // Format date for the slide (e.g. DD/MM/YYYY) in Bangkok timezone
      const reportDateStr = monday.toLocaleDateString('th-TH', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'Asia/Bangkok',
      });

      reportsList.push({
        userId,
        title,
        date: reportDateStr,
        summary,
        base64Image: imageReport?.base64Image || null,
      });
    }

    return NextResponse.json({
      date: thaiWeekRange,
      reports: reportsList,
    });
  } catch (error: any) {
    console.error('Reports API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
