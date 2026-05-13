-- 138: Phase C — promote cost_estimates.lead_id from nullable to NOT NULL
-- + UNIQUE, after the one-shot scripts/migrate-to-lead-id.js backfill.
--
-- Two-stage pre-check (R2 DeepSeek finding):
--   Stage 1: confirm zero NULL lead_id rows
--   Stage 2: confirm zero duplicate lead_id values
-- Both raise EXCEPTION on violation — failure is loud, not silent.
--
-- Phase B added the column nullable with a partial index
-- (idx_cost_estimates_lead_id WHERE lead_id IS NOT NULL). This migration:
--   1. Validates backfill completeness
--   2. Promotes NOT NULL
--   3. Creates a non-partial UNIQUE INDEX
--   4. Drops the now-redundant partial index
--
-- statement_timeout = '5min' guards the CONCURRENTLY UNIQUE INDEX build
-- on ~247K rows (R2 DeepSeek DEFER).

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

SET LOCAL statement_timeout = '5min';

-- Stage 1: NULL pre-check (backfill completeness)
DO $$
DECLARE null_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO null_count FROM cost_estimates WHERE lead_id IS NULL;
    IF null_count > 0 THEN
        RAISE EXCEPTION 'Phase C migration 138 aborted: cost_estimates has % rows with NULL lead_id. Run scripts/migrate-to-lead-id.js first.', null_count;
    END IF;
END $$;

-- Stage 2: duplicate pre-check (UNIQUE INDEX safety)
DO $$
DECLARE dup_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO dup_count FROM (
        SELECT lead_id FROM cost_estimates
        WHERE lead_id IS NOT NULL
        GROUP BY lead_id HAVING COUNT(*) > 1
    ) d;
    IF dup_count > 0 THEN
        RAISE EXCEPTION 'Phase C migration 138 aborted: cost_estimates has % duplicate lead_id values — investigate before retrying', dup_count;
    END IF;
END $$;

ALTER TABLE cost_estimates ALTER COLUMN lead_id SET NOT NULL;

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uniq_cost_estimates_lead_id ON cost_estimates (lead_id);

-- Drop the Phase B partial index — now redundant given the non-partial UNIQUE above.
DROP INDEX CONCURRENTLY IF EXISTS idx_cost_estimates_lead_id;

-- ═══════════════════════════════════════════════════════════════════
-- DOWN — manual rollback only, intentionally not transactional
-- (Rule 6 / commit 8b1c10b)
-- ═══════════════════════════════════════════════════════════════════
-- Reverting this migration restores cost_estimates.lead_id to nullable.
-- The Phase C migrate-to-lead-id.js backfill is preserved (no DELETE).
-- Downstream Phase C consumers (compute-cost-estimates, lead-detail-query)
-- can still operate against the populated column.
--
-- To roll back manually:
--
--   DROP INDEX CONCURRENTLY IF EXISTS uniq_cost_estimates_lead_id;
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cost_estimates_lead_id
--     ON cost_estimates (lead_id) WHERE lead_id IS NOT NULL;
--   ALTER TABLE cost_estimates ALTER COLUMN lead_id DROP NOT NULL;
