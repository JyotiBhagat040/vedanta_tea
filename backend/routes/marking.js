const router = require('express').Router();
const { pool } = require('../db/pool');

// ── Normalise: trim, collapse spaces, uppercase ───────────────────────────────
// "  south wynaad  " → "SOUTH WYNAAD"   "BP " → "BP"   null/undefined → ""
function norm(v) {
  if (v == null) return '';
  return String(v).trim().replace(/\s+/g, ' ').toUpperCase();
}

// norm() applied to a value that may be null/undefined — returns null if empty
function normOrNull(v) {
  const n = norm(v);
  return n === '' ? null : n;
}

// Ensure ai_markings table exists (separate from markings)
async function ensureAiTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_markings (
      id SERIAL PRIMARY KEY,
      sale_no TEXT,
      party_id TEXT,
      party_name TEXT,
      party_code TEXT,
      garden TEXT,
      grade TEXT,
      mark TEXT,
      broker TEXT,
      bags TEXT,
      net_wt TEXT,
      suggested_price TEXT,
      final_price TEXT,
      invoice TEXT,
      origin TEXT,
      catalogue_id TEXT,
      batch_name TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});
  // Migration: fix column types if table was created with INTEGER
  await pool.query(`ALTER TABLE ai_markings ALTER COLUMN party_id TYPE TEXT USING party_id::TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE ai_markings ALTER COLUMN catalogue_id TYPE TEXT USING catalogue_id::TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE ai_markings ALTER COLUMN bags TYPE TEXT USING bags::TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE ai_markings ALTER COLUMN net_wt TYPE TEXT USING net_wt::TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE ai_markings ALTER COLUMN suggested_price TYPE TEXT USING suggested_price::TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE ai_markings ALTER COLUMN final_price TYPE TEXT USING final_price::TEXT`).catch(() => {});
}
ensureAiTable();

function calcSuggested(lot) {
  if (lot.min_deal_price && lot.max_deal_price)
    return ((parseFloat(lot.min_deal_price) + parseFloat(lot.max_deal_price)) / 2).toFixed(2);
  return null;
}

async function fetchAllLots(sale_no, batch_name) {
  const hasBatch = batch_name !== undefined && batch_name !== '';
  const batchWhere = hasBatch ? ` AND COALESCE(c.batch_name, '') = $2` : '';
  const params = hasBatch ? [sale_no, batch_name] : [sale_no];
  const { rows } = await pool.query(`
    SELECT
      c.invoice_no                        AS lot_no,
      c.invoice_no_raw                    AS invoice,
      TRIM(UPPER(c.mark))                 AS garden,
      TRIM(UPPER(c.garden))               AS origin,
      TRIM(UPPER(c.grade))                AS grade,
      c.bags,
      c.net_wt,
      TRIM(UPPER(c.broker))               AS broker,
      c.sale_no,
      c.last_sale_price,
      c.week_date                         AS gp_date,
      c.id                                AS catalogue_id,
      COALESCE(c.batch_name, '')          AS batch_name,
      sp.min_deal_price,
      sp.max_deal_price
    FROM catalogue c
    LEFT JOIN (
      SELECT
        sale_no,
        TRIM(UPPER(mark))  AS mark_norm,
        TRIM(UPPER(grade)) AS grade_norm,
        MIN(deal_price)    AS min_deal_price,
        MAX(deal_price)    AS max_deal_price
      FROM sold_list
      WHERE deal_price IS NOT NULL
      GROUP BY sale_no, TRIM(UPPER(mark)), TRIM(UPPER(grade))
    ) sp ON sp.sale_no = c.sold_list_sale_no
        AND sp.mark_norm = TRIM(UPPER(c.mark))
        AND sp.grade_norm = TRIM(UPPER(c.grade))
    WHERE c.sale_no = $1${batchWhere}
    ORDER BY TRIM(UPPER(c.broker)),
      REGEXP_REPLACE(c.invoice_no,'[^0-9]','','g')::INTEGER NULLS LAST,
      c.invoice_no
  `, params);
  return rows;
}

// ── Build O(1) lookup indexes ─────────────────────────────────────────────────
// All keys are already normalised (TRIM+UPPER) because fetchAllLots normalises
// garden, grade, broker in the SELECT. Keys stored in lowercase for lookup.
function buildLotIndexes(allLots) {
  const byGrade       = new Map();  // "bp"              → [lot, ...]
  const byGradeGarden = new Map();  // "bp__south wynaad" → [lot, ...]

  for (const lot of allLots) {
    if (!lot.grade) continue;
    const gk = (lot.grade || '').toLowerCase();                          // already trimmed/upper from SQL
    if (!byGrade.has(gk)) byGrade.set(gk, []);
    byGrade.get(gk).push(lot);

    if (lot.garden) {
      const ggk = `${gk}__${(lot.garden || '').toLowerCase()}`;
      if (!byGradeGarden.has(ggk)) byGradeGarden.set(ggk, []);
      byGradeGarden.get(ggk).push(lot);
    }
  }
  return { byGrade, byGradeGarden };
}

// ── computeEligible ───────────────────────────────────────────────────────────
// All party-stored values (grade keys, garden names, broker names) were normalised
// by mapping.js on save. Lot values are normalised by fetchAllLots.
// So every comparison is normalised-lowercase → no case/space mismatch.
function computeEligible(pm, indexes) {
  const { byGrade, byGradeGarden } = indexes;

  const gradeSamples   = pm.grade_samples         || {};
  const gradeRanges    = pm.grade_ranges          || {};
  const gradeBags      = pm.grade_bags            || {};
  const gradeNwt       = pm.grade_nwt             || {};
  // Normalise broker_list entries at runtime in case old data wasn't normalised
  const brokerList     = (pm.broker_list || []).map(norm).filter(Boolean);
  const brokerSet      = new Set(brokerList.map(b => b.toLowerCase()));
  const hasBrokerFilter = brokerList.length > 0;
  const skipLsp        = pm.skip_blank_lsp !== false;
  const skipDupBGG     = pm.skip_dup_broker_garden_grade || false;
  const gradeGardenMap = pm.grade_garden_mapping  || {};
  const oneLotPerGG    = pm.one_lot_per_grade_garden || false;

  // lot.broker, lot.grade, lot.garden are already TRIM+UPPER from fetchAllLots
  // Compare lowercase on both sides for safety

  // Filter 1 check — rate/bags/NWT/LSP/broker all apply
  const passesF1 = (lot, gradeKey) => {
    if (hasBrokerFilter && !brokerSet.has((lot.broker || '').toLowerCase())) return false;

    const lotMin = lot.min_deal_price ? parseFloat(lot.min_deal_price) : null;
    const lotMax = lot.max_deal_price ? parseFloat(lot.max_deal_price) : null;
    const hasSold = lotMin !== null || lotMax !== null;

    // Skip blank LSP: lot has no sold_list deal price AND no last_sale_price
    if (skipLsp && !hasSold && !lot.last_sale_price) return false;

    const rng = gradeRanges[gradeKey] || gradeRanges[norm(gradeKey)] || {};
    if (rng.min > 0 || rng.max > 0) {
      if (hasSold) {
        const lMn = lotMin ?? lotMax, lMx = lotMax ?? lotMin;
        if (lMx < (rng.min || 0)) return false;
        if (lMn > (rng.max || Infinity)) return false;
      } else {
        if (skipLsp) return false;
      }
    }

    if (rng.date_before) {
      if (!lot.gp_date) return false;
      if (new Date(lot.gp_date) > new Date(rng.date_before)) return false;
    }

    const bags = gradeBags[gradeKey] || gradeBags[norm(gradeKey)] || {};
    if (bags.from > 0 && lot.bags && parseInt(lot.bags) < bags.from) return false;
    if (bags.to   > 0 && lot.bags && parseInt(lot.bags) > bags.to)   return false;

    const nwt = gradeNwt[gradeKey] || gradeNwt[norm(gradeKey)] || {};
    if (nwt.from > 0 && lot.net_wt && parseFloat(lot.net_wt) < nwt.from) return false;
    if (nwt.to   > 0 && lot.net_wt && parseFloat(lot.net_wt) > nwt.to)   return false;

    return true;
  };

  // Filter 2 check — ONLY broker filter applies.
  // Rate, bags, NWT, LSP, date filters are ALL ignored — Filter 2 marks
  // purely on garden+grade mapping regardless of price or quantity.
  const passesF2 = (lot) => {
    if (hasBrokerFilter && !brokerSet.has((lot.broker || '').toLowerCase())) return false;
    return true;
  };

  // ── Filter 1: top-N lots per grade ───────────────────────────────────────────
  // Include all lots that pass rate/bag/NWT/LSP filters.
  // The frontend enforces both:
  //   (a) max_lots as a total placement cap per party (1 slot = 1 placement)
  //   (b) BGG dedup per party (skip_bgg=ON → 1 placement per broker+garden+grade)
  // Include up to limit×10 lots so all parties have enough eligible lots.
  const f1Ids = new Set();
  const brokerLots = pm.grade_broker_lots || {};
  for (const [rawGrade, maxLots] of Object.entries(gradeSamples)) {
    const limit = parseInt(maxLots) || 0;
    if (!limit) continue;
    const gk = norm(rawGrade).toLowerCase();
    const gradeLots = byGrade.get(gk) || [];

    // Per-broker limits for this grade (keys normalised uppercase by mapping.js)
    const gBrokers = brokerLots[norm(rawGrade)] || brokerLots[rawGrade] || {};
    const hasGradeBrokerLimits = gBrokers && Object.keys(gBrokers).length > 0;

    if (hasGradeBrokerLimits) {
      // Each listed broker gets its OWN eligibility quota (limit×10) so that
      // brokers later in the list (PTM) aren't crowded out of the eligible set
      // by earlier brokers (JT) consuming a shared pool. Only listed brokers
      // are eligible; unlisted brokers are excluded from Filter 1 for this grade.
      const perBrokerCount = {}; // brokerKey(lowercase) → count added
      const brokerCap = {};      // brokerKey(lowercase) → limit×10 headroom
      for (const [bk, bl] of Object.entries(gBrokers)) {
        brokerCap[bk.toLowerCase()] = (parseInt(bl) || 0) * 10;
      }
      for (const lot of gradeLots) {
        const bkey = (lot.broker || '').toLowerCase();
        if (!(bkey in brokerCap)) continue;               // broker not listed → skip
        if ((perBrokerCount[bkey] || 0) >= brokerCap[bkey]) continue;
        if (!passesF1(lot, rawGrade)) continue;
        f1Ids.add(lot.catalogue_id);
        perBrokerCount[bkey] = (perBrokerCount[bkey] || 0) + 1;
      }
    } else {
      // No broker limits → original shared-pool behaviour, unchanged.
      let count = 0;
      for (const lot of gradeLots) {
        if (!passesF1(lot, rawGrade)) continue;
        f1Ids.add(lot.catalogue_id);
        count++;
        if (count >= limit * 10) break; // generous cap — frontend applies exact limit
      }
    }
  }


  // ── Filter 2: grade-garden mapping ───────────────────────────────────────────
  // Filter 2 is INDEPENDENT of skip_blank_lsp — LSP check never applies here.
  // Broker filter still applies. oneLotPerGG controls 1-lot vs all-lots per grade+garden.
  const f2Ids = new Set();
  for (const [rawGrade, gardens] of Object.entries(gradeGardenMap)) {
    if (!Array.isArray(gardens) || !gardens.length) continue;
    const gk = norm(rawGrade).toLowerCase();
    for (const rawGarden of gardens) {
      const gardenKey = norm(rawGarden).toLowerCase();
      const ggk = `${gk}__${gardenKey}`;
      const gardenLots = byGradeGarden.get(ggk) || [];
      if (!gardenLots.length) continue;

      if (oneLotPerGG) {
        // One lot per grade+garden: first lot that passes broker filter
        const first = gardenLots.find(l => passesF2(l));
        if (first) f2Ids.add(first.catalogue_id);
      } else {
        // All lots for this grade+garden that pass broker filter
        for (const l of gardenLots) {
          if (passesF2(l)) f2Ids.add(l.catalogue_id);
        }
      }
    }
  }

  // Return both sets separately so the frontend can apply different rules
  return { f1Ids, f2Ids, oneLotPerGG };
}

// ── POST /api/marking/preview ─────────────────────────────────────────────────
router.post('/preview', async (req, res) => {
  const { party_ids = [], sale_no, batch_name } = req.body;
  if (!sale_no) return res.status(400).json({ error: 'sale_no required' });
  try {
    const t0 = Date.now();
    const allLots = await fetchAllLots(sale_no, batch_name || '');
    const tFetch = Date.now();

    if (!party_ids.length) {
      return res.json({
        lots: allLots.map(l => ({ ...l, suggested_price: calcSuggested(l), party_slots_array: [] })),
        parties: []
      });
    }

    const { rows: pms } = await pool.query(
      `SELECT p.id, p.party_name, p.party_code, p.party_type,
         p.grade_samples, p.grade_ranges, p.grade_bags, p.grade_nwt,
         p.broker_list, p.skip_blank_lsp, p.skip_dup_broker_garden_grade,
         p.grade_garden_mapping, p.one_lot_per_grade_garden,
         p.grade_broker_lots
       FROM parties p
       WHERE p.id=ANY($1)
       ORDER BY p.party_type NULLS LAST, p.party_code`,
      [party_ids]
    );

    // Sort: A → B → C → alphabetical within each type
    const typeOrder = t => ({ A: 0, B: 1, C: 2 }[t] ?? 3);
    const sortedPms = [...pms].sort((a, b) => {
      const td = typeOrder(a.party_type || 'C') - typeOrder(b.party_type || 'C');
      if (td !== 0) return td;
      return (a.party_code || '').localeCompare(b.party_code || '');
    });

    const indexes = buildLotIndexes(allLots);

    // eligibleMap stores { f1Ids, f2Ids, oneLotPerGG } per party
    const eligibleMap = new Map();
    for (const pm of sortedPms) {
      eligibleMap.set(pm.id, computeEligible(pm, indexes));
    }
    const tCompute = Date.now();

    // Build result — Filters 1 and 2 are FULLY INDEPENDENT.
    // in_f1 → eligible via Filter 1 (grade_samples): max_lots cap + GG dedup apply
    // in_f2 → eligible via Filter 2 (grade-garden mapping): no cap, oneLotPerGG applies
    // A lot can be in_f1, in_f2, or both — each filter acts on its own eligible set.
    // via_f2 kept for backward compat, now always equals in_f2.
    const result = allLots.map(lot => {
      const eligible = [];
      for (const pm of sortedPms) {
        const em = eligibleMap.get(pm.id);
        if (!em) continue;
        const inF1 = em.f1Ids.has(lot.catalogue_id);
        const inF2 = em.f2Ids.has(lot.catalogue_id);
        if (!inF1 && !inF2) continue;
        eligible.push({
          party_id: pm.id,
          party_name: pm.party_name,
          party_code: pm.party_code,
          party_type: pm.party_type || 'C',
          in_f1: inF1,
          in_f2: inF2,
          via_f2: inF2,                  // backward compat
          one_lot_per_gg: em.oneLotPerGG
        });
      }
      return { ...lot, suggested_price: calcSuggested(lot), party_slots_array: eligible };
    });

    const parties = sortedPms.map((pm, i) => {
      // Sum total max_lots across all grades for this party.
      // When a grade has per-broker limits set, that grade's effective cap is
      // the SUM of its broker limits (broker sum drives max_lots). Otherwise
      // the grade's own max_lots (grade_samples) is used.
      const gradeSamples = pm.grade_samples || {};
      const brokerLots   = pm.grade_broker_lots || {};
      const allGradeKeys = new Set([
        ...Object.keys(gradeSamples),
        ...Object.keys(brokerLots)
      ]);
      let totalMaxLots = 0;
      for (const g of allGradeKeys) {
        const brk = brokerLots[g] || {};
        const brokerSum = Object.values(brk).reduce((s, v) => s + (parseInt(v) || 0), 0);
        totalMaxLots += brokerSum > 0 ? brokerSum : (parseInt(gradeSamples[g]) || 0);
      }
      return {
        key: `P${i+1}`,
        party_id: pm.id,
        party_name: pm.party_name,
        party_code: pm.party_code,
        party_type: pm.party_type || 'C',
        skip_bgg: pm.skip_dup_broker_garden_grade || false,
        max_lots: totalMaxLots,   // cap on total placements across all grades
        grade_broker_lots: brokerLots,  // per-grade per-broker caps for markF1
        total_eligible: (eligibleMap.get(pm.id)?.f1Ids.size || 0) + (eligibleMap.get(pm.id)?.f2Ids.size || 0)
      };
    });

    const tEnd = Date.now();
    console.log(`Preview: ${party_ids.length} parties × ${allLots.length} lots | DB:${tFetch-t0}ms Compute:${tCompute-tFetch}ms Build:${tEnd-tCompute}ms Total:${tEnd-t0}ms`);
    res.json({ lots: result, parties });
  } catch (e) {
    console.error('preview error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/marking/saved-slots ──────────────────────────────────────────────
router.get('/saved-slots', async (req, res) => {
  const { sale_no, batch_name } = req.query;
  if (!sale_no) return res.status(400).json({ error: 'sale_no required' });
  const hasBatch = batch_name !== undefined && batch_name !== '';
  const batchWhere = hasBatch ? ` AND COALESCE(m.batch_name, '') = $2` : '';
  const params = hasBatch ? [sale_no, batch_name] : [sale_no];
  try {
    const { rows: withCid } = await pool.query(
      `SELECT m.catalogue_id, m.party_id, p.party_name, p.party_code
       FROM markings m
       LEFT JOIN parties p ON p.id = m.party_id
       WHERE m.sale_no=$1 AND m.status!='skipped' AND m.catalogue_id IS NOT NULL${batchWhere}
       ORDER BY m.created_at`,
      params
    );

    const { rows: legacy } = await pool.query(
      `SELECT m.id, m.garden, m.grade, m.broker, m.party_id, p.party_name, p.party_code
       FROM markings m
       LEFT JOIN parties p ON p.id = m.party_id
       WHERE m.sale_no=$1 AND m.status!='skipped' AND m.catalogue_id IS NULL${batchWhere}
       ORDER BY m.created_at`,
      params
    );

    const grouped = {};
    for (const r of withCid) {
      const cid = String(r.catalogue_id);
      if (!grouped[cid]) grouped[cid] = [];
      if (grouped[cid].length < 5)
        grouped[cid].push({ party_id: r.party_id, party_name: r.party_name, party_code: r.party_code });
    }

    if (legacy.length > 0) {
      const { rows: cats } = await pool.query(
        `SELECT id, TRIM(UPPER(mark)) AS garden, TRIM(UPPER(grade)) AS grade, TRIM(UPPER(broker)) AS broker FROM catalogue WHERE sale_no=$1`,
        [sale_no]
      );
      const catMap = {};
      cats.forEach(c => {
        const key = `${c.garden}__${c.grade}__${c.broker}`;
        if (!catMap[key]) catMap[key] = c.id;
      });
      for (const r of legacy) {
        const key = `${norm(r.garden)}__${norm(r.grade)}__${norm(r.broker)}`;
        const cid = catMap[key];
        if (!cid) continue;
        const cidStr = String(cid);
        if (!grouped[cidStr]) grouped[cidStr] = [];
        if (grouped[cidStr].length < 5)
          grouped[cidStr].push({ party_id: r.party_id, party_name: r.party_name, party_code: r.party_code });
      }
    }
    res.json(grouped);
  } catch (e) {
    console.error('saved-slots error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/marking/check-duplicate ────────────────────────────────────────
router.post('/check-duplicate', async (req, res) => {
  const { party_id, sale_no, garden, grade } = req.body;
  if (!party_id || !sale_no) return res.status(400).json({ error: 'party_id and sale_no required' });
  try {
    const { rows } = await pool.query(
      `SELECT m.id, c.invoice_no AS lot_no
       FROM markings m
       LEFT JOIN catalogue c ON c.id = m.catalogue_id
       WHERE m.party_id=$1 AND m.sale_no=$2
         AND TRIM(UPPER(m.garden))=TRIM(UPPER($3))
         AND TRIM(UPPER(m.grade))=TRIM(UPPER($4))
         AND m.status!='skipped'
       LIMIT 5`,
      [party_id, sale_no, garden || '', grade || '']
    );
    res.json(rows.length > 0
      ? { exists: true, lot_nos: rows.map(r => r.lot_no).filter(Boolean).join(', ') }
      : { exists: false });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/marking/clear-catalogue-ids ─────────────────────────────────────
// Bulk delete: removes all markings for a list of catalogue_ids in one query.
// Used by frontend save() to delete cleared lots without firing per-lot requests.
router.post('/clear-catalogue-ids', async (req, res) => {
  const { sale_no, catalogue_ids } = req.body;
  if (!sale_no || !Array.isArray(catalogue_ids) || !catalogue_ids.length)
    return res.json({ success: true, deleted: 0 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rowCount } = await client.query(
      `DELETE FROM markings WHERE sale_no=$1 AND (catalogue_id::text = ANY($2::text[]))`,
      [sale_no, catalogue_ids.map(String)]
    );
    await client.query('COMMIT');
    res.json({ success: true, deleted: rowCount });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// ── POST /api/marking/save-single ─────────────────────────────────────────────
router.post('/save-single', async (req, res) => {
  const { sale_no, catalogue_id, party_id, party_name, party_code, action } = req.body;
  if (!sale_no || !catalogue_id) return res.status(400).json({ error: 'sale_no and catalogue_id required' });
  try {
    if (action === 'remove-all') {
      // Delete ALL party markings for this lot in this sale (used when a slot row is fully cleared)
      const { rowCount } = await pool.query(
        `DELETE FROM markings WHERE catalogue_id::text=$1 AND sale_no=$2`,
        [String(catalogue_id), sale_no]
      );
      return res.json({ success: true, action: 'removed-all', deleted: rowCount });
    }
    if (action === 'remove') {
      if (!party_id) return res.status(400).json({ error: 'party_id required for remove' });
      const { rowCount } = await pool.query(
        `DELETE FROM markings WHERE party_id=$1 AND catalogue_id::text=$2 AND sale_no=$3`,
        [party_id, String(catalogue_id), sale_no]
      );
      return res.json({ success: true, action: 'removed', deleted: rowCount });
    }
    if (!party_id || !party_name || !party_code)
      return res.status(400).json({ error: 'party_id, party_name, party_code required' });

    const { rows: ex } = await pool.query(
      `SELECT id FROM markings WHERE party_id=$1 AND catalogue_id=$2 AND sale_no=$3 AND status!='skipped'`,
      [party_id, catalogue_id, sale_no]
    );
    if (ex.length > 0) return res.json({ success: true, action: 'already_exists' });

    const { rows: lots } = await pool.query(
      `SELECT TRIM(UPPER(c.mark)) AS garden, TRIM(UPPER(c.grade)) AS grade,
              TRIM(UPPER(c.broker)) AS broker, c.bags, c.net_wt,
              c.invoice_no_raw AS invoice, TRIM(UPPER(c.garden)) AS origin,
              sp.min_deal_price, sp.max_deal_price
       FROM catalogue c
       LEFT JOIN (
         SELECT sale_no,
                TRIM(UPPER(mark))  AS m,
                TRIM(UPPER(grade)) AS g,
                MIN(deal_price)    AS min_deal_price,
                MAX(deal_price)    AS max_deal_price
         FROM sold_list WHERE deal_price IS NOT NULL
         GROUP BY sale_no, TRIM(UPPER(mark)), TRIM(UPPER(grade))
       ) sp ON sp.sale_no = c.sold_list_sale_no
           AND sp.m = TRIM(UPPER(c.mark))
           AND sp.g = TRIM(UPPER(c.grade))
       WHERE c.id=$1`, [catalogue_id]
    );
    if (!lots.length) return res.status(404).json({ error: 'Lot not found' });
    const lot = lots[0];
    const suggested = (lot.min_deal_price && lot.max_deal_price)
      ? ((parseFloat(lot.min_deal_price) + parseFloat(lot.max_deal_price)) / 2).toFixed(2) : null;
    await pool.query(
      `INSERT INTO markings (sale_no,party_id,party_name,party_code,garden,grade,mark,broker,bags,net_wt,suggested_price,final_price,status,invoice,origin,is_ai_suggestion,catalogue_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'confirmed',$13,$14,false,$15) ON CONFLICT DO NOTHING`,
      [sale_no, party_id, party_name, party_code,
       lot.garden, lot.grade, lot.garden, lot.broker,
       lot.bags, lot.net_wt, suggested, suggested,
       lot.invoice, lot.origin, catalogue_id]
    );
    res.json({ success: true, action: 'saved' });
  } catch (e) {
    console.error('save-single error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/marking/save ────────────────────────────────────────────────────
router.post('/save', async (req, res) => {
  const { markings = [], sale_no, batch_name, is_ai_suggestion } = req.body;
  if (!sale_no || !markings.length) return res.status(400).json({ error: 'Missing data' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let saved = 0, skipped = 0;
    const insertedThisSession = new Set();

    for (const m of markings) {
      const slots = m.party_slots_array || m.final_slots || [];
      // Normalise lot-level string fields once
      const garden = norm(m.garden) || null;
      const grade  = norm(m.grade)  || null;
      const broker = norm(m.broker) || null;
      const origin = norm(m.origin) || null;

      // Delete any party rows for this lot that are NOT in the current slot list.
      // This handles the case where a party was removed from a slot on a lot that still
      // has other parties — the lot stays in allMarkedLots so clear-catalogue-ids skips it,
      // but the removed party's DB row must be deleted here to prevent it coming back on reload.
      const currentPartyIds = slots.filter(s => s?.party_id).map(s => String(s.party_id));
      if (currentPartyIds.length > 0) {
        await client.query(
          `DELETE FROM markings WHERE catalogue_id::text=$1 AND sale_no=$2 AND party_id::text != ALL($3::text[]) AND status!='skipped'`,
          [String(m.catalogue_id), sale_no, currentPartyIds]
        );
      }

      for (const pInfo of slots) {
        if (!pInfo?.party_id) continue;
        const sessionKey = `${pInfo.party_id}__${m.catalogue_id}`;
        if (insertedThisSession.has(sessionKey)) { skipped++; continue; }

        const { rows: ex } = await client.query(
          `SELECT id FROM markings WHERE party_id=$1 AND catalogue_id=$2 AND sale_no=$3 AND status!='skipped'`,
          [pInfo.party_id, m.catalogue_id, sale_no]
        );
        if (ex.length > 0) {
          skipped++;
          insertedThisSession.add(sessionKey);
          continue;
        }

        await client.query(
          `INSERT INTO markings
             (sale_no,party_id,party_name,party_code,garden,grade,mark,broker,
              bags,net_wt,suggested_price,final_price,status,invoice,origin,
              is_ai_suggestion,catalogue_id,batch_name)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'confirmed',$13,$14,$15,$16,$17)
           ON CONFLICT DO NOTHING`,
          [sale_no, pInfo.party_id, pInfo.party_name, pInfo.party_code,
           garden, grade, garden, broker,
           m.bags, m.net_wt, m.suggested_price, m.final_price || m.suggested_price,
           m.invoice || null, origin,
           false, m.catalogue_id, batch_name || '']
        );
        saved++;
        insertedThisSession.add(sessionKey);
      }
    }
    await client.query('COMMIT');
    res.json({ success: true, saved, skipped });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// ── POST /api/marking/apply-ai ────────────────────────────────────────────────
router.post('/apply-ai', async (req, res) => {
  const { party_id, sale_no, suggestions } = req.body;
  if (!party_id || !sale_no || !suggestions?.length)
    return res.status(400).json({ error: 'Required fields missing' });
  try {
    const { rows: party } = await pool.query(`SELECT * FROM parties WHERE id=$1`, [party_id]);
    if (!party[0]) return res.status(404).json({ error: 'Party not found' });
    const pm = party[0];
    let applied = 0, notFound = 0;
    for (const s of suggestions) {
      // Use TRIM+UPPER for matching — broker also normalised
      const { rows: lots } = await pool.query(
        `SELECT c.id AS catalogue_id,
                TRIM(UPPER(c.mark)) AS garden, TRIM(UPPER(c.grade)) AS grade,
                TRIM(UPPER(c.broker)) AS broker,
                c.invoice_no_raw AS invoice, TRIM(UPPER(c.garden)) AS origin,
                c.bags, c.net_wt
         FROM catalogue c
         WHERE c.sale_no=$1
           AND TRIM(UPPER(c.mark))=TRIM(UPPER($2))
           AND TRIM(UPPER(c.grade))=TRIM(UPPER($3))
           AND TRIM(UPPER(c.broker))=TRIM(UPPER($4))
         LIMIT 1`,
        [sale_no, s.garden, s.grade, s.broker]
      );
      if (!lots.length) { notFound++; continue; }
      const lot = lots[0];
      const { rows: ex } = await pool.query(
        `SELECT id FROM markings WHERE party_id=$1 AND catalogue_id=$2 AND status!='skipped'`,
        [party_id, lot.catalogue_id]
      );
      if (ex.length > 0) continue;
      await pool.query(
        `INSERT INTO markings
           (sale_no,party_id,party_name,party_code,garden,grade,mark,broker,
            bags,net_wt,suggested_price,final_price,status,invoice,origin,catalogue_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'confirmed',$13,$14,$15)
         ON CONFLICT DO NOTHING`,
        [sale_no, party_id, pm.party_name, pm.party_code,
         lot.garden, lot.grade, lot.garden, lot.broker,
         lot.bags, lot.net_wt, s.avg_price, s.avg_price,
         lot.invoice, lot.origin, lot.catalogue_id]
      );
      applied++;
    }
    res.json({ success: true, applied, notFound });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/marking/ai-suggest ─────────────────────────────────────────────
router.post('/ai-suggest', async (req, res) => {
  const { party_ids = [], sale_nos, current_sale_no } = req.body;
  if (!party_ids.length) return res.status(400).json({ error: 'party_ids required' });
  try {
    let effectiveSaleNos = sale_nos;
    if (!effectiveSaleNos?.length) {
      const { rows: recent } = await pool.query(
        `SELECT DISTINCT sale_no FROM ai_markings ORDER BY sale_no DESC LIMIT 4`
      );
      effectiveSaleNos = recent.map(r => String(r.sale_no));
    }
    if (!effectiveSaleNos.length) return res.json({ suggestions: [], total: 0, used_sale_nos: [] });

    const { rows: hist } = await pool.query(`
      SELECT m.party_id, m.party_name, m.party_code,
             m.garden, m.grade, m.broker, COUNT(*) AS frequency,
             AVG(m.final_price::numeric) AS avg_price,
             MAX(m.final_price::numeric) AS max_price,
             MIN(m.final_price::numeric) AS min_price
      FROM ai_markings m
      WHERE m.party_id=ANY($1) AND m.sale_no=ANY($2)
      GROUP BY m.party_id, m.party_name, m.party_code, m.garden, m.grade, m.broker
      ORDER BY frequency DESC, avg_price DESC
    `, [party_ids, effectiveSaleNos.map(String)]);

    const targetSale = current_sale_no || (await pool.query('SELECT MAX(sale_no) FROM catalogue')).rows[0].max;
    const { rows: avail } = await pool.query(
      `SELECT DISTINCT TRIM(UPPER(c.mark)) AS garden, TRIM(UPPER(c.grade)) AS grade, TRIM(UPPER(c.broker)) AS broker
       FROM catalogue c WHERE c.sale_no=$1`, [targetSale]
    );
    // availSet keys are normalised
    const availSet = new Set(avail.map(r => `${r.garden}__${r.grade}__${r.broker}`));

    const suggestions = hist
      .filter(h => availSet.has(`${norm(h.garden)}__${norm(h.grade)}__${norm(h.broker)}`))
      .map(h => ({
        party_id: h.party_id, party_name: h.party_name, party_code: h.party_code,
        garden: h.garden, grade: h.grade, broker: h.broker,
        frequency: parseInt(h.frequency),
        avg_price: h.avg_price ? parseFloat(h.avg_price).toFixed(2) : null,
        price_range: h.min_price && h.max_price
          ? `Rs.${parseFloat(h.min_price).toFixed(0)}-${parseFloat(h.max_price).toFixed(0)}` : '—',
        confidence: h.frequency >= 3 ? 'High' : h.frequency >= 2 ? 'Medium' : 'Low'
      }));
    res.json({ suggestions, total: suggestions.length, used_sale_nos: effectiveSaleNos });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/ai-suggest', async (req, res) => {
  const { party_id, weeks = 4 } = req.query;
  if (!party_id) return res.status(400).json({ error: 'party_id required' });
  try {
    const { rows: hist } = await pool.query(`
      SELECT m.garden, m.grade, m.broker, COUNT(*) AS frequency,
             AVG(m.final_price::numeric) AS avg_price,
             MAX(m.final_price::numeric) AS max_price,
             MIN(m.final_price::numeric) AS min_price
      FROM ai_markings m
      WHERE m.party_id=$1
        AND m.created_at >= NOW() - ($2 * INTERVAL '7 days')
      GROUP BY m.garden, m.grade, m.broker
      ORDER BY frequency DESC, avg_price DESC LIMIT 30
    `, [party_id, parseInt(weeks)]);
    const { rows: avail } = await pool.query(
      `SELECT DISTINCT TRIM(UPPER(c.mark)) AS garden, TRIM(UPPER(c.grade)) AS grade, TRIM(UPPER(c.broker)) AS broker
       FROM catalogue c WHERE c.sale_no=(SELECT MAX(sale_no) FROM catalogue)`
    );
    const availSet = new Set(avail.map(r => `${r.garden}__${r.grade}__${r.broker}`));
    const suggestions = hist
      .filter(h => availSet.has(`${norm(h.garden)}__${norm(h.grade)}__${norm(h.broker)}`))
      .map(h => ({
        garden: h.garden, grade: h.grade, broker: h.broker,
        frequency: parseInt(h.frequency),
        avg_price: h.avg_price ? parseFloat(h.avg_price).toFixed(2) : null,
        price_range: h.min_price && h.max_price ? `Rs.${parseFloat(h.min_price).toFixed(0)}-${parseFloat(h.max_price).toFixed(0)}` : '—',
        confidence: h.frequency >= 3 ? 'High' : h.frequency >= 2 ? 'Medium' : 'Low'
      }));
    res.json({ suggestions, total: suggestions.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/marking/ai-saved ────────────────────────────────────────────────
router.get('/ai-saved', async (req, res) => {
  const { sale_no } = req.query;
  try {
    let q = `SELECT m.*, p.party_name, p.party_code FROM ai_markings m
             LEFT JOIN parties p ON p.id::TEXT=m.party_id
             WHERE 1=1`;
    const params = [];
    if (sale_no) { q += ` AND m.sale_no=$1`; params.push(sale_no); }
    q += ' ORDER BY m.created_at DESC LIMIT 500';
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE /api/marking/clear-lot — delete all markings for one catalogue_id ──
// Used by the per-row delete button on MarkingPage.
// Must stay BEFORE /:id route to avoid being swallowed by the wildcard.
router.delete('/clear-lot', async (req, res) => {
  const { sale_no, catalogue_id } = req.query;
  if (!sale_no || !catalogue_id)
    return res.status(400).json({ error: 'sale_no and catalogue_id required' });
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM markings WHERE sale_no=$1 AND catalogue_id::text=$2`,
      [sale_no, String(catalogue_id)]
    );
    res.json({ success: true, deleted: rowCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE /api/marking/clear-all — MUST stay before /:id ────────────────────
router.delete('/clear-all', async (req, res) => {
  const { sale_no, batch_name } = req.query;
  if (!sale_no) return res.status(400).json({ error: 'sale_no required' });
  try {
    const hasBatch = batch_name !== undefined && batch_name !== '';
    const batchWhere = hasBatch ? ` AND COALESCE(batch_name,'')=$2` : '';
    const params = hasBatch ? [sale_no, batch_name] : [sale_no];
    const { rowCount } = await pool.query(
      `DELETE FROM markings WHERE sale_no=$1${batchWhere}`,
      params
    );
    res.json({ success: true, deleted: rowCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/marking/save-ai-ref — save to separate ai_markings table ───────
router.post('/save-ai-ref', async (req, res) => {
  const { markings = [], sale_no, batch_name } = req.body;
  if (!sale_no || !markings.length) return res.status(400).json({ error: 'Missing data' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let saved = 0, skipped = 0;
    const done = new Set();
    for (const m of markings) {
      const slots = m.party_slots_array || m.final_slots || [];
      for (const pInfo of slots) {
        if (!pInfo?.party_id) continue;
        const key = `${pInfo.party_id}__${m.catalogue_id}`;
        if (done.has(key)) { skipped++; continue; }
        const { rows: ex } = await client.query(
          `SELECT id FROM ai_markings WHERE party_id=$1 AND catalogue_id=$2 AND sale_no=$3`,
          [pInfo.party_id, m.catalogue_id, sale_no]
        );
        if (ex.length > 0) { skipped++; done.add(key); continue; }
        await client.query(
          `INSERT INTO ai_markings (sale_no,party_id,party_name,party_code,garden,grade,mark,broker,bags,net_wt,suggested_price,final_price,invoice,origin,catalogue_id,batch_name)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [sale_no, pInfo.party_id, pInfo.party_name, pInfo.party_code,
           norm(m.garden)||null, norm(m.grade)||null, norm(m.garden)||null, norm(m.broker)||null,
           m.bags, m.net_wt, m.suggested_price, m.final_price||m.suggested_price,
           m.invoice||null, norm(m.origin)||null, m.catalogue_id, batch_name||'']
        );
        saved++;
        done.add(key);
      }
    }
    await client.query('COMMIT');
    res.json({ success: true, saved, skipped });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// ── POST /api/marking/clear-ai-refs — delete from ai_markings table ─────────
router.post('/clear-ai-flags', async (req, res) => {
  const { sale_no } = req.body;
  if (!sale_no) return res.status(400).json({ error: 'sale_no required' });
  try {
    const { rowCount } = await pool.query(`DELETE FROM ai_markings WHERE sale_no=$1`, [sale_no]);
    res.json({ success: true, deleted: rowCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/', async (req, res) => {
  const { sale_no, party_id } = req.query;
  let q = `SELECT m.*, p.party_name, p.party_code FROM markings m LEFT JOIN parties p ON p.id=m.party_id WHERE 1=1`;
  const params = []; let i = 1;
  if (sale_no)  { q += ` AND m.sale_no=$${i++}`;  params.push(sale_no); }
  if (party_id) { q += ` AND m.party_id=$${i++}`; params.push(party_id); }
  q += ' ORDER BY m.broker, m.garden, m.grade';
  try { const { rows } = await pool.query(q, params); res.json(rows); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/:id', async (req, res) => {
  const { final_price, status, label_printed } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE markings SET final_price=COALESCE($1,final_price),status=COALESCE($2,status),label_printed=COALESCE($3,label_printed) WHERE id=$4 RETURNING *`,
      [final_price, status, label_printed, req.params.id]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM markings WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

// Return normalised grade list
router.get('/grades/list', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT TRIM(UPPER(grade)) AS grade FROM catalogue WHERE grade IS NOT NULL AND TRIM(grade)!='' ORDER BY 1`
    );
    res.json(rows.map(r => r.grade));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Return normalised broker list
router.get('/brokers/list', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT TRIM(UPPER(broker)) AS broker FROM catalogue WHERE broker IS NOT NULL AND TRIM(broker)!='' ORDER BY 1`
    );
    res.json(rows.map(r => r.broker));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
