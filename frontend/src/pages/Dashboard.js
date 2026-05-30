import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../App';

const StatCard = ({ label, value, sub, color }) => (
  <div style={{ background: '#fff', borderRadius: 10, padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', border: '1px solid #f0f4f8', flex: 1, minWidth: 140 }}>
    <div style={{ width: 32, height: 3, background: color, borderRadius: 2, marginBottom: 12 }} />
    <div style={{ fontSize: 28, fontWeight: 800, color: '#1a2533', letterSpacing: -0.5, marginBottom: 2 }}>
      {value === null || value === undefined ? <span style={{ fontSize: 18, color: '#ccc' }}>—</span> : value}
    </div>
    <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{label}</div>
    {sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
  </div>
);

export default function Dashboard() {
  const [stats,    setStats]    = useState({});
  const [logs,     setLogs]     = useState([]);
  const [saleNos,  setSaleNos]  = useState([]);
  const [grades,   setGrades]   = useState([]);
  const [loading,  setLoading]  = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [parties, catalogue, markings, importLogs, saleNumbers] = await Promise.all([
        api.get('/parties').catch(() => ({ data: [] })),
        api.get('/catalogue').catch(() => ({ data: [] })),
        api.get('/marking').catch(() => ({ data: [] })),
        api.get('/import/logs').catch(() => ({ data: [] })),
        api.get('/import/sale-numbers').catch(() => ({ data: [] }))
      ]);

      // Unique counts from catalogue
      const catData = catalogue.data || [];
      const uniqueGardens = [...new Set(catData.map(r => r.mark).filter(Boolean))];
      const uniqueGrades  = [...new Set(catData.map(r => r.grade).filter(Boolean))].sort();
      const uniqueMarks   = [...new Set(catData.map(r => r.mark).filter(Boolean))];

      // Confirmed markings this week
      const thisWeekMarkings = (markings.data || []).filter(m => m.status === 'confirmed');

      setStats({
        parties:   (parties.data || []).length,
        gardens:   uniqueGardens.length,
        grades:    uniqueGrades.length,
        marks:     uniqueMarks.length,
        lots:      catData.length,
        markings:  thisWeekMarkings.length,
      });
      setGrades(uniqueGrades);
      setLogs(importLogs.data || []);
      setSaleNos(saleNumbers.data || []);
    } catch (e) {
      console.error('Dashboard load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const fmtDate = (d) => {
    if (!d) return '—';
    try { return new Date(d).toLocaleString('en-IN', { day:'2-digit', month:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit' }); }
    catch { return d; }
  };

  return (
    <div style={{ padding: '0 0 32px' }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: '#1a2533', marginBottom: 4 }}>🍵 Tea Auction Dashboard</h2>
        <p style={{ color: '#9ca3af', fontSize: 13 }}>Live overview from imported data</p>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <StatCard label="Total Parties"      value={loading ? '…' : stats.parties}  sub="Registered"       color="#1a3c5e" />
        <StatCard label="Gardens"            value={loading ? '…' : stats.gardens}  sub="From catalogue"    color="#1a7a4a" />
        <StatCard label="Grades"             value={loading ? '…' : stats.grades}   sub="Unique grades"    color="#d97706" />
        <StatCard label="Marks"              value={loading ? '…' : stats.marks}    sub="Unique marks"     color="#7c3aed" />
        <StatCard label="Catalogue Lots"     value={loading ? '…' : stats.lots}     sub="Current"          color="#059669" />
        <StatCard label="Confirmed Markings" value={loading ? '…' : stats.markings} sub="All time"         color="#dc2626" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {/* Recent sales */}
        <div style={{ background: '#fff', borderRadius: 10, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', border: '1px solid #f0f4f8' }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            🧾 Recent Sale Numbers
          </div>
          {saleNos.length === 0
            ? <div style={{ color: '#aaa', fontSize: 13 }}>No sales imported yet. Upload a Catalogue first.</div>
            : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {saleNos.map(s => (
                  <div key={s.sale_no} style={{ background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 8, padding: '8px 14px', textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#1a3c5e' }}>#{s.sale_no}</div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{s.lot_count} lots</div>
                    {s.week_date && <div style={{ fontSize: 10, color: '#9ca3af' }}>{new Date(s.week_date).toLocaleDateString('en-IN')}</div>}
                  </div>
                ))}
              </div>
            )
          }
        </div>

        {/* Grades */}
        <div style={{ background: '#fff', borderRadius: 10, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', border: '1px solid #f0f4f8' }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            📊 Grades in Catalogue
          </div>
          {grades.length === 0
            ? <div style={{ color: '#aaa', fontSize: 13 }}>Import catalogue to see grades</div>
            : (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {grades.map(g => (
                  <span key={g} style={{ background: '#dbeafe', color: '#1e40af', padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 700 }}>{g}</span>
                ))}
              </div>
            )
          }
        </div>
      </div>

      {/* Import log */}
      <div style={{ background: '#fff', borderRadius: 10, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', border: '1px solid #f0f4f8' }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>📋 Import History</div>
        {logs.length === 0
          ? <div style={{ color: '#aaa', fontSize: 13 }}>No imports yet.</div>
          : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #f0f4f8' }}>
                  {['Type','File','Sale No','Imported','Skipped','Date'].map(h => (
                    <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: '#6b7280', fontSize: 12 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f9fafb' }}>
                    <td style={{ padding: '7px 10px' }}>
                      <span style={{ background: log.file_type==='catalogue'?'#dbeafe':'#d1fae5', color: log.file_type==='catalogue'?'#1e40af':'#065f46', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600 }}>
                        {log.file_type}
                      </span>
                    </td>
                    <td style={{ padding: '7px 10px', color: '#374151' }}>{log.filename}</td>
                    <td style={{ padding: '7px 10px', fontWeight: 700, color: '#1a3c5e' }}>{log.sale_no || '—'}</td>
                    <td style={{ padding: '7px 10px', fontWeight: 700, color: '#1a7a4a' }}>{log.rows_imported}</td>
                    <td style={{ padding: '7px 10px', color: '#6b7280' }}>{log.rows_skipped}</td>
                    <td style={{ padding: '7px 10px', color: '#9ca3af', fontSize: 12 }}>{fmtDate(log.imported_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </div>
    </div>
  );
}
