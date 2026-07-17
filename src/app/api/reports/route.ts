import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

async function getLineUserProfile(userId: string, accessToken: string, groupId?: string): Promise<string | null> {
  try {
    let url = `https://api.line.me/v2/bot/profile/${userId}`;
    if (groupId && groupId !== 'private' && !groupId.startsWith('private_')) {
      url = `https://api.line.me/v2/bot/group/${groupId}/member/${userId}`;
    }
    
    let res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (res.ok) {
      const data = await res.json();
      return data.displayName || null;
    } else if (groupId && groupId !== 'private') {
      // Fallback to standard profile endpoint if group member lookup failed
      const fallbackRes = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (fallbackRes.ok) {
        const data = await fallbackRes.json();
        return data.displayName || null;
      }
    }
  } catch (err) {
    console.error(`Error fetching profile for ${userId}:`, err);
  }
  return null;
}

async function getLineGroupName(groupId: string, accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.line.me/v2/bot/group/${groupId}/summary`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (res.ok) {
      const data = await res.json();
      return data.groupName || null;
    }
  } catch (err) {
    console.error(`Error fetching group name for ${groupId}:`, err);
  }
  return null;
}

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

  // Set start to Monday 00:00:00 Bangkok time (UTC+7, which is UTC Monday - 7 hours, i.e. Sunday 17:00:00 UTC)
  const monday = new Date(ISOweekStart);
  monday.setHours(-7, 0, 0, 0);

  // Set end to Sunday 23:59:59 Bangkok time (UTC+7, which is UTC Sunday + 17 hours)
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 7);
  sunday.setMilliseconds(-1);

  return { start: monday, end: sunday };
}

// Format Thai Date string (e.g. "12 พ.ค. 2567 - 18 พ.ค. 2567")
function formatThaiWeekRange(mondayDate: Date, sundayDate: Date): string {
  const thaiMonthsShort = [
    'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
  ];

  // Adjust for Bangkok timezone (UTC+7) for display formatting
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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const weekParam = searchParams.get('week') || '';
    const includeImages = searchParams.get('includeImages') === 'true';

    let monday: Date;
    let sunday: Date;

    if (weekParam) {
      const range = getWeekRangeFromWeekStr(weekParam);
      monday = range.start;
      sunday = range.end;
    } else {
      // Default to current week
      const currentWeek = getISOWeekString(new Date());
      const range = getWeekRangeFromWeekStr(currentWeek);
      monday = range.start;
      sunday = range.end;
    }

    // Fetch messages for the specified week range
    const snapshot = await db
      .collection('line_reports')
      .where('createdAt', '>=', monday)
      .where('createdAt', '<=', sunday)
      .get();

    const thaiWeekRange = formatThaiWeekRange(monday, sunday);

    if (snapshot.empty) {
      return NextResponse.json({ date: thaiWeekRange, reports: [], groups: [] });
    }

    // Group reports by userId first and track unique groupIds
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

    let reportsList: any[] = [];
    const userNamesMap: Record<string, string> = {};
    const groupNamesMap: Record<string, string> = {};
    
    const userIds = Object.keys(userReportsMap);
    const groupIds = Array.from(groupIdsSet);
    const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';

    // Fetch User Names
    if (userIds.length > 0) {
      await Promise.all(
        userIds.map(async (userId) => {
          if (userId === 'unknown') {
            userNamesMap[userId] = 'ผู้ใช้นิรนาม';
            return;
          }
          try {
            const profileDoc = await db.collection('line_profiles').doc(userId).get();
            const profileData = profileDoc.data();
            
            // Check if we have a valid cached name that is not a placeholder dummy
            const isValidCache = profileDoc.exists && 
                                 profileData && 
                                 profileData.displayName && 
                                 !profileData.displayName.startsWith('ผู้ใช้ LINE (');

            if (isValidCache) {
              userNamesMap[userId] = profileData.displayName;
            } else {
              // Find the first report of this user to get a representative groupId
              const userReports = userReportsMap[userId] || [];
              const repReport = userReports.find(r => r.groupId && r.groupId !== 'private' && !r.groupId.startsWith('private_'));
              const repGroupId = repReport ? repReport.groupId : undefined;

              let displayName = `ผู้ใช้ LINE (${userId.substring(0, 6)})`;
              if (accessToken) {
                const fetchedName = await getLineUserProfile(userId, accessToken, repGroupId);
                if (fetchedName) {
                  displayName = fetchedName;
                  await db.collection('line_profiles').doc(userId).set({ displayName });
                }
              }
              userNamesMap[userId] = displayName;
            }
          } catch (err) {
            console.error(`Error fetching line profile:`, err);
            userNamesMap[userId] = `ผู้ใช้ LINE (${userId.substring(0, 6)})`;
          }
        })
      );
    }

    // Fetch Group Names
    if (groupIds.length > 0) {
      await Promise.all(
        groupIds.map(async (gid) => {
          if (gid.startsWith('private_')) {
            const uid = gid.substring(8);
            const uName = userNamesMap[uid] || `ผู้ใช้ LINE (${uid.substring(0, 6)})`;
            groupNamesMap[gid] = `แชทส่วนตัว - ${uName}`;
            return;
          }
          try {
            const groupDoc = await db.collection('line_groups').doc(gid).get();
            const groupData = groupDoc.data();
            if (groupDoc.exists && groupData) {
              groupNamesMap[gid] = groupData.groupName;
            } else {
              let groupName = `กลุ่ม LINE (${gid.substring(0, 6)})`;
              if (accessToken) {
                const fetchedGroupName = await getLineGroupName(gid, accessToken);
                if (fetchedGroupName) {
                  groupName = fetchedGroupName;
                  await db.collection('line_groups').doc(gid).set({ groupName });
                }
              }
              groupNamesMap[gid] = groupName;
            }
          } catch (err) {
            console.error(`Error fetching group name for ${gid}:`, err);
            groupNamesMap[gid] = `กลุ่ม LINE (${gid.substring(0, 6)})`;
          }
        })
      );
    }

    // For each user, cluster their messages into separate "tasks" using an intelligent content-aware window
    for (const [userId, reports] of Object.entries(userReportsMap)) {
      // Sort reports chronologically
      reports.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

      const taskGroups: any[][] = [];
      let currentGroup: any[] = [];

      for (const report of reports) {
        if (currentGroup.length === 0) {
          currentGroup.push(report);
        } else {
          const lastReport = currentGroup[currentGroup.length - 1];
          const timeDiff = Math.abs((report.timestamp || 0) - (lastReport.timestamp || 0));

          // A job is considered "complete" if it already has both text and image
          const hasText = currentGroup.some(r => r.type === 'text');
          const hasImage = currentGroup.some(r => r.type === 'image');
          const isCompleteJob = hasText && hasImage;

          // Split conditions:
          // 1. Time gap between messages is more than 5 minutes
          // 2. Incoming is a new image, but the current group already has both text and image (a complete job has already been reported)
          const shouldSplit = timeDiff > 300000 || (report.type === 'image' && isCompleteJob);

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

      // Process each task cluster as a separate report entry (and slide)
      for (const group of taskGroups) {
        const textReports = group
          .filter((r) => r.type === 'text')
          .map((r) => r.content)
          .join('\n');

        // Collect all images sent in this task group (1-minute window)
        const imageReports = group.filter((r) => r.type === 'image');
        const base64Images = imageReports.map((r) => r.base64Image).filter(Boolean);
        const imageIds = imageReports.map((r) => r.id).filter(Boolean);
        const representativeReport = group[0];

        // Do not alter or summarize the original text: use it directly as the list of items
        let summary: string[] = textReports
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);

        if (summary.length === 0) {
          summary = base64Images.length > 0 ? ['ไม่มีข้อความประกอบ'] : ['ไม่มีรายงานข้อความ'];
        }

        const title = 'รายงานผลการดำเนินงานประจำสัปดาห์';

        // Format date in Bangkok timezone using representative report timestamp
        const reportDate = representativeReport.createdAt?.toDate 
          ? representativeReport.createdAt.toDate() 
          : new Date(representativeReport.createdAt || representativeReport.timestamp);

        const reportDateStr = reportDate.toLocaleDateString('th-TH', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          timeZone: 'Asia/Bangkok',
        });

        const reportTimeStr = reportDate.toLocaleTimeString('th-TH', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: 'Asia/Bangkok',
        });

        const repGroupId = representativeReport.groupId && representativeReport.groupId !== 'private'
          ? representativeReport.groupId
          : `private_${userId}`;

        reportsList.push({
          userId,
          displayName: userNamesMap[userId] || `ผู้ใช้ LINE (${userId.substring(0, 6)})`,
          groupId: repGroupId,
          groupName: groupNamesMap[repGroupId] || `แชทส่วนตัว - ${userNamesMap[userId]}`,
          title,
          date: reportDateStr,
          time: reportTimeStr,
          summary,
          imageIds,
          base64Image: includeImages ? (base64Images[0] || null) : null,
          base64Images: includeImages ? base64Images : [],
          sortTimestamp: representativeReport.timestamp || 0,
        });
      }
    }

    // Load all edited reports for this week's reports in parallel and merge
    if (reportsList.length > 0) {
      await Promise.all(
        reportsList.map(async (rep) => {
          const docId = `${rep.userId}_${rep.sortTimestamp}`;
          try {
            const editedDoc = await db.collection('edited_reports').doc(docId).get();
            const editedData = editedDoc.data();
            if (editedDoc.exists && editedData) {
              if (editedData.isHidden) {
                rep.isHidden = true;
              }
              rep.originalSummary = editedData.originalSummary || [...rep.summary];
              rep.summary = editedData.editedSummary || rep.summary;
              rep.isEdited = true;
              if (Array.isArray(editedData.mergedImageIds)) {
                rep.imageIds = editedData.mergedImageIds;
              }
            } else {
              rep.originalSummary = [...rep.summary];
              rep.isEdited = false;
            }
          } catch (err) {
            console.error(`Error loading edit for doc ${docId}:`, err);
            rep.originalSummary = [...rep.summary];
            rep.isEdited = false;
          }
        })
      );
      // Filter out hidden reports
      reportsList = reportsList.filter((rep) => !rep.isHidden);
    }

    // Sort all slide entries chronologically across the week
    reportsList.sort((a, b) => a.sortTimestamp - b.sortTimestamp);

    // Get all actual groups
    let actualGroups: Array<{ groupId: string; groupName: string }> = [];
    try {
      const groupsSnapshot = await db.collection('line_groups').get();
      actualGroups = groupsSnapshot.docs
        .map(doc => ({ groupId: doc.id, groupName: doc.data()?.groupName }))
        .filter(g => g.groupName && !g.groupName.startsWith('แชทส่วนตัว') && !g.groupId.startsWith('private_') && !g.groupName.startsWith('กลุ่ม LINE'));
    } catch (err) {
      console.error('Error fetching actual groups:', err);
    }

    // Default main group fallback
    const mainGroupId = actualGroups.length > 0 ? actualGroups[0].groupId : 'EGAT_IOT';
    const mainGroupName = actualGroups.length > 0 ? actualGroups[0].groupName : 'EGAT IOT';

    // Map reports to their correct groups
    reportsList.forEach((rep) => {
      // If the report's groupId is a private chat, consolidate it to the main group
      if (!rep.groupId || rep.groupId === 'private' || rep.groupId.startsWith('private_')) {
        rep.groupId = mainGroupId;
        rep.groupName = mainGroupName;
      } else {
        // Find the group name from our actualGroups list
        const matchingGroup = actualGroups.find(g => g.groupId === rep.groupId);
        if (matchingGroup) {
          rep.groupName = matchingGroup.groupName;
        }
      }
    });

    // Make the groups list dynamically contain all unique groups present in the reports
    const uniqueGroupIds = Array.from(new Set(reportsList.map(r => r.groupId)));
    const groupsList = uniqueGroupIds.map(gid => {
      const gInfo = actualGroups.find(g => g.groupId === gid);
      return {
        groupId: gid,
        groupName: gInfo ? gInfo.groupName : (gid === mainGroupId ? mainGroupName : `กลุ่ม LINE (${gid.substring(0, 6)})`)
      };
    });

    return NextResponse.json({
      date: thaiWeekRange,
      reports: reportsList,
      groups: groupsList,
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      }
    });
  } catch (error: any) {
    console.error('Reports API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
