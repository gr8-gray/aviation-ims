'use strict';

/**
 * Inventory Routes
 *
 * Covers:
 *   - Stock levels (on-hand, due-in, on-order per NSN/unit)
 *   - Issue parts (record BUNO + JCN/MCN, decrement on-hand)
 *   - Receive (match to open req or direct receipt)
 *   - Turn-in / DRMO routing
 *   - Repairable exchange (RFI issue → NRFI return → ICRL routing → DD-1149)
 *   - Inter-site transfer (DD-1149)
 *   - Inventory adjustment (with audit log, no approval gate)
 *   - ICRL upload and capability code lookup
 */

const express  = require('express');
const pool     = require('../db/pool');
const milstrip = require('../lib/milstrip');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// ---------------------------------------------------------------------------
// GET /api/inventory
// Stock snapshot for user's unit.
// ?nsn=   filter by NSN
// ?low=true  only items at or below reorder point
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const { nsn, low, limit = 100, offset = 0 } = req.query;
    const unitId = req.user.unit_id;

    const conditions = ['inv.unit_id = $1'];
    const params     = [unitId];
    let   p          = 2;

    if (nsn) {
      conditions.push(`inv.nsn = $${p++}`);
      params.push(nsn.toUpperCase());
    }
    if (low === 'true') {
      conditions.push('inv.qty_on_hand <= inv.reorder_point');
    }

    const result = await pool.query(
      `SELECT inv.*,
              pm.description, pm.unit_of_issue, pm.unit_price, pm.flis_verified
       FROM inventory inv
       JOIN parts_master pm ON pm.nsn = inv.nsn
       WHERE ${conditions.join(' AND ')}
       ORDER BY
         CASE WHEN inv.qty_on_hand <= inv.reorder_point THEN 0 ELSE 1 END,
         pm.description
       LIMIT $${p++} OFFSET $${p++}`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    res.json({ inventory: result.rows, count: result.rows.length });
  } catch (err) {
    console.error('GET /api/inventory error:', err);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/inventory/issue
// Issue parts to maintenance. Decrements qty_on_hand, logs transaction.
// Body: { nsn, quantity, aircraft_id?, buno?, jcn?, mcn?, condition?='RFI' }
// ---------------------------------------------------------------------------
router.post('/issue', async (req, res) => {
  const {
    nsn,
    quantity    = 1,
    aircraft_id = null,
    jcn         = null,
    mcn         = null,
    condition   = 'RFI',
    notes       = null,
  } = req.body;

  if (!nsn) return res.status(400).json({ error: 'nsn is required' });
  if (!['RFI', 'NRFI'].includes(condition)) {
    return res.status(400).json({ error: 'condition must be RFI or NRFI' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const inv = await client.query(
      `SELECT * FROM inventory WHERE nsn=$1 AND unit_id=$2 AND condition=$3 FOR UPDATE`,
      [nsn, req.user.unit_id, condition]
    );

    if (inv.rows.length === 0 || inv.rows[0].qty_on_hand < parseInt(quantity)) {
      await client.query('ROLLBACK');
      const available = inv.rows[0]?.qty_on_hand ?? 0;
      return res.status(409).json({
        error:     `Insufficient stock. Available: ${available}, requested: ${quantity}`,
        available,
      });
    }

    await client.query(
      `UPDATE inventory SET qty_on_hand = qty_on_hand - $1, updated_at=NOW()
       WHERE nsn=$2 AND unit_id=$3 AND condition=$4`,
      [parseInt(quantity), nsn, req.user.unit_id, condition]
    );

    const tx = await client.query(
      `INSERT INTO transactions
         (type, nsn, aircraft_id, jcn, mcn, unit_id, performed_by, quantity, condition_in, condition_out, notes)
       VALUES ('issue',$1,$2,$3,$4,$5,$6,$7,$8,$8,$9)
       RETURNING *`,
      [nsn, aircraft_id, jcn, mcn, req.user.unit_id, req.user.user_id, parseInt(quantity), condition, notes]
    );

    await client.query('COMMIT');
    res.status(201).json({ transaction: tx.rows[0], message: 'Issued successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /api/inventory/issue error:', err);
    res.status(500).json({ error: 'Issue failed' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// POST /api/inventory/receive
// Receive parts. Optionally match to open requisition.
// Body: { nsn, quantity, req_id?, condition?='RFI', document_number? }
// ---------------------------------------------------------------------------
router.post('/receive', async (req, res) => {
  const {
    nsn,
    quantity        = 1,
    req_id          = null,
    condition       = 'RFI',
    document_number = null,
    notes           = null,
  } = req.body;

  if (!nsn) return res.status(400).json({ error: 'nsn is required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Upsert inventory record
    await client.query(
      `INSERT INTO inventory (nsn, unit_id, qty_on_hand, qty_on_order, qty_due_in, condition)
       VALUES ($1,$2,$3,0,0,$4)
       ON CONFLICT (nsn, unit_id, condition) DO UPDATE
         SET qty_on_hand  = inventory.qty_on_hand + $3,
             qty_on_order = GREATEST(0, inventory.qty_on_order - $3),
             qty_due_in   = GREATEST(0, inventory.qty_due_in - $3),
             updated_at   = NOW()`,
      [nsn, req.user.unit_id, parseInt(quantity), condition]
    );

    // Mark req received if provided
    if (req_id) {
      await client.query(
        `UPDATE requisitions SET status='received', updated_at=NOW() WHERE req_id=$1 AND unit_id=$2`,
        [req_id, req.user.unit_id]
      );
    }

    const tx = await client.query(
      `INSERT INTO transactions
         (type, nsn, unit_id, performed_by, quantity, condition_out, document_number, notes)
       VALUES ('receipt',$1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [nsn, req.user.unit_id, req.user.user_id, parseInt(quantity), condition, document_number, notes]
    );

    await client.query('COMMIT');
    res.status(201).json({ transaction: tx.rows[0], message: 'Received successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /api/inventory/receive error:', err);
    res.status(500).json({ error: 'Receive failed' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// POST /api/inventory/turn-in
// Turn in a part — routes to stock (RFI) or DRMO queue (NRFI, no ICRL match).
// Body: { nsn, quantity, condition, aircraft_id?, jcn?, notes? }
// ---------------------------------------------------------------------------
router.post('/turn-in', async (req, res) => {
  const {
    nsn,
    quantity    = 1,
    condition   = 'RFI',
    aircraft_id = null,
    jcn         = null,
    notes       = null,
  } = req.body;

  if (!nsn) return res.status(400).json({ error: 'nsn is required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // If RFI, return to stock. If NRFI, check ICRL.
    let disposition = 'stock';
    let icrlRecord  = null;

    if (condition === 'NRFI') {
      const icrl = await client.query(
        `SELECT * FROM icrl WHERE nsn=$1 ORDER BY effective_date DESC LIMIT 1`,
        [nsn]
      );
      if (icrl.rows.length > 0) {
        icrlRecord  = icrl.rows[0];
        disposition = icrlRecord.repair_source; // 'i_level' or 'commercial'
      } else {
        disposition = 'drmo'; // No ICRL entry — route to DRMO
      }
    }

    if (condition === 'RFI' || disposition === 'stock') {
      await client.query(
        `INSERT INTO inventory (nsn, unit_id, qty_on_hand, condition)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (nsn, unit_id, condition) DO UPDATE
           SET qty_on_hand = inventory.qty_on_hand + $3,
               updated_at  = NOW()`,
        [nsn, req.user.unit_id, parseInt(quantity), condition]
      );
    }

    const tx = await client.query(
      `INSERT INTO transactions
         (type, nsn, aircraft_id, jcn, unit_id, performed_by, quantity, condition_in, condition_out, notes)
       VALUES ('turn_in',$1,$2,$3,$4,$5,$6,$7,$7,$8)
       RETURNING *`,
      [nsn, aircraft_id, jcn, req.user.unit_id, req.user.user_id, parseInt(quantity), condition, notes]
    );

    await client.query('COMMIT');
    res.status(201).json({
      transaction: tx.rows[0],
      disposition,
      icrl:        icrlRecord,
      message:     disposition === 'commercial'
        ? 'NRFI — route to commercial repair (X1). Generate DD-1149 via /inventory/dd1149.'
        : disposition === 'i_level'
        ? 'NRFI — route to I-level shop.'
        : disposition === 'drmo'
        ? 'NRFI — no ICRL entry. Route to DRMO.'
        : 'Turned in to stock.',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /api/inventory/turn-in error:', err);
    res.status(500).json({ error: 'Turn-in failed' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// POST /api/inventory/repairable-exchange
// RFI out → NRFI in (exchange). Checks ICRL, generates DD-1149 if X1.
// Body: { nsn, quantity, aircraft_id?, jcn?, mcn?, vendor? }
// ---------------------------------------------------------------------------
router.post('/repairable-exchange', async (req, res) => {
  const {
    nsn,
    quantity    = 1,
    aircraft_id = null,
    jcn         = null,
    mcn         = null,
    vendor      = null,
    notes       = null,
  } = req.body;

  if (!nsn) return res.status(400).json({ error: 'nsn is required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check RFI stock available
    const inv = await client.query(
      `SELECT * FROM inventory WHERE nsn=$1 AND unit_id=$2 AND condition='RFI' FOR UPDATE`,
      [nsn, req.user.unit_id]
    );
    if (inv.rows.length === 0 || inv.rows[0].qty_on_hand < parseInt(quantity)) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error:     `Insufficient RFI stock for exchange. Available: ${inv.rows[0]?.qty_on_hand ?? 0}`,
        available: inv.rows[0]?.qty_on_hand ?? 0,
      });
    }

    // Issue RFI
    await client.query(
      `UPDATE inventory SET qty_on_hand=qty_on_hand-$1, updated_at=NOW()
       WHERE nsn=$2 AND unit_id=$3 AND condition='RFI'`,
      [parseInt(quantity), nsn, req.user.unit_id]
    );

    // Return NRFI
    await client.query(
      `INSERT INTO inventory (nsn, unit_id, qty_on_hand, condition)
       VALUES ($1,$2,$3,'NRFI')
       ON CONFLICT (nsn, unit_id, condition) DO UPDATE
         SET qty_on_hand=inventory.qty_on_hand+$3, updated_at=NOW()`,
      [nsn, req.user.unit_id, parseInt(quantity)]
    );

    // Check ICRL
    const icrl = await client.query(
      `SELECT * FROM icrl WHERE nsn=$1 ORDER BY effective_date DESC LIMIT 1`,
      [nsn]
    );
    const icrlRecord    = icrl.rows[0] || null;
    const repairSource  = icrlRecord?.repair_source || 'unknown';
    const capCode       = icrlRecord?.capability_code || '';

    // Log transaction
    const tx = await client.query(
      `INSERT INTO transactions
         (type, nsn, aircraft_id, jcn, mcn, unit_id, performed_by, quantity, condition_in, condition_out, notes)
       VALUES ('repairable_exchange',$1,$2,$3,$4,$5,$6,$7,'RFI','NRFI',$8)
       RETURNING *`,
      [nsn, aircraft_id, jcn, mcn, req.user.unit_id, req.user.user_id, parseInt(quantity), notes]
    );

    // Generate DD-1149 if X1 (commercial repair)
    let dd1149 = null;
    if (capCode === 'X1' || repairSource === 'commercial') {
      const unit = await pool.query('SELECT * FROM units WHERE unit_id=$1', [req.user.unit_id]);
      const part = await pool.query('SELECT * FROM parts_master WHERE nsn=$1', [nsn]);

      dd1149 = milstrip.generateDD1149({
        documentNumber: `REPR-${nsn}-${Date.now()}`,
        nsn,
        description:   part.rows[0]?.description || '',
        quantity:      parseInt(quantity),
        condition:     'NRFI',
        fromUnit:      { name: unit.rows[0]?.name, dodaac: unit.rows[0]?.uic, location: unit.rows[0]?.location },
        toUnit:        vendor
          ? { name: vendor }
          : { name: 'Commercial Repair Vendor (TBD)' },
        purpose:       'REPAIRABLE EXCHANGE — X1 COMMERCIAL REPAIR',
        jcn,
        mcn,
        unitPrice:     part.rows[0]?.unit_price,
      });
    }

    await client.query('COMMIT');
    res.status(201).json({
      transaction:  tx.rows[0],
      icrl:         icrlRecord,
      repair_source: repairSource,
      capability_code: capCode,
      dd1149,
      message:      repairSource === 'commercial'
        ? 'X1 — DD-1149 generated for commercial repair routing.'
        : repairSource === 'i_level'
        ? 'Route NRFI to I-level shop.'
        : 'No ICRL entry found — manual routing required.',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /api/inventory/repairable-exchange error:', err);
    res.status(500).json({ error: 'Repairable exchange failed' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// POST /api/inventory/transfer
// Inter-site transfer. Generates DD-1149. Officer/admin/sncoic only.
// Body: { nsn, quantity, condition, to_unit_id, notes? }
// ---------------------------------------------------------------------------
router.post('/transfer', requireRole(['officer', 'admin', 'sncoic']), async (req, res) => {
  const { nsn, quantity = 1, condition = 'RFI', to_unit_id, notes = null } = req.body;

  if (!nsn)       return res.status(400).json({ error: 'nsn is required' });
  if (!to_unit_id) return res.status(400).json({ error: 'to_unit_id is required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify source stock
    const inv = await client.query(
      `SELECT * FROM inventory WHERE nsn=$1 AND unit_id=$2 AND condition=$3 FOR UPDATE`,
      [nsn, req.user.unit_id, condition]
    );
    if (inv.rows.length === 0 || inv.rows[0].qty_on_hand < parseInt(quantity)) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error:     `Insufficient stock for transfer. Available: ${inv.rows[0]?.qty_on_hand ?? 0}`,
        available: inv.rows[0]?.qty_on_hand ?? 0,
      });
    }

    // Decrement source
    await client.query(
      `UPDATE inventory SET qty_on_hand=qty_on_hand-$1, updated_at=NOW()
       WHERE nsn=$2 AND unit_id=$3 AND condition=$4`,
      [parseInt(quantity), nsn, req.user.unit_id, condition]
    );

    // Increment destination
    await client.query(
      `INSERT INTO inventory (nsn, unit_id, qty_on_hand, condition)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (nsn, unit_id, condition) DO UPDATE
         SET qty_on_hand=inventory.qty_on_hand+$3, updated_at=NOW()`,
      [nsn, parseInt(to_unit_id), parseInt(quantity), condition]
    );

    // Log transaction
    const tx = await client.query(
      `INSERT INTO transactions
         (type, nsn, unit_id, performed_by, quantity, condition_in, condition_out, notes)
       VALUES ('transfer',$1,$2,$3,$4,$5,$5,$6)
       RETURNING *`,
      [nsn, req.user.unit_id, req.user.user_id, parseInt(quantity), condition, notes]
    );

    // Generate DD-1149
    const [fromUnit, toUnit, part] = await Promise.all([
      pool.query('SELECT * FROM units WHERE unit_id=$1', [req.user.unit_id]),
      pool.query('SELECT * FROM units WHERE unit_id=$1', [parseInt(to_unit_id)]),
      pool.query('SELECT * FROM parts_master WHERE nsn=$1', [nsn]),
    ]);

    const dd1149 = milstrip.generateDD1149({
      documentNumber: `XFER-${nsn}-${Date.now()}`,
      nsn,
      description:   part.rows[0]?.description || '',
      quantity:      parseInt(quantity),
      condition,
      fromUnit:      { name: fromUnit.rows[0]?.name, dodaac: fromUnit.rows[0]?.uic, location: fromUnit.rows[0]?.location },
      toUnit:        { name: toUnit.rows[0]?.name, dodaac: toUnit.rows[0]?.uic, location: toUnit.rows[0]?.location },
      purpose:       'INTER-SITE TRANSFER',
      unitPrice:     part.rows[0]?.unit_price,
    });

    await client.query('COMMIT');
    res.status(201).json({ transaction: tx.rows[0], dd1149, message: 'Transfer complete. DD-1149 generated.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /api/inventory/transfer error:', err);
    res.status(500).json({ error: 'Transfer failed' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// POST /api/inventory/adjustment
// Correct qty on hand. Logs with performing clerk EDIPI (non-repudiation).
// No approval gate — commander's discretion per MILSTRIP regs.
// Body: { nsn, condition, new_qty, reason }
// ---------------------------------------------------------------------------
router.post('/adjustment', async (req, res) => {
  const { nsn, condition = 'RFI', new_qty, reason } = req.body;

  if (!nsn)           return res.status(400).json({ error: 'nsn is required' });
  if (new_qty == null) return res.status(400).json({ error: 'new_qty is required' });
  if (!reason)        return res.status(400).json({ error: 'reason is required for audit trail' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const current = await client.query(
      `SELECT qty_on_hand FROM inventory WHERE nsn=$1 AND unit_id=$2 AND condition=$3`,
      [nsn, req.user.unit_id, condition]
    );
    const oldQty = current.rows[0]?.qty_on_hand ?? 0;
    const delta  = parseInt(new_qty) - oldQty;

    await client.query(
      `INSERT INTO inventory (nsn, unit_id, qty_on_hand, condition)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (nsn, unit_id, condition) DO UPDATE
         SET qty_on_hand=$3, updated_at=NOW()`,
      [nsn, req.user.unit_id, parseInt(new_qty), condition]
    );

    const tx = await client.query(
      `INSERT INTO transactions
         (type, nsn, unit_id, performed_by, quantity, condition_out, notes)
       VALUES ('adjustment',$1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [nsn, req.user.unit_id, req.user.user_id, Math.abs(delta), condition, `ADJUSTMENT: ${reason} (${oldQty} → ${new_qty})`]
    );

    await client.query('COMMIT');
    res.status(201).json({
      transaction: tx.rows[0],
      old_qty:     oldQty,
      new_qty:     parseInt(new_qty),
      delta,
      message:     `Adjusted ${nsn} from ${oldQty} to ${new_qty} (${delta >= 0 ? '+' : ''}${delta})`,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /api/inventory/adjustment error:', err);
    res.status(500).json({ error: 'Adjustment failed' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// ICRL Routes
// ---------------------------------------------------------------------------

// POST /api/inventory/icrl
// Upload/update ICRL entries. Officer/admin only.
// Body: { entries: [{ nsn, capability_code, repair_source }] }
router.post('/icrl', requireRole(['officer', 'admin']), async (req, res) => {
  const { entries } = req.body;
  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ error: 'entries array required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let inserted = 0;

    for (const entry of entries) {
      const { nsn, capability_code, repair_source } = entry;
      if (!nsn || !capability_code || !repair_source) continue;
      if (!['i_level', 'commercial'].includes(repair_source)) continue;

      await client.query(
        `INSERT INTO icrl (nsn, capability_code, repair_source, uploaded_by, effective_date)
         VALUES ($1,$2,$3,$4,CURRENT_DATE)
         ON CONFLICT DO NOTHING`,
        [nsn.toUpperCase(), capability_code.toUpperCase(), repair_source, req.user.user_id]
      );
      inserted++;
    }

    await client.query('COMMIT');
    res.status(201).json({ inserted, total: entries.length, message: `ICRL updated: ${inserted} entries` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /api/inventory/icrl error:', err);
    res.status(500).json({ error: 'ICRL upload failed' });
  } finally {
    client.release();
  }
});

// GET /api/inventory/icrl/:nsn
// Look up ICRL entry for a given NSN.
router.get('/icrl/:nsn', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT i.*, u.name AS uploaded_by_name
       FROM icrl i
       LEFT JOIN users u ON u.user_id = i.uploaded_by
       WHERE i.nsn = $1
       ORDER BY i.effective_date DESC
       LIMIT 1`,
      [req.params.nsn.toUpperCase()]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No ICRL entry found for this NSN', nsn: req.params.nsn });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('GET /api/inventory/icrl/:nsn error:', err);
    res.status(500).json({ error: 'ICRL lookup failed' });
  }
});

module.exports = router;
