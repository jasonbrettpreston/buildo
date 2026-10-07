-- 251: WF3 parcels geometry drift (Spec 55 Known Failure Modes; Spec 122 §6.4) — a TOLERANCE
-- predicate for "did this parcel's shape materially change?", and the geometry-change trigger
-- function rewired onto it. Commit 1 of 2: the trigger half. The loader half (load_parcels' own
-- upsert WHERE / DEC-FENCE2 CASE arms) is Commit 2 (a scripts/lib/step codegen axis, which rides
-- the next fleet recapture).
--
-- WHY THIS EXISTS (premise .cursor/wf3_parcels_geom_rewrite_premise.md, 2026-10-06, measured)
-- The City's CKAN Property Boundaries publish is float GeoJSON that the publisher re-serialises
-- with sub-millimetre vertex jitter and arbitrary ring start vertices. Every comparator on the
-- parcel write path is EXACT (`IS DISTINCT FROM` on geometry and jsonb), so a no-op re-export
-- reads as a citywide shape change:
--   · June-2026 dump vs the 2026-09-24 publish: 485,547 matched rows differ, 0 byte-identical;
--     484,708 (99.83 %) keep their vertex count with every vertex moved < 1e-8° (≈1.1 mm).
--     Only ≈839 (0.17 %) moved > 1e-7° (≈1.1 cm) or changed vertex count.
--   · `ST_Equals` is false on jitter, and rounding to 7 dp still trips 30.9 % of the jitter pairs
--     (6 dp: 4.1 %), so the rounding fix proposed at review_followups:3104 is REFUTED.
--   · The 2026-09-24 GOLD-PRE capture rewrote 485,525 rows; this trigger then NULLed
--     massing_enriched_at / zoning_enriched_at / centroid_lat / centroid_lng (and, since 249, the
--     three dataset-version stamps) on ~every parcel: ≈145–150 min of recompute per occurrence,
--     recurring at the publisher's cadence (declared as PR-D3 / P-D3).
-- New failure class: "an exact comparator over a publisher-jittered float source".
--
-- THE PREDICATE — public.parcels_geom_materially_changed(old_geom, new_geom), ONE definition.
-- Material (TRUE) iff any of:
--   · NULL <-> shape, or empty <-> non-empty;
--   · an SRID, geometry type, part, ring or VERTEX-COUNT change (a vertex-count change is always
--     material, even a collinear one);
--   · an invalid shape on either side (`ST_IsValid(g, 0)` — the flags form emits no NOTICE);
--   · any vertex farther than `tol` from the other shape (discrete Hausdorff);
--   · an area change beyond (perimeter_old + perimeter_new) × tol — a COARSE re-wiring guard
--     (discrete Hausdorff is blind to re-wiring the same vertex set; a bow-tie and its square
--     have Hausdorff 0), NOT a small-move guard.
-- Immaterial (FALSE): byte-identical (incl. both NULL / both empty), or same structure with
-- every vertex within tol — sub-tol jitter and a ring rotated to a new start vertex.
-- Sequential IFs, NOT one AND/OR chain: Postgres does not guarantee boolean evaluation order, and
-- every exit is an explicit TRUE/FALSE, so the function NEVER returns NULL.
--
-- THE TOLERANCE — logic variable `parcels_geom_change_tolerance_deg` (Spec 124 Rule 3; operator
-- ruling Q1 2026-10-06). Default 1e-7 (degrees ≈ 1.1 cm lat / 0.8 cm lon: the centroid
-- numeric(10,7) quantum, 10× the largest measured jitter). Bounds [1e-8, 5e-7], enforced HERE as
-- well as at step start, because a trigger has no ctx.config: tol = 0 would recreate the
-- 2026-09-24 event; 5e-7 ≈ 5.6 cm is the migration-245 5 cm precedent. The function reads the row
-- itself, so the trigger and (after Commit 2) the loader always use one runtime value. FAIL-CLOSED:
-- a missing or out-of-bounds row RAISEs on the first INEXACT pair in any writer's statement (the
-- loader's whole step transaction rolls back; an ad-hoc `UPDATE … SET geom` aborts). A
-- byte-identical write never reads the row. The literals 1e-7 / 1e-8 / 5e-7 are pinned across this
-- file, scripts/seeds/logic_variables.json and docs/specs/_contracts.json by contracts.infra.test.ts.
--
-- THE TRIGGER FUNCTION — trg_parcels_invalidate_on_geom_change() (bound by migration 242's
-- `trg_parcels_geom_invalidation BEFORE UPDATE OF geom, geometry`; the trigger is NOT recreated —
-- the 245/249 pattern, so it is never absent). `material` is computed ONCE per row.
--   · material → all 7 columns NULLed, exactly as 249 did on any geom change.
--   · OLD.geom and NEW.geom both NULL and the raw `geometry` jsonb changed → massing / zoning /
--     centroid NULLed, the 3 stamps kept (the 242/245 outer jsonb arm, kept for out-of-band writers
--     of a geom-less row; the enrichers read geom).
--   · otherwise nothing is NULLed.
-- ⚠️ FENCE REVERSAL, STATED (operator ruling Q2 2026-10-06). Migration 249's header says "The four
-- 242/245 arms stay on the outer guard, unchanged" and the LDG-10 design note says "four 242/245
-- arms verbatim"; the O2-A ruling covered ADDING the stamp arm, not the outer arm. This migration
-- deliberately narrows it: a raw-jsonb-only change with a non-NULL, immaterially-changed geom no
-- longer NULLs massing, zoning or the centroid. Every consumer of those columns reads `geom`
-- (compute_centroids writes ST_Centroid(geom); the enrichers and enrich_parcels read p.geom;
-- parcel-lookup.ts excludes geometry) — the reasoning 249 already applied to the stamp arm.
-- Retired locks (rewritten knowingly): migration-245 ① "ONLY the geometry jsonb" and
-- migration-249 ④ — massing/zoning/centroid go from NULLed to KEPT. Their old expectation survives
-- in migration-251's both-NULL-geom and material-move cases.
-- ⚠️ The literal `NEW.<col> := NULL` form is kept for all 7 columns: the FLEET-2 requirement probe
-- (scripts/lib/step/index.js triggerBodyMissingColumns) regexes the live prosrc for it.
-- DECLARED RESIDUALS: (a) a trigger cannot veto a write, so a non-loader writer repeating sub-tol
-- moves can accumulate drift past tol (each step compares publish k with k-1); Commit 2 closes this
-- for the loader only (it compares against the STORED shape). (b) a raw-jsonb-only edit by an
-- ad-hoc writer no longer invalidates massing, zoning or the centroid.
-- WHAT COMMIT 1 ALONE BUYS: on a jitter republish the loader still rewrites geom/geometry and its
-- own exact CASE arms still NULL the 3 dataset stamps (enrich_ravines/heritage/centreline ≈77 min),
-- but the trigger keeps massing, zoning and the centroid (saves enrich_parcels --full 64–71 min,
-- the zoning defer, and the centroid hole that blinded link_parcels Tier 3).
--
-- MEASURED BEFORE WRITING (local dev DB 127.0.0.1:54322 `postgres`, BEGIN READ ONLY, 2026-10-06):
--   · schema_migrations top = 250_address_points_retired_at.sql (247 rows); 251 is free (no git ref
--     or worktree carries 251+).
--   · parcels has exactly one non-internal trigger, trg_parcels_geom_invalidation (tgenabled 'O',
--     BEFORE UPDATE OF geom, geometry) → trg_parcels_invalidate_on_geom_change (the 249 body).
--   · PostGIS 3.3.7 in schema `public` (Spec 113 Decision D4: also `public` on cloud), hence the
--     pinned `SET search_path = public, pg_catalog` on the predicate.
--   · parcels.geom geometry(Geometry,4326), parcels.geometry jsonb; logic_variables.variable_value
--     numeric (PK variable_key → no duplicate rows; `INTO double precision` is an assignment cast).
--     logic_variables has RLS enabled with 0 policies; the writer role `postgres` bypasses RLS.
--   · population: 496,536 parcels; 1 NULL geom (parcel 5515121, its raw geometry jsonb non-NULL);
--     0 rows with geometry NULL and geom set; 0 invalid geoms (ST_IsValid(geom, 0)).
--   · no `parcels_geom_change_tolerance_deg` row yet; no parcels_geom_materially_changed function.
--
-- NO BACKFILL / NO UPDATE OF THE 496,536 ROWS, DELIBERATELY: the columns NULLed by the 2026-09-24
-- event belong to the B1 heal; this migration only stops recurrence. (The 237K+-row UPDATE strategy
-- in CLAUDE.md does not apply: no parcels row is updated.)
--
-- FK impact: none — one function created, one trigger-function body replaced, one logic_variables
-- row inserted. No table, column, index or constraint changes. Migrations, seeds and _contracts.json
-- are in no descriptor's fingerprint_inputs, so this moves no golden capture.
--
-- Re-runnable: CREATE OR REPLACE FUNCTION + INSERT … ON CONFLICT (variable_key) DO NOTHING (an
-- operator-tuned value survives a re-apply) + COMMENT ON. Proven by migration-251's double-apply case.
--
-- SPEC LINK: docs/specs/01-pipeline/55_source_parcels.md (owner)
-- SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.4
-- SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 3
-- SPEC LINK: migrations/249_parcels_stamp_geom_invalidation.sql (the body this replaces)
-- Plan: .cursor/wf3_parcels_geom_drift_tolerance_active_task.md (Commit 1)
-- Red-first proof: src/tests/db/migration-251-geom-tolerance.db.test.ts

-- ============================================================================
-- UP
-- ============================================================================

INSERT INTO logic_variables (variable_key, variable_value, description)
VALUES
  ('parcels_geom_change_tolerance_deg', 1e-7,
   'WF3 parcels geom drift (Spec 55; Spec 124 Rule 3) — degrees. A parcel shape change is MATERIAL only when some vertex moves farther than this (discrete Hausdorff), or its structure/vertex count/validity changes. Default 1e-7 ≈ 1.1 cm; bounds [1e-8, 5e-7] enforced in the function too. CONSUMED by public.parcels_geom_materially_changed() (migration 251) — read by the trg_parcels_geom_invalidation trigger function (and the load_parcels upsert after Commit 2). Operator-tunable; fail-closed.')
ON CONFLICT (variable_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.parcels_geom_materially_changed(old_geom geometry, new_geom geometry)
RETURNS boolean
LANGUAGE plpgsql STABLE PARALLEL SAFE
SET search_path = public, pg_catalog
AS $$
DECLARE
  tol double precision;
BEGIN
  -- Exact first (both NULL, byte-identical): no extra cost, and the tolerance row is never read.
  IF old_geom IS NOT DISTINCT FROM new_geom THEN
    RETURN false;
  END IF;
  -- NULL <-> shape.
  IF old_geom IS NULL OR new_geom IS NULL THEN
    RETURN true;
  END IF;
  -- empty <-> shape (both-empty is caught by the exact test above).
  IF ST_IsEmpty(old_geom) OR ST_IsEmpty(new_geom) THEN
    RETURN true;
  END IF;
  -- Structure: SRID, type, parts, rings, vertex count. A vertex-count change is ALWAYS material.
  IF ST_SRID(old_geom) <> ST_SRID(new_geom) THEN
    RETURN true;
  END IF;
  IF GeometryType(old_geom) <> GeometryType(new_geom) THEN
    RETURN true;
  END IF;
  IF ST_NumGeometries(old_geom) <> ST_NumGeometries(new_geom) THEN
    RETURN true;
  END IF;
  IF ST_NRings(old_geom) <> ST_NRings(new_geom) THEN
    RETURN true;
  END IF;
  IF ST_NPoints(old_geom) <> ST_NPoints(new_geom) THEN
    RETURN true;
  END IF;
  -- Validity: the flags form emits no NOTICE (the 1-arg form floods one per invalid shape).
  IF NOT ST_IsValid(old_geom, 0) OR NOT ST_IsValid(new_geom, 0) THEN
    RETURN true;
  END IF;
  -- The tolerance: one runtime source, bounds enforced HERE (a trigger has no ctx.config).
  SELECT variable_value INTO tol
    FROM public.logic_variables
   WHERE variable_key = 'parcels_geom_change_tolerance_deg';
  IF tol IS NULL OR tol < 1e-8 OR tol > 5e-7 THEN
    RAISE EXCEPTION 'parcels_geom_materially_changed: logic variable parcels_geom_change_tolerance_deg is %, outside [1e-8, 5e-7] — fix the logic_variables row (control panel, group Source Ingestion)',
      COALESCE(tol::text, 'MISSING');
  END IF;
  -- Any vertex farther than tol from the other shape. A NULL distance is material.
  IF COALESCE(ST_HausdorffDistance(old_geom, new_geom) > tol, true) THEN
    RETURN true;
  END IF;
  -- Coarse re-wiring guard (the bound scales with perimeter: ≈4 m² for a 400 m-perimeter lot at
  -- the default). NOT a small-move guard. A NULL comparison is material.
  IF COALESCE(abs(ST_Area(old_geom) - ST_Area(new_geom)) > (ST_Perimeter(old_geom) + ST_Perimeter(new_geom)) * tol, true) THEN
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.parcels_geom_materially_changed(geometry, geometry) IS
  'WF3 parcels geom drift (migration 251; Spec 55): TRUE iff a parcel shape changed MATERIALLY — NULL<->shape, empty<->shape, an SRID/type/part/ring/vertex-count change, an invalid shape on either side, any vertex farther than logic variable parcels_geom_change_tolerance_deg (degrees, discrete Hausdorff), or an area change beyond (perimeter_old + perimeter_new) x tol. FALSE for byte-identical shapes and for sub-tolerance publisher jitter or ring rotation. Never returns NULL. Fail-closed: RAISEs when the tolerance row is missing or outside [1e-8, 5e-7]. Used by trg_parcels_invalidate_on_geom_change().';

CREATE OR REPLACE FUNCTION trg_parcels_invalidate_on_geom_change()
RETURNS TRIGGER AS $$
DECLARE
  -- Computed ONCE per row. NULL/NULL is FALSE; the function never returns NULL.
  material boolean := public.parcels_geom_materially_changed(OLD.geom, NEW.geom);
BEGIN
  -- Migration 251: a MATERIAL geom change (not merely a byte change) invalidates. The second
  -- disjunct keeps the 242/245 raw-jsonb arm ONLY for a row whose geom is NULL on both sides
  -- (an out-of-band writer of a geom-less row); for a non-NULL geom every consumer reads geom.
  IF material OR (OLD.geom IS NULL AND NEW.geom IS NULL AND NEW.geometry IS DISTINCT FROM OLD.geometry) THEN
    NEW.massing_enriched_at := NULL;
    NEW.zoning_enriched_at := NULL;
    -- Migration 245 — the centroid arm (link-parcels.js Tier-3 join key; compute_centroids
    -- re-scopes `centroid_lat IS NULL`).
    NEW.centroid_lat := NULL;
    NEW.centroid_lng := NULL;
    -- Migration 249 — the dataset-version stamp arm, NESTED on a material geom change only (the
    -- enrichers read p.geom). load_parcels' set_null_on_change_of arms stay (#418).
    IF material THEN
      NEW.ravine_dataset_version_when_enriched := NULL;
      NEW.heritage_dataset_version_when_enriched := NULL;
      NEW.centreline_dataset_version_when_enriched := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION trg_parcels_invalidate_on_geom_change() IS
  'Phase B B2 (migration 242) + P1 (migration 245) + LDG-10 O2-A (migration 249) + WF3 geom drift (migration 251): on a MATERIAL geom change (public.parcels_geom_materially_changed — tolerance logic variable parcels_geom_change_tolerance_deg) nulls parcels.massing_enriched_at, zoning_enriched_at, centroid_lat, centroid_lng and the three *_dataset_version_when_enriched stamps (ravine, heritage, centreline); when geom is NULL on both sides and only the raw geometry jsonb changed, nulls the first four and keeps the stamps. Sub-tolerance publisher jitter, ring rotation and a raw-jsonb-only change of a non-NULL geom invalidate nothing. Fires on ANY write path (trigger, not app-code) — see the migration 242, 245, 249 and 251 headers.';

-- ============================================================================
-- DOWN — comments-only per project convention (migrate.js runs the whole file in one transaction
-- and does NOT honour -- UP / -- DOWN markers; see tasks/lessons.md). ROLLBACK ORDER MATTERS:
--   (1) after Commit 2 lands, FIRST revert Commit 2's codegen + descriptor (the loader statement
--       calls public.parcels_geom_materially_changed);
--   (2) restore migration 249's trg_parcels_invalidate_on_geom_change() body + COMMENT verbatim
--       (copy the UP section of migrations/249_parcels_stamp_geom_invalidation.sql);
--   (3) DROP FUNCTION public.parcels_geom_materially_changed(geometry, geometry);
--   (4) DELETE FROM logic_variables WHERE variable_key = 'parcels_geom_change_tolerance_deg';
--       (this also deletes the row if a seed run created it first — intended).
-- Rollback restores no column the 251 body kept; a rollback only re-widens future invalidation.
-- ============================================================================
