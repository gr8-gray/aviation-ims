# Aviation IMS — Screen & Functionality Breakdown
> Generated 2026-04-26. All screens verified against live seed data (VMM-365, 5 MV-22B airframes).

---

## 1. Dashboard

**Purpose:** Command center. First thing a Supply Officer or clerk sees on login.

**KPI Cards (top row):**
- **NMCS Aircraft** — count of grounded aircraft with open NMCS events. Red accent. Currently: 1 (166490).
- **Open Reqs** — total non-received, non-closed requisitions. Yellow accent. Currently: 6.
- **Due-In Today** — requisitions with expected receipt today. Blue accent. Currently: 1.
- **Low Stock Items** — inventory lines at or below reorder point. Green accent. Currently: 4.

**NMCS / PMCS Status table:**
Shows all open aircraft-grounding events. Columns: Type (NMCS/PMCS badge), BUNO, MDS, Part description, NSN, JCN, Days Down (red when aged), Req Status badge. Summary line top-right: "1 NMCS · 1 PMCS · avg 20d down." Currently showing 166490 (NMCS, 18d, backordered) and 169017 (PMCS, 22d, backordered).

**Open Requisitions table:**
All open docs below NMCS section. Columns: Doc Number, NSN, Description, Priority (color coded: 01=red, 02=yellow, 03=gray), Status badge, BUNO. Currently 6 rows spanning backordered, due-in, shipped, and submitted statuses.

---

## 2. Inventory

**Purpose:** Stock management. Real-time view of what's on the shelf, what's low, what's NRFI.

**Top bar:** NSN filter field + Search button. "Show Low Stock (4)" badge button — filters to items at or below reorder. Action buttons: Turn In, Exchange, Transfer, Issue Parts.

**Stock Status table:** 10 line items. Columns: NSN, Description, Condition (RFI/NRFI badge), Location (bin), On Hand (red when at/below reorder), Due-In, On Order, Reorder Point, Unit of Issue, Price, Adj (adjustment link).

**Low stock highlighted in red:** Engine bearing (1 on hand, reorder 1), connector (2 on hand, reorder 2), O-ring (1 on hand, reorder 5), relay (0 on hand, reorder 1). NRFI hydraulic coupling shown separately with NRFI-CAGE location.

---

## 3. Requisitions

**Purpose:** Full requisition register. Create, track, and action all supply documents.

**Top bar:** Status filter dropdown (All Open / specific status). Priority filter dropdown. MOV Review button. + New Req button (blue, primary CTA).

**Requisitions table:** 6 documents. Columns: Doc Number, NSN, Description, Qty, Priority (color-coded number), Status badge (BACKORDERED/DUE_IN/SHIPPED/SUBMITTED), BUNO, Fund Code, Actions (AC1 status update button + download arrow per row).

**Bottom:** Download DD-2765 button — exports the full requisition set as a DD Form 2765.

**Status badges:** BACKORDERED (orange), DUE_IN (teal), SHIPPED (blue), SUBMITTED (purple).

---

## 4. Aircraft & NMCS

**Purpose:** Fleet status board. Tracks each airframe's readiness, open NMCS events, and associated reqs.

**Header:** "5 aircraft in unit" + View All NMCS button.

**Aircraft table:** 5 MV-22B airframes. Columns: BUNO, MDS, Status (GROUNDED=red, ACTIVE=green), NMCS (open event badge), Open Reqs (count badge), Actions (Detail + NMCS buttons per row).

**Current state:** 166490 = GROUNDED (1 OPEN NMCS badge), 169017 = ACTIVE (1 OPEN PMCS badge), 168019/168661/169354 = ACTIVE with open reqs but no NMCS events.

---

## 5. Parts DB

**Purpose:** NSN/NIIN catalog lookup and management. Search the parts master, run FLIS lookups, add new parts.

**Top bar:** NSN/NIIN/description search field + Search DB button + FLIS Lookup button. Pending Approval button + Add Part button (blue).

**Current behavior:** Loads empty — requires a search term to show results. The 10 seeded NSNs are queryable but not shown on mount. (Known gap — needs auto-load fix.)

**Intended use:** Supply clerks search for a part before ordering. FLIS Lookup pulls live Federal Logistics Information System data to verify NSN and get current pricing. Add Part / Pending Approval flow handles new NSNs not yet in the local catalog.

---

## 6. Repairables & DIFM

**Purpose:** Tracks repairable components across their full maintenance lifecycle — DIFM queue, serialized items, repair routing, and DRMO disposition.

### Tab A — DIFM Queue (default)
Three KPI cards: In Repair, Overdue, Avg Days Out. Table of all items currently at I-Level or commercial repair. + Open DIFM button to initiate a new DIFM turn-in. Open Only toggle filters to active items only. Currently empty (no seed data).

### Tab B — Serialized Items
"Tracked Serialized Components" — 0 registered. Tracks high-value serialized parts with individual service life, installation history, and inspection records. Send to Maintenance button routes a serialized item to DIFM. Register Item button adds a new serialized component to tracking.

### Tab C — ICRL / Repair Lists
Two upload panels side by side:
- **ICRL (Individual Component Repair List):** Quarterly upload from I-Level shop. Columns: P/N · NSN · Description · Work Center · Capability Code. Upload & Replace button.
- **Commercial Repair List:** Parts routed to specific commercial vendors regardless of ICRL designation. Columns: P/N · NSN · Description · Vendor.

**Routing Decision Logic table** (below uploads): 4 decision branches that determine where a repairable gets routed:
| ICRL Result | Commercial List | Routing Decision |
|---|---|---|
| Not X1 (repairable) | — | I-LEVEL → WORK CENTER |
| X1 (not repairable) | On list | COMMERCIAL → VENDOR |
| X1 (not repairable) | Not on list | OTS |
| Not in ICRL | — | OTS (DEFAULT) |

### Tab D — DRMO Queue
"Condemned/Unserviceable Items routed to Defense Reutilization & Marketing Office." Lists items condemned beyond repair for government disposal processing. Currently empty.

---

## 7. Reports

**Purpose:** Analytics and reporting for Supply Officer briefs, readiness reviews, and audit. 7 report types, 90-day default period (adjustable).

### NMCS Brief
Daily Supply Officer brief. All open NMCS/PMCS events. Columns: Type, BUNO, MDS, Part, JCN, Days Down (red when aged), Req. Currently: 2 rows (166490 NMCS 18d, 169017 PMCS 22d, both backordered). Timestamp generated on run.

### Open Documents
Outstanding requisitions with age and overdue flags. Columns: Doc Number, NSN, Description, Priority, Status, Age (days), Overdue flag. Currently 4 of 6 docs flagged OVERDUE (both P01 backordered, P02 shipped 31d, P02 due-in 12d). P03 filter and fuel filter not yet overdue.

### Stock Status
On-hand snapshot with low-stock indicators. Columns: NSN, Description, Condition, On Hand (red when low), Reorder, On Order, Status (LOW/OK badge). 4 items LOW, 6 items OK. NRFI condition shown separately.

### Usage Trends
Top consumed parts by quantity issued, ranked by total qty in the period. Columns: NSN, Description, UI, Total Issued, Events (distinct issue transactions), Aircraft (distinct BUNOs), Last Issued. Currently: Pin cotters (6), gear oil (6), nuts (4), hydraulic couplings (3), fuel filters (2), connector (1).

### Parts Cost by JCN
Total parts value per maintenance job number, sorted by cost descending. Columns: JCN, BUNO, MDS, Part Types, Total Qty, Total Cost, Period (date range). Currently 7 JCNs ranging from $892 (single connector) to $25.20 (6 pin cotters).

### Turnaround Time (TAT)
Req submission → receipt time by priority and NSN. Shows avg, min, and max days for completed orders only. Currently 1 completed order in the window: Gear Oil (P03, 2d avg). All P01/P02 still open so no TAT yet — will populate as reqs are received.

### AWOP Status Board
Aircraft Awaiting Parts. KPI cards: AWOP Aircraft count, Open Events count, Avg Days Down. Detail table: BUNO, MDS, Part, NSN, JCN, Days Down (red), Doc Number, Priority, Req Status. Currently: 1 AWOP aircraft (166490, engine bearing, JCN VMM365-26-0892, 18d, P01 BACKORDERED).

---

## 8. Administration

**Purpose:** User management and unit configuration. Admin-only access.

### Tab — Users (4)
Lists all registered users. Columns: EDIPI, Name, Rank, Role (color-coded badge: ADMIN=red, OFFICER=orange, SNCOIC=teal, CLERK=gray), Unit, Last Login. Edit button per row. "CAC auth — users appear on first login" note confirms prod auth model (users auto-provision on first CAC login, admin assigns roles). Currently: GRAY ERIC M. (SSgt, ADMIN, last login today), DAVIS TYLER B. (GySgt, OFFICER), JONES MARIA L. (Sgt, SNCOIC), SMITH JAMES R. (Cpl, CLERK).

### Tab — Units (2)
Lists configured units. VMM-365 Blue Knights (MCAS New River) as primary + VMM-365 DET ALPHA (Forward Deployed).

---

## Known Gaps (pre-pitch)

| Screen | Issue | Priority |
|--------|-------|----------|
| Parts DB | Doesn't auto-load catalog on mount — shows empty search state | Medium |
| Repairables | No DIFM or serialized seed data — queue empty | Low |
| TAT Report | Only 1 completed order in seed — most orders still open, sparse data | Low |
