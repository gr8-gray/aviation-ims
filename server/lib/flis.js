'use strict';

/**
 * FLIS NSN Lookup Client
 *
 * Strategy: HTML scrape of nsnlookup.com (public FLIS mirror, no auth required)
 * + SAM.gov Entity API for CAGE code resolution
 *
 * No official DLA API is publicly accessible without .mil network / CAC.
 * Migrate to DLA DAASC data agreement before GovCon launch.
 *
 * Research: research/dla-api/findings.md
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const BASE_URL  = 'https://www.nsnlookup.com';
const CACHE_DIR = path.join(process.env.TEMP || '/tmp', 'metron-flis-cache');
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const merged = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept':     'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      ...headers,
    };

    const urlObj = new URL(url);
    const req = https.request(
      { hostname: urlObj.hostname, path: urlObj.pathname + urlObj.search, method: 'GET', headers: merged },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = res.headers.location.startsWith('http')
            ? res.headers.location
            : `https://${urlObj.hostname}${res.headers.location}`;
          resolve(httpGet(next, headers));
          return;
        }
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve(data));
      }
    );
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('Request timeout')));
    req.end();
  });
}

// ---------------------------------------------------------------------------
// File cache (non-fatal on any error)
// ---------------------------------------------------------------------------

function cacheGet(key) {
  try {
    const file = path.join(CACHE_DIR, Buffer.from(key).toString('base64url') + '.json');
    if (!fs.existsSync(file)) return null;
    const { ts, data } = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Date.now() - ts > CACHE_TTL) return null;
    return data;
  } catch { return null; }
}

function cacheSet(key, data) {
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    const file = path.join(CACHE_DIR, Buffer.from(key).toString('base64url') + '.json');
    fs.writeFileSync(file, JSON.stringify({ ts: Date.now(), data }));
  } catch { /* non-fatal */ }
}

// ---------------------------------------------------------------------------
// HTML parsers (regex — no external deps for MVP)
// ---------------------------------------------------------------------------

function parseSearchFragment(html) {
  const results = [];
  const re = /href="(\/fsg-(\d+)\/fsc-(\d+)\/us\/([^"]+))">([^<]+)<\/a>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const [, detailUrl, fsg, fsc, , text] = m;
    const parts = text.trim().split(/\s+/);
    const nsn = parts[0] || '';
    if (!nsn.includes('-')) continue;
    const niin = nsn.replace(/-/g, '').slice(-9);
    const itemName = parts.slice(1).join(' ').replace(/^[\/\s]+/, '').trim();
    results.push({ nsn, niin, itemName, fsg, fsc, detailUrl });
  }
  return results;
}

function parseSearchPage(html) {
  const results = [];
  const re = /href="(\/fsg-(\d+)\/fsc-(\d+)\/us\/[^"]+)"[^>]*>\s*<b>([^<]+)<\/b>.*?<p[^>]*>([^<]+)<\/p>/gs;
  let m;
  while ((m = re.exec(html)) !== null) {
    const [, detailUrl, fsg, fsc, nsn, itemName] = m;
    const niin = nsn.replace(/-/g, '').slice(-9);
    results.push({ nsn: nsn.trim(), niin: niin.trim(), itemName: itemName.trim(), fsg, fsc, detailUrl });
  }
  return results;
}

function parseDetailPage(html, base) {
  const cageCodes = [];
  const cageRe = /cage[^>]*>([A-Z0-9]{5})<\/a>.*?([A-Z][^<]{3,60})<\/(?:td|p|div)/gi;
  let cm;
  while ((cm = cageRe.exec(html)) !== null) {
    cageCodes.push({ cage: cm[1], companyName: cm[2]?.trim() });
  }

  const partNumbers = [];
  const partRe = /part.number[^>]*>([A-Z0-9\-\/]{3,30})<\/(?:a|td|span)/gi;
  let pm;
  while ((pm = partRe.exec(html)) !== null) {
    const pn = pm[1].trim();
    if (!partNumbers.includes(pn)) partNumbers.push(pn);
  }

  const demilMatch = html.match(/DEMIL[^>]*>([A-Z])</i);
  const critMatch  = html.match(/CRITICALITY[^:]*:\s*([A-Z\d])/i);
  const hmicMatch  = html.match(/HMIC[^:]*:\s*([A-Z])/i);

  return {
    ...base,
    cageCodes,
    partNumbers,
    demilCode:       demilMatch?.[1] || '',
    criticality:     critMatch?.[1]  || '',
    hmic:            hmicMatch?.[1]  || '',
    approvedSources: cageCodes.map((c) => c.cage).filter(Boolean),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Quick autocomplete search — returns top matches without fetching detail pages.
 * @param {string} query - NIIN, NSN, part number, or keywords
 * @returns {Promise<Array>}
 */
async function searchNsnQuick(query) {
  const key = `quick:${query}`;
  const cached = cacheGet(key);
  if (cached) return JSON.parse(cached);

  const encoded = Buffer.from(query).toString('base64');
  const html    = await httpGet(`${BASE_URL}/search/key/${encoded}`);
  const results = parseSearchFragment(html);
  cacheSet(key, JSON.stringify(results));
  return results;
}

/**
 * Full search results page.
 * @param {string} query
 * @returns {Promise<Array>}
 */
async function searchNsn(query) {
  const key = `search:${query}`;
  const cached = cacheGet(key);
  if (cached) return JSON.parse(cached);

  const url     = `${BASE_URL}/search/national-stock-number-nsn?q=${encodeURIComponent(query)}`;
  const html    = await httpGet(url);
  const results = parseSearchPage(html);
  cacheSet(key, JSON.stringify(results));
  return results;
}

/**
 * Fetch full NSN detail — CAGE codes, part numbers, DEMIL, etc.
 * @param {string} nsnOrNiin
 * @returns {Promise<Object|null>}
 */
async function getNsnDetail(nsnOrNiin) {
  const key    = `detail:${nsnOrNiin}`;
  const cached = cacheGet(key);
  if (cached) return JSON.parse(cached);

  const results = await searchNsnQuick(nsnOrNiin);
  if (results.length === 0) return null;

  const detailHtml = await httpGet(`${BASE_URL}${results[0].detailUrl}`);
  const detail     = parseDetailPage(detailHtml, results[0]);
  cacheSet(key, JSON.stringify(detail));
  return detail;
}

/**
 * CAGE code lookup via SAM.gov Entity Information API.
 * Requires SAM_GOV_API_KEY env var (free key at open.gsa.gov).
 * @param {string} cage
 * @returns {Promise<Object|null>}
 */
async function lookupCage(cage) {
  const apiKey = process.env.SAM_GOV_API_KEY;
  if (!apiKey) {
    throw new Error('SAM_GOV_API_KEY required. Register free at https://open.gsa.gov/api/entity-api/');
  }

  const key    = `cage:${cage}`;
  const cached = cacheGet(key);
  if (cached) return JSON.parse(cached);

  const url = `https://api.sam.gov/entity-information/v3/entities?api_key=${apiKey}&cageCode=${cage}&includeSections=entityRegistration,coreData`;
  const raw = await httpGet(url, { Accept: 'application/json' });

  const data = JSON.parse(raw);
  if (!data.entityData || data.entityData.length === 0) return null;

  const entity = data.entityData[0];
  const result = {
    cage,
    legalBusinessName: entity.entityRegistration?.legalBusinessName || '',
    dbaName:           entity.entityRegistration?.dbaName,
    ueiSAM:            entity.entityRegistration?.ueiSAM,
    address:           entity.coreData?.physicalAddress
      ? {
          streetAddress:       entity.coreData.physicalAddress.addressLine1 || '',
          city:                entity.coreData.physicalAddress.city || '',
          stateOrProvinceCode: entity.coreData.physicalAddress.stateOrProvinceCode || '',
          zipCode:             entity.coreData.physicalAddress.zipCode || '',
          countryCode:         entity.coreData.physicalAddress.countryCode || '',
        }
      : undefined,
  };

  cacheSet(key, JSON.stringify(result));
  return result;
}

module.exports = { searchNsn, searchNsnQuick, getNsnDetail, lookupCage };
