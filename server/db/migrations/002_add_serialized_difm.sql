-- Migration 002: Serialized repairable tracking + DIFM queue

CREATE TABLE IF NOT EXISTS serialized_items (
  item_id       SERIAL PRIMARY KEY,
  nsn           TEXT NOT NULL,
  serial_number TEXT NOT NULL,
  unit_id       INT  NOT NULL REFERENCES units(unit_id) ON DELETE CASCADE,
  condition     TEXT NOT NULL DEFAULT 'RFI'
                  CHECK (condition IN ('RFI','NRFI','in_repair','condemned')),
  location      TEXT NOT NULL DEFAULT 'storage'
                  CHECK (location IN ('storage','installed','i_level','depot','vendor','drmo')),
  aircraft_id   INT  REFERENCES aircraft(aircraft_id) ON DELETE SET NULL,
  jcn           TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(nsn, serial_number, unit_id)
);

CREATE TABLE IF NOT EXISTS difm_queue (
  difm_id         SERIAL PRIMARY KEY,
  item_id         INT  REFERENCES serialized_items(item_id) ON DELETE SET NULL,
  nsn             TEXT NOT NULL,
  serial_number   TEXT,
  unit_id         INT  NOT NULL REFERENCES units(unit_id) ON DELETE CASCADE,
  quantity        INT  NOT NULL DEFAULT 1 CHECK (quantity > 0),
  condition_out   TEXT NOT NULL DEFAULT 'NRFI',
  shop            TEXT NOT NULL CHECK (shop IN ('i_level','depot','commercial')),
  shop_name       TEXT,
  document_number TEXT,
  jcn             TEXT,
  turned_in_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expected_return TIMESTAMPTZ,
  returned_at     TIMESTAMPTZ,
  condition_in    TEXT,
  status          TEXT NOT NULL DEFAULT 'in_repair'
                    CHECK (status IN ('in_repair','returned','condemned','lost')),
  turned_in_by    INT  REFERENCES users(user_id) ON DELETE SET NULL,
  received_by     INT  REFERENCES users(user_id) ON DELETE SET NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_serialized_items_unit  ON serialized_items(unit_id);
CREATE INDEX IF NOT EXISTS idx_serialized_items_nsn   ON serialized_items(nsn);
CREATE INDEX IF NOT EXISTS idx_difm_queue_unit_status ON difm_queue(unit_id, status);
