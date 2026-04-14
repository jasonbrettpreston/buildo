-- Migration 095: Scope pipeline_schedules disable to a single chain
--
-- H-W19: Today `classify_lifecycle_phase` appears in BOTH the permits chain
-- (step 21) and the coa chain (step 10). Disabling it via the admin UI sets
-- `pipeline_schedules.enabled = FALSE` keyed by pipeline slug only — so a
-- CoA maintenance disable silently kills the same step in the permits
-- chain. run-chain.js:87 reads this table without a chain filter.
--
-- Fix: add nullable `chain_id` column, replace PRIMARY KEY (pipeline) with
-- a unique index on (pipeline, COALESCE(chain_id, '__ALL__')). Existing
-- rows keep `chain_id = NULL` = "global" sentinel — preserves current
-- behaviour. New rows can scope to a single chain.
--
-- NULL = global sentinel convention mirrors phase_calibration.permit_type
-- in migration 087.
--
-- SPEC LINK: docs/specs/pipeline/40_pipeline_system.md §3.1

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE pipeline_schedules
  ADD COLUMN IF NOT EXISTS chain_id TEXT
    CHECK (chain_id IN ('permits', 'coa', 'sources', 'entities')
           OR chain_id IS NULL);

-- Replace the single-column PRIMARY KEY with a unique index that treats
-- NULL chain_id as the "__ALL__" sentinel. This allows multiple rows per
-- pipeline (one global + one per chain) while preserving uniqueness.
ALTER TABLE pipeline_schedules DROP CONSTRAINT IF EXISTS pipeline_schedules_pkey;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_schedules_scope
  ON pipeline_schedules (pipeline, COALESCE(chain_id, '__ALL__'));

-- Existing rows stay at chain_id = NULL (global). No backfill needed —
-- the ADD COLUMN NULL default preserves pre-migration semantics.

-- ═══════════════════════════════════════════════════════════════════
-- DOWN
-- ═══════════════════════════════════════════════════════════════════
-- Prerequisite: if per-chain rows were inserted (multiple rows per
-- pipeline), re-adding PRIMARY KEY (pipeline) will fail. Run this
-- pre-check and clean up before applying DOWN:
--   SELECT pipeline, COUNT(*) FROM pipeline_schedules GROUP BY 1 HAVING COUNT(*) > 1;
--   DELETE FROM pipeline_schedules WHERE chain_id IS NOT NULL;  -- if needed
--
-- DROP INDEX IF EXISTS idx_pipeline_schedules_scope;
-- ALTER TABLE pipeline_schedules
--   ADD CONSTRAINT pipeline_schedules_pkey PRIMARY KEY (pipeline);
-- ALTER TABLE pipeline_schedules DROP COLUMN IF EXISTS chain_id;
