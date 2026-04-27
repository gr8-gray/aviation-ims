'use strict';

/**
 * Repairables Routes
 *
 * Serialized item tracking + DIFM (Due-In From Maintenance) queue.
 *
 *   GET  /api/repairables/serialized            List tracked serialized items
 *   POST /api/repairables/serialized            Add serialized item
 *   PUT  /api/repairables/serialized/:id        Update item (condition, location, etc.)
 *
 *   GET  /api/repairables/difm                  DIFM queue (default: open only)
 *   POST /api/repairables/difm                  Send item to maintenance (open DIFM)
 *   PUT  /api/repairables/difm/:id/receive      Receive back from maintenance (close DIFM)
 */

const express = require('express');
const multer  = require('multer');
const ExcelJS = require('exceljs');
const pool    = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const router = express.Router();
router.use(requireAuth);

// ---------------------------------------------------------------------------
// GET /api/repairables/serialized
// List all serialized items for unit. Filter by ?nsn= ?location= ?condition=
// ---------------------------------------------------------------------------
router.get('/serialized', async (req, res) => {
  try {
    const { nsn, location, condition } = req.query;
    const unitId = req.user.unit_id;

    const conditions = ['si.unit_id = $1'];
    const params     = [unitId];
    let   p          = 2;

    if (nsn)       { conditions.push(`si.nsn = $${p++}`);       params.push(nsn.toUpperCase()); }
    if (location)  { conditions.push(`si.location = $${p++}`);  params.push(location); }
    if (condition) { conditions.push(`si.condition = $${p++}`); params.push(condition); }

    const result = await pool.query(
      `SELECT si.*,
              pm.description,
              pm.unit_of_issue,
              a.buno,
              a.mds
       FROM serialized_items si
       LEFT JOIN parts_master pm ON pm.nsn        = si.nsn
       LEFT JOIN aircraft a      ON a.aircraft_id = si.aircraft_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY si.updated_at DESC`,
      params
    );

    res.json({ items: result.rows, count: result.rows.length });
  } catch (err) {
    console.error('GET /api/repairables/serialized error:', err);
    res.status(500).json({ error: 'Failed to fetch serialized items' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/repairables/serialized
// Register a new serialized item.
// Body: { nsn, serial_number, condition?, location?, aircraft_id?, jcn?, notes? }
// ---------------------------------------------------------------------------
router.post('/serialized', async (req, res) => {
  const {
    nsn,
    serial_number,
    condition   = 'RFI',
    location    = 'storage',
    aircraft_id = null,
    jcn         = null,
    notes       = null,
  } = req.body;

  if (!nsn)           return res.status(400).json({ error: 'nsn is required' });
  if (!serial_number) return res.status(400).json({ error: 'serial_number is required' });

  try {
    const result = await pool.query(
      `INSERT INTO serialized_items
         (nsn, serial_number, unit_id, condition, location, aircraft_id, jcn, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (nsn, serial_number, unit_id) DO UPDATE
         SET condition=EXCLUDED.condition, location=EXCLUDED.location,
             aircraft_id=EXCLUDED.aircraft_id, jcn=EXCLUDED.jcn,
             notes=EXCLUDED.notes, updated_at=NOW()
       RETURNING *`,
      [nsn.toUpperCase(), serial_number, req.user.unit_id, condition, location, aircraft_id, jcn, notes]
    );
    res.status(201).json({ item: result.rows[0] });
  } catch (err) {
    console.error('POST /api/repairables/serialized error:', err);
    res.status(500).json({ error: 'Failed to add serialized item' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/repairables/serialized/:id
// Update a serialized item's condition, location, aircraft assignment.
// Body: { condition?, location?, aircraft_id?, jcn?, notes? }
// ---------------------------------------------------------------------------
router.put('/serialized/:id', async (req, res) => {
  const { condition, location, aircraft_id, jcn, notes } = req.body;

  try {
    const existing = await pool.query(
      'SELECT * FROM serialized_items WHERE item_id=$1 AND unit_id=$2',
      [parseInt(req.params.id), req.user.unit_id]
    );
    if (!existing.rows.length) return res.status(404).json({ error: 'Item not found' });

    const cur = existing.rows[0];
    const result = await pool.query(
      `UPDATE serialized_items
       SET condition   = $1,
           location    = $2,
           aircraft_id = $3,
           jcn         = $4,
           notes       = $5,
           updated_at  = NOW()
       WHERE item_id = $6 AND unit_id = $7
       RETURNING *`,
      [
        condition   ?? cur.condition,
        location    ?? cur.location,
        aircraft_id !== undefined ? aircraft_id : cur.aircraft_id,
        jcn         !== undefined ? jcn         : cur.jcn,
        notes       !== undefined ? notes       : cur.notes,
        parseInt(req.params.id),
        req.user.unit_id,
      ]
    );
    res.json({ item: result.rows[0] });
  } catch (err) {
    console.error('PUT /api/repairables/serialized/:id error:', err);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/repairables/difm
// DIFM queue. Default: open items (status=in_repair).
// ?all=true to include returned/condemned.
// ---------------------------------------------------------------------------
router.get('/difm', async (req, res) => {
  try {
    const { all } = req.query;
    const unitId = req.user.unit_id;

    const statusFilter = all === 'true' ? '' : "AND d.status = 'in_repair'";

    const result = await pool.query(
      `SELECT d.*,
              pm.description,
              pm.unit_of_issue,
              u_out.name AS turned_in_by_name,
              u_in.name  AS received_by_name,
              ROUND(EXTRACT(EPOCH FROM (COALESCE(d.returned_at, NOW()) - d.turned_in_at))/86400) AS days_out,
              CASE
                WHEN d.status = 'in_repair' AND d.expected_return IS NOT NULL
                  AND NOW() > d.expected_return THEN true
                ELSE false
              END AS overdue
       FROM difm_queue d
       LEFT JOIN parts_master pm ON pm.nsn       = d.nsn
       LEFT JOIN users u_out     ON u_out.user_id = d.turned_in_by
       LEFT JOIN users u_in      ON u_in.user_id  = d.received_by
       WHERE d.unit_id = $1 ${statusFilter}
       ORDER BY
         CASE d.status WHEN 'in_repair' THEN 0 ELSE 1 END,
         d.turned_in_at`,
      [unitId]
    );

    const open    = result.rows.filter(r => r.status === 'in_repair').length;
    const overdue = result.rows.filter(r => r.overdue).length;
    const avg_days = open > 0
      ? Math.round(result.rows.filter(r => r.status === 'in_repair')
          .reduce((s, r) => s + Number(r.days_out), 0) / open)
      : 0;

    res.json({ items: result.rows, count: result.rows.length, open, overdue, avg_days });
  } catch (err) {
    console.error('GET /api/repairables/difm error:', err);
    res.status(500).json({ error: 'Failed to fetch DIFM queue' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/repairables/difm
// Send item to maintenance. Creates DIFM record, updates serialized item if linked.
// Body: { nsn, serial_number?, item_id?, quantity?, shop, shop_name?, document_number?, jcn?, expected_return?, notes? }
// ---------------------------------------------------------------------------
router.post('/difm', async (req, res) => {
  const {
    nsn,
    serial_number   = null,
    item_id         = null,
    quantity        = 1,
    shop,
    shop_name       = null,
    document_number = null,
    jcn             = null,
    expected_return = null,
    notes           = null,
  } = req.body;

  if (!nsn)  return res.status(400).json({ error: 'nsn is required' });
  if (!shop) return res.status(400).json({ error: 'shop is required (i_level / depot / commercial)' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const difm = await client.query(
      `INSERT INTO difm_queue
         (nsn, serial_number, item_id, unit_id, quantity, condition_out, shop, shop_name,
          document_number, jcn, expected_return, turned_in_by, notes)
       VALUES ($1,$2,$3,$4,$5,'NRFI',$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        nsn.toUpperCase(), serial_number, item_id,
        req.user.unit_id, parseInt(quantity),
        shop, shop_name, document_number, jcn,
        expected_return || null,
        req.user.user_id, notes,
      ]
    );

    if (item_id) {
      await client.query(
        `UPDATE serialized_items
         SET condition='in_repair', location=$1, jcn=$2, updated_at=NOW()
         WHERE item_id=$3 AND unit_id=$4`,
        [shop === 'i_level' ? 'i_level' : shop === 'depot' ? 'depot' : 'vendor',
         jcn, parseInt(item_id), req.user.unit_id]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ difm: difm.rows[0], message: 'DIFM record created' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /api/repairables/difm error:', err);
    res.status(500).json({ error: 'Failed to create DIFM record' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// PUT /api/repairables/difm/:id/receive
// Receive item back from maintenance. Closes DIFM, updates serialized item.
// Body: { condition_in, status?, notes? }
// ---------------------------------------------------------------------------
router.put('/difm/:id/receive', async (req, res) => {
  const { condition_in = 'RFI', status = 'returned', notes = null } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const difm = await client.query(
      `UPDATE difm_queue
       SET status='returned', condition_in=$1, returned_at=NOW(),
           received_by=$2, notes=COALESCE($3, notes), updated_at=NOW()
       WHERE difm_id=$4 AND unit_id=$5 AND status='in_repair'
       RETURNING *`,
      [condition_in, req.user.user_id, notes, parseInt(req.params.id), req.user.unit_id]
    );

    if (!difm.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'DIFM record not found or already closed' });
    }

    const record = difm.rows[0];
    if (record.item_id) {
      await client.query(
        `UPDATE serialized_items
         SET condition=$1, location='storage', updated_at=NOW()
         WHERE item_id=$2 AND unit_id=$3`,
        [condition_in === 'RFI' ? 'RFI' : 'NRFI', record.item_id, req.user.unit_id]
      );
    }

    await client.query('COMMIT');
    res.json({ difm: record, message: `Received back — condition: ${condition_in}` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('PUT /api/repairables/difm/:id/receive error:', err);
    res.status(500).json({ error: 'Failed to close DIFM record' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// GET /api/repairables/routing/:pn
// Auto-routing decision for a part number.
// Priority: commercial repair list → ICRL → OTS default
// ---------------------------------------------------------------------------
router.get('/routing/:pn', async (req, res) => {
  try {
    const pn     = req.params.pn.toUpperCase().trim();
    const unitId = req.user.unit_id;

    // 1. Check commercial repair list first
    const crl = await pool.query(
      `SELECT * FROM commercial_repair_list
       WHERE unit_id=$1 AND (part_number=$2 OR nsn=$2)
       ORDER BY effective_date DESC LIMIT 1`,
      [unitId, pn]
    );
    if (crl.rows.length) {
      return res.json({
        type:        'commercial',
        shop:        'commercial',
        shop_name:   crl.rows[0].vendor_name,
        vendor_name: crl.rows[0].vendor_name,
        description: crl.rows[0].description,
        reason:      `On commercial repair list → ${crl.rows[0].vendor_name}`,
        source:      'commercial_repair_list',
      });
    }

    // 2. Check ICRL
    const icrl = await pool.query(
      `SELECT * FROM icrl
       WHERE unit_id=$1 AND (part_number=$2 OR nsn=$2)
       ORDER BY effective_date DESC LIMIT 1`,
      [unitId, pn]
    );
    if (icrl.rows.length) {
      const entry = icrl.rows[0];
      if (entry.capability_code === 'X1') {
        return res.json({
          type:        'ots',
          shop:        'depot',
          shop_name:   null,
          description: entry.description,
          reason:      'ICRL X1 — not on commercial repair list → OTS',
          source:      'icrl',
        });
      }
      return res.json({
        type:        'i_level',
        shop:        'i_level',
        shop_name:   entry.work_center || null,
        work_center: entry.work_center || null,
        description: entry.description,
        cap_code:    entry.capability_code,
        reason:      `ICRL ${entry.capability_code} — I-level repairable${entry.work_center ? ` (${entry.work_center})` : ''}`,
        source:      'icrl',
      });
    }

    // 3. Default — OTS
    return res.json({
      type:    'ots',
      shop:    'depot',
      shop_name: null,
      reason:  'No ICRL entry — defaulting to OTS',
      source:  'default',
    });
  } catch (err) {
    console.error('GET /api/repairables/routing/:pn error:', err);
    res.status(500).json({ error: 'Routing lookup failed' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/repairables/icrl
// List current ICRL entries for unit.
// ---------------------------------------------------------------------------
router.get('/icrl', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM icrl WHERE unit_id=$1 ORDER BY part_number NULLS LAST, nsn`,
      [req.user.unit_id]
    );
    res.json({ entries: result.rows, count: result.rows.length });
  } catch (err) {
    console.error('GET /api/repairables/icrl error:', err);
    res.status(500).json({ error: 'Failed to fetch ICRL' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/repairables/icrl/upload
// Full-replace ICRL from Excel. Officer/admin only.
// Expected columns: P/N, NSN, Description, Work Center, Capability Code
// ---------------------------------------------------------------------------
router.post('/icrl/upload', requireRole(['officer', 'admin']),
  upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(req.file.buffer);
  } catch {
    return res.status(400).json({ error: 'Invalid Excel file' });
  }

  const ws = wb.worksheets[0];
  if (!ws) return res.status(400).json({ error: 'No worksheet found' });

  // Header detection — normalize to lowercase, strip spaces
  const headerRow = ws.getRow(1).values.slice(1).map(v => String(v||'').toLowerCase().replace(/[\s\/]/g,''));
  const col = (names) => {
    for (const n of names) {
      const i = headerRow.findIndex(h => h.includes(n));
      if (i >= 0) return i + 1; // 1-indexed
    }
    return null;
  };

  const colPN   = col(['p/n','pn','partnumber','part']) ?? 1;
  const colNSN  = col(['nsn','stocknumber'])             ?? 2;
  const colDesc = col(['description','desc'])            ?? 3;
  const colWC   = col(['workcenter','wc','shop','center'])??4;
  const colCap  = col(['cap','capability','code'])       ?? 5;

  const entries = [];
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return; // skip header
    const pn   = String(row.getCell(colPN).value  || '').trim().toUpperCase();
    const nsn  = String(row.getCell(colNSN).value || '').trim().toUpperCase() || null;
    const desc = String(row.getCell(colDesc).value|| '').trim() || null;
    const wc   = String(row.getCell(colWC).value  || '').trim() || null;
    const cap  = String(row.getCell(colCap).value || '').trim().toUpperCase() || null;
    if (!pn) return;
    entries.push([pn, nsn, desc, wc, cap]);
  });

  if (!entries.length) return res.status(400).json({ error: 'No data rows found in file' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM icrl WHERE unit_id=$1', [req.user.unit_id]);
    for (const [pn, nsn, desc, wc, cap] of entries) {
      await client.query(
        `INSERT INTO icrl (part_number, nsn, description, work_center, capability_code, repair_source, unit_id, uploaded_by, effective_date)
         VALUES ($1,$2,$3,$4,$5,
           CASE WHEN $5='X1' THEN 'commercial' ELSE 'i_level' END,
           $6,$7,CURRENT_DATE)`,
        [pn, nsn, desc, wc, cap, req.user.unit_id, req.user.user_id]
      );
    }
    await client.query('COMMIT');
    res.json({ inserted: entries.length, message: `ICRL replaced — ${entries.length} entries loaded` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('ICRL upload error:', err);
    res.status(500).json({ error: 'ICRL upload failed' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// GET /api/repairables/crl
// List commercial repair list entries for unit.
// ---------------------------------------------------------------------------
router.get('/crl', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM commercial_repair_list WHERE unit_id=$1 ORDER BY part_number`,
      [req.user.unit_id]
    );
    res.json({ entries: result.rows, count: result.rows.length });
  } catch (err) {
    console.error('GET /api/repairables/crl error:', err);
    res.status(500).json({ error: 'Failed to fetch commercial repair list' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/repairables/crl/upload
// Full-replace commercial repair list from Excel. Officer/admin only.
// Expected columns: P/N, NSN, Description, Vendor
// ---------------------------------------------------------------------------
router.post('/crl/upload', requireRole(['officer', 'admin']),
  upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(req.file.buffer);
  } catch {
    return res.status(400).json({ error: 'Invalid Excel file' });
  }

  const ws = wb.worksheets[0];
  if (!ws) return res.status(400).json({ error: 'No worksheet found' });

  const headerRow = ws.getRow(1).values.slice(1).map(v => String(v||'').toLowerCase().replace(/[\s\/]/g,''));
  const col = (names) => {
    for (const n of names) {
      const i = headerRow.findIndex(h => h.includes(n));
      if (i >= 0) return i + 1;
    }
    return null;
  };

  const colPN     = col(['p/n','pn','partnumber','part']) ?? 1;
  const colNSN    = col(['nsn','stocknumber'])             ?? 2;
  const colDesc   = col(['description','desc'])            ?? 3;
  const colVendor = col(['vendor','commercial','repair'])  ?? 4;

  const entries = [];
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const pn     = String(row.getCell(colPN).value    || '').trim().toUpperCase();
    const nsn    = String(row.getCell(colNSN).value   || '').trim().toUpperCase() || null;
    const desc   = String(row.getCell(colDesc).value  || '').trim() || null;
    const vendor = String(row.getCell(colVendor).value|| '').trim();
    if (!pn || !vendor) return;
    entries.push([pn, nsn, desc, vendor]);
  });

  if (!entries.length) return res.status(400).json({ error: 'No data rows found in file' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM commercial_repair_list WHERE unit_id=$1', [req.user.unit_id]);
    for (const [pn, nsn, desc, vendor] of entries) {
      await client.query(
        `INSERT INTO commercial_repair_list (part_number, nsn, description, vendor_name, unit_id, uploaded_by, effective_date)
         VALUES ($1,$2,$3,$4,$5,$6,CURRENT_DATE)`,
        [pn, nsn, desc, vendor, req.user.unit_id, req.user.user_id]
      );
    }
    await client.query('COMMIT');
    res.json({ inserted: entries.length, message: `Commercial repair list replaced — ${entries.length} entries loaded` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('CRL upload error:', err);
    res.status(500).json({ error: 'Commercial repair list upload failed' });
  } finally {
    client.release();
  }
});

module.exports = router;
