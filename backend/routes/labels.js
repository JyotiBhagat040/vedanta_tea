const router = require('express').Router();
const { pool } = require('../db/pool');

// ── GET /api/labels/markings ───────────────────────────────────────────────────
// Fetch all markings for a sale to generate labels.
//
// IMPORTANT: The JOIN to catalogue is intentionally forgiving:
//   (a) trim + lowercase on mark, grade, broker to handle case/whitespace diffs
//   (b) strict match first (includes broker), then fall back to a loose match
//       (mark + grade + sale_no only) if strict didn't find a row — so LotNo
//       and GP Date still appear even when broker on the marking was blank.
//   (c) bags / net_wt are COALESCED against catalogue values so they show up
//       on labels even when the marking row itself was saved with NULL.
router.get('/markings', async (req, res) => {
  const { sale_no, batch_name } = req.query;
  if (!sale_no) return res.status(400).json({ error: 'sale_no required' });
  try {
    const hasBatch = batch_name !== undefined && batch_name !== '';
    const batchWhere = hasBatch ? ` AND COALESCE(m.batch_name, '') = $2` : '';
    const params    = hasBatch ? [sale_no, batch_name] : [sale_no];

    const sql = `
      WITH base AS (
        SELECT
          m.id AS mid,
          m.catalogue_id,
          m.party_name, m.party_code, m.garden, m.grade,
          m.broker, m.bags, m.net_wt, m.final_price, m.invoice, m.origin,
          m.sale_no
        FROM markings m
        WHERE m.sale_no = $1 AND m.status != 'skipped'${batchWhere}
      ),
      direct_match AS (
        SELECT
          b.mid,
          c.invoice_no     AS lot_no,
          c.invoice_no_raw AS invoice_raw,
          c.week_date      AS gp_date,
          c.bags           AS cat_bags,
          c.net_wt         AS cat_nwt
        FROM base b
        JOIN catalogue c
          ON c.id = b.catalogue_id
      ),
      -- Strict match: mark + grade + broker + sale_no (case/space insensitive)
      strict_match AS (
        SELECT DISTINCT ON (b.mid)
          b.mid,
          c.invoice_no     AS lot_no,
          c.invoice_no_raw AS invoice_raw,
          c.week_date      AS gp_date,
          c.bags           AS cat_bags,
          c.net_wt         AS cat_nwt
        FROM base b
        JOIN catalogue c
          ON LOWER(TRIM(c.mark))   = LOWER(TRIM(b.garden))
         AND LOWER(TRIM(c.grade))  = LOWER(TRIM(b.grade))
         AND LOWER(TRIM(COALESCE(c.broker,''))) = LOWER(TRIM(COALESCE(b.broker,'')))
         AND c.sale_no = b.sale_no
        ORDER BY b.mid, c.id
      ),
      -- Loose match: mark + grade + sale_no only (used when strict failed)
      loose_match AS (
        SELECT DISTINCT ON (b.mid)
          b.mid,
          c.invoice_no     AS lot_no,
          c.invoice_no_raw AS invoice_raw,
          c.week_date      AS gp_date,
          c.bags           AS cat_bags,
          c.net_wt         AS cat_nwt
        FROM base b
        JOIN catalogue c
          ON LOWER(TRIM(c.mark))  = LOWER(TRIM(b.garden))
         AND LOWER(TRIM(c.grade)) = LOWER(TRIM(b.grade))
         AND c.sale_no = b.sale_no
        WHERE b.mid NOT IN (SELECT mid FROM strict_match)
        ORDER BY b.mid, c.id
      ),
      combined AS (        
        SELECT * FROM direct_match
        UNION ALL
        SELECT * FROM strict_match WHERE mid NOT IN (SELECT mid FROM direct_match)
        UNION ALL
        SELECT * FROM loose_match  WHERE mid NOT IN (SELECT mid FROM direct_match)
      )
      SELECT
        b.party_name, b.party_code, b.garden, b.grade,
        b.broker,
        -- Prefer markings value, fall back to catalogue
        COALESCE(NULLIF(b.bags::text, ''),   cm.cat_bags::text) AS bags,
        COALESCE(NULLIF(b.net_wt::text, ''), cm.cat_nwt::text)  AS net_wt,
        b.final_price, b.invoice, b.origin, b.sale_no,
        cm.lot_no,
        cm.invoice_raw,
        cm.gp_date
      FROM base b
      LEFT JOIN combined cm ON cm.mid = b.mid
      ORDER BY b.party_name, b.garden, b.grade
    `;

    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (e) {
    console.error('[labels/markings]', e);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/labels/historical-prices ─────────────────────────────────────────
// Returns per-sale min/max price for each garden+grade
// Result: { lookup: { "garden__grade": { sales: [{sale_no, price_low, price_high},...] } }, prev_sale_nos: [...] }
router.get('/historical-prices', async (req, res) => {
  const { sale_no, prev_sales = 2 } = req.query;
  if (!sale_no) return res.status(400).json({ error: 'sale_no required' });
  try {
    const n = parseInt(prev_sales);
    const { rows: prevSaleRows } = await pool.query(`
      SELECT DISTINCT sale_no FROM sold_list
      WHERE sale_no < $1
      ORDER BY sale_no DESC
      LIMIT $2
    `, [sale_no, n]);

    if (!prevSaleRows.length) return res.json({ lookup: {}, prev_sale_nos: [] });

    const prevSaleNos = prevSaleRows.map(r => r.sale_no);

    const { rows } = await pool.query(`
      SELECT
        LOWER(TRIM(s.mark))  AS garden,
        LOWER(TRIM(s.grade)) AS grade,
        s.sale_no,
        MIN(s.deal_price) AS price_low,
        MAX(s.deal_price) AS price_high
      FROM sold_list s
      WHERE s.sale_no = ANY($1)
        AND s.deal_price IS NOT NULL AND s.deal_price > 0
      GROUP BY LOWER(TRIM(s.mark)), LOWER(TRIM(s.grade)), s.sale_no
      ORDER BY s.sale_no DESC
    `, [prevSaleNos]);

    // Normalize lookup key to lowercase+trim so frontend can match even when
    // sold_list and catalogue have case/whitespace differences
    const lookup = {};
    rows.forEach(r => {
      const key = `${String(r.garden || '').trim().toLowerCase()}__${String(r.grade || '').trim().toLowerCase()}`;
      if (!lookup[key]) lookup[key] = { sales: [] };
      lookup[key].sales.push({
        sale_no:    r.sale_no,
        price_low:  parseFloat(r.price_low).toFixed(0),
        price_high: parseFloat(r.price_high).toFixed(0)
      });
    });

    res.json({ lookup, prev_sale_nos: prevSaleNos });
  } catch (e) {
    console.error('[labels/historical-prices]', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
