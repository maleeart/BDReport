'use client';

import React, { useState, useEffect } from 'react';

interface Report {
  userId: string;
  displayName?: string;
  groupId?: string;
  groupName?: string;
  title: string;
  date: string;
  time?: string;
  summary: string[];
  originalSummary?: string[];
  isEdited?: boolean;
  base64Image: string | null;
  base64Images?: string[];
  imageIds?: string[];
  sortTimestamp: number;
}

interface KeywordGroup {
  id?: string;
  name: string;
  keywords: string[];
}

interface Group {
  groupId: string;
  groupName: string;
}

const DEFAULT_KEYWORD_GROUPS = [
  { name: 'งานบำรุงรักษา', keywords: ['งาน', 'ใบงาน', 'ซ่อม', 'ใบแจ้งซ่อม', 'เลขที่', 'เปลี่ยน', 'ตรวจ', 'สำรวจ', 'test', 'ทดสอบ', 'ท.', 'ต.', 'ล้าง', 'PM', 'ประจำ', 'เดือน', 'สัปดาห์', 'อาทิตย์'] },
];
const DEFAULT_KEYWORDS = DEFAULT_KEYWORD_GROUPS.flatMap(g => g.keywords);

// Helper to get current YYYY-Www ISO week string from a Date object in browser
function getISOWeekString(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export default function Dashboard() {
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  const [reports, setReports] = useState<Report[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('all');
  const [hasSetDefaultGroup, setHasSetDefaultGroup] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [thaiWeekRange, setThaiWeekRange] = useState<string>('');
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);
  const [viewMode, setViewMode] = useState<'detailed' | 'compact'>('compact');

  // Theme State
  const [darkMode, setDarkMode] = useState<boolean>(true);
  const [toggleHovered, setToggleHovered] = useState<boolean>(false);
  const [adminToggleHovered, setAdminToggleHovered] = useState<boolean>(false);

  // Filtering & Panel States
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>(DEFAULT_KEYWORDS);
  const [customKeywordInput, setCustomKeywordInput] = useState<string>('');
  const [showFilterConfig, setShowFilterConfig] = useState<boolean>(false);

  // Editing States
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingText, setEditingText] = useState<string>('');
  const [showOriginalMap, setShowOriginalMap] = useState<Record<number, boolean>>({});

  // Group Management States
  const [showGroupManager, setShowGroupManager] = useState<boolean>(false);
  const [allGroups, setAllGroups] = useState<any[]>([]);
  const [loadingAllGroups, setLoadingAllGroups] = useState<boolean>(false);
  const [adminPassword, setAdminPassword] = useState<string>('');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState<string>('');
  const [adminPasswordError, setAdminPasswordError] = useState<string | null>(null);

  // Admin Dashboard Keyword States
  const [adminTab, setAdminTab] = useState<'groups' | 'keywords'>('groups');
  const [isPushingWeeklyReports, setIsPushingWeeklyReports] = useState<boolean>(false);
  const [weeklyPushDay, setWeeklyPushDay] = useState<number>(1);
  const [weeklyPushHour, setWeeklyPushHour] = useState<number>(8);
  const [newKeywordGroupName, setNewKeywordGroupName] = useState<string>('');
  const [newKeywordList, setNewKeywordList] = useState<string[]>([]);
  const [currentNewKeywordInput, setCurrentNewKeywordInput] = useState<string>('');

  // Keyword Groups Dynamic State
  const [keywordGroups, setKeywordGroups] = useState<KeywordGroup[]>(DEFAULT_KEYWORD_GROUPS);

  const fetchKeywordGroups = async () => {
    try {
      const res = await fetch(`/api/keyword-groups?t=${Date.now()}`);
      if (!res.ok) throw new Error('ไม่สามารถดึงข้อมูลกลุ่มคำสำคัญได้');
      const data = await res.json();
      const groups = data.groups || DEFAULT_KEYWORD_GROUPS;
      setKeywordGroups(groups);
      
      // Populate selectedKeywords with all keywords on initial mount
      setSelectedKeywords(prev => {
        if (prev.length === 0 || prev === DEFAULT_KEYWORDS) {
          return groups.flatMap((g: any) => g.keywords);
        }
        return prev;
      });
    } catch (err) {
      console.error('Error loading keyword groups:', err);
    }
  };

  // Fetch keyword groups on mount
  useEffect(() => {
    fetchKeywordGroups();
  }, []);

  // Load admin session from sessionStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedPass = sessionStorage.getItem('bdreport_admin_pass');
      if (savedPass === '8888') {
        setAdminPassword(savedPass);
        setIsAdminAuthenticated(true);
      }
    }
  }, []);

  // Clear inputs and errors on modal close
  useEffect(() => {
    if (!showGroupManager) {
      setAdminPasswordInput('');
      setAdminPasswordError(null);
    }
  }, [showGroupManager]);

  const handleVerifyAdminPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPasswordInput === '8888') {
      setAdminPassword('8888');
      setIsAdminAuthenticated(true);
      setAdminPasswordError(null);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('bdreport_admin_pass', '8888');
      }
    } else {
      setAdminPasswordError('รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง');
    }
  };

  const fetchAllGroups = async () => {
    if (!adminPassword && adminPasswordInput !== '8888') return;
    setLoadingAllGroups(true);
    try {
      const res = await fetch(`/api/groups?t=${Date.now()}`, {
        headers: {
          'x-admin-password': adminPassword || '8888'
        }
      });
      if (!res.ok) throw new Error('ไม่สามารถดึงข้อมูลกลุ่มทั้งหมดได้');
      const data = await res.json();
      setAllGroups(data.groups || []);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'เกิดข้อผิดพลาดในการดึงข้อมูลกลุ่ม');
    } finally {
      setLoadingAllGroups(false);
    }
  };

  const toggleGroupVisibility = async (groupId: string, currentHidden: boolean) => {
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': adminPassword || '8888'
        },
        body: JSON.stringify({
          groupId,
          isHidden: !currentHidden,
        }),
      });

      if (!res.ok) throw new Error('ไม่สามารถอัปเดตสถานะกลุ่มได้');
      
      // Update local state for allGroups
      setAllGroups(prev =>
        prev.map(g => g.groupId === groupId ? { ...g, isHidden: !currentHidden } : g)
      );

      // Refresh reports dashboard data
      await fetchReports(selectedWeek);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'เกิดข้อผิดพลาดในการเปลี่ยนสถานะกลุ่ม');
    }
  };

  const toggleWeeklyPush = async (groupId: string, currentDisabled: boolean) => {
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': adminPassword || '8888'
        },
        body: JSON.stringify({
          groupId,
          disableWeeklyPush: !currentDisabled,
        }),
      });

      if (!res.ok) throw new Error('ไม่สามารถอัปเดตสถานะการส่งรายสัปดาห์ได้');
      
      // Update local state for allGroups
      setAllGroups(prev =>
        prev.map(g => g.groupId === groupId ? { ...g, disableWeeklyPush: !currentDisabled } : g)
      );
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'เกิดข้อผิดพลาดในการเปลี่ยนสถานะการส่งรายสัปดาห์');
    }
  };

  const handleManualWeeklyPush = async () => {
    if (!window.confirm('คุณแน่ใจหรือไม่ว่าต้องการจัดทำและส่งรายงานสไลด์ PPTX ประจำสัปดาห์ของทุกกลุ่มเข้าห้องแชท LINE ในทันที?')) return;
    
    setIsPushingWeeklyReports(true);
    try {
      const res = await fetch('/api/cron/weekly-push', {
        method: 'GET',
        headers: {
          'x-admin-password': adminPassword || '8888'
        }
      });
      
      if (!res.ok) throw new Error('ไม่สามารถส่งรายงานสัปดาห์เข้า LINE ได้');
      const data = await res.json();
      
      // Format response results
      const results = data.results || [];
      const successCount = results.filter((r: any) => r.status === 'success').length;
      const skippedCount = results.filter((r: any) => r.status === 'skipped').length;
      const failedCount = results.filter((r: any) => r.status === 'failed').length;
      
      alert(`การส่งข้อความสรุปรายงานสัปดาห์สำเร็จเรียบร้อยแล้ว!\n\nส่งสำเร็จ: ${successCount} กลุ่ม\nข้ามการส่ง (ไม่มีข้อมูล): ${skippedCount} กลุ่ม\nล้มเหลว: ${failedCount} กลุ่ม`);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'เกิดข้อผิดพลาดขณะส่งรายงานเข้า LINE');
    } finally {
      setIsPushingWeeklyReports(false);
    }
  };

  const fetchWeeklyPushSetting = async () => {
    try {
      const res = await fetch('/api/settings/weekly-push');
      if (res.ok) {
        const data = await res.json();
        setWeeklyPushDay(data.sendDay !== undefined ? data.sendDay : 1);
        setWeeklyPushHour(data.sendHour !== undefined ? data.sendHour : 8);
      }
    } catch (err) {
      console.error('Error fetching weekly push setting:', err);
    }
  };

  const handleSaveWeeklyPushSettings = async (day: number, hour: number) => {
    try {
      const res = await fetch('/api/settings/weekly-push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': adminPassword || '8888'
        },
        body: JSON.stringify({ sendDay: day, sendHour: hour })
      });
      if (!res.ok) throw new Error('ไม่สามารถบันทึกวันและเวลาส่งรายงานอัตโนมัติได้');
      setWeeklyPushDay(day);
      setWeeklyPushHour(hour);
      alert('บันทึกการตั้งค่าวันและเวลาส่งรายงานอัตโนมัติสำเร็จแล้ว');
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'เกิดข้อผิดพลาดในการบันทึกการตั้งค่า');
    }
  };

  const handleManualGroupPush = async (groupId: string, groupName: string) => {
    if (!window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการจัดทำและส่งรายงานสไลด์ PPTX ประจำสัปดาห์ของกลุ่ม "${groupName}" เข้าห้องแชท LINE ในทันที?`)) return;
    
    setIsPushingWeeklyReports(true);
    try {
      const res = await fetch(`/api/cron/weekly-push?groupId=${groupId}`, {
        method: 'GET',
        headers: {
          'x-admin-password': adminPassword || '8888'
        }
      });
      
      if (!res.ok) throw new Error(`ไม่สามารถส่งรายงานกลุ่ม "${groupName}" เข้า LINE ได้`);
      const data = await res.json();
      const results = data.results || [];
      const groupResult = results.find((r: any) => r.groupId === groupId);
      
      if (groupResult && groupResult.status === 'success') {
        alert(`ส่งรายงานสไลด์เข้า LINE กลุ่ม "${groupName}" เรียบร้อยแล้ว!`);
      } else if (groupResult && groupResult.status === 'skipped') {
        alert(`ข้ามการส่ง: กลุ่ม "${groupName}" ${groupResult.reason === 'No reports found' ? 'ไม่มีข้อความรายงานใหม่ในสัปดาห์ที่แล้ว' : 'ไม่พบข้อความรายงานที่ผ่านตัวกรองคำสำคัญ'}`);
      } else {
        alert(`ล้มเหลว: ${groupResult?.error || 'เกิดข้อผิดพลาดไม่ทราบสาเหตุ'}`);
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'เกิดข้อผิดพลาดขณะส่งรายงานเข้า LINE');
    } finally {
      setIsPushingWeeklyReports(false);
    }
  };

  const handleAddNewKeywordWord = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanWord = currentNewKeywordInput.trim();
    if (cleanWord && !newKeywordList.includes(cleanWord)) {
      setNewKeywordList([...newKeywordList, cleanWord]);
      setCurrentNewKeywordInput('');
    }
  };

  const handleRemoveNewKeywordWord = (word: string) => {
    setNewKeywordList(newKeywordList.filter(w => w !== word));
  };

  const handleSaveKeywordGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newKeywordGroupName.trim();
    if (!cleanName) {
      alert('กรุณากรอกชื่อกลุ่มคำสำคัญ');
      return;
    }
    if (newKeywordList.length === 0) {
      alert('กรุณาเพิ่มคำสำคัญในการค้นหาอย่างน้อย 1 คำ');
      return;
    }

    try {
      const res = await fetch('/api/keyword-groups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': adminPassword || '8888'
        },
        body: JSON.stringify({
          name: cleanName,
          keywords: newKeywordList
        })
      });

      if (!res.ok) throw new Error('ไม่สามารถบันทึกกลุ่มคำสำคัญใหม่ได้');
      
      // Reset form
      setNewKeywordGroupName('');
      setNewKeywordList([]);
      setCurrentNewKeywordInput('');
      
      // Reload keyword groups
      await fetchKeywordGroups();
      alert('บันทึกกลุ่มคำสำคัญใหม่เรียบร้อยแล้ว');
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'เกิดข้อผิดพลาดในการบันทึกกลุ่มคำสำคัญ');
    }
  };

  const handleDeleteKeywordGroup = async (id: string) => {
    if (!window.confirm('คุณแน่ใจหรือไม่ที่จะลบกลุ่มคำสำคัญนี้?')) return;
    
    try {
      const res = await fetch(`/api/keyword-groups?id=${id}`, {
        method: 'DELETE',
        headers: {
          'x-admin-password': adminPassword || '8888'
        }
      });

      if (!res.ok) throw new Error('ไม่สามารถลบกลุ่มคำสำคัญได้');

      // Reload
      await fetchKeywordGroups();
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'เกิดข้อผิดพลาดในการลบกลุ่มคำสำคัญ');
    }
  };

  useEffect(() => {
    if (showGroupManager && isAdminAuthenticated) {
      fetchAllGroups();
      fetchWeeklyPushSetting();
    }
  }, [showGroupManager, isAdminAuthenticated]);

  // Set default week to current week on mount
  useEffect(() => {
    const today = new Date();
    setSelectedWeek(getISOWeekString(today));
  }, []);

  const fetchReports = async (weekStr: string) => {
    if (!weekStr) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports?week=${weekStr}&t=${Date.now()}`);
      if (!res.ok) {
        throw new Error('ไม่สามารถดึงข้อมูลรายงานได้');
      }
      const data = await res.json();
      const fetchedReports = data.reports || [];
      setReports(fetchedReports);
      const fetchedGroups = data.groups || [];
      setGroups(fetchedGroups);
      setThaiWeekRange(data.date || '');

      // Auto-select 'งานอาคารและบริเวณ' group as default on initial load
      if (!hasSetDefaultGroup && fetchedGroups.length > 0) {
        const targetGroup = fetchedGroups.find((g: any) => g.groupName && g.groupName.includes('งานอาคารและบริเวณ'));
        if (targetGroup) {
          setSelectedGroupId(targetGroup.groupId);
          setHasSetDefaultGroup(true);
        }
      }
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการโหลดข้อมูล');
      setReports([]);
      setGroups([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedWeek) {
      fetchReports(selectedWeek);
    }
  }, [selectedWeek]);

  // Helper to filter reports list based on active keywords and selected group
  const getFilteredReports = (): Report[] => {
    let filtered = reports;

    // Filter by selected LINE group first
    if (selectedGroupId !== 'all') {
      filtered = filtered.filter(report => report.groupId === selectedGroupId);
    }

    const activeKeywords = [...selectedKeywords];
    if (customKeywordInput.trim()) {
      customKeywordInput.split(',').forEach(kw => {
        const clean = kw.trim();
        if (clean && !activeKeywords.includes(clean)) {
          activeKeywords.push(clean);
        }
      });
    }

    if (activeKeywords.length === 0) {
      return filtered; // If no keyword filter is configured, show everything in this group
    }

    return filtered.filter(report => {
      // Check if any summary line contains at least one of the active keywords (body only)
      // Exclude default placeholder strings
      const summaryMatches = report.summary.some(line => 
        line !== 'ส่งเฉพาะรูปภาพประกอบ' && 
        line !== 'ไม่มีข้อความประกอบ' && 
        line !== 'ไม่มีรายงานข้อความ' &&
        activeKeywords.some(kw => line.toLowerCase().includes(kw.toLowerCase()))
      );

      return summaryMatches;
    });
  };

  const filteredReports = getFilteredReports();

  // Reset page when inputs change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedWeek, selectedGroupId, selectedKeywords, customKeywordInput, itemsPerPage]);

  const totalPages = itemsPerPage === -1 ? 1 : Math.ceil(filteredReports.length / itemsPerPage);
  const paginatedReports = itemsPerPage === -1
    ? filteredReports
    : filteredReports.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Dynamically update selected indices when reports, group, or keyword filters change
  useEffect(() => {
    const visibleIndices = new Set(
      filteredReports
        .map(r => reports.indexOf(r))
        .filter(idx => idx !== -1)
    );
    setSelectedIndices(visibleIndices);
  }, [reports, selectedGroupId, selectedKeywords, customKeywordInput]);

  const handleToggleSelect = (idx: number) => {
    const newSet = new Set(selectedIndices);
    if (newSet.has(idx)) {
      newSet.delete(idx);
    } else {
      newSet.add(idx);
    }
    setSelectedIndices(newSet);
  };

  const handleSelectAll = () => {
    const visibleIndices = filteredReports
      .map(r => reports.indexOf(r))
      .filter(idx => idx !== -1);
    setSelectedIndices(new Set(visibleIndices));
  };

  const handleDeselectAll = () => {
    setSelectedIndices(new Set());
  };

  const handleToggleKeyword = (kw: string) => {
    if (selectedKeywords.includes(kw)) {
      setSelectedKeywords(selectedKeywords.filter(k => k !== kw));
    } else {
      setSelectedKeywords([...selectedKeywords, kw]);
    }
  };

  const handleKeywordSelectAll = () => {
    setSelectedKeywords(keywordGroups.flatMap(g => g.keywords));
  };

  const handleKeywordDeselectAll = () => {
    setSelectedKeywords([]);
  };

  const handleToggleGroup = (groupKeywords: string[]) => {
    const allSelected = groupKeywords.every(kw => selectedKeywords.includes(kw));
    if (allSelected) {
      setSelectedKeywords(selectedKeywords.filter(kw => !groupKeywords.includes(kw)));
    } else {
      const merged = [...new Set([...selectedKeywords, ...groupKeywords])];
      setSelectedKeywords(merged);
    }
  };

  const handleDownload = () => {
    const indicesStr = Array.from(selectedIndices).sort((a, b) => a - b).join(',');
    const downloadUrl = `/api/download?week=${selectedWeek}&indices=${indicesStr}&groupId=${selectedGroupId}`;
    
    // Check if mobile or inside LINE in-app webview
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || 
                     (navigator.userAgent.indexOf('Line') > -1);

    if (isMobile) {
      window.location.href = downloadUrl;
    } else {
      window.open(downloadUrl, '_blank');
    }
  };

  const handleDownloadImagesZip = () => {
    const downloadUrl = `/api/download-images?week=${selectedWeek}`;
    
    // Check if mobile or inside LINE in-app webview
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || 
                     (navigator.userAgent.indexOf('Line') > -1);

    if (isMobile) {
      window.location.href = downloadUrl;
    } else {
      window.open(downloadUrl, '_blank');
    }
  };

  const startEditing = (idx: number, report: Report) => {
    setEditingIndex(idx);
    setEditingText(report.summary.join('\n'));
  };

  const cancelEditing = () => {
    setEditingIndex(null);
    setEditingText('');
  };

  const saveEdit = async (idx: number, report: Report) => {
    setActionLoading(true);
    try {
      const lines = editingText.split('\n').map(l => l.trim()).filter(Boolean);
      const res = await fetch('/api/reports/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: report.userId,
          timestamp: report.sortTimestamp,
          editedSummary: lines,
          originalSummary: report.originalSummary || report.summary,
        }),
      });

      if (!res.ok) {
        throw new Error('ไม่สามารถบันทึกการแก้ไขได้');
      }

      setEditingIndex(null);
      // Refresh reports list
      await fetchReports(selectedWeek);
    } catch (err: any) {
      alert(err.message || 'เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setActionLoading(false);
    }
  };

  const revertEdit = async (report: Report) => {
    if (!confirm('คุณต้องการยกเลิกการแก้ไขนี้และย้อนกลับไปใช้ข้อความต้นฉบับจาก LINE หรือไม่?')) {
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch('/api/reports/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: report.userId,
          timestamp: report.sortTimestamp,
          editedSummary: null, // Null indicates revert
        }),
      });

      if (!res.ok) {
        throw new Error('ไม่สามารถย้อนกลับข้อมูลได้');
      }

      // Re-fetch reports
      await fetchReports(selectedWeek);
    } catch (err: any) {
      alert(err.message || 'เกิดข้อผิดพลาดในการย้อนกลับข้อมูล');
    } finally {
      setActionLoading(false);
    }
  };

  const handleMergeSelected = async () => {
    const selectedReports = Array.from(selectedIndices)
      .map(idx => reports[idx])
      .filter(Boolean)
      .sort((a, b) => a.sortTimestamp - b.sortTimestamp);

    if (selectedReports.length < 2) {
      alert('กรุณาเลือกอย่างน้อย 2 รายการเพื่อรวมเข้าด้วยกัน');
      return;
    }

    const primary = selectedReports[0];
    const secondaries = selectedReports.slice(1);

    if (!confirm(`คุณต้องการรวมรายงานของ ${primary.displayName || 'ผู้ใช้ LINE'} และรายงานที่เลือกอีก ${secondaries.length} รายการเข้าด้วยกันเป็นสไลด์เดียวหรือไม่?`)) {
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch('/api/reports/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primary, secondaries }),
      });

      if (!res.ok) {
        throw new Error('ไม่สามารถรวมรายงานได้');
      }

      // Deselect all and refresh
      setSelectedIndices(new Set());
      await fetchReports(selectedWeek);
    } catch (err: any) {
      alert(err.message || 'เกิดข้อผิดพลาดในการรวมรายงาน');
    } finally {
      setActionLoading(false);
    }
  };

  const toggleShowOriginal = (idx: number) => {
    setShowOriginalMap(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  // Get dynamic styles based on theme
  const styles = getStyles(darkMode);

  return (
    <div style={styles.container}>
      <style>{`
        @media (max-width: 600px) {
          /* Header */
          .bdreport-logo-container { gap: 10px !important; }
          .bdreport-logo-img { width: 44px !important; height: 44px !important; }
          .bdreport-title { font-size: 1rem !important; }
          .bdreport-eyebrow { display: none; }
          .bdreport-tagline { display: none; }

          /* Status bar */
          .bdreport-status-bar { flex-direction: column !important; align-items: flex-start !important; gap: 4px !important; padding: 6px 12px !important; }

          /* Control card */
          .bdreport-control-card { padding: 16px !important; flex-direction: column !important; align-items: stretch !important; }
          .bdreport-selectors-row { flex-direction: column !important; gap: 12px !important; }
          .bdreport-control-group { flex-direction: column !important; align-items: flex-start !important; gap: 6px !important; }
          .bdreport-control-group label { font-size: 0.85rem !important; }
          .bdreport-control-group input,
          .bdreport-control-group select { width: 100% !important; font-size: 0.85rem !important; padding: 8px 10px !important; }
          .bdreport-action-group { flex-direction: column !important; gap: 8px !important; }
          .bdreport-action-group button { width: 100% !important; font-size: 0.85rem !important; padding: 10px 16px !important; }

          /* Report cards */
          .bdreport-report-card { padding: 14px !important; }
          .bdreport-report-header { flex-direction: column !important; align-items: flex-start !important; gap: 6px !important; }
          .bdreport-header-left { flex-wrap: wrap !important; gap: 6px !important; }
          .bdreport-badge { font-size: 0.75rem !important; padding: 3px 8px !important; }
          .bdreport-report-title { font-size: 1rem !important; padding-left: 0 !important; }
          .bdreport-card-content { flex-direction: column !important; padding-left: 0 !important; }
          .bdreport-images-grid { gap: 6px !important; }
          .bdreport-image-wrapper { max-width: 100% !important; flex: 1 1 80px !important; }

          /* Meta row */
          .bdreport-meta-row { flex-direction: column !important; align-items: flex-start !important; gap: 8px !important; }
          .bdreport-date-header { font-size: 0.9rem !important; }

          /* Filter card */
          .bdreport-filter-header { flex-direction: column !important; align-items: flex-start !important; }

          /* Footer */
          .bdreport-footer-sep { display: none; }
          .bdreport-footer-admin { display: block; margin-top: 4px; }

          /* Chips */
          .bdreport-chips { gap: 6px !important; }
          .bdreport-chip { font-size: 0.8rem !important; padding: 6px 12px !important; }
        }

        /* Unified Theme Buttons styling */
        .bdreport-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border-radius: 10px;
          font-size: 0.9rem;
          font-weight: 600;
          padding: 10px 18px;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          user-select: none;
          box-sizing: border-box;
          height: 40px;
          border: none;
          text-decoration: none;
        }

        /* Hover & Active animations */
        .bdreport-btn:hover {
          transform: translateY(-1.5px);
        }
        .bdreport-btn:active {
          transform: translateY(0.5px);
        }
        .bdreport-btn:disabled {
          opacity: 0.55 !important;
          cursor: not-allowed !important;
          transform: none !important;
          box-shadow: none !important;
        }

        /* 1. Refresh Button (Sleek Outline style) */
        .bdreport-btn-refresh {
          background-color: ${darkMode ? 'rgba(51, 65, 85, 0.35)' : 'rgba(241, 245, 249, 0.85)'};
          color: ${darkMode ? '#E2E8F0' : '#334155'};
          border: 1.5px solid ${darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'};
        }
        .bdreport-btn-refresh:hover {
          background-color: ${darkMode ? 'rgba(51, 65, 85, 0.65)' : 'rgba(226, 232, 240, 0.95)'};
          border-color: #EAB308;
          color: #EAB308;
          box-shadow: 0 4px 12px ${darkMode ? 'rgba(234, 179, 8, 0.15)' : 'rgba(234, 179, 8, 0.1)'};
        }

        /* 2. Backup Button (Sleek Outline style) */
        .bdreport-btn-backup {
          background-color: ${darkMode ? 'rgba(30, 41, 59, 0.35)' : 'rgba(255, 255, 255, 0.95)'};
          color: ${darkMode ? '#CBD5E1' : '#475569'};
          border: 1.5px solid ${darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'};
        }
        .bdreport-btn-backup:hover {
          background-color: ${darkMode ? 'rgba(30, 41, 59, 0.65)' : 'rgba(248, 250, 252, 0.95)'};
          border-color: #EAB308;
          color: #EAB308;
          box-shadow: 0 4px 12px ${darkMode ? 'rgba(234, 179, 8, 0.15)' : 'rgba(234, 179, 8, 0.1)'};
        }

        /* 3. Download PPTX Button (Glowing Primary Gold style) */
        .bdreport-btn-download {
          background: linear-gradient(135deg, #FACC15 0%, #EAB308 100%);
          color: #0F172A;
          border: none;
          font-weight: 700;
          box-shadow: 0 4px 16px ${darkMode ? 'rgba(234, 179, 8, 0.35)' : 'rgba(234, 179, 8, 0.25)'};
        }
        .bdreport-btn-download:hover {
          background: linear-gradient(135deg, #FDE047 0%, #F59E0B 100%);
          box-shadow: 0 6px 20px ${darkMode ? 'rgba(234, 179, 8, 0.45)' : 'rgba(234, 179, 8, 0.35)'};
        }

        /* 4. Manage Groups Button (Sleek Outline style, purple/indigo theme) */
        .bdreport-btn-manage-groups {
          background-color: ${darkMode ? 'rgba(99, 102, 241, 0.12)' : 'rgba(99, 102, 241, 0.08)'};
          color: ${darkMode ? '#A5B4FC' : '#4F46E5'};
          border: 1.5px solid ${darkMode ? 'rgba(99, 102, 241, 0.3)' : 'rgba(99, 102, 241, 0.25)'};
        }
        .bdreport-btn-manage-groups:hover {
          background-color: ${darkMode ? 'rgba(99, 102, 241, 0.25)' : 'rgba(99, 102, 241, 0.15)'};
          border-color: #6366F1;
          color: ${darkMode ? '#C7D2FE' : '#4338CA'};
          box-shadow: 0 4px 12px ${darkMode ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.15)'};
        }

        /* Group Manager Modal Styles */
        .bdreport-modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: ${darkMode ? 'rgba(15, 23, 42, 0.65)' : 'rgba(15, 23, 42, 0.4)'};
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          animation: bdreport-fade-in 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .bdreport-modal-card {
          width: 95%;
          max-width: 550px;
          max-height: 80vh;
          background-color: ${darkMode ? '#1E293B' : '#FFFFFF'};
          border: 1px solid ${darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'};
          border-radius: 16px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          animation: bdreport-slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .bdreport-modal-header {
          padding: 16px 20px;
          border-bottom: 1px solid ${darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'};
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .bdreport-modal-title {
          margin: 0;
          font-size: 1.15rem;
          font-weight: 700;
          color: ${darkMode ? '#F8FAFC' : '#0F172A'};
        }

        .bdreport-modal-close {
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          color: ${darkMode ? '#94A3B8' : '#64748B'};
          transition: color 0.15s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          width: 32px;
          height: 32px;
          border-radius: 50%;
        }

        .bdreport-modal-close:hover {
          color: ${darkMode ? '#F1F5F9' : '#0F172A'};
          background-color: ${darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'};
        }

        .bdreport-modal-body {
          padding: 20px;
          overflow-y: auto;
          flex: 1;
        }

        .bdreport-modal-footer {
          padding: 14px 20px;
          border-top: 1px solid ${darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'};
          display: flex;
          justify-content: flex-end;
          background-color: ${darkMode ? 'rgba(15, 23, 42, 0.2)' : 'rgba(248, 250, 252, 0.5)'};
        }

        .bdreport-groups-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .bdreport-group-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 14px;
          background-color: ${darkMode ? 'rgba(51, 65, 85, 0.25)' : 'rgba(241, 245, 249, 0.5)'};
          border: 1px solid ${darkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.03)'};
          border-radius: 10px;
          transition: all 0.2s ease;
        }

        .bdreport-group-row:hover {
          background-color: ${darkMode ? 'rgba(51, 65, 85, 0.4)' : 'rgba(241, 245, 249, 0.85)'};
        }

        .bdreport-group-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
          max-width: 70%;
        }

        .bdreport-group-name {
          font-weight: 600;
          font-size: 0.95rem;
          color: ${darkMode ? '#E2E8F0' : '#1E293B'};
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 6px;
        }

        .bdreport-group-id {
          font-size: 0.72rem;
          color: ${darkMode ? '#64748B' : '#94A3B8'};
          font-family: monospace;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .bdreport-group-status-badge {
          display: inline-flex;
          align-items: center;
          padding: 1.5px 8px;
          border-radius: 10px;
          font-size: 0.68rem;
          font-weight: 700;
        }

        .bdreport-group-status-badge-visible {
          background-color: rgba(16, 185, 129, 0.12);
          color: ${darkMode ? '#34D399' : '#059669'};
        }

        .bdreport-group-status-badge-hidden {
          background-color: rgba(239, 68, 68, 0.12);
          color: ${darkMode ? '#F87171' : '#DC2626'};
        }

        /* Toggle Actions */
        .bdreport-btn-toggle-visibility {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 0.8rem;
          font-weight: 600;
          padding: 6px 12px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
          border: 1.5px solid transparent;
          font-family: inherit;
        }

        .bdreport-btn-toggle-visibility-hide {
          background-color: ${darkMode ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.05)'};
          color: ${darkMode ? '#F87171' : '#DC2626'};
          border-color: ${darkMode ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.2)'};
        }
        .bdreport-btn-toggle-visibility-hide:hover {
          background-color: ${darkMode ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.1)'};
          border-color: #EF4444;
        }

        .bdreport-btn-toggle-visibility-show {
          background-color: ${darkMode ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.05)'};
          color: ${darkMode ? '#34D399' : '#059669'};
          border-color: ${darkMode ? 'rgba(16, 185, 129, 0.25)' : 'rgba(16, 185, 129, 0.2)'};
        }
        .bdreport-btn-toggle-visibility-show:hover {
          background-color: ${darkMode ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.1)'};
          border-color: #10B981;
        }

        .bdreport-modal-btn-close {
          background-color: ${darkMode ? '#334155' : '#F1F5F9'};
          color: ${darkMode ? '#F1F5F9' : '#334155'};
          border: 1px solid ${darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'};
          border-radius: 8px;
          padding: 8px 16px;
          font-weight: 600;
          font-size: 0.88rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .bdreport-modal-btn-close:hover {
          background-color: ${darkMode ? '#475569' : '#E2E8F0'};
        }

        .bdreport-modal-loading {
          text-align: center;
          padding: 30px 0;
          color: ${darkMode ? '#94A3B8' : '#64748B'};
          font-weight: 500;
        }

        @keyframes bdreport-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes bdreport-slide-up {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
      {/* Admin Settings Button */}
      <button 
        onClick={() => setShowGroupManager(true)} 
        onMouseEnter={() => setAdminToggleHovered(true)}
        onMouseLeave={() => setAdminToggleHovered(false)}
        style={{
          ...styles.themeToggleBtn,
          right: '52px',
          opacity: adminToggleHovered ? 0.9 : 0.4,
          fontSize: '1.05rem',
        }}
        title="จัดการกลุ่มแชท (ผู้ดูแลระบบ)"
      >
        ⚙️
      </button>

      {/* Light / Dark Mode Toggle button */}
      <button 
        onClick={() => setDarkMode(!darkMode)} 
        onMouseEnter={() => setToggleHovered(true)}
        onMouseLeave={() => setToggleHovered(false)}
        style={{
          ...styles.themeToggleBtn,
          opacity: toggleHovered ? 0.9 : 0.4,
        }}
        title={darkMode ? "สลับเป็นโหมดสว่าง" : "สลับเป็นโหมดมืด"}
      >
        {darkMode ? '☀️' : '🌙'}
      </button>

      {/* Header: Logo, Title */}
      <header style={styles.header}>
        <div style={styles.logoContainer} className="bdreport-logo-container">
          <img src="/bdreport_logo.jpg" alt="BDReport Logo" style={styles.logoImage} className="bdreport-logo-img" />
          <div style={styles.titleBlock}>
            <div style={styles.titleEyebrow} className="bdreport-eyebrow">การไฟฟ้าฝ่ายผลิตแห่งประเทศไทย · กฟผ.</div>
            <h1 style={styles.logoText} className="bdreport-title">ระบบสรุปรายงานการปฏิบัติงานประจำสัปดาห์</h1>
            <div style={styles.titleTagline} className="bdreport-tagline">Smart Maintenance · Seamless Reporting · Empowering EGAT Infrastructure</div>
          </div>
        </div>
      </header>

      <main style={styles.main}>
        {/* Status bar: Bot status & Connected Group */}
        <div style={styles.topStatusLine} className="bdreport-status-bar">
          <div style={styles.topStatusLeft}>
            <span style={styles.statusOnlineBadge}>●</span>
            <span style={styles.topStatusLabel}>LINE Bot Online</span>
          </div>
          <div style={styles.topStatusRight}>
            <span style={styles.topStatusLabel}>กลุ่ม:</span>
            {(() => {
              const GROUP_COLORS = [
                { bg: 'rgba(59, 130, 246, 0.15)', text: '#60A5FA', textLight: '#1D4ED8', border: 'rgba(59, 130, 246, 0.3)' }, // Blue
                { bg: 'rgba(16, 185, 129, 0.15)', text: '#34D399', textLight: '#047857', border: 'rgba(16, 185, 129, 0.3)' }, // Emerald
                { bg: 'rgba(168, 85, 247, 0.15)', text: '#C084FC', textLight: '#7E22CE', border: 'rgba(168, 85, 247, 0.3)' }, // Purple
                { bg: 'rgba(249, 115, 橙, 0.15)', text: '#FB923C', textLight: '#C2410C', border: 'rgba(249, 115, 22, 0.3)' }, // Orange (Wait: type fix: 22 instead of 橙!)
              ];
              // Let's write the colors array properly with numeric values
              const CLEAN_COLORS = [
                { bg: 'rgba(59, 130, 246, 0.12)', text: '#60A5FA', textLight: '#1D4ED8', border: 'rgba(59, 130, 246, 0.25)' }, // Blue
                { bg: 'rgba(16, 185, 129, 0.12)', text: '#34D399', textLight: '#047857', border: 'rgba(16, 185, 129, 0.25)' }, // Emerald
                { bg: 'rgba(168, 85, 247, 0.12)', text: '#C084FC', textLight: '#7E22CE', border: 'rgba(168, 85, 247, 0.25)' }, // Purple
                { bg: 'rgba(249, 115, 22, 0.12)', text: '#FB923C', textLight: '#C2410C', border: 'rgba(249, 115, 22, 0.25)' }, // Orange
                { bg: 'rgba(236, 72, 153, 0.12)', text: '#F472B6', textLight: '#BE185D', border: 'rgba(236, 72, 153, 0.25)' }, // Pink
                { bg: 'rgba(6, 182, 212, 0.12)', text: '#22D3EE', textLight: '#0369A1', border: 'rgba(6, 182, 212, 0.25)' }, // Cyan
              ];

              return (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                  {groups.length > 0 ? (
                    groups.map((g, idx) => {
                      const color = CLEAN_COLORS[idx % CLEAN_COLORS.length];
                      return (
                        <span
                          key={g.groupId}
                          style={{
                            backgroundColor: color.bg,
                            color: darkMode ? color.text : color.textLight,
                            border: `1.5px solid ${color.border}`,
                            borderRadius: '12px',
                            padding: '3px 10px',
                            fontSize: '0.82rem',
                            fontWeight: 700,
                            display: 'inline-block',
                            maxWidth: '180px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={g.groupName}
                        >
                          {g.groupName}
                        </span>
                      );
                    })
                  ) : (
                    <span
                      style={{
                        backgroundColor: 'rgba(234, 179, 8, 0.12)',
                        color: '#EAB308',
                        border: '1.5px solid rgba(234, 179, 8, 0.25)',
                        borderRadius: '12px',
                        padding: '3px 10px',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                      }}
                    >
                      EGAT IOT
                    </span>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
        {/* Date & Group Selector Section */}
        <section style={styles.controlCard} className="bdreport-control-card">
          <div style={styles.selectorsRow} className="bdreport-selectors-row">
            <div style={styles.controlGroup} className="bdreport-control-group">
              <label style={styles.label} htmlFor="week-picker">เลือกสัปดาห์ที่ดูรายงาน:</label>
              <input
                id="week-picker"
                type="week"
                value={selectedWeek}
                onChange={(e) => setSelectedWeek(e.target.value)}
                style={styles.dateInput}
              />
            </div>

            {/* Group Selection Dropdown */}
            {!loading && groups.length > 0 && (
              <div style={styles.controlGroup} className="bdreport-control-group">
                <label style={styles.label} htmlFor="group-select">เลือกกลุ่มแชท LINE:</label>
                <select
                  id="group-select"
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                  style={styles.selectInput}
                >
                  <option value="all">แสดงทุกกลุ่มแชท ({reports.length} สไลด์)</option>
                  {groups.map(g => {
                    const count = reports.filter(r => r.groupId === g.groupId).length;
                    return (
                      <option key={g.groupId} value={g.groupId}>
                        {g.groupName} ({count} สไลด์)
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
          </div>

          <div style={styles.actionGroup} className="bdreport-action-group">
            <button
              onClick={() => fetchReports(selectedWeek)}
              disabled={loading}
              className="bdreport-btn bdreport-btn-refresh"
            >
              🔄 รีเฟรชข้อมูล
            </button>
            <button
              onClick={handleDownloadImagesZip}
              disabled={loading || reports.length === 0}
              className="bdreport-btn bdreport-btn-backup"
            >
              📦 Backup photo
            </button>

            <button
              onClick={handleDownload}
              disabled={selectedIndices.size === 0}
              className="bdreport-btn bdreport-btn-download"
            >
              📊 สร้างรายงาน PowerPoint ({selectedIndices.size}/{filteredReports.length})
            </button>
          </div>
        </section>

        {/* 4. Collapsible Filter Keywords Section */}
        {!loading && reports.length > 0 && (
          <section style={styles.filterCard}>
            <div style={styles.filterHeader}>
              <div style={{ ...styles.filterHeaderLeft, gap: '6px', flexWrap: 'wrap' }}>
                <span style={{ ...styles.filterStatusText, marginRight: '4px' }}>🗂️ กลุ่มงาน:</span>
                {keywordGroups.map(group => {
                  const allGroupSelected = group.keywords.every(kw => selectedKeywords.includes(kw));
                  return (
                    <button
                      key={group.name}
                      onClick={() => handleToggleGroup(group.keywords)}
                      style={{
                        background: allGroupSelected
                          ? 'linear-gradient(135deg, #1E3A8A 0%, #3B82F6 100%)'
                          : (darkMode ? 'rgba(59,130,246,0.12)' : 'rgba(30,58,138,0.07)'),
                        color: allGroupSelected ? '#fff' : (darkMode ? '#93C5FD' : '#1E3A8A'),
                        border: allGroupSelected ? 'none' : (darkMode ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(30,58,138,0.25)'),
                        borderRadius: '20px',
                        padding: '5px 14px',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        boxShadow: allGroupSelected ? '0 2px 8px rgba(30,58,138,0.25)' : 'none',
                      }}
                    >
                      {allGroupSelected ? '✓ ' : ''}{group.name}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setShowFilterConfig(!showFilterConfig)}
                style={styles.toggleFilterButton}
              >
                {showFilterConfig ? '▲ ซ่อนตัวเลือกการกรอง' : '⚙️ ปรับแต่งตัวกรอง'}
              </button>
            </div>
            
            {showFilterConfig && (
              <div style={styles.filterContent}>
                <div style={styles.filterSubHeader}>
                  <h4 style={styles.colLabel}>🛠️ ตั้งค่าคำสำคัญในการค้นหา:</h4>
                  <div style={styles.filterHeaderActions}>
                    <button onClick={handleKeywordSelectAll} style={styles.linkButtonSmall}>เลือกทั้งหมด</button>
                    <span style={{ color: '#475569' }}>|</span>
                    <button onClick={handleKeywordDeselectAll} style={styles.linkButtonSmall}>ล้างทั้งหมด</button>
                  </div>
                </div>
                
                <div style={styles.filterGrid}>
                  {/* Left Column: Pill Tags Selection */}
                  <div style={styles.filterColLeft}>
                    <h4 style={styles.colLabelSmall}>คำสำคัญเริ่มต้น:</h4>
                    {keywordGroups.map(group => {
                      const allGroupSelected = group.keywords.every(kw => selectedKeywords.includes(kw));
                      return (
                        <div key={group.name} style={{
                          marginBottom: '12px',
                          border: darkMode ? '1px solid rgba(59,130,246,0.35)' : '1px solid rgba(30,58,138,0.2)',
                          borderRadius: '12px',
                          padding: '12px 14px',
                          background: darkMode ? 'rgba(59,130,246,0.06)' : 'rgba(30,58,138,0.04)',
                        }}>
                          <button
                            onClick={() => handleToggleGroup(group.keywords)}
                            style={{
                              display: 'block',
                              width: '100%',
                              textAlign: 'left',
                              background: allGroupSelected
                                ? 'linear-gradient(135deg, #1E3A8A 0%, #3B82F6 100%)'
                                : (darkMode ? 'rgba(59,130,246,0.15)' : 'rgba(30,58,138,0.08)'),
                              color: allGroupSelected ? '#fff' : (darkMode ? '#93C5FD' : '#1E3A8A'),
                              border: allGroupSelected ? 'none' : (darkMode ? '1.5px solid rgba(59,130,246,0.5)' : '1.5px solid rgba(30,58,138,0.3)'),
                              borderRadius: '8px',
                              padding: '10px 16px',
                              fontSize: '1rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              marginBottom: '10px',
                              letterSpacing: '0.02em',
                              boxShadow: allGroupSelected ? '0 4px 10px rgba(30,58,138,0.25)' : 'none',
                              transition: 'all 0.2s',
                            }}
                          >
                            {allGroupSelected ? '✓ ' : '📂 '}{group.name}
                          </button>
                          <div style={styles.chipsContainer}>
                            {group.keywords.map(kw => {
                              const isSelected = selectedKeywords.includes(kw);
                              return (
                                <button
                                  key={kw}
                                  onClick={() => handleToggleKeyword(kw)}
                                  style={{
                                    ...(isSelected ? styles.keywordChipActive : styles.keywordChipInactive),
                                    fontSize: '0.8rem',
                                    padding: '5px 12px',
                                  }}
                                >
                                  {isSelected ? '✓ ' : ''}{kw}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Right Column: Custom Text Input */}
                  <div style={styles.filterColRight}>
                    <h4 style={styles.colLabelSmall}>คำค้นหาเพิ่มเติมอื่น ๆ (คั่นด้วยจุลภาค , ):</h4>
                    <input
                      id="custom-keywords"
                      type="text"
                      value={customKeywordInput}
                      onChange={(e) => setCustomKeywordInput(e.target.value)}
                      placeholder="เช่น ซ่อมบำรุง, ติดตั้ง, ปรับปรุง..."
                      style={styles.customKeywordInput}
                    />
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Date Indicator and Select Actions */}
        {thaiWeekRange && (
          <div style={styles.metaRow} className="bdreport-meta-row">
            <div style={styles.dateHeader} className="bdreport-date-header">
              <span>📅 รายงานประจำสัปดาห์: </span>
              <strong style={styles.dateHighlight}>{thaiWeekRange}</strong>
            </div>
            {filteredReports.length > 0 && (
              <div style={styles.bulkActions}>
                {selectedIndices.size >= 2 && (
                  <button onClick={handleMergeSelected} style={styles.mergeButton}>
                    🔗 รวมเป็นงานเดียวกัน ({selectedIndices.size})
                  </button>
                )}
                <button onClick={handleSelectAll} style={styles.linkButton}>เลือกสไลด์ทั้งหมด ({filteredReports.length})</button>
                <span style={{ color: '#475569' }}>|</span>
                <button onClick={handleDeselectAll} style={styles.linkButton}>ล้างทั้งหมด</button>
              </div>
            )}
          </div>
        )}

        {/* Top Pagination Control Row */}
        {!loading && filteredReports.length > 0 && (
          <div style={styles.paginationRow} className="bdreport-pagination-row">
            <div style={styles.paginationLeft}>
              <label style={styles.paginationLabel} htmlFor="per-page-select">แสดงหน้าละ:</label>
              <select
                id="per-page-select"
                value={itemsPerPage}
                onChange={(e) => setItemsPerPage(Number(e.target.value))}
                style={styles.selectInputSmall}
              >
                <option value={5}>5 รายการ</option>
                <option value={10}>10 รายการ</option>
                <option value={20}>20 รายการ</option>
                <option value={-1}>แสดงทั้งหมด</option>
              </select>
              <span style={styles.paginationTotal}>
                (ทั้งหมด {filteredReports.length} รายการ)
              </span>
            </div>

            {/* View Mode Toggle Controls */}
            <div style={styles.viewModeToggleContainer}>
              <button
                onClick={() => setViewMode('detailed')}
                style={{
                  ...styles.viewModeButton,
                  backgroundColor: viewMode === 'detailed' ? '#EAB308' : (darkMode ? '#334155' : '#E2E8F0'),
                  color: viewMode === 'detailed' ? '#0F172A' : (darkMode ? '#F8FAFC' : '#0F172A'),
                }}
              >
                📱 ลิสต์ใหญ่
              </button>
              <button
                onClick={() => setViewMode('compact')}
                style={{
                  ...styles.viewModeButton,
                  backgroundColor: viewMode === 'compact' ? '#EAB308' : (darkMode ? '#334155' : '#E2E8F0'),
                  color: viewMode === 'compact' ? '#0F172A' : (darkMode ? '#F8FAFC' : '#0F172A'),
                }}
              >
                ⬜ ตารางเล็ก
              </button>
            </div>

            {itemsPerPage !== -1 && totalPages > 1 && (
              <div style={styles.paginationRight}>
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  style={{
                    ...styles.paginationButton,
                    opacity: currentPage === 1 ? 0.5 : 1,
                    cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                  }}
                >
                  ◀ ย้อนกลับ
                </button>
                <span style={styles.pageIndicator}>
                  หน้า {currentPage} / {totalPages}
                </span>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  style={{
                    ...styles.paginationButton,
                    opacity: currentPage === totalPages ? 0.5 : 1,
                    cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                  }}
                >
                  ถัดไป ▶
                </button>
              </div>
            )}
          </div>
        )}

        {/* Status Messages */}
        {(loading || actionLoading) && (
          <div style={styles.loadingContainer}>
            <div style={styles.spinner}></div>
            <p>{actionLoading ? 'กำลังบันทึกข้อมูล...' : 'กำลังค้นหาข้อมูลจากระบบ...'}</p>
          </div>
        )}

        {error && !loading && !actionLoading && (
          <div style={styles.errorCard}>
            <p>⚠️ {error}</p>
          </div>
        )}

        {/* Reports List */}
        {!loading && !actionLoading && !error && reports.length === 0 && (
          <div style={styles.emptyCard}>
            <p style={{ fontSize: '1.2rem', marginBottom: '8px' }}>📭 ไม่พบรายงานของสัปญหาดนี้</p>
            <p style={{ color: styles.emptyCardSubText?.color || '#94A3B8', fontSize: '0.9rem' }}>สมาชิกในทีมยังไม่ได้ส่งรายงานผ่านแชทบอท LINE</p>
          </div>
        )}

        {!loading && !actionLoading && reports.length > 0 && filteredReports.length === 0 && (
          <div style={styles.emptyCard}>
            <p style={{ fontSize: '1.2rem', marginBottom: '8px' }}>🔍 ไม่พบข้อมูลที่ตรงกับคำสำคัญที่คุณเลือก</p>
            <p style={{ color: styles.emptyCardSubText?.color || '#94A3B8', fontSize: '0.9rem' }}>ลองคลิกปรับแต่งตัวกรองด้านบนเพื่อตั้งค่าคำค้นหาใหม่</p>
          </div>
        )}

        {!loading && !actionLoading && filteredReports.length > 0 && (
          viewMode === 'compact' ? (
            <div style={styles.compactGrid}>
              {paginatedReports.map((report) => {
                const originalIndex = reports.indexOf(report);
                const isSelected = selectedIndices.has(originalIndex);
                const hasBeenEdited = report.isEdited;
                const firstImageId = report.imageIds && report.imageIds.length > 0 
                  ? report.imageIds[0] 
                  : null;

                return (
                  <div
                    key={originalIndex}
                    onClick={() => handleToggleSelect(originalIndex)}
                    className="bdreport-compact-card"
                    style={{
                      ...styles.compactCard,
                      backgroundColor: styles.reportCardBg?.backgroundColor,
                      boxShadow: isSelected ? '0 0 12px rgba(234, 179, 8, 0.25)' : styles.reportCardShadow?.boxShadow,
                      border: `1.5px solid ${isSelected ? '#EAB308' : (styles.reportCardBorderColor?.borderColor || 'rgba(255,255,255,0.05)')}`,
                      opacity: isSelected ? 1 : 0.65,
                    }}
                  >
                    {/* Thumbnail top half */}
                    <div style={styles.compactCardImageContainer}>
                      {firstImageId ? (
                        <img 
                          src={`/api/reports/image?id=${firstImageId}`} 
                          alt={report.title} 
                          style={styles.compactCardImage} 
                          loading="lazy" 
                        />
                      ) : (
                        <div style={styles.compactCardNoImage}>🖼️ ไม่มีรูปภาพ</div>
                      )}
                      {/* Selection Checkbox Overlay */}
                      <div style={styles.compactCardCheckboxOverlay}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                          style={styles.checkboxSmall}
                        />
                      </div>
                      {/* Group Badge Overlay */}
                      {report.groupName && (
                        <div style={styles.compactCardGroupOverlay}>
                          {report.groupName}
                        </div>
                      )}
                    </div>
                    
                    {/* Info bottom half */}
                    <div style={styles.compactCardInfo}>
                      <div style={styles.compactCardUserRow}>
                        <span style={styles.compactCardUser}>
                          👷 {report.displayName || `ผู้ใช้ LINE (${report.userId.substring(0, 6)})`}
                        </span>
                        {hasBeenEdited && <span style={styles.compactEditedDot} title="แก้ไขแล้ว">📝</span>}
                      </div>
                      <h4 style={styles.compactCardTitle} title={report.summary.join('\n')}>
                        {report.summary.join(' ')}
                      </h4>
                      <div style={styles.compactCardTime}>
                        📅 {report.date}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={styles.reportsGrid}>
              {paginatedReports.map((report) => {
              const originalIndex = reports.indexOf(report);
              const isSelected = selectedIndices.has(originalIndex);
              const isCurrentlyEditing = editingIndex === originalIndex;
              const hasBeenEdited = report.isEdited;
              const showOriginal = !!showOriginalMap[originalIndex];

              return (
                <article 
                  key={originalIndex} 
                  className="bdreport-report-card"
                  style={{
                    ...styles.reportCard,
                    borderColor: isSelected ? '#EAB308' : styles.reportCardBorderColor?.borderColor,
                    opacity: isSelected ? 1 : 0.6,
                    backgroundColor: styles.reportCardBg?.backgroundColor,
                    boxShadow: styles.reportCardShadow?.boxShadow,
                    border: `1px solid ${isSelected ? '#EAB308' : (styles.reportCardBorderColor?.borderColor || 'rgba(255,255,255,0.05)')}`,
                    borderRadius: '16px',
                    padding: '24px',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={styles.reportHeader} className="bdreport-report-header">
                    <div style={styles.headerLeft} className="bdreport-header-left">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(originalIndex)}
                        style={styles.checkbox}
                      />
                      <div style={styles.userBadge} className="bdreport-badge">
                        ผู้รายงาน: {report.displayName || `ผู้ใช้ LINE (${report.userId.substring(0, 6)})`}
                      </div>
                      <div style={styles.groupBadge} className="bdreport-badge">
                        ห้องแชท: {report.groupName || 'กลุ่มทั่วไป'}
                      </div>
                      {hasBeenEdited && (
                        <span style={styles.editedBadge}>📝 แก้ไขแล้ว</span>
                      )}
                    </div>
                    <span style={styles.reportTime}>
                      📅 วันที่ {report.date} เวลา {report.time || '--:--'} น.
                    </span>
                  </div>

                  <h3 style={styles.reportTitle} className="bdreport-report-title">{report.title}</h3>

                  <div style={styles.cardContent} className="bdreport-card-content">
                    {/* Text / Summary Section */}
                    <div style={styles.textSection}>
                      <div style={styles.textSectionHeader}>
                        <h4 style={styles.sectionLabel}>📝 รายละเอียดงาน:</h4>
                        {!isCurrentlyEditing && (
                          <div style={styles.editActions}>
                            <button
                              onClick={() => startEditing(originalIndex, report)}
                              style={styles.editButton}
                            >
                              ✏️ แก้ไขเนื้อหา
                            </button>
                            {hasBeenEdited && (
                              <>
                                <button
                                  onClick={() => toggleShowOriginal(originalIndex)}
                                  style={styles.originalToggleButton}
                                >
                                  {showOriginal ? '🙈 ซ่อนข้อความเดิม' : '👁️ ดูข้อความเดิม'}
                                </button>
                                <button
                                  onClick={() => revertEdit(report)}
                                  style={styles.revertButton}
                                >
                                  ↩️ ย้อนกลับ
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      {isCurrentlyEditing ? (
                        <div style={styles.editingBlock}>
                          <p style={styles.editingTip}>คำแนะนำ: พิมพ์ 1 บรรทัดต่อ 1 บรรทัดสรุปงาน (แยกบรรทัดจะกลายเป็น Bullet Point ต่าง ๆ)</p>
                          <textarea
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            style={styles.textarea}
                            rows={5}
                          />
                          <div style={styles.editButtonGroup}>
                            <button
                              onClick={() => saveEdit(originalIndex, report)}
                              style={styles.saveBtn}
                            >
                              💾 บันทึกทับ
                            </button>
                            <button
                              onClick={cancelEditing}
                              style={styles.cancelBtn}
                            >
                              ยกเลิก
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <ul style={styles.list}>
                            {report.summary.map((task, idx) => (
                              <li key={idx} style={styles.listItem}>{task}</li>
                            ))}
                          </ul>

                          {/* Show Original Message Block if toggled */}
                          {hasBeenEdited && showOriginal && report.originalSummary && (
                            <div style={styles.originalSummaryBox}>
                              <div style={styles.originalSummaryHeader}>💬 ข้อความต้นฉบับส่งจาก LINE:</div>
                              <ul style={styles.originalList}>
                                {report.originalSummary.map((originalTask, idx) => (
                                  <li key={idx} style={styles.originalListItem}>{originalTask}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    <div style={styles.imageSection}>
                      <h4 style={styles.sectionLabel}>🖼️ รูปภาพประกอบ:</h4>
                      {report.imageIds && report.imageIds.length > 0 ? (
                        <div style={styles.imagesGrid} className="bdreport-images-grid">
                          {report.imageIds.map((imageId, idx) => (
                            <div key={idx} style={styles.imageWrapper} className="bdreport-image-wrapper">
                              <img
                                src={`/api/reports/image?id=${imageId}`}
                                alt={`ภาพประกอบ ${idx + 1}`}
                                style={styles.image}
                                loading="lazy"
                              />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={styles.noImage}>ไม่มีรูปถ่ายแนบมาด้วย</div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          )
        )}

        {/* Bottom Pagination Controls */}
        {!loading && filteredReports.length > 0 && itemsPerPage !== -1 && totalPages > 1 && (
          <div style={{ ...styles.paginationRow, marginTop: '24px', justifyContent: 'center' }} className="bdreport-pagination-row">
            <div style={styles.paginationRight}>
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                style={{
                  ...styles.paginationButton,
                  opacity: currentPage === 1 ? 0.5 : 1,
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                }}
              >
                ◀ ย้อนกลับ
              </button>
              <span style={styles.pageIndicator}>
                หน้า {currentPage} / {totalPages}
              </span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                style={{
                  ...styles.paginationButton,
                  opacity: currentPage === totalPages ? 0.5 : 1,
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                }}
              >
                ถัดไป ▶
              </button>
            </div>
          </div>
        )}
      </main>

      <footer style={styles.footer}>
        <p>
          <span>© 2026 EGAT BDReport</span>
          <span className="bdreport-footer-sep"> &nbsp;·&nbsp; </span>
          <span className="bdreport-footer-admin">ผู้ดูแลระบบ: นายตวงเพชร ชัยยานนท์ วศ.4 หบอว-ธ. กบห-ธ. ชธธ.</span>
        </p>
      </footer>

      {showGroupManager && (
        <div className="bdreport-modal-backdrop" onClick={() => setShowGroupManager(false)}>
          <div className="bdreport-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="bdreport-modal-header">
              <h3 className="bdreport-modal-title">
                {isAdminAuthenticated ? '⚙️ แผงควบคุมผู้ดูแลระบบ' : '🔒 เข้าสู่ระบบผู้ดูแลระบบ'}
              </h3>
              <button onClick={() => setShowGroupManager(false)} className="bdreport-modal-close">&times;</button>
            </div>
            
            <div className="bdreport-modal-body">
              {!isAdminAuthenticated ? (
                <form onSubmit={handleVerifyAdminPassword} style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '10px 0' }}>
                  <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '8px' }}>🔒</div>
                    <div style={{ fontWeight: 600, color: darkMode ? '#F8FAFC' : '#0F172A' }}>ป้อนรหัสผ่านเพื่อเข้าสู่โหมดผู้ดูแลระบบ</div>
                    <div style={{ fontSize: '0.85rem', color: darkMode ? '#94A3B8' : '#64748B', marginTop: '4px' }}>
                      เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถจัดการข้อมูลระบบได้
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <input
                      type="password"
                      placeholder="รหัสผ่านผู้ดูแลระบบ"
                      value={adminPasswordInput}
                      onChange={(e) => setAdminPasswordInput(e.target.value)}
                      autoFocus
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        backgroundColor: darkMode ? '#0F172A' : '#F1F5F9',
                        border: `1.5px solid ${adminPasswordError ? '#EF4444' : (darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)')}`,
                        color: darkMode ? '#F8FAFC' : '#0F172A',
                        fontSize: '0.95rem',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                    {adminPasswordError && (
                      <span style={{ color: '#EF4444', fontSize: '0.8rem', fontWeight: 600 }}>
                        ⚠️ {adminPasswordError}
                      </span>
                    )}
                  </div>
                  
                  <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                    <button
                      type="submit"
                      className="bdreport-btn bdreport-btn-download"
                      style={{ flex: 1, height: '38px', fontSize: '0.9rem' }}
                    >
                      ยืนยันรหัสผ่าน
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowGroupManager(false)}
                      className="bdreport-modal-btn-close"
                      style={{ flex: 1, height: '38px', fontSize: '0.9rem', border: `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}` }}
                    >
                      ยกเลิก
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  {/* Tab Selector */}
                  <div style={{ display: 'flex', borderBottom: `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`, margin: '0 -20px 16px -20px', padding: '0 20px' }}>
                    <button
                      onClick={() => setAdminTab('groups')}
                      style={{
                        flex: 1,
                        padding: '12px',
                        background: 'none',
                        border: 'none',
                        borderBottom: adminTab === 'groups' ? '2.5px solid #6366F1' : 'none',
                        color: adminTab === 'groups' ? (darkMode ? '#F8FAFC' : '#4F46E5') : (darkMode ? '#94A3B8' : '#64748B'),
                        fontWeight: 750,
                        cursor: 'pointer',
                        fontSize: '0.92rem',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      👥 จัดการกลุ่มแชท LINE
                    </button>
                    <button
                      onClick={() => setAdminTab('keywords')}
                      style={{
                        flex: 1,
                        padding: '12px',
                        background: 'none',
                        border: 'none',
                        borderBottom: adminTab === 'keywords' ? '2.5px solid #6366F1' : 'none',
                        color: adminTab === 'keywords' ? (darkMode ? '#F8FAFC' : '#4F46E5') : (darkMode ? '#94A3B8' : '#64748B'),
                        fontWeight: 750,
                        cursor: 'pointer',
                        fontSize: '0.92rem',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      🗂️ จัดการกลุ่มคำสำคัญ
                    </button>
                  </div>

                  {/* Tab 1: Group Visibility */}
                  {adminTab === 'groups' && (
                    <>
                      {/* Weekly Push Global settings */}
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        padding: '14px',
                        backgroundColor: darkMode ? 'rgba(30, 41, 59, 0.5)' : 'rgba(241, 245, 249, 0.8)',
                        border: `1px solid ${darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                        borderRadius: '8px',
                        marginBottom: '14px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: darkMode ? '#F8FAFC' : '#1E293B' }}>
                            📅 ตั้งค่าวันส่งรายงานสรุปอัตโนมัติ:
                          </span>
                          <select
                            value={weeklyPushDay}
                            onChange={(e) => handleSaveWeeklyPushSettings(Number(e.target.value), weeklyPushHour)}
                            style={{
                              padding: '6px 12px',
                              borderRadius: '6px',
                              backgroundColor: darkMode ? '#0F172A' : '#FFFFFF',
                              border: `1.5px solid ${darkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)'}`,
                              color: darkMode ? '#F8FAFC' : '#0F172A',
                              fontSize: '0.85rem',
                              fontWeight: 600,
                              outline: 'none',
                              cursor: 'pointer'
                            }}
                          >
                            <option value={1}>วันจันทร์ (Monday)</option>
                            <option value={2}>วันอังคาร (Tuesday)</option>
                            <option value={3}>วันพุธ (Wednesday)</option>
                            <option value={4}>วันพฤหัสบดี (Thursday)</option>
                            <option value={5}>วันศุกร์ (Friday)</option>
                            <option value={6}>วันเสาร์ (Saturday)</option>
                            <option value={0}>วันอาทิตย์ (Sunday)</option>
                            <option value={-1}>❌ ปิดการส่งรายงานอัตโนมัติ</option>
                          </select>
                        </div>

                        {weeklyPushDay !== -1 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', borderTop: `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`, paddingTop: '8px' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: darkMode ? '#F8FAFC' : '#1E293B' }}>
                              ⏰ ตั้งค่าเวลาส่งอัตโนมัติ:
                            </span>
                            <select
                              value={weeklyPushHour}
                              onChange={(e) => handleSaveWeeklyPushSettings(weeklyPushDay, Number(e.target.value))}
                              style={{
                                padding: '6px 12px',
                                borderRadius: '6px',
                                backgroundColor: darkMode ? '#0F172A' : '#FFFFFF',
                                border: `1.5px solid ${darkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)'}`,
                                color: darkMode ? '#F8FAFC' : '#0F172A',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                outline: 'none',
                                cursor: 'pointer'
                              }}
                            >
                              {Array.from({ length: 24 }).map((_, hr) => (
                                <option key={hr} value={hr}>
                                  {String(hr).padStart(2, '0')}:00 น.
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>

                      {/* Manual trigger section */}
                      <div style={{ 
                        display: 'flex', 
                        flexDirection: 'column',
                        gap: '8px', 
                        padding: '12px', 
                        backgroundColor: darkMode ? 'rgba(99, 102, 241, 0.08)' : 'rgba(79, 70, 229, 0.04)',
                        border: `1.5px dashed ${darkMode ? 'rgba(99, 102, 241, 0.3)' : 'rgba(79, 70, 229, 0.2)'}`,
                        borderRadius: '8px',
                        marginBottom: '16px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: darkMode ? '#818CF8' : '#4F46E5' }}>
                            🚀 ตัวช่วยส่งรายงานแมนนวล:
                          </span>
                          <span style={{ fontSize: '0.72rem', color: darkMode ? '#94A3B8' : '#64748B' }}>
                            (ส่งสไลด์สรุปสัปดาห์ที่แล้ว เข้า LINE ของแต่ละกลุ่มทันที)
                          </span>
                        </div>
                        <button
                          type="button"
                          disabled={isPushingWeeklyReports}
                          onClick={handleManualWeeklyPush}
                          className="bdreport-btn"
                          style={{
                            height: '38px',
                            fontSize: '0.88rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            background: isPushingWeeklyReports ? '#64748B' : 'linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)',
                            border: 'none',
                            color: '#FFFFFF',
                            cursor: isPushingWeeklyReports ? 'not-allowed' : 'pointer',
                            opacity: isPushingWeeklyReports ? 0.7 : 1
                          }}
                        >
                          {isPushingWeeklyReports ? '⏳ กำลังส่งรายงานสไลด์เข้า LINE...' : '✉️ ส่งรายงานสไลด์เข้าห้องแชท LINE ของทุกกลุ่มทันที'}
                        </button>
                      </div>

                      {loadingAllGroups ? (
                        <div className="bdreport-modal-loading">กำลังโหลดรายชื่อกลุ่มแชท...</div>
                      ) : allGroups.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '30px 0', color: '#94A3B8', fontWeight: 500 }}>ไม่พบกลุ่มแชทในระบบ</div>
                      ) : (
                        <div className="bdreport-groups-list">
                          {allGroups.map((g) => (
                            <div key={g.groupId} className="bdreport-group-row" style={{ padding: '14px 12px' }}>
                              <div className="bdreport-group-info">
                                <div className="bdreport-group-name" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                                  <span style={{ fontWeight: 700 }}>{g.groupName}</span>
                                  <span className={`bdreport-group-status-badge ${g.isHidden ? 'bdreport-group-status-badge-hidden' : 'bdreport-group-status-badge-visible'}`}>
                                    {g.isHidden ? 'ซ่อนจากเว็บ' : 'แสดงบนเว็บ'}
                                  </span>
                                  <span className={`bdreport-group-status-badge`} style={{
                                    backgroundColor: g.disableWeeklyPush ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                                    color: g.disableWeeklyPush ? (darkMode ? '#F87171' : '#DC2626') : (darkMode ? '#34D399' : '#059669'),
                                    border: g.disableWeeklyPush ? '1px solid rgba(239, 68, 68, 0.25)' : '1px solid rgba(16, 185, 129, 0.25)'
                                  }}>
                                    {g.disableWeeklyPush ? '🔕 ปิดออโต้' : '🔔 ส่งออโต้'}
                                  </span>
                                </div>
                                <div className="bdreport-group-id" title={g.groupId}>ID: {g.groupId}</div>
                              </div>
                              <div className="bdreport-group-actions" style={{ display: 'flex', gap: '8px' }}>
                                <button
                                  type="button"
                                  onClick={() => toggleGroupVisibility(g.groupId, g.isHidden)}
                                  className={`bdreport-btn-toggle-visibility ${g.isHidden ? 'bdreport-btn-toggle-visibility-show' : 'bdreport-btn-toggle-visibility-hide'}`}
                                  style={{ padding: '6px 10px', fontSize: '0.78rem' }}
                                >
                                  {g.isHidden ? '👁️ แสดงหน้าแรก' : '🚫 ซ่อนหน้าแรก'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleWeeklyPush(g.groupId, g.disableWeeklyPush)}
                                  className={`bdreport-btn-toggle-visibility ${g.disableWeeklyPush ? 'bdreport-btn-toggle-visibility-show' : 'bdreport-btn-toggle-visibility-hide'}`}
                                  style={{ 
                                    padding: '6px 10px', 
                                    fontSize: '0.78rem',
                                    backgroundColor: g.disableWeeklyPush ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                    color: g.disableWeeklyPush ? (darkMode ? '#34D399' : '#059669') : (darkMode ? '#F87171' : '#DC2626'),
                                    border: g.disableWeeklyPush ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(239, 68, 68, 0.4)'
                                  }}
                                >
                                  {g.disableWeeklyPush ? '🔔 เปิดส่งออโต้' : '🔕 ปิดส่งออโต้'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleManualGroupPush(g.groupId, g.groupName)}
                                  className="bdreport-btn-toggle-visibility"
                                  style={{
                                    padding: '6px 10px',
                                    fontSize: '0.78rem',
                                    backgroundColor: 'rgba(79, 70, 229, 0.12)',
                                    color: darkMode ? '#A5B4FC' : '#4F46E5',
                                    border: '1px solid rgba(79, 70, 229, 0.35)',
                                    fontWeight: 'bold'
                                  }}
                                >
                                  ✈️ ส่งด่วน
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {/* Tab 2: Keyword Group Management */}
                  {adminTab === 'keywords' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      
                      {/* List of current keyword groups */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <h4 style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 700, color: darkMode ? '#F8FAFC' : '#1E293B' }}>
                          📋 กลุ่มคำสำคัญในปัจจุบัน ({keywordGroups.length})
                        </h4>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto', paddingRight: '4px' }}>
                          {keywordGroups.map((group) => {
                            const isSystemDefault = !group.id || group.name === 'งานบำรุงรักษา';
                            return (
                              <div
                                key={group.id || group.name}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '10px 12px',
                                  backgroundColor: darkMode ? 'rgba(51, 65, 85, 0.25)' : 'rgba(241, 245, 249, 0.6)',
                                  border: `1px solid ${darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}`,
                                  borderRadius: '8px'
                                }}
                              >
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '85%' }}>
                                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: darkMode ? '#E2E8F0' : '#1E293B' }}>
                                    {group.name} {isSystemDefault && <span style={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: 500 }}>(ค่าเริ่มต้นระบบ)</span>}
                                  </div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                    {group.keywords.map((kw: string) => (
                                      <span
                                        key={kw}
                                        style={{
                                          fontSize: '0.7rem',
                                          padding: '2px 6px',
                                          backgroundColor: darkMode ? '#334155' : '#E2E8F0',
                                          color: darkMode ? '#94A3B8' : '#475569',
                                          borderRadius: '4px'
                                        }}
                                      >
                                        {kw}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                                
                                {!isSystemDefault && (
                                  <button
                                    type="button"
                                    onClick={() => group.id && handleDeleteKeywordGroup(group.id)}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      fontSize: '1.1rem',
                                      cursor: 'pointer',
                                      padding: '6px',
                                      borderRadius: '6px',
                                      color: '#EF4444',
                                      transition: 'background-color 0.2s'
                                    }}
                                    title="ลบกลุ่มคำสำคัญนี้"
                                  >
                                    🗑️
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Create new group form */}
                      <form onSubmit={handleSaveKeywordGroup} style={{ borderTop: `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`, paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <h4 style={{ margin: '0', fontSize: '0.95rem', fontWeight: 700, color: darkMode ? '#F8FAFC' : '#1E293B' }}>
                          ➕ สร้างกลุ่มคำสำคัญใหม่
                        </h4>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: darkMode ? '#94A3B8' : '#475569' }}>ชื่อกลุ่มงาน:</label>
                          <input
                            type="text"
                            placeholder="เช่น งานก่อสร้าง, งานระบบไฟฟ้า..."
                            value={newKeywordGroupName}
                            onChange={(e) => setNewKeywordGroupName(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              borderRadius: '6px',
                              backgroundColor: darkMode ? '#0F172A' : '#F1F5F9',
                              border: `1px solid ${darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                              color: darkMode ? '#F8FAFC' : '#0F172A',
                              fontSize: '0.88rem',
                              outline: 'none',
                              boxSizing: 'border-box'
                            }}
                          />
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: darkMode ? '#94A3B8' : '#475569' }}>คำสำคัญสำหรับค้นหา (เพิ่มทีละคำ):</label>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                              type="text"
                              placeholder="คำสำหรับค้นหา (เช่น ก่อสร้าง, อิฐ, ปูน)"
                              value={currentNewKeywordInput}
                              onChange={(e) => setCurrentNewKeywordInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleAddNewKeywordWord();
                                }
                              }}
                              style={{
                                flex: 1,
                                padding: '8px 12px',
                                borderRadius: '6px',
                                backgroundColor: darkMode ? '#0F172A' : '#F1F5F9',
                                border: `1px solid ${darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                                color: darkMode ? '#F8FAFC' : '#0F172A',
                                fontSize: '0.88rem',
                                outline: 'none',
                                boxSizing: 'border-box'
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => handleAddNewKeywordWord()}
                              style={{
                                padding: '8px 16px',
                                borderRadius: '6px',
                                backgroundColor: darkMode ? '#334155' : '#E2E8F0',
                                color: darkMode ? '#E2E8F0' : '#1E293B',
                                border: 'none',
                                fontWeight: 700,
                                fontSize: '0.85rem',
                                cursor: 'pointer'
                              }}
                            >
                              เพิ่มคำ
                            </button>
                          </div>
                          
                          {/* Display added keywords in new group */}
                          {newKeywordList.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px', padding: '10px', backgroundColor: darkMode ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.03)', borderRadius: '8px' }}>
                              {newKeywordList.map((word) => (
                                <span
                                  key={word}
                                  onClick={() => handleRemoveNewKeywordWord(word)}
                                  style={{
                                    fontSize: '0.78rem',
                                    padding: '4px 10px',
                                    backgroundColor: 'rgba(99, 102, 241, 0.12)',
                                    color: darkMode ? '#A5B4FC' : '#4F46E5',
                                    border: '1px solid rgba(99, 102, 241, 0.25)',
                                    borderRadius: '20px',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}
                                  title="คลิกเพื่อลบคำนี้"
                                >
                                  {word} &times;
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <button
                          type="submit"
                          className="bdreport-btn bdreport-btn-download"
                          style={{ width: '100%', height: '40px', fontSize: '0.9rem', marginTop: '6px', border: 'none' }}
                        >
                          💾 บันทึกกลุ่มคำสำคัญใหม่
                        </button>
                      </form>
                    </div>
                  )}
                </>
              )}
            </div>
            
            {isAdminAuthenticated && (
              <div className="bdreport-modal-footer">
                <button onClick={() => setShowGroupManager(false)} className="bdreport-modal-btn-close">
                  ปิดหน้าต่าง
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Function to generate dynamic styles
function getStyles(darkMode: boolean): Record<string, React.CSSProperties> {
  const theme = {
    bg: darkMode ? '#0F172A' : '#F8FAFC',
    text: darkMode ? '#F8FAFC' : '#0F172A',
    textSecondary: darkMode ? '#94A3B8' : '#475569',
    cardBg: darkMode ? 'rgba(30, 41, 59, 0.7)' : '#FFFFFF',
    cardBorder: darkMode ? '1px solid rgba(255, 255, 255, 0.05)' : '1px solid rgba(0, 0, 0, 0.08)',
    cardShadow: darkMode ? '0 8px 32px 0 rgba(0, 0, 0, 0.3)' : '0 4px 20px rgba(148, 163, 184, 0.15)',
    inputBg: darkMode ? '#0F172A' : '#FFFFFF',
    inputBorder: darkMode ? '#475569' : '#CBD5E1',
    inputText: darkMode ? '#F8FAFC' : '#0F172A',
    
    reportCardBg: darkMode ? 'rgba(30, 41, 59, 0.5)' : '#FFFFFF',
    reportCardBorderColor: darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.08)',
    reportCardShadow: darkMode ? '0 4px 20px rgba(0, 0, 0, 0.15)' : '0 4px 20px rgba(148, 163, 184, 0.08)',
    originalBoxBg: darkMode ? 'rgba(15, 23, 42, 0.4)' : '#F1F5F9',
    originalBoxBorder: darkMode ? '#475569' : '#94A3B8',
    itemText: darkMode ? '#E2E8F0' : '#1E293B',
  };

  return {
    container: {
      backgroundColor: theme.bg,
      color: theme.text,
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "'Inter', 'Segoe UI', Roboto, sans-serif",
      padding: '20px 16px 40px 16px',
      position: 'relative',
      transition: 'background-color 0.3s ease, color 0.3s ease',
    },
    themeToggleBtn: {
      position: 'absolute',
      top: '12px',
      right: '16px',
      backgroundColor: 'transparent',
      border: 'none',
      color: theme.textSecondary,
      fontSize: '1rem',
      cursor: 'pointer',
      transition: 'opacity 0.2s',
      zIndex: 100,
      lineHeight: 1,
    },
    topStatusLine: {
      background: darkMode ? 'rgba(30, 41, 59, 0.4)' : 'rgba(255, 255, 255, 0.85)',
      border: theme.cardBorder,
      borderRadius: '8px',
      padding: '6px 14px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '4px',
      marginBottom: '16px',
      fontSize: '0.8rem',
      boxShadow: theme.cardShadow,
      transition: 'all 0.3s ease',
    },
    topStatusLeft: {
      display: 'flex',
      alignItems: 'center',
      gap: '5px',
    },
    topStatusRight: {
      display: 'flex',
      alignItems: 'center',
      gap: '5px',
      overflow: 'hidden',
    },
    topStatusLabel: {
      color: theme.textSecondary,
      fontWeight: 500,
      whiteSpace: 'nowrap',
    },
    groupNameHighlight: {
      color: '#EAB308',
      fontWeight: 700,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      maxWidth: '160px',
    },
    statusOnlineBadge: {
      color: '#10B981',
      fontWeight: 700,
      textShadow: darkMode ? '0 0 10px rgba(16, 185, 129, 0.4)' : 'none',
    },
    header: {
      maxWidth: '1200px',
      width: '100%',
      margin: '0 auto 20px auto',
      textAlign: 'left' as const,
    },
    logoContainer: {
      display: 'flex',
      alignItems: 'center',
      gap: '14px',
    },
    logoImage: {
      width: '56px',
      height: '56px',
      borderRadius: '12px',
      border: darkMode ? '1.5px solid rgba(234, 179, 8, 0.5)' : '1.5px solid rgba(234, 179, 8, 0.6)',
      boxShadow: darkMode ? '0 4px 20px rgba(234, 179, 8, 0.2)' : '0 4px 16px rgba(234, 179, 8, 0.15)',
      objectFit: 'cover' as const,
      flexShrink: 0,
    },
    titleBlock: {
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'flex-start',
      gap: '2px',
      minWidth: 0,
    },
    titleEyebrow: {
      fontSize: '0.7rem',
      fontWeight: 600,
      letterSpacing: '0.1em',
      textTransform: 'uppercase' as const,
      color: darkMode ? 'rgba(234, 179, 8, 0.7)' : 'rgba(160, 110, 0, 0.85)',
    },
    logoText: {
      fontSize: 'clamp(1rem, 3.5vw, 1.5rem)',
      fontWeight: 700,
      color: theme.text,
      margin: 0,
      lineHeight: '1.25',
      letterSpacing: '-0.02em',
    },
    titleTagline: {
      fontSize: '0.72rem',
      fontWeight: 400,
      color: theme.textSecondary,
      letterSpacing: '0.02em',
      opacity: 0.75,
      whiteSpace: 'nowrap' as const,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    main: {
      maxWidth: '1200px',
      width: '100%',
      margin: '0 auto',
      flex: 1,
    },
    controlCard: {
      background: theme.cardBg,
      border: theme.cardBorder,
      borderRadius: '16px',
      padding: '24px',
      display: 'flex',
      flexWrap: 'wrap',
      gap: '20px',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '20px',
      boxShadow: theme.cardShadow,
      transition: 'all 0.3s ease',
    },
    selectorsRow: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '24px',
    },
    controlGroup: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
    },
    label: {
      fontSize: '1rem',
      fontWeight: 600,
      color: theme.text,
    },
    dateInput: {
      backgroundColor: theme.inputBg,
      border: `1.5px solid ${theme.inputBorder}`,
      borderRadius: '8px',
      color: theme.inputText,
      padding: '10px 14px',
      fontSize: '0.95rem',
      outline: 'none',
      transition: 'border-color 0.2s',
    },
    selectInput: {
      backgroundColor: theme.inputBg,
      border: `1.5px solid ${theme.inputBorder}`,
      borderRadius: '8px',
      color: theme.inputText,
      padding: '10px 14px',
      fontSize: '0.95rem',
      outline: 'none',
      transition: 'border-color 0.2s',
      cursor: 'pointer',
    },
    actionGroup: {
      display: 'flex',
      gap: '12px',
      flexWrap: 'wrap',
    },
    refreshButton: {
      backgroundColor: darkMode ? '#334155' : '#E2E8F0',
      color: theme.text,
      border: 'none',
      borderRadius: '8px',
      padding: '12px 20px',
      fontSize: '0.95rem',
      fontWeight: 600,
      cursor: 'pointer',
      transition: 'background-color 0.2s',
    },
    zipButton: {
      backgroundColor: darkMode ? '#1E293B' : '#FFFFFF',
      color: theme.text,
      border: `1.5px solid ${theme.inputBorder}`,
      borderRadius: '8px',
      padding: '12px 20px',
      fontSize: '0.95rem',
      fontWeight: 600,
      cursor: 'pointer',
      transition: 'all 0.2s',
    },
    downloadButton: {
      background: 'linear-gradient(135deg, #EAB308 0%, #D97706 100%)',
      color: '#0F172A',
      border: 'none',
      borderRadius: '8px',
      padding: '12px 24px',
      fontSize: '0.95rem',
      fontWeight: 700,
      boxShadow: '0 4px 14px rgba(234, 179, 8, 0.3)',
      transition: 'all 0.2s',
    },
    filterCard: {
      background: theme.cardBg,
      border: theme.cardBorder,
      borderRadius: '16px',
      padding: '16px 24px',
      marginBottom: '24px',
      boxShadow: theme.cardShadow,
      transition: 'all 0.3s ease',
    },
    filterHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '12px',
    },
    filterHeaderLeft: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
    filterStatusText: {
      fontSize: '0.95rem',
      color: theme.textSecondary,
      fontWeight: 500,
    },
    toggleFilterButton: {
      backgroundColor: darkMode ? '#1E293B' : '#E2E8F0',
      color: theme.text,
      border: `1.5px solid ${theme.inputBorder}`,
      borderRadius: '8px',
      padding: '8px 16px',
      fontSize: '0.85rem',
      fontWeight: 600,
      cursor: 'pointer',
      transition: 'all 0.2s',
    },
    filterContent: {
      marginTop: '16px',
      borderTop: darkMode ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.08)',
      paddingTop: '16px',
    },
    filterSubHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '16px',
      flexWrap: 'wrap',
      gap: '12px',
    },
    filterHeaderActions: {
      display: 'flex',
      gap: '8px',
      alignItems: 'center',
    },
    linkButtonSmall: {
      backgroundColor: 'transparent',
      border: 'none',
      color: '#FBBF24',
      cursor: 'pointer',
      fontSize: '0.85rem',
      fontWeight: 600,
      textDecoration: 'underline',
      padding: '2px 6px',
    },
    filterGrid: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '24px',
    },
    filterColLeft: {
      flex: '1 1 500px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    },
    filterColRight: {
      flex: '1 1 300px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    },
    colLabel: {
      fontSize: '1rem',
      fontWeight: 700,
      color: theme.text,
      margin: 0,
    },
    colLabelSmall: {
      fontSize: '0.9rem',
      fontWeight: 600,
      color: theme.textSecondary,
      margin: 0,
    },
    chipsContainer: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '10px',
    },
    keywordChipActive: {
      background: 'linear-gradient(135deg, #1E3A8A 0%, #3B82F6 100%)',
      color: '#FFFFFF',
      border: 'none',
      padding: '8px 16px',
      borderRadius: '20px',
      cursor: 'pointer',
      fontSize: '0.9rem',
      fontWeight: 600,
      boxShadow: '0 4px 10px rgba(30, 58, 138, 0.25)',
      transition: 'all 0.2s',
    },
    keywordChipInactive: {
      backgroundColor: darkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.03)',
      color: theme.textSecondary,
      border: darkMode ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.08)',
      padding: '8px 16px',
      borderRadius: '20px',
      cursor: 'pointer',
      fontSize: '0.9rem',
      fontWeight: 600,
      transition: 'all 0.2s',
    },
    customKeywordInput: {
      backgroundColor: theme.inputBg,
      border: `1.5px solid ${theme.inputBorder}`,
      borderRadius: '8px',
      color: theme.inputText,
      padding: '10px 14px',
      fontSize: '0.95rem',
      outline: 'none',
      width: '100%',
      transition: 'border-color 0.2s',
    },
    metaRow: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '20px',
      flexWrap: 'wrap',
      gap: '12px',
    },
    dateHeader: {
      fontSize: '1.1rem',
      backgroundColor: darkMode ? 'rgba(234, 179, 8, 0.1)' : 'rgba(234, 179, 8, 0.15)',
      borderLeft: '4px solid #EAB308',
      padding: '10px 16px',
      borderRadius: '0 8px 8px 0',
    },
    dateHighlight: {
      color: '#EAB308',
      fontWeight: 700,
    },
    bulkActions: {
      display: 'flex',
      gap: '8px',
      alignItems: 'center',
    },
    mergeButton: {
      backgroundColor: '#3B82F6',
      color: '#FFFFFF',
      border: 'none',
      borderRadius: '20px',
      padding: '6px 14px',
      fontSize: '0.85rem',
      fontWeight: 700,
      cursor: 'pointer',
      marginRight: '8px',
      boxShadow: '0 2px 8px rgba(59, 130, 246, 0.25)',
      transition: 'all 0.2s',
    },
    linkButton: {
      backgroundColor: 'transparent',
      border: 'none',
      color: darkMode ? '#60A5FA' : '#1D4ED8',
      cursor: 'pointer',
      fontSize: '0.9rem',
      fontWeight: 600,
      textDecoration: 'underline',
      padding: '4px 8px',
    },
    loadingContainer: {
      textAlign: 'center',
      padding: '60px 0',
      color: theme.textSecondary,
    },
    spinner: {
      width: '40px',
      height: '40px',
      border: darkMode ? '4px solid rgba(255, 255, 255, 0.1)' : '4px solid rgba(0, 0, 0, 0.1)',
      borderTop: '4px solid #EAB308',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite',
      margin: '0 auto 16px auto',
    },
    errorCard: {
      backgroundColor: 'rgba(239, 68, 68, 0.15)',
      border: '1px solid rgba(239, 68, 68, 0.3)',
      color: '#FCA5A5',
      borderRadius: '12px',
      padding: '16px',
      textAlign: 'center',
      marginBottom: '30px',
    },
    emptyCard: {
      background: theme.cardBg,
      border: `1px dashed ${theme.inputBorder}`,
      borderRadius: '16px',
      padding: '60px 20px',
      textAlign: 'center',
      boxShadow: theme.cardShadow,
    },
    emptyCardSubText: {
      color: theme.textSecondary,
    },
    reportsGrid: {
      display: 'flex',
      flexDirection: 'column',
      gap: '24px',
    },
    reportCard: {
      // styles applied dynamically in render
    },
    reportCardBg: {
      backgroundColor: theme.reportCardBg,
    },
    reportCardBorderColor: {
      borderColor: theme.reportCardBorderColor,
    },
    reportCardShadow: {
      boxShadow: theme.reportCardShadow,
    },
    reportHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '14px',
      flexWrap: 'wrap',
      gap: '12px',
    },
    headerLeft: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      flexWrap: 'wrap',
    },
    checkbox: {
      width: '20px',
      height: '20px',
      accentColor: '#EAB308',
      cursor: 'pointer',
    },
    userBadge: {
      backgroundColor: darkMode ? '#3b82f61a' : 'rgba(59, 130, 246, 0.1)',
      color: darkMode ? '#60A5FA' : '#1D4ED8',
      border: darkMode ? '1px solid #3b82f633' : '1px solid rgba(59, 130, 246, 0.2)',
      borderRadius: '9999px',
      padding: '4px 12px',
      fontSize: '0.85rem',
      fontWeight: 600,
    },
    groupBadge: {
      backgroundColor: 'rgba(234, 179, 8, 0.1)',
      color: '#EAB308',
      border: '1px solid rgba(234, 179, 8, 0.2)',
      borderRadius: '9999px',
      padding: '4px 12px',
      fontSize: '0.85rem',
      fontWeight: 600,
    },
    editedBadge: {
      backgroundColor: 'rgba(234, 179, 8, 0.15)',
      color: '#EAB308',
      border: '1px solid rgba(234, 179, 8, 0.3)',
      borderRadius: '9999px',
      padding: '4px 12px',
      fontSize: '0.85rem',
      fontWeight: 600,
    },
    reportTime: {
      color: theme.textSecondary,
      fontSize: '0.85rem',
    },
    reportTitle: {
      fontSize: '1.4rem',
      fontWeight: 700,
      color: theme.text,
      marginBottom: '20px',
      borderBottom: darkMode ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
      paddingBottom: '10px',
      paddingLeft: '32px',
    },
    cardContent: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '24px',
      paddingLeft: '32px',
    },
    textSection: {
      flex: '2 1 400px',
    },
    textSectionHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '10px',
      flexWrap: 'wrap',
      gap: '10px',
    },
    sectionLabel: {
      fontSize: '0.95rem',
      fontWeight: 600,
      color: theme.textSecondary,
      margin: 0,
    },
    editActions: {
      display: 'flex',
      gap: '8px',
    },
    editButton: {
      backgroundColor: 'transparent',
      border: 'none',
      color: darkMode ? '#60A5FA' : '#1D4ED8',
      cursor: 'pointer',
      fontSize: '0.85rem',
      fontWeight: 600,
      textDecoration: 'underline',
    },
    originalToggleButton: {
      backgroundColor: 'transparent',
      border: 'none',
      color: '#EAB308',
      cursor: 'pointer',
      fontSize: '0.85rem',
      fontWeight: 600,
      textDecoration: 'underline',
    },
    revertButton: {
      backgroundColor: 'transparent',
      border: 'none',
      color: '#EF4444',
      cursor: 'pointer',
      fontSize: '0.85rem',
      fontWeight: 600,
      textDecoration: 'underline',
    },
    editingBlock: {
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      backgroundColor: darkMode ? 'rgba(30, 41, 59, 0.5)' : '#F8FAFC',
      padding: '16px',
      borderRadius: '8px',
      border: darkMode ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
    },
    editingTip: {
      fontSize: '0.8rem',
      color: theme.textSecondary,
      margin: 0,
    },
    textarea: {
      width: '100%',
      backgroundColor: theme.inputBg,
      color: theme.inputText,
      border: `1.5px solid ${theme.inputBorder}`,
      borderRadius: '8px',
      padding: '10px',
      fontSize: '0.95rem',
      fontFamily: 'inherit',
      outline: 'none',
    },
    editButtonGroup: {
      display: 'flex',
      gap: '10px',
      justifyContent: 'flex-end',
    },
    saveBtn: {
      backgroundColor: '#EAB308',
      color: '#0F172A',
      border: 'none',
      borderRadius: '6px',
      padding: '8px 16px',
      fontSize: '0.9rem',
      fontWeight: 700,
      cursor: 'pointer',
    },
    cancelBtn: {
      backgroundColor: 'transparent',
      color: theme.textSecondary,
      border: `1px solid ${theme.inputBorder}`,
      borderRadius: '6px',
      padding: '8px 16px',
      fontSize: '0.9rem',
      fontWeight: 600,
      cursor: 'pointer',
    },
    list: {
      listStyleType: 'none',
      padding: 0,
      margin: 0,
    },
    listItem: {
      paddingLeft: '1.25rem',
      position: 'relative',
      marginBottom: '8px',
      color: theme.itemText,
      fontSize: '0.95rem',
      lineHeight: '1.5',
    },
    originalSummaryBox: {
      marginTop: '16px',
      backgroundColor: theme.originalBoxBg,
      border: `1px dashed ${theme.originalBoxBorder}`,
      borderRadius: '8px',
      padding: '12px 16px',
    },
    originalSummaryHeader: {
      fontSize: '0.85rem',
      fontWeight: 600,
      color: theme.textSecondary,
      marginBottom: '8px',
    },
    originalList: {
      listStyleType: 'none',
      padding: 0,
      margin: 0,
    },
    originalListItem: {
      paddingLeft: '1.25rem',
      position: 'relative',
      marginBottom: '6px',
      color: theme.textSecondary,
      fontSize: '0.9rem',
      lineHeight: '1.4',
    },
    imageSection: {
      flex: '1 1 250px',
      display: 'flex',
      flexDirection: 'column',
    },
    imagesGrid: {
      display: 'flex',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: '8px',
    },
    imageWrapper: {
      borderRadius: '8px',
      overflow: 'hidden',
      border: darkMode ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.08)',
      backgroundColor: theme.inputBg,
      flex: '1 1 100px',
      maxWidth: '150px',
      height: '100px',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
    },
    image: {
      width: '100%',
      height: 'auto',
      maxHeight: '100px',
      objectFit: 'contain',
    },
    noImage: {
      border: `1px dashed ${theme.inputBorder}`,
      borderRadius: '8px',
      height: '120px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: theme.textSecondary,
      fontSize: '0.9rem',
      backgroundColor: darkMode ? 'rgba(15, 23, 42, 0.5)' : '#F1F5F9',
    },
    paginationRow: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '12px',
      marginBottom: '16px',
      background: theme.cardBg,
      border: theme.cardBorder,
      borderRadius: '12px',
      padding: '10px 16px',
      boxShadow: theme.cardShadow,
      fontSize: '0.9rem',
    },
    paginationLeft: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
    paginationLabel: {
      fontWeight: 600,
      color: theme.textSecondary,
    },
    selectInputSmall: {
      backgroundColor: theme.inputBg,
      border: `1.5px solid ${theme.inputBorder}`,
      borderRadius: '6px',
      color: theme.inputText,
      padding: '6px 10px',
      fontSize: '0.85rem',
      outline: 'none',
      cursor: 'pointer',
    },
    paginationTotal: {
      color: theme.textSecondary,
      fontSize: '0.85rem',
    },
    paginationRight: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
    },
    paginationButton: {
      backgroundColor: darkMode ? '#334155' : '#E2E8F0',
      color: theme.text,
      border: 'none',
      borderRadius: '6px',
      padding: '6px 12px',
      fontSize: '0.85rem',
      fontWeight: 600,
      transition: 'background-color 0.2s',
    },
    pageIndicator: {
      fontWeight: 700,
      color: theme.text,
    },
    compactGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
      gap: '16px',
    },
    compactCard: {
      borderRadius: '12px',
      overflow: 'hidden',
      cursor: 'pointer',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      transition: 'all 0.2s ease',
      height: '210px',
    },
    compactCardImageContainer: {
      height: '110px',
      width: '100%',
      position: 'relative',
      backgroundColor: 'rgba(15, 23, 42, 0.3)',
      overflow: 'hidden',
    },
    compactCardImage: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
    },
    compactCardNoImage: {
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: theme.textSecondary,
      fontSize: '0.8rem',
      fontWeight: 500,
    },
    compactCardCheckboxOverlay: {
      position: 'absolute',
      top: '8px',
      left: '8px',
      zIndex: 10,
      backgroundColor: 'rgba(15, 23, 42, 0.6)',
      borderRadius: '4px',
      padding: '2px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxSmall: {
      width: '16px',
      height: '16px',
      accentColor: '#EAB308',
      cursor: 'pointer',
    },
    compactCardGroupOverlay: {
      position: 'absolute',
      bottom: '6px',
      right: '6px',
      backgroundColor: 'rgba(234, 179, 8, 0.85)',
      color: '#0f172a',
      fontSize: '0.7rem',
      fontWeight: 700,
      padding: '2px 6px',
      borderRadius: '4px',
      maxWidth: '120px',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    compactCardInfo: {
      padding: '10px 12px',
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      justifyContent: 'space-between',
    },
    compactCardUserRow: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      fontSize: '0.75rem',
      color: theme.textSecondary,
    },
    compactCardUser: {
      fontWeight: 600,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    compactEditedDot: {
      fontSize: '0.8rem',
    },
    compactCardTitle: {
      fontSize: '0.85rem',
      fontWeight: 700,
      color: theme.text,
      margin: '4px 0',
      lineHeight: '1.3',
      display: '-webkit-box',
      WebkitLineClamp: 2,
      WebkitBoxOrient: 'vertical',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    compactCardTime: {
      fontSize: '0.75rem',
      color: theme.textSecondary,
      textAlign: 'right',
    },
    viewModeToggleContainer: {
      display: 'flex',
      gap: '4px',
      backgroundColor: darkMode ? 'rgba(15, 23, 42, 0.4)' : 'rgba(0, 0, 0, 0.05)',
      padding: '3px',
      borderRadius: '8px',
      border: theme.cardBorder,
    },
    viewModeButton: {
      border: 'none',
      borderRadius: '6px',
      padding: '5px 10px',
      fontSize: '0.8rem',
      fontWeight: 600,
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    },
    footer: {
      marginTop: '50px',
      textAlign: 'center',
      color: theme.textSecondary,
      fontSize: '0.85rem',
    },
  };
}
