const router = require('express').Router();
const { pool } = require('../db/pool');
const XLSX = require('xlsx');
const multer = require('multer');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: process.env.UPLOAD_DIR || './uploads',
  filename: (req, file, cb) => cb(null, `${Date.now()}_${file.originalname}`)
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// ── Normalise a string: trim whitespace, collapse internal spaces, uppercase ──
// Used everywhere a garden name, grade, or broker value is read or stored.
// "  south wynaad  " → "SOUTH WYNAAD"
// "BP " → "BP"
function norm(v) {
  if (v == null) return '';
  return String(v).trim().replace(/\s+/g, ' ').toUpperCase();
}

// Normalise a JSONB object whose keys are grade codes and values are anything
// Normalises only the keys (grades) — values depend on type
function normGradeKeys(obj) {
  if (!obj || typeof obj !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[norm(k)] = v;
  }
  return out;
}

// Normalise grade_garden_mapping: keys = grades, values = arrays of garden names
function normGradeGardenMapping(obj) {
  if (!obj || typeof obj !== 'object') return {};
  const out = {};
  for (const [grade, gardens] of Object.entries(obj)) {
    const normGrade = norm(grade);
    if (Array.isArray(gardens)) {
      out[normGrade] = [...new Set(gardens.map(norm).filter(Boolean))];
    } else {
      out[normGrade] = [];
    }
  }
  return out;
}

// Normalise a broker list array
function normBrokerList(arr) {
  if (!Array.isArray(arr)) return [];
  return [...new Set(arr.map(norm).filter(Boolean))];
}

async function ensureColumns() {
  await pool.query(`
    ALTER TABLE parties
      ADD COLUMN IF NOT EXISTS grade_samples  JSONB DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS grade_ranges   JSONB DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS grade_bags     JSONB DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS grade_nwt      JSONB DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS grade_garden_mapping JSONB DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS broker_list    TEXT[] DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS skip_blank_lsp BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS skip_dup_broker_garden_grade BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS one_lot_per_grade_garden BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS party_type     VARCHAR(1) DEFAULT 'B' CHECK (party_type IN ('A', 'B', 'C')),
      ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE
  `).catch(() => {});
}
ensureColumns();

pool.query(`ALTER TABLE parties ALTER COLUMN skip_dup_broker_garden_grade SET DEFAULT TRUE`).catch(() => {});
pool.query(`UPDATE parties SET skip_dup_broker_garden_grade = TRUE WHERE skip_dup_broker_garden_grade = FALSE`).catch(() => {});

// ── Return normalised (trimmed, no double spaces, uppercase) garden names ─────
router.get('/gardens', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT TRIM(UPPER(mark)) AS garden FROM catalogue WHERE mark IS NOT NULL AND TRIM(mark) != '' ORDER BY 1`
    );
    res.json(rows.map(r => r.garden).filter(Boolean));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Return normalised grade→[gardens] mapping from catalogue ─────────────────
router.get('/grade-gardens', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT TRIM(UPPER(grade)) AS grade, TRIM(UPPER(mark)) AS garden
       FROM catalogue
       WHERE grade IS NOT NULL AND mark IS NOT NULL
         AND TRIM(grade) != '' AND TRIM(mark) != ''
       ORDER BY 1, 2`
    );
    const result = {};
    rows.forEach(r => {
      if (!r.grade || !r.garden) return;
      if (!result[r.grade]) result[r.grade] = [];
      result[r.grade].push(r.garden);
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Return normalised broker list ─────────────────────────────────────────────
router.get('/brokers-available', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT TRIM(UPPER(broker)) AS broker FROM catalogue WHERE broker IS NOT NULL AND TRIM(broker) != '' ORDER BY 1`
    );
    res.json(rows.map(r => r.broker).filter(Boolean));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/party-master/:party_id', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT p.* FROM parties p WHERE p.id=$1`, [req.params.party_id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Save party mapping — normalise ALL string keys/values before storing ──────
router.post('/', async (req, res) => {
  const {
    party_id,
    grade_samples,
    grade_ranges,
    grade_bags,
    grade_nwt,
    grade_garden_mapping,
    broker_list,
    skip_blank_lsp,
    skip_dup_broker_garden_grade,
    one_lot_per_grade_garden,
    party_type
  } = req.body;

  if (!party_id) return res.status(400).json({ error: 'party_id required' });

  const validType = ['A', 'B', 'C'].includes(party_type) ? party_type : 'B';

  // Normalise all grade keys and garden name arrays before storing
  const normSamples   = normGradeKeys(grade_samples   || {});
  const normRanges    = normGradeKeys(grade_ranges     || {});
  const normBags      = normGradeKeys(grade_bags       || {});
  const normNwt       = normGradeKeys(grade_nwt        || {});
  const normMapping   = normGradeGardenMapping(grade_garden_mapping || {});
  const normBrokers   = normBrokerList(broker_list     || []);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE parties SET
        grade_samples=$1,
        grade_ranges=$2,
        grade_bags=$3,
        grade_nwt=$4,
        grade_garden_mapping=$5,
        broker_list=$6,
        skip_blank_lsp=$7,
        skip_dup_broker_garden_grade=$8,
        one_lot_per_grade_garden=$9,
        party_type=$10
       WHERE id=$11`,
      [
        JSON.stringify(normSamples),
        JSON.stringify(normRanges),
        JSON.stringify(normBags),
        JSON.stringify(normNwt),
        JSON.stringify(normMapping),
        normBrokers,
        skip_blank_lsp !== false,
        skip_dup_broker_garden_grade || false,
        one_lot_per_grade_garden || false,
        validType,
        party_id
      ]
    );
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

router.get('/summary/all', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.party_name, p.party_code, p.grade_samples, p.broker_list, p.party_type, p.grade_garden_mapping
       FROM parties p ORDER BY p.party_code`
    );
    const result = rows.map(r => {
      const gs = r.grade_samples || {};
      const ggm = r.grade_garden_mapping || {};
      const total_lots = Object.values(gs).reduce((acc, v) => acc + (parseInt(v) || 0), 0);
      const garden_count = Object.values(ggm).reduce((acc, gardens) => acc + (gardens?.length || 0), 0);
      return { ...r, total_lots, garden_count };
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Import parties from Excel ─────────────────────────────────────────────────
router.post('/import-parties', upload.single('file'), async (req, res) => {
  console.log('=== IMPORT PARTIES ROUTE CALLED ===');
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  let imported = 0, skipped = 0, errors = [];
  try {
    if (!fs.existsSync(req.file.path)) throw new Error(`File not found: ${req.file.path}`);
    const workbook = XLSX.readFile(req.file.path);
    if (!workbook.SheetNames?.length) throw new Error('Excel file has no sheets');
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', blankrows: false });
    if (!rawData.length) throw new Error('Excel file appears to be empty');
    console.log(`Import: ${rawData.length} rows`);

    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row?.length || row.every(cell => !cell)) continue;
      let foundPair = false;

      for (let j = 0; j < row.length - 1; j++) {
        // Normalise both cells on read
        const cell1 = row[j] ? String(row[j]).trim().replace(/\s+/g, ' ') : '';
        const cell2 = row[j + 1] ? String(row[j + 1]).trim().replace(/\s+/g, ' ') : '';
        if (!cell1 || !cell2) continue;

        let code = '', name = '';
        if (cell1.length <= 10 && cell2.length > cell1.length) { code = cell1; name = cell2; }
        else if (cell2.length <= 10 && cell1.length > cell2.length) { code = cell2; name = cell1; }
        else if (cell1.length <= 10) { code = cell1; name = cell2; }
        else continue;

        // Normalise code to uppercase, name preserve case but trim
        code = code.toUpperCase();
        name = name.trim();

        if (code.length > 0 && code.length <= 10 && name.length > 0) {
          try {
            const result = await pool.query(
              `INSERT INTO parties (party_code, party_name, party_type)
               VALUES ($1, $2, 'B')
               ON CONFLICT (party_code) DO NOTHING
               RETURNING id`,
              [code, name]
            );
            if (result.rowCount > 0) { imported++; console.log(`✓ Row ${i+1}: ${code} - ${name}`); }
            else { skipped++; console.log(`⊘ Row ${i+1}: Skipped ${code}`); }
            foundPair = true;
            break;
          } catch (err) {
            errors.push(`Row ${i+1}: ${code} - ${err.message}`);
            skipped++;
          }
        }
      }
      if (!foundPair && row.some(c => c)) console.log(`Row ${i+1}: No valid pair:`, row);
    }

    fs.unlinkSync(req.file.path);
    res.json({
      success: true, imported, skipped,
      errors: errors.length ? errors.slice(0, 10) : undefined,
      message: `Imported ${imported} parties. ${skipped} skipped.`
    });
  } catch (e) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error('IMPORT ERROR:', e);
    res.status(500).json({ error: `Import failed: ${e.message}` });
  }
});

// ── DELETE /api/mapping/party/:id — remove a party and all their settings ────
router.delete('/party/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'id required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Remove garden mappings
    await client.query('DELETE FROM party_garden_mapping WHERE party_id=$1', [id]);
    // Remove markings
    await client.query('DELETE FROM markings WHERE party_id=$1', [id]);
    // Remove the party itself
    const { rowCount } = await client.query('DELETE FROM parties WHERE id=$1', [id]);
    if (rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Party not found' });
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

module.exports = router;
