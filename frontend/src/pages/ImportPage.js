import React, { useState, useEffect, useRef } from 'react';
import { Card, Button, api } from '../App';

const MultiSelect = ({ label, options, selected, onChange, width = 160 }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  const toggle = v => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  const label2 = selected.length === 0 ? `All ${label}` : selected.length === 1 ? selected[0] : `${selected.length} selected`;
  return (
    <div ref={ref} style={{ position: 'relative', minWidth: width }}>
      <div onClick={() => setOpen(o => !o)} style={{ padding: '6px 12px', border: '1.5px solid #cbd5e0', borderRadius: 6, cursor: 'pointer', background: '#fff', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, whiteSpace: 'nowrap' }}>
        <span style={{ color: selected.length > 0 ? '#1a3c5e' : '#888', fontWeight: selected.length > 0 ? 600 : 400 }}>{label2}</span>
        <span style={{ fontSize: 10, color: '#888' }}>▼</span>
      </div>
      {open && (
        <div style={{ position: 'absolute', top: '105%', left: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, zIndex: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: Math.max(width, 180), maxHeight: 280, overflowY: 'auto' }}>
          <div style={{ padding: '7px 12px', borderBottom: '1px solid #f0f4f8', display: 'flex', justifyContent: 'space-between', position: 'sticky', top: 0, background: '#fff' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#555' }}>{label}</span>
            <button onMouseDown={() => onChange([])} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 11, color: '#c0392b', fontWeight: 700 }}>Clear</button>
          </div>
          {options.map(opt => (
            <div key={opt} onMouseDown={() => toggle(opt)} style={{ padding: '7px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, background: selected.includes(opt) ? '#eff6ff' : '#fff', fontSize: 13, color: '#1a2533', borderBottom: '1px solid #f9fafb' }}>
              <div style={{ width: 15, height: 15, borderRadius: 3, flexShrink: 0, border: `2px solid ${selected.includes(opt) ? '#1a3c5e' : '#cbd5e0'}`, background: selected.includes(opt) ? '#1a3c5e' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {selected.includes(opt) && <span style={{ color: '#fff', fontSize: 9, fontWeight: 700 }}>✓</span>}
              </div>
              <span style={{ fontWeight: selected.includes(opt) ? 600 : 400 }}>{opt}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const DropZone = ({ label, file, onFile, drag, setDrag, inputId, color, linkedInfo }) => (
  <div style={{ flex: 1 }}>
    <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
    <div onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files[0]); }}
      onClick={() => document.getElementById(inputId).click()}
      style={{ border: `2px dashed ${drag ? color : (file ? color : '#cbd5e0')}`, borderRadius: 8, padding: '18px 14px', textAlign: 'center', cursor: 'pointer', background: file ? (color === '#1a3c5e' ? '#eff6ff' : '#f0fdf4') : '#fafbfc', minHeight: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <input id={inputId} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) onFile(e.target.files[0]); }} />
      {file ? <><div style={{ fontSize: 22, marginBottom: 4 }}>📄</div><div style={{ fontSize: 13, fontWeight: 700, color }}>{file.name}</div><div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{(file.size/1024/1024).toFixed(1)} MB · click to change</div></>
        : <><div style={{ fontSize: 28, marginBottom: 4 }}>📥</div><div style={{ fontSize: 13, color: '#888' }}>Drop or <span style={{ color, fontWeight: 700 }}>browse</span></div><div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>.xlsx · .xls · .csv (up to 200MB)</div></>}
    </div>
    {linkedInfo && <div style={{ fontSize: 11, color: '#888', marginTop: 4, textAlign: 'center' }}>{linkedInfo}</div>}
  </div>
);

export default function ImportPage() {
  const [catFile, setCatFile] = useState(null);
  const [soldFile, setSoldFile] = useState(null);
  const [batchName, setBatchName] = useState('');
  const [catResult, setCatResult] = useState(null);
  const [soldResult, setSoldResult] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [clearSale, setClearSale] = useState('');
  const [clearBatch, setClearBatch] = useState('');
  const [clearType, setClearType] = useState('all');
  const [preserveMarkings, setPreserveMarkings] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [clearResult, setClearResult] = useState(null);
  const [clearSaleNos, setClearSaleNos] = useState([]);  // [{sale_no, cat_rows, sl_rows}]
  const [catDrag, setCatDrag] = useState(false);
  const [soldDrag, setSoldDrag] = useState(false);

  // Standalone sold list upload (separate from catalogue)
  const [slFile,      setSlFile]      = useState(null);
  const [slDrag,      setSlDrag]      = useState(false);
  const [slUploading, setSlUploading] = useState(false);
  const [slResult,    setSlResult]    = useState(null);

  // Sold list available for mapping
  const [soldListSales,    setSoldListSales]    = useState([]);  // [{ sale_no, row_count, min_price, max_price }]
  const [selSoldListSale,  setSelSoldListSale]  = useState(''); // selected sale_no for catalogue mapping
  const [merged, setMerged] = useState([]);
  const [saleNos, setSaleNos] = useState([]);  // now includes batch_name
  const [selSales, setSelSales] = useState([]);
  const [selBatches, setSelBatches] = useState([]);
  const [selGrades, setSelGrades] = useState([]);
  const [selMarks, setSelMarks] = useState([]);
  const [selOrigins, setSelOrigins] = useState([]);
  const [searchLot, setSearchLot] = useState('');
  const [importLogs, setImportLogs] = useState([]);

  const loadClearSaleNos = () =>
    api.get('/import/clear-sale-numbers').then(r => setClearSaleNos(r.data || [])).catch(() => {});

  const loadSaleNos = () =>
    api.get('/import/sale-numbers').then(r => {
      setSaleNos(r.data);
      if (r.data[0]) {
        setSelSales([String(r.data[0].sale_no)]);
        if (r.data[0].batch_name) setSelBatches([r.data[0].batch_name]);
      }
    }).catch(() => {});

  const loadSoldListSales = () =>
    api.get('/import/sold-list-sales').then(r => setSoldListSales(r.data || [])).catch(() => {});

  const loadLogs = () =>
    api.get('/import/logs').then(r => setImportLogs(r.data)).catch(() => {});

  useEffect(() => { loadSaleNos(); loadClearSaleNos(); loadSoldListSales(); loadLogs(); }, []);

  useEffect(() => {
    if (!selSales.length) return;
    Promise.all(selSales.map(s => api.get(`/catalogue/merged?sale_no=${s}`).then(r => r.data).catch(() => [])))
      .then(results => setMerged(results.flat()));
  }, [selSales]);

  // Get unique batch names for the selected sales
  const allBatches = [...new Set(saleNos.filter(s => selSales.includes(String(s.sale_no))).map(s => s.batch_name || ''))].sort();
  // Get batches for clear dropdown
  const clearBatches = [...new Set(saleNos.filter(s => String(s.sale_no) === clearSale).map(s => s.batch_name || ''))].sort();

  const clearData = async (typeOverride) => {
    if (!clearSale) { alert('Select a sale number to clear'); return; }
    const type = typeOverride || clearType;
    const batchLabel = clearBatch ? ` / "${clearBatch}"` : '';
    const typeLabel = type === 'catalogue' ? 'Catalogue' : type === 'sold_list' ? 'Sold List' : (preserveMarkings ? 'Catalogue + Sold List (markings kept)' : 'ALL data incl. markings');
    if (!window.confirm(`Delete ${typeLabel} for Sale #${clearSale}${batchLabel}? This cannot be undone.`)) return;
    setClearing(type); setClearResult(null);
    try {
      let url = `/import/clear?sale_no=${clearSale}&type=${type}&preserve_markings=${type !== 'all' ? true : preserveMarkings}`;
      if (clearBatch) url += `&batch_name=${encodeURIComponent(clearBatch)}`;
      const r = await api.delete(url);
      const d = r.data.deleted;
      let msg = Object.entries(d).filter(([k]) => k !== 'markings_preserved').map(([k,v]) => `${v} ${k}`).join(', ');
      if (d.markings_preserved) msg += ' (markings preserved ✓)';
      setClearResult({ success: true, msg: `Deleted: ${msg} for Sale #${clearSale}${batchLabel}` });
      loadSaleNos(); loadClearSaleNos(); loadSoldListSales(); loadLogs();
    } catch (e) { setClearResult({ success: false, msg: e.response?.data?.error || e.message }); }
    finally { setClearing(false); }
  };

  const handleFile = (f, type) => {
    if (!f) return;
    const ext = f.name.split('.').pop().toLowerCase();
    if (!['xlsx','xls','csv'].includes(ext)) { alert('Only .xlsx / .xls / .csv'); return; }
    if (type === 'cat') setCatFile(f); else if (type === 'sold') setSoldFile(f); else setSlFile(f);
  };

  const uploadSoldListOnly = async () => {
    if (!slFile) return;
    setSlUploading(true); setSlResult(null);
    try {
      const fd = new FormData();
      fd.append('file', slFile);
      fd.append('file_label', slFile.name);
      fd.append('batch_name', '');
      const r = await api.post('/import/sold-list', fd, { timeout: 300000 });
      setSlResult(r.data);
      await loadSaleNos();
      await loadClearSaleNos();
      await loadSoldListSales();
      await loadLogs();
    } catch (e) {
      const errMsg = e.response?.data?.error || e.message;
      setSlResult({ error: errMsg });
    }
    setSlUploading(false);
  };

  const uploadAll = async () => {
    if (!catFile && !soldFile) { alert('Select at least one file'); return; }
    if (!batchName.trim()) { alert('Please enter a Batch / File Name to identify this import'); return; }
    if (catFile && !selSoldListSale) { alert('Please select a Sold List to map rates for this catalogue'); return; }
    setUploading(true); setCatResult(null); setSoldResult(null); setUploadPct(0);
    let lastSale = selSales[0];
    const importGroup = `grp_${Date.now()}`;
    const batch = batchName.trim();

    if (catFile) {
      try {
        const fd = new FormData();
        fd.append('file', catFile);
        fd.append('file_label', catFile.name);
        fd.append('import_group', importGroup);
        fd.append('batch_name', batch);
        fd.append('sold_list_sale_no', selSoldListSale);
        const r = await api.post('/import/catalogue', fd, {
          timeout: 300000,
          onUploadProgress: (p) => setUploadPct(Math.round((p.loaded * 100) / p.total))
        });
        setCatResult(r.data);
        if (r.data.sale_no) lastSale = String(r.data.sale_no);
      } catch (e) {
        const status = e.response?.status;
        const errMsg = e.response?.data?.error || e.message;
        setCatResult({ error: status === 413 ? `File too large (${(catFile.size/1024/1024).toFixed(1)}MB). Max 200MB.` : errMsg });
      }
    }
    setUploadPct(0);
    if (soldFile) {
      try {
        const fd = new FormData();
        fd.append('file', soldFile);
        fd.append('file_label', soldFile.name);
        fd.append('import_group', importGroup);
        fd.append('batch_name', batch);
        const r = await api.post('/import/sold-list', fd, {
          timeout: 300000,
          onUploadProgress: (p) => setUploadPct(Math.round((p.loaded * 100) / p.total))
        });
        setSoldResult(r.data);
      } catch (e) {
        const status = e.response?.status;
        const errMsg = e.response?.data?.error || e.message;
        setSoldResult({ error: status === 413 ? `File too large. Max 200MB.` : errMsg });
      }
    }
    await loadSaleNos();
    await loadClearSaleNos();
    await loadSoldListSales();
    await loadLogs();
    if (lastSale) {
      setSelSales([lastSale]);
      setSelBatches([batch]);
      api.get(`/catalogue/merged?sale_no=${lastSale}`).then(r => setMerged(r.data)).catch(() => {});
    }
    setUploading(false); setUploadPct(0);
  };

  // Group logs by import_group
  const groupedLogs = (() => {
    const groups = [];
    const seen = new Set();
    for (const log of importLogs) {
      if (log.import_group && log.import_group !== '') {
        if (seen.has(log.import_group)) continue;
        seen.add(log.import_group);
        const pair = importLogs.filter(l => l.import_group === log.import_group);
        const catLog = pair.find(l => l.file_type === 'catalogue');
        const soldLog = pair.find(l => l.file_type === 'sold_list');
        groups.push({ group: log.import_group, catalogue: catLog, sold_list: soldLog, sale_no: log.sale_no, imported_at: log.imported_at, batch_name: log.batch_name || '' });
      } else {
        groups.push({ group: null, catalogue: log.file_type === 'catalogue' ? log : null, sold_list: log.file_type === 'sold_list' ? log : null, sale_no: log.sale_no, imported_at: log.imported_at, batch_name: log.batch_name || '' });
      }
    }
    return groups;
  })();

  const grades  = [...new Set(merged.map(r => r.grade).filter(Boolean))].sort();
  const marks   = [...new Set(merged.map(r => r.garden).filter(Boolean))].sort();
  const origins = [...new Set(merged.map(r => r.origin).filter(Boolean))].sort();

  // Filter merged data — if batch filter is active, filter by batch_name too
  const filtered = merged.filter(r => {
    if (selGrades.length  > 0 && !selGrades.includes(r.grade))   return false;
    if (selMarks.length   > 0 && !selMarks.includes(r.garden))   return false;
    if (selOrigins.length > 0 && !selOrigins.includes(r.origin)) return false;
    if (searchLot && !(r.lot_no||'').toLowerCase().includes(searchLot.toLowerCase())) return false;
    if (selBatches.length > 0 && !selBatches.includes(r.batch_name || '')) return false;
    return true;
  });

  const hasFilter = selGrades.length > 0 || selMarks.length > 0 || selOrigins.length > 0 || searchLot || selBatches.length > 0;
  const fmtPrice = (min, max) => {
    if (!min && !max) return <span style={{ color: '#ccc' }}>—</span>;
    if (min && max && Math.abs(parseFloat(min)-parseFloat(max)) > 0.5)
      return <b style={{ color: '#1a3c5e' }}>₹{Number(min).toFixed(0)} – ₹{Number(max).toFixed(0)}</b>;
    return <b style={{ color: '#1a3c5e' }}>₹{Number(min||max).toFixed(0)}</b>;
  };

  const selectedSaleInfo = saleNos.filter(s => selSales.includes(String(s.sale_no)));
  const salesMissingSold = selectedSaleInfo.filter(s => !s.sold_count || parseInt(s.sold_count) === 0);

  return (
    <div>
      <h2 style={{ marginBottom: 4, color: '#1a3c5e' }}>📥 Import Files</h2>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>Upload Catalogue + Sold List with a <b>Batch Name</b> to keep files separate. Same sale number can have multiple batches.</p>

      {/* ── STANDALONE SOLD LIST IMPORT ── */}
      <Card style={{ marginBottom: 20, border: '1.5px solid #bbf7d0' }}>
        <h3 style={{ fontSize: 15, color: '#166534', marginBottom: 4 }}>📗 Import Sold List</h3>
        <p style={{ color: '#888', fontSize: 12, marginBottom: 12 }}>
          Upload the auction sold list (Excel/CSV). Sale number is read from the file automatically. Used for min–max price in Market Report.
        </p>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <DropZone label="📗 Sold List File" file={slFile} onFile={f => handleFile(f, 'sl')}
            drag={slDrag} setDrag={setSlDrag} inputId="fu-sl-standalone" color="#1a7a4a" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, justifyContent: 'center', paddingTop: 24 }}>
            <button onClick={uploadSoldListOnly} disabled={!slFile || slUploading}
              style={{ padding: '10px 28px', background: slUploading ? '#9ca3af' : '#1a7a4a', color: '#fff', border: 'none', borderRadius: 6, cursor: slUploading ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14 }}>
              {slUploading ? '⏳ Uploading…' : '⬆ Upload Sold List'}
            </button>
            {slFile && !slUploading && (
              <button onClick={() => { setSlFile(null); setSlResult(null); }}
                style={{ padding: '6px 14px', background: 'none', border: '1px solid #cbd5e0', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: '#888' }}>
                Clear
              </button>
            )}
          </div>
        </div>
        {slResult && (
          <div style={{ marginTop: 12, padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500,
            background: slResult.error ? '#fee2e2' : '#f0fdf4',
            color:      slResult.error ? '#991b1b' : '#166534',
            border: `1px solid ${slResult.error ? '#fecaca' : '#bbf7d0'}` }}>
            {slResult.error ? `❌ ${slResult.error}` : `✅ ${slResult.imported} rows imported · ${slResult.skipped} skipped${slResult.sale_no ? ` · Sale #${slResult.sale_no}` : ''}`}
          </div>
        )}
      </Card>

      {/* ── CATALOGUE IMPORT ── */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ marginBottom: 14, padding: '10px 14px', background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 8 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#1e40af', marginBottom: 4, textTransform: 'uppercase' }}>
            Batch / File Name * <span style={{ fontWeight: 400, textTransform: 'none', color: '#6b7280' }}>— identifies this import (e.g. "CTC Lot 1", "Orthodox April")</span>
          </label>
          <input value={batchName} onChange={e => setBatchName(e.target.value)}
            placeholder="e.g. CTC Batch 1, Orthodox Lot, Sale 18 Main..."
            style={{ padding: '8px 14px', border: '2px solid #1a3c5e', borderRadius: 6, fontSize: 14, fontWeight: 600, width: '100%', maxWidth: 500 }} />
        </div>

        {/* SOLD LIST MAPPING — required for rate display */}
        <div style={{ marginBottom: 14, padding: '10px 14px', background: soldListSales.length === 0 ? '#fff7ed' : '#f0fdf4', border: `1.5px solid ${soldListSales.length === 0 ? '#fed7aa' : '#bbf7d0'}`, borderRadius: 8 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: soldListSales.length === 0 ? '#c2410c' : '#166534', marginBottom: 6, textTransform: 'uppercase' }}>
            Sold List for Rate Mapping * <span style={{ fontWeight: 400, textTransform: 'none', color: '#6b7280' }}>— min–max ₹ rates will come from this sold list</span>
          </label>
          {soldListSales.length === 0 ? (
            <div style={{ fontSize: 13, color: '#c2410c' }}>
              ⚠ No sold lists imported yet. Upload a sold list first using the <strong>Import Sold List</strong> section above, then come back here.
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {soldListSales.map(s => {
                const isSel = selSoldListSale === String(s.sale_no);
                return (
                  <button key={s.sale_no} type="button" onClick={() => setSelSoldListSale(isSel ? '' : String(s.sale_no))}
                    style={{
                      padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      border: '2px solid', borderColor: isSel ? '#1a3c5e' : '#cbd5e0',
                      background: isSel ? '#1a3c5e' : '#fff', color: isSel ? '#fff' : '#444',
                    }}>
                    Sale #{s.sale_no}
                    <span style={{ display: 'block', fontSize: 10, fontWeight: 400, opacity: 0.8, marginTop: 1 }}>
                      {s.row_count} rows · ₹{parseFloat(s.min_price).toFixed(0)}–₹{parseFloat(s.max_price).toFixed(0)}
                    </span>
                  </button>
                );
              })}
              {selSoldListSale
                ? <span style={{ fontSize: 12, color: '#1a7a4a', fontWeight: 600 }}>✓ Rates from Sale #{selSoldListSale}</span>
                : <span style={{ fontSize: 12, color: '#c2410c', fontWeight: 600 }}>⚠ Select a sold list to enable rate display</span>
              }
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 20, marginBottom: 16 }}>
          <DropZone label="📘 Catalogue Sheet" file={catFile} onFile={f => handleFile(f,'cat')} drag={catDrag} setDrag={setCatDrag} inputId="fu-cat" color="#1a3c5e" />
        </div>

        {/* Pairing indicator */}
        {batchName && catFile && (
          <div style={{ marginBottom: 12, padding: '6px 12px', borderRadius: 6, background: '#eff6ff', border: '1px solid #bfdbfe', fontSize: 12, color: '#1e40af', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            🏷 Batch: <b>"{batchName}"</b>
            <span style={{ color: '#888' }}>—</span>
            📘 {catFile.name}
          </div>
        )}

        {/* UPLOAD PROGRESS BAR */}
        {uploading && uploadPct > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ background: '#e2e8f0', borderRadius: 4, height: 6, overflow: 'hidden' }}>
              <div style={{ background: '#1a3c5e', height: '100%', width: `${uploadPct}%`, transition: 'width 0.3s' }} />
            </div>
            <span style={{ fontSize: 11, color: '#888' }}>{uploadPct < 100 ? `Uploading… ${uploadPct}%` : 'Processing file on server…'}</span>
          </div>
        )}

        {(catResult || soldResult) && (
          <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
            {catResult && <div style={{ flex:1, fontSize:13, padding:'8px 12px', borderRadius:6, background:catResult.error?'#fee2e2':'#f0fdf4', color:catResult.error?'#991b1b':'#166534', border:`1px solid ${catResult.error?'#fecaca':'#bbf7d0'}` }}>
              <b>Catalogue:</b> {catResult.error ? `❌ ${catResult.error}` : `✅ ${catResult.imported} imported · ${catResult.skipped} skipped${catResult.sale_no?` · Sale #${catResult.sale_no}`:''}`}
            </div>}
            {soldResult && <div style={{ flex:1, fontSize:13, padding:'8px 12px', borderRadius:6, background:soldResult.error?'#fee2e2':'#f0fdf4', color:soldResult.error?'#991b1b':'#166534', border:`1px solid ${soldResult.error?'#fecaca':'#bbf7d0'}` }}>
              <b>Sold List:</b> {soldResult.error ? `❌ ${soldResult.error}` : `✅ ${soldResult.imported} imported · ${soldResult.skipped} skipped`}
            </div>}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Button onClick={uploadAll} disabled={!catFile || uploading || !batchName.trim()} variant="primary" style={{ padding: '10px 32px', fontSize: 14, fontWeight: 700 }}>
            {uploading ? '⏳ Uploading…' : '⬆ Upload Catalogue'}
          </Button>
          {!batchName.trim() && catFile && <span style={{ fontSize: 12, color: '#d97706' }}>⚠ Enter a batch name first</span>}
          {catFile && <Button variant="outline" size="sm" onClick={() => { setCatFile(null); setCatResult(null); }}>Clear</Button>}
        </div>
      </Card>

      {/* ── IMPORT HISTORY (grouped) ── */}
      {groupedLogs.length > 0 && (
        <Card style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, marginBottom: 10, color: '#1a3c5e' }}>📋 Import History</h3>
          <div style={{ overflowX: 'auto', maxHeight: 280, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                  {['Sale','Batch Name','Catalogue File','Rows','Sold List File','Rows','Status','Date'].map(h => (
                    <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: '#555', borderBottom: '2px solid #e2e8f0', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groupedLogs.map((g, i) => (
                  <tr key={g.group || i} style={{ borderBottom: '1px solid #f0f4f8', background: i%2===0?'#fff':'#fafbfc' }}>
                    <td style={{ padding: '5px 10px', fontWeight: 600 }}>{g.sale_no || '—'}</td>
                    <td style={{ padding: '5px 10px' }}>
                      {g.batch_name
                        ? <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: '#dbeafe', color: '#1e40af' }}>{g.batch_name}</span>
                        : <span style={{ color: '#ccc', fontSize: 11 }}>—</span>}
                    </td>
                    <td style={{ padding: '5px 10px' }}>
                      {g.catalogue
                        ? <span style={{ fontSize: 11, color: '#1e40af' }} title={g.catalogue.filename}>📘 {g.catalogue.filename.length > 22 ? g.catalogue.filename.slice(0,22)+'…' : g.catalogue.filename}</span>
                        : <span style={{ color: '#ccc', fontSize: 11 }}>—</span>}
                    </td>
                    <td style={{ padding: '5px 10px', fontWeight: 600, color: '#1e40af', fontSize: 11 }}>{g.catalogue ? g.catalogue.rows_imported : '—'}</td>
                    <td style={{ padding: '5px 10px' }}>
                      {g.sold_list
                        ? <span style={{ fontSize: 11, color: '#166534' }} title={g.sold_list.filename}>📗 {g.sold_list.filename.length > 22 ? g.sold_list.filename.slice(0,22)+'…' : g.sold_list.filename}</span>
                        : <span style={{ color: '#d97706', fontSize: 11 }}>⚠ Not uploaded</span>}
                    </td>
                    <td style={{ padding: '5px 10px', fontWeight: 600, color: '#166534', fontSize: 11 }}>{g.sold_list ? g.sold_list.rows_imported : '—'}</td>
                    <td style={{ padding: '5px 10px' }}>
                      {g.catalogue && g.sold_list
                        ? <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#dcfce7', color: '#166534', fontWeight: 700 }}>🔗 Paired</span>
                        : <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#fef3c7', color: '#92400e', fontWeight: 700 }}>Catalogue only</span>}
                    </td>
                    <td style={{ padding: '5px 10px', fontSize: 11, color: '#888' }}>{new Date(g.imported_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── CLEAR DATA PANEL ── */}
      <Card style={{ marginBottom: 20, border: '1px solid #fecaca' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 16 }}>🗑</span>
          <h3 style={{ fontSize: 15, color: '#991b1b', margin: 0 }}>Clear Imported Data</h3>
          <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 400 }}>— permanently deletes rows from the database</span>
        </div>

        {/* Sale selector — uses BOTH catalogue + sold_list sales */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' }}>Sale Number</label>
            <select value={clearSale} onChange={e => { setClearSale(e.target.value); setClearBatch(''); setClearResult(null); }}
              style={{ padding: '7px 12px', border: '1.5px solid #fecaca', borderRadius: 6, fontSize: 13, minWidth: 180 }}>
              <option value="">Select sale…</option>
              {clearSaleNos.map(s => (
                <option key={s.sale_no} value={s.sale_no}>
                  Sale {s.sale_no}{parseInt(s.cat_rows) > 0 && parseInt(s.sl_rows) > 0
                    ? ` · 📘${s.cat_rows} cat / 📗${s.sl_rows} sold`
                    : parseInt(s.cat_rows) > 0
                    ? ` · 📘 ${s.cat_rows} catalogue rows`
                    : ` · 📗 ${s.sl_rows} sold list rows`}
                </option>
              ))}
            </select>
          </div>
          {clearSale && clearBatches.length > 0 && (
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' }}>Batch</label>
              <select value={clearBatch} onChange={e => setClearBatch(e.target.value)}
                style={{ padding: '7px 12px', border: '1.5px solid #fecaca', borderRadius: 6, fontSize: 13, minWidth: 180 }}>
                <option value="">All batches</option>
                {clearBatches.filter(Boolean).map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Row counts for selected sale */}
        {clearSale && (() => {
          const info = clearSaleNos.find(s => String(s.sale_no) === String(clearSale));
          const catRows = info ? parseInt(info.cat_rows) : 0;
          const slRows  = info ? parseInt(info.sl_rows)  : 0;
          return (
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
              {/* Catalogue block */}
              <div style={{ flex: 1, minWidth: 200, padding: '12px 16px', borderRadius: 8, border: `2px solid ${catRows > 0 ? '#bfdbfe' : '#e5e7eb'}`, background: catRows > 0 ? '#eff6ff' : '#f9fafb' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: catRows > 0 ? '#1e40af' : '#9ca3af' }}>📘 Catalogue</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: catRows > 0 ? '#1e40af' : '#9ca3af' }}>
                    {catRows > 0 ? `${catRows} rows` : 'No data'}
                  </span>
                </div>
                <button
                  onClick={() => clearData('catalogue')}
                  disabled={catRows === 0 || clearing === 'catalogue'}
                  style={{ width: '100%', padding: '7px 0', borderRadius: 6, border: 'none', fontWeight: 700, fontSize: 13, cursor: catRows === 0 ? 'not-allowed' : 'pointer',
                    background: catRows === 0 ? '#e5e7eb' : clearing === 'catalogue' ? '#9ca3af' : '#1e40af',
                    color: catRows === 0 ? '#9ca3af' : '#fff' }}>
                  {clearing === 'catalogue' ? '⏳ Deleting…' : '🗑 Delete Catalogue'}
                </button>
              </div>

              {/* Sold List block */}
              <div style={{ flex: 1, minWidth: 200, padding: '12px 16px', borderRadius: 8, border: `2px solid ${slRows > 0 ? '#bbf7d0' : '#e5e7eb'}`, background: slRows > 0 ? '#f0fdf4' : '#f9fafb' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: slRows > 0 ? '#166534' : '#9ca3af' }}>📗 Sold List</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: slRows > 0 ? '#166534' : '#9ca3af' }}>
                    {slRows > 0 ? `${slRows} rows` : 'No data'}
                  </span>
                </div>
                <button
                  onClick={() => clearData('sold_list')}
                  disabled={slRows === 0 || clearing === 'sold_list'}
                  style={{ width: '100%', padding: '7px 0', borderRadius: 6, border: 'none', fontWeight: 700, fontSize: 13, cursor: slRows === 0 ? 'not-allowed' : 'pointer',
                    background: slRows === 0 ? '#e5e7eb' : clearing === 'sold_list' ? '#9ca3af' : '#166534',
                    color: slRows === 0 ? '#9ca3af' : '#fff' }}>
                  {clearing === 'sold_list' ? '⏳ Deleting…' : '🗑 Delete Sold List'}
                </button>
              </div>

              {/* Delete All block */}
              <div style={{ flex: 1, minWidth: 200, padding: '12px 16px', borderRadius: 8, border: '2px solid #fecaca', background: '#fff5f5' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: '#991b1b' }}>🗑 Delete Both</span>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, cursor: 'pointer', marginBottom: 8 }}>
                  <input type="checkbox" checked={preserveMarkings} onChange={e => setPreserveMarkings(e.target.checked)} style={{ accentColor: '#1a3c5e' }} />
                  <span style={{ fontWeight: 600, color: preserveMarkings ? '#166534' : '#991b1b' }}>
                    {preserveMarkings ? '🛡 Keep Markings' : '⚠ Delete Markings Too'}
                  </span>
                </label>
                <button
                  onClick={() => clearData('all')}
                  disabled={(catRows === 0 && slRows === 0) || clearing === 'all'}
                  style={{ width: '100%', padding: '7px 0', borderRadius: 6, border: 'none', fontWeight: 700, fontSize: 13, cursor: (catRows === 0 && slRows === 0) ? 'not-allowed' : 'pointer',
                    background: (catRows === 0 && slRows === 0) ? '#e5e7eb' : clearing === 'all' ? '#9ca3af' : '#dc2626',
                    color: (catRows === 0 && slRows === 0) ? '#9ca3af' : '#fff' }}>
                  {clearing === 'all' ? '⏳ Deleting…' : '🗑 Delete Catalogue + Sold List'}
                </button>
              </div>
            </div>
          );
        })()}

        {!clearSale && (
          <div style={{ padding: '12px 16px', borderRadius: 8, background: '#f9fafb', border: '1px solid #e5e7eb', fontSize: 13, color: '#9ca3af', textAlign: 'center' }}>
            ← Select a sale number above to see delete options
          </div>
        )}

        {clearResult && (
          <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 6, fontSize: 13, fontWeight: 500,
            background: clearResult.success ? '#f0fdf4' : '#fee2e2',
            color:      clearResult.success ? '#166534' : '#991b1b',
            border: `1px solid ${clearResult.success ? '#bbf7d0' : '#fecaca'}` }}>
            {clearResult.success ? '✅ ' : '❌ '}{clearResult.msg}
          </div>
        )}
      </Card>

      {/* ── MERGED TABLE ── */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h3 style={{ fontSize: 15, marginBottom: 2 }}>📋 Catalogue + Sold List Merged</h3>
            <div style={{ fontSize: 12, color: '#888' }}>
              Showing {filtered.length} of {merged.length} lots
              {hasFilter && <button onClick={() => { setSelGrades([]); setSelMarks([]); setSelOrigins([]); setSearchLot(''); setSelBatches([]); }} style={{ marginLeft: 10, fontSize: 11, color: '#c0392b', background: 'none', border: '1px solid #fecaca', borderRadius: 4, padding: '1px 7px', cursor: 'pointer' }}>✕ Clear filters</button>}
            </div>
            {salesMissingSold.length > 0 && (
              <div style={{ fontSize: 11, color: '#d97706', marginTop: 4 }}>
                ⚠ {salesMissingSold.map(s => `Sale ${s.sale_no}${s.batch_name ? ` / "${s.batch_name}"` : ''}`).join(', ')}: No Sold List — prices are empty
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <MultiSelect label="Sale" options={[...new Set(saleNos.map(s => String(s.sale_no)))]} selected={selSales} onChange={setSelSales} width={120} />
            {allBatches.filter(Boolean).length > 0 && (
              <MultiSelect label="Batch" options={allBatches.filter(Boolean)} selected={selBatches} onChange={setSelBatches} width={160} />
            )}
            <MultiSelect label="Grade"  options={grades}  selected={selGrades}  onChange={setSelGrades}  width={130} />
            <MultiSelect label="Mark"   options={marks}   selected={selMarks}   onChange={setSelMarks}   width={180} />
            <MultiSelect label="Origin" options={origins} selected={selOrigins} onChange={setSelOrigins} width={180} />
            <input value={searchLot} onChange={e => setSearchLot(e.target.value)} placeholder="Search Lot No…"
              style={{ padding: '6px 10px', border: '1.5px solid #cbd5e0', borderRadius: 6, fontSize: 13, width: 130 }} />
          </div>
        </div>

        {filtered.length === 0
          ? <div style={{ padding: 30, textAlign: 'center', color: '#aaa' }}>{selSales.length ? 'No data. Upload Catalogue first.' : 'Select a sale.'}</div>
          : <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#1a3c5e', color: '#fff' }}>
                    {['Sale','Batch','Lot No','Invoice','Garden (Mark)','Origin','Grade','Bags','Net Wt','Min–Max Price ₹','Broker'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 500).map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f0f4f8', background: i%2===0?'#fff':'#fafbfc' }}>
                      <td style={{ padding: '6px 10px', fontWeight: 600 }}>{row.sale_no}</td>
                      <td style={{ padding: '6px 8px' }}>
                        {row.batch_name
                          ? <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: '#dbeafe', color: '#1e40af', fontWeight: 600 }}>{row.batch_name}</span>
                          : <span style={{ color: '#ccc', fontSize: 10 }}>—</span>}
                      </td>
                      <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: 11, color: '#1a3c5e', fontWeight: 700 }}>{row.lot_no}</td>
                      <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: 11, color: '#888' }}>{row.invoice || '—'}</td>
                      <td style={{ padding: '6px 10px', fontWeight: 700, color: '#1a3c5e' }}>{row.garden}</td>
                      <td style={{ padding: '6px 10px', fontSize: 11, color: '#777' }}>{row.origin || '—'}</td>
                      <td style={{ padding: '6px 10px' }}><span style={{ background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>{row.grade}</span></td>
                      <td style={{ padding: '6px 10px' }}>{row.bags || '—'}</td>
                      <td style={{ padding: '6px 10px' }}>{row.net_wt || '—'}</td>
                      <td style={{ padding: '6px 10px' }}>{fmtPrice(row.min_deal_price, row.max_deal_price)}</td>
                      <td style={{ padding: '6px 10px', color: '#888', fontSize: 11 }}>{row.broker || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length > 500 && <div style={{ padding: 10, textAlign: 'center', color: '#888', fontSize: 12 }}>Showing 500 of {filtered.length}. Use filters.</div>}
            </div>
        }
      </Card>
    </div>
  );
}
