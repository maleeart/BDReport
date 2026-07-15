import { NextRequest, NextResponse } from 'next/server';
import pptxgen from 'pptxgenjs';
import { db, bucket } from '@/lib/firebaseAdmin';

export async function GET(req: NextRequest) {
  try {
    // 1. Authorize Cron
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return NextResponse.json({ error: 'Missing GEMINI_API_KEY' }, { status: 500 });
    }

    // 2. Fetch today's reports
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const snapshot = await db
      .collection('line_reports')
      .where('createdAt', '>=', today)
      .get();

    if (snapshot.empty) {
      return NextResponse.json({ message: 'No reports found for today' });
    }

    // Group reports by userId
    const userReportsMap: Record<string, any[]> = {};
    snapshot.docs.forEach((doc: any) => {
      const data = doc.data();
      const userId = data.userId;
      if (!userReportsMap[userId]) {
        userReportsMap[userId] = [];
      }
      userReportsMap[userId].push(data);
    });

    const userSummaries: Array<{
      userId: string;
      summary: string[];
      highlight: string;
      imagePath?: string;
    }> = [];

    // 3. Summarize each user's reports using Gemini API
    for (const [userId, reports] of Object.entries(userReportsMap)) {
      const textReports = reports
        .filter((r) => r.type === 'text')
        .map((r) => r.content)
        .join('\n');

      const imageReport = reports.find((r) => r.type === 'image');

      let summary: string[] = ['No text report submitted'];
      let highlight = 'No text highlights';

      if (textReports.trim()) {
        const prompt = `Analyze and summarize the following daily work reports for a team member.
Return a JSON object containing:
{
  "summary": ["task 1", "task 2", ...],
  "highlight": "Short one-sentence highlight of their day"
}
Keep summaries extremely concise and professional.
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
              highlight = parsed.highlight || highlight;
            } catch (err) {
              console.error('Failed to parse Gemini response', err);
            }
          }
        } else {
          console.error(`Gemini API error: ${geminiRes.statusText}`);
        }
      }

      userSummaries.push({
        userId,
        summary,
        highlight,
        imagePath: imageReport?.storagePath,
      });
    }

    // 4. Generate PPTX using pptxgenjs
    const pptx = new pptxgen();
    pptx.title = 'Daily Work Report';

    // Slide 1: Cover Slide
    const slide1 = pptx.addSlide();
    slide1.background = { color: '121214' };
    slide1.addText('BDReport', {
      x: 0.5,
      y: 2.0,
      w: 9.0,
      h: 1.0,
      fontSize: 48,
      bold: true,
      color: '8B5CF6',
      fontFace: 'Arial',
    });
    slide1.addText(`Daily Team Status Update\nDate: ${today.toLocaleDateString()}`, {
      x: 0.5,
      y: 3.2,
      w: 9.0,
      h: 1.0,
      fontSize: 20,
      color: 'FFFFFF',
      fontFace: 'Arial',
    });

    // Slide 2: Team Summary Overview
    const slide2 = pptx.addSlide();
    slide2.background = { color: '1A1A1E' };
    slide2.addText('Team Overview Highlight', {
      x: 0.5,
      y: 0.5,
      w: 9.0,
      h: 0.5,
      fontSize: 24,
      bold: true,
      color: '8B5CF6',
    });

    const highlightText = userSummaries
      .map((us, index) => `${index + 1}. User ${us.userId.substring(0, 8)}: ${us.highlight}`)
      .join('\n\n');

    slide2.addText(highlightText || 'No highlights today.', {
      x: 0.5,
      y: 1.2,
      w: 9.0,
      h: 5.0,
      fontSize: 16,
      color: 'FFFFFF',
      fontFace: 'Arial',
    });

    // Slide 3+: User-specific Slides
    for (const us of userSummaries) {
      const slide = pptx.addSlide();
      slide.background = { color: '121214' };

      // Title
      slide.addText(`Status: User ${us.userId.substring(0, 8)}`, {
        x: 0.5,
        y: 0.5,
        w: 9.0,
        h: 0.5,
        fontSize: 24,
        bold: true,
        color: '8B5CF6',
      });

      // Left Column: Text Summary
      const summaryText = us.summary.map((task) => `• ${task}`).join('\n');
      slide.addText(summaryText, {
        x: 0.5,
        y: 1.2,
        w: 4.8,
        h: 5.0,
        fontSize: 14,
        color: 'FFFFFF',
        fontFace: 'Arial',
      });

      // Right Column: Image (if uploaded)
      if (us.imagePath) {
        try {
          const file = bucket.file(us.imagePath);
          const [buffer] = await file.download();
          const imageBase64 = `data:image/jpeg;base64,${buffer.toString('base64')}`;

          slide.addImage({
            data: imageBase64,
            x: 5.5,
            y: 1.2,
            w: 4.0,
            h: 4.5,
          });
        } catch (err) {
          console.error(`Failed to load image for user ${us.userId}`, err);
          slide.addText('[Image load failed]', {
            x: 5.5,
            y: 3.0,
            w: 4.0,
            h: 1.0,
            fontSize: 14,
            color: 'EF4444',
          });
        }
      } else {
        slide.addText('[No image uploaded today]', {
          x: 5.5,
          y: 3.0,
          w: 4.0,
          h: 1.0,
          fontSize: 14,
          color: '9CA3AF',
        });
      }
    }

    // 5. Save and upload back to storage
    const dateStr = today.toISOString().split('T')[0];
    const data = await pptx.write({ outputType: 'nodebuffer' });
    const buffer = Buffer.from(data as any);
    const storagePath = `slides/${dateStr}.pptx`;
    const destinationFile = bucket.file(storagePath);

    await destinationFile.save(buffer, {
      metadata: { contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
    });

    return NextResponse.json({
      status: 'success',
      storagePath,
    });
  } catch (error: any) {
    console.error('PPTX generation error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
