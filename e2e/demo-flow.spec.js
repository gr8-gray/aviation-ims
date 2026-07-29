'use strict';
const { test, expect } = require('@playwright/test');

/**
 * Demo-critical path E2E.
 *
 * The demo flow (what a Supply Officer sees, and what every walkthrough of
 * this app follows): open the Dashboard — KPI cards + NMCS/PMCS board driven
 * by the seeded VMM-365 scenario — then drill into Aircraft (the grounded
 * airframe) and Requisitions (the open MILSTRIP documents behind it).
 *
 * Runs against the LOCAL stack only (app is not deployed anywhere):
 * Vite :5173 → Express :3000 (DEV_AUTH=true) → seeded Postgres.
 *
 * Seed contract (server/db/seeds/seed.js): VMM-365, 5 MV-22B airframes,
 * BUNO 166490 grounded with an open NMCS event (JCN serial 0892 — the UI
 * renders JCNs in unit/FY format, e.g. VMM365-26-0892), 169017 PMCS,
 * 6 open requisitions with M00365-prefixed document numbers.
 *
 * Note: there is no login form (CAC/dev-header auth) — no credential fields
 * exist in this app, and these tests deliberately take no screenshots.
 */

const SEED_BUNOS = ['166490', '168019', '168661', '169017', '169354'];

test.describe('demo flow — dashboard', () => {
  test('KPI cards render live (non-placeholder) values from the API', async ({ page }) => {
    await page.goto('/');

    // App shell rendered, and the API error banner did NOT appear.
    await expect(page.getByText('Aviation IMS').first()).toBeVisible();
    await expect(page.locator('.error-banner')).toHaveCount(0);

    // All four KPI cards present with the expected labels.
    const cards = page.locator('.status-card');
    await expect(cards).toHaveCount(4);
    for (const label of ['NMCS Aircraft', 'Open Reqs', 'Due-In Today', 'Low Stock Items']) {
      await expect(page.locator('.sc-label', { hasText: label })).toBeVisible();
    }

    // Every card value must be a real number — '—' means the API call failed.
    for (const value of await page.locator('.sc-value').allTextContents()) {
      expect(value, 'KPI card must show a numeric value, not the "—" placeholder').toMatch(/^\d+$/);
    }

    // Seed contract: exactly 1 NMCS aircraft (166490 grounded).
    const nmcsCard = page.locator('.status-card', { hasText: 'NMCS Aircraft' });
    await expect(nmcsCard.locator('.sc-value')).toHaveText('1');
  });

  test('NMCS/PMCS board shows the grounded airframe with its JCN', async ({ page }) => {
    await page.goto('/');

    const nmcsTable = page.locator('.table-card', { hasText: 'NMCS / PMCS Status' });
    await expect(nmcsTable).toBeVisible();
    await expect(nmcsTable).toContainText('166490'); // grounded BUNO
    await expect(nmcsTable).toContainText('MV-22B');
    await expect(nmcsTable).toContainText('2840018374920'); // NSN of the grounding part
    // JCN serial 0892 — the UI renders the JCN in unit/FY format (e.g. VMM365-26-0892),
    // so assert the stable serial rather than the raw seeded string.
    await expect(nmcsTable).toContainText(/0892/);
  });

  test('open requisitions table lists MILSTRIP document numbers', async ({ page }) => {
    await page.goto('/');

    // M00365 (VMM-365 UIC) + 5-digit julian date + 4-digit serial.
    // first() auto-waits for the dashboard fetch to finish; a bare count()
    // would race the "Loading dashboard…" state.
    const docCells = page.getByText(/M00365\d{7}/);
    await expect(docCells.first()).toBeVisible();
    expect(await docCells.count()).toBeGreaterThanOrEqual(3);
  });
});

test.describe('demo flow — aircraft drill-down', () => {
  test('aircraft page lists all five seeded MV-22B airframes', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Aircraft' }).click();
    await expect(page).toHaveURL(/\/aircraft/);

    for (const buno of SEED_BUNOS) {
      await expect(page.getByText(buno).first()).toBeVisible();
    }
    await expect(page.getByText('MV-22B').first()).toBeVisible();
    // The seed grounds 166490 — the page must reflect a grounded/NMCS state somewhere.
    await expect(page.getByText(/grounded|NMCS/i).first()).toBeVisible();
  });
});

test.describe('demo flow — requisitions drill-down', () => {
  test('requisitions page lists open documents with statuses', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Requisitions' }).click();
    await expect(page).toHaveURL(/\/requisitions/);

    // Scope to the table — the status-filter <select> also contains these
    // strings as (hidden) options.
    const table = page.locator('table');
    // Seeded open documents (6 open of 7 total) — at least 3 doc numbers visible.
    const docs = table.getByText(/M00365\d{7}/);
    await expect(docs.first()).toBeVisible();
    expect(await docs.count()).toBeGreaterThanOrEqual(3);
    // Status values from the seed set.
    await expect(table.getByText(/backordered/i).first()).toBeVisible();
  });
});

test.describe('api health', () => {
  test('backend reports connected database', async ({ request }) => {
    const res = await request.get('http://localhost:3000/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.db).toBe('connected');
  });
});
