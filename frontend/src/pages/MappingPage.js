import React, { useState, useEffect, useCallback } from 'react';
import { Card, Button, Alert, api } from '../App';

const SectionTitle = ({ n, children }) => (
  <div style={{ fontSize: 11, fontWeight: 700, color: '#444', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10, padding: '6px 0', borderBottom: '1.5px solid #e2e8f0' }}>
    {n ? `${n}. ` : ''}{children}
  </div>
);

const NumCell = ({ value, onChange, placeholder = '0', width = 72 }) => (
  <input type="number" min="0" value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    style={{ width, padding: '5px 8px', border: '1.5px solid #cbd5e0', borderRadius: 6, fontSize: 12, textAlign: 'center' }} />
);

export default function MappingPage() {
  const [parties,      setParties]      = useState([]);
  const [allGardens,   setAllGardens]   = useState([]);
  const [allGrades,    setAllGrades]    = useState([]);
  const [allBrokers,   setAllBrokers]   = useState([]);
  const [gradeGardens, setGradeGardens] = useState({});

  const [selected,     setSelected]     = useState(null);
  const [search,       setSearch]       = useState('');
  const [saving,       setSaving]       = useState(false);
  const [alert,        setAlert]        = useState(null);
  const [addMode,      setAddMode]      = useState(false);
  const [newParty,     setNewParty]     = useState({ name: '', code: '', type: 'B' });
  const [importing,    setImporting]    = useState(false);
  const [importResult, setImportResult] = useState(null);

  // Party master fields
  const [selectedGrades, setSelectedGrades] = useState([]);
  const [gradeGardenMap, setGradeGardenMap] = useState({});
  const [brokerList,     setBrokerList]     = useState([]);
  const [gSearch,        setGSearch]        = useState('');
  const [skipBlankLsp,   setSkipBlankLsp]   = useState(true); // CHANGED: Default true
  const [skipDupBGG,     setSkipDupBGG]     = useState(true);
  const [gradeSettings,  setGradeSettings]  = useState({});
  const [gradeBrokerLots, setGradeBrokerLots] = useState({}); // { grade: { broker: maxLots } }
  const [expandedBrokerGrade, setExpandedBrokerGrade] = useState(null); // which grade's broker panel is open
  const [partyType,      setPartyType]      = useState('B');
  const [oneLotPerGradeGarden, setOneLotPerGradeGarden] = useState(false);

  // Garden mapping UI state
  const [selectedGradesForGarden, setSelectedGradesForGarden] = useState([]);

  const setGradeSetting = (grade, field, val) => setGradeSettings(prev => ({
    ...prev, [grade]: { ...(prev[grade]||{}), [field]: val===''?(field==='date_before'?'':0):(field==='date_before'?val:parseFloat(val)||0) }
  }));

  const setBrokerLot = (grade, broker, val) => setGradeBrokerLots(prev => {
    const g = { ...(prev[grade] || {}) };
    const n = parseInt(val, 10);
    if (!val || isNaN(n) || n <= 0) delete g[broker];
    else g[broker] = n;
    return { ...prev, [grade]: g };
  });

  const copyToAllGradesBelow = (fromGrade) => {
    const fromSettings = gradeSettings[fromGrade];
    if (!fromSettings) return;
    
    const gradeIndex = selectedGrades.indexOf(fromGrade);
    if (gradeIndex === -1) return;
    
    const gradesToUpdate = selectedGrades.slice(gradeIndex + 1);
    
    setGradeSettings(prev => {
      const updated = { ...prev };
      gradesToUpdate.forEach(grade => {
        updated[grade] = {
          ...updated[grade],
          rate_min: fromSettings.rate_min,
          rate_max: fromSettings.rate_max,
          bags_to: fromSettings.bags_to,
          bags_from: fromSettings.bags_from,
          nwt_to: fromSettings.nwt_to,
          nwt_from: fromSettings.nwt_from,
          date_before: fromSettings.date_before
        };
      });
      return updated;
    });

    // NEW: copy broker lot limits from fromGrade to all grades below
    const fromBrokerLots = gradeBrokerLots[fromGrade] || {};
    setGradeBrokerLots(prev => {
      const updated = { ...prev };
      gradesToUpdate.forEach(grade => {
        updated[grade] = { ...fromBrokerLots };
      });
      return updated;
    });
    
    setAlert({ msg: `✅ Settings copied from ${fromGrade} to ${gradesToUpdate.length} grades below`, type: 'success' });
    setTimeout(() => setAlert(null), 2000);
  };

  const load = useCallback(async () => {
    const [p, g, gr, br, gg] = await Promise.all([
      api.get('/mapping/summary/all').catch(()=>({data:[]})),
      api.get('/mapping/gardens').catch(()=>({data:[]})),
      api.get('/marking/grades/list').catch(()=>({data:[]})),
      api.get('/mapping/brokers-available').catch(()=>({data:[]})),
      api.get('/mapping/grade-gardens').catch(()=>({data:{}}))
    ]);
    setParties(p.data); 
    setAllGardens(g.data); 
    setAllGrades(gr.data); 
    setAllBrokers(br.data);
    setGradeGardens(gg.data);
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectParty = async (p) => {
    setSelected(p); setAlert(null);
    try {
      const r = await api.get(`/mapping/party-master/${p.id}`);
      const pm = r.data;
      
      setBrokerList(pm.broker_list || []);
      setSkipBlankLsp(pm.skip_blank_lsp !== false); // CHANGED: Default true if not set
      setSkipDupBGG(pm.skip_dup_broker_garden_grade !== false);
      setPartyType(pm.party_type || 'B');
      setOneLotPerGradeGarden(pm.one_lot_per_grade_garden || false);
      
      const gradeSamples = pm.grade_samples || {};
      const gradeRanges  = pm.grade_ranges  || {};
      const gradeBags    = pm.grade_bags    || {};
      const gradeNwt     = pm.grade_nwt     || {};
      const gradeGardenMapping = pm.grade_garden_mapping || {};
      
      const activeGrades = Object.keys(gradeSamples).filter(g => gradeSamples[g] > 0);
      setSelectedGrades(activeGrades);
      
      const gs = {};
      activeGrades.forEach(g => {
        gs[g] = { 
          max_lots: gradeSamples[g]||0, 
          rate_min: gradeRanges[g]?.min||0, 
          rate_max: gradeRanges[g]?.max||0, 
          bags_to: gradeBags[g]?.to||0,      // FIXED: TO first
          bags_from: gradeBags[g]?.from||0,  // FIXED: FROM second
          nwt_to: gradeNwt[g]?.to||0,        // FIXED: TO first
          nwt_from: gradeNwt[g]?.from||0,    // FIXED: FROM second
          date_before: gradeRanges[g]?.date_before||''  // Date filter
        };
      });
      setGradeSettings(gs);
      setGradeBrokerLots(pm.grade_broker_lots || {});
      setGradeGardenMap(gradeGardenMapping);
      setSelectedGradesForGarden([]);
    } catch (e) {
      setBrokerList([]); setSkipBlankLsp(true); setSkipDupBGG(false); 
      setSelectedGrades([]); setGradeSettings({}); setPartyType('B');
      setGradeBrokerLots({});
      setGradeGardenMap({}); setOneLotPerGradeGarden(false);
      setSelectedGradesForGarden([]);
    }
  };

  const toggleGrade = (grade) => {
    const removing = selectedGrades.includes(grade);
    setSelectedGrades(removing ? selectedGrades.filter(g=>g!==grade) : [...selectedGrades, grade]);
    if (removing) {
      setGradeBrokerLots(prev => { const u = { ...prev }; delete u[grade]; return u; });
      if (expandedBrokerGrade === grade) setExpandedBrokerGrade(null);
    }
    if (!removing && !gradeSettings[grade])
      setGradeSettings(prev => ({ 
        ...prev, 
        [grade]: { 
          max_lots:0, rate_min:0, rate_max:0, 
          bags_to:0, bags_from:0, nwt_to:0, nwt_from:0,
          date_before: ''
        } 
      }));
  };

  const toggleGradeForGardenMapping = (grade) => {
    setSelectedGradesForGarden(prev => 
      prev.includes(grade) 
        ? prev.filter(g => g !== grade)
        : [...prev, grade]
    );
  };

  const toggleGardenForGrades = (garden) => {
    if (selectedGradesForGarden.length === 0) return;
    
    setGradeGardenMap(prev => {
      const updated = { ...prev };
      selectedGradesForGarden.forEach(grade => {
        const gradeGardens = updated[grade] || [];
        const idx = gradeGardens.indexOf(garden);
        if (idx > -1) {
          updated[grade] = gradeGardens.filter(g => g !== garden);
        } else {
          updated[grade] = [...gradeGardens, garden];
        }
      });
      return updated;
    });
  };

  const isGardenSelectedInAnyGrade = (garden) => {
    return selectedGradesForGarden.some(grade => {
      const gardens = gradeGardenMap[grade] || [];
      return gardens.includes(garden);
    });
  };

  const toggleBroker = (b) => setBrokerList(prev => 
    prev.includes(b) ? prev.filter(x=>x!==b) : [...prev, b]
  );

  const chip = (active, onClick, label, activeBg='#dcfce7', activeText='#166534', inactiveText='#888') => (
    <div onClick={onClick} style={{
      padding:'4px 10px', borderRadius:99, fontSize:12, cursor:'pointer', userSelect:'none',
      background: active?activeBg:'#f8fafc',
      border: `1.5px solid ${active?'#16a34a':'#e2e8f0'}`,
      color: active?activeText:inactiveText,
      fontWeight: active?600:400
    }}>{label}</div>
  );

  const save = async () => {
    if (!selected) return;
    setSaving(true); setAlert(null);
    
    const gradeSamples = {}, gradeRanges = {}, gradeBags = {}, gradeNwt = {};
    selectedGrades.forEach(g => {
      const s = gradeSettings[g] || {};
      gradeSamples[g] = effectiveMaxLots(g);
      gradeRanges[g] = { min: s.rate_min||0, max: s.rate_max||0, date_before: s.date_before||'' };
      gradeBags[g] = { to: s.bags_to||0, from: s.bags_from||0 };      // FIXED: TO/FROM order
      gradeNwt[g] = { to: s.nwt_to||0, from: s.nwt_from||0 };        // FIXED: TO/FROM order
    });

    try {
      await api.post('/mapping', {
        party_id: selected.id,
        grade_samples: gradeSamples,
        grade_ranges: gradeRanges,
        grade_bags: gradeBags,
        grade_nwt: gradeNwt,
        grade_garden_mapping: gradeGardenMap,
        grade_broker_lots: gradeBrokerLots,
        broker_list: brokerList,
        skip_blank_lsp: skipBlankLsp,
        skip_dup_broker_garden_grade: skipDupBGG,
        one_lot_per_grade_garden: oneLotPerGradeGarden,
        party_type: partyType
      });
      setAlert({ msg: '✅ Party settings saved successfully!', type: 'success' });
      await load();
      // Auto-hide success message after 3 seconds
      setTimeout(() => setAlert(null), 3000);
    } catch (e) {
      setAlert({ msg: '❌ ' + (e.response?.data?.error || e.message), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const addParty = async () => {
    if (!newParty.name.trim() || !newParty.code.trim()) {
      setAlert({ msg: '❌ Party name and code are required', type: 'error' });
      return;
    }
    try {
      await api.post('/parties', { 
        party_name: newParty.name.trim(), 
        party_code: newParty.code.trim(),
        party_type: newParty.type || 'B'
      });
      setAlert({ msg: '✅ Party added successfully!', type: 'success' });
      setNewParty({ name: '', code: '', type: 'B' });
      setAddMode(false);
      await load();
    } catch (e) {
      setAlert({ msg: '❌ ' + (e.response?.data?.error || e.message), type: 'error' });
    }
  };

  const deleteParty = async (p, e) => {
    e.stopPropagation();
    if (!window.confirm(`Delete party "${p.party_code} — ${p.party_name}"? This will also remove all their mapping settings.`)) return;
    try {
      await api.delete(`/mapping/party/${p.id}`);
      if (selected?.id === p.id) {
        setSelected(null);
        setSelectedGrades([]);
        setGradeSettings({});
        setGradeGardenMap({});
        setBrokerList([]);
      }
      setAlert({ msg: `✅ Party "${p.party_code}" deleted.`, type: 'success' });
      await load();
      setTimeout(() => setAlert(null), 3000);
    } catch (e) {
      setAlert({ msg: '❌ ' + (e.response?.data?.error || e.message), type: 'error' });
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setImporting(true);
    setImportResult(null);
    setAlert(null);
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const { data } = await api.post('/mapping/import-parties', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      setImportResult(data);
      setAlert({ 
        msg: `✅ ${data.message}`, 
        type: 'success' 
      });
      await load();
    } catch (e) {
      setAlert({ 
        msg: '❌ ' + (e.response?.data?.error || e.message), 
        type: 'error' 
      });
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  // Sum of per-broker limits set for a grade (0 if none set)
  const brokerSumFor = (g) => Object.values(gradeBrokerLots[g] || {})
    .reduce((s, v) => s + (parseInt(v, 10) || 0), 0);
  // Effective Max Lots for a grade: broker sum when any broker limit is set,
  // otherwise the manually-typed max_lots.
  const effectiveMaxLots = (g) => {
    const bs = brokerSumFor(g);
    return bs > 0 ? bs : (gradeSettings[g]?.max_lots || 0);
  };

  const totalSlots = selectedGrades.reduce((sum, g) =>
    sum + effectiveMaxLots(g), 0
  );

  const filteredParties = parties
    .filter(p =>
      p.party_name.toLowerCase().includes(search.toLowerCase()) ||
      p.party_code.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => a.party_code.localeCompare(b.party_code));

  const availableGardens = selectedGradesForGarden.length > 0
    ? selectedGradesForGarden.flatMap(grade => gradeGardens[grade] || [])
    : allGardens;
    
  const uniqueGardens = [...new Set(availableGardens)];
  const filteredGardens = uniqueGardens.filter(g => 
    g.toLowerCase().includes(gSearch.toLowerCase())
  );

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#1f2937', marginBottom: 6 }}>
          Party Mapping & Preferences
        </h1>
        <div style={{ fontSize: 14, color: '#6b7280' }}>
          Configure party-wise grade preferences, garden selection, broker filters, and marking rules
        </div>
      </div>

      {alert && (
        <div style={{
          padding: '14px 18px',
          borderRadius: 8,
          marginBottom: 20,
          fontSize: 15,
          fontWeight: 600,
          lineHeight: 1.5,
          background: alert.type === 'success' ? '#dcfce7' : alert.type === 'error' ? '#fee2e2' : '#fef3c7',
          border: `2px solid ${alert.type === 'success' ? '#16a34a' : alert.type === 'error' ? '#dc2626' : '#f59e0b'}`,
          color: alert.type === 'success' ? '#15803d' : alert.type === 'error' ? '#991b1b' : '#92400e',
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          {alert.msg}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20 }}>
        {/* LEFT PANEL: Party List */}
        <div>
          <Card style={{ padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input 
                value={search} 
                onChange={e => setSearch(e.target.value)} 
                placeholder="Search parties..." 
                style={{ 
                  flex: 1, 
                  padding: '8px 12px', 
                  border: '1.5px solid #e2e8f0', 
                  borderRadius: 6, 
                  fontSize: 13 
                }} 
              />
            </div>
            
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              <Button 
                size="sm" 
                variant="primary" 
                onClick={() => setAddMode(!addMode)}
                style={{ flex: 1 }}
              >
                {addMode ? '✕ Cancel' : '+ Add Party'}
              </Button>
              <label style={{ 
                flex: 1, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                padding: '6px 12px',
                background: '#f0f9ff',
                border: '1.5px solid #38bdf8',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                color: '#0369a1',
                cursor: 'pointer'
              }}>
                {importing ? 'Importing...' : '📤 Import Excel'}
                <input 
                  type="file" 
                  accept=".xlsx,.xls" 
                  onChange={handleImport}
                  disabled={importing}
                  style={{ display: 'none' }}
                />
              </label>
            </div>

            {addMode && (
              <div style={{ 
                marginBottom: 12, 
                padding: 12, 
                background: '#f8fafc', 
                borderRadius: 6, 
                border: '1.5px solid #e2e8f0' 
              }}>
                <input 
                  placeholder="Party Code" 
                  value={newParty.code}
                  onChange={e => setNewParty(prev => ({ ...prev, code: e.target.value }))}
                  style={{ 
                    width: '100%', 
                    padding: '6px 10px', 
                    marginBottom: 8, 
                    border: '1.5px solid #cbd5e0', 
                    borderRadius: 4, 
                    fontSize: 12 
                  }}
                />
                <input 
                  placeholder="Party Name" 
                  value={newParty.name}
                  onChange={e => setNewParty(prev => ({ ...prev, name: e.target.value }))}
                  style={{ 
                    width: '100%', 
                    padding: '6px 10px', 
                    marginBottom: 8, 
                    border: '1.5px solid #cbd5e0', 
                    borderRadius: 4, 
                    fontSize: 12 
                  }}
                />
                <select 
                  value={newParty.type}
                  onChange={e => setNewParty(prev => ({ ...prev, type: e.target.value }))}
                  style={{ 
                    width: '100%', 
                    padding: '6px 10px', 
                    marginBottom: 8, 
                    border: '1.5px solid #cbd5e0', 
                    borderRadius: 4, 
                    fontSize: 12 
                  }}
                >
                  <option value="A">Type A</option>
                  <option value="B">Type B</option>
                  <option value="C">Type C</option>
                </select>
                <Button size="sm" variant="success" onClick={addParty} style={{ width: '100%' }}>
                  Add Party
                </Button>
              </div>
            )}

            {importResult && (
              <div style={{ 
                marginBottom: 12, 
                padding: 10, 
                background: '#f0fdf4', 
                border: '1.5px solid #22c55e', 
                borderRadius: 6,
                fontSize: 11
              }}>
                <div style={{ fontWeight: 600, color: '#166534', marginBottom: 4 }}>
                  Import Complete
                </div>
                <div style={{ color: '#15803d' }}>
                  ✓ Imported: {importResult.imported}<br/>
                  ⊘ Skipped: {importResult.skipped}
                </div>
              </div>
            )}

            <div style={{ 
              maxHeight: 'calc(100vh - 340px)', 
              overflowY: 'auto',
              borderTop: '1px solid #e2e8f0',
              paddingTop: 8
            }}>
              {filteredParties.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 20, color: '#aaa', fontSize: 13 }}>
                  No parties found
                </div>
              ) : (
                filteredParties.map(p => {
                  const typeColor = {
                    A: { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
                    B: { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' },
                    C: { bg: '#fce7f3', border: '#ec4899', text: '#9f1239' }
                  }[p.party_type || 'B'] || { bg: '#f3f4f6', border: '#9ca3af', text: '#374151' };
                  
                  return (
                    <div
                      key={p.id}
                      onClick={() => selectParty(p)}
                      style={{
                        padding: '10px 12px',
                        marginBottom: 6,
                        borderRadius: 6,
                        cursor: 'pointer',
                        background: selected?.id === p.id ? '#f0f9ff' : '#fff',
                        border: `1.5px solid ${selected?.id === p.id ? '#0284c7' : '#e2e8f0'}`,
                        transition: 'all 0.15s',
                        position: 'relative'
                      }}
                    >
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        marginBottom: 4
                      }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937' }}>
                          {p.party_code}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <div style={{
                            padding: '2px 8px',
                            borderRadius: 12,
                            fontSize: 10,
                            fontWeight: 700,
                            background: typeColor.bg,
                            border: `1px solid ${typeColor.border}`,
                            color: typeColor.text
                          }}>
                            {p.party_type || 'B'}
                          </div>
                          <button
                            onClick={e => deleteParty(p, e)}
                            title={`Delete ${p.party_code}`}
                            style={{
                              border: 'none',
                              background: 'none',
                              cursor: 'pointer',
                              color: '#dc2626',
                              fontSize: 13,
                              padding: '0 2px',
                              lineHeight: 1,
                              opacity: 0.6,
                              fontWeight: 700
                            }}
                            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                            onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
                          >✕</button>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
                        {p.party_name}
                      </div>
                      <div style={{ fontSize: 10, color: '#9ca3af' }}>
                        {p.total_lots || 0} slots • {p.garden_count || 0} gardens
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </div>

        {/* RIGHT PANEL: Party Settings */}
        <div>
          {!selected ? (
            <Card style={{ padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 15, color: '#9ca3af' }}>
                ← Select a party to configure preferences
              </div>
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Header with Save */}
              <Card style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#1f2937' }}>
                      {selected.party_code} — {selected.party_name}
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                      Party Type: <strong>{partyType}</strong>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select
                      value={partyType}
                      onChange={e => setPartyType(e.target.value)}
                      style={{
                        padding: '8px 12px',
                        border: '1.5px solid #cbd5e0',
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: 600
                      }}
                    >
                      <option value="A">Type A</option>
                      <option value="B">Type B</option>
                      <option value="C">Type C</option>
                    </select>
                    <Button variant="success" onClick={save} disabled={saving}>
                      {saving ? 'Saving...' : '💾 Save Settings'}
                    </Button>
                  </div>
                </div>
              </Card>

              {/* Section 1: Grade Settings */}
              <Card style={{ padding: 16 }}>
                <SectionTitle n="1">Grade Settings — Max Lots & Filters</SectionTitle>
                
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#444', marginBottom: 6 }}>
                    Select grades:
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {allGrades.map(g => chip(
                      selectedGrades.includes(g),
                      () => toggleGrade(g),
                      g
                    ))}
                  </div>
                </div>

                {selectedGrades.length > 0 && (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                          <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Grade</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>Max Lots</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>Rate Min</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>Rate Max</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>Date Before</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>Bags From</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>Bags To</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>NWT From</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>NWT To</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedGrades.map((g, i) => {
                          const s = gradeSettings[g] || {};
                          const bSum = brokerSumFor(g);
                          const brokerDriven = bSum > 0;
                          return (
                            <React.Fragment key={g}>
                            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                              <td style={{ padding: '7px 12px', fontWeight: 600, color: '#1f2937' }}>{g}</td>
                              <td style={{ padding: '7px 12px', textAlign: 'center' }}>
                                {brokerDriven ? (
                                  <div title="Auto-set to the sum of per-broker limits below. Clear broker limits to edit manually."
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, width: 72, justifyContent: 'center',
                                      padding: '5px 8px', border: '1.5px solid #2563eb', borderRadius: 6,
                                      fontSize: 12, fontWeight: 700, color: '#1e40af', background: '#eff6ff' }}>
                                    🔒 {bSum}
                                  </div>
                                ) : (
                                  <NumCell value={s.max_lots} onChange={v => setGradeSetting(g, 'max_lots', v)} placeholder="0" />
                                )}
                              </td>
                              <td style={{ padding: '7px 12px', textAlign: 'center' }}>
                                <NumCell value={s.rate_min} onChange={v => setGradeSetting(g, 'rate_min', v)} placeholder="0" />
                              </td>
                              <td style={{ padding: '7px 12px', textAlign: 'center' }}>
                                <NumCell value={s.rate_max} onChange={v => setGradeSetting(g, 'rate_max', v)} placeholder="0" />
                              </td>
                              <td style={{ padding: '7px 12px', textAlign: 'center' }}>
                                <input 
                                  type="date" 
                                  value={s.date_before || ''} 
                                  onChange={e => setGradeSetting(g, 'date_before', e.target.value)}
                                  style={{ 
                                    width: 130, 
                                    padding: '5px 8px', 
                                    border: '1.5px solid #cbd5e0', 
                                    borderRadius: 6, 
                                    fontSize: 12 
                                  }} 
                                />
                              </td>
                              <td style={{ padding: '7px 12px', textAlign: 'center' }}>
                                <NumCell value={s.bags_from} onChange={v => setGradeSetting(g, 'bags_from', v)} placeholder="0" />
                              </td>
                              <td style={{ padding: '7px 12px', textAlign: 'center' }}>
                                <NumCell value={s.bags_to} onChange={v => setGradeSetting(g, 'bags_to', v)} placeholder="0" />
                              </td>
                              <td style={{ padding: '7px 12px', textAlign: 'center' }}>
                                <NumCell value={s.nwt_from} onChange={v => setGradeSetting(g, 'nwt_from', v)} placeholder="0" />
                              </td>
                              <td style={{ padding: '7px 12px', textAlign: 'center' }}>
                                <NumCell value={s.nwt_to} onChange={v => setGradeSetting(g, 'nwt_to', v)} placeholder="0" />
                              </td>
                              <td style={{ padding: '7px 12px', textAlign: 'center' }}>
                                <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                                  {(() => {
                                    const brokerCount = Object.keys(gradeBrokerLots[g] || {}).length;
                                    const open = expandedBrokerGrade === g;
                                    return (
                                      <button
                                        onClick={() => setExpandedBrokerGrade(open ? null : g)}
                                        title="Set per-broker lot limits for this grade (Filter 1)"
                                        style={{
                                          padding: '4px 8px', fontSize: 11,
                                          background: brokerCount > 0 ? '#dbeafe' : '#f0f4f8',
                                          border: `1px solid ${brokerCount > 0 ? '#2563eb' : '#cbd5e0'}`,
                                          borderRadius: 4, cursor: 'pointer',
                                          color: brokerCount > 0 ? '#1e40af' : '#555', fontWeight: 600
                                        }}>
                                        {open ? '▲ Brokers' : `▾ Brokers${brokerCount > 0 ? ` (${brokerCount})` : ''}`}
                                      </button>
                                    );
                                  })()}
                                  {i < selectedGrades.length - 1 && (
                                    <button
                                      onClick={() => copyToAllGradesBelow(g)}
                                      title="Copy this row's settings to all grades below"
                                      style={{
                                        padding: '4px 8px', fontSize: 11, background: '#f0f4f8',
                                        border: '1px solid #cbd5e0', borderRadius: 4,
                                        cursor: 'pointer', color: '#555', fontWeight: 600
                                      }}>
                                      ⬇ Copy Below
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                            {expandedBrokerGrade === g && (
                              <tr style={{ background: '#f8fbff' }}>
                                <td colSpan={10} style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0' }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: '#1e40af', marginBottom: 4 }}>
                                    Per-broker lot limit for {g} (Filter 1)
                                  </div>
                                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>
                                    Set how many lots each broker may contribute for this grade. Blank or 0 = no broker-specific limit (only the grade Max Lots = {gradeSettings[g]?.max_lots || 0} applies). The grade total still caps the overall count.
                                  </div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                                    {allBrokers.length === 0 ? (
                                      <div style={{ fontSize: 12, color: '#aaa' }}>No brokers available. Import a catalogue first.</div>
                                    ) : allBrokers.map(b => (
                                      <div key={b} style={{
                                        display: 'flex', alignItems: 'center', gap: 6,
                                        padding: '4px 8px', background: '#fff',
                                        border: '1.5px solid #e2e8f0', borderRadius: 6
                                      }}>
                                        <span style={{ fontSize: 12, color: '#374151' }}>{b}</span>
                                        <NumCell
                                          width={56}
                                          value={(gradeBrokerLots[g] || {})[b]}
                                          onChange={v => setBrokerLot(g, b, v)}
                                          placeholder="—"
                                        />
                                      </div>
                                    ))}
                                  </div>
                                  {Object.keys(gradeBrokerLots[g] || {}).length > 0 && (
                                    <div style={{ fontSize: 11, color: '#1e40af', marginTop: 8 }}>
                                      Limits set: {Object.entries(gradeBrokerLots[g]).map(([br, n]) => `${br}=${n}`).join(', ')}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: '#f0f4f8', fontWeight: 700 }}>
                          <td style={{ padding: '7px 12px', fontSize: 12, color: '#444' }}>Total Slots</td>
                          <td style={{ padding: '7px 12px', textAlign: 'center', color: '#1a7a4a', fontSize: 14 }}>{totalSlots}</td>
                          <td colSpan={8}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}

                {/* Skip dup BGG — Filter 1 only */}
                <div style={{ marginTop: 14, padding: '10px 14px', background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={skipDupBGG}
                      onChange={e => setSkipDupBGG(e.target.checked)}
                      style={{ width: 16, height: 16 }}
                    />
                    <strong>Skip duplicate Garden+Grade in Filter 1 (mark first lot only)</strong>
                  </label>
                  <div style={{ fontSize: 11, color: '#166534', marginLeft: 24, marginTop: 4 }}>
                    Applies to Grade Settings (Filter 1) above only. If multiple lots have the same Garden+Grade, only the first lot is marked. Filter 2 has its own "one lot per grade+garden" option.
                  </div>
                </div>

                {/* Skip blank LSP — Filter 1 only */}
                <div style={{ marginTop: 10, padding: '10px 14px', background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={skipBlankLsp}
                      onChange={e => setSkipBlankLsp(e.target.checked)}
                      style={{ width: 16, height: 16 }}
                    />
                    <strong>Skip lots when Last Sale Price (L.S.P.) is blank (Filter 1 only)</strong>
                  </label>
                  <div style={{ fontSize: 11, color: '#166534', marginLeft: 24, marginTop: 4 }}>
                    ✓ Enabled by default. Applies to Grade Settings (Filter 1) only. Lots with blank L.S.P. will not be marked by Filter 1. Filter 2 (Grade-Garden Mapping) is not affected — it always marks regardless of L.S.P.
                  </div>
                </div>
              </Card>

              {/* Section 2: Grade-Garden Mapping */}
              <Card style={{ padding: 16 }}>
                <SectionTitle n="2">Grade-Garden Mapping (Filter 2)</SectionTitle>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>
                  Select one or more grades below, then select gardens to map to ALL selected grades simultaneously.
                </div>
                
                <div style={{ marginBottom: 12, padding: 10, background: '#fef3c7', borderRadius: 6, border: '1.5px solid #f59e0b' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                    <input 
                      type="checkbox" 
                      checked={oneLotPerGradeGarden} 
                      onChange={e => setOneLotPerGradeGarden(e.target.checked)} 
                      style={{ width: 16, height: 16 }} 
                    />
                    <strong>Mark only ONE lot per Grade+Garden combination (Filter 2)</strong>
                  </label>
                  <div style={{ fontSize: 11, color: '#92400e', marginLeft: 24, marginTop: 4 }}>
                    When enabled: Only the FIRST matching lot for each Grade+Garden combination will be marked in Filter 2.
                  </div>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#444', marginBottom: 6 }}>
                    Select grade(s) to map gardens:
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    {allGrades.map(grade => {
                      const mappedCount = (gradeGardenMap[grade] || []).length;
                      const isSelected = selectedGradesForGarden.includes(grade);
                      const mappedGardens = gradeGardenMap[grade] || [];
                      
                      return (
                        <div
                          key={grade}
                          onClick={() => toggleGradeForGardenMapping(grade)}
                          title={mappedCount > 0 ? `Gardens: ${mappedGardens.join(', ')}` : 'No gardens mapped'}
                          style={{
                            padding: '4px 10px',
                            borderRadius: 99,
                            fontSize: 12,
                            cursor: 'pointer',
                            background: isSelected ? '#dbeafe' : '#f8fafc',
                            border: `1.5px solid ${isSelected ? '#2563eb' : mappedCount > 0 ? '#16a34a' : '#e2e8f0'}`,
                            color: isSelected ? '#1e40af' : mappedCount > 0 ? '#166534' : '#888',
                            fontWeight: isSelected || mappedCount > 0 ? 600 : 400
                          }}>
                          {grade}
                          {mappedCount > 0 && ` (${mappedCount})`}
                        </div>
                      );
                    })}
                  </div>
                  {selectedGradesForGarden.length > 0 && (
                    <div style={{ fontSize: 11, color: '#2563eb', fontStyle: 'italic', marginBottom: 8 }}>
                      Mapping gardens for <strong>{selectedGradesForGarden.length} grade(s)</strong>: {selectedGradesForGarden.join(', ')}
                    </div>
                  )}
                  
                  {/* Show currently mapped gardens for all grades */}
                  {Object.keys(gradeGardenMap).some(g => (gradeGardenMap[g] || []).length > 0) && (
                    <div style={{ 
                      marginTop: 12, 
                      padding: 10, 
                      background: '#f0fdf4', 
                      border: '1px solid #86efac', 
                      borderRadius: 6,
                      fontSize: 11
                    }}>
                      <div style={{ fontWeight: 700, color: '#166534', marginBottom: 6 }}>
                        Currently Mapped Gardens:
                      </div>
                      {Object.entries(gradeGardenMap)
                        .filter(([_, gardens]) => gardens && gardens.length > 0)
                        .map(([grade, gardens]) => (
                          <div key={grade} style={{ marginBottom: 4, color: '#15803d' }}>
                            <strong>{grade}:</strong> {gardens.join(', ')}
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                {selectedGradesForGarden.length > 0 ? (
                  <>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
                      <input 
                        value={gSearch} 
                        onChange={e => setGSearch(e.target.value)} 
                        placeholder="Search gardens…"
                        style={{ flex: 1, padding: '7px 10px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} 
                      />
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => {
                          setGradeGardenMap(prev => {
                            const updated = { ...prev };
                            selectedGradesForGarden.forEach(grade => {
                              updated[grade] = [...filteredGardens];
                            });
                            return updated;
                          });
                        }}
                      >
                        Select All
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => {
                          setGradeGardenMap(prev => {
                            const updated = { ...prev };
                            selectedGradesForGarden.forEach(grade => {
                              updated[grade] = [];
                            });
                            return updated;
                          });
                        }}
                      >
                        Clear
                      </Button>
                    </div>
                    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', maxHeight: 200, overflowY: 'auto' }}>
                      {filteredGardens.length === 0 ? (
                        <div style={{ color: '#aaa', fontSize: 13 }}>
                          No gardens available for selected grade(s).
                        </div>
                      ) : (
                        filteredGardens.map(g => chip(
                          isGardenSelectedInAnyGrade(g),
                          () => toggleGardenForGrades(g),
                          g
                        ))
                      )}
                    </div>
                  </>
                ) : (
                  <div style={{ textAlign: 'center', padding: 30, color: '#aaa', fontSize: 13 }}>
                    Select one or more grades above to map gardens
                  </div>
                )}
              </Card>

              {/* Section 3: Brokers */}
              <Card style={{ padding: 16 }}>
                <SectionTitle n="3">Broker List</SectionTitle>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>
                  Leave empty to include all brokers
                </div>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  {allBrokers.map(b => chip(
                    brokerList.includes(b),
                    () => toggleBroker(b),
                    b,
                    '#dbeafe',
                    '#1e40af',
                    '#1a3c5e'
                  ))}
                </div>
                {brokerList.length > 0 && (
                  <div style={{ fontSize: 11, color: '#1e40af', marginTop: 6 }}>
                    Selected: {brokerList.join(', ')}
                  </div>
                )}
              </Card>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
