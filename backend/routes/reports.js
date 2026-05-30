const router = require('express').Router();
const { pool } = require('../db/pool');

// ── GET /api/reports/party-summary ────────────────────────────────────────────
// One row per party. `lots` = one entry per garden+grade (not per lot).
// Rate range comes from sold_list globally (no sale_no filter) — same as marking UI.
// Falls back to markings.final_price only if no sold_list exists for that garden+grade.
router.get('/party-summary', async (req, res) => {
  const { sale_no, batch_name } = req.query;
  if (!sale_no) return res.status(400).json({ error: 'sale_no required' });
  const hasBatch = batch_name !== undefined && batch_name !== '';
  const bMark    = hasBatch ? ` AND COALESCE(m.batch_name, '') = $2` : '';
  const params   = hasBatch ? [sale_no, batch_name] : [sale_no];
  try {
    const { rows } = await pool.query(`
      WITH
      -- Global rate range from sold_list per garden+grade (no sale_no filter — matches marking UI)
      sold_range AS (
        SELECT
          TRIM(UPPER(mark))  AS garden,
          TRIM(UPPER(grade)) AS grade,
          MIN(deal_price)    AS rate_low,
          MAX(deal_price)    AS rate_high
        FROM sold_list
        WHERE deal_price IS NOT NULL AND deal_price > 0
        GROUP BY TRIM(UPPER(mark)), TRIM(UPPER(grade))
      ),
      -- Aggregate markings: one row per party+garden+grade
      grouped AS (
        SELECT
          m.party_code,
          m.party_name,
          TRIM(UPPER(m.garden)) AS garden,
          MIN(m.origin)         AS origin,
          TRIM(UPPER(m.grade))  AS grade,
          COUNT(*)              AS lot_count,
          SUM(m.bags)           AS total_bags,
          SUM(m.net_wt)         AS total_nwt,
          MIN(m.final_price::NUMERIC) AS fp_low,
          MAX(m.final_price::NUMERIC) AS fp_high
        FROM markings m
        WHERE m.sale_no = $1 AND m.status != 'skipped'${bMark}
        GROUP BY m.party_code, m.party_name, TRIM(UPPER(m.garden)), TRIM(UPPER(m.grade))
      )
      SELECT
        g.party_code,
        g.party_name,
        SUM(g.lot_count) AS total_lots,
        ARRAY_AGG(
          json_build_object(
            'garden',     g.garden,
            'origin',     g.origin,
            'grade',      g.grade,
            'lot_count',  g.lot_count,
            'total_bags', g.total_bags,
            'total_nwt',  g.total_nwt,
            -- Rate = global sold_list range; fallback to final_price if no sold_list history
            'rate_low',   COALESCE(sr.rate_low,  g.fp_low),
            'rate_high',  COALESCE(sr.rate_high, g.fp_high)
          ) ORDER BY g.garden, g.grade
        ) AS lots
      FROM grouped g
      LEFT JOIN sold_range sr ON sr.garden = g.garden AND sr.grade = g.grade
      GROUP BY g.party_code, g.party_name
      ORDER BY g.party_name
    `, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ── GET /api/reports/market ───────────────────────────────────────────────────
// Reads DIRECTLY from sold_list for the given sale_no — this is the true market report.
// Each row = one unique garden+grade combination with min/max deal price.
// Returns { has_sold_list: false } indicator row if no data found.
router.get('/market', async (req, res) => {
  const { sale_no, batch_name } = req.query;
  if (!sale_no) return res.status(400).json({ error: 'sale_no required' });
  const hasBatch = batch_name !== undefined && batch_name !== '';
  const bSold    = hasBatch ? ` AND COALESCE(s.batch_name, '') = $2` : '';
  const params   = hasBatch ? [sale_no, batch_name] : [sale_no];
  try {
    const { rows } = await pool.query(`
      SELECT
        TRIM(UPPER(s.grade))  AS grade,
        TRIM(UPPER(s.mark))   AS garden,
        MIN(s.garden)         AS origin,
        MIN(s.deal_price)     AS price_low,
        MAX(s.deal_price)     AS price_high,
        COUNT(*)              AS lot_count,
        SUM(s.bags)           AS total_bags,
        SUM(s.net_wt)         AS total_nwt
      FROM sold_list s
      WHERE s.sale_no = $1
        AND s.deal_price IS NOT NULL
        AND s.deal_price > 0${bSold}
      GROUP BY TRIM(UPPER(s.grade)), TRIM(UPPER(s.mark))
      ORDER BY TRIM(UPPER(s.mark)), TRIM(UPPER(s.grade))
    `, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ── GET /api/reports/market-grade-summary ────────────────────────────────────
// Grade-level summary directly from sold_list for the given sale_no.
router.get('/market-grade-summary', async (req, res) => {
  const { sale_no, batch_name } = req.query;
  if (!sale_no) return res.status(400).json({ error: 'sale_no required' });
  const hasBatch = batch_name !== undefined && batch_name !== '';
  const bSold    = hasBatch ? ` AND COALESCE(s.batch_name, '') = $2` : '';
  const params   = hasBatch ? [sale_no, batch_name] : [sale_no];
  try {
    const { rows } = await pool.query(`
      SELECT
        TRIM(UPPER(s.grade))                 AS grade,
        MIN(s.deal_price)                    AS price_low,
        MAX(s.deal_price)                    AS price_high,
        ROUND(AVG(s.deal_price)::NUMERIC, 2) AS price_avg,
        COUNT(DISTINCT TRIM(UPPER(s.mark)))  AS garden_count,
        COUNT(*)                             AS lot_count,
        SUM(s.bags)                          AS total_bags
      FROM sold_list s
      WHERE s.sale_no = $1
        AND s.deal_price IS NOT NULL
        AND s.deal_price > 0${bSold}
      GROUP BY TRIM(UPPER(s.grade))
      ORDER BY TRIM(UPPER(s.grade))
    `, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ── GET /api/reports/sold-list-status ────────────────────────────────────────
// Returns sold_list row count + price range per sale_no (ignoring batch).
router.get('/sold-list-status', async (req, res) => {
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
      ORDER BY sale_no DESC
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
