-- 030: Deactivate Tier 2 and Tier 3 rules (WF3)
-- Tag-trade matrix now handles broad-scope classification.
-- Tier 1 rules remain active for narrow-scope permit codes.

-- UP

-- Self-heal: migration 005 only created `created_at` on trade_mapping_rules.
-- Migration 054 later widens it to TIMESTAMPTZ but does NOT add updated_at.
-- This migration's UPDATE references `updated_at = NOW()` which crashes any
-- local DB that hasn't been hand-fixed. Adding the column idempotently here
-- unblocks every fresh-clone migrate run. No-op on production DBs that have
-- already healed via prior manual ALTERs. Tracked across 3+ Phase 1/2 reviews
-- as the "migration 030 broken" blocker that forced mocked-only test coverage.

ALTER TABLE trade_mapping_rules
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE trade_mapping_rules
SET is_active = false, updated_at = NOW()
WHERE tier IN (2, 3)
  AND is_active = true;

-- DOWN
-- Removing updated_at would lose audit history; manual operator decision only.
-- ALTER TABLE trade_mapping_rules DROP COLUMN IF EXISTS updated_at;
-- UPDATE trade_mapping_rules SET is_active = true WHERE tier IN (2, 3);
