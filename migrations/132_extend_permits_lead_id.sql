-- 132: permits — add lead_id + linked_coa back-reference + 5 granular
-- lifecycle columns. HIGHEST-RISK MIGRATION in Phase B.
--
-- 247K-row hot table. Three CONCURRENTLY indexes force scripts/migrate.js
-- into non-transactional mode (lines 195-201), so each statement is its
-- own implicit transaction. Re-runnability relies on IF NOT EXISTS guards
-- + the DO/EXCEPTION wrapper on ADD CONSTRAINT.
--
-- lead_id is populated by a one-shot direct-compute UPDATE pass (NOT via
-- the trigger — the trigger is column-targeted on permit_num/revision_num
-- and `SET lead_id = lead_id` does NOT fire it, which would leave all
-- 247K rows NULL. R2.v3 worktree review caught this trigger-semantics CRIT
-- in the prior draft.)
--
-- The trigger remains in place for future INSERTs and any UPDATE that
-- changes permit_num or revision_num — keeping lead_id in sync without
-- application-layer coordination.
--
-- Spec 42 §6.6.A.1 governs the lead_id format contract: 'permit:<num>:<rev>'.
-- The CHECK constraint enforces the prefix shape. There is no cross-table
-- FK because lead_id may reference either permits OR coa_applications;
-- the orphan-audit view in migration 137 detects bad references.

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE permits
  ADD COLUMN IF NOT EXISTS lead_id TEXT,
  ADD COLUMN IF NOT EXISTS linked_coa_application_number VARCHAR(50),
  ADD COLUMN IF NOT EXISTS lifecycle_seq INTEGER,
  ADD COLUMN IF NOT EXISTS lifecycle_group VARCHAR(10),
  ADD COLUMN IF NOT EXISTS lifecycle_block VARCHAR(10),
  ADD COLUMN IF NOT EXISTS lifecycle_stage VARCHAR(5),
  ADD COLUMN IF NOT EXISTS bid_value DECIMAL(3,2);

-- Trigger function: keeps lead_id in sync with permit_num + revision_num
-- on every INSERT or UPDATE that touches the source columns. NEW.lead_id
-- is overwritten regardless of what the caller passed, so application
-- code cannot accidentally drift from the canonical format.
CREATE OR REPLACE FUNCTION permits_set_lead_id() RETURNS TRIGGER AS $$
BEGIN
    NEW.lead_id := 'permit:' || NEW.permit_num || ':' || LPAD(NEW.revision_num, 2, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_permits_lead_id ON permits;
CREATE TRIGGER trg_permits_lead_id
    BEFORE INSERT OR UPDATE OF permit_num, revision_num ON permits
    FOR EACH ROW EXECUTE FUNCTION permits_set_lead_id();

-- One-time backfill: direct compute, NOT trigger-reliant. The trigger
-- above only fires when permit_num/revision_num are touched in the
-- UPDATE SET clause — `SET lead_id = lead_id` does NOT fire it. The
-- correct pattern is computing the value inline (which also runs faster
-- since the trigger overhead is skipped on the bulk pass). Idempotent
-- via WHERE lead_id IS NULL — re-runs match zero rows.
UPDATE permits
SET lead_id = 'permit:' || permit_num || ':' || LPAD(revision_num, 2, '0')
WHERE lead_id IS NULL;

-- CHECK constraint wrapped in DO/EXCEPTION so re-runs after partial
-- success (the file runs non-transactionally due to CONCURRENTLY below)
-- don't fail on "constraint already exists". Same pattern in migrations
-- 133 and 134 — R2.v3 worktree caught the missing-guard bug.
-- Prefix-only CHECK (R5.3 worktree + Gemini-132 fix): the prior pattern
-- '^permit:.+:[0-9A-Za-z]+$' was over-strict — would reject revision_num
-- values containing hyphens/underscores/special chars (e.g., 'A-1'),
-- causing the 247K-row backfill to fail mid-batch. Aligning to Spec 42
-- §6.6.A.1 universal prefix-only pattern matches migration 133 (coa).
DO $$
BEGIN
    ALTER TABLE permits
      ADD CONSTRAINT chk_permits_lead_id_format
        CHECK (lead_id IS NULL OR lead_id ~ '^permit:.+$');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Also enforce the 0-1 range on bid_value (Spec 84 §2.5.h.2 — importance
-- score; same CHECK present on universal_stream_catalog.bid_value).
-- R5.3 review fix (Gemini-132 + DeepSeek-133): the column declaration
-- alone does not enforce range; DECIMAL(3,2) accepts -9.99..9.99.
DO $$
BEGIN
    ALTER TABLE permits
      ADD CONSTRAINT chk_permits_bid_value_range
        CHECK (bid_value IS NULL OR (bid_value >= 0 AND bid_value <= 1));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CONCURRENTLY indexes — routes the whole file non-transactionally via
-- migrate.js lines 195-201 (CREATE INDEX CONCURRENTLY cannot run inside
-- a transaction block). Each runs against the now-populated 247K rows;
-- estimated 30-90s per index.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_permits_lead_id ON permits (lead_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_permits_linked_coa ON permits (linked_coa_application_number) WHERE linked_coa_application_number IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_permits_lifecycle_seq ON permits (lifecycle_seq) WHERE lifecycle_seq IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
-- DOWN — manual rollback only, intentionally not transactional
-- (Rule 6 / commit 8b1c10b)
-- ═══════════════════════════════════════════════════════════════════
-- Reverting this migration removes the lead_id substrate that Phase C
-- consumers will depend on. Doing so AFTER Phase C has shipped will
-- break every script that writes to lead_id-keyed tables (lead_trades,
-- lead_parcels, cost_estimates, etc.).
--
-- To roll back manually (Phase B-only state — pre Phase C):
--
--   DROP INDEX IF EXISTS idx_permits_lifecycle_seq;
--   DROP INDEX IF EXISTS idx_permits_linked_coa;
--   DROP INDEX IF EXISTS idx_permits_lead_id;
--   ALTER TABLE permits DROP CONSTRAINT IF EXISTS chk_permits_lead_id_format;
--   DROP TRIGGER IF EXISTS trg_permits_lead_id ON permits;
--   DROP FUNCTION IF EXISTS permits_set_lead_id();
--   ALTER TABLE permits
--     DROP COLUMN IF EXISTS bid_value,
--     DROP COLUMN IF EXISTS lifecycle_stage,
--     DROP COLUMN IF EXISTS lifecycle_block,
--     DROP COLUMN IF EXISTS lifecycle_group,
--     DROP COLUMN IF EXISTS lifecycle_seq,
--     DROP COLUMN IF EXISTS linked_coa_application_number,
--     DROP COLUMN IF EXISTS lead_id;
