-- 139: Phase C — promote trade_forecasts.lead_id from nullable to NOT NULL
-- + UNIQUE. Highest runtime in Phase C (~654K rows per R0.8 audit).
--
-- Same two-stage pre-check pattern as migration 138. statement_timeout
-- bumped to 5min because the CONCURRENTLY UNIQUE INDEX on 654K rows
-- can exceed the default 30s/60s timeout.

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

SET LOCAL statement_timeout = '5min';

-- Stage 1: NULL pre-check
DO $$
DECLARE null_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO null_count FROM trade_forecasts WHERE lead_id IS NULL;
    IF null_count > 0 THEN
        RAISE EXCEPTION 'Phase C migration 139 aborted: trade_forecasts has % rows with NULL lead_id. Run scripts/migrate-to-lead-id.js first.', null_count;
    END IF;
END $$;

-- Stage 2: duplicate pre-check
DO $$
DECLARE dup_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO dup_count FROM (
        SELECT lead_id FROM trade_forecasts
        WHERE lead_id IS NOT NULL
        GROUP BY lead_id HAVING COUNT(*) > 1
    ) d;
    IF dup_count > 0 THEN
        RAISE EXCEPTION 'Phase C migration 139 aborted: trade_forecasts has % duplicate lead_id values — investigate before retrying', dup_count;
    END IF;
END $$;

ALTER TABLE trade_forecasts ALTER COLUMN lead_id SET NOT NULL;

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uniq_trade_forecasts_lead_id ON trade_forecasts (lead_id);

DROP INDEX CONCURRENTLY IF EXISTS idx_trade_forecasts_lead_id;

-- ═══════════════════════════════════════════════════════════════════
-- DOWN — manual rollback only, intentionally not transactional
-- (Rule 6 / commit 8b1c10b)
-- ═══════════════════════════════════════════════════════════════════
-- Reverting restores nullable lead_id on trade_forecasts. Existing
-- backfilled values stay in place.
--
-- To roll back manually:
--
--   DROP INDEX CONCURRENTLY IF EXISTS uniq_trade_forecasts_lead_id;
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trade_forecasts_lead_id
--     ON trade_forecasts (lead_id) WHERE lead_id IS NOT NULL;
--   ALTER TABLE trade_forecasts ALTER COLUMN lead_id DROP NOT NULL;
