'use strict';

/**
 * OTS Sync — One Touch Support status polling
 *
 * Current status: STUB — pending live OTS inspection.
 *
 * Research findings (research/ots/findings.md):
 *   - No public API exists for OTS or R-Supply
 *   - Machine interface is DLMS via DAAS (DLMS 869F/870S transactions)
 *   - Near-term MVP path: Puppeteer + CAC passthrough against ots.dla.mil
 *   - Long-term correct path: DAAS participation agreement + 869F/870S
 *
 * To activate:
 *   1. Eric does live OTS session with DevTools open (Network tab, XHR filter)
 *   2. Answer open questions in research/ots/findings.md (session model, URL pattern, response format)
 *   3. Replace syncDocument() below with real Puppeteer or mTLS HTTP implementation
 *   4. Set OTS_CAC_P12_PATH and OTS_CAC_PIN in .env
 *
 * Open questions before implementation:
 *   - Does OTS return JSON (XHR) or only HTML? JSON = much easier than scraping.
 *   - Does TLS session persist after CAC auth (session cookie) or require cert on every request?
 *   - URL structure for document number queries — predictable path or form POST?
 *   - What fields does OTS return per document? (status code, ESD, TCN, source of supply)
 *   - Is there a bulk query path (multiple doc numbers in one request)?
 */

const OTS_ENABLED = process.env.OTS_ENABLED === 'true';

/**
 * Sync OTS status for a single document number.
 *
 * @param {string} documentNumber - MILSTRIP document number (15 chars)
 * @returns {Promise<{status: string, details: object, synced_at: string}>}
 */
async function syncDocument(documentNumber) {
  if (!OTS_ENABLED) {
    return {
      status:    'stub',
      details:   { message: 'OTS sync not yet active — pending live OTS session inspection' },
      synced_at: new Date().toISOString(),
    };
  }

  // ── IMPLEMENTATION PLACEHOLDER ────────────────────────────────────────────
  //
  // Option A — Puppeteer + CAC passthrough (likely MVP path):
  //
  //   const puppeteer = require('puppeteer');
  //   const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  //   const page = await browser.newPage();
  //   // CAC passthrough: launch with --client-certificate-file / use mTLS agent
  //   await page.goto(`https://ots.dla.mil/...?docnum=${documentNumber}`);
  //   // Extract status from XHR response or page DOM
  //   const status = await page.$eval('#statusField', el => el.textContent);
  //   await browser.close();
  //   return { status, details: {}, synced_at: new Date().toISOString() };
  //
  // Option B — Direct HTTP with mTLS (cleaner if OTS is stateless):
  //
  //   const https = require('https');
  //   const fs = require('fs');
  //   const agent = new https.Agent({
  //     pfx: fs.readFileSync(process.env.OTS_CAC_P12_PATH),
  //     passphrase: process.env.OTS_CAC_PIN,
  //   });
  //   const response = await fetch(`https://ots.dla.mil/api/status/${documentNumber}`, { agent });
  //   const data = await response.json();
  //   return { status: data.status, details: data, synced_at: new Date().toISOString() };
  //
  // ─────────────────────────────────────────────────────────────────────────

  throw new Error('OTS_ENABLED=true but implementation is not yet wired — see ots-sync.js');
}

/**
 * Batch sync OTS status for multiple document numbers.
 * Returns a map of documentNumber → sync result.
 *
 * @param {string[]} documentNumbers
 * @returns {Promise<Object>}
 */
async function syncBatch(documentNumbers) {
  const results = {};
  for (const docNum of documentNumbers) {
    try {
      results[docNum] = await syncDocument(docNum);
    } catch (err) {
      results[docNum] = { status: 'error', error: err.message, synced_at: new Date().toISOString() };
    }
  }
  return results;
}

module.exports = { syncDocument, syncBatch };
