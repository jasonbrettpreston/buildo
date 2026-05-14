-- Migration 145 — Phase D classifier substrate
-- SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase D R5.1
--
-- 6 components (R2.v5 final, after second 3-reviewer triage pass):
--   1. Add parcel_linked_at + trade_classified_at to coa_applications
--   2. 4 partial indexes on classifier-state columns
--   3. cost_estimates PK swap: atomic combined ALTER (was composite PK on
--      permit_num+revision_num from mig 071 → new PK on lead_id from mig 138)
--      + DROP NOT NULL on legacy permit_num/revision_num cols. Composite FK
--      to permits is KEPT for Phase G PRE-permit DELETE CASCADE compatibility.
--   4. cost_source CHECK extension: includes 'none' (added by mig 096) AND
--      adds 'geometric' for CoA-side cost paths.
--   5. lead_id_orphan_audit view update: COALESCE for nullable cost_estimates
--      rows (CoA rows have NULL permit_num/revision_num after this migration).
--   6. FK COMMENT documenting Phase G interlock.
--
-- Production safety (R2.v5 fix C — Gemini + DeepSeek CRITICAL):
--   * SET LOCAL lock_timeout = '500ms' caps ACCESS EXCLUSIVE wait
--   * SET LOCAL statement_timeout = '5min' caps total runtime
--   * Pre-check cost_estimates row count < 1M before PK swap
--   * Retry on lock_timeout error is the deploy harness's responsibility
--
-- All ALTERs are metadata-only — no data rewrite, no backfill.

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

SET LOCAL lock_timeout = '500ms';
SET LOCAL statement_timeout = '5min';

-- Pre-check (Component 3 safety): cost_estimates row count threshold.
DO $$
DECLARE row_count BIGINT;
BEGIN
    SELECT COUNT(*) INTO row_count FROM cost_estimates;
    IF row_count > 1000000 THEN
        RAISE EXCEPTION 'Phase D migration 145 aborted: cost_estimates has % rows (>1M threshold). Split-migration strategy required for safety.', row_count;
    END IF;
END $$;

-- Pre-check (Component 4 safety): no rogue cost_source values before CHECK swap.
DO $$
DECLARE rogue_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO rogue_count FROM cost_estimates
    WHERE cost_source NOT IN ('permit', 'model', 'none');
    IF rogue_count > 0 THEN
        RAISE EXCEPTION 'Phase D migration 145 aborted: cost_estimates has % rows with cost_source outside (permit, model, none). Investigate before extending the CHECK.', rogue_count;
    END IF;
END $$;

-- Pre-check (Component 3 safety per R5.1.g Gemini CRITICAL): verify Phase C
-- migration 138 prerequisites are in place before the PK swap. If lead_id is
-- nullable OR uniq_cost_estimates_lead_id is absent, the ADD CONSTRAINT
-- PRIMARY KEY would trigger a full-table-scan index build under ACCESS
-- EXCLUSIVE — a multi-minute outage. Fail fast instead.
DO $$
DECLARE
    lead_id_is_nullable BOOLEAN;
    uniq_index_exists   BOOLEAN;
BEGIN
    SELECT is_nullable = 'YES' INTO lead_id_is_nullable
      FROM information_schema.columns
     WHERE table_name = 'cost_estimates' AND column_name = 'lead_id';
    SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uniq_cost_estimates_lead_id')
      INTO uniq_index_exists;
    IF lead_id_is_nullable THEN
        RAISE EXCEPTION 'Phase D migration 145 aborted: cost_estimates.lead_id is nullable. Phase C migration 138 must run first.';
    END IF;
    IF NOT uniq_index_exists THEN
        RAISE EXCEPTION 'Phase D migration 145 aborted: uniq_cost_estimates_lead_id index is missing. ADD CONSTRAINT PRIMARY KEY would trigger a full table scan under ACCESS EXCLUSIVE. Run migration 138 first.';
    END IF;
END $$;

-- Pre-check (Component 3 safety per R5.1.g Gemini MEDIUM): no other tables
-- depend on the old (permit_num, revision_num) PK as an FK target. DROP
-- CONSTRAINT would fail if any do.
DO $$
DECLARE dependent_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO dependent_count
      FROM pg_constraint c
      JOIN pg_class      cl ON cl.oid = c.confrelid
     WHERE c.contype = 'f'
       AND cl.relname = 'cost_estimates'
       AND c.confkey @> ARRAY[
           (SELECT attnum FROM pg_attribute WHERE attrelid = 'cost_estimates'::regclass AND attname = 'permit_num'),
           (SELECT attnum FROM pg_attribute WHERE attrelid = 'cost_estimates'::regclass AND attname = 'revision_num')
       ]::smallint[];
    IF dependent_count > 0 THEN
        RAISE EXCEPTION 'Phase D migration 145 aborted: % other table(s) have an FK referencing cost_estimates(permit_num, revision_num). DROP CONSTRAINT cost_estimates_pkey would fail. Investigate before proceeding.', dependent_count;
    END IF;
END $$;

-- ── Component 1: coa_applications timestamp columns ──────────────────
ALTER TABLE coa_applications
    ADD COLUMN IF NOT EXISTS parcel_linked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS trade_classified_at TIMESTAMPTZ;

-- ── Component 3: cost_estimates PK swap ──────────────────────────────
-- R2.v5 fix B (Worktree CRITICAL 85%): combine DROP CONSTRAINT + ADD
-- CONSTRAINT into ONE statement so cost_estimates never has a no-PK window.
ALTER TABLE cost_estimates
    DROP CONSTRAINT cost_estimates_pkey,
    ADD CONSTRAINT cost_estimates_pkey PRIMARY KEY (lead_id);

-- Now safe to drop NOT NULL on the legacy composite-key columns
-- (no longer part of the PK).
ALTER TABLE cost_estimates ALTER COLUMN permit_num DROP NOT NULL;
ALTER TABLE cost_estimates ALTER COLUMN revision_num DROP NOT NULL;

-- ── Component 4: cost_source CHECK extension ─────────────────────────
-- R2.v5 fix A (Worktree CRITICAL 100%): migration 096 already replaced the
-- mig-071 CHECK with cost_estimates_cost_source_check allowing
-- ('permit', 'model', 'none'). We MUST preserve 'none' (production
-- compute-cost-estimates.js writes it for zero-trade permits) and add
-- 'geometric' for CoA-side cost paths.
ALTER TABLE cost_estimates DROP CONSTRAINT IF EXISTS cost_estimates_cost_source_check;
ALTER TABLE cost_estimates
    ADD CONSTRAINT cost_estimates_cost_source_check
    CHECK (cost_source IN ('permit', 'model', 'none', 'geometric'));

-- ── Component 5: lead_id_orphan_audit view update ────────────────────
-- R2.v5 fix D (Worktree HIGH 88%): the cost_estimates branch in migration
-- 142 concatenates `ce.permit_num || ':' || ce.revision_num` which produces
-- NULL for CoA rows after this migration drops NOT NULL on those columns.
-- COALESCE(ce.lead_id, …) ensures source_row_id is always populated.
CREATE OR REPLACE VIEW lead_id_orphan_audit AS
SELECT 'lead_trades' AS source_table, lt.lead_id, lt.id::TEXT AS source_row_id
FROM lead_trades lt
LEFT JOIN permits p ON lt.lead_id = p.lead_id
LEFT JOIN coa_applications c ON lt.lead_id = c.lead_id
WHERE p.lead_id IS NULL AND c.lead_id IS NULL

UNION ALL

SELECT 'lead_parcels', lp.lead_id, lp.lead_id || '|' || lp.parcel_id::TEXT
FROM lead_parcels lp
LEFT JOIN permits p ON lp.lead_id = p.lead_id
LEFT JOIN coa_applications c ON lp.lead_id = c.lead_id
WHERE p.lead_id IS NULL AND c.lead_id IS NULL

UNION ALL

SELECT 'lifecycle_transitions', lt.lead_id, lt.id::TEXT
FROM lifecycle_transitions lt
LEFT JOIN permits p ON lt.lead_id = p.lead_id
LEFT JOIN coa_applications c ON lt.lead_id = c.lead_id
WHERE p.lead_id IS NULL AND c.lead_id IS NULL

UNION ALL

SELECT 'lifecycle_status_history', lsh.lead_id, lsh.id::TEXT
FROM lifecycle_status_history lsh
LEFT JOIN permits p ON lsh.lead_id = p.lead_id
LEFT JOIN coa_applications c ON lsh.lead_id = c.lead_id
WHERE p.lead_id IS NULL AND c.lead_id IS NULL

UNION ALL

-- Phase C consumer tables (added in mig 142). Phase D fix: COALESCE so CoA
-- rows (NULL permit_num/revision_num) produce a non-NULL source_row_id.
SELECT 'cost_estimates', ce.lead_id,
       COALESCE(ce.lead_id, ce.permit_num || ':' || ce.revision_num) AS source_row_id
FROM cost_estimates ce
LEFT JOIN permits p ON ce.lead_id = p.lead_id
LEFT JOIN coa_applications c ON ce.lead_id = c.lead_id
WHERE p.lead_id IS NULL AND c.lead_id IS NULL

UNION ALL

-- trade_forecasts: permit_num/revision_num are still NOT NULL in Phase D
-- scope. Phase F will add CoA-side rows (and at that point may drop NOT
-- NULL on those columns). For now, the raw concatenation is safe because
-- no NULL pair exists. R5.1.g Worktree HIGH-1 fix: removed defensive
-- COALESCE that implied state Phase D does not produce.
SELECT 'trade_forecasts', tf.lead_id,
       tf.permit_num || ':' || tf.revision_num || ':' || tf.trade_slug
FROM trade_forecasts tf
LEFT JOIN permits p ON tf.lead_id = p.lead_id
LEFT JOIN coa_applications c ON tf.lead_id = c.lead_id
WHERE p.lead_id IS NULL AND c.lead_id IS NULL

UNION ALL

SELECT 'tracked_projects', tp.lead_id, tp.id::TEXT
FROM tracked_projects tp
LEFT JOIN permits p ON tp.lead_id = p.lead_id
LEFT JOIN coa_applications c ON tp.lead_id = c.lead_id
WHERE p.lead_id IS NULL AND c.lead_id IS NULL

UNION ALL

SELECT 'lead_analytics', la.lead_id, la.lead_key
FROM lead_analytics la
LEFT JOIN permits p ON la.lead_id = p.lead_id
LEFT JOIN coa_applications c ON la.lead_id = c.lead_id
WHERE p.lead_id IS NULL AND c.lead_id IS NULL;

-- ── Component 6: FK COMMENT (R2.v5 fix J — Gemini MED) ───────────────
-- The composite FK to permits is KEPT after the PK swap to support Phase G
-- PRE-permit DELETE CASCADE. Document the rationale inline so future
-- developers don't drop it.
--
-- R5.1.g Worktree MED-1 + Gemini HIGH fix: SELECT INTO silently picks one
-- row when multiple FKs match. Use COUNT(*) + LIMIT 1 to detect ambiguity
-- and fail loudly rather than commenting the wrong constraint.
DO $$
DECLARE
    fk_name  TEXT;
    fk_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO fk_count
      FROM pg_constraint
     WHERE conrelid = 'cost_estimates'::regclass
       AND contype = 'f'
       AND confrelid = 'permits'::regclass;
    IF fk_count = 0 THEN
        RAISE WARNING 'cost_estimates → permits FK not found; skipping COMMENT';
    ELSIF fk_count > 1 THEN
        RAISE EXCEPTION 'Phase D migration 145 aborted: cost_estimates has % FKs to permits — ambiguous which to COMMENT. Investigate and re-run.', fk_count;
    ELSE
        SELECT conname INTO fk_name
          FROM pg_constraint
         WHERE conrelid = 'cost_estimates'::regclass
           AND contype = 'f'
           AND confrelid = 'permits'::regclass
         LIMIT 1;
        EXECUTE format('COMMENT ON CONSTRAINT %I ON cost_estimates IS %L',
            fk_name,
            'KEPT after Phase D PK swap (mig 145) to support Phase G PRE-permit DELETE CASCADE. NULL composite FK (MATCH SIMPLE) vacuously satisfied for CoA rows (NULL permit_num/revision_num). DO NOT DROP until Phase H legacy column removal.');
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- After the transactional block: CONCURRENT operations
-- (Component 2 partial indexes + the redundant unique-index drop)
-- ═══════════════════════════════════════════════════════════════════

-- ── Component 2: 4 partial indexes ───────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_coa_parcel_linked_at
    ON coa_applications (parcel_linked_at)
    WHERE parcel_linked_at IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_coa_scope_classified_at
    ON coa_applications (scope_classified_at)
    WHERE scope_classified_at IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_coa_trade_classified_at
    ON coa_applications (trade_classified_at)
    WHERE trade_classified_at IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_coa_cost_classified_at
    ON coa_applications (cost_classified_at)
    WHERE cost_classified_at IS NOT NULL;

-- ── Drop redundant Phase C UNIQUE INDEX (superseded by new PK) ───────
DROP INDEX CONCURRENTLY IF EXISTS uniq_cost_estimates_lead_id;

-- ═══════════════════════════════════════════════════════════════════
-- DOWN — manual rollback only, intentionally not transactional
-- (Rule 6 / commit 8b1c10b)
-- ═══════════════════════════════════════════════════════════════════
-- Reverting this migration restores the Phase C state:
--   * cost_estimates PK back to (permit_num, revision_num)
--   * cost_source CHECK back to ('permit', 'model', 'none')
--   * lead_id_orphan_audit view back to migration 142 body
--   * uniq_cost_estimates_lead_id index re-created
--   * coa_applications timestamp columns + partial indexes dropped
--
-- This is a structurally significant migration; rollback is not trivial.
-- Coordinate with deploy harness + DBA before reverting on production.
