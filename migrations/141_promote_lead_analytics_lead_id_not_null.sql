-- 141: Phase C — promote lead_analytics.lead_id from nullable to NOT
-- NULL + UNIQUE.
--
-- R0.8 audit (2026-05-13): lead_analytics is currently empty (0 rows).
-- Both pre-checks are trivially satisfied. NOT NULL is safe because
-- there are no rows to violate it. Future inserts (from Phase D classifiers)
-- will derive lead_id at INSERT time per the canonical Phase B trigger
-- format.
--
-- Same two-stage pre-check pattern as migration 138/139.

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

SET LOCAL statement_timeout = '5min';

-- Stage 1: NULL pre-check
DO $$
DECLARE null_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO null_count FROM lead_analytics WHERE lead_id IS NULL;
    IF null_count > 0 THEN
        RAISE EXCEPTION 'Phase C migration 141 aborted: lead_analytics has % rows with NULL lead_id. Run scripts/migrate-to-lead-id.js first.', null_count;
    END IF;
END $$;

-- Stage 2: duplicate pre-check
DO $$
DECLARE dup_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO dup_count FROM (
        SELECT lead_id FROM lead_analytics
        WHERE lead_id IS NOT NULL
        GROUP BY lead_id HAVING COUNT(*) > 1
    ) d;
    IF dup_count > 0 THEN
        RAISE EXCEPTION 'Phase C migration 141 aborted: lead_analytics has % duplicate lead_id values', dup_count;
    END IF;
END $$;

ALTER TABLE lead_analytics ALTER COLUMN lead_id SET NOT NULL;

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uniq_lead_analytics_lead_id ON lead_analytics (lead_id);

DROP INDEX CONCURRENTLY IF EXISTS idx_lead_analytics_lead_id;

-- ═══════════════════════════════════════════════════════════════════
-- DOWN — manual rollback only, intentionally not transactional
-- (Rule 6 / commit 8b1c10b)
-- ═══════════════════════════════════════════════════════════════════
-- To roll back manually:
--
--   DROP INDEX CONCURRENTLY IF EXISTS uniq_lead_analytics_lead_id;
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lead_analytics_lead_id
--     ON lead_analytics (lead_id) WHERE lead_id IS NOT NULL;
--   ALTER TABLE lead_analytics ALTER COLUMN lead_id DROP NOT NULL;
