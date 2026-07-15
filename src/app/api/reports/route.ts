import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';

// Helper to format date in Thai: "15 กรกฎาคม 2569"
function formatThaiDate(date: Date): string {
  const months = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear() + 543; // Buddhist Era
  return `${day} ${month} ${year}`;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date'); // Expects YYYY-MM-DD

    const targetDate = dateParam ? new Date(dateParam) : new Date();
    const startDate = new Date(targetDate);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(targetDate);
    endDate.setHours(23, 59, 59, 999);

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return NextResponse.json({ error: 'Missing GEMINI_API_KEY' }, { status: 500 });
    }

    const snapshot = await db
      .collection('line_reports')
      .where('createdAt', '>=', startDate)
      .where('createdAt', '<=', endDate)
      .get();

    if (snapshot.empty) {
      return NextResponse.json({ date: formatThaiDate(targetDate), reports: [] });
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

      let summary: string[] = ['ไม่มีรายงานข้อความ'];
      let title = 'รายงานผลงาน';

      if (textReports.trim()) {
        const prompt = `Analyze and summarize the following daily work reports for a team member.
Return a JSON object containing:
{
  "title": "A short 3-5 word keyword title/subject of the main work done",
  "summary": ["task 1", "task 2", ...]
}
Keep the title and summaries extremely concise, in Thai, and highly professional.
Reports:
${textReports}`;

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: 'application/json' },
            }),
          }
        );

        if (geminiRes.ok) {
          const geminiData = await geminiRes.json();
          const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (responseText) {
            try {
              const parsed = JSON.parse(responseText);
              summary = parsed.summary || summary;
              title = parsed.title || title;
            } catch (err) {
              console.error('Failed to parse Gemini response', err);
            }
          }
        } else {
          console.error(`Gemini API error: ${geminiRes.statusText}`);
        }
      }

      // Format date for the slide (e.g. DD/MM/YYYY)
      const reportDateStr = targetDate.toLocaleDateString('th-TH', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
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
      date: formatThaiDate(targetDate),
      reports: reportsList,
    });
  } catch (error: any) {
    console.error('Reports API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
