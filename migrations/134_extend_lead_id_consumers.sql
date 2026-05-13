-- 134: Add nullable lead_id to the 4 Phase C consumer tables.
--
-- cost_estimates, trade_forecasts, tracked_projects: Phase C's
-- migrate-to-lead-id.js backfills lead_id from permit_num + revision_num.
-- After backfill, columns can be promoted to NOT NULL + UNIQUE (deferred
-- to a Phase C follow-up migration, not part of Phase B).
--
-- lead_analytics: keeps lead_key as alias through Phase G per Spec 42
-- §6.6.C R2.v3 decision. NOT a column rename — Phase C backfills lead_id
-- from existing lead_key (which already encodes the same canonical
-- format, with some space-vs-colon normalization noted in followups).
--
-- CONCURRENTLY indexes force migrate.js into non-transactional mode.
-- Each CHECK constraint is wrapped in DO/EXCEPTION so re-runs are safe
-- per the R2.v3 IF-NOT-EXISTS regression-lock.

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

-- cost_estimates
ALTER TABLE cost_estimates ADD COLUMN IF NOT EXISTS lead_id TEXT;
DO $$
BEGIN
    ALTER TABLE cost_estimates
      ADD CONSTRAINT chk_cost_estimates_lead_id_format
        CHECK (lead_id IS NULL OR lead_id ~ '^(permit|coa):.+$');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- trade_forecasts
ALTER TABLE trade_forecasts ADD COLUMN IF NOT EXISTS lead_id TEXT;
DO $$
BEGIN
    ALTER TABLE trade_forecasts
      ADD CONSTRAINT chk_trade_forecasts_lead_id_format
        CHECK (lead_id IS NULL OR lead_id ~ '^(permit|coa):.+$');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- tracked_projects
ALTER TABLE tracked_projects ADD COLUMN IF NOT EXISTS lead_id TEXT;
DO $$
BEGIN
    ALTER TABLE tracked_projects
      ADD CONSTRAINT chk_tracked_projects_lead_id_format
        CHECK (lead_id IS NULL OR lead_id ~ '^(permit|coa):.+$');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- lead_analytics (lead_key retained as alias through Phase G)
ALTER TABLE lead_analytics ADD COLUMN IF NOT EXISTS lead_id TEXT;
DO $$
BEGIN
    ALTER TABLE lead_analytics
      ADD CONSTRAINT chk_lead_analytics_lead_id_format
        CHECK (lead_id IS NULL OR lead_id ~ '^(permit|coa):.+$');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Partial CONCURRENTLY indexes: only the post-Phase-C populated rows are
-- worth indexing. Pre-Phase-C the column is 100% NULL — a full index
-- would be empty after the partial filter excludes NULLs.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cost_estimates_lead_id ON cost_estimates (lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trade_forecasts_lead_id ON trade_forecasts (lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tracked_projects_lead_id ON tracked_projects (lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lead_analytics_lead_id ON lead_analytics (lead_id) WHERE lead_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
-- DOWN — manual rollback only, intentionally not transactional
-- (Rule 6 / commit 8b1c10b)
-- ═══════════════════════════════════════════════════════════════════
-- Reverting this migration drops the lead_id columns on the 4 consumer
-- tables. Phase C migrate-to-lead-id.js cannot run; Phase D classifiers
-- have nowhere to write keyed output.
--
-- To roll back manually:
--
--   DROP INDEX IF EXISTS idx_lead_analytics_lead_id;
--   DROP INDEX IF EXISTS idx_tracked_projects_lead_id;
--   DROP INDEX IF EXISTS idx_trade_forecasts_lead_id;
--   DROP INDEX IF EXISTS idx_cost_estimates_lead_id;
--   ALTER TABLE lead_analytics DROP CONSTRAINT IF EXISTS chk_lead_analytics_lead_id_format, DROP COLUMN IF EXISTS lead_id;
--   ALTER TABLE tracked_projects DROP CONSTRAINT IF EXISTS chk_tracked_projects_lead_id_format, DROP COLUMN IF EXISTS lead_id;
--   ALTER TABLE trade_forecasts DROP CONSTRAINT IF EXISTS chk_trade_forecasts_lead_id_format, DROP COLUMN IF EXISTS lead_id;
--   ALTER TABLE cost_estimates DROP CONSTRAINT IF EXISTS chk_cost_estimates_lead_id_format, DROP COLUMN IF EXISTS lead_id;
