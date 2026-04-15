'use strict';
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const pool = require('./db/pool');

const app = express();

app.use(helmet());
app.use(express.json());

// Dev CORS — allow React dev server
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Dev-EDIPI');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
}

// Health check — no auth required
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', version: '0.1.0', db: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

// API routes
app.use('/api/parts', require('./routes/parts'));
// app.use('/api/inventory', require('./routes/inventory'));
// app.use('/api/requisitions', require('./routes/requisitions'));
// app.use('/api/aircraft', require('./routes/aircraft'));
// app.use('/api/users', require('./routes/users'));
// app.use('/api/reports', require('./routes/reports'));

// 404 and error handlers
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Aviation IMS server running on port ${PORT}`);
  if (process.env.DEV_AUTH === 'true') {
    console.warn('WARNING: DEV_AUTH=true — CAC authentication is bypassed');
  }
});

module.exports = app;
