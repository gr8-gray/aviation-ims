'use strict';

/**
 * Users Routes
 *
 * CAC onboarding, role assignment, unit assignment, audit log review.
 * Users are auto-provisioned on first CAC login as role='clerk' with no unit.
 * Admin assigns role + unit before clerk can use the system.
 */

const express = require('express');
const pool    = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/users/me — current user profile
router.get('/me', (req, res) => res.json(req.user));

// GET /api/users — list all users (admin only)
router.get('/', requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.*, un.name AS unit_name
       FROM users u
       LEFT JOIN units un ON un.unit_id = u.unit_id
       ORDER BY u.name`
    );
    res.json({ users: result.rows });
  } catch (err) {
    console.error('GET /api/users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// PUT /api/users/:id — assign role + unit (admin only)
// Body: { role?, unit_id?, name?, rank? }
router.put('/:id', requireRole('admin'), async (req, res) => {
  const { role, unit_id, name, rank } = req.body;
  const valid_roles = ['clerk', 'sncoic', 'officer', 'admin'];

  if (role && !valid_roles.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${valid_roles.join(', ')}` });
  }

  try {
    const result = await pool.query(
      `UPDATE users SET
         role    = COALESCE($2, role),
         unit_id = COALESCE($3, unit_id),
         name    = COALESCE($4, name),
         rank    = COALESCE($5, rank)
       WHERE user_id = $1
       RETURNING *`,
      [parseInt(req.params.id), role || null, unit_id ? parseInt(unit_id) : null, name || null, rank || null]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('PUT /api/users/:id error:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// GET /api/users/units — list all units (all roles)
router.get('/units', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.*, p.name AS parent_name
       FROM units u
       LEFT JOIN units p ON p.unit_id = u.parent_unit_id
       ORDER BY u.name`
    );
    res.json({ units: result.rows });
  } catch (err) {
    console.error('GET /api/users/units error:', err);
    res.status(500).json({ error: 'Failed to fetch units' });
  }
});

// POST /api/users/units — create unit (admin only)
router.post('/units', requireRole('admin'), async (req, res) => {
  const { name, uic, location, parent_unit_id } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  try {
    const result = await pool.query(
      `INSERT INTO units (name, uic, location, parent_unit_id)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [name, uic || null, location || null, parent_unit_id ? parseInt(parent_unit_id) : null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST /api/users/units error:', err);
    res.status(500).json({ error: 'Failed to create unit' });
  }
});

// GET /api/users/audit — audit log (officer/admin only)
// ?user_id=N  ?type=issue|receipt|... ?days=30
router.get('/audit', requireRole(['officer', 'admin']), async (req, res) => {
  try {
    const { user_id, type, days = 30, limit = 200, offset = 0 } = req.query;
    const conditions = ['t.unit_id = $1'];
    const params     = [req.user.unit_id];
    let   p          = 2;

    if (user_id) { conditions.push(`t.performed_by = $${p++}`); params.push(parseInt(user_id)); }
    if (type)    { conditions.push(`t.type = $${p++}`);          params.push(type); }
    conditions.push(`t.created_at >= NOW() - INTERVAL '${parseInt(days)} days'`);

    const result = await pool.query(
      `SELECT t.*, u.name AS performed_by_name, u.edipi, pm.description
       FROM transactions t
       JOIN users u ON u.user_id = t.performed_by
       JOIN parts_master pm ON pm.nsn = t.nsn
       WHERE ${conditions.join(' AND ')}
       ORDER BY t.created_at DESC
       LIMIT $${p++} OFFSET $${p++}`,
      [...params, parseInt(limit), parseInt(offset)]
    );
    res.json({ transactions: result.rows, count: result.rows.length });
  } catch (err) {
    console.error('GET /api/users/audit error:', err);
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

module.exports = router;
