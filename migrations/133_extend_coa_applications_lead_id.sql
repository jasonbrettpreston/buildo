-- 133: coa_applications — add lead_id + 18 classification/cost/geo/lifecycle
-- columns. 33K-row hot table. Same R2.v3 patterns as migration 132:
-- direct-compute backfill (NOT trigger-reliant) and DO/EXCEPTION-wrapped
-- CHECK constraint.
--
-- Phase D classifiers (load-coa.js extension for geocoding,
-- classify-coa-scope.js, link-coa-to-parcels.js, classify-coa-trades.js,
-- compute-coa-cost-estimates.js) populate the new columns. Phase E
-- classify-lifecycle-phase.js extension writes the 5 lifecycle columns.
-- Phase B leaves them all NULL.
--
-- application_number is the natural key (UNIQUE per migration 009) — no
-- LPAD needed since it's already a single string. lead_id format is
-- 'coa:<application_number>' (Spec 42 §6.6.A).

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE coa_applications
  ADD COLUMN IF NOT EXISTS lead_id TEXT,
  ADD COLUMN IF NOT EXISTS coa_type_class VARCHAR(30),
  ADD COLUMN IF NOT EXISTS project_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS scope_tags TEXT[],
  ADD COLUMN IF NOT EXISTS scope_classified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scope_source VARCHAR(30),
  ADD COLUMN IF NOT EXISTS structure_type VARCHAR(30),
  ADD COLUMN IF NOT EXISTS neighbourhood_id BIGINT,
  ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS longitude DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS modeled_gfa_sqm NUMERIC,
  ADD COLUMN IF NOT EXISTS estimated_cost NUMERIC,
  ADD COLUMN IF NOT EXISTS cost_source VARCHAR(20),
  ADD COLUMN IF NOT EXISTS cost_classified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lifecycle_seq INTEGER,
  ADD COLUMN IF NOT EXISTS lifecycle_group VARCHAR(10),
  ADD COLUMN IF NOT EXISTS lifecycle_block VARCHAR(10),
  ADD COLUMN IF NOT EXISTS lifecycle_stage VARCHAR(5),
  ADD COLUMN IF NOT EXISTS bid_value DECIMAL(3,2);

-- Trigger keeps lead_id in sync on INSERT and on any UPDATE that touches
-- application_number. Same column-targeted semantics as the permits
-- trigger — the backfill below uses direct compute, not trigger-reliant.
CREATE OR REPLACE FUNCTION coa_set_lead_id() RETURNS TRIGGER AS $$
BEGIN
    NEW.lead_id := 'coa:' || NEW.application_number;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_coa_lead_id ON coa_applications;
CREATE TRIGGER trg_coa_lead_id
    BEFORE INSERT OR UPDATE OF application_number ON coa_applications
    FOR EACH ROW EXECUTE FUNCTION coa_set_lead_id();

-- Direct-compute backfill — R2.v3 trigger-semantics CRIT fix.
UPDATE coa_applications
SET lead_id = 'coa:' || application_number
WHERE lead_id IS NULL;

-- CHECK constraint with DO/EXCEPTION guard. Format is strictly 'coa:...'
-- on this table — a permit-prefixed value here is a serious bug.
DO $$
BEGIN
    ALTER TABLE coa_applications
      ADD CONSTRAINT chk_coa_lead_id_format
        CHECK (lead_id IS NULL OR lead_id ~ '^coa:.+$');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Range CHECK on bid_value — same fix as migration 132 (R5.3 review).
DO $$
BEGIN
    ALTER TABLE coa_applications
      ADD CONSTRAINT chk_coa_bid_value_range
        CHECK (bid_value IS NULL OR (bid_value >= 0 AND bid_value <= 1));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CONCURRENTLY indexes — 5 total. The GIN index on scope_tags supports
-- array-containment queries from the Phase F front-end (e.g., "show me
-- all CoAs tagged 'addition'"). Partial indexes on the lifecycle / type
-- columns avoid bloating the index with the ~95% NULL pre-Phase-D state.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_coa_lead_id ON coa_applications (lead_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_coa_neighbourhood ON coa_applications (neighbourhood_id) WHERE neighbourhood_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_coa_coa_type_class ON coa_applications (coa_type_class) WHERE coa_type_class IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_coa_scope_tags ON coa_applications USING GIN (scope_tags);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_coa_lifecycle_seq ON coa_applications (lifecycle_seq) WHERE lifecycle_seq IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
-- DOWN — manual rollback only, intentionally not transactional
-- (Rule 6 / commit 8b1c10b)
-- ═══════════════════════════════════════════════════════════════════
-- Reverting this migration drops all CoA classification + lifecycle
-- substrate. Phase D scripts cannot write their outputs. Permit-side
-- functionality is unaffected.
--
-- To roll back manually:
--
--   DROP INDEX IF EXISTS idx_coa_lifecycle_seq;
--   DROP INDEX IF EXISTS idx_coa_scope_tags;
--   DROP INDEX IF EXISTS idx_coa_coa_type_class;
--   DROP INDEX IF EXISTS idx_coa_neighbourhood;
--   DROP INDEX IF EXISTS idx_coa_lead_id;
--   ALTER TABLE coa_applications DROP CONSTRAINT IF EXISTS chk_coa_lead_id_format;
--   DROP TRIGGER IF EXISTS trg_coa_lead_id ON coa_applications;
--   DROP FUNCTION IF EXISTS coa_set_lead_id();
--   ALTER TABLE coa_applications
--     DROP COLUMN IF EXISTS bid_value,
--     DROP COLUMN IF EXISTS lifecycle_stage,
--     DROP COLUMN IF EXISTS lifecycle_block,
--     DROP COLUMN IF EXISTS lifecycle_group,
--     DROP COLUMN IF EXISTS lifecycle_seq,
--     DROP COLUMN IF EXISTS cost_classified_at,
--     DROP COLUMN IF EXISTS cost_source,
--     DROP COLUMN IF EXISTS estimated_cost,
--     DROP COLUMN IF EXISTS modeled_gfa_sqm,
--     DROP COLUMN IF EXISTS longitude,
--     DROP COLUMN IF EXISTS latitude,
--     DROP COLUMN IF EXISTS neighbourhood_id,
--     DROP COLUMN IF EXISTS structure_type,
--     DROP COLUMN IF EXISTS scope_source,
--     DROP COLUMN IF EXISTS scope_classified_at,
--     DROP COLUMN IF EXISTS scope_tags,
--     DROP COLUMN IF EXISTS project_type,
--     DROP COLUMN IF EXISTS coa_type_class,
--     DROP COLUMN IF EXISTS lead_id;
