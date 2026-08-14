-- 242: Phase B B2 — geometry-change invalidation fence for parcels.massing_enriched_at (+
-- zoning_enriched_at), implemented as a TRIGGER (not app code).
--
-- WHY THIS EXISTS
-- D1' gave enrich-parcels.js a massing watermark (migration 240) so its incremental pass can skip
-- parcels whose massing linkage hasn't moved. But nothing invalidated that watermark (or the
-- pre-existing zoning_enriched_at watermark) when the parcel's OWN geometry changes — a geometry
-- move can put the parcel under a DIFFERENT massing join or a NEW zoning by-law area entirely, so a
-- stale stamp would silently hide it from BOTH incremental passes forever — the exact
-- silent-staleness class D1'/D4' exist to close.
--
-- load-parcels.js's existing ON CONFLICT UPSERT already nulls the ravine/heritage/centreline
-- lineage stamps on a geometry change (DEC-FENCE2, #418) — but that CASE WHEN logic lives INSIDE
-- one specific UPSERT statement and only fires for writes that go through it. A TRIGGER closes the
-- gap for every write path (a direct UPDATE, an admin tool, a future loader) — the massing/zoning
-- watermarks are exactly as safety-critical as the three it already covers, and the same-shaped gap
-- (a bare UPDATE bypassing the loader entirely) is the one the Phase B B2 red suite exercises.
--
-- SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md §4 (max-build / massing passes)
-- SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (enrich_parcels step)
--
-- Scoped to `UPDATE OF geom, geometry` (fires only when either column is in the UPDATE's SET list —
-- the Postgres "UPDATE OF" trigger contract) with an internal IS DISTINCT FROM guard so a SET that
-- merely re-assigns the same value (load-parcels.js's UPSERT always lists both columns whenever ANY
-- tracked field changed, not just geometry) is a no-op, mirroring the existing DEC-FENCE2 pattern.
-- INSERTs are untouched: a new parcel already lands with NULL watermarks (no DEFAULT, mig 165/240).

-- ============================================================================
-- UP
-- ============================================================================

CREATE OR REPLACE FUNCTION trg_parcels_invalidate_on_geom_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.geom IS DISTINCT FROM OLD.geom) OR (NEW.geometry IS DISTINCT FROM OLD.geometry) THEN
    NEW.massing_enriched_at := NULL;
    NEW.zoning_enriched_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_parcels_geom_invalidation ON parcels;

CREATE TRIGGER trg_parcels_geom_invalidation
  BEFORE UPDATE OF geom, geometry ON parcels
  FOR EACH ROW
  EXECUTE FUNCTION trg_parcels_invalidate_on_geom_change();

COMMENT ON FUNCTION trg_parcels_invalidate_on_geom_change() IS
  'Phase B B2 (migration 242): nulls parcels.massing_enriched_at and zoning_enriched_at whenever geom or geometry actually changes, so the D1'' massing gate and the pass-1 zoning gate both re-scope the parcel on their next incremental run. Fires on ANY write path (trigger, not app-code) — see migration 242 header.';

-- ============================================================================
-- DOWN — comments-only per project convention (migrate.js runs the whole file in one
-- transaction and does NOT honour -- UP / -- DOWN markers; see tasks/lessons.md).
-- ============================================================================
-- DROP TRIGGER IF EXISTS trg_parcels_geom_invalidation ON parcels;
-- DROP FUNCTION IF EXISTS trg_parcels_invalidate_on_geom_change();
