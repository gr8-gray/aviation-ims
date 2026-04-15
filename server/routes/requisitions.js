'use strict';

/**
 * Requisitions Routes
 *
 * Workflow:
 *   Submit:    POST /api/requisitions          → creates req, generates A0A MILSTRIP
 *   Follow-up: POST /api/requisitions/:id/followup → generates AP1
 *   Cancel:    POST /api/requisitions/:id/cancel   → generates AC1, status → cancelled
 *   OTS Sync:  POST /api/requisitions/ots-sync     → batch status update
 *   Documents: GET  /api/requisitions/:id/milstrip → download MILSTRIP text
 *              GET  /api/requisitions/dd2765        → consolidated DD-2765
 */

const express  = require('express');
const pool     = require('../db/pool');
const milstrip = require('../lib/milstrip');
const otsSync  = require('../lib/ots-sync');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate next serial number for document numbers within a unit today. */
async function nextSerial(unitId) {
  const result = await pool.query(
    `SELECT COUNT(*) + 1 AS next_serial
     FROM requisitions
     WHERE unit_id = $1
       AND DATE(created_at) = CURRENT_DATE`,
    [unitId]
  );
  return parseInt(result.rows[0].next_serial);
}

/** Fetch unit info for document generation. */
async function getUnit(unitId) {
  const result = await pool.query(
    'SELECT * FROM units WHERE unit_id = $1',
    [unitId]
  );
  return result.rows[0] || null;
}

/** Fetch part info for a given NSN. */
async function getPart(nsn) {
  const result = await pool.query(
    'SELECT * FROM parts_master WHERE nsn = $1',
    [nsn]
  );
  return result.rows[0] || null;
}

// ---------------------------------------------------------------------------
// GET /api/requisitions
// List requisitions with filters.
// ?status=submitted|due_in|backordered|shipped|received|cancelled
// ?priority=01|02|03 etc.
// ?aircraft_id=N
// ?unit_id=N (admin/officer only — defaults to req.user.unit_id)
// ?open=true  → all non-cancelled, non-received
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const { status, priority, aircraft_id, open, limit = 100, offset = 0 } = req.query;

    const conditions = [];
    const params     = [];
    let   p          = 1;

    // Scope to user's unit unless officer/admin
    if (!['officer', 'admin'].includes(req.user.role)) {
      conditions.push(`r.unit_id = $${p++}`);
      params.push(req.user.unit_id);
    } else if (req.query.unit_id) {
      conditions.push(`r.unit_id = $${p++}`);
      params.push(parseInt(req.query.unit_id));
    }

    if (open === 'true') {
      conditions.push(`r.status NOT IN ('cancelled','received')`);
    } else if (status) {
      conditions.push(`r.status = $${p++}`);
      params.push(status);
    }

    if (priority) {
      conditions.push(`r.priority = $${p++}`);
      params.push(priority);
    }

    if (aircraft_id) {
      conditions.push(`r.aircraft_id = $${p++}`);
      params.push(parseInt(aircraft_id));
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const result = await pool.query(
      `SELECT r.*,
              pm.description, pm.unit_of_issue, pm.unit_price,
              a.buno, a.mds,
              u.name AS unit_name,
              usr.name AS created_by_name
       FROM requisitions r
       JOIN parts_master pm ON pm.nsn = r.nsn
       LEFT JOIN aircraft a ON a.aircraft_id = r.aircraft_id
       JOIN units u ON u.unit_id = r.unit_id
       JOIN users usr ON usr.user_id = r.created_by
       ${where}
       ORDER BY
         CASE r.priority WHEN '01' THEN 1 WHEN '02' THEN 2 ELSE 3 END,
         r.created_at DESC
       LIMIT $${p++} OFFSET $${p++}`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    res.json({ requisitions: result.rows, count: result.rows.length });
  } catch (err) {
    console.error('GET /api/requisitions error:', err);
    res.status(500).json({ error: 'Failed to fetch requisitions' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/requisitions
// Submit a new requisition. Generates A0A MILSTRIP text.
// Body: { nsn, quantity, priority, fund_code, aircraft_id?, jcn?, mcn?, unit_id? }
// ---------------------------------------------------------------------------
router.post('/', async (req, res) => {
  const {
    nsn,
    quantity   = 1,
    priority   = '03',
    fund_code,
    aircraft_id,
    jcn,
    mcn,
  } = req.body;

  if (!nsn)       return res.status(400).json({ error: 'nsn is required' });
  if (!fund_code) return res.status(400).json({ error: 'fund_code is required' });

  const unitId = req.user.unit_id;
  if (!unitId) {
    return res.status(403).json({ error: 'User is not assigned to a unit — contact admin' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const [unit, part] = await Promise.all([getUnit(unitId), getPart(nsn)]);
    if (!part) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: `Part not found: ${nsn}` });
    }
    if (!unit) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Unit not found' });
    }

    // Build document number: DoDAAC(6) + Julian(5) + Serial(4) = 15 chars
    const serial     = await nextSerial(unitId);
    const dodaac     = (unit.uic || '000000').substring(0, 6).padEnd(6, '0');
    const documentNumber = milstrip.buildDocumentNumber(dodaac, serial);

    // Generate A0A MILSTRIP line
    const milstripLine = milstrip.generateA0A({
      nsn,
      quantity:       parseInt(quantity),
      priority:       String(priority).padStart(2, '0'),
      fundCode:       String(fund_code).padEnd(2, ' '),
      documentNumber,
    });

    // Insert requisition
    const result = await client.query(
      `INSERT INTO requisitions
         (document_number, type, nsn, aircraft_id, jcn, mcn, unit_id, created_by, priority, fund_code, status, quantity)
       VALUES ($1,'A0A',$2,$3,$4,$5,$6,$7,$8,$9,'submitted',$10)
       RETURNING *`,
      [
        documentNumber,
        nsn,
        aircraft_id || null,
        jcn         || null,
        mcn         || null,
        unitId,
        req.user.user_id,
        String(priority).padStart(2, '0'),
        fund_code,
        parseInt(quantity),
      ]
    );

    // Update inventory qty_on_order
    await client.query(
      `INSERT INTO inventory (nsn, unit_id, qty_on_order, qty_on_hand, qty_due_in)
       VALUES ($1, $2, $3, 0, 0)
       ON CONFLICT (nsn, unit_id, condition) DO UPDATE
         SET qty_on_order = inventory.qty_on_order + $3,
             updated_at   = NOW()`,
      [nsn, unitId, parseInt(quantity)]
    );

    await client.query('COMMIT');

    res.status(201).json({
      requisition: result.rows[0],
      milstrip:    milstripLine,
      message:     `A0A generated. Document: ${documentNumber}`,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /api/requisitions error:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Document number conflict — retry' });
    }
    res.status(500).json({ error: 'Failed to submit requisition' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// GET /api/requisitions/dd2765
// Generate consolidated DD-2765 for open requisitions.
// ?unit_id=N  (admin/officer — defaults to user's unit)
// ?status=submitted|due_in|backordered  (default: all open)
// ---------------------------------------------------------------------------
router.get('/dd2765', async (req, res) => {
  try {
    const unitId = ['officer', 'admin'].includes(req.user.role) && req.query.unit_id
      ? parseInt(req.query.unit_id)
      : req.user.unit_id;

    const result = await pool.query(
      `SELECT r.document_number, r.nsn, r.quantity, r.priority, r.fund_code,
              pm.description, pm.unit_price
       FROM requisitions r
       JOIN parts_master pm ON pm.nsn = r.nsn
       WHERE r.unit_id = $1
         AND r.status NOT IN ('received','cancelled')
       ORDER BY r.priority, r.created_at`,
      [unitId]
    );

    const unit = await getUnit(unitId);
    const text = milstrip.generateDD2765(result.rows, {
      name:    unit?.name,
      dodaac:  unit?.uic,
      location: unit?.location,
    });

    res.set('Content-Type', 'text/plain');
    res.set('Content-Disposition', `attachment; filename="DD2765_${milstrip.julianDate()}.txt"`);
    res.send(text);
  } catch (err) {
    console.error('GET /api/requisitions/dd2765 error:', err);
    res.status(500).json({ error: 'Failed to generate DD-2765' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/requisitions/ots-sync
// Batch OTS status sync for all open requisitions in user's unit.
// Officer/admin only.
// ---------------------------------------------------------------------------
router.post('/ots-sync', requireRole(['officer', 'admin']), async (req, res) => {
  try {
    const unitId = req.user.unit_id;
    const result = await pool.query(
      `SELECT req_id, document_number FROM requisitions
       WHERE unit_id = $1 AND status NOT IN ('received','cancelled')`,
      [unitId]
    );

    if (result.rows.length === 0) {
      return res.json({ message: 'No open requisitions to sync', synced: 0 });
    }

    const docNums    = result.rows.map((r) => r.document_number);
    const syncResult = await otsSync.syncBatch(docNums);

    // Update ots_last_sync timestamp (status update happens when OTS impl is live)
    await pool.query(
      `UPDATE requisitions SET ots_last_sync = NOW()
       WHERE unit_id = $1 AND status NOT IN ('received','cancelled')`,
      [unitId]
    );

    res.json({
      synced:  result.rows.length,
      results: syncResult,
      note:    'OTS sync is a stub — real status not yet updated. See server/lib/ots-sync.js.',
    });
  } catch (err) {
    console.error('POST /api/requisitions/ots-sync error:', err);
    res.status(500).json({ error: 'OTS sync failed' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/requisitions/:id
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*,
              pm.description, pm.unit_of_issue, pm.unit_price,
              a.buno, a.mds,
              u.name AS unit_name, u.uic, u.location,
              usr.name AS created_by_name
       FROM requisitions r
       JOIN parts_master pm ON pm.nsn = r.nsn
       LEFT JOIN aircraft a  ON a.aircraft_id = r.aircraft_id
       JOIN units u           ON u.unit_id = r.unit_id
       JOIN users usr          ON usr.user_id = r.created_by
       WHERE r.req_id = $1`,
      [parseInt(req.params.id)]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Requisition not found' });

    const req_ = result.rows[0];
    // Scope check
    if (!['officer', 'admin'].includes(req.user.role) && req_.unit_id !== req.user.unit_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(req_);
  } catch (err) {
    console.error('GET /api/requisitions/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch requisition' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/requisitions/:id/milstrip
// Download MILSTRIP text for a requisition.
// ?type=A0A|AP1|AC1  (default: matches req type)
// ---------------------------------------------------------------------------
router.get('/:id/milstrip', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, u.uic, u.name AS unit_name
       FROM requisitions r
       JOIN units u ON u.unit_id = r.unit_id
       WHERE r.req_id = $1`,
      [parseInt(req.params.id)]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Requisition not found' });

    const req_ = result.rows[0];
    const diType = (req.query.type || req_.type || 'A0A').toUpperCase();

    let line;
    const opts = {
      nsn:            req_.nsn,
      quantity:       req_.quantity,
      priority:       req_.priority,
      fundCode:       req_.fund_code,
      documentNumber: req_.document_number,
    };

    if      (diType === 'AP1') line = milstrip.generateAP1(opts);
    else if (diType === 'AC1') line = milstrip.generateAC1(opts);
    else                       line = milstrip.generateA0A(opts);

    res.set('Content-Type', 'text/plain');
    res.set('Content-Disposition', `attachment; filename="${diType}_${req_.document_number}.txt"`);
    res.send(line + '\n');
  } catch (err) {
    console.error('GET /api/requisitions/:id/milstrip error:', err);
    res.status(500).json({ error: 'Failed to generate MILSTRIP' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/requisitions/:id/followup
// Generate AP1 follow-up and update status to backordered if not already.
// ---------------------------------------------------------------------------
router.post('/:id/followup', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, u.uic FROM requisitions r JOIN units u ON u.unit_id = r.unit_id WHERE r.req_id = $1`,
      [parseInt(req.params.id)]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Requisition not found' });

    const req_ = result.rows[0];
    if (req_.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot follow up a cancelled requisition' });
    }
    if (req_.status === 'received') {
      return res.status(400).json({ error: 'Requisition already received' });
    }

    const ap1 = milstrip.generateAP1({
      nsn:            req_.nsn,
      quantity:       req_.quantity,
      priority:       req_.priority,
      fundCode:       req_.fund_code,
      documentNumber: req_.document_number,
    });

    // Escalate to backordered if still submitted
    if (req_.status === 'submitted') {
      await pool.query(
        `UPDATE requisitions SET status='backordered', type='AP1', updated_at=NOW() WHERE req_id=$1`,
        [req_.req_id]
      );
    }

    res.json({ milstrip: ap1, document_number: req_.document_number, message: 'AP1 generated' });
  } catch (err) {
    console.error('POST /api/requisitions/:id/followup error:', err);
    res.status(500).json({ error: 'Failed to generate follow-up' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/requisitions/:id/cancel
// Generate AC1 cancellation and set status to cancelled.
// ---------------------------------------------------------------------------
router.post('/:id/cancel', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `SELECT r.*, u.uic FROM requisitions r JOIN units u ON u.unit_id = r.unit_id WHERE r.req_id = $1`,
      [parseInt(req.params.id)]
    );
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Requisition not found' });
    }

    const req_ = result.rows[0];
    if (req_.status === 'cancelled') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Already cancelled' });
    }
    if (req_.status === 'received') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cannot cancel a received requisition' });
    }

    const ac1 = milstrip.generateAC1({
      nsn:            req_.nsn,
      quantity:       req_.quantity,
      priority:       req_.priority,
      fundCode:       req_.fund_code,
      documentNumber: req_.document_number,
    });

    await client.query(
      `UPDATE requisitions SET status='cancelled', type='AC1', updated_at=NOW() WHERE req_id=$1`,
      [req_.req_id]
    );

    // Reduce inventory qty_on_order
    await client.query(
      `UPDATE inventory SET qty_on_order = GREATEST(0, qty_on_order - $1), updated_at=NOW()
       WHERE nsn=$2 AND unit_id=$3`,
      [req_.quantity, req_.nsn, req_.unit_id]
    );

    await client.query('COMMIT');
    res.json({ milstrip: ac1, document_number: req_.document_number, message: 'AC1 generated — requisition cancelled' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /api/requisitions/:id/cancel error:', err);
    res.status(500).json({ error: 'Failed to cancel requisition' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// PUT /api/requisitions/:id/status
// Officer/admin: manually update requisition status.
// Body: { status: 'due_in'|'backordered'|'shipped'|'received'|'cancelled' }
// ---------------------------------------------------------------------------
router.put('/:id/status', requireRole(['officer', 'admin', 'sncoic']), async (req, res) => {
  const { status } = req.body;
  const valid = ['submitted', 'due_in', 'backordered', 'shipped', 'received', 'cancelled'];
  if (!valid.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${valid.join(', ')}` });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE requisitions SET status=$1, updated_at=NOW() WHERE req_id=$2 RETURNING *`,
      [status, parseInt(req.params.id)]
    );
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Requisition not found' });
    }

    const req_ = result.rows[0];

    // On receipt: update inventory
    if (status === 'received') {
      await client.query(
        `UPDATE inventory
         SET qty_on_hand  = qty_on_hand + $1,
             qty_on_order = GREATEST(0, qty_on_order - $1),
             qty_due_in   = GREATEST(0, qty_due_in - $1),
             updated_at   = NOW()
         WHERE nsn=$2 AND unit_id=$3`,
        [req_.quantity, req_.nsn, req_.unit_id]
      );

      // Log receipt transaction
      await client.query(
        `INSERT INTO transactions (type, nsn, unit_id, performed_by, quantity, condition_out, document_number)
         VALUES ('receipt', $1, $2, $3, $4, 'RFI', $5)`,
        [req_.nsn, req_.unit_id, req.user.user_id, req_.quantity, req_.document_number]
      );
    }

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('PUT /api/requisitions/:id/status error:', err);
    res.status(500).json({ error: 'Failed to update status' });
  } finally {
    client.release();
  }
});

module.exports = router;
