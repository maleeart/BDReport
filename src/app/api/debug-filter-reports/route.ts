import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    if (!db) {
      return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });
    }

    const userId = 'Ud6e9a1c7375b84ad1b8aa877b83981ab';
    
    // Fetch all reports in Week 35
    const monday = new Date('2026-08-23T17:00:00Z');
    const sunday = new Date('2026-08-30T16:59:59.999Z');

    const snapshot = await db.collection('line_reports')
      .where('createdAt', '>=', monday)
      .where('createdAt', '<=', sunday)
      .get();

    // Map all docs
    const allReports = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));

    // Group by userId
    const userReportsMap: Record<string, any[]> = {};
    allReports.forEach((data: any) => {
      const uId = data.userId;
      if (!userReportsMap[uId]) {
        userReportsMap[uId] = [];
      }
      userReportsMap[uId].push(data);
    });

    const userReports = userReportsMap[userId] || [];
    userReports.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    // Run clustering
    const taskGroups: any[][] = [];
    let currentGroup: any[] = [];
    for (const report of userReports) {
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
        const shouldSplit = (isTimeGapLarge && isCompleteJob) || isSecondText;

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

    // Process clusters
    let reportsList: any[] = [];
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

      const repGroupId = representativeReport.groupId && representativeReport.groupId !== 'private'
        ? representativeReport.groupId
        : `private_${userId}`;

      reportsList.push({
        userId,
        groupId: repGroupId,
        summary,
        imageIds,
        sortTimestamp: representativeReport.timestamp || 0,
        repId: representativeReport.id
      });
    }

    const step1_afterClustering = reportsList.map(r => ({ ...r }));

    // Apply edited_reports hide check
    await Promise.all(
      reportsList.map(async (rep) => {
        const docId = `${rep.userId}_${rep.sortTimestamp}`;
        const editedDoc = await db.collection('edited_reports').doc(docId).get();
        const editedData = editedDoc.data();
        if (editedDoc.exists && editedData) {
          if (editedData.isHidden) {
            rep.isHidden = true;
          }
          rep.originalSummary = editedData.originalSummary || [...rep.summary];
          rep.summary = editedData.editedSummary || rep.summary;
          rep.isEdited = true;
        } else {
          rep.originalSummary = [...rep.summary];
          rep.isEdited = false;
        }
      })
    );

    const step2_afterEditLoad = reportsList.map(r => ({ ...r }));

    // Filter out hidden reports
    reportsList = reportsList.filter((rep) => !rep.isHidden);
    const step3_afterHiddenFilter = reportsList.map(r => ({ ...r }));

    // Get groups
    const groupsSnapshot = await db.collection('line_groups').get();
    const actualGroups = groupsSnapshot.docs.map(doc => ({ 
      groupId: doc.id, 
      groupName: doc.data()?.groupName,
      isHidden: doc.data()?.isHidden || false
    }));

    // Filter out hidden groups
    const hiddenGroupIds = new Set(actualGroups.filter(g => g.isHidden).map(g => g.groupId));
    reportsList = reportsList.filter(rep => !hiddenGroupIds.has(rep.groupId));
    const step4_afterHiddenGroupFilter = reportsList.map(r => ({ ...r }));

    return NextResponse.json({
      userId,
      step1_afterClustering,
      step2_afterEditLoad,
      step3_afterHiddenFilter,
      step4_afterHiddenGroupFilter,
      hiddenGroupIds: Array.from(hiddenGroupIds),
      actualGroups
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
