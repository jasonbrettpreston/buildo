-- 139: Phase C — promote trade_forecasts.lead_id NOT NULL + composite UNIQUE
-- per Spec 42 §6.6.C.
--
-- WF3 #mig-139-composite-unique (2026-05-14): prior version of this migration
-- (pre-WF3) used a single-column `UNIQUE(lead_id)`. trade_forecasts is
-- naturally 1-row-per-(permit, trade_slug): every permit has multiple forecast
-- rows (one per trade slug, ~17-18 per typical permit) all sharing the same
-- lead_id. Single-column UNIQUE is mathematically impossible to satisfy on any
-- populated table — the Stage-2 dup pre-check always returns 91,724 in
-- production, aborting before any DDL runs. Spec 42 §6.6.C line 538:
-- `"PK becomes (lead_id, trade_slug) after backfill"`. This migration creates
-- the composite UNIQUE that future Phase H PK swap will promote.
--
-- Two-stage pre-check (R2 DeepSeek finding, preserved):
--   Stage 1: confirm zero NULL lead_id rows (backfill complete via
--            scripts/migrate-to-lead-id.js)
--   Stage 2: confirm zero duplicate (lead_id, trade_slug) pairs (composite
--            integrity — should be 0 because existing PK
--            (permit_num, revision_num, trade_slug) already enforces this
--            invariant via the deterministic lead_id derivation)
--
-- Stale-local-state cleanup (R8 Worktree #3): explicit DROP of the OLD
-- single-column index name handles any local DB that applied the broken
-- pre-WF3 version against an empty trade_forecasts. The IF EXISTS makes it
-- a no-op on fresh DBs.
--
-- statement_timeout = '5min' covers the pre-checks. CONCURRENTLY index
-- builds run in their own implicit transactions (per scripts/migrate.js:195
-- which detects CONCURRENTLY and splits statements); the SET LOCAL applies
-- to the pre-check statements only — sufficient since the actual index
-- build on 654K rows completes in <60s on this hardware.

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

SET LOCAL statement_timeout = '5min';

-- Stage 1: NULL pre-check (backfill completeness)
DO $$
DECLARE null_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO null_count FROM trade_forecasts WHERE lead_id IS NULL;
    IF null_count > 0 THEN
        RAISE EXCEPTION 'Phase C migration 139 aborted: trade_forecasts has % rows with NULL lead_id. Run scripts/migrate-to-lead-id.js first.', null_count;
    END IF;
END $$;

-- Stage 2: composite duplicate pre-check (lead_id, trade_slug)
-- per Spec 42 §6.6.C composite-key intent. R8 DeepSeek LOW: surface a sample
-- of up to 3 dup pairs in the exception message for operator debugging.
DO $$
DECLARE
    dup_count INTEGER;
    dup_sample TEXT;
BEGIN
    SELECT COUNT(*) INTO dup_count FROM (
        SELECT lead_id, trade_slug FROM trade_forecasts
        WHERE lead_id IS NOT NULL
        GROUP BY lead_id, trade_slug HAVING COUNT(*) > 1
    ) d;
    IF dup_count > 0 THEN
        SELECT string_agg(lead_id || ':' || trade_slug, ', ' ORDER BY lead_id, trade_slug) INTO dup_sample
          FROM (
            SELECT lead_id, trade_slug FROM trade_forecasts
            WHERE lead_id IS NOT NULL
            GROUP BY lead_id, trade_slug HAVING COUNT(*) > 1
            LIMIT 3
          ) s;
        RAISE EXCEPTION 'Phase C migration 139 aborted: trade_forecasts has % duplicate (lead_id, trade_slug) pairs — investigate before retrying. Sample: %', dup_count, dup_sample;
    END IF;
END $$;

-- R8 diff-review Gemini MED: order DDL so the highest-failure-risk operation
-- (CREATE UNIQUE INDEX CONCURRENTLY — runs in its own implicit transaction
-- and can fail late if a racy insert lands a dup) runs BEFORE the metadata
-- change ALTER SET NOT NULL. If CREATE fails, the table is still nullable
-- and rollback is cleaner. If CREATE succeeds, SET NOT NULL is a fast
-- metadata-only change on an already-validated column.

-- 1. Stale-local-state cleanup: drop the broken pre-WF3 single-column index
--    if it exists from a local-only application against an empty table.
DROP INDEX CONCURRENTLY IF EXISTS uniq_trade_forecasts_lead_id;

-- 2. Composite UNIQUE per Spec 42 §6.6.C. Future Phase H PK swap will
--    promote this index pair to PRIMARY KEY.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uniq_trade_forecasts_lead_id_trade ON trade_forecasts (lead_id, trade_slug);

-- 3. NOT NULL promotion (only safe after the composite UNIQUE is validated;
--    if CREATE INDEX failed, this block isn't reached and the table stays
--    nullable — easier rollback).
ALTER TABLE trade_forecasts ALTER COLUMN lead_id SET NOT NULL;

-- 4. Drop the Phase B partial index — now redundant given the composite UNIQUE.
DROP INDEX CONCURRENTLY IF EXISTS idx_trade_forecasts_lead_id;

-- ═══════════════════════════════════════════════════════════════════
-- DOWN — manual rollback only, intentionally not transactional
-- (Rule 6 / commit 8b1c10b)
-- ═══════════════════════════════════════════════════════════════════
-- Reverting this migration restores trade_forecasts.lead_id to nullable.
-- The Phase C migrate-to-lead-id.js backfill is preserved (no DELETE).
-- Downstream Phase C consumers can still operate against the populated column.
--
-- To roll back manually (drop new composite + restore Phase B partial):
--
--   DROP INDEX CONCURRENTLY IF EXISTS uniq_trade_forecasts_lead_id_trade;
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trade_forecasts_lead_id
--     ON trade_forecasts (lead_id) WHERE lead_id IS NOT NULL;
--   ALTER TABLE trade_forecasts ALTER COLUMN lead_id DROP NOT NULL;
