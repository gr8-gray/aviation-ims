import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'screenshots');
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:5173';

async function shot(page, name) {
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
  console.log(`  saved ${name}.png`);
}

async function clickTab(page, label) {
  await page.getByRole('button', { name: label, exact: false }).first().click();
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await ctx.route('**/*', route => {
  route.continue({ headers: { ...route.request().headers(), 'X-Dev-EDIPI': '0000000001' } });
});

const nav = path => page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 15000 });

// --- Static pages ---
const staticRoutes = [
  { name: '01-dashboard',    path: '/' },
  { name: '02-inventory',    path: '/inventory' },
  { name: '03-requisitions', path: '/requisitions' },
  { name: '04-aircraft',     path: '/aircraft' },
  { name: '05-parts',        path: '/parts' },
  { name: '08-admin',        path: '/admin' },
];
for (const r of staticRoutes) {
  console.log(`Capturing ${r.name}...`);
  await nav(r.path);
  await shot(page, r.name);
}

// --- Repairables — all tabs ---
console.log('Capturing repairables tabs...');
await nav('/repairables');
await shot(page, '06a-repairables-difm-queue');

await clickTab(page, 'Serialized Items');
await shot(page, '06b-repairables-serialized');

await clickTab(page, 'ICRL');
await shot(page, '06c-repairables-icrl');

await clickTab(page, 'DRMO');
await shot(page, '06d-repairables-drmo');

// --- Reports — all tabs ---
console.log('Capturing report tabs...');
await nav('/reports');

const reportTabs = [
  { label: 'NMCS Brief',            name: '07a-reports-nmcs-brief' },
  { label: 'Open Documents',        name: '07b-reports-open-documents' },
  { label: 'Stock Status',          name: '07c-reports-stock-status' },
  { label: 'Usage Trends',          name: '07d-reports-usage-trends' },
  { label: 'Parts Cost',            name: '07e-reports-parts-cost-jcn' },
  { label: 'Turnaround',            name: '07f-reports-tat' },
  { label: 'AWOP',                  name: '07g-reports-awop' },
];

for (const t of reportTabs) {
  await clickTab(page, t.label);
  await shot(page, t.name);
}

await browser.close();
console.log(`\nDone — screenshots saved to: ${OUT}`);
