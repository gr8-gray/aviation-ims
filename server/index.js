require('dotenv').config();
const express = require('express');
const helmet = require('helmet');

const app = express();

app.use(helmet());
app.use(express.json());

// Health check — no auth required
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Aviation IMS server running on port ${PORT}`);
});

module.exports = app;
