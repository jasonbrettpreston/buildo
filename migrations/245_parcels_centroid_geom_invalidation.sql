-- 245: P1 (Spec 122 §10) — the CENTROID invalidator. Adds a fourth arm to migration 242's
-- geometry-change trigger FUNCTION so `parcels.centroid_lat` / `centroid_lng` are invalidated
-- (NULLed) on every write path, exactly like the two watermarks 242 already covers.
--
-- WHY THIS EXISTS (filed HIGH 2026-08-23)
-- `parcels.centroid_lat` / `centroid_lng` are geometry-derived and had NO invalidator anywhere:
--   · `compute-centroids.js:105` is a ONE-WAY FILL, not a refresh — its PostGIS fast path is
--     `UPDATE parcels SET centroid_lat = ST_Y(ST_Centroid(geom)), … WHERE geom IS NOT NULL AND
--     centroid_lat IS NULL`. A parcel that already has a centroid is never revisited, no matter
--     how far its geometry has since moved. (The JS fallback's predicate is the same shape.)
--   · migration 242's `BEFORE UPDATE OF geom, geometry` trigger NULLs `massing_enriched_at` and
--     `zoning_enriched_at` — and nothing else.
--   · `load-parcels.js:353-361` (DEC-FENCE2, #418) NULLs the three `*_dataset_version_when_enriched`
--     stamps — and nothing else, and only for writes that go through its own UPSERT.
-- So a moved parcel kept a stale centroid FOREVER.
--
-- WHY IT MATTERS: the centroid is the join key for `link-parcels.js:415-423`, the Tier-3
-- centroid-proximity fallback that links a permit to a parcel by `ST_DWithin(ST_MakePoint(
-- pa.centroid_lng, pa.centroid_lat), permit point, $5)`. A stale centroid does not read as missing
-- data — it reads as a CONFIDENT WRONG ANSWER: the permit links to whatever parcel the old
-- coordinates now fall near. Every downstream consumer of `permit_parcels` inherits that.
-- (⚠️ Deliberately NOT justified by `link_massing`: that step's `centroid_lat IS NOT NULL` at
-- `link-massing.js:237`/`:434` is only a NOT-NULL eligibility filter — its real predicate at `:293`
-- joins the parcel's geom against the building's own centroid. `link_parcels` is the real consumer.)
--
-- WHY A FOURTH ARM ON 242'S FUNCTION, AND NOT A NEW TRIGGER
-- Centroids are geometry-derived in exactly the sense the 242 header describes for the two
-- watermarks: "a geometry move can put the parcel under a DIFFERENT massing join or a NEW zoning
-- by-law area entirely". The invalidation EVENT is identical (`BEFORE UPDATE OF geom, geometry`
-- with an internal `IS DISTINCT FROM` guard), so this rides 242's existing trigger via
-- `CREATE OR REPLACE FUNCTION` rather than adding a second trigger on the same event — one
-- statement, one guard, one place a future reader has to look.
--
-- ⚠️ WHY THIS IS A NEW FILE AND NOT AN EDIT TO 242. Migration 242 is ALREADY APPLIED (dev
-- `schema_migrations`, keyed by filename). An in-place edit would not re-run locally — leaving the
-- fix silently absent on every DB that already has 242 — and would ship a divergent 242 to cloud,
-- breaking `migrate.js --verify`'s checksum drift gate. New number, `CREATE OR REPLACE`.
--
-- ⚠️ THE `IS DISTINCT FROM` GUARD IS LOAD-BEARING FOR THIS ARM TOO, and more so than for the
-- watermarks. Postgres's `UPDATE OF geom, geometry` contract fires on the column's MEMBERSHIP of
-- the SET list, not on a value change, and `load-parcels.js`'s UPSERT lists both columns whenever
-- ANY tracked field moved (including an address-only update — see its WHERE clause). Placing the
-- centroid assignments OUTSIDE the guard would discard ~486K correct centroids on every reload and
-- force a full `compute_centroids` recompute. The arm therefore sits INSIDE the existing IF,
-- unchanged in shape from the two arms beside it.
--
-- NO BACKFILL IS INCLUDED, DELIBERATELY. Measured on the local authoritative DB (127.0.0.1:54322,
-- 241 migrations) 2026-08-23: of 486,530 parcels, **0** carry a centroid that deviates by more than
-- 5 cm from the vertex-mean of their CURRENT geometry (column type is `numeric(10,7)` — a ~1.1 cm
-- quantum — so 5 cm is comfortably above rounding). The defect is LATENT, not manifest: the last
-- full rebuild computed every centroid after its final geometry write. A blanket NULL-and-recompute
-- would therefore be 486K writes of pure churn to fix nothing. This migration closes the path; it
-- has no debt to repay.
--
-- INSERTs are untouched: a new parcel already lands with NULL centroids (migration 016 added the
-- columns with no DEFAULT; `compute-centroids.js` is their only writer).
--
-- FK impact: none — this migration adds no columns, constraints or references, so the FK-signature
-- rule has nothing to exempt. It replaces one plpgsql function body and one COMMENT.
--
-- SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md (compute_centroids + link_parcels steps)
-- SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (load_parcels / enrich_parcels steps)
-- SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §10 (P1)
-- SPEC LINK: migrations/242_parcels_geom_invalidation_trigger.sql (the two arms this extends)
-- Red-first proof: src/tests/db/migration-245-centroid-invalidation.db.test.ts

-- ============================================================================
-- UP
-- ============================================================================

CREATE OR REPLACE FUNCTION trg_parcels_invalidate_on_geom_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.geom IS DISTINCT FROM OLD.geom) OR (NEW.geometry IS DISTINCT FROM OLD.geometry) THEN
    NEW.massing_enriched_at := NULL;
    NEW.zoning_enriched_at := NULL;
    -- Migration 245 — the centroid arm. Geometry-derived exactly like the two watermarks above,
    -- and the join key for link-parcels.js:415-423's Tier-3 centroid-proximity fallback.
    -- NULL ⇒ compute-centroids.js's `centroid_lat IS NULL` predicate re-scopes the parcel on its
    -- next run and recomputes it from the NEW geometry.
    NEW.centroid_lat := NULL;
    NEW.centroid_lng := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- The trigger itself is UNCHANGED and is deliberately NOT recreated here: migration 242's
-- `CREATE TRIGGER trg_parcels_geom_invalidation BEFORE UPDATE OF geom, geometry ON parcels
-- FOR EACH ROW EXECUTE FUNCTION trg_parcels_invalidate_on_geom_change()` already binds this
-- function to the right event. Replacing the function body is the whole change; a DROP/CREATE of
-- the trigger would open a window in which parcels.geom is writable with no invalidation at all.

COMMENT ON FUNCTION trg_parcels_invalidate_on_geom_change() IS
  'Phase B B2 (migration 242) + P1 (migration 245): nulls parcels.massing_enriched_at, zoning_enriched_at, centroid_lat and centroid_lng whenever geom or geometry actually changes, so the D1'' massing gate, the pass-1 zoning gate and compute_centroids all re-scope the parcel on their next incremental run. Guarded by IS DISTINCT FROM so an address-only reload (which re-lists geom in its SET clause) is a no-op. Fires on ANY write path (trigger, not app-code) — see the migration 242 and 245 headers.';

-- ============================================================================
-- DOWN — comments-only per project convention (migrate.js runs the whole file in one
-- transaction and does NOT honour -- UP / -- DOWN markers; see tasks/lessons.md).
-- Restores migration 242's function body and COMMENT verbatim; the trigger is untouched by
-- both directions, so dropping it is NOT part of this rollback.
-- ============================================================================
-- CREATE OR REPLACE FUNCTION trg_parcels_invalidate_on_geom_change()
-- RETURNS TRIGGER AS $$
-- BEGIN
--   IF (NEW.geom IS DISTINCT FROM OLD.geom) OR (NEW.geometry IS DISTINCT FROM OLD.geometry) THEN
--     NEW.massing_enriched_at := NULL;
--     NEW.zoning_enriched_at := NULL;
--   END IF;
--   RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;
--
-- COMMENT ON FUNCTION trg_parcels_invalidate_on_geom_change() IS
--   'Phase B B2 (migration 242): nulls parcels.massing_enriched_at and zoning_enriched_at whenever geom or geometry actually changes, so the D1'' massing gate and the pass-1 zoning gate both re-scope the parcel on their next incremental run. Fires on ANY write path (trigger, not app-code) — see migration 242 header.';
