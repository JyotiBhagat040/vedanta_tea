import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Card, Button, Alert, api } from '../App';

const MAX_SLOTS = 5;
const AUTO_SLOTS = 3; // P1-P3 for auto-mark; P4-P5 reserved for manual

const ColFilter = ({ label, options, selected, onChange }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos]   = useState({ top: 0, left: 0 });
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceTimer = useRef(null);
  const triggerRef = useRef(null);
  const ref = useRef(null);

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setSearch(''); setDebouncedSearch(''); } };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const handleOpen = () => {
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + window.scrollY + 4, left: r.left + window.scrollX });
    }
    setOpen(o => { if (o) { setSearch(''); setDebouncedSearch(''); } return !o; });
  };

  const handleSearch = (val) => {
    setSearch(val);
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedSearch(val), 150);
  };

  // Use Set for O(1) lookups instead of array.includes (O(n) per item)
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const filtered = debouncedSearch.trim()
    ? options.filter(o => o.toLowerCase().includes(debouncedSearch.toLowerCase()))
    : options;

  return (
    <div ref={ref} style={{ display: 'inline-block' }}>
      <div ref={triggerRef} onClick={handleOpen}
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, userSelect: 'none' }}>
        <span style={{ fontSize: 11, fontWeight: 600 }}>{label}</span>
        {selected.length > 0
          ? <span style={{ background: '#f59e0b', color: '#fff', borderRadius: 99, fontSize: 9, padding: '1px 4px', fontWeight: 700 }}>{selected.length}</span>
          : <span style={{ fontSize: 8, opacity: 0.6 }}>&#9660;</span>}
      </div>
      {open && (
        <div style={{ position: 'absolute', top: pos.top, left: pos.left, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, zIndex: 9999, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', minWidth: 180, maxHeight: 300, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '6px 10px', borderBottom: '1px solid #f0f4f8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 10, color: '#888', fontWeight: 700 }}>{label || 'Filter'}</span>
            <button onMouseDown={() => { onChange([]); setSearch(''); }} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 10, color: '#c0392b', fontWeight: 700 }}>Clear</button>
          </div>
          <div style={{ padding: '5px 8px', borderBottom: '1px solid #f0f4f8', flexShrink: 0 }}>
            <input
              autoFocus
              value={search}
              onChange={e => handleSearch(e.target.value)}
              onMouseDown={e => e.stopPropagation()}
              placeholder="Type to search..."
              style={{ width: '100%', padding: '4px 7px', border: '1.5px solid #cbd5e0', borderRadius: 5, fontSize: 11, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.length === 0
              ? <div style={{ padding: '10px', fontSize: 11, color: '#aaa', textAlign: 'center' }}>No match</div>
              : filtered.map(opt => (
                <div key={opt} onMouseDown={() => onChange(selectedSet.has(opt) ? selected.filter(x => x !== opt) : [...selected, opt])}
                  style={{ padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
                    background: selectedSet.has(opt) ? '#eff6ff' : '#fff', fontSize: 12, color: '#1a2533', borderBottom: '1px solid #f9fafb' }}>
                  <div style={{ width: 13, height: 13, borderRadius: 2, flexShrink: 0,
                    border: `2px solid ${selectedSet.has(opt) ? '#1a3c5e' : '#cbd5e0'}`,
                    background: selectedSet.has(opt) ? '#1a3c5e' : '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {selectedSet.has(opt) && <span style={{ color: '#fff', fontSize: 8, fontWeight: 700 }}>&#10003;</span>}
                  </div>
                  <span style={{ fontWeight: selectedSet.has(opt) ? 600 : 400 }}>{opt}</span>
                </div>
              ))
            }
          </div>
        </div>
      )}
    </div>
  );
};

const SlotCell = React.memo(({ catalogueId, slotIdx, value, onChange, allParties, visibleLots, rowIdx }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [sugg, setSugg] = useState([]);
  const inputRef = useRef(null);
  const getSugg = v => !v ? [] : allParties.filter(p => p.party_code.startsWith(v.toUpperCase())).slice(0, 5);
  const startEdit = () => { setDraft(value?.party_code || ''); setEditing(true); setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 20); };
  const commit = useCallback((codeOverride) => {
    const c = (codeOverride ?? draft).trim().toUpperCase();
    setEditing(false); setSugg([]);
    if (!c) { onChange(null); return; }
    const p = allParties.find(x => x.party_code === c);
    onChange(p ? { party_id: p.id, party_name: p.party_name, party_code: p.party_code } : null);
  }, [draft, allParties, onChange]);
  const focusSlot = useCallback((rowI, slotI) => {
    const targetRow = visibleLots[rowI];
    if (!targetRow) return;
    const clampedSlot = Math.max(0, Math.min(MAX_SLOTS - 1, slotI));
    setTimeout(() => {
      document.querySelector(`[data-slot="${targetRow.catalogue_id}-${clampedSlot}"]`)?.click();
    }, 10);
  }, [visibleLots]);

  const handleKey = e => {
    if (e.key === 'Escape') { setEditing(false); setSugg([]); return; }
    if (e.key === 'Backspace' && draft === '') { onChange(null); setEditing(false); return; }
    if (e.key === 'ArrowRight' || e.key === 'Tab') {
      e.preventDefault(); commit();
      if (slotIdx + 1 < MAX_SLOTS) focusSlot(rowIdx, slotIdx + 1);
      else focusSlot(rowIdx + 1, 0);
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault(); commit();
      if (slotIdx > 0) focusSlot(rowIdx, slotIdx - 1);
      else focusSlot(rowIdx - 1, MAX_SLOTS - 1);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault(); commit();
      focusSlot(rowIdx + 1, slotIdx);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault(); commit();
      focusSlot(rowIdx - 1, slotIdx);
      return;
    }
  };
  if (editing) return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <input ref={inputRef} value={draft}
        onChange={e => { const v = e.target.value.toUpperCase(); setDraft(v); setSugg(getSugg(v)); }}
        onKeyDown={handleKey} onBlur={() => setTimeout(() => { commit(); setSugg([]); }, 160)}
        maxLength={5} style={{ width: 50, padding: '2px 4px', border: '2px solid #1a3c5e', borderRadius: 4, fontSize: 11, fontFamily: 'monospace', textTransform: 'uppercase', outline: 'none' }} />
      {sugg.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, zIndex: 999, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', minWidth: 150 }}>
          {sugg.map(s => (
            <div key={s.id} onMouseDown={e => { e.preventDefault(); commit(s.party_code); }}
              style={{ padding: '5px 9px', cursor: 'pointer', fontSize: 11, borderBottom: '1px solid #f0f4f8' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f0f8ff'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
              <b style={{ color: '#1a3c5e' }}>{s.party_code}</b> {s.party_name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
  return (
    <div data-slot={`${catalogueId}-${slotIdx}`} onClick={startEdit}
      style={{ width: 46, height: 22, padding: '1px 4px', borderRadius: 99, cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: value ? (slotIdx >= AUTO_SLOTS ? '#7c3aed' : '#1a3c5e') : 'transparent',
        border: value ? 'none' : (slotIdx >= AUTO_SLOTS ? '1.5px dashed #c4b5fd' : '1.5px dashed #d1d5db') }}>
      {value ? <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>{value.party_code}</span>
             : <span style={{ color: slotIdx >= AUTO_SLOTS ? '#c4b5fd' : '#d1d5db', fontSize: 9 }}>—</span>}
    </div>
  );
});

const TD_BASE = { padding: '4px 6px', fontSize: 12, color: '#374151', fontWeight: 500 };
const tdStyle = (extra = {}) => ({ ...TD_BASE, ...extra });

const fmtDateUtil = d => { try { const dt = new Date(d); return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}`; } catch { return '—'; } };
const fmtRateUtil = row => {
  const mn = row.min_deal_price, mx = row.max_deal_price;
  if (!mn && !mx) return '—';
  if (mn && mx && Math.abs(parseFloat(mn) - parseFloat(mx)) > 0.5) return `${Number(mn).toFixed(0)}-${Number(mx).toFixed(0)}`;
  return `${Number(mn || mx).toFixed(0)}/-`;
};

const LotRow = React.memo(({ row, rowIdx, slots, dupAlert, onSlotChange, allParties, visibleLots, onDismissDup, onDeleteLot }) => {
  const hasSlot = slots.some(s => s?.party_id);
  return (
    <React.Fragment>
      <tr style={{ borderBottom: dupAlert ? 'none' : '1px solid #f0f4f8', background: hasSlot ? (rowIdx%2===0?'#f0fdf4':'#e8faf0') : (rowIdx%2===0?'#fff':'#fafbfc') }}>
        <td style={tdStyle({ textAlign: 'center', color: '#9ca3af', fontWeight: 500 })}>{row.sale_no}</td>
        {slots.map((slot, si) => (
          <td key={si} style={{ padding: '3px 2px', textAlign: 'center' }}>
            <SlotCell catalogueId={row.catalogue_id} slotIdx={si} value={slot} onChange={v => onSlotChange(row.catalogue_id, si, v)} allParties={allParties} visibleLots={visibleLots} rowIdx={rowIdx} />
          </td>
        ))}
        <td style={tdStyle({ fontWeight: 600 })}>{row.broker}</td>
        <td style={tdStyle({ fontFamily: 'monospace', color: '#1a3c5e', fontWeight: 700 })}>{row.lot_no}</td>
        <td style={{ ...tdStyle({ fontWeight: 700, color: '#1a3c5e' }), maxWidth: 105, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.garden}>{row.garden}</td>
        <td style={tdStyle()}><span style={{ background: '#dbeafe', color: '#1e40af', padding: '1px 6px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>{row.grade}</span></td>
        <td style={tdStyle({ textAlign: 'right', fontWeight: 700, color: '#1a3c5e', fontSize: 12 })}>{fmtRateUtil(row)}</td>
        <td style={{ ...tdStyle({ color: '#6b7280', fontSize: 11 }), maxWidth: 85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.origin}>{row.origin || '—'}</td>
        <td style={tdStyle({ textAlign: 'right', fontWeight: 700 })}>{row.bags || '—'}</td>
        <td style={tdStyle({ textAlign: 'right', fontWeight: 700 })}>{row.net_wt || '—'}</td>
        <td style={tdStyle({ textAlign: 'center', color: '#374151', fontWeight: 600 })}>{fmtDateUtil(row.gp_date)}</td>
        <td style={tdStyle({ color: '#374151', fontFamily: 'monospace', fontSize: 12, fontWeight: 600 })}>{row.invoice || '—'}</td>
        <td style={{ padding: '3px 4px', textAlign: 'center', width: 28 }}>
          {hasSlot && (
            <button
              title="Delete all markings for this lot"
              onClick={() => onDeleteLot(row)}
              style={{ padding: '2px 5px', background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 4, cursor: 'pointer', fontSize: 12, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              🗑️
            </button>
          )}
        </td>
      </tr>
      {dupAlert && (
        <tr><td colSpan={16} style={{ padding: '3px 12px', background: '#fffbeb', borderBottom: '1px solid #f0f4f8', fontSize: 11, color: '#92400e', fontWeight: 600 }}>
          {dupAlert}
          <button onClick={() => onDismissDup(row.catalogue_id)} style={{ marginLeft: 8, border: 'none', background: 'none', cursor: 'pointer', fontSize: 10, color: '#888' }}>x</button>
        </td></tr>
      )}
    </React.Fragment>
  );
});

export default function MarkingPage() {
  const [allParties, setAllParties] = useState([]);
  const [saleNos, setSaleNos] = useState([]);
  const [selParties, setSelParties] = useState([]);
  const [saleNo, setSaleNo] = useState('');
  const [batchName, setBatchName] = useState('');
  const [partySearch, setPartySearch] = useState('');
  const [allLots, setAllLots] = useState([]);
  const [lotSlots, setLotSlots] = useState({});
  const lotSlotsRef = useRef({});
  // NOTE: ref is synced directly in updateSlot/markF1/markF2/loadSale/save — NOT via useEffect
  // useEffect sync is async (fires after render) and causes stale reads when save fires right after slot change


  const [loading, setLoading] = useState(false);
  const [marking, setMarking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingAi, setSavingAi] = useState(false);
  const [alert, setAlert] = useState(null);
  const [dupAlerts, setDupAlerts] = useState({});
  const [filterGrades, setFilterGrades] = useState([]);
  const [filterGpDates, setFilterGpDates] = useState([]);
  const [filterGardens, setFilterGardens] = useState([]);
  const [filterBrokers, setFilterBrokers] = useState([]);
  const [filterOrigins, setFilterOrigins] = useState([]);   // NEW: origin filter
  const [filterRates, setFilterRates] = useState([]);   // NEW: rate filter
  const [searchLot, setSearchLot] = useState('');
  const [showMarked, setShowMarked] = useState(false);
  const [visibleCount, setVisibleCount] = useState(200);
  const [aiParties, setAiParties] = useState([]);
  const [aiSaleNos, setAiSaleNos] = useState([]);
  const [aiSugg, setAiSugg] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiApplying, setAiApplying] = useState(false);
  const [aiUsedSaleNos, setAiUsedSaleNos] = useState([]);
  const [partyTypeFilter, setPartyTypeFilter] = useState('ALL');
  const [showAiSaved, setShowAiSaved] = useState(false);
  const [aiSavedRows, setAiSavedRows] = useState([]);
  const [aiSavedLoading, setAiSavedLoading] = useState(false);
  // Track which catalogue_ids had saved markings at load time — only these need deleting
  const previouslySavedIds = useRef(new Set());

  useEffect(() => {
    Promise.all([api.get('/parties').catch(() => ({ data: [] })), api.get('/import/sale-numbers').catch(() => ({ data: [] }))])
      .then(([p, s]) => { setAllParties(p.data); setSaleNos(s.data); });
  }, []);

  const loadSale = useCallback(async (sale, batch) => {
    if (!sale) return;
    setLoading(true); setAiSugg([]);
    setFilterGrades([]); setFilterGardens([]); setFilterBrokers([]); setFilterOrigins([]); setSearchLot('');
    setShowMarked(false); setVisibleCount(200); setSelParties([]);
    const bParam = batch ? `&batch_name=${encodeURIComponent(batch)}` : '';
    try {
      const [lotsRes, slotsRes] = await Promise.all([
        api.post('/marking/preview', { party_ids: [], sale_no: sale, batch_name: batch || '' }),
        api.get(`/marking/saved-slots?sale_no=${sale}${bParam}`)
      ]);
      const lots = lotsRes.data.lots || [];
      setAllLots(lots);
      const initSlots = {};
      lots.forEach(l => { initSlots[l.catalogue_id] = Array(MAX_SLOTS).fill(null); });
      const saved = slotsRes.data || {};
      // Record which catalogue_ids already have saved markings in DB
      previouslySavedIds.current = new Set(Object.keys(saved));
      Object.entries(saved).forEach(([cid, parties]) => {
        if (initSlots[cid]) parties.forEach((p, i) => { if (i < MAX_SLOTS) initSlots[cid][i] = p; });
      });
      setLotSlots(initSlots);
      lotSlotsRef.current = initSlots;
    } catch (e) { setAlert({ msg: e.response?.data?.error || e.message, type: 'error' }); }
    finally { setLoading(false); }
  }, []);

  const handleSaleChange = v => {
    const [s, b] = v.split('||');
    setSaleNo(s); setBatchName(b || '');
    if (s) loadSale(s, b || '');
  };

  // ── CORE MARK LOTS LOGIC ───────────────────────────────────────────────────
  // Correct approach: iterate over LOTS (in broker+lot_no order from backend).
  // For each lot, take ALL eligible parties sorted A→B→C→alphabetical.
  // Fill P1, P2, P3 in that order. If P1-P3 already full, lot is skipped.
  // A party can appear on MULTIPLE lots — that is correct and expected.
  // ── Shared helper: fetch preview data for selected parties ─────────────────
  const fetchPreview = async () => {
    const r = await api.post('/marking/preview', {
      party_ids: selParties.map(p => p.id),
      sale_no: saleNo,
      batch_name: batchName || ''
    });
    return { lots: r.data.lots || [], parties: r.data.parties || [] };
  };

  // ── Mark F1: Grade Settings (Garden+Grade dedup) ─────────────────────────
  // Applies Filter 1 rules: max_lots cap + BGG dedup per party.
  // Fills P1-P3 only. Does NOT touch Filter 2 lots.
  const markF1 = async () => {
    if (!selParties.length || !saleNo) { setAlert({ msg: 'Select parties first', type: 'error' }); return; }
    setMarking('f1'); setAlert(null);
    try {
      const { lots, parties } = await fetchPreview();

      const partySkipBgg  = new Map();
      const partyMaxLots  = new Map();
      const partyBrokerLots = new Map(); // party_id → { grade: { broker: maxLots } }
      const partyBggPlaced = new Map();
      for (const pm of parties) {
        partySkipBgg.set(pm.party_id, pm.skip_bgg || false);
        partyMaxLots.set(pm.party_id, pm.max_lots || 0);
        partyBrokerLots.set(pm.party_id, pm.grade_broker_lots || {});
      }

      // Build F1 lot list per party (in_f1=true entries — independent of F2)
      const partyF1Lots = new Map();
      for (const pm of parties) partyF1Lots.set(pm.party_id, []);
      for (const lot of lots) {
        for (const ep of (lot.party_slots_array || [])) {
          if (ep.in_f1) {
            const arr = partyF1Lots.get(ep.party_id);
            if (arr) arr.push({ ...lot });
          }
        }
      }

      // Read current slot state from ref (always fresh, no stale closure)
      const cur = lotSlotsRef.current;
      const next = {};
      for (const lot of lots) next[lot.catalogue_id] = [...(cur[lot.catalogue_id] || Array(MAX_SLOTS).fill(null))];

      // Pre-count: for each party, count how many lots they are ALREADY placed on
      // and which BGG combos are already used — so re-clicking Mark F1 won't duplicate
      const existingPlaced = new Map();   // party_id → count
      const existingBgg = new Map();      // party_id → Set of bgg keys
      const existingBrokerCount = new Map(); // party_id → Map("grade__broker" → count)
      for (const lot of lots) {
        const slots = next[lot.catalogue_id];
        if (!slots) continue;
        const bggKey = `${lot.garden||''}__${lot.grade||''}`;
        const gbKey  = `${String(lot.grade||'').trim().toUpperCase()}__${String(lot.broker||'').trim().toUpperCase()}`;
        for (let i = 0; i < AUTO_SLOTS; i++) {
          const s = slots[i];
          if (!s?.party_id) continue;
          existingPlaced.set(s.party_id, (existingPlaced.get(s.party_id) || 0) + 1);
          if (!existingBgg.has(s.party_id)) existingBgg.set(s.party_id, new Set());
          existingBgg.get(s.party_id).add(bggKey);
          if (!existingBrokerCount.has(s.party_id)) existingBrokerCount.set(s.party_id, new Map());
          const bc = existingBrokerCount.get(s.party_id);
          bc.set(gbKey, (bc.get(gbKey) || 0) + 1);
        }
      }

      let totalSlotsPlaced = 0;
      for (const pm of parties) {
        const f1Lots = partyF1Lots.get(pm.party_id) || [];
        if (!f1Lots.length) continue;
        const maxL = partyMaxLots.get(pm.party_id) || 0;
        const brokerLimits = partyBrokerLots.get(pm.party_id) || {};
        // Running per-grade-per-broker count, seeded with already-placed slots
        const brokerCount = new Map(existingBrokerCount.get(pm.party_id) || new Map());
        // Start from existing count so we don't exceed max_lots across runs
        let placed = existingPlaced.get(pm.party_id) || 0;

        // Seed BGG tracking with already-placed combos
        if (partySkipBgg.get(pm.party_id)) {
          if (!partyBggPlaced.has(pm.party_id)) partyBggPlaced.set(pm.party_id, new Set());
          const existing = existingBgg.get(pm.party_id);
          if (existing) existing.forEach(k => partyBggPlaced.get(pm.party_id).add(k));
        }

        for (const lotInfo of f1Lots) {
          if (maxL > 0 && placed >= maxL) break;
          const slots = next[lotInfo.catalogue_id];
          if (!slots) continue;
          if (slots.slice(0, AUTO_SLOTS).some(s => s?.party_id === pm.party_id)) continue;

          // Resolve broker-limit context for this grade up front (needed for BGG key)
          const gradeKey  = String(lotInfo.grade  || '').trim().toUpperCase();
          const brokerKey = String(lotInfo.broker || '').trim().toUpperCase();
          const gradeBrokers = brokerLimits[gradeKey] || brokerLimits[lotInfo.grade] || null;
          const gradeHasBrokerLimits = gradeBrokers && Object.keys(gradeBrokers).length > 0;

          // BGG dedup: normally garden+grade. But when this grade has per-broker
          // limits, include the broker so different brokers don't starve each
          // other out of the same garden (otherwise broker quotas can't be met).
          const bggKey = gradeHasBrokerLimits
            ? `${brokerKey}__${lotInfo.garden||''}__${lotInfo.grade||''}`
            : `${lotInfo.garden||''}__${lotInfo.grade||''}`;
          if (partySkipBgg.get(pm.party_id)) {
            if (partyBggPlaced.get(pm.party_id).has(bggKey)) continue;
          }

          // Per-broker lot cap (Filter 1):
          // If this grade has ANY broker limits set, only listed brokers may be
          // marked, each up to its own limit (blank/unlisted broker = excluded).
          // If the grade has no broker limits, no per-broker restriction applies.
          if (gradeHasBrokerLimits) {
            const limit = gradeBrokers[brokerKey] ?? gradeBrokers[lotInfo.broker];
            if (!(limit > 0)) continue; // broker not listed for this grade → skip
            const gbCapKey = `${gradeKey}__${brokerKey}`;
            if ((brokerCount.get(gbCapKey) || 0) >= limit) continue;
          }
          const gbKey = `${gradeKey}__${brokerKey}`;

          const freeIdx = slots.findIndex((s, i) => i < AUTO_SLOTS && !s);
          if (freeIdx === -1) continue;

          slots[freeIdx] = { party_id: pm.party_id, party_name: pm.party_name, party_code: pm.party_code };
          placed++;
          brokerCount.set(gbKey, (brokerCount.get(gbKey) || 0) + 1);
          if (partySkipBgg.get(pm.party_id)) partyBggPlaced.get(pm.party_id).add(bggKey);
          totalSlotsPlaced++;
        }
      }

      const totalLotsMarked = Object.values(next).filter(s => s.slice(0, AUTO_SLOTS).some(x => x?.party_id)).length;
      setLotSlots(next);
      lotSlotsRef.current = next; // sync ref immediately
      setAlert({ msg: `✅ Filter 1: Placed ${totalSlotsPlaced} new slots across ${totalLotsMarked} marked lots (Garden+Grade dedup, max_lots cap applied).`, type: 'success' });
    } catch (e) { setAlert({ msg: e.response?.data?.error || e.message, type: 'error' }); }
    finally { setMarking(false); }
  };

  // ── Mark F2: Grade-Garden Mapping ────────────────────────────────────────
  // Applies Filter 2 rules only: fills remaining free P1-P3 slots.
  // No max_lots cap, no BGG dedup.
  // oneLotPerGG checked → 1 slot per grade+garden combo.
  // oneLotPerGG unchecked → 1 slot on every lot matching grade+garden.
  const markF2 = async () => {
    if (!selParties.length || !saleNo) { setAlert({ msg: 'Select parties first', type: 'error' }); return; }
    setMarking('f2'); setAlert(null);
    try {
      const { lots, parties } = await fetchPreview();

      // Build F2 lot list per party (in_f2=true entries — independent of F1)
      const partyF2Lots = new Map();
      for (const pm of parties) partyF2Lots.set(pm.party_id, []);
      for (const lot of lots) {
        for (const ep of (lot.party_slots_array || [])) {
          if (ep.in_f2) {
            const arr = partyF2Lots.get(ep.party_id);
            if (arr) arr.push({ ...lot, one_lot_per_gg: ep.one_lot_per_gg });
          }
        }
      }

      // Read current slot state from ref (always fresh — includes F1 markings)
      const cur = lotSlotsRef.current;
      const next = {};
      for (const lot of lots) next[lot.catalogue_id] = [...(cur[lot.catalogue_id] || Array(MAX_SLOTS).fill(null))];

      let totalSlotsPlaced = 0;
      for (const pm of parties) {
        const f2Lots = partyF2Lots.get(pm.party_id) || [];
        if (!f2Lots.length) continue;

        // Pre-seed ggPlaced with grade+garden combos this party is already on
        const ggPlaced = new Set();
        for (const lot of lots) {
          const slots = next[lot.catalogue_id];
          if (!slots) continue;
          if (slots.slice(0, AUTO_SLOTS).some(s => s?.party_id === pm.party_id)) {
            ggPlaced.add(`${lot.grade||''}__${lot.garden||''}`);
          }
        }

        for (const lotInfo of f2Lots) {
          const slots = next[lotInfo.catalogue_id];
          if (!slots) continue;
          if (slots.slice(0, AUTO_SLOTS).some(s => s?.party_id === pm.party_id)) continue;

          if (lotInfo.one_lot_per_gg) {
            const ggKey = `${lotInfo.grade||''}__${lotInfo.garden||''}`;
            if (ggPlaced.has(ggKey)) continue;
            ggPlaced.add(ggKey);
          }

          const freeIdx = slots.findIndex((s, i) => i < AUTO_SLOTS && !s);
          if (freeIdx === -1) continue;

          slots[freeIdx] = { party_id: pm.party_id, party_name: pm.party_name, party_code: pm.party_code };
          ggPlaced.add(`${lotInfo.grade||''}__${lotInfo.garden||''}`);
          totalSlotsPlaced++;
        }
      }

      const totalLotsMarked = Object.values(next).filter(s => s.slice(0, AUTO_SLOTS).some(x => x?.party_id)).length;
      setLotSlots(next);
      lotSlotsRef.current = next; // sync ref immediately
      setAlert({ msg: `✅ Filter 2: Placed ${totalSlotsPlaced} new slots across ${totalLotsMarked} marked lots (Grade+Garden mapping).`, type: 'success' });
    } catch (e) { setAlert({ msg: e.response?.data?.error || e.message, type: 'error' }); }
    finally { setMarking(false); }
  };

  const updateSlot = useCallback((catalogueId, slotIdx, value) => {
    setLotSlots(prev => {
      const arr = [...(prev[catalogueId] || Array(MAX_SLOTS).fill(null))];
      arr[slotIdx] = value;
      const next = { ...prev, [catalogueId]: arr };
      lotSlotsRef.current = next; // sync ref immediately — NOT via useEffect (async/post-render)
      return next;
    });
    if (value?.party_id && saleNo) {
      const lot = allLots.find(l => l.catalogue_id === catalogueId);
      if (lot) {
        api.post('/marking/check-duplicate', { party_id: value.party_id, sale_no: saleNo, garden: lot.garden, grade: lot.grade })
          .then(r => {
            if (r.data.exists) {
              const lotNos = r.data.lot_nos || lot.lot_no || '?';
              setDupAlerts(prev => ({ ...prev, [catalogueId]: `⚠️ ${value.party_code} already marked for ${lot.garden} / ${lot.grade} (Garden+Grade) — Lots: ${lotNos}. Duplicate allowed.` }));
              setTimeout(() => setDupAlerts(prev => { const n = {...prev}; delete n[catalogueId]; return n; }), 8000);
            }
          }).catch(() => {});
      }
    }
  }, [saleNo, allLots]);

  const dismissDup = useCallback((catalogueId) => {
    setDupAlerts(prev => { const n = {...prev}; delete n[catalogueId]; return n; });
  }, []);

  // Save — counts per-slot (one save per party+lot pair), not per-lot
  const save = async () => {
    const curSlots = lotSlotsRef.current;
    const allMarkedLots = allLots
      .filter(l => (curSlots[l.catalogue_id] || []).some(s => s?.party_id))
      .map(l => ({
        ...l,
        catalogue_id: l.catalogue_id,
        party_slots_array: (curSlots[l.catalogue_id] || []).filter(Boolean),
        final_slots: (curSlots[l.catalogue_id] || []).filter(Boolean),
        final_price: l.suggested_price
      }));

    // Only delete lots that: (1) had saved markings when page loaded AND (2) are now empty
    // This avoids sending hundreds of delete requests for lots that were never saved
    const clearedIds = allLots
      .filter(l =>
        previouslySavedIds.current.has(String(l.catalogue_id)) &&
        !(curSlots[l.catalogue_id] || []).some(s => s?.party_id)
      )
      .map(l => String(l.catalogue_id)); // always strings — consistent with backend text cast

    if (!allMarkedLots.length && !clearedIds.length) {
      setAlert({ msg: 'No markings to save', type: 'warning' }); return;
    }
    setSaving(true);
    try {
      // Step 1: Single bulk DELETE — must fully complete before insert, no silent swallow
      if (clearedIds.length) {
        const delRes = await api.post('/marking/clear-catalogue-ids', {
          sale_no: saleNo,
          catalogue_ids: clearedIds
        });
        if (!delRes.data?.success) throw new Error('Delete step failed, save aborted');
      }

      // Step 2: Insert/skip the marked lots as before
      if (allMarkedLots.length) {
        const r = await api.post('/marking/save', { markings: allMarkedLots, sale_no: saleNo, batch_name: batchName, is_ai_suggestion: false });
        setAlert({ msg: `✅ Saved: ${r.data.saved} new + ${r.data.skipped} existing = ${r.data.saved + r.data.skipped} total slot markings.`, type: 'success' });
      } else {
        setAlert({ msg: `✅ Cleared markings saved.`, type: 'success' });
      }

      const bParam = batchName ? `&batch_name=${encodeURIComponent(batchName)}` : '';
      const slotsRes = await api.get(`/marking/saved-slots?sale_no=${saleNo}${bParam}`);
      const savedData = slotsRes.data || {};
      const reloaded = {};
      allLots.forEach(l => { reloaded[l.catalogue_id] = Array(MAX_SLOTS).fill(null); });
      Object.entries(savedData).forEach(([cid, parties]) => {
        if (!reloaded[cid]) reloaded[cid] = Array(MAX_SLOTS).fill(null);
        parties.forEach((p, i) => { if (i < MAX_SLOTS) reloaded[cid][i] = p; });
      });
      // Update previouslySavedIds to reflect current DB state
      previouslySavedIds.current = new Set(Object.keys(savedData));
      setLotSlots(reloaded);
      lotSlotsRef.current = reloaded;
    } catch (e) { setAlert({ msg: e.response?.data?.error || e.message, type: 'error' }); }
    finally { setSaving(false); }
  };

  // Ctrl+S shortcut — onKeyDown on root div is most reliable (fires before browser native handler)
  const saveFnRef = useRef(save);
  saveFnRef.current = save;
  const handlePageKeyDown = useCallback((e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      e.stopPropagation();
      saveFnRef.current();
    }
  }, []);
  // Window-level fallback only — covers edge cases where focus is outside the div
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        e.stopPropagation();
        saveFnRef.current();
      }
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, []);

  const saveAsAiRef = async () => {
    const curSlots = lotSlotsRef.current;
    const allMarkedLots = allLots
      .filter(l => (curSlots[l.catalogue_id] || []).some(s => s?.party_id))
      .map(l => ({
        ...l,
        catalogue_id: l.catalogue_id,
        party_slots_array: (curSlots[l.catalogue_id] || []).filter(Boolean),
        final_slots: (curSlots[l.catalogue_id] || []).filter(Boolean),
        final_price: l.suggested_price
      }));
    if (!allMarkedLots.length) { setAlert({ msg: 'No markings to save', type: 'warning' }); return; }
    if (!window.confirm(`Save ${markedCount} marked lots as AI Reference?`)) return;
    setSavingAi(true);
    try {
      const r = await api.post('/marking/save-ai-ref', { markings: allMarkedLots, sale_no: saleNo, batch_name: batchName });
      setAlert({ msg: `✅ ${r.data.saved} markings saved as AI Reference.${r.data.skipped ? ` ${r.data.skipped} already existed.` : ''}`, type: 'success' });
      const bParam = batchName ? `&batch_name=${encodeURIComponent(batchName)}` : '';
      const slotsRes = await api.get(`/marking/saved-slots?sale_no=${saleNo}${bParam}`);
      const savedData = slotsRes.data || {};
      const reloaded = {};
      allLots.forEach(l => { reloaded[l.catalogue_id] = Array(MAX_SLOTS).fill(null); });
      Object.entries(savedData).forEach(([cid, parties]) => {
        if (!reloaded[cid]) reloaded[cid] = Array(MAX_SLOTS).fill(null);
        parties.forEach((p, i) => { if (i < MAX_SLOTS) reloaded[cid][i] = p; });
      });
      setLotSlots(reloaded);
      lotSlotsRef.current = reloaded;
    } catch (e) { setAlert({ msg: e.response?.data?.error || e.message, type: 'error' }); }
    finally { setSavingAi(false); }
  };

  // AI suggestions — auto-default to last 4 sales if none selected
  const loadAiSugg = async () => {
    if (!aiParties.length) return;
    setAiLoading(true);
    try {
      const r = await api.post('/marking/ai-suggest', {
        party_ids: aiParties,
        sale_nos: aiSaleNos.length ? aiSaleNos : undefined, // backend defaults to last 4 if empty
        current_sale_no: saleNo || undefined
      });
      setAiSugg(r.data.suggestions || []);
      if (r.data.used_sale_nos?.length) setAiUsedSaleNos(r.data.used_sale_nos);
    } catch (e) { console.error(e); }
    finally { setAiLoading(false); }
  };

  const applyAiSugg = async () => {
    if (!aiParties.length || !saleNo || !aiSugg.length) return;
    setAiApplying(true);
    try {
      const byParty = {};
      aiSugg.forEach(s => { if (!byParty[s.party_id]) byParty[s.party_id] = []; byParty[s.party_id].push(s); });
      let totalApplied = 0, totalNotFound = 0;
      for (const [pid, suggs] of Object.entries(byParty)) {
        const r = await api.post('/marking/apply-ai', { party_id: pid, sale_no: saleNo, suggestions: suggs });
        totalApplied += r.data.applied || 0; totalNotFound += r.data.notFound || 0;
      }
      setAlert({ msg: `✅ AI: ${totalApplied} markings applied. ${totalNotFound} not found in current sale.`, type: 'success' });
      const bParam = batchName ? `&batch_name=${encodeURIComponent(batchName)}` : '';
      const slotsRes = await api.get(`/marking/saved-slots?sale_no=${saleNo}${bParam}`);
      const savedData = slotsRes.data || {};
      const reloaded = {};
      allLots.forEach(l => { reloaded[l.catalogue_id] = Array(MAX_SLOTS).fill(null); });
      Object.entries(savedData).forEach(([cid, parties]) => {
        if (!reloaded[cid]) reloaded[cid] = Array(MAX_SLOTS).fill(null);
        parties.forEach((p, i) => { if (i < MAX_SLOTS) reloaded[cid][i] = p; });
      });
      setLotSlots(reloaded);
      lotSlotsRef.current = reloaded;
      setAiSugg([]);
    } catch (e) { setAlert({ msg: e.response?.data?.error || e.message, type: 'error' }); }
    finally { setAiApplying(false); }
  };

  const clearAllMarkings = async () => {
    if (!saleNo) return;
    const bLabel = batchName ? ` / "${batchName}"` : '';
    if (!window.confirm(`Clear ALL saved markings for Sale #${saleNo}${bLabel}? This cannot be undone.`)) return;
    try {
      const bParam = batchName ? `&batch_name=${encodeURIComponent(batchName)}` : '';
      const r = await api.delete(`/marking/clear-all?sale_no=${saleNo}${bParam}`);
      setAlert({ msg: `✅ All ${r.data.deleted} markings cleared for Sale #${saleNo}${bLabel}.`, type: 'success' });
      // Reload slots from DB to confirm truly empty — don't just clear frontend state
      const slotsRes = await api.get(`/marking/saved-slots?sale_no=${saleNo}${bParam}`);
      const savedData = slotsRes.data || {};
      const cleared = {};
      allLots.forEach(l => { cleared[l.catalogue_id] = Array(MAX_SLOTS).fill(null); });
      Object.entries(savedData).forEach(([cid, parties]) => {
        if (cleared[cid]) parties.forEach((p, i) => { if (i < MAX_SLOTS) cleared[cid][i] = p; });
      });
      setLotSlots(cleared);
      lotSlotsRef.current = cleared;
    } catch (e) { setAlert({ msg: 'Failed to clear markings: ' + (e.response?.data?.error || e.message), type: 'error' }); }
  };

  // Delete all marked slots for a single lot (row-level delete button) — no confirm, instant
  const deleteLotMarkings = useCallback(async (row) => {
    const lotLabel = row.lot_no || row.catalogue_id;
    try {
      const r = await api.delete(`/marking/clear-lot?sale_no=${saleNo}&catalogue_id=${row.catalogue_id}`);
      setLotSlots(prev => {
        const next = { ...prev, [row.catalogue_id]: Array(MAX_SLOTS).fill(null) };
        lotSlotsRef.current = next;
        return next;
      });
      previouslySavedIds.current.delete(String(row.catalogue_id));
      setAlert({ msg: `✅ Cleared ${r.data.deleted} marking(s) for Lot ${lotLabel}.`, type: 'success' });
    } catch (e) {
      setAlert({ msg: 'Failed to delete lot markings: ' + (e.response?.data?.error || e.message), type: 'error' });
    }
  }, [saleNo]);

  const clearAiMarkings = async () => {
    if (!window.confirm(`Clear all AI Reference flags for Sale #${saleNo}?`)) return;
    try {
      const r = await api.post('/marking/clear-ai-flags', { sale_no: saleNo });
      setAlert({ msg: `✅ AI Reference flags cleared for ${r.data.updated} markings.`, type: 'success' });
    } catch (e) { setAlert({ msg: 'Failed: ' + (e.response?.data?.error || e.message), type: 'error' }); }
  };

  const exportPDF = () => {
    const markedLots = allLots.filter(l => (lotSlots[l.catalogue_id] || []).some(s => s?.party_id));
    if (!markedLots.length) { setAlert({ msg: 'No marked lots to export', type: 'warning' }); return; }
    const fmt = lot => {
      if (!lot) return '';
      const m = lot.match(/^([A-Za-z]+)0*([1-9][0-9]*)$/);
      return m ? `${m[1]}-${m[2]}` : lot;
    };
    const fmtD = d => {
      if (!d) return '';
      try { const dt = new Date(d); return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}`; }
      catch { return ''; }
    };
    const labels = [];
    markedLots.forEach(lot => {
      const slots = (lotSlots[lot.catalogue_id] || []).filter(Boolean);
      slots.forEach(slot => {
        labels.push({
          party_code: slot.party_code, sale_no: lot.sale_no,
          lot_no: lot.lot_no || '', grade: lot.grade || '',
          invoice_raw: lot.invoice || '', bags: lot.bags || '?',
          net_wt: lot.net_wt || '?', gp_date: fmtD(lot.gp_date),
          garden: lot.garden || '', origin: lot.origin || ''
        });
      });
    });
    const labelsHtml = labels.map(l => {
      const gpDate = l.gp_date;
      return `<div class="lbl">
  <div class="r1"><b>${l.party_code}</b><span class="d">|</span>S${l.sale_no}<span class="d">|</span><b>${fmt(l.lot_no)}</b></div>
  <div class="r2"><b class="inv">${l.invoice_raw}</b><span class="d">|</span><span>${l.bags}&#215;${l.net_wt}</span>${gpDate ? `<span class="d">|</span><span>${gpDate}</span>` : ''}</div>
  <div class="r3"><span class="grd">${l.grade}</span><span class="d">|</span><span class="gname">${l.garden}</span></div>
  <div class="orig">${l.origin}</div>
</div>`;
    }).join('');
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>Labels Sale #${saleNo}</title>
<style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:Arial,Helvetica,sans-serif;color:#000;}
@page{size:210mm 297mm;margin-top:6.8mm;margin-bottom:3mm;margin-left:11mm;margin-right:5mm;}
.grid{display:grid;grid-template-columns:repeat(4,48mm);justify-content:center;grid-auto-rows:23mm;gap:0.3mm;width:192mm;}
.lbl{width:48mm;height:24mm;border:none;overflow:hidden;display:flex;flex-direction:column;justify-content:center;gap:0.3mm;padding:1.5mm 2mm 1.5mm 4mm;page-break-inside:avoid;break-inside:avoid;line-height:1.2;}
.r1{font-size:6pt;display:flex;align-items:center;gap:0.8mm;white-space:nowrap;overflow:hidden;}
.r1 b{font-weight:900;font-size:8pt;}.r2{font-size:6pt;display:flex;align-items:center;gap:1mm;white-space:nowrap;overflow:hidden;}
.r3{font-size:6pt;display:flex;align-items:center;gap:1mm;white-space:nowrap;overflow:hidden;}.d{color:#555;font-size:6pt;}
.inv{font-size:6pt;font-weight:900;color:#000;}.grd{background:none;color:#000;border:none;padding:0;font-size:7pt;font-weight:900;}
.gname{font-size:6.5pt;font-weight:900;color:#000;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.orig{font-size:5.5pt;color:#000;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2;}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}.lbl{page-break-inside:avoid;}}
</style></head><body><div class="grid">${labelsHtml}</div></body></html>`);
    win.document.close(); win.focus();
    setTimeout(() => { win.print(); win.close(); }, 500);
  };

  const loadAiSaved = async () => {
    setAiSavedLoading(true);
    try {
      const r = await api.get('/marking/ai-saved', { params: saleNo ? { sale_no: saleNo } : {} });
      setAiSavedRows(r.data || []);
      setShowAiSaved(true);
    } catch (e) {
      setAlert({ msg: 'Could not load AI saved markings', type: 'error' });
    } finally { setAiSavedLoading(false); }
  };

  const deleteAiSavedRow = async (id) => {
    if (!window.confirm('Delete this AI reference marking?')) return;
    try {
      await api.delete(`/marking/${id}`);
      setAiSavedRows(prev => prev.filter(r => r.id !== id));
    } catch (e) { setAlert({ msg: 'Delete failed: ' + e.message, type: 'error' }); }
  };

  const fmtDate = d => { try { const dt = new Date(d); return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}`; } catch { return '—'; } };
  const toggleParty = p => setSelParties(prev => prev.find(x => x.id === p.id) ? prev.filter(x => x.id !== p.id) : [...prev, { id: p.id, party_name: p.party_name, party_code: p.party_code }]);
  const PARTY_TYPE_COLORS = { A: '#f59e0b', B: '#3b82f6', C: '#ec4899' };
  const filteredParties = useMemo(() => {
    const q = partySearch.toLowerCase();
    return allParties.filter(p => {
      if (partyTypeFilter !== 'ALL' && p.party_type !== partyTypeFilter) return false;
      return p.party_name.toLowerCase().includes(q) || p.party_code.toLowerCase().includes(q);
    });
  }, [allParties, partySearch, partyTypeFilter]);

  // Memoized — only recompute when allLots changes, not on every render
  const gradesOpts  = useMemo(() => [...new Set(allLots.map(r => r.grade).filter(Boolean))].sort(),  [allLots]);
  const gpDateOpts  = useMemo(() => [...new Set(allLots.map(r => fmtDate(r.gp_date)).filter(Boolean))].sort(), [allLots]);
  const gardensOpts = useMemo(() => [...new Set(allLots.map(r => r.garden).filter(Boolean))].sort(), [allLots]);
  const brokersOpts = useMemo(() => [...new Set(allLots.map(r => r.broker).filter(Boolean))].sort(), [allLots]);
  const originsOpts = useMemo(() => [...new Set(allLots.map(r => r.origin).filter(Boolean))].sort(), [allLots]);
  const ratesOpts = useMemo(() => {
    const vals = new Set();
    let hasBlank = false;
    allLots.forEach(r => { const rt = fmtRateUtil(r); if (rt === '—') hasBlank = true; else vals.add(rt); });
    const sorted = [...vals].sort();
    return hasBlank ? ['Blank', ...sorted] : sorted;
  }, [allLots]);

  // Memoized — only recompute when lotSlots changes (not on filter/cursor changes)
  const { markedCount, markedSlotCount } = useMemo(() => {
    let count = 0, slotCount = 0;
    for (const l of allLots) {
      const slots = lotSlots[l.catalogue_id] || [];
      let hasAny = false;
      for (const s of slots) {
        if (s?.party_id) { slotCount++; hasAny = true; }
      }
      if (hasAny) count++;
    }
    return { markedCount: count, markedSlotCount: slotCount };
  }, [allLots, lotSlots]);

  // Memoized filter sets — O(1) lookup instead of O(n) .includes() per row
  const filterGradesSet  = useMemo(() => new Set(filterGrades),  [filterGrades]);
  const filterGardensSet = useMemo(() => new Set(filterGardens), [filterGardens]);
  const filterBrokersSet = useMemo(() => new Set(filterBrokers), [filterBrokers]);
  const filterOriginsSet = useMemo(() => new Set(filterOrigins), [filterOrigins]);
  const filterRatesSet   = useMemo(() => new Set(filterRates),   [filterRates]);
  const filterGpDatesSet = useMemo(() => new Set(filterGpDates), [filterGpDates]);
  const searchLotLower   = useMemo(() => searchLot.toLowerCase(), [searchLot]);

  const filteredLots = useMemo(() => allLots.filter(row => {
    if (filterGradesSet.size  > 0 && !filterGradesSet.has(row.grade))   return false;
    if (filterGardensSet.size > 0 && !filterGardensSet.has(row.garden)) return false;
    if (filterBrokersSet.size > 0 && !filterBrokersSet.has(row.broker)) return false;
    if (filterOriginsSet.size > 0 && !filterOriginsSet.has(row.origin)) return false;
    if (filterRatesSet.size > 0) {
      const rt = fmtRateUtil(row);
      if (!(filterRatesSet.has(rt) || (filterRatesSet.has('Blank') && rt === '—'))) return false;
    }
    if (searchLotLower && !(row.lot_no || '').toLowerCase().includes(searchLotLower)) return false;
    if (showMarked && !(lotSlots[row.catalogue_id] || []).some(s => s?.party_id)) return false;
    if (filterGpDatesSet.size > 0 && !filterGpDatesSet.has(fmtDate(row.gp_date))) return false;
    return true;
  }), [allLots, filterGradesSet, filterGardensSet, filterBrokersSet, filterOriginsSet, filterRatesSet, filterGpDatesSet, searchLotLower, showMarked, lotSlots]);

  const visibleLots = filteredLots.slice(0, visibleCount);
  const hasMore = filteredLots.length > visibleCount;
  const hasFilters = filterGrades.length > 0 || filterGardens.length > 0 || filterBrokers.length > 0 || filterOrigins.length > 0 || filterRates.length > 0 || searchLot || showMarked;
  const clearFilters = () => { setFilterGrades([]); setFilterGardens([]); setFilterBrokers([]); setFilterOrigins([]); setFilterRates([]); setSearchLot(''); setShowMarked(false); setFilterGpDates([]); setVisibleCount(200); };

  return (
    <div onKeyDown={handlePageKeyDown} tabIndex={-1} style={{ outline: 'none' }}>
      <h2 style={{ marginBottom: 2, color: '#1a3c5e', fontSize: 20, fontWeight: 800 }}>Create Markings</h2>
      <p style={{ color: '#9ca3af', fontSize: 12, marginBottom: 14 }}>Select sale, pick parties. <b>Mark F1</b> = Grade Settings (Garden+Grade dedup, max_lots cap). <b>Mark F2</b> = Grade-Garden Mapping (fills remaining slots). P4-P5 purple = manual. Ctrl+S to save.</p>
      {alert && <Alert msg={alert.msg} type={alert.type} />}

      <Card style={{ marginBottom: 14, padding: 14 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#6b7280', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Sale / Batch *</label>
            <select value={saleNo ? `${saleNo}||${batchName}` : ''} onChange={e => handleSaleChange(e.target.value)}
              style={{ padding: '7px 12px', border: '1.5px solid #cbd5e0', borderRadius: 6, fontSize: 13, minWidth: 280 }}>
              <option value="">Select sale to load lots...</option>
              {saleNos.map(s => {
                const val = `${s.sale_no}||${s.batch_name || ''}`;
                const label = s.batch_name
                  ? `Sale ${s.sale_no} — ${s.batch_name} (${s.lot_count} lots)`
                  : `Sale ${s.sale_no} (${s.lot_count} lots)`;
                return <option key={val} value={val}>{label}</option>;
              })}
            </select>
          </div>
          {allLots.length > 0 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#6b7280' }}>
                <b style={{ color: '#1a2533' }}>{allLots.length}</b> lots &middot; <b style={{ color: '#1a7a4a' }}>{filteredLots.length}</b> shown &middot; <b style={{ color: '#1a7a4a' }}>{markedCount}</b> lots marked &middot; <b style={{ color: '#7c3aed' }}>{markedSlotCount}</b> slots
              </span>
              <button onClick={() => setShowMarked(v => !v)}
                style={{ padding: '4px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 11, fontWeight: 600, background: showMarked ? '#1a7a4a' : '#f0fdf4', color: showMarked ? '#fff' : '#1a7a4a', border: `1.5px solid ${showMarked ? '#1a7a4a' : '#bbf7d0'}` }}>
                {showMarked ? 'Marked Only' : 'Show Marked'}
              </button>
              {hasFilters && <button onClick={clearFilters} style={{ padding: '4px 10px', borderRadius: 5, fontSize: 11, color: '#c0392b', background: 'none', border: '1px solid #fecaca', cursor: 'pointer' }}>Clear filters</button>}
              {markedCount > 0 && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Button onClick={save} disabled={saving} variant="success" style={{ padding: '6px 16px', fontSize: 12 }}>
                    {saving ? 'Saving...' : `Save ${markedSlotCount} Slot Markings`}
                  </Button>
                </div>
              )}
              {saleNo && (
                <div style={{ display: 'flex', gap: 5 }}>
                  <button onClick={clearAllMarkings}
                    style={{ padding: '4px 10px', borderRadius: 5, fontSize: 11, color: '#991b1b', background: '#fee2e2', border: '1px solid #fecaca', cursor: 'pointer', fontWeight: 600 }}>
                    🗑 Clear Markings
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Select Parties → Mark F1 first, then Mark F2 to fill remaining slots</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 7, alignItems: 'center', flexWrap: 'wrap' }}>
              <input value={partySearch} onChange={e => setPartySearch(e.target.value)} placeholder="Search parties..."
                style={{ padding: '5px 8px', border: '1.5px solid #e2e8f0', borderRadius: 5, fontSize: 12, width: 150 }} />
              <select value={partyTypeFilter} onChange={e => setPartyTypeFilter(e.target.value)}
                style={{ padding: '5px 8px', border: '1.5px solid #e2e8f0', borderRadius: 5, fontSize: 11, color: '#555' }}>
                <option value="ALL">All Types</option>
                <option value="A">Type A</option>
                <option value="B">Type B</option>
                <option value="C">Type C</option>
              </select>
              <button onClick={() => setSelParties(filteredParties.map(p => ({ id: p.id, party_name: p.party_name, party_code: p.party_code })))} style={{ padding: '5px 10px', borderRadius: 5, border: '1.5px solid #1a3c5e', background: '#1a3c5e', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Select All</button>
              <button onClick={() => setSelParties([])} style={{ padding: '5px 10px', borderRadius: 5, border: '1.5px solid #e2e8f0', background: '#f9fafb', color: '#555', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Deselect All</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
              {filteredParties.map(p => {
                const sel = !!selParties.find(x => x.id === p.id);
                const typeColor = PARTY_TYPE_COLORS[p.party_type] || '#6b7280';
                return (
                  <div key={p.id} onClick={() => toggleParty(p)}
                    style={{ padding: '4px 10px', borderRadius: 18, cursor: 'pointer', fontSize: 11, fontWeight: 600, userSelect: 'none',
                      background: sel ? '#1a3c5e' : '#f0f4f8', color: sel ? '#fff' : '#555',
                      border: `1.5px solid ${sel ? typeColor : '#e2e8f0'}`, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    [{p.party_code}] {p.party_name}
                    {p.party_type && <span style={{ background: typeColor, color: '#fff', borderRadius: 99, fontSize: 8, padding: '0px 4px', fontWeight: 700 }}>{p.party_type}</span>}
                  </div>
                );
              })}
            </div>
            {selParties.length > 0 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                <Button
                  onClick={markF1}
                  disabled={!!marking}
                  variant="primary"
                  style={{ padding: '6px 16px', fontSize: 12 }}
                  title="Mark using Grade Settings (Filter 1): Garden+Grade dedup with max_lots cap"
                >
                  {marking === 'f1' ? 'Marking F1...' : '▶ Mark F1'}
                </Button>
                <Button
                  onClick={markF2}
                  disabled={!!marking}
                  variant="success"
                  style={{ padding: '6px 16px', fontSize: 12 }}
                  title="Mark using Grade-Garden Mapping (Filter 2): fills remaining P1-P3 slots"
                >
                  {marking === 'f2' ? 'Marking F2...' : '▶ Mark F2'}
                </Button>
                <button onClick={() => setSelParties([])} style={{ padding: '5px 10px', borderRadius: 5, border: '1.5px solid #e2e8f0', background: '#f9fafb', color: '#555', fontSize: 11, cursor: 'pointer' }}>Clear</button>
                <span style={{ fontSize: 11, color: '#888' }}>{selParties.length} selected</span>
              </div>
            )}

      </Card>

      {allLots.length > 0 && (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '8px 14px', background: '#1a3c5e', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>
              All Lots - Sale #{saleNo}{batchName && <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 6, color: '#93c5fd' }}>({batchName})</span>}
              {hasFilters && <span style={{ fontSize: 10, fontWeight: 400, marginLeft: 8, opacity: 0.8 }}>({filteredLots.length} of {allLots.length})</span>}
            </div>
            <div style={{ fontSize: 10, opacity: 0.7 }}>Click slot | →/Tab=right | ←=left | ↓/Enter=down | ↑=up | Backspace=clear | P4-P5 purple = manual</div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#234d78', color: '#fff' }}>
                  <th style={{ padding: '7px 6px', textAlign: 'center', fontSize: 11, minWidth: 50 }}>Sale</th>
                  {[1,2,3].map(n => <th key={n} style={{ padding: '7px 4px', textAlign: 'center', background: '#1a3c5e', width: 54, fontSize: 11 }}>P{n}</th>)}
                  {[4,5].map(n => <th key={n} style={{ padding: '7px 4px', textAlign: 'center', background: '#4c1d95', width: 54, fontSize: 11 }}>P{n}</th>)}
                  <th style={{ padding: '7px 6px', textAlign: 'left', fontSize: 11 }}><ColFilter label="Bro" options={brokersOpts} selected={filterBrokers} onChange={setFilterBrokers} /></th>
                  <th style={{ padding: '7px 6px', textAlign: 'left', fontSize: 11 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontWeight: 600 }}>Lot</span>
                      <input value={searchLot} onChange={e => setSearchLot(e.target.value)} onClick={e => e.stopPropagation()} placeholder="Search..."
                        style={{ width: 58, padding: '1px 4px', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 3, fontSize: 9, background: 'rgba(255,255,255,0.15)', color: '#fff', outline: 'none' }} />
                    </div>
                  </th>
                  <th style={{ padding: '7px 6px', textAlign: 'left', minWidth: 95, fontSize: 11 }}><ColFilter label="Garden" options={gardensOpts} selected={filterGardens} onChange={setFilterGardens} /></th>
                  <th style={{ padding: '7px 6px', textAlign: 'left', fontSize: 11 }}><ColFilter label="Grd" options={gradesOpts} selected={filterGrades} onChange={setFilterGrades} /></th>
                  <th style={{ padding: '7px 6px', textAlign: 'right', fontSize: 11, minWidth: 80 }}>
                    <ColFilter label="Rate" options={ratesOpts} selected={filterRates} onChange={setFilterRates} />
                  </th>
                  <th style={{ padding: '7px 6px', textAlign: 'left', fontSize: 11, minWidth: 85 }}>
                    <ColFilter label="Origin" options={originsOpts} selected={filterOrigins} onChange={setFilterOrigins} />
                  </th>
                  <th style={{ padding: '7px 6px', textAlign: 'right', fontSize: 11 }}>Qty</th>
                  <th style={{ padding: '7px 6px', textAlign: 'right', fontSize: 11 }}>NWt</th>
                  <th style={{ padding: '7px 6px', textAlign: 'center', fontSize: 11 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontWeight: 600 }}>GP Dt</span>
                      <ColFilter label="" options={gpDateOpts} selected={filterGpDates} onChange={setFilterGpDates} />
                    </div>
                  </th>
                  <th style={{ padding: '7px 6px', textAlign: 'left', fontSize: 11 }}>Invoice</th>
                  <th style={{ padding: '7px 4px', textAlign: 'center', fontSize: 11, width: 28 }}></th>
                </tr>
              </thead>
              <tbody>
                {visibleLots.length === 0
                  ? <tr><td colSpan={16} style={{ padding: 20, textAlign: 'center', color: '#aaa' }}>No lots match filters. <button onClick={clearFilters} style={{ color: '#1a3c5e', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Clear</button></td></tr>
                  : visibleLots.map((row, rowIdx) => {
                    const slots = lotSlots[row.catalogue_id] || Array(MAX_SLOTS).fill(null);
                    return (
                      <LotRow key={row.catalogue_id} row={row} rowIdx={rowIdx} slots={slots}
                        dupAlert={dupAlerts[row.catalogue_id]}
                        onSlotChange={updateSlot}
                        allParties={allParties}
                        visibleLots={visibleLots}
                        onDismissDup={dismissDup}
                        onDeleteLot={deleteLotMarkings} />
                    );
                  })
                }
              </tbody>
            </table>
          </div>
          {hasMore && (
            <div style={{ padding: '10px', textAlign: 'center', borderTop: '1px solid #f0f4f8', background: '#fafbfc' }}>
              <span style={{ fontSize: 12, color: '#6b7280', marginRight: 10 }}>Showing {Math.min(visibleCount, filteredLots.length)} of {filteredLots.length}</span>
              <button onClick={() => setVisibleCount(v => v + 200)} style={{ padding: '5px 12px', background: '#1a3c5e', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12, fontWeight: 600, marginRight: 6 }}>Load 200 more</button>
              <button onClick={() => setVisibleCount(filteredLots.length)} style={{ padding: '5px 12px', background: '#f0f4f8', color: '#1a3c5e', border: '1.5px solid #1a3c5e', borderRadius: 5, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Load All ({filteredLots.length})</button>
            </div>
          )}
        </Card>
      )}
      {!saleNo && <Card style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>Select a Sale Number above to load all catalogue lots</Card>}
      {saleNo && loading && <Card style={{ textAlign: 'center', padding: 40, color: '#888' }}>Loading lots...</Card>}
    </div>
  );
}
