const router = require('express').Router();
const { pool } = require('../db/pool');

router.get('/merged', async (req, res) => {
  const { sale_no, batch_name } = req.query;
  if (!sale_no) return res.status(400).json({ error: 'sale_no required' });
  try {
    const hasBatch = batch_name !== undefined && batch_name !== '';
    const batchWhere = hasBatch ? ` AND COALESCE(c.batch_name, '') = $2` : '';
    const params = hasBatch ? [sale_no, batch_name] : [sale_no];
    const { rows } = await pool.query(`
      SELECT
        c.sale_no,
        c.invoice_no      AS lot_no,
        c.invoice_no_raw  AS invoice,
        c.mark            AS garden,
        c.garden          AS origin,
        c.grade,
        c.bags,
        c.net_wt,
        c.broker,
        c.week_date       AS gp_date,
        COALESCE(c.batch_name, '') AS batch_name,
        (SELECT MIN(s2.deal_price) FROM sold_list s2
         WHERE LOWER(s2.grade) = LOWER(c.grade)
           AND s2.deal_price IS NOT NULL
           AND (LOWER(s2.mark) = LOWER(c.mark) OR LOWER(s2.garden) = LOWER(c.mark))) AS min_deal_price,
        (SELECT MAX(s2.deal_price) FROM sold_list s2
         WHERE LOWER(s2.grade) = LOWER(c.grade)
           AND s2.deal_price IS NOT NULL
           AND (LOWER(s2.mark) = LOWER(c.mark) OR LOWER(s2.garden) = LOWER(c.mark))) AS max_deal_price
      FROM catalogue c
      WHERE c.sale_no=$1${batchWhere}
      ORDER BY c.broker,
        REGEXP_REPLACE(c.invoice_no,'[^0-9]','','g')::INTEGER NULLS LAST,
        c.invoice_no
    `, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/', async (req, res) => {
  const { sale_no, garden, grade } = req.query;
  let q = 'SELECT * FROM catalogue WHERE 1=1';
  const p = []; let i = 1;
  if (sale_no) { q += ` AND sale_no=$${i++}`; p.push(sale_no); }
  if (garden)  { q += ` AND mark ILIKE $${i++}`; p.push(`%${garden}%`); }
  if (grade)   { q += ` AND grade=$${i++}`; p.push(grade); }
  q += ` ORDER BY broker, REGEXP_REPLACE(invoice_no,'[^0-9]','','g')::INTEGER NULLS LAST, invoice_no LIMIT 500`;
  try { const { rows } = await pool.query(q, p); res.json(rows); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
