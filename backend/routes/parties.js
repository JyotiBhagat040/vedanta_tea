const router = require('express').Router();
const { pool } = require('../db/pool');

// ── GET /api/parties ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM parties ORDER BY party_name'
  );
  res.json(rows);
});

// ── POST /api/parties ────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { party_name, party_code, contact } = req.body;
  if (!party_name || !party_code)
    return res.status(400).json({ error: 'party_name and party_code required' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO parties (party_name, party_code, contact)
       VALUES ($1, $2, $3) RETURNING *`,
      [party_name, party_code, contact]
    );
    res.json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Party code already exists' });
    res.status(500).json({ error: e.message });
  }
});

// ── PUT /api/parties/:id ─────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  const { party_name, party_code, contact } = req.body;
  const { rows } = await pool.query(
    `UPDATE parties SET party_name=$1, party_code=$2, contact=$3
     WHERE id=$4 RETURNING *`,
    [party_name, party_code, contact, req.params.id]
  );
  res.json(rows[0]);
});

// ── DELETE /api/parties/:id ──────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM parties WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

module.exports = router;
