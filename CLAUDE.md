# Aviation IMS — DoD O/I-Level Inventory Management

Full-stack inventory management for USMC aviation maintenance units (MILSTRIP, NMCS, ICRL, repairables). Built solo under Metron Matrix Solutions LLC. **Not deployed anywhere — this app runs locally only.** All seed data is fictional (VMM-365, no CUI).

## Architecture

```
client/   React 19 + Vite 8 + React Router 7 + Axios (dev :5173, proxies /api -> :3000)
server/   Node/Express (CommonJS) on :3000 — helmet, pg pool, exceljs, multer
  routes/       aircraft, inventory, parts, repairables, requisitions, reports, users
  lib/          flis.js, milstrip.js, ots-sync.js (stubbed), constants.js
  middleware/   auth.js — CAC cert EDIPI extraction; DEV_AUTH=true header bypass
  db/           migrations/ (4 SQL files, run in order), seeds/seed.js, setup.js, pool.js
docker-compose.yml   postgres:15 on :5432 (+ app/nginx services for the TLS/CAC path)
research/            CAC auth, DLA API, OTS findings — prototypes, not product code
```

## Auth model (important)

There is **no login page** — production auth is CAC client-cert (EDIPI from TLS cert). Local/dev/CI use `DEV_AUTH=true`: the server takes EDIPI from the `X-Dev-EDIPI` header, falling back to the dev admin EDIPI. The Vite DEV build attaches that header automatically (`client/src/api.js`); production builds do not.

**Cross-cutting home:** `server/lib/constants.js` owns `DEV_EDIPI` (used by auth.js, seed.js, setup.js). The client default (`VITE_DEV_EDIPI` in `client/src/api.js`) and `screenshots.mjs` carry their own copy because they cannot import server code — if you change DEV_EDIPI, update those two.

## Run locally

```bash
docker compose up -d db          # needs .env (copy .env.example); postgres :5432
npm ci && npm ci --prefix server && npm ci --prefix client
node server/db/setup.js          # create DB + ALL migrations + seed (idempotent)
node server/index.js             # API :3000 (DEV_AUTH=true from .env)
npm run dev --prefix client      # Vite :5173
```

Note: `server/db/setup.js` duplicates the seed logic of `server/db/seeds/seed.js` inline (historical split-brain). setup.js now runs all 4 migrations; prefer `migrations/*.sql + seeds/seed.js` as the canonical pair (that is what CI uses). Consolidating setup.js to call seed.js is an open cleanup.

## Demo flow (the customer-critical path)

What every walkthrough follows, and what E2E pins:

1. **Dashboard** (`/`) — KPI cards (NMCS Aircraft, Open Reqs, Due-In Today, Low Stock), NMCS/PMCS board, open requisitions table. Seed scenario: BUNO 166490 grounded 18d (NMCS, JCN serial 0892 — UI renders JCNs in unit/FY format, e.g. VMM365-26-0892), 169017 PMCS, 6 open reqs.
2. **Aircraft** (`/aircraft`) — 5 seeded MV-22B airframes, grounded state visible.
3. **Requisitions** (`/requisitions`) — M00365-prefixed MILSTRIP document numbers, status badges.

## E2E (Playwright)

- `e2e/demo-flow.spec.js` + `playwright.config.js` (root). Because there is no deployment, **E2E always targets the local stack**: config `webServer` starts Express (`DEV_AUTH=true`, polls `/health` which 503s until the DB connects) and the Vite dev server. DB must be migrated + seeded first.
- Local run: bring up Postgres + seed (see above), then `npm run test:e2e`.
- CI (`.github/workflows/e2e.yml`): weekly cron `0 14 * * 1` + `workflow_dispatch` + PRs. Spins a postgres service container, applies `server/db/migrations/*.sql` in order via psql, runs `server/db/seeds/seed.js`, then Playwright (chromium).
- Tests assert seeded values (non-vacuous): KPI values numeric (the em-dash placeholder means a dead API), NMCS count = 1, BUNOs, JCN, doc-number pattern. No screenshots/snapshots are taken (house rule for anything near auth surfaces; also no credential fields exist here).

## Conventions

- PR-only workflow; an Opus verifier gate reviews before merge. Never merge directly.
- Never commit: `.env`, `certs/` (`*.key`, `*.crt`, `*.pem` are gitignored), or Playwright output (`test-results/`, `playwright-report/`).
- `research/` contains throwaway prototypes (CAC auth test certs etc.) — do not import from product code.
- Migrations are append-only numbered SQL files; docker-entrypoint runs them only on a fresh volume — existing volumes need manual `psql -f` or `node server/db/setup.js`.
