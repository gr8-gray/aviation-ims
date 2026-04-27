-- 001_create_tables.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Units (squadrons, commands, dets)
CREATE TABLE units (
  unit_id    SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  uic        VARCHAR(10),
  location   TEXT,
  parent_unit_id INTEGER REFERENCES units(unit_id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users (CAC-authenticated)
CREATE TABLE users (
  user_id    SERIAL PRIMARY KEY,
  edipi      VARCHAR(10) UNIQUE NOT NULL,
  name       TEXT NOT NULL,
  rank       TEXT,
  role       TEXT NOT NULL CHECK (role IN ('clerk','sncoic','officer','admin')),
  unit_id    INTEGER REFERENCES units(unit_id),
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Parts master (keyed on NSN)
CREATE TABLE parts_master (
  nsn          VARCHAR(16) PRIMARY KEY,
  niin         VARCHAR(9) UNIQUE NOT NULL,
  fsc          VARCHAR(4) NOT NULL,
  description  TEXT,
  unit_of_issue VARCHAR(2),
  unit_price   NUMERIC(12,2),
  flis_verified BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Part numbers cross-reference (many P/Ns → one NSN)
CREATE TABLE part_numbers (
  pn_id       SERIAL PRIMARY KEY,
  part_number VARCHAR(32) NOT NULL,
  nsn         VARCHAR(16) NOT NULL REFERENCES parts_master(nsn) ON DELETE CASCADE,
  cage_code   VARCHAR(5),
  manufacturer TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_part_numbers_pn ON part_numbers(part_number);
CREATE INDEX idx_part_numbers_nsn ON part_numbers(nsn);

-- Aircraft
CREATE TABLE aircraft (
  aircraft_id   SERIAL PRIMARY KEY,
  buno          VARCHAR(6) UNIQUE NOT NULL,
  mds           TEXT,
  serial_number TEXT,
  unit_id       INTEGER REFERENCES units(unit_id),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','grounded','deployed')),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ICRL (Individual Component Repair List)
CREATE TABLE icrl (
  icrl_id        SERIAL PRIMARY KEY,
  nsn            VARCHAR(16) NOT NULL REFERENCES parts_master(nsn),
  capability_code VARCHAR(2) NOT NULL,
  repair_source  TEXT NOT NULL CHECK (repair_source IN ('i_level','commercial')),
  uploaded_by    INTEGER REFERENCES users(user_id),
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Inventory (stock levels per unit)
CREATE TABLE inventory (
  inventory_id  SERIAL PRIMARY KEY,
  nsn           VARCHAR(16) NOT NULL REFERENCES parts_master(nsn),
  unit_id       INTEGER NOT NULL REFERENCES units(unit_id),
  qty_on_hand   INTEGER NOT NULL DEFAULT 0,
  qty_due_in    INTEGER NOT NULL DEFAULT 0,
  qty_on_order  INTEGER NOT NULL DEFAULT 0,
  reorder_point INTEGER NOT NULL DEFAULT 1,
  condition     TEXT NOT NULL DEFAULT 'RFI' CHECK (condition IN ('RFI','NRFI')),
  bin_location  TEXT,
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(nsn, unit_id, condition)
);

-- Requisitions
CREATE TABLE requisitions (
  req_id          SERIAL PRIMARY KEY,
  document_number VARCHAR(20) UNIQUE NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('A0A','AP1','AC1')),
  nsn             VARCHAR(16) NOT NULL REFERENCES parts_master(nsn),
  aircraft_id     INTEGER REFERENCES aircraft(aircraft_id),
  jcn             VARCHAR(15),
  mcn             VARCHAR(15),
  unit_id         INTEGER NOT NULL REFERENCES units(unit_id),
  created_by      INTEGER NOT NULL REFERENCES users(user_id),
  priority        VARCHAR(2) NOT NULL DEFAULT '03',
  fund_code       VARCHAR(2),
  status          TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','due_in','backordered','shipped','received','cancelled')),
  quantity        INTEGER NOT NULL DEFAULT 1,
  ots_last_sync   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Transactions (source of all analytics)
CREATE TABLE transactions (
  transaction_id SERIAL PRIMARY KEY,
  type           TEXT NOT NULL CHECK (type IN ('issue','receipt','turn_in','transfer','repairable_exchange','adjustment')),
  nsn            VARCHAR(16) NOT NULL REFERENCES parts_master(nsn),
  aircraft_id    INTEGER REFERENCES aircraft(aircraft_id),
  jcn            VARCHAR(15),
  mcn            VARCHAR(15),
  unit_id        INTEGER NOT NULL REFERENCES units(unit_id),
  performed_by   INTEGER NOT NULL REFERENCES users(user_id),
  quantity       INTEGER NOT NULL,
  condition_in   TEXT CHECK (condition_in IN ('RFI','NRFI')),
  condition_out  TEXT CHECK (condition_out IN ('RFI','NRFI')),
  document_number TEXT,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- NMCS events
CREATE TABLE nmcs_events (
  event_id    SERIAL PRIMARY KEY,
  aircraft_id INTEGER NOT NULL REFERENCES aircraft(aircraft_id),
  nsn         VARCHAR(16) NOT NULL REFERENCES parts_master(nsn),
  req_id      INTEGER REFERENCES requisitions(req_id),
  jcn         VARCHAR(15),
  type        TEXT NOT NULL DEFAULT 'NMCS' CHECK (type IN ('NMCS','PMCS')),
  opened_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at   TIMESTAMPTZ,
  opened_by   INTEGER NOT NULL REFERENCES users(user_id)
);

-- Updated_at trigger for parts_master and requisitions
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER parts_master_updated_at
  BEFORE UPDATE ON parts_master
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER requisitions_updated_at
  BEFORE UPDATE ON requisitions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER inventory_updated_at
  BEFORE UPDATE ON inventory
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
