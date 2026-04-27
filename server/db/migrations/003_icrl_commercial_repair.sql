-- Migration 003: Update ICRL + add commercial repair list

-- Add part_number and work_center to existing icrl table
ALTER TABLE icrl
  ADD COLUMN IF NOT EXISTS part_number TEXT,
  ADD COLUMN IF NOT EXISTS work_center TEXT;

-- Make nsn nullable (ICRL entries may have P/N only)
ALTER TABLE icrl ALTER COLUMN nsn DROP NOT NULL;

-- Commercial repair list — parts that go to a specific commercial vendor
-- regardless of ICRL X1 designation
CREATE TABLE IF NOT EXISTS commercial_repair_list (
  crl_id        SERIAL PRIMARY KEY,
  part_number   TEXT NOT NULL,
  nsn           TEXT,
  description   TEXT,
  vendor_name   TEXT NOT NULL,
  unit_id       INT  NOT NULL REFERENCES units(unit_id) ON DELETE CASCADE,
  uploaded_by   INT  REFERENCES users(user_id) ON DELETE SET NULL,
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crl_unit_pn ON commercial_repair_list(unit_id, part_number);
CREATE INDEX IF NOT EXISTS idx_icrl_pn     ON icrl(part_number);
