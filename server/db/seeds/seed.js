'use strict';

/**
 * Aviation IMS — Dev Seed Data
 * Run: node server/db/seeds/seed.js
 *
 * Creates realistic test data for local dev / demo.
 * Platform: MV-22B (VMM-365, MCAS New River) — no KC-130, no F/A-18
 * Safe for demo — no real BUNOs, CUI, or actual personnel data.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../..', '.env') });
const pool = require('../pool');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function julian(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const start = new Date(d.getFullYear(), 0, 0);
  const day   = Math.floor((d - start) / 86400000);
  return String(d.getFullYear()).slice(-2) + String(day).padStart(3, '0');
}

function docnum(serial, daysAgo = 0) {
  return `M00365${julian(daysAgo)}${String(serial).padStart(4, '0')}`;
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const UNITS = [
  { name: 'VMM-365 Blue Knights', uic: 'M00365', location: 'MCAS New River, NC' },
  { name: 'VMM-365 DET ALPHA',    uic: 'M00365A', location: 'Forward Deployed' },
];

const PARTS = [
  // FSC 2915 — Engine fuel system components
  { nsn: '2915011234567', niin: '011234567', fsc: '2915', description: 'FILTER, FUEL, ENGINE — MV-22B', unit_of_issue: 'EA', unit_price: 487.50, flis_verified: true },
  // FSC 4730 — Hose, pipe fittings, valves
  { nsn: '4730014482680', niin: '014482680', fsc: '4730', description: 'COUPLING, HYDRAULIC LINE, QUICK DISCONNECT', unit_of_issue: 'EA', unit_price: 214.00, flis_verified: true },
  // FSC 5330 — Packing and gasket materials
  { nsn: '5330005892341', niin: '005892341', fsc: '5330', description: 'O-RING, HYDRAULIC, AS568-214', unit_of_issue: 'PK', unit_price: 12.75,  flis_verified: true },
  // FSC 5365 — Nuts and washers
  { nsn: '5365001849302', niin: '001849302', fsc: '5365', description: 'NUT, SELF-LOCKING, HEX, MS21042L4', unit_of_issue: 'PK', unit_price: 8.40,   flis_verified: true },
  // FSC 5340 — Hardware and parachute hardware
  { nsn: '5340001023847', niin: '001023847', fsc: '5340', description: 'PIN, COTTER, MS24665-132', unit_of_issue: 'PK', unit_price: 4.20,   flis_verified: true },
  // FSC 9150 — Oils and greases
  { nsn: '9150014728391', niin: '014728391', fsc: '9150', description: 'OIL, GEAR, TRANSMISSION, MIL-PRF-23699', unit_of_issue: 'QT', unit_price: 38.60,  flis_verified: true },
  // FSC 5975 — Electrical hardware
  { nsn: '5975013847291', niin: '013847291', fsc: '5975', description: 'CONNECTOR, ELECTRICAL, MIL-DTL-38999', unit_of_issue: 'EA', unit_price: 892.00, flis_verified: true },
  // FSC 5945 — Relays and solenoids
  { nsn: '5945002938471', niin: '002938471', fsc: '5945', description: 'RELAY, SOLID STATE, 28VDC, AIRCRAFT', unit_of_issue: 'EA', unit_price: 1240.00, flis_verified: true },
  // FSC 1560 — Airframe structural components
  { nsn: '1560015829473', niin: '015829473', fsc: '1560', description: 'BRACKET, MOUNTING, HYDRAULIC PUMP — V-22', unit_of_issue: 'EA', unit_price: 3847.00, flis_verified: false },
  // FSC 2840 — Gas turbine and jet engines
  { nsn: '2840018374920', niin: '018374920', fsc: '2840', description: 'BEARING, BALL, ENGINE ACCESSORY GEARBOX', unit_of_issue: 'EA', unit_price: 2156.00, flis_verified: true },
];

const PART_NUMBERS = [
  { part_number: 'V22-FLT-001',    nsn: '2915011234567', cage_code: '96906', manufacturer: 'Parker Hannifin' },
  { part_number: '3J3761-1',        nsn: '4730014482680', cage_code: '58536', manufacturer: 'Eaton Aerospace' },
  { part_number: 'AS568-214-70D',   nsn: '5330005892341', cage_code: '81343', manufacturer: 'Parker Seals' },
  { part_number: 'MS21042L4',       nsn: '5365001849302', cage_code: '96906', manufacturer: 'Lisi Aerospace' },
  { part_number: 'MS24665-132',     nsn: '5340001023847', cage_code: '96906', manufacturer: 'Military Standard' },
  { part_number: 'MIL-PRF-23699F', nsn: '9150014728391', cage_code: '78343', manufacturer: 'Mobil Jet Oil II' },
  { part_number: 'D38999/20WA35SN', nsn: '5975013847291', cage_code: '75040', manufacturer: 'Amphenol' },
  { part_number: 'SSAC-28-AMP15',   nsn: '5945002938471', cage_code: '27514', manufacturer: 'TE Connectivity' },
  { part_number: 'V22-BKT-HYD-007', nsn: '1560015829473', cage_code: '1F046', manufacturer: 'Bell Boeing' },
  { part_number: 'AGB-BRG-7310',    nsn: '2840018374920', cage_code: '93410', manufacturer: 'SKF Aerospace' },
];

const AIRCRAFT = [
  { buno: '166490', mds: 'MV-22B', serial_number: 'D0049' },
  { buno: '168019', mds: 'MV-22B', serial_number: 'D0178' },
  { buno: '168661', mds: 'MV-22B', serial_number: 'D0220' },
  { buno: '169017', mds: 'MV-22B', serial_number: 'D0376' },
  { buno: '169354', mds: 'MV-22B', serial_number: 'D0413' },
];

const ICRL = [
  { nsn: '2915011234567', capability_code: 'A1', repair_source: 'i_level' },
  { nsn: '4730014482680', capability_code: 'X1', repair_source: 'commercial' },
  { nsn: '5975013847291', capability_code: 'X1', repair_source: 'commercial' },
  { nsn: '5945002938471', capability_code: 'A1', repair_source: 'i_level' },
  { nsn: '2840018374920', capability_code: 'X1', repair_source: 'commercial' },
];

// ---------------------------------------------------------------------------
// Seed runner
// ---------------------------------------------------------------------------

async function seed() {
  const client = await pool.connect();
  try {
    console.log('🌱 Seeding Aviation IMS dev database...\n');
    await client.query('BEGIN');

    // 1. Units
    console.log('  → Units...');
    const unitIds = {};
    for (const u of UNITS) {
      const r = await client.query(
        `INSERT INTO units (name, uic, location)
         VALUES ($1,$2,$3)
         ON CONFLICT DO NOTHING
         RETURNING unit_id`,
        [u.name, u.uic, u.location]
      );
      if (r.rows.length) unitIds[u.uic] = r.rows[0].unit_id;
    }
    // Fetch existing if already seeded
    for (const u of UNITS) {
      if (!unitIds[u.uic]) {
        const r = await client.query('SELECT unit_id FROM units WHERE uic=$1', [u.uic]);
        if (r.rows.length) unitIds[u.uic] = r.rows[0].unit_id;
      }
    }
    const primaryUnitId = unitIds['M00365'];
    console.log(`     ${UNITS.length} units (primary unit_id=${primaryUnitId})`);

    // 2. Dev user (matches DEV_AUTH EDIPI 0000000001)
    console.log('  → Dev user...');
    const userResult = await client.query(
      `INSERT INTO users (edipi, name, rank, role, unit_id)
       VALUES ('0000000001','GRAY, ERIC M.','SSgt','admin',$1)
       ON CONFLICT (edipi) DO UPDATE SET role='admin', unit_id=$1, name='GRAY, ERIC M.'
       RETURNING user_id`,
      [primaryUnitId]
    );
    const devUserId = userResult.rows[0].user_id;

    // Extra clerks for realism
    const clerks = [
      { edipi:'0000000002', name:'SMITH, JAMES R.', rank:'Cpl',  role:'clerk' },
      { edipi:'0000000003', name:'JONES, MARIA L.', rank:'Sgt',  role:'sncoic' },
      { edipi:'0000000004', name:'DAVIS, TYLER B.', rank:'GySgt',role:'officer' },
    ];
    for (const c of clerks) {
      await client.query(
        `INSERT INTO users (edipi, name, rank, role, unit_id)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (edipi) DO NOTHING`,
        [c.edipi, c.name, c.rank, c.role, primaryUnitId]
      );
    }
    console.log(`     4 users (dev admin EDIPI 0000000001, user_id=${devUserId})`);

    // 3. Parts master
    console.log('  → Parts master...');
    for (const p of PARTS) {
      await client.query(
        `INSERT INTO parts_master (nsn, niin, fsc, description, unit_of_issue, unit_price, flis_verified)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (nsn) DO NOTHING`,
        [p.nsn, p.niin, p.fsc, p.description, p.unit_of_issue, p.unit_price, p.flis_verified]
      );
    }
    console.log(`     ${PARTS.length} parts`);

    // 4. Part numbers cross-reference
    console.log('  → Part number cross-references...');
    for (const pn of PART_NUMBERS) {
      await client.query(
        `INSERT INTO part_numbers (part_number, nsn, cage_code, manufacturer)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT DO NOTHING`,
        [pn.part_number, pn.nsn, pn.cage_code, pn.manufacturer]
      );
    }
    console.log(`     ${PART_NUMBERS.length} part numbers`);

    // 5. Aircraft
    console.log('  → Aircraft...');
    const acIds = {};
    for (const ac of AIRCRAFT) {
      const r = await client.query(
        `INSERT INTO aircraft (buno, mds, serial_number, unit_id, status)
         VALUES ($1,$2,$3,$4,'active')
         ON CONFLICT (buno) DO NOTHING
         RETURNING aircraft_id`,
        [ac.buno, ac.mds, ac.serial_number, primaryUnitId]
      );
      if (r.rows.length) acIds[ac.buno] = r.rows[0].aircraft_id;
    }
    for (const ac of AIRCRAFT) {
      if (!acIds[ac.buno]) {
        const r = await client.query('SELECT aircraft_id FROM aircraft WHERE buno=$1', [ac.buno]);
        if (r.rows.length) acIds[ac.buno] = r.rows[0].aircraft_id;
      }
    }
    console.log(`     ${AIRCRAFT.length} aircraft`);

    // 6. ICRL
    console.log('  → ICRL...');
    for (const i of ICRL) {
      await client.query(
        `INSERT INTO icrl (nsn, capability_code, repair_source, uploaded_by, effective_date)
         VALUES ($1,$2,$3,$4,CURRENT_DATE)
         ON CONFLICT DO NOTHING`,
        [i.nsn, i.capability_code, i.repair_source, devUserId]
      );
    }
    console.log(`     ${ICRL.length} ICRL entries`);

    // 7. Inventory
    console.log('  → Inventory...');
    const inventory = [
      { nsn:'2915011234567', qty_on_hand:4,  qty_on_order:2, reorder_point:3, condition:'RFI', bin_location:'A-01' },
      { nsn:'4730014482680', qty_on_hand:12, qty_on_order:0, reorder_point:5, condition:'RFI', bin_location:'A-02' },
      { nsn:'5330005892341', qty_on_hand:1,  qty_on_order:6, reorder_point:5, condition:'RFI', bin_location:'B-07' },
      { nsn:'5365001849302', qty_on_hand:48, qty_on_order:0, reorder_point:20,condition:'RFI', bin_location:'C-03' },
      { nsn:'5340001023847', qty_on_hand:32, qty_on_order:0, reorder_point:20,condition:'RFI', bin_location:'C-04' },
      { nsn:'9150014728391', qty_on_hand:8,  qty_on_order:0, reorder_point:4, condition:'RFI', bin_location:'D-01' },
      { nsn:'5975013847291', qty_on_hand:2,  qty_on_order:1, reorder_point:2, condition:'RFI', bin_location:'E-12' },
      { nsn:'5945002938471', qty_on_hand:0,  qty_on_order:2, reorder_point:1, condition:'RFI', bin_location:'E-14' },
      { nsn:'2840018374920', qty_on_hand:1,  qty_on_order:0, reorder_point:1, condition:'RFI', bin_location:'F-03' },
      { nsn:'4730014482680', qty_on_hand:2,  qty_on_order:0, reorder_point:0, condition:'NRFI',bin_location:'NRFI-CAGE' },
    ];
    for (const inv of inventory) {
      await client.query(
        `INSERT INTO inventory (nsn, unit_id, qty_on_hand, qty_on_order, reorder_point, condition, bin_location)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (nsn, unit_id, condition) DO NOTHING`,
        [inv.nsn, primaryUnitId, inv.qty_on_hand, inv.qty_on_order, inv.reorder_point, inv.condition, inv.bin_location]
      );
    }
    console.log(`     ${inventory.length} inventory records`);

    // 8. Requisitions
    console.log('  → Requisitions...');
    const reqData = [
      // NMCS — priority 01, engine bearing grounded 166490
      { docnum: docnum(1, 18), type:'A0A', nsn:'2840018374920', acBuno:'166490', jcn:'VMM365-2024-0892', priority:'01', fund_code:'FB', status:'backordered', qty:1, daysAgo:18 },
      // PMCS — priority 02, hydraulic coupling
      { docnum: docnum(2, 12), type:'A0A', nsn:'4730014482680', acBuno:'168019', jcn:'VMM365-2024-0910', priority:'02', fund_code:'FB', status:'due_in',     qty:2, daysAgo:12 },
      // Routine — fuel filter
      { docnum: docnum(3,  8), type:'A0A', nsn:'2915011234567', acBuno:'168661', jcn:'VMM365-2024-0931', priority:'03', fund_code:'FB', status:'submitted',  qty:2, daysAgo:8  },
      // Routine — O-rings (low stock)
      { docnum: docnum(4,  5), type:'A0A', nsn:'5330005892341', acBuno:null,     jcn:null,              priority:'03', fund_code:'FC', status:'submitted',  qty:10,daysAgo:5  },
      // Relay — backordered
      { docnum: docnum(5, 22), type:'AP1', nsn:'5945002938471', acBuno:'169017', jcn:'VMM365-2024-0841', priority:'01', fund_code:'FB', status:'backordered', qty:1, daysAgo:22 },
      // Connector — shipped
      { docnum: docnum(6, 31), type:'A0A', nsn:'5975013847291', acBuno:'168019', jcn:'VMM365-2024-0801', priority:'02', fund_code:'FB', status:'shipped',    qty:1, daysAgo:31 },
      // Received
      { docnum: docnum(7, 45), type:'A0A', nsn:'9150014728391', acBuno:null,     jcn:null,              priority:'03', fund_code:'FC', status:'received',   qty:4, daysAgo:45 },
    ];

    const reqIds = {};
    for (const r of reqData) {
      const acId = r.acBuno ? acIds[r.acBuno] : null;
      const res = await client.query(
        `INSERT INTO requisitions
           (document_number, type, nsn, aircraft_id, jcn, unit_id, created_by, priority, fund_code, status, quantity, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
           NOW() - INTERVAL '${r.daysAgo} days',
           NOW() - INTERVAL '${Math.max(0,r.daysAgo-2)} days')
         ON CONFLICT (document_number) DO NOTHING
         RETURNING req_id`,
        [r.docnum, r.type, r.nsn, acId, r.jcn, primaryUnitId, devUserId, r.priority, r.fund_code, r.status, r.qty]
      );
      if (res.rows.length) reqIds[r.docnum] = res.rows[0].req_id;
    }
    console.log(`     ${reqData.length} requisitions`);

    // 9. NMCS events — 166490 grounded (engine bearing), 169017 PMCS (relay)
    console.log('  → NMCS events...');
    if (acIds['166490']) {
      await client.query(
        `UPDATE aircraft SET status='grounded' WHERE buno='166490'`
      );
      const nmcsReqId = reqIds[docnum(1, 18)];
      await client.query(
        `INSERT INTO nmcs_events (aircraft_id, nsn, req_id, jcn, type, opened_by, opened_at)
         VALUES ($1,'2840018374920',$2,'VMM365-2024-0892','NMCS',$3,NOW() - INTERVAL '18 days')
         ON CONFLICT DO NOTHING`,
        [acIds['166490'], nmcsReqId || null, devUserId]
      );
    }
    if (acIds['169017']) {
      const pmcsReqId = reqIds[docnum(5, 22)];
      await client.query(
        `INSERT INTO nmcs_events (aircraft_id, nsn, req_id, jcn, type, opened_by, opened_at)
         VALUES ($1,'5945002938471',$2,'VMM365-2024-0841','PMCS',$3,NOW() - INTERVAL '22 days')
         ON CONFLICT DO NOTHING`,
        [acIds['169017'], pmcsReqId || null, devUserId]
      );
    }
    console.log(`     2 NMCS events (166490 grounded, 169017 PMCS)`);

    // 10. Transaction history — issue history for usage trends / JCN cost
    console.log('  → Transaction history...');
    const txData = [
      { type:'issue',   nsn:'2915011234567', buno:'168661', jcn:'VMM365-2024-0931', qty:1, daysAgo:8  },
      { type:'issue',   nsn:'4730014482680', buno:'168019', jcn:'VMM365-2024-0910', qty:1, daysAgo:12 },
      { type:'issue',   nsn:'9150014728391', buno:'166490', jcn:'VMM365-2024-0820', qty:2, daysAgo:30 },
      { type:'issue',   nsn:'5365001849302', buno:'168661', jcn:'VMM365-2024-0931', qty:4, daysAgo:8  },
      { type:'issue',   nsn:'5340001023847', buno:'169017', jcn:'VMM365-2024-0841', qty:6, daysAgo:20 },
      { type:'issue',   nsn:'2915011234567', buno:'169354', jcn:'VMM365-2024-0788', qty:1, daysAgo:45 },
      { type:'issue',   nsn:'9150014728391', buno:'168661', jcn:'VMM365-2024-0756', qty:4, daysAgo:60 },
      { type:'receipt', nsn:'9150014728391', buno:null,     jcn:null,               qty:4, daysAgo:43 },
      { type:'receipt', nsn:'5365001849302', buno:null,     jcn:null,               qty:50,daysAgo:90 },
      { type:'issue',   nsn:'5975013847291', buno:'168019', jcn:'VMM365-2024-0801', qty:1, daysAgo:31 },
      { type:'issue',   nsn:'4730014482680', buno:'166490', jcn:'VMM365-2024-0820', qty:2, daysAgo:32 },
    ];
    for (const tx of txData) {
      const acId = tx.buno ? acIds[tx.buno] : null;
      await client.query(
        `INSERT INTO transactions
           (type, nsn, aircraft_id, jcn, unit_id, performed_by, quantity, condition_out, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'RFI',NOW() - INTERVAL '${tx.daysAgo} days')`,
        [tx.type, tx.nsn, acId, tx.jcn, primaryUnitId, devUserId, tx.qty]
      );
    }
    console.log(`     ${txData.length} transactions`);

    await client.query('COMMIT');

    console.log('\n✅ Seed complete.\n');
    console.log('  Unit:     VMM-365 Blue Knights (MCAS New River)');
    console.log('  Aircraft: 5 MV-22B airframes (166490 grounded)');
    console.log('  Parts:   ', PARTS.length, 'NSNs in catalog');
    console.log('  Reqs:     7 (2 backordered, 1 NMCS P01, 1 overdue relay)');
    console.log('  NMCS:     2 open (166490 NMCS 18d, 169017 PMCS 22d)');
    console.log('  Low stock: O-rings (1 on hand, reorder=5), relay (0 on hand)');
    console.log('\n  Dev login: EDIPI 0000000001 (DEV_AUTH=true, role=admin)');
    console.log('  Dashboard will show: 1 NMCS, 6 open reqs, 2 low stock\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Seed failed:', err.message);
    if (err.code === 'ECONNREFUSED') {
      console.error('   → Postgres is not running. Start Docker Desktop and run:');
      console.error('     docker-compose up -d db');
    }
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
