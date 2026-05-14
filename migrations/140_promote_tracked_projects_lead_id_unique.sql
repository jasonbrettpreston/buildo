-- 140: Phase C — add PARTIAL UNIQUE on tracked_projects.lead_id.
--
-- WF3 2026-05-14 amendment: prior rationale text cited a `lead_type`
-- column on tracked_projects to justify the partial design. That column
-- was a spec-text artifact never added by any migration; the only
-- `lead_type` column in the schema lives on `lead_views` (migration 070,
-- values 'permit'|'builder'). The R5.3 trigger-based dual-write pivot
-- (commit 872ec73) retired the discriminator-column design entirely —
-- `lead_id` prefix encoding (`permit:` vs `coa:`) is the canonical
-- permit-vs-CoA distinction.
--
-- The partial-UNIQUE design (WHERE lead_id IS NOT NULL) remains correct
-- and is required because Phase D may insert CoA-side rows whose
-- `lead_id` remains NULL until the CoA classifiers complete. Partial
-- UNIQUE accommodates that pre-classification NULL window. NOT NULL
-- promotion is therefore deferred to Phase F, after CoA classification
-- has populated all CoA-side `lead_id` values.
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
