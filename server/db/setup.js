'use strict';

/**
 * One-shot DB setup: create database → run migration → seed
 * Run from project root: node server/db/setup.js
 * Requires Postgres running (Docker Desktop + docker-compose up -d db)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../..', '.env') });
const { Client, Pool } = require('pg');
const fs   = require('fs');
const path = require('path');
const { DEV_EDIPI } = require('../lib/constants');

const DB_NAME = process.env.DB_NAME || 'aviation_ims';
const DB_USER = process.env.DB_USER || 'postgres';
const DB_PASS = process.env.DB_PASSWORD || 'changeme';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '5432');

async function setup() {
  // ── Step 1: Create database ──────────────────────────────────────
  console.log(`\n📦 Connecting to Postgres at ${DB_HOST}:${DB_PORT}...`);
  const admin = new Client({ host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASS, database: 'postgres' });

  try {
    await admin.connect();
    console.log('   Connected.\n');
  } catch (err) {
    console.error(`\n❌ Cannot connect to Postgres: ${err.message}`);
    console.error('\n   Make sure Docker Desktop is running and the db container is up:');
    console.error('   docker-compose up -d db\n');
    process.exit(1);
  }

  const exists = await admin.query(`SELECT 1 FROM pg_database WHERE datname=$1`, [DB_NAME]);
  if (exists.rows.length === 0) {
    console.log(`🗄  Creating database "${DB_NAME}"...`);
    await admin.query(`CREATE DATABASE ${DB_NAME}`);
    console.log('   Created.\n');
  } else {
    console.log(`🗄  Database "${DB_NAME}" already exists.\n`);
  }
  await admin.end();

  // ── Step 2: Run migration ────────────────────────────────────────
  const pool = new Pool({ host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASS, database: DB_NAME });

  // Run ALL migrations in order (previously only 001 ran — 002-004 were skipped).
  const migrationsDir = path.join(__dirname, 'migrations');
  const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  for (const file of migrationFiles) {
    console.log(`📋 Running migration ${file}...`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    try {
      await pool.query(sql);
      console.log('   Migration complete.\n');
    } catch (err) {
      if (err.message.includes('already exists')) {
        console.log('   Objects already exist — skipping.\n');
      } else {
        console.error(`❌ Migration ${file} failed:`, err.message);
        await pool.end();
        process.exit(1);
      }
    }
  }

  // ── Step 3: Seed ─────────────────────────────────────────────────
  console.log('🌱 Running seed data...\n');

  // Inline seed (same as seed.js but reuses our pool)
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Units
    const unitR = await client.query(
      `INSERT INTO units (name, uic, location) VALUES
         ('VMM-365 Blue Knights','M00365','MCAS New River, NC'),
         ('VMM-365 DET ALPHA','M00365A','Forward Deployed')
       ON CONFLICT DO NOTHING
       RETURNING unit_id, uic`
    );
    let primaryUnitId;
    if (unitR.rows.length) {
      primaryUnitId = unitR.rows.find(r => r.uic === 'M00365')?.unit_id;
    }
    if (!primaryUnitId) {
      const r = await client.query(`SELECT unit_id FROM units WHERE uic='M00365'`);
      primaryUnitId = r.rows[0]?.unit_id;
    }
    console.log(`   Units: VMM-365 (unit_id=${primaryUnitId})`);

    // Dev user
    const userR = await client.query(
      `INSERT INTO users (edipi, name, rank, role, unit_id)
       VALUES ($2,'GRAY, ERIC M.','SSgt','admin',$1)
       ON CONFLICT (edipi) DO UPDATE SET role='admin', unit_id=$1
       RETURNING user_id`, [primaryUnitId, DEV_EDIPI]
    );
    const devUserId = userR.rows[0].user_id;
    await client.query(
      `INSERT INTO users (edipi, name, rank, role, unit_id) VALUES
         ('0000000002','SMITH, JAMES R.','Cpl','clerk',$1),
         ('0000000003','JONES, MARIA L.','Sgt','sncoic',$1),
         ('0000000004','DAVIS, TYLER B.','GySgt','officer',$1)
       ON CONFLICT (edipi) DO NOTHING`, [primaryUnitId]
    );
    console.log(`   Users: 4 (admin EDIPI ${DEV_EDIPI}, user_id=${devUserId})`);

    // Parts
    const parts = [
      ['2915011234567','011234567','2915','FILTER, FUEL, ENGINE — MV-22B','EA',487.50,true],
      ['4730014482680','014482680','4730','COUPLING, HYDRAULIC LINE, QUICK DISCONNECT','EA',214.00,true],
      ['5330005892341','005892341','5330','O-RING, HYDRAULIC, AS568-214','PK',12.75,true],
      ['5365001849302','001849302','5365','NUT, SELF-LOCKING, HEX, MS21042L4','PK',8.40,true],
      ['5340001023847','001023847','5340','PIN, COTTER, MS24665-132','PK',4.20,true],
      ['9150014728391','014728391','9150','OIL, GEAR, TRANSMISSION, MIL-PRF-23699','QT',38.60,true],
      ['5975013847291','013847291','5975','CONNECTOR, ELECTRICAL, MIL-DTL-38999','EA',892.00,true],
      ['5945002938471','002938471','5945','RELAY, SOLID STATE, 28VDC, AIRCRAFT','EA',1240.00,true],
      ['1560015829473','015829473','1560','BRACKET, MOUNTING, HYDRAULIC PUMP — V-22','EA',3847.00,false],
      ['2840018374920','018374920','2840','BEARING, BALL, ENGINE ACCESSORY GEARBOX','EA',2156.00,true],
    ];
    for (const p of parts) {
      await client.query(
        `INSERT INTO parts_master (nsn,niin,fsc,description,unit_of_issue,unit_price,flis_verified)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (nsn) DO NOTHING`, p
      );
    }
    console.log(`   Parts: ${parts.length} NSNs`);

    // Part numbers
    const pns = [
      ['V22-FLT-001','2915011234567','96906'],
      ['3J3761-1','4730014482680','58536'],
      ['AS568-214-70D','5330005892341','81343'],
      ['MS21042L4','5365001849302','96906'],
      ['MS24665-132','5340001023847','96906'],
      ['MIL-PRF-23699F','9150014728391','78343'],
      ['D38999/20WA35SN','5975013847291','75040'],
      ['SSAC-28-AMP15','5945002938471','27514'],
      ['AGB-BRG-7310','2840018374920','93410'],
    ];
    for (const pn of pns) {
      await client.query(
        `INSERT INTO part_numbers (part_number,nsn,cage_code) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, pn
      );
    }
    console.log(`   Part numbers: ${pns.length}`);

    // Aircraft
    const aircraft = [
      ['166490','MV-22B','D0049'],['168019','MV-22B','D0178'],
      ['168661','MV-22B','D0220'],['169017','MV-22B','D0376'],
      ['169354','MV-22B','D0413'],
    ];
    const acIds = {};
    for (const ac of aircraft) {
      const r = await client.query(
        `INSERT INTO aircraft (buno,mds,serial_number,unit_id,status)
         VALUES ($1,$2,$3,$4,'active') ON CONFLICT (buno) DO NOTHING RETURNING aircraft_id`,
        [...ac, primaryUnitId]
      );
      if (r.rows.length) acIds[ac[0]] = r.rows[0].aircraft_id;
    }
    for (const ac of aircraft) {
      if (!acIds[ac[0]]) {
        const r = await client.query(`SELECT aircraft_id FROM aircraft WHERE buno=$1`, [ac[0]]);
        if (r.rows.length) acIds[ac[0]] = r.rows[0].aircraft_id;
      }
    }
    console.log(`   Aircraft: ${aircraft.length} MV-22B airframes`);

    // ICRL
    for (const i of [
      ['2915011234567','A1','i_level'],['4730014482680','X1','commercial'],
      ['5975013847291','X1','commercial'],['5945002938471','A1','i_level'],
      ['2840018374920','X1','commercial'],
    ]) {
      await client.query(
        `INSERT INTO icrl (nsn,capability_code,repair_source,uploaded_by,effective_date)
         VALUES ($1,$2,$3,$4,CURRENT_DATE) ON CONFLICT DO NOTHING`,
        [...i, devUserId]
      );
    }
    console.log(`   ICRL: 5 entries`);

    // Inventory
    const inv = [
      ['2915011234567',4,2,3,'RFI','A-01'],['4730014482680',12,0,5,'RFI','A-02'],
      ['5330005892341',1,6,5,'RFI','B-07'],['5365001849302',48,0,20,'RFI','C-03'],
      ['5340001023847',32,0,20,'RFI','C-04'],['9150014728391',8,0,4,'RFI','D-01'],
      ['5975013847291',2,1,2,'RFI','E-12'],['5945002938471',0,2,1,'RFI','E-14'],
      ['2840018374920',1,0,1,'RFI','F-03'],['4730014482680',2,0,0,'NRFI','NRFI-CAGE'],
    ];
    for (const i of inv) {
      await client.query(
        `INSERT INTO inventory (nsn,unit_id,qty_on_hand,qty_on_order,reorder_point,condition,bin_location)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (nsn,unit_id,condition) DO NOTHING`,
        [i[0],primaryUnitId,...i.slice(1)]
      );
    }
    console.log(`   Inventory: ${inv.length} records`);

    // Julian date helper
    function julian(daysAgo=0) {
      const d = new Date(); d.setDate(d.getDate()-daysAgo);
      const start = new Date(d.getFullYear(),0,0);
      const day = Math.floor((d-start)/86400000);
      return String(d.getFullYear()).slice(-2)+String(day).padStart(3,'0');
    }
    function dn(serial,daysAgo=0) { return `M00365${julian(daysAgo)}${String(serial).padStart(4,'0')}`; }

    // Requisitions
    const reqRows = [
      [dn(1,18),'A0A','2840018374920','166490','V365-24-0892','01','FB','backordered',1,18],
      [dn(2,12),'A0A','4730014482680','168019','V365-24-0910','02','FB','due_in',2,12],
      [dn(3,8), 'A0A','2915011234567','168661','V365-24-0931','03','FB','submitted',2,8],
      [dn(4,5), 'A0A','5330005892341',null,null,'03','FC','submitted',10,5],
      [dn(5,22),'AP1','5945002938471','169017','V365-24-0841','01','FB','backordered',1,22],
      [dn(6,31),'A0A','5975013847291','168019','V365-24-0801','02','FB','shipped',1,31],
      [dn(7,45),'A0A','9150014728391',null,null,'03','FC','received',4,45],
    ];
    const reqIds = {};
    for (const r of reqRows) {
      const acId = r[3] ? acIds[r[3]] : null;
      const res = await client.query(
        `INSERT INTO requisitions
           (document_number,type,nsn,aircraft_id,jcn,unit_id,created_by,priority,fund_code,status,quantity,
            created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
           NOW()-$12::interval, NOW()-$13::interval)
         ON CONFLICT (document_number) DO NOTHING RETURNING req_id`,
        [r[0],r[1],r[2],acId,r[4],primaryUnitId,devUserId,r[5],r[6],r[7],r[8],
         `${r[9]} days`,`${Math.max(0,r[9]-2)} days`]
      );
      if (res.rows.length) reqIds[r[0]] = res.rows[0].req_id;
    }
    console.log(`   Requisitions: ${reqRows.length}`);

    // NMCS events
    await client.query(`UPDATE aircraft SET status='grounded' WHERE buno='166490'`);
    await client.query(
      `INSERT INTO nmcs_events (aircraft_id,nsn,req_id,jcn,type,opened_by,opened_at)
       VALUES ($1,'2840018374920',$2,'V365-24-0892','NMCS',$3,NOW()-INTERVAL '18 days')
       ON CONFLICT DO NOTHING`,
      [acIds['166490'], reqIds[dn(1,18)]||null, devUserId]
    );
    await client.query(
      `INSERT INTO nmcs_events (aircraft_id,nsn,req_id,jcn,type,opened_by,opened_at)
       VALUES ($1,'5945002938471',$2,'V365-24-0841','PMCS',$3,NOW()-INTERVAL '22 days')
       ON CONFLICT DO NOTHING`,
      [acIds['169017'], reqIds[dn(5,22)]||null, devUserId]
    );
    console.log(`   NMCS events: 2 (166490 grounded 18d, 169017 PMCS 22d)`);

    // Transactions
    const txRows = [
      ['issue','2915011234567','168661','V365-24-0931',1,8],
      ['issue','4730014482680','168019','V365-24-0910',1,12],
      ['issue','9150014728391','166490','V365-24-0820',2,30],
      ['issue','5365001849302','168661','V365-24-0931',4,8],
      ['issue','5340001023847','169017','V365-24-0841',6,20],
      ['issue','2915011234567','169354','V365-24-0788',1,45],
      ['issue','9150014728391','168661','V365-24-0756',4,60],
      ['receipt','9150014728391',null,null,4,43],
      ['receipt','5365001849302',null,null,50,90],
      ['issue','5975013847291','168019','V365-24-0801',1,31],
      ['issue','4730014482680','166490','V365-24-0820',2,32],
    ];
    for (const tx of txRows) {
      const acId = tx[2] ? acIds[tx[2]] : null;
      await client.query(
        `INSERT INTO transactions (type,nsn,aircraft_id,jcn,unit_id,performed_by,quantity,condition_out,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'RFI',NOW()-$8::interval)`,
        [tx[0],tx[1],acId,tx[3],primaryUnitId,devUserId,tx[4],`${tx[5]} days`]
      );
    }
    console.log(`   Transactions: ${txRows.length}`);

    await client.query('COMMIT');

    console.log('\n✅ Setup complete!\n');
    console.log('  → Restart the backend: node server/index.js');
    console.log('  → Open: http://localhost:5173\n');
    console.log('  Dashboard will show:');
    console.log('    🔴 1 NMCS Aircraft (166490 grounded, engine bearing)');
    console.log('    🟡 6 Open Requisitions (1x P01 backordered 22d)');
    console.log('    🟢 2 Low Stock (O-rings qty=1, relay qty=0)\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Seed failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

setup();
