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
  sortTimestamp: number;
}

interface Group {
  groupId: string;
  groupName: string;
}

const DEFAULT_KEYWORDS = ['งาน', 'ใบงาน', 'ซ่อม', 'ใบแจ้งซ่อม', 'เลขที่', 'เปลี่ยน', 'ตรวจ', 'สำรวจ'];

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
  const [loading, setLoading] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [thaiWeekRange, setThaiWeekRange] = useState<string>('');
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  
  // Filtering & Panel States
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>(DEFAULT_KEYWORDS);
  const [customKeywordInput, setCustomKeywordInput] = useState<string>('');
  const [showFilterConfig, setShowFilterConfig] = useState<boolean>(false);

  // Editing States
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingText, setEditingText] = useState<string>('');
  const [showOriginalMap, setShowOriginalMap] = useState<Record<number, boolean>>({});

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
      setGroups(data.groups || []);
      setThaiWeekRange(data.date || '');
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
    setSelectedKeywords(DEFAULT_KEYWORDS);
  };

  const handleKeywordDeselectAll = () => {
    setSelectedKeywords([]);
  };

  const handleDownload = () => {
    const indicesStr = Array.from(selectedIndices).sort((a, b) => a - b).join(',');
    // Open in new tab to trigger secure server-side proxy file download
    window.open(`/api/download?week=${selectedWeek}&indices=${indicesStr}&groupId=${selectedGroupId}`, '_blank');
  };

  const handleDownloadImagesZip = () => {
    window.open(`/api/download-images?week=${selectedWeek}`, '_blank');
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

  const toggleShowOriginal = (idx: number) => {
    setShowOriginalMap(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.logoContainer}>
          <div style={styles.logoBadge}>EGAT</div>
          <h1 style={styles.logoText}>BDReport Control Panel</h1>
        </div>
        <p style={styles.subtitle}>ระบบสรุปรายงานการปฏิบัติงานประจำสัปดาห์อัตโนมัติ (แผนกบำรุงรักษาอาคารและบริเวณ)</p>
      </header>

      <main style={styles.main}>
        {/* Date & Group Selector Section */}
        <section style={styles.controlCard}>
          <div style={styles.selectorsRow}>
            <div style={styles.controlGroup}>
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
              <div style={styles.controlGroup}>
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

          <div style={styles.actionGroup}>
            <button
              onClick={() => fetchReports(selectedWeek)}
              disabled={loading}
              style={styles.refreshButton}
            >
              🔄 รีเฟรชข้อมูล
            </button>
            <button
              onClick={handleDownloadImagesZip}
              disabled={loading || reports.length === 0}
              style={{
                ...styles.zipButton,
                opacity: (loading || reports.length === 0) ? 0.6 : 1,
                cursor: (loading || reports.length === 0) ? 'not-allowed' : 'pointer',
              }}
            >
              📦 Backup photo
            </button>
            <button
              onClick={handleDownload}
              disabled={selectedIndices.size === 0}
              style={{
                ...styles.downloadButton,
                opacity: selectedIndices.size === 0 ? 0.6 : 1,
                cursor: selectedIndices.size === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              📊 สร้างรายงาน PowerPoint ({selectedIndices.size}/{filteredReports.length})
            </button>
          </div>
        </section>

        {/* Collapsible Filter Keywords Section */}
        {!loading && filteredReports.length > 0 && (
          <section style={styles.filterCard}>
            <div style={styles.filterHeader}>
              <div style={styles.filterHeaderLeft}>
                <span style={styles.filterStatusText}>
                  🔍 เปิดใช้งานตัวกรองข้อความบำรุงรักษาแล้ว (คำสำคัญทำงานอยู่: {selectedKeywords.length} คำ
                  {customKeywordInput.trim() ? `, เพิ่มเติม: ${customKeywordInput}` : ''})
                </span>
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
                    <div style={styles.chipsContainer}>
                      {DEFAULT_KEYWORDS.map(kw => {
                        const isSelected = selectedKeywords.includes(kw);
                        return (
                          <button
                            key={kw}
                            onClick={() => handleToggleKeyword(kw)}
                            style={isSelected ? styles.keywordChipActive : styles.keywordChipInactive}
                          >
                            {isSelected ? '✓ ' : ''}{kw}
                          </button>
                        );
                      })}
                    </div>
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
          <div style={styles.metaRow}>
            <div style={styles.dateHeader}>
              <span>📅 รายงานประจำสัปดาห์: </span>
              <strong style={styles.dateHighlight}>{thaiWeekRange}</strong>
            </div>
            {filteredReports.length > 0 && (
              <div style={styles.bulkActions}>
                <button onClick={handleSelectAll} style={styles.linkButton}>เลือกสไลด์ทั้งหมด ({filteredReports.length})</button>
                <span style={{ color: '#475569' }}>|</span>
                <button onClick={handleDeselectAll} style={styles.linkButton}>ล้างทั้งหมด</button>
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
            <p style={{ fontSize: '1.2rem', marginBottom: '8px' }}>📭 ไม่พบรายงานของสัปดาห์นี้</p>
            <p style={{ color: '#94A3B8', fontSize: '0.9rem' }}>สมาชิกในทีมยังไม่ได้ส่งรายงานผ่านแชทบอท LINE</p>
          </div>
        )}

        {!loading && !actionLoading && reports.length > 0 && filteredReports.length === 0 && (
          <div style={styles.emptyCard}>
            <p style={{ fontSize: '1.2rem', marginBottom: '8px' }}>🔍 ไม่พบข้อมูลที่ตรงกับคำสำคัญที่คุณเลือก</p>
            <p style={{ color: '#94A3B8', fontSize: '0.9rem' }}>ลองคลิกปรับแต่งตัวกรองด้านบนเพื่อตั้งค่าคำค้นหาใหม่</p>
          </div>
        )}

        {!loading && !actionLoading && filteredReports.length > 0 && (
          <div style={styles.reportsGrid}>
            {filteredReports.map((report) => {
              const originalIndex = reports.indexOf(report);
              const isSelected = selectedIndices.has(originalIndex);
              const isCurrentlyEditing = editingIndex === originalIndex;
              const hasBeenEdited = report.isEdited;
              const showOriginal = !!showOriginalMap[originalIndex];

              return (
                <article 
                  key={originalIndex} 
                  style={{
                    ...styles.reportCard,
                    borderColor: isSelected ? '#EAB308' : 'rgba(255, 255, 255, 0.05)',
                    opacity: isSelected ? 1 : 0.6,
                  }}
                >
                  <div style={styles.reportHeader}>
                    <div style={styles.headerLeft}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(originalIndex)}
                        style={styles.checkbox}
                      />
                      <div style={styles.userBadge}>
                        ผู้รายงาน: {report.displayName || `ผู้ใช้ LINE (${report.userId.substring(0, 6)})`}
                      </div>
                      <div style={styles.groupBadge}>
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

                  <h3 style={styles.reportTitle}>{report.title}</h3>

                  <div style={styles.cardContent}>
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

                    {/* Image Section */}
                    <div style={styles.imageSection}>
                      <h4 style={styles.sectionLabel}>🖼️ รูปภาพประกอบ:</h4>
                      {report.base64Images && report.base64Images.length > 0 ? (
                        <div style={styles.imagesGrid}>
                          {report.base64Images.map((img, idx) => (
                            <div key={idx} style={styles.imageWrapper}>
                              <img
                                src={img}
                                alt={`ภาพประกอบ ${idx + 1}`}
                                style={styles.image}
                              />
                            </div>
                          ))}
                        </div>
                      ) : report.base64Image ? (
                        <div style={styles.imageWrapper}>
                          <img
                            src={report.base64Image}
                            alt="ภาพประกอบรายงาน"
                            style={styles.image}
                          />
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
        )}
      </main>

      <footer style={styles.footer}>
        <p>© 2026 EGAT BDReport - พัฒนาขึ้นสำหรับกลุ่มบำรุงรักษาอาคารและบริเวณ</p>
      </footer>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: '#0F172A',
    color: '#F8FAFC',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: "'Inter', 'Segoe UI', Roboto, sans-serif",
    padding: '40px 20px',
  },
  header: {
    maxWidth: '1200px',
    width: '100%',
    margin: '0 auto 30px auto',
    textAlign: 'center',
  },
  logoContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    marginBottom: '8px',
  },
  logoBadge: {
    background: 'linear-gradient(135deg, #EAB308 0%, #D97706 100%)',
    color: '#0F172A',
    fontWeight: 'bold',
    fontSize: '1.4rem',
    width: '60px',
    height: '42px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 15px rgba(234, 179, 8, 0.3)',
  },
  logoText: {
    fontSize: '2.2rem',
    fontWeight: 800,
    background: 'linear-gradient(to right, #FBBF24, #F59E0B)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: '1rem',
  },
  main: {
    maxWidth: '1200px',
    width: '100%',
    margin: '0 auto',
    flex: 1,
  },
  controlCard: {
    background: 'rgba(30, 41, 59, 0.7)',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderRadius: '16px',
    padding: '24px',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '20px',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '20px',
    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)',
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
    color: '#E2E8F0',
  },
  dateInput: {
    backgroundColor: '#0F172A',
    border: '1.5px solid #475569',
    borderRadius: '8px',
    color: '#F8FAFC',
    padding: '10px 14px',
    fontSize: '0.95rem',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  selectInput: {
    backgroundColor: '#0F172A',
    border: '1.5px solid #475569',
    borderRadius: '8px',
    color: '#F8FAFC',
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
    backgroundColor: '#334155',
    color: '#F8FAFC',
    border: 'none',
    borderRadius: '8px',
    padding: '12px 20px',
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  zipButton: {
    backgroundColor: '#1E293B',
    color: '#E2E8F0',
    border: '1.5px solid #475569',
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
    background: 'rgba(30, 41, 59, 0.4)',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderRadius: '16px',
    padding: '16px 24px',
    marginBottom: '24px',
    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.1)',
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
    color: '#94A3B8',
    fontWeight: 500,
  },
  toggleFilterButton: {
    backgroundColor: '#1E293B',
    color: '#E2E8F0',
    border: '1.5px solid #475569',
    borderRadius: '8px',
    padding: '8px 16px',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  filterContent: {
    marginTop: '16px',
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
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
    color: '#E2E8F0',
    margin: 0,
  },
  colLabelSmall: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: '#94A3B8',
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
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    color: '#94A3B8',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    padding: '8px 16px',
    borderRadius: '20px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: 600,
    transition: 'all 0.2s',
  },
  customKeywordInput: {
    backgroundColor: '#0F172A',
    border: '1.5px solid #475569',
    borderRadius: '8px',
    color: '#F8FAFC',
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
    backgroundColor: 'rgba(234, 179, 8, 0.1)',
    borderLeft: '4px solid #EAB308',
    padding: '10px 16px',
    borderRadius: '0 8px 8px 0',
  },
  dateHighlight: {
    color: '#FBBF24',
  },
  bulkActions: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  linkButton: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#60A5FA',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: 600,
    textDecoration: 'underline',
    padding: '4px 8px',
  },
  loadingContainer: {
    textAlign: 'center',
    padding: '60px 0',
    color: '#94A3B8',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid rgba(255, 255, 255, 0.1)',
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
    background: 'rgba(30, 41, 59, 0.3)',
    border: '1px dashed #475569',
    borderRadius: '16px',
    padding: '60px 20px',
    textAlign: 'center',
  },
  reportsGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  reportCard: {
    background: 'rgba(30, 41, 59, 0.5)',
    border: '2px solid rgba(255, 255, 255, 0.05)',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
    transition: 'all 0.2s',
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
    backgroundColor: '#3b82f61a',
    color: '#60A5FA',
    border: '1px solid #3b82f633',
    borderRadius: '9999px',
    padding: '4px 12px',
    fontSize: '0.85rem',
    fontWeight: 600,
  },
  groupBadge: {
    backgroundColor: 'rgba(234, 179, 8, 0.1)',
    color: '#FBBF24',
    border: '1px solid rgba(234, 179, 8, 0.2)',
    borderRadius: '9999px',
    padding: '4px 12px',
    fontSize: '0.85rem',
    fontWeight: 600,
  },
  editedBadge: {
    backgroundColor: 'rgba(234, 179, 8, 0.15)',
    color: '#FBBF24',
    border: '1px solid rgba(234, 179, 8, 0.3)',
    borderRadius: '9999px',
    padding: '4px 12px',
    fontSize: '0.85rem',
    fontWeight: 600,
  },
  reportTime: {
    color: '#94A3B8',
    fontSize: '0.85rem',
  },
  reportTitle: {
    fontSize: '1.4rem',
    fontWeight: 700,
    color: '#FFFFFF',
    marginBottom: '20px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
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
    color: '#94A3B8',
    margin: 0,
  },
  editActions: {
    display: 'flex',
    gap: '8px',
  },
  editButton: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#60A5FA',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: 600,
    textDecoration: 'underline',
  },
  originalToggleButton: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#FBBF24',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: 600,
    textDecoration: 'underline',
  },
  revertButton: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#F87171',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: 600,
    textDecoration: 'underline',
  },
  editingBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    padding: '16px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  },
  editingTip: {
    fontSize: '0.8rem',
    color: '#94A3B8',
    margin: 0,
  },
  textarea: {
    width: '100%',
    backgroundColor: '#0F172A',
    color: '#F8FAFC',
    border: '1.5px solid #475569',
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
    color: '#94A3B8',
    border: '1px solid #475569',
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
    color: '#E2E8F0',
    fontSize: '0.95rem',
    lineHeight: '1.5',
  },
  originalSummaryBox: {
    marginTop: '16px',
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    border: '1px dashed #475569',
    borderRadius: '8px',
    padding: '12px 16px',
  },
  originalSummaryHeader: {
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#94A3B8',
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
    color: '#94A3B8',
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
    border: '1px solid rgba(255, 255, 255, 0.1)',
    backgroundColor: '#0F172A',
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
    border: '1px dashed #475569',
    borderRadius: '8px',
    height: '120px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#94A3B8',
    fontSize: '0.9rem',
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
  },
  footer: {
    marginTop: '50px',
    textAlign: 'center',
    color: '#64748B',
    fontSize: '0.85rem',
  },
};
