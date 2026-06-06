const router = require('express').Router();
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const { pool } = require('../db/pool');

const storage = multer.diskStorage({
  destination: process.env.UPLOAD_DIR || './uploads',
  filename: (req, file, cb) => cb(null, `${Date.now()}_${file.originalname}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls', '.csv', '.tsv'].includes(ext)) cb(null, true);
    else cb(new Error('Only .xlsx, .xls, .csv files allowed'));
  }
});

function norm(key) {
  return String(key || '').toLowerCase().trim().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
}
// Normalise a string field value before storing to DB:
// trim whitespace, collapse internal spaces, uppercase.
// "  south wynaad  " -> "SOUTH WYNAAD"   "BP " -> "BP"
// Returns null for empty/null so DB nulls are preserved.
function normStr(v) {
  if (v == null) return null;
  const s = String(v).trim().replace(/\s+/g, ' ').toUpperCase();
  return s === '' ? null : s;
}
function buildMap(row) {
  const map = {};
  for (const k of Object.keys(row)) map[norm(k)] = k;
  return map;
}
function pick(map, row, ...candidates) {
  for (const c of candidates) {
    const key = map[norm(c)];
    if (key !== undefined) {
      const val = row[key];
      if (val !== null && val !== undefined && String(val).trim() !== '') return String(val).trim();
    }
  }
  return null;
}
function parseNum(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (!s || s === '-') return null;
  if (s.includes('-')) {
    const parts = s.split('-').map(p => parseFloat(p.trim())).filter(n => !isNaN(n));
    if (parts.length === 2 && (parts[0] > 0 || parts[1] > 0)) return (parts[0] + parts[1]) / 2;
    if (parts.length === 1 && parts[0] > 0) return parts[0];
    return null;
  }
  const n = parseFloat(s.replace(/[^0-9.]/g, ''));
  return isNaN(n) || n === 0 ? null : n;
}
function parsePriceRange(val) {
  if (!val) return { min: null, max: null };
  const s = String(val).trim();
  if (!s || s === '-' || s === '0 - 0' || s === '0-0') return { min: null, max: null };
  if (s.includes('-')) {
    const parts = s.split('-').map(p => parseFloat(p.trim())).filter(n => !isNaN(n) && n > 0);
    if (parts.length === 2) return { min: parts[0], max: parts[1] };
    if (parts.length === 1) return { min: parts[0], max: parts[0] };
  }
  const n = parseFloat(s);
  return isNaN(n) || n === 0 ? { min: null, max: null } : { min: n, max: n };
}
function parseDate(val) {
  if (!val) return null;
  try {
    if (typeof val === 'number') {
      const d = XLSX.SSF.parse_date_code(val);
      return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
    }
    const s = String(val).trim();
    if (!s) return null;
    const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m1) return `${m1[3]}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`;
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    return null;
  } catch (e) { return null; }
}
function parseExcel(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: false, raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: null, raw: false });
}

// Ensure extra columns exist
async function ensureColumns() {
  await pool.query(`ALTER TABLE catalogue ADD COLUMN IF NOT EXISTS invoice_no_raw TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE catalogue ADD COLUMN IF NOT EXISTS batch_name TEXT DEFAULT ''`).catch(() => {});
  await pool.query(`ALTER TABLE catalogue ADD COLUMN IF NOT EXISTS sold_list_sale_no TEXT DEFAULT NULL`).catch(() => {});
  await pool.query(`ALTER TABLE sold_list ADD COLUMN IF NOT EXISTS batch_name TEXT DEFAULT ''`).catch(() => {});
  await pool.query(`ALTER TABLE markings  ADD COLUMN IF NOT EXISTS batch_name TEXT DEFAULT ''`).catch(() => {});
  await pool.query(`ALTER TABLE import_log ADD COLUMN IF NOT EXISTS file_label TEXT DEFAULT ''`).catch(() => {});
  await pool.query(`ALTER TABLE import_log ADD COLUMN IF NOT EXISTS import_group TEXT DEFAULT ''`).catch(() => {});
  await pool.query(`ALTER TABLE import_log ADD COLUMN IF NOT EXISTS batch_name TEXT DEFAULT ''`).catch(() => {});
  await pool.query(`ALTER TABLE import_log ADD COLUMN IF NOT EXISTS sold_list_sale_no TEXT DEFAULT NULL`).catch(() => {});
  await pool.query(`ALTER TABLE markings DROP CONSTRAINT IF EXISTS markings_catalogue_id_fkey`).catch(() => {});
}
ensureColumns();

// ── POST /api/import/catalogue ────────────────────────────────────────────────
router.post('/catalogue', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const rows = parseExcel(req.file.path);
    if (!rows.length) return res.status(400).json({ error: 'File is empty or unreadable' });

    const file_label = req.body.file_label || '';
    const import_group = req.body.import_group || '';
    const batch_name = req.body.batch_name || '';
    const sold_list_sale_no = req.body.sold_list_sale_no || null;
    let imported = 0, skipped = 0, saleNoFound = null;
    const errors = [];

    for (const row of rows) {
      const map = buildMap(row);
      const sale_no     = pick(map, row, 'Sale No', 'SaleNo', 'Sale');
      const lot_no      = pick(map, row, 'LotNo', 'Lot No', 'LotNumber', 'Lot');
      const invoice_no  = pick(map, row, 'InvoiceNo', 'Invoice No', 'Invoice');
      const auctioneer  = normStr(pick(map, row, 'Auctioneer', 'Broker', 'Auctioneeer'));
      const origin      = normStr(pick(map, row, 'Origin'));
      const mark        = normStr(pick(map, row, 'Mark'));
      const grade       = normStr(pick(map, row, 'Grade'));
      const bags_raw    = pick(map, row, 'No of Packages', 'NoofPackages', 'Bags', 'Packages', 'No Of Pack');
      const wt_raw      = pick(map, row, 'Net Weight', 'NetWeight', 'NetWt');
      const lsp_raw     = pick(map, row, 'LastSoldPrice', 'Last Sold Price', 'Last Sale Price');
      const date_raw    = pick(map, row, 'GPDate', 'GP Date', 'Date');
      const garden = mark || origin;
      if (!garden || !grade) { skipped++; continue; }
      const bags = parseNum(bags_raw);
      const net_wt = parseNum(wt_raw);
      const { min: lsp_min, max: lsp_max } = parsePriceRange(lsp_raw);
      const last_sale_price = lsp_min && lsp_max ? (lsp_min + lsp_max) / 2 : (lsp_min || lsp_max || null);
      const week_date = parseDate(date_raw);
      if (sale_no && !saleNoFound) saleNoFound = sale_no;
      try {
        await pool.query(`
          INSERT INTO catalogue (sale_no, week_date, garden, grade, mark, invoice_no, invoice_no_raw, bags, net_wt, broker, upset_price, last_sale_price, batch_name, sold_list_sale_no)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
          ON CONFLICT (sale_no, garden, grade, mark, invoice_no, batch_name) DO UPDATE SET
            bags=EXCLUDED.bags, net_wt=EXCLUDED.net_wt, broker=EXCLUDED.broker,
            upset_price=EXCLUDED.upset_price, last_sale_price=EXCLUDED.last_sale_price,
            invoice_no_raw=EXCLUDED.invoice_no_raw,
            sold_list_sale_no=EXCLUDED.sold_list_sale_no
        `, [sale_no, week_date, origin||mark, grade, mark, lot_no, invoice_no, bags, net_wt, auctioneer, lsp_min, last_sale_price, batch_name, sold_list_sale_no]);
        imported++;
      } catch (e) {
        skipped++;
        if (errors.length < 5) errors.push(`${garden}/${grade}: ${e.message}`);
      }
    }
    await pool.query(
      `INSERT INTO import_log (file_type,filename,file_label,import_group,batch_name,rows_imported,rows_skipped,sale_no,sold_list_sale_no) VALUES ('catalogue',$1,$2,$3,$4,$5,$6,$7,$8)`,
      [req.file.originalname, file_label, import_group, batch_name, imported, skipped, saleNoFound, sold_list_sale_no]
    );
    res.json({ success: true, imported, skipped, errors, sale_no: saleNoFound, file_label, batch_name });
  } catch (err) {
    console.error('Catalogue import error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/import/sold-list ────────────────────────────────────────────────
router.post('/sold-list', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const rows = parseExcel(req.file.path);
    if (!rows.length) return res.status(400).json({ error: 'File is empty' });

    const file_label = req.body.file_label || '';
    const import_group = req.body.import_group || '';
    const batch_name = req.body.batch_name || '';
    let imported = 0, skipped = 0, saleNoFound = null;

    for (const row of rows) {
      const map = buildMap(row);
      const sale_no   = pick(map, row, 'Sale No', 'SaleNo', 'Sale');
      const lot_no    = pick(map, row, 'LotNo', 'Lot No', 'LotNumber');
      const auctioneer= normStr(pick(map, row, 'Auctioneer', 'Broker'));
      const origin    = normStr(pick(map, row, 'Origin'));
      const mark      = normStr(pick(map, row, 'Mark'));
      const grade     = normStr(pick(map, row, 'Grade'));
      const bags_raw  = pick(map, row, 'No of Packages', 'NoofPackages', 'Bags');
      const wt_raw    = pick(map, row, 'Net Weight', 'NetWeight', 'NetWt');
      const deal_raw  = pick(map, row, 'DealPrice', 'Deal Price', 'Price', 'LastSoldPrice');
      const buyer     = pick(map, row, 'BuyerCode', 'Buyer Code', 'Buyer');
      const date_raw  = pick(map, row, 'GPDate', 'GP Date', 'Date');
      const garden = mark || origin;
      if (!garden || !grade) { skipped++; continue; }
      const bags = parseNum(bags_raw);
      const net_wt = parseNum(wt_raw);
      const deal_price = parseNum(deal_raw);
      const week_date = parseDate(date_raw);
      if (sale_no && !saleNoFound) saleNoFound = sale_no;
      try {
        await pool.query(`
          INSERT INTO sold_list (sale_no,week_date,garden,grade,mark,invoice_no,bags,net_wt,broker,deal_price,buyer_code,batch_name)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          ON CONFLICT (sale_no,garden,grade,mark,invoice_no,batch_name) DO UPDATE SET deal_price=EXCLUDED.deal_price,buyer_code=EXCLUDED.buyer_code
        `, [sale_no, week_date, origin||mark, grade, mark, lot_no, bags, net_wt, auctioneer, deal_price, buyer, batch_name]);
        imported++;
      } catch (e) { skipped++; }
    }
    await pool.query(
      `INSERT INTO import_log (file_type,filename,file_label,import_group,batch_name,rows_imported,rows_skipped,sale_no) VALUES ('sold_list',$1,$2,$3,$4,$5,$6,$7)`,
      [req.file.originalname, file_label, import_group, batch_name, imported, skipped, saleNoFound]
    );
    res.json({ success: true, imported, skipped, sale_no: saleNoFound, file_label, batch_name });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/import/logs ──────────────────────────────────────────────────────
router.get('/logs', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT il.*,
              COALESCE(il.file_label, '') as file_label,
              COALESCE(il.import_group, '') as import_group,
              COALESCE(il.batch_name, '') as batch_name,
              COALESCE(
                NULLIF(il.sold_list_sale_no, ''),
                (SELECT c.sold_list_sale_no FROM catalogue c
                  WHERE il.file_type = 'catalogue'
                    AND c.sale_no = il.sale_no
                    AND COALESCE(c.batch_name,'') = COALESCE(il.batch_name,'')
                    AND c.sold_list_sale_no IS NOT NULL
                  LIMIT 1),
                ''
              ) AS sold_list_sale_no
         FROM import_log il
        ORDER BY il.imported_at DESC LIMIT 50`
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/import/sale-numbers ──────────────────────────────────────────────
// Returns catalogue lot_count + sold_list sold_count per sale.
// JOINs sold_list using catalogue.sold_list_sale_no (the sold list the catalogue
// was mapped to during upload), falling back to catalogue.sale_no when not set.
router.get('/sale-numbers', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        c.sale_no,
        COALESCE(c.batch_name, '') as batch_name,
        COALESCE(c.sold_list_sale_no, '') as sold_list_sale_no,
        MIN(c.week_date) as week_date,
        COUNT(DISTINCT c.invoice_no) as lot_count,
        COALESCE(s.sold_count, 0) as sold_count
      FROM catalogue c
      LEFT JOIN (
        SELECT sale_no, COUNT(*) as sold_count
        FROM sold_list GROUP BY sale_no
      ) s ON s.sale_no = COALESCE(NULLIF(c.sold_list_sale_no, ''), c.sale_no)
      WHERE c.sale_no IS NOT NULL
      GROUP BY c.sale_no, c.batch_name, c.sold_list_sale_no, s.sold_count
      ORDER BY c.sale_no DESC, c.batch_name
      LIMIT 50
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE /api/import/clear ───────────────────────────────────────────────────
router.delete('/clear', async (req, res) => {
  const { sale_no, batch_name, type = 'all', preserve_markings } = req.query;
  if (!sale_no) return res.status(400).json({ error: 'sale_no required' });

  const keepMarkings = preserve_markings !== 'false';
  const hasBatch = batch_name !== undefined && batch_name !== '';
  const where = hasBatch ? 'sale_no=$1 AND batch_name=$2' : 'sale_no=$1';
  const params = hasBatch ? [sale_no, batch_name] : [sale_no];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let deleted = {};
    if (type === 'catalogue' || type === 'all') {
      const r = await client.query(`DELETE FROM catalogue WHERE ${where}`, params);
      deleted.catalogue = r.rowCount;
    }
    if (type === 'sold_list' || type === 'all') {
      const r = await client.query(`DELETE FROM sold_list WHERE ${where}`, params);
      deleted.sold_list = r.rowCount;
    }
    if (type === 'all' && !keepMarkings) {
      const r = await client.query(`DELETE FROM markings WHERE ${where}`, params);
      deleted.markings = r.rowCount;
    } else {
      deleted.markings = 0;
      deleted.markings_preserved = true;
    }
    if (type === 'all' && !keepMarkings) {
      const r2 = await client.query(`DELETE FROM import_log WHERE ${where}`, params);
      deleted.import_log = r2.rowCount;
    }
    await client.query('COMMIT');
    res.json({ success: true, sale_no, deleted });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// Multer error handler
router.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large. Maximum allowed: 200MB.' });
  }
  if (err) return res.status(400).json({ error: err.message });
  next();
});

// ── GET /api/import/clear-sale-numbers ───────────────────────────────────────
// Returns sale_nos from BOTH catalogue and sold_list — for the Clear panel dropdown
// So standalone sold_list uploads (no catalogue) still appear and can be deleted
router.get('/clear-sale-numbers', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        sale_no,
        SUM(cat_rows)  AS cat_rows,
        SUM(sl_rows)   AS sl_rows
      FROM (
        SELECT sale_no, COUNT(*) AS cat_rows, 0 AS sl_rows FROM catalogue WHERE sale_no IS NOT NULL GROUP BY sale_no
        UNION ALL
        SELECT sale_no, 0 AS cat_rows, COUNT(*) AS sl_rows FROM sold_list  WHERE sale_no IS NOT NULL GROUP BY sale_no
      ) combined
      GROUP BY sale_no
      ORDER BY sale_no::INTEGER DESC
    `);
    res.json(rows);
  } catch (e) {
    // Fallback if sale_no is not numeric
    try {
      const { rows } = await pool.query(`
        SELECT sale_no, SUM(cat_rows) AS cat_rows, SUM(sl_rows) AS sl_rows
        FROM (
          SELECT sale_no, COUNT(*) AS cat_rows, 0 AS sl_rows FROM catalogue WHERE sale_no IS NOT NULL GROUP BY sale_no
          UNION ALL
          SELECT sale_no, 0 AS cat_rows, COUNT(*) AS sl_rows FROM sold_list  WHERE sale_no IS NOT NULL GROUP BY sale_no
        ) combined
        GROUP BY sale_no ORDER BY sale_no DESC
      `);
      res.json(rows);
    } catch (e2) { res.status(500).json({ error: e2.message }); }
  }
});

// ── GET /api/import/sold-list-sales ──────────────────────────────────────────
// Returns distinct sale_nos available in sold_list, for the "select sold list" dropdown
router.get('/sold-list-sales', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        sale_no,
        COUNT(*)        AS row_count,
        MIN(deal_price) AS min_price,
        MAX(deal_price) AS max_price
      FROM sold_list
      WHERE deal_price IS NOT NULL AND deal_price > 0
      GROUP BY sale_no
      ORDER BY sale_no::INTEGER DESC
    `);
    res.json(rows);
  } catch (e) {
    // Fallback if sale_no is not numeric
    try {
      const { rows } = await pool.query(`
        SELECT sale_no, COUNT(*) AS row_count, MIN(deal_price) AS min_price, MAX(deal_price) AS max_price
        FROM sold_list WHERE deal_price IS NOT NULL AND deal_price > 0
        GROUP BY sale_no ORDER BY sale_no DESC
      `);
      res.json(rows);
    } catch (e2) { res.status(500).json({ error: e2.message }); }
  }
});

module.exports = router;
