'use strict';

/**
 * Reports Routes
 *
 * All reports are read-only aggregations. Auth required, all roles.
 * Officer/admin can pass unit_id to scope across units.
 *
 * Reports:
 *   GET /api/reports/nmcs-brief       Daily NMCS/PMCS brief
 *   GET /api/reports/open-documents   All outstanding reqs with age + overdue flags
 *   GET /api/reports/stock-status     On-hand snapshot, items below reorder
 *   GET /api/reports/usage-trends     Top consumed parts by time period
 *   GET /api/reports/parts-cost-jcn   Parts cost per JCN
 *   GET /api/reports/tat              Req submission→receipt turnaround
 *   GET /api/reports/awop             Aircraft awaiting parts — AWOP status board
 */

const express = require('express');
const pool    = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function unitScope(req) {
  if (['officer', 'admin'].includes(req.user.role) && req.query.unit_id) {
    return parseInt(req.query.unit_id);
  }
  return req.user.unit_id;
}

// ---------------------------------------------------------------------------
// GET /api/reports/nmcs-brief
// All open NMCS/PMCS events with days down, associated req status.
// The source for the daily Supply Officer brief.
// ---------------------------------------------------------------------------
router.get('/nmcs-brief', async (req, res) => {
  try {
    const unitId = unitScope(req);
    const result = await pool.query(
      `SELECT
         ne.event_id,
         ne.type,
         a.buno,
         a.mds,
         ne.nsn,
         pm.description AS part_description,
         ne.jcn,
         ne.opened_at,
         ROUND(EXTRACT(EPOCH FROM (NOW() - ne.opened_at))/86400) AS days_open,
         r.req_id,
         r.document_number,
         r.status        AS req_status,
         r.priority,
         r.ots_last_sync,
         u.name          AS opened_by_name
       FROM nmcs_events ne
       JOIN aircraft a     ON a.aircraft_id = ne.aircraft_id
       JOIN parts_master pm ON pm.nsn       = ne.nsn
       LEFT JOIN requisitions r ON r.req_id = ne.req_id
       JOIN users u            ON u.user_id  = ne.opened_by
       WHERE a.unit_id = $1 AND ne.closed_at IS NULL
       ORDER BY ne.type, days_open DESC`,
      [unitId]
    );

    const summary = {
      total_nmcs:  result.rows.filter((r) => r.type === 'NMCS').length,
      total_pmcs:  result.rows.filter((r) => r.type === 'PMCS').length,
      avg_days:    result.rows.length
        ? Math.round(result.rows.reduce((s, r) => s + Number(r.days_open), 0) / result.rows.length)
        : 0,
    };

    res.json({ events: result.rows, summary, generated_at: new Date().toISOString() });
  } catch (err) {
    console.error('GET /api/reports/nmcs-brief error:', err);
    res.status(500).json({ error: 'Failed to generate NMCS brief' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/reports/open-documents
// All non-received, non-cancelled requisitions with age and overdue flag.
// Overdue = submitted > 30 days, backordered > 60 days, priority 01/02 > 5 days.
// ---------------------------------------------------------------------------
router.get('/open-documents', async (req, res) => {
  try {
    const unitId = unitScope(req);
    const result = await pool.query(
      `SELECT
         r.req_id,
         r.document_number,
         r.type,
         r.nsn,
         pm.description,
         r.priority,
         r.status,
         r.quantity,
         r.fund_code,
         r.jcn,
         r.ots_last_sync,
         a.buno,
         ROUND(EXTRACT(EPOCH FROM (NOW() - r.created_at))/86400)  AS age_days,
         CASE
           WHEN r.priority IN ('01','02') AND EXTRACT(EPOCH FROM (NOW()-r.created_at))/86400 > 5  THEN true
           WHEN r.status = 'submitted'    AND EXTRACT(EPOCH FROM (NOW()-r.created_at))/86400 > 30 THEN true
           WHEN r.status = 'backordered'  AND EXTRACT(EPOCH FROM (NOW()-r.created_at))/86400 > 60 THEN true
           ELSE false
         END AS overdue
       FROM requisitions r
       JOIN parts_master pm ON pm.nsn = r.nsn
       LEFT JOIN aircraft a ON a.aircraft_id = r.aircraft_id
       WHERE r.unit_id = $1 AND r.status NOT IN ('received','cancelled')
       ORDER BY
         overdue DESC,
         CASE r.priority WHEN '01' THEN 1 WHEN '02' THEN 2 ELSE 3 END,
         r.created_at`,
      [unitId]
    );

    const overdue = result.rows.filter((r) => r.overdue).length;
    res.json({
      requisitions: result.rows,
      count:        result.rows.length,
      overdue,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('GET /api/reports/open-documents error:', err);
    res.status(500).json({ error: 'Failed to generate open documents report' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/reports/stock-status
// On-hand snapshot. Flags items at or below reorder point.
// ?low=true — only show low stock
// ---------------------------------------------------------------------------
router.get('/stock-status', async (req, res) => {
  try {
    const unitId = unitScope(req);
    const { low }  = req.query;

    const lowFilter = low === 'true' ? 'AND inv.qty_on_hand <= inv.reorder_point' : '';
    const result = await pool.query(
      `SELECT
         inv.nsn,
         pm.description,
         pm.unit_of_issue,
         pm.unit_price,
         inv.condition,
         inv.qty_on_hand,
         inv.qty_due_in,
         inv.qty_on_order,
         inv.reorder_point,
         inv.bin_location,
         (inv.qty_on_hand <= inv.reorder_point) AS low_stock,
         inv.updated_at
       FROM inventory inv
       JOIN parts_master pm ON pm.nsn = inv.nsn
       WHERE inv.unit_id = $1 ${lowFilter}
       ORDER BY low_stock DESC, pm.description`,
      [unitId]
    );

    const lowCount = result.rows.filter((r) => r.low_stock).length;
    res.json({
      stock:        result.rows,
      count:        result.rows.length,
      low_stock:    lowCount,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('GET /api/reports/stock-status error:', err);
    res.status(500).json({ error: 'Failed to generate stock status' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/reports/usage-trends
// Top consumed parts by quantity issued, filterable by time window.
// ?days=30|90|180|365  (default 90)
// ?aircraft_id=N       limit to one BUNO
// ?limit=20
// ---------------------------------------------------------------------------
router.get('/usage-trends', async (req, res) => {
  try {
    const unitId      = unitScope(req);
    const days        = parseInt(req.query.days)        || 90;
    const limit       = parseInt(req.query.limit)       || 20;
    const aircraft_id = req.query.aircraft_id ? parseInt(req.query.aircraft_id) : null;

    const conditions = [
      't.unit_id = $1',
      "t.type = 'issue'",
      `t.created_at >= NOW() - INTERVAL '${days} days'`,
    ];
    const params = [unitId];
    let p = 2;

    if (aircraft_id) {
      conditions.push(`t.aircraft_id = $${p++}`);
      params.push(aircraft_id);
    }

    const result = await pool.query(
      `SELECT
         t.nsn,
         pm.description,
         pm.unit_of_issue,
         pm.unit_price,
         SUM(t.quantity)           AS total_issued,
         COUNT(*)                  AS issue_events,
         COUNT(DISTINCT t.aircraft_id) AS aircraft_count,
         MAX(t.created_at)         AS last_issued
       FROM transactions t
       JOIN parts_master pm ON pm.nsn = t.nsn
       WHERE ${conditions.join(' AND ')}
       GROUP BY t.nsn, pm.description, pm.unit_of_issue, pm.unit_price
       ORDER BY total_issued DESC
       LIMIT $${p++}`,
      [...params, limit]
    );

    res.json({
      trends:       result.rows,
      period_days:  days,
      count:        result.rows.length,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('GET /api/reports/usage-trends error:', err);
    res.status(500).json({ error: 'Failed to generate usage trends' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/reports/parts-cost-jcn
// Total parts value per JCN — links supply cost to maintenance jobs.
// ?days=90  (default 90)
// ---------------------------------------------------------------------------
router.get('/parts-cost-jcn', async (req, res) => {
  try {
    const unitId = unitScope(req);
    const days   = parseInt(req.query.days) || 90;

    const result = await pool.query(
      `SELECT
         t.jcn,
         a.buno,
         a.mds,
         COUNT(DISTINCT t.nsn)         AS part_types,
         SUM(t.quantity)               AS total_qty,
         SUM(t.quantity * pm.unit_price) FILTER (WHERE pm.unit_price IS NOT NULL) AS total_cost,
         MIN(t.created_at)             AS first_issue,
         MAX(t.created_at)             AS last_issue
       FROM transactions t
       JOIN parts_master pm ON pm.nsn = t.nsn
       LEFT JOIN aircraft a ON a.aircraft_id = t.aircraft_id
       WHERE t.unit_id = $1
         AND t.type = 'issue'
         AND t.jcn IS NOT NULL
         AND t.created_at >= NOW() - INTERVAL '${days} days'
       GROUP BY t.jcn, a.buno, a.mds
       ORDER BY total_cost DESC NULLS LAST`,
      [unitId]
    );

    res.json({
      jcn_costs:    result.rows,
      period_days:  days,
      count:        result.rows.length,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('GET /api/reports/parts-cost-jcn error:', err);
    res.status(500).json({ error: 'Failed to generate parts cost by JCN' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/reports/tat
// Requisition turnaround: submission → receipt, by priority and NSN.
// ?days=180  (default 180)
// ?priority=01|02|03
// ---------------------------------------------------------------------------
router.get('/tat', async (req, res) => {
  try {
    const unitId   = unitScope(req);
    const days     = parseInt(req.query.days) || 180;
    const priority = req.query.priority;

    const conditions = [
      'r.unit_id = $1',
      "r.status = 'received'",
      `r.updated_at >= NOW() - INTERVAL '${days} days'`,
    ];
    const params = [unitId];
    let p = 2;

    if (priority) {
      conditions.push(`r.priority = $${p++}`);
      params.push(priority);
    }

    const result = await pool.query(
      `SELECT
         r.priority,
         r.nsn,
         pm.description,
         COUNT(*)                                    AS orders_received,
         ROUND(AVG(EXTRACT(EPOCH FROM (r.updated_at - r.created_at))/86400)) AS avg_days,
         MIN(EXTRACT(EPOCH FROM (r.updated_at - r.created_at))/86400)         AS min_days,
         MAX(EXTRACT(EPOCH FROM (r.updated_at - r.created_at))/86400)         AS max_days
       FROM requisitions r
       JOIN parts_master pm ON pm.nsn = r.nsn
       WHERE ${conditions.join(' AND ')}
       GROUP BY r.priority, r.nsn, pm.description
       ORDER BY r.priority, avg_days DESC`,
      params
    );

    res.json({
      tat:          result.rows,
      period_days:  days,
      count:        result.rows.length,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('GET /api/reports/tat error:', err);
    res.status(500).json({ error: 'Failed to generate TAT report' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/reports/awop
// Aircraft Awaiting Parts (AWOP) status board.
// Shows every open NMCS event grouped by aircraft, with causative NSN,
// document number, requisition status, priority, and days down.
// Sorted worst-first (most days down).
// ---------------------------------------------------------------------------
router.get('/awop', async (req, res) => {
  try {
    const unitId = unitScope(req);
    const result = await pool.query(
      `SELECT
         ne.event_id,
         a.buno,
         a.mds,
         ne.nsn,
         pm.description            AS part_description,
         ne.jcn,
         ne.opened_at,
         ROUND(EXTRACT(EPOCH FROM (NOW() - ne.opened_at))/86400) AS days_down,
         r.document_number,
         r.status                  AS req_status,
         r.priority,
         r.quantity,
         r.fund_code,
         r.ots_last_sync,
         u.name                    AS opened_by_name
       FROM nmcs_events ne
       JOIN aircraft a      ON a.aircraft_id  = ne.aircraft_id
       JOIN parts_master pm ON pm.nsn          = ne.nsn
       JOIN users u         ON u.user_id       = ne.opened_by
       LEFT JOIN requisitions r ON r.req_id    = ne.req_id
       WHERE a.unit_id = $1
         AND ne.closed_at IS NULL
         AND ne.type = 'NMCS'
       ORDER BY days_down DESC`,
      [unitId]
    );

    const aircraft_awop = [...new Set(result.rows.map(r => r.buno))].length;
    const avg_days = result.rows.length
      ? Math.round(result.rows.reduce((s, r) => s + Number(r.days_down), 0) / result.rows.length)
      : 0;
    const no_req = result.rows.filter(r => !r.document_number).length;

    res.json({
      events:        result.rows,
      count:         result.rows.length,
      aircraft_awop,
      avg_days,
      no_req,
      generated_at:  new Date().toISOString(),
    });
  } catch (err) {
    console.error('GET /api/reports/awop error:', err);
    res.status(500).json({ error: 'Failed to generate AWOP report' });
  }
});

module.exports = router;
