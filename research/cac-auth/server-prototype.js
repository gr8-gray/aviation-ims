'use strict';
const https = require('https');
const fs = require('fs');
const express = require('express');

const app = express();

/**
 * Extract EDIPI from a CAC identity certificate.
 * Primary: UPN in SAN — "otherName:...;UTF8:1234567890@mil"
 * Fallback: CN field — "LASTNAME.FIRSTNAME.1234567890"
 */
function extractEdipi(cert) {
  if (!cert) return null;

  // Primary: SAN UPN
  const san = cert.subjectaltname || '';
  const upnMatch = san.match(/UTF8:(\d{10})@mil/i);
  if (upnMatch) return upnMatch[1];

  // Fallback: CN
  const cn = (cert.subject && cert.subject.CN) || '';
  const cnMatch = cn.match(/\.(\d{10})$/);
  if (cnMatch) return cnMatch[1];

  return null;
}

app.get('/auth-test', (req, res) => {
  const cert = req.socket.getPeerCertificate(true);

  if (!cert || Object.keys(cert).length === 0) {
    return res.status(401).json({
      authenticated: false,
      error: 'No client certificate presented'
    });
  }

  const edipi = extractEdipi(cert);

  if (!edipi) {
    return res.status(401).json({
      authenticated: false,
      error: 'Could not extract EDIPI',
      debug: {
        subjectaltname: cert.subjectaltname,
        subject: cert.subject
      }
    });
  }

  res.json({
    authenticated: true,
    edipi,
    cn: cert.subject && cert.subject.CN,
    subjectaltname: cert.subjectaltname,
    validFrom: cert.valid_from,
    validTo: cert.valid_to
  });
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const serverOpts = {
  key: fs.readFileSync('research/cac-auth/server.key'),
  cert: fs.readFileSync('research/cac-auth/server.crt'),
  ca: fs.readFileSync('research/cac-auth/test-ca.crt'),
  requestCert: true,
  rejectUnauthorized: false  // Handle auth in middleware, not at TLS level
};

const PORT = 8443;
https.createServer(serverOpts, app).listen(PORT, () => {
  console.log(`CAC auth prototype running at https://localhost:${PORT}`);
  console.log(`Health: https://localhost:${PORT}/health`);
  console.log(`Auth test: https://localhost:${PORT}/auth-test`);
});
