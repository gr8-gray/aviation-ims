'use strict';
const pool = require('../db/pool');
const { DEV_EDIPI } = require('../lib/constants');

/**
 * Extract EDIPI from CAC certificate SAN or CN.
 * SAN format: "othername:UPN:1234567890@mil"
 * CN fallback: "LASTNAME.FIRSTNAME.1234567890"
 */
function extractEdipi(cert) {
  if (!cert) return null;
  const san = cert.subjectaltname || '';
  const upnMatch = san.match(/(?:UTF8|UPN):(\d{10})@mil/i);
  if (upnMatch) return upnMatch[1];
  const cn = (cert.subject && cert.subject.CN) || '';
  const cnMatch = cn.match(/\.(\d{10})$/);
  if (cnMatch) return cnMatch[1];
  return null;
}

/**
 * Auth middleware.
 * In dev mode (DEV_AUTH=true), reads EDIPI from X-Dev-EDIPI header.
 * In production, extracts EDIPI from client TLS certificate.
 * Attaches req.user = { user_id, edipi, name, rank, role, unit_id }
 */
async function requireAuth(req, res, next) {
  try {
    let edipi;

    if (process.env.DEV_AUTH === 'true') {
      edipi = req.headers['x-dev-edipi'] || DEV_EDIPI;
    } else {
      const cert = req.socket && req.socket.getPeerCertificate
        ? req.socket.getPeerCertificate(true)
        : null;
      edipi = extractEdipi(cert);
      if (!edipi) {
        return res.status(401).json({ error: 'CAC certificate required' });
      }
    }

    // Look up or auto-provision user
    let result = await pool.query(
      'SELECT * FROM users WHERE edipi = $1', [edipi]
    );

    if (result.rows.length === 0) {
      // Auto-provision on first login — admin assigns role later
      result = await pool.query(
        `INSERT INTO users (edipi, name, role)
         VALUES ($1, $2, 'clerk')
         RETURNING *`,
        [edipi, `User-${edipi}`]
      );
    }

    // Update last_login
    await pool.query(
      'UPDATE users SET last_login = NOW() WHERE edipi = $1', [edipi]
    );

    req.user = result.rows[0];
    next();
  } catch (err) {
    console.error('Auth error:', err);
    res.status(500).json({ error: 'Authentication error' });
  }
}

/**
 * Role guard factory. Usage: requireRole('admin') or requireRole(['admin','officer'])
 */
function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, extractEdipi };
