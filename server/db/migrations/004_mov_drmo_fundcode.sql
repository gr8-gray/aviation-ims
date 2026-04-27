-- Migration 004: MOV tracking, DRMO disposition, fund code constraint

ALTER TABLE requisitions
  ADD COLUMN IF NOT EXISTS mov_validated_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mov_validated_by  INT REFERENCES users(user_id) ON DELETE SET NULL;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS disposition TEXT;

-- Soft constraint: fund codes are 2-char uppercase
ALTER TABLE requisitions
  DROP CONSTRAINT IF EXISTS chk_fund_code_format;
ALTER TABLE requisitions
  ADD CONSTRAINT chk_fund_code_format
    CHECK (fund_code IS NULL OR fund_code ~ '^[A-Z0-9]{2}$');

CREATE INDEX IF NOT EXISTS idx_reqs_mov ON requisitions(unit_id, status, priority, created_at)
  WHERE status NOT IN ('received','cancelled');
