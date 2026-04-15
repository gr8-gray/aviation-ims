'use strict';

/**
 * Aircraft Routes
 *
 * Covers:
 *   - Aircraft CRUD (BUNO, MDS, status)
 *   - NMCS/PMCS event tracking (open/close)
 *   - Usage history per BUNO
 *   - Det load planning (frequency-based part recommendations)
 */

const express = require('express');
const pool    = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// ---------------------------------------------------------------------------
// GET /api/aircraft
// List aircraft for user's unit.
// ?status=active|grounded|deployed
// ?nmcs=true  — only aircraft with open NMCS events
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const { status, nmcs } = req.query;
    const unitId = req.user.unit_id;

    const conditions = ['a.unit_id = $1'];
    const params     = [unitId];
    let   p          = 2;

    if (status) {
      conditions.push(`a.status = $${p++}`);
      params.push(status);
    }

    if (nmcs === 'true') {
      conditions.push(`EXISTS (
        SELECT 1 FROM nmcs_events ne
        WHERE ne.aircraft_id = a.aircraft_id AND ne.closed_at IS NULL
      )`);
    }

    const result = await pool.query(
      `SELECT a.*,
              COUNT(DISTINCT ne.event_id) FILTER (WHERE ne.closed_at IS NULL) AS open_nmcs_count,
              COUNT(DISTINCT r.req_id)    FILTER (WHERE r.status NOT IN ('received','cancelled')) AS open_req_count
       FROM aircraft a
       LEFT JOIN nmcs_events ne ON ne.aircraft_id = a.aircraft_id
       LEFT JOIN requisitions r ON r.aircraft_id  = a.aircraft_id
       WHERE ${conditions.join(' AND ')}
       GROUP BY a.aircraft_id
       ORDER BY
         CASE a.status WHEN 'grounded' THEN 1 WHEN 'active' THEN 2 ELSE 3 END,
         a.buno`,
      params
    );

    res.json({ aircraft: result.rows, count: result.rows.length });
  } catch (err) {
    console.error('GET /api/aircraft error:', err);
    res.status(500).json({ error: 'Failed to fetch aircraft' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/aircraft
// Add aircraft to unit. Officer/admin only.
// Body: { buno, mds, serial_number? }
// ---------------------------------------------------------------------------
router.post('/', requireRole(['officer', 'admin']), async (req, res) => {
  const { buno, mds, serial_number } = req.body;

  if (!buno) return res.status(400).json({ error: 'buno is required' });
  if (!mds)  return res.status(400).json({ error: 'mds is required' });

  try {
    const result = await pool.query(
      `INSERT INTO aircraft (buno, mds, serial_number, unit_id, status)
       VALUES ($1, $2, $3, $4, 'active')
       RETURNING *`,
      [buno.toUpperCase(), mds.toUpperCase(), serial_number || null, req.user.unit_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: `BUNO ${buno} already exists` });
    }
    console.error('POST /api/aircraft error:', err);
    res.status(500).json({ error: 'Failed to add aircraft' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/aircraft/:id
// Aircraft detail: status, open NMCS events, open requisitions.
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const aircraft = await pool.query(
      'SELECT * FROM aircraft WHERE aircraft_id = $1 AND unit_id = $2',
      [parseInt(req.params.id), req.user.unit_id]
    );
    if (aircraft.rows.length === 0) return res.status(404).json({ error: 'Aircraft not found' });

    const [nmcsResult, reqResult] = await Promise.all([
      pool.query(
        `SELECT ne.*, pm.description, u.name AS opened_by_name
         FROM nmcs_events ne
         JOIN parts_master pm ON pm.nsn = ne.nsn
         JOIN users u ON u.user_id = ne.opened_by
         WHERE ne.aircraft_id = $1 AND ne.closed_at IS NULL
         ORDER BY ne.opened_at`,
        [parseInt(req.params.id)]
      ),
      pool.query(
        `SELECT r.req_id, r.document_number, r.nsn, r.status, r.priority, r.quantity,
                pm.description
         FROM requisitions r
         JOIN parts_master pm ON pm.nsn = r.nsn
         WHERE r.aircraft_id = $1 AND r.status NOT IN ('received','cancelled')
         ORDER BY r.priority, r.created_at`,
        [parseInt(req.params.id)]
      ),
    ]);

    res.json({
      aircraft:   aircraft.rows[0],
      nmcs_open:  nmcsResult.rows,
      reqs_open:  reqResult.rows,
    });
  } catch (err) {
    console.error('GET /api/aircraft/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch aircraft detail' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/aircraft/:id/status
// Update aircraft status. Officer/admin/sncoic only.
// Body: { status: 'active'|'grounded'|'deployed' }
// ---------------------------------------------------------------------------
router.put('/:id/status', requireRole(['officer', 'admin', 'sncoic']), async (req, res) => {
  const { status } = req.body;
  const valid = ['active', 'grounded', 'deployed'];
  if (!valid.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${valid.join(', ')}` });
  }

  try {
    const result = await pool.query(
      `UPDATE aircraft SET status=$1 WHERE aircraft_id=$2 AND unit_id=$3 RETURNING *`,
      [status, parseInt(req.params.id), req.user.unit_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Aircraft not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('PUT /api/aircraft/:id/status error:', err);
    res.status(500).json({ error: 'Failed to update aircraft status' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/aircraft/:id/history
// Part issue/receipt history for a BUNO.
// ?limit=50&offset=0
// ---------------------------------------------------------------------------
router.get('/:id/history', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const result = await pool.query(
      `SELECT t.*, pm.description, u.name AS performed_by_name
       FROM transactions t
       JOIN parts_master pm ON pm.nsn = t.nsn
       JOIN users u ON u.user_id = t.performed_by
       WHERE t.aircraft_id = $1
       ORDER BY t.created_at DESC
       LIMIT $2 OFFSET $3`,
      [parseInt(req.params.id), parseInt(limit), parseInt(offset)]
    );
    res.json({ history: result.rows, count: result.rows.length });
  } catch (err) {
    console.error('GET /api/aircraft/:id/history error:', err);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/aircraft/:id/det-load
// Det load planning: top parts by issue frequency for this BUNO.
// Returns parts sorted by historical issue count — basis for load list.
// ?limit=20
// ---------------------------------------------------------------------------
router.get('/:id/det-load', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const result = await pool.query(
      `SELECT t.nsn,
              pm.description,
              pm.unit_of_issue,
              pm.unit_price,
              SUM(t.quantity)                    AS total_issued,
              COUNT(*)                           AS issue_events,
              MAX(t.created_at)                  AS last_issued,
              COALESCE(inv.qty_on_hand, 0)       AS qty_on_hand,
              COALESCE(inv.qty_on_order, 0)      AS qty_on_order
       FROM transactions t
       JOIN parts_master pm ON pm.nsn = t.nsn
       LEFT JOIN inventory inv ON inv.nsn = t.nsn AND inv.unit_id = $2
       WHERE t.aircraft_id = $1
         AND t.type = 'issue'
       GROUP BY t.nsn, pm.description, pm.unit_of_issue, pm.unit_price,
                inv.qty_on_hand, inv.qty_on_order
       ORDER BY total_issued DESC, issue_events DESC
       LIMIT $3`,
      [parseInt(req.params.id), req.user.unit_id, parseInt(limit)]
    );
    res.json({ recommendations: result.rows, buno: req.params.id });
  } catch (err) {
    console.error('GET /api/aircraft/:id/det-load error:', err);
    res.status(500).json({ error: 'Failed to generate det load recommendations' });
  }
});

// ---------------------------------------------------------------------------
// NMCS / PMCS Events
// ---------------------------------------------------------------------------

// POST /api/aircraft/:id/nmcs
// Open a new NMCS or PMCS event.
// Body: { nsn, jcn, req_id?, type?: 'NMCS'|'PMCS' }
router.post('/:id/nmcs', async (req, res) => {
  const { nsn, jcn, req_id, type = 'NMCS' } = req.body;
  if (!nsn) return res.status(400).json({ error: 'nsn is required' });
  if (!['NMCS', 'PMCS'].includes(type)) {
    return res.status(400).json({ error: 'type must be NMCS or PMCS' });
  }

  try {
    // Verify aircraft belongs to user's unit
    const ac = await pool.query(
      'SELECT aircraft_id FROM aircraft WHERE aircraft_id=$1 AND unit_id=$2',
      [parseInt(req.params.id), req.user.unit_id]
    );
    if (ac.rows.length === 0) return res.status(404).json({ error: 'Aircraft not found' });

    const result = await pool.query(
      `INSERT INTO nmcs_events (aircraft_id, nsn, req_id, jcn, type, opened_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        parseInt(req.params.id),
        nsn,
        req_id || null,
        jcn    || null,
        type,
        req.user.user_id,
      ]
    );

    // Ground aircraft on NMCS (PMCS leaves status unchanged)
    if (type === 'NMCS') {
      await pool.query(
        `UPDATE aircraft SET status='grounded' WHERE aircraft_id=$1`,
        [parseInt(req.params.id)]
      );
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST /api/aircraft/:id/nmcs error:', err);
    res.status(500).json({ error: 'Failed to open NMCS event' });
  }
});

// PUT /api/aircraft/:id/nmcs/:event_id/close
// Close an NMCS/PMCS event. Officer/admin/sncoic only.
router.put('/:id/nmcs/:event_id/close', requireRole(['officer', 'admin', 'sncoic']), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE nmcs_events SET closed_at=NOW() WHERE event_id=$1 AND aircraft_id=$2 AND closed_at IS NULL RETURNING *`,
      [parseInt(req.params.event_id), parseInt(req.params.id)]
    );
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Open NMCS event not found' });
    }

    // Check if any other NMCS events remain open for this aircraft
    const remaining = await client.query(
      `SELECT COUNT(*) AS cnt FROM nmcs_events WHERE aircraft_id=$1 AND closed_at IS NULL`,
      [parseInt(req.params.id)]
    );

    if (parseInt(remaining.rows[0].cnt) === 0) {
      // No more open events — restore aircraft to active
      await client.query(
        `UPDATE aircraft SET status='active' WHERE aircraft_id=$1 AND status='grounded'`,
        [parseInt(req.params.id)]
      );
    }

    await client.query('COMMIT');
    res.json({ event: result.rows[0], message: 'NMCS event closed' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('PUT /api/aircraft/:id/nmcs/:event_id/close error:', err);
    res.status(500).json({ error: 'Failed to close NMCS event' });
  } finally {
    client.release();
  }
});

// GET /api/aircraft/nmcs/open
// All open NMCS events across the unit — the daily NMCS brief source.
router.get('/nmcs/open', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ne.*,
              a.buno, a.mds,
              pm.description AS part_description,
              r.document_number, r.status AS req_status, r.priority,
              u.name AS opened_by_name,
              EXTRACT(EPOCH FROM (NOW() - ne.opened_at))/86400 AS days_open
       FROM nmcs_events ne
       JOIN aircraft a      ON a.aircraft_id  = ne.aircraft_id
       JOIN parts_master pm ON pm.nsn         = ne.nsn
       LEFT JOIN requisitions r ON r.req_id   = ne.req_id
       JOIN users u           ON u.user_id    = ne.opened_by
       WHERE a.unit_id = $1 AND ne.closed_at IS NULL
       ORDER BY ne.type, ne.opened_at`,
      [req.user.unit_id]
    );

    res.json({ nmcs_events: result.rows, count: result.rows.length });
  } catch (err) {
    console.error('GET /api/aircraft/nmcs/open error:', err);
    res.status(500).json({ error: 'Failed to fetch NMCS events' });
  }
});

module.exports = router;
