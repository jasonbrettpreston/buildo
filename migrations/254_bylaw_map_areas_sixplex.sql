-- 254 (numbered 2026-10-08; 252 = coa_notice_variances lane, 253 = coa_applications.zoning_designation):
-- by-law map areas (600.60 Sixplex Overlay, by-law 654-2025 Diagrams 1/2) + parcels sixplex membership.
--
-- WHY THIS EXISTS
-- Nothing in the repo holds 600.60 map membership (McBylaw Phase 2 inputs research 2026-10-07, part A).
-- Two sources give one verdict:
--   * city_gis_layer80 -- the City GIS layer "Zoning Sixplex Permission"
--     (gis.toronto.ca/arcgis/rest/services/cot_geospatial11/FeatureServer/80): 18 features
--     (returnCountOnly = 18, measured 2026-10-08; "80" is the LAYER ID, not a count -- Spec 69 R-10
--     correction). CH600_AREA_TYPE 4 = Toronto and East York Community Council area (16 polygons; the
--     main one carries 813 holes), 3 = Scarborough North (Ward 23, 2 polygons). Licence: none stated
--     (Q-A1, open) -- the rows are loaded only from a pinned seed, never live.
--   * ckan_wards_2018 -- the CKAN city-wards subset {04,09,10,11,12,13,14,19,23} (OGL-Toronto), the
--     own boundary of the by-law text (Diagram 1 = the TEY Community Council area).
-- load_bylaw_map_areas (INGESTOR, new) writes bylaw_map_areas from the seed; enrich_parcels writes the
-- three parcels columns as one overlay pass (Spec 65 pattern), through its own IS DISTINCT FROM guard.
--
-- ONE seed file (scripts/seeds/bylaw/maps/600_60.geojson) carries BOTH sources, so every row of a load
-- carries the same seed_sha256 (the separate plan-listed tey_wards_2018.geojson is merged into it: one pin,
-- one staleness stamp).
--
-- No subdivided companion TABLE here: the planned ST_Subdivide (the 15-minute research join was an
-- UNINDEXED CTE literal joined polygon-to-polygon against the 31K-vertex area) is done by the consumer
-- at load — the enrich_parcels pass builds an ON COMMIT DROP temp table of ST_Subdivide parts with its
-- own GiST index and tests the ST_PointOnSurface of each parcel against it. No trigger, no derived table.
--
-- Basis definitions (point = ST_PointOnSurface(parcels.geom); GIS = city_gis_layer80 rows, holes kept;
-- hull = the GIS polygons with their holes filled; wards = ckan_wards_2018 rows):
--   gis_in            point in GIS                                  -> in_sixplex_area TRUE, area_type set
--   gis_out_ward_out  point in neither GIS nor wards                -> FALSE
--   gis_hole_ward_in  point in wards, not in GIS, inside the hull   -> NULL (R-10b / Q-A2 open)
--   gis_edge_ward_in  point in wards, not in GIS, outside the hull  -> NULL (Q-A2 open)
--   straddle          RESERVED: needs an area-share threshold (research bbox upper bound 6,039 lots);
--                     never emitted until that threshold is ruled  -> NULL
--   no_geom           parcels.geom IS NULL                          -> NULL
-- The consistency CHECK below enforces the value/basis pairing, so the stated invariant is DDL, not prose.
--
-- parcels: three nullable ADD COLUMNs with no DEFAULT -- catalog-only (no rewrite), no backfill UPDATE
-- (the 496,535 rows are populated by the first enrich_parcels run). No new index on parcels.
-- trg_parcels_invalidate_on_geom_change() is re-created from migration 251 VERBATIM plus three lines:
-- a material geom change also NULLs the three membership columns (it already NULLs zoning_enriched_at,
-- which re-scopes the parcel for pass 1, so the value is recomputed on the next run; the NULL keeps a
-- stale membership from being read meanwhile). The trigger itself (242) is not re-created.
--
-- GiST on bylaw_map_areas is created non-CONCURRENTLY: the table is new and empty at creation.
--
-- SPEC LINK: docs/specs/01-pipeline/58_source_zoning_bylaw.md (second INGESTOR load_bylaw_map_areas -- PROPOSED)
-- SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md (sixplex overlay pass -- PROPOSED)
-- SPEC LINK: docs/specs/01-pipeline/69_mcbylaw_policy.md §3 (R-10, R-10b)
-- SPEC LINK: .cursor/wf1_mcbylaw_phase2_inputs_active_task.md (A2)

-- ============================================================================
-- UP
-- ============================================================================

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '10min';

CREATE TABLE IF NOT EXISTS bylaw_map_areas (
  area_key           TEXT PRIMARY KEY,
  map_code           TEXT NOT NULL CHECK (map_code IN ('600.60')),
  source             TEXT NOT NULL CHECK (source IN ('city_gis_layer80', 'ckan_wards_2018')),
  source_feature_id  INTEGER NOT NULL,  -- FK-EXEMPT: an external source id (GIS OBJECTID / CKAN ward AREA_ID), not a table key
  area_type          SMALLINT NOT NULL CHECK (area_type IN (3, 4)),
  area_name          TEXT NOT NULL,
  seed_sha256        CHAR(64) NOT NULL CHECK (seed_sha256 ~ '^[0-9a-f]{64}$'),
  geom               geometry(MultiPolygon, 4326) NOT NULL,
  CONSTRAINT bylaw_map_areas_source_feature_uniq UNIQUE (source, source_feature_id),
  CONSTRAINT bylaw_map_areas_key_shape CHECK (area_key = source || ':' || source_feature_id::text)
);

CREATE INDEX IF NOT EXISTS idx_bylaw_map_areas_geom_gist ON bylaw_map_areas USING GIST (geom);

-- RLS: ENABLE with zero policies (Spec 114 §4 Class B, default deny); the pipeline role bypasses RLS (mig 252 precedent).
ALTER TABLE bylaw_map_areas ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE bylaw_map_areas IS
  'By-law map areas (Spec 58 second INGESTOR load_bylaw_map_areas; McBylaw Phase 2 inputs A). map_code 600.60 = the Sixplex Overlay (by-law 654-2025 Diagrams 1/2). Two sources: city_gis_layer80 (City GIS FeatureServer layer 80, 18 features, holes kept; licence unstated, Q-A1) and ckan_wards_2018 (the CKAN city-wards TEY subset + ward 23, OGL-Toronto). Loaded only from the pinned seed scripts/seeds/bylaw/maps/ (url + sha256 in its manifest.json), never live.';
COMMENT ON COLUMN bylaw_map_areas.area_key IS 'source || '':'' || source_feature_id (the INGESTOR key).';
COMMENT ON COLUMN bylaw_map_areas.area_type IS 'CH600_AREA_TYPE: 4 = Toronto and East York Community Council area (Diagram 1), 3 = Scarborough North / Ward 23 (Diagram 2). For a ward row: the diagram the ward belongs to.';
COMMENT ON COLUMN bylaw_map_areas.seed_sha256 IS 'sha256 of the ONE seed file the load read (every row of a load carries the same value; it is the enrich_parcels staleness stamp: a new seed forces the overlay pass full).';

ALTER TABLE parcels ADD COLUMN IF NOT EXISTS in_sixplex_area BOOLEAN NULL;
ALTER TABLE parcels ADD COLUMN IF NOT EXISTS sixplex_area_type SMALLINT NULL;
ALTER TABLE parcels ADD COLUMN IF NOT EXISTS sixplex_membership_basis TEXT NULL;

ALTER TABLE parcels DROP CONSTRAINT IF EXISTS parcels_sixplex_membership_basis_check;
ALTER TABLE parcels ADD CONSTRAINT parcels_sixplex_membership_basis_check CHECK (
  sixplex_membership_basis IS NULL OR sixplex_membership_basis IN (
    'gis_in', 'gis_out_ward_out', 'gis_hole_ward_in', 'gis_edge_ward_in', 'straddle', 'no_geom'
  )
) NOT VALID;

ALTER TABLE parcels DROP CONSTRAINT IF EXISTS parcels_sixplex_membership_consistency;
ALTER TABLE parcels ADD CONSTRAINT parcels_sixplex_membership_consistency CHECK (
  (sixplex_membership_basis IS NULL AND in_sixplex_area IS NULL AND sixplex_area_type IS NULL)
  OR (sixplex_membership_basis = 'gis_in' AND in_sixplex_area IS TRUE AND sixplex_area_type IN (3, 4))
  OR (sixplex_membership_basis = 'gis_out_ward_out' AND in_sixplex_area IS FALSE AND sixplex_area_type IS NULL)
  OR (sixplex_membership_basis IN ('gis_hole_ward_in', 'gis_edge_ward_in', 'straddle', 'no_geom')
      AND in_sixplex_area IS NULL AND sixplex_area_type IS NULL)
) NOT VALID;
-- NOT VALID (both constraints): every existing row is NULL (the columns are new), so a VALIDATE would
-- scan 496K rows to prove nothing; every new write is checked.

COMMENT ON COLUMN parcels.in_sixplex_area IS
  'Spec 65 sixplex overlay pass (600.60, by-law 654-2025): TRUE only when sixplex_membership_basis = gis_in; FALSE only for gis_out_ward_out; NULL for every disputed or unevaluable basis (holes / edge = Q-A2 open, straddle, no_geom) and before the first enrich_parcels run. Never guessed.';
COMMENT ON COLUMN parcels.sixplex_area_type IS 'bylaw_map_areas.area_type of the GIS area containing the parcel point (4 TEY, 3 Scarborough North); NULL unless basis gis_in.';
COMMENT ON COLUMN parcels.sixplex_membership_basis IS 'Closed: gis_in · gis_out_ward_out · gis_hole_ward_in · gis_edge_ward_in · straddle · no_geom. Point-on-surface verdict of the City GIS layer against the CKAN ward union.';

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
    -- Migration 254 — the sixplex membership arm (enrich_parcels pass 1, re-scoped by the
    -- zoning_enriched_at NULL above; the NULL keeps a stale membership from being read meanwhile).
    NEW.in_sixplex_area := NULL;
    NEW.sixplex_area_type := NULL;
    NEW.sixplex_membership_basis := NULL;
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
  'Phase B B2 (migration 242) + P1 (migration 245) + LDG-10 O2-A (migration 249) + WF3 geom drift (migration 251) + sixplex membership (migration 254): on a MATERIAL geom change (public.parcels_geom_materially_changed — tolerance logic variable parcels_geom_change_tolerance_deg) nulls parcels.massing_enriched_at, zoning_enriched_at, centroid_lat, centroid_lng, in_sixplex_area, sixplex_area_type, sixplex_membership_basis and the three *_dataset_version_when_enriched stamps (ravine, heritage, centreline); when geom is NULL on both sides and only the raw geometry jsonb changed, nulls the first seven and keeps the stamps. Sub-tolerance publisher jitter, ring rotation and a raw-jsonb-only change of a non-NULL geom invalidate nothing. Fires on ANY write path (trigger, not app-code) — see the migration 242, 245, 249, 251 and 254 headers.';

-- ============================================================================
-- DOWN -- comments-only per project convention (migrate.js runs the whole file in one
-- transaction and does NOT honour -- UP / -- DOWN markers; see tasks/lessons.md).
-- To roll back: re-apply the migration 251 CREATE OR REPLACE FUNCTION trg_parcels_invalidate_on_geom_change()
-- (and its COMMENT) verbatim, then:
-- ============================================================================
-- ALTER TABLE parcels DROP CONSTRAINT IF EXISTS parcels_sixplex_membership_consistency;
-- ALTER TABLE parcels DROP CONSTRAINT IF EXISTS parcels_sixplex_membership_basis_check;
-- ALTER TABLE parcels DROP COLUMN IF EXISTS sixplex_membership_basis;  -- ALLOW-DESTRUCTIVE
-- ALTER TABLE parcels DROP COLUMN IF EXISTS sixplex_area_type;  -- ALLOW-DESTRUCTIVE
-- ALTER TABLE parcels DROP COLUMN IF EXISTS in_sixplex_area;  -- ALLOW-DESTRUCTIVE
-- DROP TABLE IF EXISTS bylaw_map_areas;  -- ALLOW-DESTRUCTIVE
