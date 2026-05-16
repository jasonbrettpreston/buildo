-- migrations/151_trade_forecasts_pk_swap_to_lead_id.sql
-- SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.6.B Option C
-- SPEC LINK: docs/specs/01-pipeline/85_trade_forecast_engine.md §2 Database Schema
-- SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §6.11 Phase F.1
--
-- Promotes the existing UNIQUE INDEX uniq_trade_forecasts_lead_id_trade (from mig 139, Phase C)
-- to PRIMARY KEY (lead_id, trade_slug). Drops the legacy 3-column PK and the FK to permits
-- (CoA forecasts have no matching permits row; stale-purge handles deletion).
-- Metadata-only: USING INDEX avoids table rewrite; DROP NOT NULL is metadata-only.

-- ============================================================================
-- UP
-- ============================================================================
BEGIN;

-- 1. Drop FK (CoA forecasts have no permits row to reference)
ALTER TABLE trade_forecasts DROP CONSTRAINT IF EXISTS fk_forecasts_permit;

-- 2. Drop legacy 3-column PK FIRST — must precede DROP NOT NULL since PostgreSQL forbids
--    nullable columns inside a PRIMARY KEY. The supporting UNIQUE INDEX on (lead_id, trade_slug)
--    from mig 139 stays put and becomes the new PK in step 4.
ALTER TABLE trade_forecasts DROP CONSTRAINT IF EXISTS trade_forecasts_pkey;

-- 3. Relax NOT NULL on legacy permit-side anchors so CoA rows can write NULL
ALTER TABLE trade_forecasts ALTER COLUMN permit_num DROP NOT NULL;
ALTER TABLE trade_forecasts ALTER COLUMN revision_num DROP NOT NULL;

-- 4. Promote existing UNIQUE INDEX to PRIMARY KEY (USING INDEX = metadata-only, no rewrite)
ALTER TABLE trade_forecasts
  ADD CONSTRAINT trade_forecasts_pkey
  PRIMARY KEY USING INDEX uniq_trade_forecasts_lead_id_trade;

COMMIT;

-- ============================================================================
-- DOWN — comment-only per Rule 6 (matches mig 132/138/140/142/145/147/148/150 convention).
-- Operator runs manually only on rollback (see Spec 84 §3.4 E.5 rollback path).
-- v4 HIGH-E fold: reordered for idempotency safety — DELETE first (before any structural change),
-- then DROP, then idempotent index recreate (IF NOT EXISTS), then promote.
-- ============================================================================
-- BEGIN;
--   -- (1) Remove any CoA-side rows produced post-F.1 — required before re-adding NOT NULL.
--   --     DESTRUCTIVE: no way to preserve CoA forecasts under the old 3-col PK (no permits anchor).
--   DELETE FROM trade_forecasts WHERE permit_num IS NULL OR revision_num IS NULL;
--
--   -- (2) Drop the current (lead_id, trade_slug) PK constraint.
--   ALTER TABLE trade_forecasts DROP CONSTRAINT IF EXISTS trade_forecasts_pkey;
--
--   -- (3) Re-create the legacy 3-col unique index. Idempotent: survives partial DOWN re-runs.
--   CREATE UNIQUE INDEX IF NOT EXISTS trade_forecasts_legacy_3col_uniq
--     ON trade_forecasts (permit_num, revision_num, trade_slug);
--
--   -- (4) Promote that index back to PRIMARY KEY (matches the original schema shape).
--   ALTER TABLE trade_forecasts
--     ADD CONSTRAINT trade_forecasts_pkey
--     PRIMARY KEY USING INDEX trade_forecasts_legacy_3col_uniq;
--
--   -- (5) Re-promote permit_num + revision_num to NOT NULL + re-add the FK.
--   ALTER TABLE trade_forecasts ALTER COLUMN permit_num SET NOT NULL;
--   ALTER TABLE trade_forecasts ALTER COLUMN revision_num SET NOT NULL;
--   ALTER TABLE trade_forecasts ADD CONSTRAINT fk_forecasts_permit
--     FOREIGN KEY (permit_num, revision_num) REFERENCES permits(permit_num, revision_num) ON DELETE CASCADE;
-- COMMIT;
