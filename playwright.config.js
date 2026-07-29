'use strict';
const { defineConfig, devices } = require('@playwright/test');

/**
 * Aviation IMS is not deployed anywhere — E2E always runs against the local
 * stack: Express API on :3000 (DEV_AUTH=true) + Vite dev server on :5173.
 *
 * Prereq (local): Postgres up with migrations + seed applied. See CLAUDE.md.
 * In CI the postgres service container + migration/seed steps handle this.
 *
 * The Vite DEV build attaches the X-Dev-EDIPI header automatically
 * (client/src/api.js), which is why we target the dev server and not a
 * production preview build.
 *
 * The API webServer entry polls /health, which returns 503 until Postgres is
 * reachable — so a broken DB fails fast at startup, not with empty-page tests.
 */
module.exports = defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node server/index.js',
      url: 'http://localhost:3000/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { ...process.env, DEV_AUTH: 'true', PORT: '3000' },
    },
    {
      command: 'npm run dev',
      cwd: './client',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
