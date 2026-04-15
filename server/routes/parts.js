'use strict';

/**
 * Parts Catalog Routes
 *
 * Workflow:
 *   1. Tech enters P/N + CAGE → POST /api/parts/flis-lookup (preview, no DB write)
 *   2. Tech confirms → POST /api/parts (saves with flis_verified=false, pending approval)
 *   3. Manager/Officer approves → PUT /api/parts/:nsn/approve (sets flis_verified=true)
 *
 * All routes require auth. Approve + update require officer or admin role.
 */

const express = require('express');
const pool    = require('../db/pool');
const flis    = require('../lib/flis');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// All parts routes require authentication
router.use(requireAuth);

// ---------------------------------------------------------------------------
// GET /api/parts
// Search parts in the local DB.
// ?q=      full-text search on NSN, NIIN, description
// ?nsn=    exact NSN match
// ?pn=     part number lookup (via part_numbers table)
// ?pending=true  show only flis_verified=false (pending approval)
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const { q, nsn, pn, pending, limit = 50, offset = 0 } = req.query;
    let rows;

    if (nsn) {
      const result = await pool.query(
        `SELECT pm.*, json_agg(json_build_object('pn_id', pn.pn_id, 'part_number', pn.part_number, 'cage_code', pn.cage_code, 'manufacturer', pn.manufacturer)) FILTER (WHERE pn.pn_id IS NOT NULL) AS part_numbers
         FROM parts_master pm
         LEFT JOIN part_numbers pn ON pm.nsn = pn.nsn
         WHERE pm.nsn = $1
         GROUP BY pm.nsn`,
        [nsn.toUpperCase()]
      );
      rows = result.rows;

    } else if (pn) {
      const result = await pool.query(
        `SELECT pm.*, json_agg(json_build_object('pn_id', pn2.pn_id, 'part_number', pn2.part_number, 'cage_code', pn2.cage_code, 'manufacturer', pn2.manufacturer)) FILTER (WHERE pn2.pn_id IS NOT NULL) AS part_numbers
         FROM part_numbers pn
         JOIN parts_master pm ON pm.nsn = pn.nsn
         LEFT JOIN part_numbers pn2 ON pm.nsn = pn2.nsn
         WHERE UPPER(pn.part_number) = UPPER($1)
         GROUP BY pm.nsn
         LIMIT $2 OFFSET $3`,
        [pn, parseInt(limit), parseInt(offset)]
      );
      rows = result.rows;

    } else if (q) {
      const result = await pool.query(
        `SELECT pm.*, json_agg(json_build_object('part_number', pn.part_number, 'cage_code', pn.cage_code)) FILTER (WHERE pn.pn_id IS NOT NULL) AS part_numbers
         FROM parts_master pm
         LEFT JOIN part_numbers pn ON pm.nsn = pn.nsn
         WHERE (
           pm.nsn ILIKE $1
           OR pm.niin ILIKE $1
           OR pm.description ILIKE $1
         ) ${pending === 'true' ? 'AND pm.flis_verified = false' : ''}
         GROUP BY pm.nsn
         ORDER BY pm.nsn
         LIMIT $2 OFFSET $3`,
        [`%${q}%`, parseInt(limit), parseInt(offset)]
      );
      rows = result.rows;

    } else if (pending === 'true') {
      const result = await pool.query(
        `SELECT pm.*, json_agg(json_build_object('part_number', pn.part_number, 'cage_code', pn.cage_code)) FILTER (WHERE pn.pn_id IS NOT NULL) AS part_numbers
         FROM parts_master pm
         LEFT JOIN part_numbers pn ON pm.nsn = pn.nsn
         WHERE pm.flis_verified = false
         GROUP BY pm.nsn
         ORDER BY pm.created_at DESC
         LIMIT $1 OFFSET $2`,
        [parseInt(limit), parseInt(offset)]
      );
      rows = result.rows;

    } else {
      const result = await pool.query(
        `SELECT pm.*, json_agg(json_build_object('part_number', pn.part_number, 'cage_code', pn.cage_code)) FILTER (WHERE pn.pn_id IS NOT NULL) AS part_numbers
         FROM parts_master pm
         LEFT JOIN part_numbers pn ON pm.nsn = pn.nsn
         GROUP BY pm.nsn
         ORDER BY pm.nsn
         LIMIT $1 OFFSET $2`,
        [parseInt(limit), parseInt(offset)]
      );
      rows = result.rows;
    }

    res.json({ parts: rows, count: rows.length });
  } catch (err) {
    console.error('GET /api/parts error:', err);
    res.status(500).json({ error: 'Failed to fetch parts' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/parts/flis-lookup
// Look up a part in FLIS (nsnlookup.com) without saving to DB.
// Returns raw FLIS data for the tech to review before confirming the add.
// Body: { query: string }  — NIIN, NSN, or P/N
// ---------------------------------------------------------------------------
router.post('/flis-lookup', async (req, res) => {
  const { query } = req.body;
  if (!query || typeof query !== 'string' || query.trim().length < 3) {
    return res.status(400).json({ error: 'query is required (NIIN, NSN, or part number)' });
  }

  try {
    const results = await flis.searchNsn(query.trim());
    if (results.length === 0) {
      return res.status(404).json({ error: 'No FLIS results found', query });
    }
    res.json({ results, query });
  } catch (err) {
    console.error('FLIS lookup error:', err);
    res.status(502).json({ error: 'FLIS lookup failed', detail: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/parts
// Add a part to the local DB.
// If nsn is not provided, FLIS is queried using part_number + cage_code.
// Saves as flis_verified=false (pending officer/admin approval).
// Body: { nsn?, niin?, part_number, cage_code, description?, unit_of_issue?, unit_price? }
// ---------------------------------------------------------------------------
router.post('/', async (req, res) => {
  const { nsn, niin, fsc, part_number, cage_code, description, unit_of_issue, unit_price } = req.body;

  if (!part_number || typeof part_number !== 'string') {
    return res.status(400).json({ error: 'part_number is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let partNsn = nsn ? nsn.toUpperCase().trim() : null;
    let partNiin = niin ? niin.trim() : null;
    let partFsc  = fsc ? fsc.trim() : null;
    let partDesc = description || null;
    let partUI   = unit_of_issue || null;
    let partPrice = unit_price != null ? parseFloat(unit_price) : null;
    let flisVerified = false;

    // If no NSN provided, try FLIS lookup
    if (!partNsn && part_number) {
      const query = cage_code ? `${part_number} ${cage_code}` : part_number;
      const flisResults = await flis.searchNsnQuick(query);
      if (flisResults.length > 0) {
        const top = flisResults[0];
        partNsn   = top.nsn.replace(/-/g, '');
        partNiin  = top.niin;
        partFsc   = top.fsc;
        partDesc  = partDesc || top.itemName;
        flisVerified = false; // Still needs officer approval even with FLIS data
      }
    }

    if (!partNsn || !partNiin) {
      await client.query('ROLLBACK');
      return res.status(422).json({
        error: 'Could not resolve NSN. Provide nsn + niin, or a part_number that returns FLIS results.',
      });
    }

    if (!partFsc) partFsc = partNsn.slice(0, 4);

    // Upsert parts_master
    const upsert = await client.query(
      `INSERT INTO parts_master (nsn, niin, fsc, description, unit_of_issue, unit_price, flis_verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (nsn) DO UPDATE SET
         description   = COALESCE(EXCLUDED.description, parts_master.description),
         unit_of_issue = COALESCE(EXCLUDED.unit_of_issue, parts_master.unit_of_issue),
         unit_price    = COALESCE(EXCLUDED.unit_price, parts_master.unit_price),
         updated_at    = NOW()
       RETURNING *`,
      [partNsn, partNiin, partFsc, partDesc, partUI, partPrice, flisVerified]
    );
    const part = upsert.rows[0];

    // Insert part_number cross-reference (skip if already exists)
    if (part_number) {
      await client.query(
        `INSERT INTO part_numbers (part_number, nsn, cage_code)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [part_number.toUpperCase().trim(), partNsn, cage_code ? cage_code.toUpperCase().trim() : null]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({
      part,
      message: flisVerified
        ? 'Part added and FLIS-verified.'
        : 'Part added — pending officer/admin approval (flis_verified=false).',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /api/parts error:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Part number already exists for this NSN' });
    }
    res.status(500).json({ error: 'Failed to add part' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// GET /api/parts/:nsn
// Fetch a single part with all cross-reference part numbers.
// ---------------------------------------------------------------------------
router.get('/:nsn', async (req, res) => {
  const nsn = req.params.nsn.toUpperCase().trim();
  try {
    const result = await pool.query(
      `SELECT pm.*, json_agg(json_build_object(
         'pn_id', pn.pn_id,
         'part_number', pn.part_number,
         'cage_code', pn.cage_code,
         'manufacturer', pn.manufacturer
       )) FILTER (WHERE pn.pn_id IS NOT NULL) AS part_numbers
       FROM parts_master pm
       LEFT JOIN part_numbers pn ON pm.nsn = pn.nsn
       WHERE pm.nsn = $1
       GROUP BY pm.nsn`,
      [nsn]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Part not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('GET /api/parts/:nsn error:', err);
    res.status(500).json({ error: 'Failed to fetch part' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/parts/:nsn/approve
// Officer/admin: approve a pending part (set flis_verified=true).
// Optionally update description, unit_of_issue, unit_price at the same time.
// ---------------------------------------------------------------------------
router.put('/:nsn/approve', requireRole(['officer', 'admin']), async (req, res) => {
  const nsn = req.params.nsn.toUpperCase().trim();
  const { description, unit_of_issue, unit_price } = req.body;

  try {
    const result = await pool.query(
      `UPDATE parts_master SET
         flis_verified = true,
         description   = COALESCE($2, description),
         unit_of_issue = COALESCE($3, unit_of_issue),
         unit_price    = COALESCE($4, unit_price),
         updated_at    = NOW()
       WHERE nsn = $1
       RETURNING *`,
      [nsn, description || null, unit_of_issue || null, unit_price != null ? parseFloat(unit_price) : null]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Part not found' });
    }
    res.json({ part: result.rows[0], message: 'Part approved.' });
  } catch (err) {
    console.error('PUT /api/parts/:nsn/approve error:', err);
    res.status(500).json({ error: 'Failed to approve part' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/parts/:nsn
// Update part fields. Officer/admin only.
// Body: { description?, unit_of_issue?, unit_price? }
// ---------------------------------------------------------------------------
router.put('/:nsn', requireRole(['officer', 'admin']), async (req, res) => {
  const nsn = req.params.nsn.toUpperCase().trim();
  const { description, unit_of_issue, unit_price } = req.body;

  if (!description && !unit_of_issue && unit_price == null) {
    return res.status(400).json({ error: 'At least one field required: description, unit_of_issue, unit_price' });
  }

  try {
    const result = await pool.query(
      `UPDATE parts_master SET
         description   = COALESCE($2, description),
         unit_of_issue = COALESCE($3, unit_of_issue),
         unit_price    = COALESCE($4, unit_price),
         updated_at    = NOW()
       WHERE nsn = $1
       RETURNING *`,
      [nsn, description || null, unit_of_issue || null, unit_price != null ? parseFloat(unit_price) : null]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Part not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('PUT /api/parts/:nsn error:', err);
    res.status(500).json({ error: 'Failed to update part' });
  }
});

module.exports = router;
