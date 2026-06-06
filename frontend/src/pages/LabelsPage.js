import React, { useState, useEffect, useRef } from 'react';
import { Card, api } from '../App';

export default function LabelsPage() {
  const [saleNos,     setSaleNos]     = useState([]);
  const [selSale,     setSelSale]     = useState('');
  const [selBatch,    setSelBatch]    = useState('');
  const [markings,    setMarkings]    = useState([]);
  const [histPrices,  setHistPrices]  = useState({});
  const [prevSaleNos, setPrevSaleNos] = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [showHist,    setShowHist]    = useState(true);
  const [prevSales,   setPrevSales]   = useState(2);
  const [filterParties, setFilterParties] = useState([]);
  const [partyDropOpen, setPartyDropOpen] = useState(false);
  const [partySearch,   setPartySearch]   = useState('');
  const [filterGrades,  setFilterGrades]  = useState([]);
  const [gradeDropOpen, setGradeDropOpen] = useState(false);
  const [gradeSearch,   setGradeSearch]   = useState('');
  const [filterBrokers, setFilterBrokers] = useState([]);
  const [brokerDropOpen, setBrokerDropOpen] = useState(false);
  const [brokerSearch,   setBrokerSearch]   = useState('');
  const [lotFrom, setLotFrom] = useState('');
  const [lotTo, setLotTo] = useState('');

  useEffect(() => {
    api.get('/import/sale-numbers')
      .then(r => {
        setSaleNos(r.data);
        if (r.data[0]) {
          setSelSale(String(r.data[0].sale_no));
          setSelBatch(r.data[0].batch_name || '');
        }
      })
      .catch(() => {});
  }, []);

  const partyDropRef  = useRef(null);
  const gradeDropRef  = useRef(null);
  const brokerDropRef = useRef(null);

  useEffect(() => {
    if (!partyDropOpen) return;
    const h = e => { if (partyDropRef.current && !partyDropRef.current.contains(e.target)) { setPartyDropOpen(false); setPartySearch(''); } };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [partyDropOpen]);

  useEffect(() => {
    if (!gradeDropOpen) return;
    const h = e => { if (gradeDropRef.current && !gradeDropRef.current.contains(e.target)) { setGradeDropOpen(false); setGradeSearch(''); } };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [gradeDropOpen]);

  useEffect(() => {
    if (!brokerDropOpen) return;
    const h = e => { if (brokerDropRef.current && !brokerDropRef.current.contains(e.target)) { setBrokerDropOpen(false); setBrokerSearch(''); } };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [brokerDropOpen]);

  const load = async (sale, batch, pSales) => {
    if (!sale) return;
    setLoading(true);
    const bParam = batch ? `&batch_name=${encodeURIComponent(batch)}` : '';
    try {
      const [mRes, hRes] = await Promise.all([
        api.get(`/labels/markings?sale_no=${sale}${bParam}`),
        api.get(`/labels/historical-prices?sale_no=${sale}&prev_sales=${pSales || prevSales}${bParam}`)
      ]);
      setMarkings(mRes.data || []);
      setHistPrices(hRes.data.lookup || {});
      setPrevSaleNos(hRes.data.prev_sale_nos || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSaleChange = v => {
    const [s, b] = v.split('||');
    setSelSale(s); setSelBatch(b || '');
    load(s, b || '', prevSales);
  };
  const handlePrevChange = n => { setPrevSales(n); if (selSale) load(selSale, selBatch, n); };

  const seen = new Set();
  const unique = markings.filter(m => {
    const k = `${m.party_code}__${m.garden}__${m.grade}__${m.lot_no}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });

  const parties = [...new Set(unique.map(m => m.party_code))].sort();
  const grades  = [...new Set(unique.map(m => m.grade))].sort();
  const brokers = [...new Set(unique.map(m => m.broker).filter(Boolean))].sort(); // NEW

  // Extract prefix and numeric part: "JT0063"→{pfx:"JT",num:63}, "JT-1"→{pfx:"JT",num:1}, "ALB0005"→{pfx:"ALB",num:5}
  const parseLot = (lot) => {
    if (!lot) return null;
    const m = lot.match(/^([A-Za-z]+)[-]?0*(\d+)$/);
    return m ? { pfx: m[1].toUpperCase(), num: parseInt(m[2], 10) } : null;
  };

  const lotFromParsed = parseLot(lotFrom);
  const lotToParsed = parseLot(lotTo);

  const filtered = unique.filter(m => {
    if (filterParties.length > 0 && !filterParties.includes(m.party_code)) return false;
    if (filterGrades.length  > 0 && !filterGrades.includes(m.grade))       return false;
    if (filterBrokers.length > 0 && !filterBrokers.includes(m.broker))     return false;
    if (lotFromParsed || lotToParsed) {
      const lot = parseLot(m.lot_no);
      if (!lot) return false;
      if (lotFromParsed) {
        if (lot.pfx !== lotFromParsed.pfx) return false;
        if (lot.num < lotFromParsed.num) return false;
      }
      if (lotToParsed) {
        if (lot.pfx !== lotToParsed.pfx) return false;
        if (lot.num > lotToParsed.num) return false;
      }
    }
    return true;
  }).sort((a, b) => {
    const la = parseLot(a.lot_no);
    const lb = parseLot(b.lot_no);
    // Items without lot go to the end
    if (!la && !lb) return (a.party_code || '').localeCompare(b.party_code || '');
    if (!la) return 1;
    if (!lb) return -1;
    // Sort by prefix alphabetically, then by lot number numerically
    const pfxCmp = la.pfx.localeCompare(lb.pfx);
    if (pfxCmp !== 0) return pfxCmp;
    if (la.num !== lb.num) return la.num - lb.num;
    // Same lot number → sort by party_code
    return (a.party_code || '').localeCompare(b.party_code || '');
  });

  const fmtLot = lot => {
    if (!lot) return '';
    const m = lot.match(/^([A-Za-z]+)[-]?0*(\d+)$/);
    if (m) return `${m[1]}-${parseInt(m[2], 10)}`;
    return lot;
  };

  const fmtDate = d => {
    if (!d) return '';
    try {
      const dt = new Date(d);
      return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}`;
    } catch { return ''; }
  };

  // Backend returns historical-prices lookup keyed by lowercase+trim
  const histKey = (g, gr) =>
    `${String(g || '').trim().toLowerCase()}__${String(gr || '').trim().toLowerCase()}`;

  const printLabels = () => {
    const win = window.open('', '_blank');
    const fmt = lot => {
      if (!lot) return '';
      const m = lot.match(/^([A-Za-z]+)[-]?0*(\d+)$/);
      return m ? `${m[1]}-${parseInt(m[2], 10)}` : lot;
    };

    const labelsHtml = filtered.map(m => {
      const histData = histPrices[histKey(m.garden, m.grade)];
      const gpDate   = fmtDate(m.gp_date);

      let histLine = '';
      if (showHist && histData && histData.sales && histData.sales.length > 0) {
        const parts = histData.sales.map(s => {
          const lo = s.price_low, hi = s.price_high;
          const priceStr = lo === hi ? `${lo}/-` : `${lo}-${hi}`;
          return `S⁄${s.sale_no}-${priceStr}`;
        });
        histLine = `<div class="hist">${parts.join(' | ')}</div>`;
      }

      // Grade on Row 3 before Garden name
      return `<div class="lbl">
  <div class="r1">
    <b>${m.party_code}</b><span class="d">|</span>S${m.sale_no}<span class="d">|</span><b>${fmt(m.lot_no)}</b>
  </div>
  <div class="r2">
    <b class="inv">${m.invoice_raw || m.invoice || ''}</b><span class="d">|</span><span>${m.bags || '?'}&#215;${m.net_wt || '?'}</span>${gpDate ? `<span class="d">|</span><span>${gpDate}</span>` : ''}
  </div>
  <div class="r3">
    <b class="grd">${m.grade}</b><span class="d">|</span><span class="gname">${m.garden}</span>
  </div>
  <div class="orig">${m.origin || ''}</div>
  ${histLine}
</div>`;
    }).join('');

    win.document.write(`<!DOCTYPE html>
<html><head><title>Labels Sale #${selSale}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:Arial,Helvetica,sans-serif;color:#000;}
@page{
  size:210mm 297mm;
  margin-top:9.5mm;
  margin-bottom:3mm;
  margin-left:11mm;
  margin-right:5mm;
}
.grid{
  display:grid;
  grid-template-columns:repeat(4,48mm);
  justify-content:center;
  grid-auto-rows:23mm;
  gap:0.3mm;
  width:192mm;
}
.lbl{
  width:48mm;
  height:23mm;
  border:none;
  overflow:hidden;
  display:flex;
  flex-direction:column;
  justify-content:center;
  gap:0.3mm;
  padding:1.5mm 2mm 1.5mm 4mm;
  page-break-inside:avoid;
  break-inside:avoid;
  line-height:1.2;
}
.r1{font-size:6pt;display:flex;align-items:center;gap:0.8mm;white-space:nowrap;overflow:hidden;}
.r1 b{font-weight:900;font-size:8pt;}
.r2{font-size:6pt;display:flex;align-items:center;gap:1mm;white-space:nowrap;overflow:hidden;}
.r3{font-size:6pt;display:flex;align-items:center;gap:1mm;white-space:nowrap;overflow:hidden;}
.d{color:#555;font-size:6pt;}
.inv{font-size:6pt;font-weight:900;color:#000;}
.grd{background:none;color:#000;border:none;padding:0;font-size:7pt;font-weight:900;}
.gname{font-size:6.5pt;font-weight:900;color:#000;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.orig{font-size:5.5pt;color:#000;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2;}
.hist{font-size:6.5pt;font-weight:700;color:#000;background:none;border:none;padding:0;white-space:nowrap;overflow:hidden;line-height:1.2;}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}.lbl{page-break-inside:avoid;}}
</style></head><body>
<div class="grid">${labelsHtml}</div>
</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 500);
  };


  const previewCard = (m, i) => {
    const histData = histPrices[histKey(m.garden, m.grade)];
    const gpDate   = fmtDate(m.gp_date);
    const s = { flexShrink: 0 };

    let histText = null;
    if (showHist && histData && histData.sales && histData.sales.length > 0) {
      histText = histData.sales.map(sale => {
        const lo = sale.price_low, hi = sale.price_high;
        return `S⁄${sale.sale_no}-${lo === hi ? lo + '/-' : lo + '-' + hi}`;
      }).join(' | ');
    }

    // CHANGED: Grade on line 3 alongside garden
    return (
      <div key={i} style={{ width: 192, height: histText ? 100 : 88, border: '1px dashed #ccc', borderTop: 'none', borderLeft: 'none', padding: '4px 10px 4px 8px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#fff', overflow: 'hidden' }}>
        {/* Row 1: PartyCode | S{sale} | LotNo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, borderBottom: '1px solid #e5e7eb', paddingBottom: 3, ...s }}>
          <span style={{ fontWeight: 900, fontSize: 11 }}>{m.party_code}</span>
          <span style={{ color: '#ccc', fontSize: 8 }}>|</span>
          <span style={{ fontSize: 9, color: '#555' }}>S{m.sale_no}</span>
          <span style={{ color: '#ccc', fontSize: 8 }}>|</span>
          <span style={{ fontWeight: 900, fontSize: 11, color: '#1a3c5e' }}>{fmtLot(m.lot_no)}</span>
        </div>
        {/* Row 2: Invoice | Bags×NWt | GP Date */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, ...s }}>
          <span style={{ fontWeight: 900, fontSize: 10, color: '#222' }}>{m.invoice_raw || m.invoice || ''}</span>
          <span style={{ color: '#ccc' }}>|</span>
          <span style={{ fontWeight: 600, color: '#374151' }}>{m.bags || '?'}&times;{m.net_wt || '?'}</span>
          {gpDate && <><span style={{ color: '#ccc' }}>|</span><span style={{ color: '#555' }}>{gpDate}</span></>}
        </div>
        {/* Row 3: Grade | GARDEN NAME */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, ...s }}>
          <span style={{ fontWeight: 900, fontSize: 11, color: '#000' }}>{m.grade}</span>
          <span style={{ color: '#ccc', fontSize: 8 }}>|</span>
          <span style={{ fontWeight: 900, fontSize: 11, color: '#000', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {m.garden}
          </span>
        </div>
        {/* Row 4: Origin */}
        <div style={{ fontSize: 8, color: '#555', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600, ...s }}>
          {m.origin || ''}
        </div>
        {histText && (
          <div style={{ fontSize: 8, fontWeight: 700, color: '#374151', background: 'none', paddingTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...s }}>
            {histText}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <h2 style={{ marginBottom: 2, color: '#1a3c5e', fontSize: 20, fontWeight: 800 }}>Print Labels</h2>
      <p style={{ color: '#9ca3af', fontSize: 12, marginBottom: 14 }}>
        48 labels per A4 — 4 columns x 12 rows (48mm x 24mm each).
      </p>

      <Card style={{ marginBottom: 14, padding: 14 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* Sale selector */}
          <div>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' }}>Sale / Batch</label>
            <select value={selSale ? `${selSale}||${selBatch}` : ''} onChange={e => handleSaleChange(e.target.value)}
              style={{ padding: '7px 12px', border: '1.5px solid #cbd5e0', borderRadius: 6, fontSize: 13, minWidth: 280 }}>
              <option value="">Select sale...</option>
              {saleNos.map(s => {
                const val = `${s.sale_no}||${s.batch_name || ''}`;
                const label = s.batch_name
                  ? `Sale ${s.sale_no} — ${s.batch_name} (${s.lot_count} lots)`
                  : `Sale ${s.sale_no} (${s.lot_count} lots)`;
                return <option key={val} value={val}>{label}</option>;
              })}
            </select>
          </div>

          {/* Historical LSP */}
          <div style={{ padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', marginBottom: 6 }}>Historical LSP on Label</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={showHist} onChange={e => setShowHist(e.target.checked)} style={{ width: 14, height: 14 }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#92400e' }}>Show Last Sold Price from prev sales</span>
            </label>
            {showHist && (
              <div>
                <div style={{ fontSize: 10, color: '#b45309', marginBottom: 4, fontWeight: 600 }}>No. of previous sales:</div>
                <div style={{ display: 'flex', gap: 5 }}>
                  {[1,2,3,4].map(n => (
                    <button key={n} onClick={() => handlePrevChange(n)}
                      style={{ padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        background: prevSales === n ? '#f59e0b' : '#fef3c7',
                        color: prevSales === n ? '#fff' : '#92400e',
                        border: `1.5px solid ${prevSales === n ? '#f59e0b' : '#fde68a'}` }}>{n}</button>
                  ))}
                </div>
                {prevSaleNos.length > 0 && (
                  <div style={{ fontSize: 9, color: '#b45309', marginTop: 4 }}>Using Sale {prevSaleNos.join(', ')}</div>
                )}
              </div>
            )}
          </div>

          {/* Party filter — multi-select */}
          <div style={{ position: 'relative' }} ref={partyDropRef}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' }}>Party</label>
            <div
              onClick={() => setPartyDropOpen(o => !o)}
              style={{ padding: '6px 10px', border: `1.5px solid ${partyDropOpen ? '#1a3c5e' : '#cbd5e0'}`, borderRadius: 5, fontSize: 12, minWidth: 160, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, background: '#fff', userSelect: 'none' }}>
              <span style={{ color: filterParties.length ? '#1a3c5e' : '#9ca3af', fontWeight: filterParties.length ? 700 : 400 }}>
                {filterParties.length === 0 ? 'All Parties' : filterParties.length === 1 ? filterParties[0] : `${filterParties.length} parties`}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {filterParties.length > 0 && (
                  <span style={{ background: '#1a3c5e', color: '#fff', borderRadius: 99, fontSize: 9, padding: '1px 5px', fontWeight: 700 }}>{filterParties.length}</span>
                )}
                <span style={{ fontSize: 9, opacity: 0.5 }}>▼</span>
              </span>
            </div>
            {partyDropOpen && (
              <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 9999, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
                boxShadow: '0 8px 24px rgba(0,0,0,0.15)', minWidth: 200, maxHeight: 320, display: 'flex', flexDirection: 'column', marginTop: 2 }}
                onMouseLeave={() => {}}>
                {/* Search */}
                <div style={{ padding: '6px 8px', borderBottom: '1px solid #f0f4f8', flexShrink: 0 }}>
                  <input autoFocus value={partySearch} onChange={e => setPartySearch(e.target.value)}
                    placeholder="Search parties..." onMouseDown={e => e.stopPropagation()}
                    style={{ width: '100%', padding: '4px 7px', border: '1.5px solid #cbd5e0', borderRadius: 5, fontSize: 11, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                {/* Select All / Clear row */}
                <div style={{ padding: '4px 10px', borderBottom: '1px solid #f0f4f8', display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
                  <button onMouseDown={e => { e.preventDefault(); setFilterParties([...parties]); }}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 10, color: '#1a3c5e', fontWeight: 700 }}>Select All</button>
                  <button onMouseDown={e => { e.preventDefault(); setFilterParties([]); }}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 10, color: '#c0392b', fontWeight: 700 }}>Clear</button>
                </div>
                {/* Party list */}
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  {parties.filter(p => !partySearch || p.toLowerCase().includes(partySearch.toLowerCase())).map(p => {
                    const checked = filterParties.includes(p);
                    return (
                      <div key={p} onMouseDown={e => { e.preventDefault(); setFilterParties(prev => checked ? prev.filter(x => x !== p) : [...prev, p]); }}
                        style={{ padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                          background: checked ? '#eff6ff' : '#fff', fontSize: 12, color: '#1a2533', borderBottom: '1px solid #f9fafb' }}>
                        <div style={{ width: 13, height: 13, borderRadius: 2, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          border: `2px solid ${checked ? '#1a3c5e' : '#cbd5e0'}`, background: checked ? '#1a3c5e' : '#fff' }}>
                          {checked && <span style={{ color: '#fff', fontSize: 8, fontWeight: 700 }}>✓</span>}
                        </div>
                        <span style={{ fontWeight: checked ? 700 : 400 }}>{p}</span>
                      </div>
                    );
                  })}
                </div>
                {/* Close button */}
                <div style={{ padding: '5px 10px', borderTop: '1px solid #f0f4f8', flexShrink: 0, textAlign: 'right' }}>
                  <button onMouseDown={e => { e.preventDefault(); setPartyDropOpen(false); }}
                    style={{ border: '1px solid #cbd5e0', background: '#f9fafb', borderRadius: 4, padding: '2px 12px', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>Done</button>
                </div>
              </div>
            )}
          </div>

          {/* Grade filter — multi-select */}
          <div style={{ position: 'relative' }} ref={gradeDropRef}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' }}>Grade</label>
            <div
              onClick={() => setGradeDropOpen(o => !o)}
              style={{ padding: '6px 10px', border: `1.5px solid ${gradeDropOpen ? '#1a3c5e' : '#cbd5e0'}`, borderRadius: 5, fontSize: 12, minWidth: 140, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, background: '#fff', userSelect: 'none' }}>
              <span style={{ color: filterGrades.length ? '#1a3c5e' : '#9ca3af', fontWeight: filterGrades.length ? 700 : 400 }}>
                {filterGrades.length === 0 ? 'All Grades' : filterGrades.length === 1 ? filterGrades[0] : `${filterGrades.length} grades`}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {filterGrades.length > 0 && (
                  <span style={{ background: '#1a3c5e', color: '#fff', borderRadius: 99, fontSize: 9, padding: '1px 5px', fontWeight: 700 }}>{filterGrades.length}</span>
                )}
                <span style={{ fontSize: 9, opacity: 0.5 }}>▼</span>
              </span>
            </div>
            {gradeDropOpen && (
              <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 9999, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
                boxShadow: '0 8px 24px rgba(0,0,0,0.15)', minWidth: 180, maxHeight: 300, display: 'flex', flexDirection: 'column', marginTop: 2 }}>
                <div style={{ padding: '6px 8px', borderBottom: '1px solid #f0f4f8', flexShrink: 0 }}>
                  <input autoFocus value={gradeSearch} onChange={e => setGradeSearch(e.target.value)}
                    placeholder="Search grades..." onMouseDown={e => e.stopPropagation()}
                    style={{ width: '100%', padding: '4px 7px', border: '1.5px solid #cbd5e0', borderRadius: 5, fontSize: 11, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ padding: '4px 10px', borderBottom: '1px solid #f0f4f8', display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
                  <button onMouseDown={e => { e.preventDefault(); setFilterGrades([...grades]); }}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 10, color: '#1a3c5e', fontWeight: 700 }}>Select All</button>
                  <button onMouseDown={e => { e.preventDefault(); setFilterGrades([]); }}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 10, color: '#c0392b', fontWeight: 700 }}>Clear</button>
                </div>
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  {grades.filter(g => !gradeSearch || g.toLowerCase().includes(gradeSearch.toLowerCase())).map(g => {
                    const checked = filterGrades.includes(g);
                    return (
                      <div key={g} onMouseDown={e => { e.preventDefault(); setFilterGrades(prev => checked ? prev.filter(x => x !== g) : [...prev, g]); }}
                        style={{ padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                          background: checked ? '#eff6ff' : '#fff', fontSize: 12, color: '#1a2533', borderBottom: '1px solid #f9fafb' }}>
                        <div style={{ width: 13, height: 13, borderRadius: 2, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          border: `2px solid ${checked ? '#1a3c5e' : '#cbd5e0'}`, background: checked ? '#1a3c5e' : '#fff' }}>
                          {checked && <span style={{ color: '#fff', fontSize: 8, fontWeight: 700 }}>✓</span>}
                        </div>
                        <span style={{ fontWeight: checked ? 700 : 400 }}>{g}</span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ padding: '5px 10px', borderTop: '1px solid #f0f4f8', flexShrink: 0, textAlign: 'right' }}>
                  <button onMouseDown={e => { e.preventDefault(); setGradeDropOpen(false); }}
                    style={{ border: '1px solid #cbd5e0', background: '#f9fafb', borderRadius: 4, padding: '2px 12px', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>Done</button>
                </div>
              </div>
            )}
          </div>

          {/* Broker filter — multi-select */}
          <div style={{ position: 'relative' }} ref={brokerDropRef}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' }}>Broker</label>
            <div
              onClick={() => setBrokerDropOpen(o => !o)}
              style={{ padding: '6px 10px', border: `1.5px solid ${brokerDropOpen ? '#1a3c5e' : '#cbd5e0'}`, borderRadius: 5, fontSize: 12, minWidth: 150, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, background: '#fff', userSelect: 'none' }}>
              <span style={{ color: filterBrokers.length ? '#1a3c5e' : '#9ca3af', fontWeight: filterBrokers.length ? 700 : 400 }}>
                {filterBrokers.length === 0 ? 'All Brokers' : filterBrokers.length === 1 ? filterBrokers[0] : `${filterBrokers.length} brokers`}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {filterBrokers.length > 0 && (
                  <span style={{ background: '#1a3c5e', color: '#fff', borderRadius: 99, fontSize: 9, padding: '1px 5px', fontWeight: 700 }}>{filterBrokers.length}</span>
                )}
                <span style={{ fontSize: 9, opacity: 0.5 }}>▼</span>
              </span>
            </div>
            {brokerDropOpen && (
              <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 9999, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
                boxShadow: '0 8px 24px rgba(0,0,0,0.15)', minWidth: 200, maxHeight: 300, display: 'flex', flexDirection: 'column', marginTop: 2 }}>
                <div style={{ padding: '6px 8px', borderBottom: '1px solid #f0f4f8', flexShrink: 0 }}>
                  <input autoFocus value={brokerSearch} onChange={e => setBrokerSearch(e.target.value)}
                    placeholder="Search brokers..." onMouseDown={e => e.stopPropagation()}
                    style={{ width: '100%', padding: '4px 7px', border: '1.5px solid #cbd5e0', borderRadius: 5, fontSize: 11, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ padding: '4px 10px', borderBottom: '1px solid #f0f4f8', display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
                  <button onMouseDown={e => { e.preventDefault(); setFilterBrokers([...brokers]); }}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 10, color: '#1a3c5e', fontWeight: 700 }}>Select All</button>
                  <button onMouseDown={e => { e.preventDefault(); setFilterBrokers([]); }}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 10, color: '#c0392b', fontWeight: 700 }}>Clear</button>
                </div>
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  {brokers.filter(b => !brokerSearch || b.toLowerCase().includes(brokerSearch.toLowerCase())).map(b => {
                    const checked = filterBrokers.includes(b);
                    return (
                      <div key={b} onMouseDown={e => { e.preventDefault(); setFilterBrokers(prev => checked ? prev.filter(x => x !== b) : [...prev, b]); }}
                        style={{ padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                          background: checked ? '#eff6ff' : '#fff', fontSize: 12, color: '#1a2533', borderBottom: '1px solid #f9fafb' }}>
                        <div style={{ width: 13, height: 13, borderRadius: 2, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          border: `2px solid ${checked ? '#1a3c5e' : '#cbd5e0'}`, background: checked ? '#1a3c5e' : '#fff' }}>
                          {checked && <span style={{ color: '#fff', fontSize: 8, fontWeight: 700 }}>✓</span>}
                        </div>
                        <span style={{ fontWeight: checked ? 700 : 400 }}>{b}</span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ padding: '5px 10px', borderTop: '1px solid #f0f4f8', flexShrink: 0, textAlign: 'right' }}>
                  <button onMouseDown={e => { e.preventDefault(); setBrokerDropOpen(false); }}
                    style={{ border: '1px solid #cbd5e0', background: '#f9fafb', borderRadius: 4, padding: '2px 12px', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>Done</button>
                </div>
              </div>
            )}
          </div>

          {/* Lot Range filter */}
          <div>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' }}>Lot Range</label>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input type="text" value={lotFrom} onChange={e => setLotFrom(e.target.value)}
                placeholder="e.g. JT-1"
                style={{ padding: '6px 8px', border: '1.5px solid #cbd5e0', borderRadius: 5, fontSize: 12, width: 80 }} />
              <span style={{ fontSize: 11, color: '#9ca3af' }}>to</span>
              <input type="text" value={lotTo} onChange={e => setLotTo(e.target.value)}
                placeholder="e.g. JT-100"
                style={{ padding: '6px 8px', border: '1.5px solid #cbd5e0', borderRadius: 5, fontSize: 12, width: 80 }} />
            </div>
          </div>
        </div>

        {filtered.length > 0 && (
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={printLabels}
              style={{ padding: '8px 22px', background: '#1a3c5e', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
              Print {filtered.length} Labels ({Math.ceil(filtered.length / 48)} page{filtered.length > 48 ? 's' : ''})
            </button>
            <span style={{ fontSize: 11, color: '#6b7280' }}>4 cols x 12 rows — 48×24mm — 48 per A4</span>
            {(filterParties.length > 0 || filterGrades.length > 0 || filterBrokers.length > 0 || lotFrom || lotTo) && (
              <button onClick={() => { setFilterParties([]); setFilterGrades([]); setFilterBrokers([]); setLotFrom(''); setLotTo(''); }}
                style={{ fontSize: 11, color: '#c0392b', background: 'none', border: '1px solid #fecaca', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>
                Clear filters
              </button>
            )}
          </div>
        )}
      </Card>

      {loading && <Card style={{ padding: 30, textAlign: 'center', color: '#888' }}>Loading...</Card>}
      {!loading && !filtered.length && selSale && (
        <Card style={{ padding: 30, textAlign: 'center', color: '#aaa' }}>No markings for Sale #{selSale}{selBatch && ` / "${selBatch}"`}. Create markings first.</Card>
      )}

      {!loading && filtered.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10, fontWeight: 600 }}>
            Preview — {filtered.length} labels
            <span style={{ fontSize: 10, fontWeight: 400, marginLeft: 8, color: '#9ca3af' }}>(screen preview enlarged for readability)</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {filtered.map((m, i) => previewCard(m, i))}
          </div>
        </div>
      )}
    </div>
  );
}
