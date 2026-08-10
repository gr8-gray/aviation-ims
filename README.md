# Aviation IMS — DoD O/I-Level Inventory Management

> Full-stack inventory management for U.S. Marine Corps O-level (Organizational) and I-level (Intermediate) aviation maintenance units. Tracks airframes, NMCS status, repairables, ICRL, MILSTRIP requisitions, and supply readiness reports. Built solo under [Metron Matrix Solutions LLC](https://metronmatrix.com).

---

## Forward-deployed context

I didn't build this from a spec handed to me — I built it from six years *inside* the workflow. USMC Aviation Supply Technician on the V-22 flightline (VMM-265, Okinawa), then Navy aviation supply chain at V2X. Every entity in this system — NMCS states, ICRL induction, MILSTRIP document numbers, the AWOP board — is something I worked by hand before I encoded it. That is the forward-deployed pattern: embed in the customer's domain, learn the real workflow, ship the tool the field actually needs.

---

## What it covers

The system encodes 6+ years of aviation supply chain domain knowledge:

- **MILSTRIP** (DoD 4000.25-1-M) — document number formatting, Julian dates, advice codes
- **NMCS / NMCM / PMCS** — mission-capable status reporting
- **AWP / ICRL** — Awaiting Parts / Individual Component Repair List lifecycle for repairables
- **NSN / NIIN / FLIS** — federal supply system identifiers and lookups
- **AWOP** — Awaiting On-Hand Parts board

Seed data: VMM-365 squadron, 5 MV-22B airframes, one grounded scenario. Fictional / publicly observable squadron designators only — no CUI.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 · Vite 8 · React Router 7 · Axios |
| Backend | Node.js · Express · Helmet · Multer · ExcelJS |
| Database | PostgreSQL — Dockerized |
| Test | Playwright (single happy-path demo spec, ~6 tests) |

7 backend route modules: `aircraft`, `inventory`, `parts`, `repairables`, `requisitions`, `reports`, `users`.
7 frontend pages with deep-space palette and role-aware navigation.

---

## Architecture

```
client/  (React 19 + Vite)
  └── 7 pages: Dashboard, Aircraft, Inventory, Repairables,
                Requisitions, Reports, Settings

server/  (Node + Express)
  ├── routes/
  │   ├── aircraft.js     # airframes, BUNO, NMCS state
  │   ├── inventory.js    # stock, locations, transactions
  │   ├── parts.js        # NSN/NIIN, FLIS, parts master
  │   ├── repairables.js  # ICRL, AWP, induction/return
  │   ├── requisitions.js # MILSTRIP, document numbers
  │   ├── reports.js      # NMCS, AWOP, supply readiness
  │   └── users.js        # auth, roles, audit
  ├── lib/
  ├── middleware/
  └── db/                  # postgres schema + migrations

docker-compose.yml          # postgres on :5432
```

---

## Run

```bash
# one-time
docker compose up -d        # postgres at aviation-ims-db-1:5432
cd server && npm install
cd ../client && npm install

# dev
cd server && npm run dev    # Express on :3000
cd client && npm run dev    # Vite on :5173
```

---

## Status

Demo / local full-stack build (not fielded). Phases 1-6 complete: DB schema, FLIS client, MILSTRIP generator, aircraft/NMCS, inventory/repairables/ICRL, reports/users. Frontend fully implemented.

Roadmap: optical tracking system (OTS) sync — currently stubbed pending live spec.

---

## Why this exists

Existing DoD aviation inventory tools are decades old and don't reflect modern UX expectations. This is a clean-sheet build that respects the doctrinal source (MILSTRIP, NSN, ICRL) without inheriting 1990s software constraints.

---

## License

MIT — see `LICENSE`.

Built by Eric Gray. Aviation supply chain background: USMC NCO (V-22 Osprey supply, VMM-265 Okinawa) → Navy aviation supply chain at V2X.
