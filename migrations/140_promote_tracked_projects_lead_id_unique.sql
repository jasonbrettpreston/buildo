-- 140: Phase C — add PARTIAL UNIQUE on tracked_projects.lead_id.
--
-- Per R2 Gemini finding + Phase C C.3 dual-key consideration:
--   tracked_projects has a `lead_type` column that distinguishes permit
--   from CoA rows. Phase C backfills only permit-side lead_id. CoA-side
--   rows remain NULL until Phase D/F populates them. NOT NULL promotion
--   would fail on those NULL rows, so it is DEFERRED to Phase F.
--
--   The UNIQUE constraint MUST be partial (WHERE lead_id IS NOT NULL)
--   so Phase D inserts (CoA rows with NULL lead_id pre-classification)
--   don't violate it.
--
-- R0.8 audit (2026-05-13): tracked_projects is currently empty (0 rows).
-- Both the NULL pre-check and the duplicate pre-check are trivially
-- satisfied. The partial UNIQUE is forward-safe for Phase D inserts.

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

SET LOCAL statement_timeout = '5min';

-- Stage 2 only: duplicate pre-check on non-NULL rows (NULL pre-check
-- skipped — partial UNIQUE allows NULL, and CoA-side rows arrive NULL).
DO $$
DECLARE dup_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO dup_count FROM (
        SELECT lead_id FROM tracked_projects
        WHERE lead_id IS NOT NULL
        GROUP BY lead_id HAVING COUNT(*) > 1
    ) d;
    IF dup_count > 0 THEN
        RAISE EXCEPTION 'Phase C migration 140 aborted: tracked_projects has % duplicate non-NULL lead_id values', dup_count;
    END IF;
END $$;

-- Partial UNIQUE — only non-NULL lead_ids are enforced unique. CoA
-- rows added in Phase D with NULL lead_id (pre-classification) are
-- permitted; the constraint kicks in once they're classified.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uniq_tracked_projects_lead_id ON tracked_projects (lead_id) WHERE lead_id IS NOT NULL;

DROP INDEX CONCURRENTLY IF EXISTS idx_tracked_projects_lead_id;

-- ═══════════════════════════════════════════════════════════════════
-- DOWN — manual rollback only, intentionally not transactional
-- (Rule 6 / commit 8b1c10b)
-- ═══════════════════════════════════════════════════════════════════
-- Reverting drops the partial UNIQUE; tracked_projects.lead_id retains
-- its nullable Phase B state.
--
-- To roll back manually:
--
--   DROP INDEX CONCURRENTLY IF EXISTS uniq_tracked_projects_lead_id;
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tracked_projects_lead_id
--     ON tracked_projects (lead_id) WHERE lead_id IS NOT NULL;
