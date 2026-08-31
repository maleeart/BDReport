import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    if (!db) {
      return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });
    }

    const targetUserId = 'Ud6e9a1c7375b84ad1b8aa877b83981ab';
    const trace: string[] = [];

    // Week range for 2026-W35
    const monday = new Date('2026-08-23T17:00:00Z');
    const sunday = new Date('2026-08-30T16:59:59.999Z');

    trace.push(`Week range: ${monday.toISOString()} to ${sunday.toISOString()}`);

    const snapshot = await db.collection('line_reports')
      .where('createdAt', '>=', monday)
      .where('createdAt', '<=', sunday)
      .get();

    trace.push(`Total documents queried in Week 35: ${snapshot.size}`);

    const userReportsMap: Record<string, any[]> = {};
    const groupIdsSet = new Set<string>();

    snapshot.docs.forEach((doc: any) => {
      const data = { ...doc.data(), id: doc.id };
      const userId = data.userId;
      if (!userReportsMap[userId]) {
        userReportsMap[userId] = [];
      }
      userReportsMap[userId].push(data);
      
      const repGroupId = data.groupId && data.groupId !== 'private' ? data.groupId : `private_${userId}`;
      groupIdsSet.add(repGroupId);
    });

    const targetReports = userReportsMap[targetUserId] || [];
    trace.push(`Target user Ud6e9a1c7375b84ad1b8aa877b83981ab reports count: ${targetReports.length}`);

    let reportsList: any[] = [];
    const userNamesMap: Record<string, string> = {};
    const groupNamesMap: Record<string, string> = {};

    const userIds = Object.keys(userReportsMap);
    const groupIds = Array.from(groupIdsSet);

    // Populate user names map with placeholders
    userIds.forEach(uid => {
      userNamesMap[uid] = `ผู้ใช้ LINE (${uid.substring(0, 6)})`;
    });

    // Populate group names map with placeholders
    groupIds.forEach(gid => {
      groupNamesMap[gid] = `กลุ่ม LINE (${gid.substring(0, 6)})`;
    });

    // Cluster messages for each user
    for (const [userId, reports] of Object.entries(userReportsMap)) {
      reports.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

      const taskGroups: any[][] = [];
      let currentGroup: any[] = [];

      for (const report of reports) {
        if (currentGroup.length === 0) {
          currentGroup.push(report);
        } else {
          const lastReport = currentGroup[currentGroup.length - 1];
          const timeDiff = Math.abs((report.timestamp || 0) - (lastReport.timestamp || 0));

          const hasText = currentGroup.some(r => r.type === 'text');
          const hasImage = currentGroup.some(r => r.type === 'image');
          const isCompleteJob = hasText && hasImage;

          const isTimeGapLarge = timeDiff > 300000;
          const isSecondText = report.type === 'text' && hasText;

          let isFutureJobStart = false;
          if (report.type === 'image' && isCompleteJob) {
            const index = reports.indexOf(report);
            const remaining = reports.slice(index + 1);
            const nextText = remaining.find(r => r.type === 'text');
            if (nextText) {
              const timeDiffToNextText = Math.abs((nextText.timestamp || 0) - (report.timestamp || 0));
              if (timeDiffToNextText <= 120000) {
                isFutureJobStart = true;
              }
            }
          }

          // Use our NEW split condition
          const isTimeGapHuge = timeDiff > 1800000;
          const shouldSplit = isTimeGapHuge || (isTimeGapLarge && isCompleteJob) || isSecondText || (report.type === 'image' && isCompleteJob && isFutureJobStart);

          if (shouldSplit) {
            taskGroups.push(currentGroup);
            currentGroup = [report];
          } else {
            currentGroup.push(report);
          }
        }
      }
      if (currentGroup.length > 0) {
        taskGroups.push(currentGroup);
      }

      for (const group of taskGroups) {
        const textReports = group
          .filter((r) => r.type === 'text')
          .map((r) => r.content)
          .join('\n');

        const imageReports = group.filter((r) => r.type === 'image');
        const base64Images = imageReports.map((r) => r.base64Image).filter(Boolean);
        const imageIds = imageReports.map((r) => r.id).filter(Boolean);
        const representativeReport = group[0];

        let summary = textReports
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);

        if (summary.length === 0) {
          summary = base64Images.length > 0 ? ['ไม่มีข้อความประกอบ'] : ['ไม่มีรายงานข้อความ'];
        }

        const title = 'รายงานผลการดำเนินงานประจำสัปดาห์';

        const repGroupId = representativeReport.groupId && representativeReport.groupId !== 'private'
          ? representativeReport.groupId
          : `private_${userId}`;

        const item = {
          userId,
          displayName: userNamesMap[userId] || `ผู้ใช้ LINE (${userId.substring(0, 6)})`,
          groupId: repGroupId,
          groupName: groupNamesMap[repGroupId] || `แชทส่วนตัว - ${userNamesMap[userId]}`,
          title,
          summary,
          imageIds,
          sortTimestamp: representativeReport.timestamp || 0,
        };

        reportsList.push(item);

        if (userId === targetUserId) {
          trace.push(`Clustered item for target user: ${JSON.stringify({
            repGroupId,
            summary,
            imagesCount: imageIds.length,
            sortTimestamp: item.sortTimestamp
          })}`);
        }
      }
    }

    trace.push(`reportsList size after clustering: ${reportsList.length}`);

    // Load edits
    await Promise.all(
      reportsList.map(async (rep) => {
        const docId = `${rep.userId}_${rep.sortTimestamp}`;
        const editedDoc = await db.collection('edited_reports').doc(docId).get();
        const editedData = editedDoc.data();
        if (editedDoc.exists && editedData) {
          if (editedData.isHidden) {
            rep.isHidden = true;
          }
          rep.summary = editedData.editedSummary || rep.summary;
          rep.isEdited = true;
        } else {
          rep.isEdited = false;
        }
      })
    );

    const targetAfterEdit = reportsList.filter(r => r.userId === targetUserId);
    trace.push(`After loading edits, target user items: ${JSON.stringify(targetAfterEdit)}`);

    // Filter hidden
    reportsList = reportsList.filter((rep) => !rep.isHidden);
    trace.push(`reportsList size after hidden reports filter: ${reportsList.length}`);

    // Get groups
    const groupsSnapshot = await db.collection('line_groups').get();
    const actualGroups = groupsSnapshot.docs.map(doc => ({ 
      groupId: doc.id, 
      groupName: doc.data()?.groupName,
      isHidden: doc.data()?.isHidden || false
    }));

    // Filter out reports from hidden groups
    const hiddenGroupIds = new Set(actualGroups.filter(g => g.isHidden).map(g => g.groupId));
    reportsList = reportsList.filter(rep => !hiddenGroupIds.has(rep.groupId));
    
    trace.push(`reportsList size after hidden groups filter: ${reportsList.length}`);
    const targetAfterGroupFilter = reportsList.filter(r => r.userId === targetUserId);
    trace.push(`After hidden groups filter, target user items: ${JSON.stringify(targetAfterGroupFilter)}`);

    return NextResponse.json({
      trace,
      targetAfterGroupFilter,
      hiddenGroupIds: Array.from(hiddenGroupIds),
      actualGroups
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
