-- Migration 208: neighbourhood_build_norms — structure_family (Spec 78/88 P2 R1/R2, family-aware norms).
--
-- SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §P2 (family-aware inputs)
--
-- Makes the build-norm snapshot family-aware so detached parcels read detached realized-FSI norms (R2).
-- Storey norms stay UNIFIED (not touched) — only build norms need per-family cohorts (plan-review 2026-06-30).
--
-- DEFAULT 'all' is load-bearing (3 ways): (1) every existing row becomes the family-agnostic backstop,
-- so this migration is behaviorally a NO-OP until compute-build-norms is made family-aware — every read
-- still sees one row per neighbourhood + one (NULL,'all') citywide row; (2) it makes the partial unique
-- index below immediately protective (NULLs aren't deduped by a UNIQUE index — a NULL family would leave
-- the citywide-singleton decorative); (3) the enrich reads bind a literal 'all' for non-residential
-- parcels (SQL `= NULL` is always false), so the backstop is a real string, never a SQL NULL.
--
-- Runs in migrate.js's single per-file transaction — the word CONCURRENTLY is deliberately ABSENT
-- (its presence routes the whole file to the non-transactional per-statement path, making this 4-step
-- swap non-atomic). These tables are ~140 rows; a plain index build locks for microseconds.

-- UP
SET LOCAL lock_timeout = '5s';
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'neighbourhood_build_norms') THEN
    -- (a) family column — NOT NULL DEFAULT 'all' (existing rows → the backstop family).
    ALTER TABLE neighbourhood_build_norms
      ADD COLUMN IF NOT EXISTS structure_family TEXT NOT NULL DEFAULT 'all';

    -- (b) swap the auto-named column-level UNIQUE(neighbourhood_id) → composite (neighbourhood_id, structure_family).
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'neighbourhood_build_norms_neighbourhood_id_key') THEN
      ALTER TABLE neighbourhood_build_norms DROP CONSTRAINT neighbourhood_build_norms_neighbourhood_id_key;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'neighbourhood_build_norms_nbhd_family_key') THEN
      ALTER TABLE neighbourhood_build_norms
        ADD CONSTRAINT neighbourhood_build_norms_nbhd_family_key UNIQUE (neighbourhood_id, structure_family);
    END IF;

    -- (c) swap the citywide-singleton partial index: was one citywide row TOTAL → now one PER family.
    -- (Composite UNIQUE above treats NULL neighbourhood_id as distinct, so it can't enforce this alone.)
    DROP INDEX IF EXISTS neighbourhood_build_norms_citywide_singleton;
    CREATE UNIQUE INDEX IF NOT EXISTS neighbourhood_build_norms_citywide_singleton
      ON neighbourhood_build_norms (structure_family) WHERE neighbourhood_id IS NULL;
  END IF;
END $mig$;

-- DOWN (comments-only — Rule 6, single-txn runner):
-- ALTER TABLE neighbourhood_build_norms DROP CONSTRAINT IF EXISTS neighbourhood_build_norms_nbhd_family_key;
-- DROP INDEX IF EXISTS neighbourhood_build_norms_citywide_singleton;
-- ALTER TABLE neighbourhood_build_norms ADD CONSTRAINT neighbourhood_build_norms_neighbourhood_id_key UNIQUE (neighbourhood_id);
-- CREATE UNIQUE INDEX neighbourhood_build_norms_citywide_singleton
--   ON neighbourhood_build_norms ((neighbourhood_id IS NULL)) WHERE neighbourhood_id IS NULL;
-- ALTER TABLE neighbourhood_build_norms DROP COLUMN IF EXISTS structure_family;
