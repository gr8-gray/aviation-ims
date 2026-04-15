/**
 * DLA/FLIS NSN Lookup Prototype Client
 * 
 * Strategy: HTML scrape of nsnlookup.com (public FLIS mirror)
 * + SAM.gov Entity API for CAGE code resolution
 * 
 * No official DLA API is publicly accessible without .mil network / CAC.
 * This client is a stopgap until a DLA DAASC data agreement is in place.
 */

import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NsnSearchResult {
  nsn: string;        // formatted: 1234-56-789-0123
  niin: string;       // 9-digit: 789012345
  itemName: string;
  fsg: string;        // Federal Supply Group (2-digit)
  fsc: string;        // Federal Supply Class (4-digit)
  detailUrl: string;
}

export interface NsnDetail extends NsnSearchResult {
  cageCodes: CageEntry[];
  partNumbers: string[];
  demilCode: string;
  criticality: string;
  hmic: string;
  approvedSources: string[];
}

export interface CageEntry {
  cage: string;
  companyName?: string;
  partNumber?: string;
}

export interface CageLookupResult {
  cage: string;
  legalBusinessName: string;
  dbaName?: string;
  address?: {
    streetAddress: string;
    city: string;
    stateOrProvinceCode: string;
    zipCode: string;
    countryCode: string;
  };
  ueiSAM?: string;
}

// ---------------------------------------------------------------------------
// Simple HTTP helper (no external deps)
// ---------------------------------------------------------------------------

function httpGet(url: string, headers: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const defaultHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      ...headers,
    };

    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: defaultHeaders,
    };

    const req = https.request(options, (res) => {
      // Follow redirects
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = res.headers.location.startsWith('http')
          ? res.headers.location
          : `https://${urlObj.hostname}${res.headers.location}`;
        resolve(httpGet(redirectUrl, headers));
        return;
      }

      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy(new Error('Request timeout'));
    });
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Cache (file-based, 24h TTL)
// ---------------------------------------------------------------------------

const CACHE_DIR = path.join(process.env.TEMP || '/tmp', 'metron-flis-cache');

function cacheGet(key: string): string | null {
  try {
    if (!fs.existsSync(CACHE_DIR)) return null;
    const file = path.join(CACHE_DIR, Buffer.from(key).toString('base64url') + '.json');
    if (!fs.existsSync(file)) return null;
    const { ts, data } = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Date.now() - ts > 24 * 60 * 60 * 1000) return null; // expired
    return data;
  } catch {
    return null;
  }
}

function cacheSet(key: string, data: string): void {
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    const file = path.join(CACHE_DIR, Buffer.from(key).toString('base64url') + '.json');
    fs.writeFileSync(file, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    // cache failures are non-fatal
  }
}

// ---------------------------------------------------------------------------
// NSN Lookup via nsnlookup.com
// ---------------------------------------------------------------------------

const BASE_URL = 'https://www.nsnlookup.com';

/**
 * Quick autocomplete search — returns top matches without fetching detail pages.
 * Uses the /search/key/{base64} endpoint discovered during API research.
 */
export async function searchNsnQuick(query: string): Promise<NsnSearchResult[]> {
  const cacheKey = `quick:${query}`;
  const cached = cacheGet(cacheKey);
  if (cached) return JSON.parse(cached);

  const encoded = Buffer.from(query).toString('base64');
  const html = await httpGet(`${BASE_URL}/search/key/${encoded}`);
  
  const results = parseSearchFragment(html);
  cacheSet(cacheKey, JSON.stringify(results));
  return results;
}

/**
 * Full search — fetches the search results page.
 */
export async function searchNsn(query: string): Promise<NsnSearchResult[]> {
  const cacheKey = `search:${query}`;
  const cached = cacheGet(cacheKey);
  if (cached) return JSON.parse(cached);

  const url = `${BASE_URL}/search/national-stock-number-nsn?q=${encodeURIComponent(query)}`;
  const html = await httpGet(url);

  const results = parseSearchPage(html);
  cacheSet(cacheKey, JSON.stringify(results));
  return results;
}

/**
 * Fetch full NSN detail (CAGE, part numbers, DEMIL, etc.)
 */
export async function getNsnDetail(nsnOrNiin: string): Promise<NsnDetail | null> {
  const cacheKey = `detail:${nsnOrNiin}`;
  const cached = cacheGet(cacheKey);
  if (cached) return JSON.parse(cached);

  // First find the detail URL via quick search
  const results = await searchNsnQuick(nsnOrNiin);
  if (results.length === 0) return null;

  const detailHtml = await httpGet(`${BASE_URL}${results[0].detailUrl}`);
  const detail = parseDetailPage(detailHtml, results[0]);

  cacheSet(cacheKey, JSON.stringify(detail));
  return detail;
}

// ---------------------------------------------------------------------------
// HTML Parsers (regex-based, no cheerio dependency for prototype)
// ---------------------------------------------------------------------------

function parseSearchFragment(html: string): NsnSearchResult[] {
  const results: NsnSearchResult[] = [];
  // Pattern: <a href="/fsg-XX/fsc-XXXX/us/SLUG">NSN / ITEM NAME</a>
  const linkRe = /href="(\/fsg-(\d+)\/fsc-(\d+)\/us\/([^"]+))">([^<]+)<\/a>/g;
  let match: RegExpExecArray | null;
  
  while ((match = linkRe.exec(html)) !== null) {
    const [, detailUrl, fsg, fsc, , text] = match;
    const parts = text.trim().split(/\s+/);
    const nsn = parts[0] || '';
    const niin = nsn.replace(/-/g, '').slice(-9);
    const itemName = parts.slice(1).join(' ').replace(/^[\/\s]+/, '').trim();
    
    if (nsn && nsn.includes('-')) {
      results.push({ nsn, niin, itemName, fsg, fsc, detailUrl });
    }
  }
  return results;
}

function parseSearchPage(html: string): NsnSearchResult[] {
  // Extract from search results — looks for NSN links in main content
  const results: NsnSearchResult[] = [];
  const linkRe = /href="(\/fsg-(\d+)\/fsc-(\d+)\/us\/[^"]+)"[^>]*>\s*<b>([^<]+)<\/b>.*?<p[^>]*>([^<]+)<\/p>/gs;
  let match: RegExpExecArray | null;
  
  while ((match = linkRe.exec(html)) !== null) {
    const [, detailUrl, fsg, fsc, nsn, itemName] = match;
    const niin = nsn.replace(/-/g, '').slice(-9);
    results.push({
      nsn: nsn.trim(),
      niin: niin.trim(),
      itemName: itemName.trim(),
      fsg,
      fsc,
      detailUrl,
    });
  }
  return results;
}

function parseDetailPage(html: string, base: NsnSearchResult): NsnDetail {
  // Extract CAGE codes
  const cageCodes: CageEntry[] = [];
  const cageRe = /cage[^>]*>([A-Z0-9]{5})<\/a>.*?([A-Z][^<]{3,60})<\/(?:td|p|div)/gi;
  let cageMatch: RegExpExecArray | null;
  while ((cageMatch = cageRe.exec(html)) !== null) {
    cageCodes.push({ cage: cageMatch[1], companyName: cageMatch[2]?.trim() });
  }

  // Extract part numbers
  const partNumbers: string[] = [];
  const partRe = /part.number[^>]*>([A-Z0-9\-\/]{3,30})<\/(?:a|td|span)/gi;
  let partMatch: RegExpExecArray | null;
  while ((partMatch = partRe.exec(html)) !== null) {
    const pn = partMatch[1].trim();
    if (!partNumbers.includes(pn)) partNumbers.push(pn);
  }

  // Extract DEMIL / criticality
  const demilMatch = html.match(/DEMIL[^>]*>([A-Z])</i);
  const critMatch = html.match(/CRITICALITY[^:]*:\s*([A-Z\d])/i);
  const hmicMatch = html.match(/HMIC[^:]*:\s*([A-Z])/i);

  return {
    ...base,
    cageCodes,
    partNumbers,
    demilCode: demilMatch?.[1] || '',
    criticality: critMatch?.[1] || '',
    hmic: hmicMatch?.[1] || '',
    approvedSources: cageCodes.map(c => c.cage).filter(Boolean),
  };
}

// ---------------------------------------------------------------------------
// CAGE Code Lookup via SAM.gov Entity API
// ---------------------------------------------------------------------------

/**
 * Look up a CAGE code via the SAM.gov Entity Information API.
 * Requires a free API key from https://open.gsa.gov/api/entity-api/
 * Set env var SAM_GOV_API_KEY before calling.
 */
export async function lookupCage(cage: string): Promise<CageLookupResult | null> {
  const apiKey = process.env.SAM_GOV_API_KEY;
  if (!apiKey) {
    throw new Error('SAM_GOV_API_KEY env var required. Register free at https://open.gsa.gov/api/entity-api/');
  }

  const cacheKey = `cage:${cage}`;
  const cached = cacheGet(cacheKey);
  if (cached) return JSON.parse(cached);

  const url = `https://api.sam.gov/entity-information/v3/entities?api_key=${apiKey}&cageCode=${cage}&includeSections=entityRegistration,coreData`;
  const raw = await httpGet(url, { Accept: 'application/json' });
  
  const data = JSON.parse(raw);
  if (!data.entityData || data.entityData.length === 0) return null;

  const entity = data.entityData[0];
  const result: CageLookupResult = {
    cage,
    legalBusinessName: entity.entityRegistration?.legalBusinessName || '',
    dbaName: entity.entityRegistration?.dbaName,
    ueiSAM: entity.entityRegistration?.ueiSAM,
    address: entity.coreData?.physicalAddress
      ? {
          streetAddress: entity.coreData.physicalAddress.addressLine1 || '',
          city: entity.coreData.physicalAddress.city || '',
          stateOrProvinceCode: entity.coreData.physicalAddress.stateOrProvinceCode || '',
          zipCode: entity.coreData.physicalAddress.zipCode || '',
          countryCode: entity.coreData.physicalAddress.countryCode || '',
        }
      : undefined,
  };

  cacheSet(cacheKey, JSON.stringify(result));
  return result;
}

// ---------------------------------------------------------------------------
// CLI entry point (for testing)
// ---------------------------------------------------------------------------

async function main() {
  const query = process.argv[2] || '014482680';
  console.log(`\nSearching for: ${query}\n`);

  try {
    const results = await searchNsnQuick(query);
    if (results.length === 0) {
      console.log('No results found.');
      return;
    }

    console.log(`Found ${results.length} result(s):\n`);
    for (const r of results) {
      console.log(`  NSN:      ${r.nsn}`);
      console.log(`  NIIN:     ${r.niin}`);
      console.log(`  Item:     ${r.itemName}`);
      console.log(`  FSG/FSC:  ${r.fsg} / ${r.fsc}`);
      console.log(`  URL:      https://www.nsnlookup.com${r.detailUrl}`);
      console.log('');
    }

    // Fetch detail for first result
    console.log('Fetching detail for first result...\n');
    const detail = await getNsnDetail(query);
    if (detail) {
      console.log('  DEMIL:    ', detail.demilCode || 'N/A');
      console.log('  HMIC:     ', detail.hmic || 'N/A');
      console.log('  CAGE codes:', detail.cageCodes.map(c => c.cage).join(', ') || 'N/A');
      console.log('  Part #s:  ', detail.partNumbers.slice(0, 5).join(', ') || 'N/A');
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}
