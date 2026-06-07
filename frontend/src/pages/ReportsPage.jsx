import React, { useState, useEffect } from 'react';
import { Card, api } from '../App';

// ─────────────────────────────────────────────────────────────────────────────
// PARTY REPORT TAB
// ─────────────────────────────────────────────────────────────────────────────
function PartyReport({ saleNos }) {
  const [selSale,      setSelSale]      = useState('');
  const [selBatch,     setSelBatch]     = useState('');
  const [partyData,    setPartyData]    = useState([]);
  const [expanded,     setExpanded]     = useState(null);
  const [loading,      setLoading]      = useState(false);

  useEffect(() => {
    if (saleNos.length > 0) {
      setSelSale(String(saleNos[0].sale_no));
      setSelBatch(saleNos[0].batch_name || '');
    }
  }, [saleNos]);

  useEffect(() => {
    if (selSale) loadReport();
  }, [selSale, selBatch]); // eslint-disable-line

  const loadReport = async () => {
    if (!selSale) return;
    setLoading(true);
    const b = selBatch ? `&batch_name=${encodeURIComponent(selBatch)}` : '';
    try {
      const r = await api.get(`/reports/party-summary?sale_no=${selSale}${b}`);
      setPartyData(r.data);
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    } finally { setLoading(false); }
  };

  const PriceCell = ({ low, high }) => {
    const lo = parseFloat(low), hi = parseFloat(high);
    if (isNaN(lo) || lo === 0) return <span style={{ color: '#ccc' }}>—</span>;
    if (lo === hi) return <span style={{ fontWeight: 700, color: '#1a7a4a' }}>₹{lo.toFixed(0)}</span>;
    return (
      <span style={{ whiteSpace: 'nowrap' }}>
        <span style={{ fontWeight: 700, color: '#1a7a4a' }}>₹{lo.toFixed(0)}</span>
        <span style={{ color: '#aaa', margin: '0 4px' }}>–</span>
        <span style={{ fontWeight: 700, color: '#c0392b' }}>₹{hi.toFixed(0)}</span>
      </span>
    );
  };

  const pdfPrice = (low, high) => {
    const lo = parseFloat(low), hi = parseFloat(high);
    if (isNaN(lo) || lo === 0) return '—';
    if (lo === hi) return `<span style="color:#1a7a4a;font-weight:700">\u20B9${lo.toFixed(0)}</span>`;
    return `<span style="color:#1a7a4a;font-weight:700">\u20B9${lo.toFixed(0)}</span> \u2013 <span style="color:#c0392b;font-weight:700">\u20B9${hi.toFixed(0)}</span>`;
  };

  const pdfStyles = `
    body { font-family: Arial, sans-serif; font-size: 10px; margin: 12mm; margin-top: 22mm; color: #1a2533; }
    h1 { font-size: 13px; color: #1a3c5e; margin-bottom: 3px; }
    .party-block { margin-bottom: 12px; page-break-inside: avoid; }
    .party-hdr { background: #1a3c5e; color: #fff; padding: 4px 10px; display: flex; align-items: center; gap: 10px; border-radius: 3px 3px 0 0; }
    .pcode { background: rgba(255,255,255,0.2); padding: 1px 6px; border-radius: 8px; font-weight: 900; font-size: 11px; }
    .pname { font-weight: 700; font-size: 12px; flex: 1; }
    .plots { font-size: 10px; opacity: 0.8; }
    table { width: 100%; border-collapse: collapse; font-size: 9px; border: 1px solid #e2e8f0; }
    th { background: #f0f4f8; padding: 4px 6px; text-align: left; font-weight: 700; color: #444; }
    td { padding: 3px 6px; border-bottom: 1px solid #f0f4f8; }
    .grade { background: #dbeafe; color: #1e40af; padding: 1px 5px; border-radius: 8px; font-weight: 800; font-size: 8px; }
    .page-logo-header { position: fixed; top: 0; left: 0; right: 0; background: #fff; padding: 3px 12mm; display: flex; align-items: center; gap: 10px; border-bottom: 2px solid #1a3c5e; z-index: 9999; }
    .page-logo-header img { height: 34px; width: 34px; object-fit: contain; }
    .page-logo-header h1 { font-size: 12px; color: #1a3c5e; margin: 0; }
    @page { size: A4; margin: 20mm 8mm 8mm 8mm; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`;

  // Fixed header that repeats on every printed page
  const logoHeader = (title, sub) => `
    <div class="page-logo-header">
      <div>
        <h1>${title}</h1>
      </div>
    </div>`;

  const partyHtml = (party) => {
    const rows = (party.lots || []).map((lot, i) => `
      <tr style="background:${i%2===0?'#fff':'#f9fafb'}">
        <td style="font-weight:700;color:#1a3c5e">${lot.garden||''}</td>
        <td style="color:#777;font-size:8px">${lot.origin||''}</td>
        <td><span class="grade">${lot.grade||''}</span></td>
        <td style="text-align:center">${lot.lot_count||''}</td>
        <td style="text-align:center">${lot.total_bags||''}</td>
        <td style="text-align:right">${pdfPrice(lot.rate_low, lot.rate_high)}</td>
      </tr>`).join('');
    return `
      <div class="party-block">
        <div class="party-hdr">
          <span class="pcode">${party.party_code}</span>
          <span class="pname">${party.party_name}</span>
          <span class="plots">${party.total_lots} lots</span>
        </div>
        <table>
          <thead><tr>
            <th>Garden</th><th>Origin</th><th>Grade</th>
            <th style="text-align:center">Lots</th><th style="text-align:center">Bags</th>
            <th style="text-align:right">Rate \u20B9 (Min\u2013Max)</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  };

  const openPDF = (title, sub, bodyHtml) => {
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
<style>${pdfStyles}</style></head><body>
${logoHeader(title, sub)}
${bodyHtml}</body></html>`);
    win.document.close(); win.focus();
    setTimeout(() => { win.print(); win.close(); }, 500);
  };

  const th  = (right) => ({ padding: '7px 10px', textAlign: right ? 'right' : 'left', fontWeight: 700, color: '#444', whiteSpace: 'nowrap' });
  const td  = (extra) => ({ padding: '6px 10px', ...extra });

  return (
    <Card>
      {/* Sale / Batch selector */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16, paddingBottom: 14, borderBottom: '1.5px solid #f0f4f8' }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4, display: 'block' }}>
            Sale / Batch
          </label>
          <select value={selSale ? `${selSale}||${selBatch}` : ''} onChange={e => {
            const [s, b] = (e.target.value || '').split('||');
            setSelSale(s || ''); setSelBatch(b || '');
          }} style={{ padding: '7px 12px', border: '1.5px solid #cbd5e0', borderRadius: 6, fontSize: 13, minWidth: 280 }}>
            <option value="">Select sale...</option>
            {saleNos.map(s => {
              const val = `${s.sale_no}||${s.batch_name || ''}`;
              const label = s.batch_name ? `Sale ${s.sale_no} — ${s.batch_name} (${s.lot_count} lots)` : `Sale ${s.sale_no} (${s.lot_count} lots)`;
              return <option key={val} value={val}>{label}</option>;
            })}
          </select>
        </div>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ fontSize: 15, margin: 0, color: '#1a3c5e' }}>
          Party Marking Report — Sale #{selSale}
          {selBatch && <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 6 }}>({selBatch})</span>}
        </h3>
        <div style={{ display: 'flex', gap: 10 }}>
          <span style={{ fontSize: 12, color: '#888', alignSelf: 'center' }}>{partyData.length} parties</span>
          {partyData.length > 0 && (
            <button onClick={() => openPDF(
              `Party Marking Report — Sale #${selSale}${selBatch ? ' — '+selBatch : ''}`,
              `Generated: ${new Date().toLocaleString('en-IN')} | ${partyData.length} parties`,
              partyData.map(p => partyHtml(p)).join('')
            )} style={{ padding: '6px 14px', background: '#1a3c5e', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
              📄 All Parties PDF
            </button>
          )}
        </div>
      </div>

      {loading && <div style={{ padding: 30, textAlign: 'center', color: '#888' }}>⏳ Loading...</div>}
      {!loading && partyData.length === 0 && (
        <div style={{ padding: 30, textAlign: 'center', color: '#aaa' }}>No markings found for this sale.</div>
      )}

      {!loading && partyData.map(party => {
        const isExp = expanded === party.party_code;
        return (
          <div key={party.party_code} style={{ marginBottom: 8, border: '1.5px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', background: isExp ? '#1a3c5e' : '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div onClick={() => setExpanded(isExp ? null : party.party_code)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', flex: 1 }}>
                <span style={{ background: isExp ? 'rgba(255,255,255,0.2)' : '#dbeafe', color: isExp ? '#fff' : '#1e40af', padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 700 }}>
                  {party.party_code}
                </span>
                <span style={{ fontWeight: 700, fontSize: 14, color: isExp ? '#fff' : '#1a3c5e' }}>{party.party_name}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: isExp ? '#90cdf4' : '#1a7a4a' }}>{party.total_lots} lots</span>
                <span style={{ color: isExp ? '#fff' : '#888', fontSize: 12 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              <button onClick={e => {
                e.stopPropagation();
                openPDF(
                  `${party.party_name} (${party.party_code}) — Sale #${selSale}${selBatch ? ' — '+selBatch : ''}`,
                  `Generated: ${new Date().toLocaleString('en-IN')} | ${party.total_lots} lots`,
                  partyHtml(party)
                );
              }} style={{ padding: '4px 10px', background: isExp ? 'rgba(255,255,255,0.15)' : '#e8f0fe', color: isExp ? '#fff' : '#1a3c5e', border: 'none', borderRadius: 5, cursor: 'pointer', fontWeight: 700, fontSize: 11 }}>
                📄 PDF
              </button>
            </div>
            {isExp && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f0f4f8' }}>
                      {['Garden (Mark)', 'Origin', 'Grade', 'Lots', 'Bags', 'Net Wt', 'Rate ₹ (Min–Max)'].map(h => (
                        <th key={h} style={th(h === 'Rate ₹ (Min–Max)')}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(party.lots || []).map((lot, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f0f4f8', background: i % 2 === 0 ? '#fff' : '#fafbfc' }}>
                        <td style={td({ fontWeight: 700, color: '#1a3c5e' })}>{lot.garden}</td>
                        <td style={td({ fontSize: 11, color: '#777' })}>{lot.origin || '—'}</td>
                        <td style={td()}>
                          <span style={{ background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>{lot.grade}</span>
                        </td>
                        <td style={td({ textAlign: 'center', color: '#555' })}>{lot.lot_count}</td>
                        <td style={td({ textAlign: 'center', color: '#555' })}>{lot.total_bags}</td>
                        <td style={td({ textAlign: 'center', color: '#555' })}>{lot.total_nwt}</td>
                        <td style={td({ textAlign: 'right' })}><PriceCell low={lot.rate_low} high={lot.rate_high} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MARKET REPORT TAB
// ─────────────────────────────────────────────────────────────────────────────
function MarketReport() {
  const [soldListStatus, setSoldListStatus] = useState([]);
  const [selSale,        setSelSale]        = useState(null); // { sale_no, batch_name }
  const [marketData,     setMarketData]     = useState([]);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState('');
  const [gardenFilter,   setGardenFilter]   = useState('');

  useEffect(() => {
    api.get('/reports/sold-list-status')
      .then(r => setSoldListStatus(r.data || []))
      .catch(() => {});
  }, []);

  const loadMarket = async (s) => {
    setSelSale(s);
    setLoading(true);
    setError('');
    setMarketData([]);
    setGardenFilter('');
    try {
      const r = await api.get(`/reports/market?sale_no=${s.sale_no}`);
      if (!r.data || r.data.length === 0) {
        setError('No sold list data found for this sale.');
      } else {
        setMarketData(r.data);
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally { setLoading(false); }
  };

  // Build garden map: garden -> { origin, grades: { grade: { low, high } } }
  const gardenMap = {};
  marketData.forEach(row => {
    const g = row.garden || '—';
    if (!gardenMap[g]) gardenMap[g] = { origin: row.origin || '—', grades: {} };
    gardenMap[g].grades[row.grade || '—'] = {
      low:  parseFloat(row.price_low)  || 0,
      high: parseFloat(row.price_high) || 0,
    };
  });
  const allGardens = Object.keys(gardenMap).sort();
  const shown = gardenFilter ? allGardens.filter(g => g === gardenFilter) : allGardens;

  const titleStr  = selSale ? `Sold List ${selSale.sale_no} Market Price Report` : 'Market Price Report';

  const downloadPDF = () => {
    const bodyRows = shown.flatMap(garden => {
      const info   = gardenMap[garden];
      const grades = Object.keys(info.grades).sort();
      return grades.map((grade, gi) => {
        const d = info.grades[grade];
        const isLast = gi === grades.length - 1;
        const rowBorder = isLast ? 'border-bottom:3px solid #94a3b8' : '';
        const cell = d.low === 0 ? '<td style="text-align:right;color:#ccc">—</td>'
          : d.low === d.high
            ? `<td style="text-align:right;color:#1a7a4a;font-weight:700">\u20B9${d.low.toFixed(0)}</td>`
            : `<td style="text-align:right"><span style="color:#1a7a4a;font-weight:700">\u20B9${d.low.toFixed(0)}</span> \u2013 <span style="color:#c0392b;font-weight:700">\u20B9${d.high.toFixed(0)}</span></td>`;
        return `<tr style="background:${gi%2===0?'#fff':'#f9fafb'};${rowBorder}">
          ${gi===0 ? `<td rowspan="${grades.length}" style="font-weight:700;color:#1a3c5e;vertical-align:top;padding-top:5px;border-right:2px solid #e2e8f0;border-bottom:3px solid #94a3b8">${garden}</td>` : ''}
          <td><span style="background:#dbeafe;color:#1e40af;padding:1px 5px;border-radius:8px;font-weight:800;font-size:8px">${grade}</span></td>
          ${cell}
        </tr>`;
      });
    }).join('');

    const html = `<!DOCTYPE html><html><head><title>${titleStr}</title>
<style>
  body { font-family:Arial,sans-serif;font-size:10px;margin:12mm;margin-top:20mm;color:#1a2533; }
  h1 { font-size:13px;color:#1a3c5e;margin:0; }
  table { width:100%;border-collapse:collapse;font-size:9px;border:1px solid #e2e8f0; }
  th { background:#1a3c5e;color:#fff;padding:4px 6px;text-align:left; }
  th.r { text-align:right; }
  td { padding:3px 6px;border-bottom:1px solid #f0f4f8; }
  .page-logo-header { position:fixed;top:0;left:0;right:0;background:#fff;padding:3px 12mm;display:flex;align-items:center;gap:10px;border-bottom:2px solid #1a3c5e;z-index:9999; }
  .page-logo-header img { height:34px;width:34px;object-fit:contain; }
  .page-logo-header h1 { font-size:12px;color:#1a3c5e;margin:0; }
  @page { size:A4 landscape;margin:20mm 8mm 8mm 8mm; }
  @media print { body { -webkit-print-color-adjust:exact;print-color-adjust:exact; } }
</style></head><body>
<div class="page-logo-header">
  <div><h1>${titleStr}</h1></div>
</div>
<table>
  <thead><tr><th>Garden</th><th>Grade</th><th class="r">Min–Max ₹</th></tr></thead>
  <tbody>${bodyRows}</tbody>
</table>
</body></html>`;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close(); win.focus();
    setTimeout(() => { win.print(); win.close(); }, 600);
  };

  const thM = (right) => ({ padding: '6px 8px', textAlign: right ? 'right' : 'left', fontWeight: 700, color: '#fff', background: '#1a3c5e', fontSize: 11, whiteSpace: 'nowrap' });
  const tdM = (extra) => ({ padding: '6px 10px', ...extra });

  return (
    <div>
      {/* Sold list selector */}
      <Card style={{ marginBottom: 12, padding: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: soldListStatus.length > 0 ? 12 : 0 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: '#1a3c5e' }}>📂 Select Sold List</span>
        </div>
        {soldListStatus.length === 0 && (
          <div style={{ fontSize: 13, color: '#c0392b', padding: '8px 0' }}>
            No sold lists imported yet. Use the Import page to upload sold list data.
          </div>
        )}
        {soldListStatus.length > 0 && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {soldListStatus.map(s => {
              const isSel = selSale && selSale.sale_no === s.sale_no;
              return (
                <button key={s.sale_no} onClick={() => loadMarket(s)}
                  style={{
                    padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    border: '2px solid', borderColor: isSel ? '#1a3c5e' : '#cbd5e0',
                    background: isSel ? '#1a3c5e' : '#fff',
                    color: isSel ? '#fff' : '#444',
                  }}>
                  <div>Sale #{s.sale_no}</div>
                  <div style={{ fontSize: 10, fontWeight: 400, opacity: 0.75, marginTop: 2 }}>
                    {s.row_count} rows · ₹{parseFloat(s.min_price).toFixed(0)}–₹{parseFloat(s.max_price).toFixed(0)}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {/* Report */}
      <Card>
        <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h3 style={{ fontSize: 15, margin: 0, color: '#1a3c5e' }}>{titleStr}</h3>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Garden-wise grade prices (Low / High) from Sold List</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {allGardens.length > 0 && (
              <select value={gardenFilter} onChange={e => setGardenFilter(e.target.value)}
                style={{ padding: '6px 10px', border: '1.5px solid #cbd5e0', borderRadius: 6, fontSize: 12, minWidth: 160 }}>
                <option value="">All Gardens ({allGardens.length})</option>
                {allGardens.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            )}
            {marketData.length > 0 && (
              <button onClick={downloadPDF}
                style={{ padding: '6px 16px', background: '#1a7a4a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                📄 Download PDF
              </button>
            )}
          </div>
        </div>

        {!selSale && (
          <div style={{ padding: 30, textAlign: 'center', color: '#aaa' }}>
            Select a sold list above to view the market price report.
          </div>
        )}
        {loading && <div style={{ padding: 30, textAlign: 'center', color: '#888' }}>⏳ Loading market data...</div>}
        {!loading && error && (
          <div style={{ padding: 16, background: '#fff5f5', border: '1px solid #fed7d7', borderRadius: 8, color: '#c0392b', fontSize: 13 }}>
            ⚠️ {error}
          </div>
        )}
        {!loading && !error && shown.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={thM(false)}>Garden (Mark)</th>
                  <th style={thM(false)}>Grade</th>
                  <th style={{ ...thM(true), background: '#1a4c7e' }}>Min–Max ₹</th>
                </tr>
              </thead>
              <tbody>
                {shown.flatMap(garden => {
                  const info   = gardenMap[garden];
                  const grades = Object.keys(info.grades).sort();
                  return grades.map((grade, gi) => {
                    const d = info.grades[grade];
                    const isLastGrade = gi === grades.length - 1;
                    const gardenBorderBottom = isLastGrade ? '3px solid #94a3b8' : '1px solid #f0f4f8';
                    return (
                      <tr key={`${garden}-${grade}`} style={{ borderBottom: gardenBorderBottom, background: gi % 2 === 0 ? '#fff' : '#fafbfc' }}>
                        {gi === 0 && (
                          <td rowSpan={grades.length}
                            style={{ padding: '8px 10px', fontWeight: 700, color: '#1a3c5e', verticalAlign: 'top', borderRight: '2px solid #e2e8f0', borderBottom: '3px solid #94a3b8' }}>
                            {garden}
                          </td>
                        )}
                        <td style={tdM()}>
                          <span style={{ background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>{grade}</span>
                        </td>
                        <td style={tdM({ textAlign: 'right', whiteSpace: 'nowrap' })}>
                          {d.low === 0
                            ? <span style={{ color: '#ccc' }}>—</span>
                            : d.low === d.high
                              ? <span style={{ fontWeight: 700, color: '#1a7a4a' }}>₹{d.low.toFixed(0)}</span>
                              : <span>
                                  <span style={{ fontWeight: 700, color: '#1a7a4a' }}>₹{d.low.toFixed(0)}</span>
                                  <span style={{ color: '#aaa', margin: '0 4px' }}>–</span>
                                  <span style={{ fontWeight: 700, color: '#c0392b' }}>₹{d.high.toFixed(0)}</span>
                                </span>
                          }
                        </td>
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState('party');
  const [saleNos,   setSaleNos]   = useState([]);

  useEffect(() => {
    api.get('/import/sale-numbers')
      .then(r => setSaleNos(r.data))
      .catch(() => {});
  }, []);

  const tabBtn = (key) => ({
    padding: '8px 22px', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 13,
    border: 'none',
    background: activeTab === key ? '#1a3c5e' : '#f0f4f8',
    color:      activeTab === key ? '#fff'    : '#555',
  });

  return (
    <div>
      <h2 style={{ marginBottom: 4, color: '#1a3c5e' }}>📊 Reports</h2>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>Party marking report and market price report.</p>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button style={tabBtn('party')}  onClick={() => setActiveTab('party')}>👥 Party Report</button>
        <button style={tabBtn('market')} onClick={() => setActiveTab('market')}>📈 Market Report</button>
      </div>

      {activeTab === 'party'  && <PartyReport saleNos={saleNos} />}
      {activeTab === 'market' && <MarketReport />}
    </div>
  );
}
