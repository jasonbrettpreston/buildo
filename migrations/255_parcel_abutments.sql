-- 255 (numbered 2026-10-08; 253 = coa_applications.zoning_designation, 254 = bylaw_map_areas + parcels sixplex):
-- parcel_abutments -- the LINK junction of abutting lots (McBylaw Phase 2 inputs B; Spec 130).
--
-- WHY THIS EXISTS
-- Three Phase 3 K9 structural causes need the lots beside a lot: front-yard averaging
-- (10.5.40.70(1)(A)/(B), 195,264 cells), adjacent-lot-fronts-flanking-street (28,560) and
-- one-abutting-building (9,468). One junction serves all three. The step (link_parcel_abutments)
-- stores OBSERVATIONS only; applicability (none / one / two / ambiguous) is derived on read by McBylaw
-- from these rows and logic variables (compute = just compute; tunables in logic_variables).
--
-- One row per ORDERED pair (both (a,b) and (b,a) are stored): the attributes are the NEIGHBOUR's,
-- seen from the subject (neighbour building distance to the subject lot, the neighbour's estimated
-- front setback). Symmetry of the pair set is a check of the step, not a constraint.
--
-- front_setback_est_m = dist(neighbour footprint, neighbour frontage centreline)
--                     - dist(neighbour lot,       neighbour frontage centreline)   (EPSG 2952 metres)
-- (method v2, research 2026-10-07: 2/9 within 0.5 m on the CoA-notice oracle; fidelity `differs` --
-- an outline is not a main wall, 800.50). Present only when est_status = 'estimated' (CHECK below).
--
-- Expected size about 1.0 M rows (2.3 pairs/lot x 440 K, inferred); measured at the first capture.
-- New, empty table: indexes are created non-CONCURRENTLY.
--
-- SPEC LINK: docs/specs/01-pipeline/130_link_parcel_abutments.md
-- SPEC LINK: .cursor/wf1_mcbylaw_phase2_inputs_active_task.md (B1)

-- ============================================================================
-- UP
-- ============================================================================

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '10min';

CREATE TABLE IF NOT EXISTS parcel_abutments (
  parcel_id              INTEGER NOT NULL REFERENCES parcels(id) ON DELETE CASCADE,
  neighbour_id           INTEGER NOT NULL REFERENCES parcels(id) ON DELETE CASCADE,
  shared_len_m           NUMERIC(10, 2) NOT NULL CHECK (shared_len_m >= 0),
  same_frontage_street   BOOLEAN NULL,
  neighbour_residential  BOOLEAN NOT NULL,
  neighbour_building_id  INTEGER NULL,  -- FK-EXEMPT: an observation (building_footprints.id at link time); a FK would block footprint reloads, and the next link run rewrites it
  bldg_to_subject_m      NUMERIC(10, 2) NULL CHECK (bldg_to_subject_m IS NULL OR bldg_to_subject_m >= 0),
  front_setback_est_m    NUMERIC(10, 2) NULL,
  est_status             TEXT NOT NULL CHECK (est_status IN (
                           'estimated', 'no_building', 'no_frontage_street', 'street_not_found',
                           'estimate_negative', 'estimate_out_of_bounds')),
  linked_at              TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (parcel_id, neighbour_id),
  CONSTRAINT parcel_abutments_no_self CHECK (parcel_id <> neighbour_id),
  CONSTRAINT parcel_abutments_estimate_iff_estimated CHECK (
    (est_status = 'estimated') = (front_setback_est_m IS NOT NULL)
  ),
  CONSTRAINT parcel_abutments_building_status CHECK (
    est_status = 'no_building' OR neighbour_building_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_parcel_abutments_neighbour ON parcel_abutments (neighbour_id);

-- RLS: ENABLE with zero policies (Spec 114 §4 Class B, default deny); the pipeline role bypasses RLS (mig 252 precedent).
ALTER TABLE parcel_abutments ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE parcel_abutments IS
  'Spec 130 link_parcel_abutments (LINK): one row per ORDERED pair of abutting parcels (shared boundary length >= logic variable abut_min_shared_len_m; point-touch excluded). Observations only: front-yard-averaging applicability (10.5.40.70(1)) is derived on read by McBylaw. front_setback_est_m is an advisory estimate (fidelity differs, Spec 69 M-26).';
COMMENT ON COLUMN parcel_abutments.shared_len_m IS 'Length (m, EPSG 2952) of the shared boundary between the two lots.';
COMMENT ON COLUMN parcel_abutments.same_frontage_street IS 'parcels.primary_frontage_street_name equal for subject and neighbour; NULL when either is NULL.';
COMMENT ON COLUMN parcel_abutments.neighbour_residential IS 'Neighbour parcels.zoning_class in the Residential Zone category (R, RD, RS, RT, RM).';
COMMENT ON COLUMN parcel_abutments.bldg_to_subject_m IS 'Distance (m, EPSG 2952) from the neighbour primary building footprint to the subject lot; the 15.0 m test of 10.5.40.70(1) is applied on read (logic variable fya_neighbour_max_dist_m).';
COMMENT ON COLUMN parcel_abutments.front_setback_est_m IS 'Estimated neighbour front yard setback (m): dist(footprint, frontage centreline) - dist(lot, frontage centreline). Advisory (fidelity differs); NULL unless est_status = estimated.';
COMMENT ON COLUMN parcel_abutments.est_status IS 'Closed: estimated · no_building · no_frontage_street · street_not_found · estimate_negative · estimate_out_of_bounds.';

-- The invalidator (Spec 122 §6.4, by "trigger"): a MATERIAL parcel geometry change (the migration 251
-- predicate public.parcels_geom_materially_changed) deletes every pair the parcel is part of, in both
-- orientations. The parcel then has no abutment row, so the next link_parcel_abutments run, which
-- re-derives every pair (full rescan), re-creates the pairs that still abut (it emits both orientations). A SEPARATE AFTER trigger: the migration 242-254
-- BEFORE trigger function trg_parcels_invalidate_on_geom_change() is not touched.
CREATE OR REPLACE FUNCTION trg_parcels_invalidate_abutments()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM parcel_abutments WHERE parcel_id = NEW.id OR neighbour_id = NEW.id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_parcels_abutments_invalidation ON parcels;
CREATE TRIGGER trg_parcels_abutments_invalidation
  AFTER UPDATE OF geom ON parcels
  FOR EACH ROW
  WHEN (public.parcels_geom_materially_changed(OLD.geom, NEW.geom))
  EXECUTE FUNCTION trg_parcels_invalidate_abutments();

COMMENT ON FUNCTION trg_parcels_invalidate_abutments() IS
  'Migration 255 (Spec 130): on a MATERIAL parcels.geom change (public.parcels_geom_materially_changed, tolerance parcels_geom_change_tolerance_deg) deletes the parcel''s parcel_abutments rows in both orientations, so the next link_parcel_abutments run, which re-derives every pair, re-creates those that still abut. Fires on any write path.';

-- ============================================================================
-- DOWN -- comments-only per project convention (migrate.js runs the whole file in one
-- transaction and does NOT honour -- UP / -- DOWN markers; see tasks/lessons.md).
-- ============================================================================
-- DROP TABLE IF EXISTS parcel_abutments;  -- ALLOW-DESTRUCTIVE
-- DROP TRIGGER IF EXISTS trg_parcels_abutments_invalidation ON parcels;
-- DROP FUNCTION IF EXISTS trg_parcels_invalidate_abutments();
