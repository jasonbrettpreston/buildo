-- 249: LDG-10 class 4 / O2-A (Spec 122 §6.4, §6.6.1) — the DATASET-VERSION STAMP invalidator.
-- Adds a fifth arm to the geometry-change trigger FUNCTION from migrations 242/245 so the three
-- lineage stamps `parcels.ravine_dataset_version_when_enriched`,
-- `heritage_dataset_version_when_enriched` and `centreline_dataset_version_when_enriched` are
-- invalidated (NULLed) on EVERY write path that actually changes a parcel's `geom` — not only
-- inside load_parcels' own UPSERT.
--
-- WHY THIS EXISTS (review_followups "P1 agent, reviewing migration 245", HIGH; LDG-10 plan O2 → A,
-- operator 2026-10-03)
-- The three stamps record which producer dataset version a parcel was last enriched against.
-- The enrichers re-scope a parcel only when its stamp differs from the producer's current version
-- (`enrich-ravines.js:130` / `enrich-heritage.js:120` / `enrich-centreline.js:75`, all
-- `… IS DISTINCT FROM $n`). Today the stamps are invalidated ONLY by load_parcels'
-- `set_null_on_change_of: geom` rows (DEC-FENCE2, #418; descriptor `outputs.invalidates`, codegen
-- `scripts/lib/step/write.js`) — app code on ONE write path. Any other write that moves a parcel
-- (an admin tool, an ad-hoc fix, a future step) leaves the stamps asserting an enrichment computed
-- against the OLD geometry, and the enrichers never revisit it. Spec 122 §6.4 calls loader-only
-- invalidation a live defect; it is the same class migration 245 closed for the centroid.
--
-- WHY A FIFTH ARM ON THE SAME FUNCTION, AND NOT A NEW TRIGGER
-- Same event (`BEFORE UPDATE OF geom, geometry` with the internal `IS DISTINCT FROM` guard), same
-- reasoning as the 245 header: one function, one guard, one place to look. The trigger is NOT
-- recreated — `CREATE OR REPLACE FUNCTION` swaps the body atomically, so the trigger is never absent.
-- (A write already in flight when 249 commits may still run the previous four-arm body; for it only
-- the three stamp NULLs are missing, and load_parcels — the only geom writer today — NULLs them
-- itself.) All four existing arms are kept verbatim.
--
-- ⚠️ THE ARM SITS INSIDE THE `IS DISTINCT FROM` GUARD (TRAP ② of the 245 test). load-parcels' UPSERT
-- lists geom/geometry in its SET clause whenever ANY tracked field moved; outside the guard every
-- address-only reload would NULL ~496K valid stamps and force full re-enrichment of three steps.
--
-- ⚠️ THE STAMP ARM WATCHES `geom` ONLY — a NESTED guard, not the outer `geom OR geometry` one.
-- All three enrichers read only `p.geom` (enrich-ravines.js:127-139, enrich-heritage.js:125-147,
-- enrich-centreline.js:84-100), so a change to the raw `geometry` jsonb alone never changes their
-- input. load_parcels' DEC-FENCE2 deliberately follows the derived `geom` (commit f54dcf97,
-- Severity HIGH), locked by `load-parcels-geom-guard.db.test.ts` T-g: "raw geometry differs but the
-- derived geom is identical — … all 3 stamps KEPT". An arm on the outer guard would NULL the stamps
-- in exactly that case and turn T-g red (found by the plan-altitude Integration seat). The four
-- 242/245 arms stay on the outer guard, unchanged.
--
-- load_parcels' own `set_null_on_change_of` arms are KEPT (the #418 fence). With the nested guard
-- the trigger and the loader agree exactly: both NULL the stamps iff `geom` changes. The loader
-- arms stay locked statically by the rendered-SQL half (A) of `load-parcels-ravine-invalidation.db.test.ts`;
-- its geom-change behavioural case (B) is also satisfied by this trigger once 249 is applied.
--
-- MEASURED BEFORE WRITING (local dev DB 127.0.0.1:54322 `postgres`, 248 migrations, 2026-10-04,
-- BEGIN READ ONLY):
--   · parcels has exactly ONE non-internal trigger, `trg_parcels_geom_invalidation` (tgenabled 'O',
--     BEFORE UPDATE OF geom, geometry); its function carries the massing / zoning / centroid arms
--     and NO stamp arm; no other function in the DB references `*_dataset_version_when_enriched`.
--   · population: 496,510 parcels, 496,509 with geom. Stamps non-NULL: ravine 496,509, heritage
--     496,509, centreline 480,461 (16,049 NULL — 16,048 with geom; they are pre-existing NULLs
--     that enrich_centreline already re-scopes, not caused by any trigger).
--   · stale vs the producer's latest completed run (ravines run 2174, heritage 2175, centreline
--     2248): ravine 0, heritage 0, centreline 16,048 (exactly the NULL set above). The stamps are
--     CURRENT — there is no debt to repay.
--   · invalidation reach of ONE geometry change: that parcel's 3 stamps (plus the 4 existing arms).
--     Recent load_parcels runs (2161, 2173, 2199, 2200, 2239, 2240) wrote 0 rows, so the steady-state
--     per-run cost is 0 parcels; the Reality-Check seat records the historical churn.
--
-- NO BACKFILL / NO UPDATE OF THE 496,509 ROWS, DELIBERATELY: the stamps are current (0 stale on
-- ravine/heritage; centreline's 16,048 are already NULL). The arm only acts on FUTURE geometry
-- changes. A blanket NULL would force three full re-enrichments to fix nothing. (The 237K+-row
-- UPDATE strategy in CLAUDE.md therefore does not apply: this migration updates no rows.)
--
-- FK impact: none — no columns, constraints or references are added. One plpgsql function body
-- and its COMMENT are replaced. Migrations are in no descriptor's `fingerprint_inputs`
-- (LDG-10 F11), so this moves no golden and needs no recapture.
--
-- Re-runnable: `CREATE OR REPLACE FUNCTION` + `COMMENT ON` are idempotent; re-applying writes the
-- same body. `migrate.js` records the filename once in `schema_migrations`.
--
-- SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.4, §6.6, §6.6.1
-- SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (load_parcels / enrich_ravines / enrich_heritage / enrich_centreline)
-- SPEC LINK: migrations/245_parcels_centroid_geom_invalidation.sql (the four arms this extends)
-- Plan: .cursor/wf1_ldg10_pins_invalidation_active_task.md Step 1 (O2-A); .cursor/fleet2-assembly/ASSEMBLY.md 4.3/4.4 (C8 → own commit)
-- Red-first proof: src/tests/db/migration-249-stamp-invalidation.db.test.ts

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
    -- Migration 249 — the dataset-version stamp arm (LDG-10 O2-A), NESTED on `geom` only: the
    -- enrichers read p.geom, and load_parcels' DEC-FENCE2 keeps the stamps when only the raw
    -- geometry jsonb changes (f54dcf97; load-parcels-geom-guard T-g). NULL ⇒ each enricher's
    -- `… IS DISTINCT FROM <producer version>` scope re-enriches the parcel on its next run,
    -- whichever write path moved geom. load_parcels' set_null_on_change_of arms stay (#418).
    IF NEW.geom IS DISTINCT FROM OLD.geom THEN
      NEW.ravine_dataset_version_when_enriched := NULL;
      NEW.heritage_dataset_version_when_enriched := NULL;
      NEW.centreline_dataset_version_when_enriched := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- The trigger itself is UNCHANGED and is deliberately NOT recreated here (see the 245 header):
-- migration 242's `CREATE TRIGGER trg_parcels_geom_invalidation BEFORE UPDATE OF geom, geometry
-- ON parcels FOR EACH ROW EXECUTE FUNCTION trg_parcels_invalidate_on_geom_change()` already binds
-- this function to the right event.

COMMENT ON FUNCTION trg_parcels_invalidate_on_geom_change() IS
  'Phase B B2 (migration 242) + P1 (migration 245) + LDG-10 O2-A (migration 249): nulls parcels.massing_enriched_at, zoning_enriched_at, centroid_lat and centroid_lng whenever geom or geometry actually changes, and the three *_dataset_version_when_enriched stamps (ravine, heritage, centreline) whenever geom itself changes (the enrichers read geom; DEC-FENCE2 keeps the stamps on a geometry-jsonb-only change), so the D1'' massing gate, the pass-1 zoning gate, compute_centroids and the three enrichers all re-scope the parcel on their next incremental run. Guarded by IS DISTINCT FROM so an address-only reload (which re-lists geom in its SET clause) is a no-op. Fires on ANY write path (trigger, not app-code) — see the migration 242, 245 and 249 headers.';

-- ============================================================================
-- DOWN — comments-only per project convention (migrate.js runs the whole file in one
-- transaction and does NOT honour -- UP / -- DOWN markers; see tasks/lessons.md).
-- Restores migration 245's function body and COMMENT verbatim; the trigger is untouched by
-- both directions. Rollback does NOT restore any stamp this arm already NULLed — those parcels
-- simply re-enrich on the next run of each enricher (a NULL stamp is always re-scoped).
-- Pair a rollback with reverting the FLEET-2 `by:"trigger"` re-points on enrich_ravines /
-- enrich_heritage / enrich_centreline (ASSEMBLY 1.20); otherwise those descriptors would claim a
-- trigger invalidation that no longer exists while the trigger-presence probe still passes.
-- ============================================================================
-- CREATE OR REPLACE FUNCTION trg_parcels_invalidate_on_geom_change()
-- RETURNS TRIGGER AS $$
-- BEGIN
--   IF (NEW.geom IS DISTINCT FROM OLD.geom) OR (NEW.geometry IS DISTINCT FROM OLD.geometry) THEN
--     NEW.massing_enriched_at := NULL;
--     NEW.zoning_enriched_at := NULL;
--     -- Migration 245 — the centroid arm. Geometry-derived exactly like the two watermarks above,
--     -- and the join key for link-parcels.js:415-423's Tier-3 centroid-proximity fallback.
--     -- NULL ⇒ compute-centroids.js's `centroid_lat IS NULL` predicate re-scopes the parcel on its
--     -- next run and recomputes it from the NEW geometry.
--     NEW.centroid_lat := NULL;
--     NEW.centroid_lng := NULL;
--   END IF;
--   RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;
--
-- COMMENT ON FUNCTION trg_parcels_invalidate_on_geom_change() IS
--   'Phase B B2 (migration 242) + P1 (migration 245): nulls parcels.massing_enriched_at, zoning_enriched_at, centroid_lat and centroid_lng whenever geom or geometry actually changes, so the D1'' massing gate, the pass-1 zoning gate and compute_centroids all re-scope the parcel on their next incremental run. Guarded by IS DISTINCT FROM so an address-only reload (which re-lists geom in its SET clause) is a no-op. Fires on ANY write path (trigger, not app-code) — see the migration 242 and 245 headers.';
