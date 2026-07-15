'use client';

import React, { useState, useEffect } from 'react';

interface Report {
  userId: string;
  title: string;
  date: string;
  summary: string[];
  base64Image: string | null;
  base64Images?: string[];
}

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
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [thaiWeekRange, setThaiWeekRange] = useState<string>('');

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
      const res = await fetch(`/api/reports?week=${weekStr}`);
      if (!res.ok) {
        throw new Error('ไม่สามารถดึงข้อมูลรายงานได้');
      }
      const data = await res.json();
      setReports(data.reports || []);
      setThaiWeekRange(data.date || '');
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการโหลดข้อมูล');
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedWeek) {
      fetchReports(selectedWeek);
    }
  }, [selectedWeek]);

  const handleDownload = () => {
    // Open in new tab to trigger secure server-side proxy file download
    window.open(`/api/download?week=${selectedWeek}`, '_blank');
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.logoContainer}>
          <div style={styles.logoBadge}>BD</div>
          <h1 style={styles.logoText}>BDReport Control Panel</h1>
        </div>
        <p style={styles.subtitle}>ระบบสรุปรายงานการปฏิบัติงานประจำสัปดาห์อัตโนมัติ</p>
      </header>

      <main style={styles.main}>
        {/* Date Selector Section */}
        <section style={styles.controlCard}>
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

          <div style={styles.actionGroup}>
            <button
              onClick={() => fetchReports(selectedWeek)}
              disabled={loading}
              style={styles.refreshButton}
            >
              🔄 รีเฟรชข้อมูล
            </button>
            <button
              onClick={handleDownload}
              disabled={reports.length === 0}
              style={{
                ...styles.downloadButton,
                opacity: reports.length === 0 ? 0.6 : 1,
                cursor: reports.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              📊 สร้างรายงาน PowerPoint (.pptx)
            </button>
          </div>
        </section>

        {/* Date Indicator */}
        {thaiWeekRange && (
          <div style={styles.dateHeader}>
            <span>📅 รายงานประจำสัปดาห์: </span>
            <strong style={styles.dateHighlight}>{thaiWeekRange}</strong>
          </div>
        )}

        {/* Status Messages */}
        {loading && (
          <div style={styles.loadingContainer}>
            <div style={styles.spinner}></div>
            <p>กำลังค้นหาข้อมูลจากระบบ...</p>
          </div>
        )}

        {error && (
          <div style={styles.errorCard}>
            <p>⚠️ {error}</p>
          </div>
        )}

        {/* Reports List */}
        {!loading && !error && reports.length === 0 && (
          <div style={styles.emptyCard}>
            <p style={{ fontSize: '1.2rem', marginBottom: '8px' }}>📭 ไม่พบรายงานของสัปดาห์นี้</p>
            <p style={{ color: '#9CA3AF', fontSize: '0.9rem' }}>สมาชิกในทีมยังไม่ได้ส่งรายงานผ่านแชทบอท LINE</p>
          </div>
        )}

        {!loading && reports.length > 0 && (
          <div style={styles.reportsGrid}>
            {reports.map((report, rIdx) => (
              <article key={rIdx} style={styles.reportCard}>
                <div style={styles.reportHeader}>
                  <div style={styles.userBadge}>
                    User ID: {report.userId.substring(0, 8)}...
                  </div>
                  <span style={styles.reportTime}>📅 วันที่ {report.date}</span>
                </div>

                <h3 style={styles.reportTitle}>{report.title}</h3>

                <div style={styles.cardContent}>
                  <div style={styles.textSection}>
                    <h4 style={styles.sectionLabel}>📝 รายละเอียดงาน:</h4>
                    <ul style={styles.list}>
                      {report.summary.map((task, idx) => (
                        <li key={idx} style={styles.listItem}>{task}</li>
                      ))}
                    </ul>
                  </div>

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
            ))}
          </div>
        )}
      </main>

      <footer style={styles.footer}>
        <p>© 2026 BDReport - ขับเคลื่อนด้วยพลังแห่งความเร็วแบบ Ponytail และ Gemini AI</p>
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
    background: 'linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)',
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: '1.5rem',
    width: '45px',
    height: '45px',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 15px rgba(139, 92, 246, 0.4)',
  },
  logoText: {
    fontSize: '2.2rem',
    fontWeight: 800,
    background: 'linear-gradient(to right, #C084FC, #F472B6)',
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
    marginBottom: '30px',
    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)',
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
  downloadButton: {
    background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '8px',
    padding: '12px 24px',
    fontSize: '0.95rem',
    fontWeight: 600,
    boxShadow: '0 4px 14px rgba(139, 92, 246, 0.3)',
    transition: 'all 0.2s',
  },
  dateHeader: {
    fontSize: '1.1rem',
    marginBottom: '20px',
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderLeft: '4px solid #8B5CF6',
    padding: '10px 16px',
    borderRadius: '0 8px 8px 0',
  },
  dateHighlight: {
    color: '#C084FC',
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
    borderTop: '4px solid #8B5CF6',
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
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
  },
  reportHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '14px',
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
  },
  cardContent: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '24px',
  },
  textSection: {
    flex: '2 1 400px',
  },
  sectionLabel: {
    fontSize: '0.95rem',
    fontWeight: 600,
    color: '#94A3B8',
    marginBottom: '10px',
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
