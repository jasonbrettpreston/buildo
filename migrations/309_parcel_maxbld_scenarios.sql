-- 309 (MB-31 (e) / MB-35; the 287 draft, numbered at the next free migration): parcel_maxbld_scenarios, the Layer 3 results table of
-- compute_maxbld_scenarios (Spec 78 step identity; Spec 131 LC-15; M-377, M-384, R-KS), and parcel_maxbld_population, the cohort part
-- of the step's population (operator "a yes" 2026-11-11, D-3 a: the step reads the golden-25 setting; this table holds the
-- chosen cohort, keyed by parcels.id, filled by its own migration).
--
-- One scenarios row per (parcel, building type, catalogue row): the evaluator's status, value, reason, flags and TRACE, plus the shas of
-- the catalogue, switchboard and settings that produced it. Long format: a new catalogue row needs no migration (M-377). Column names
-- are the 287 draft's (MB-93's internal preview producer and compute_parcel_cost_estimates read them).
-- D-1 a (operator "a yes" 2026-11-11): a number exists exactly on a computed row, both directions, except the one declared words-only
-- row: building-types.json gain.reasons_field `gain_reasons` (MB-27 increment 4, D-2 a: status computed, the words in flags, no value).
-- WRITTEN, NOT APPLIED here: the MB-35 night applies it after the increment-4 Layer 2 night and a dump (--only=309 --dry-run first).
-- No consumer reads these tables for customers (admin-only internal preview, MB-93).
--
-- SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md (Phase-5 step identity)
-- SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md (M-61, M-72, M-377, M-378, M-384)

-- UP
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '10min';

CREATE TABLE IF NOT EXISTS parcel_maxbld_scenarios (
  parcel_id        INTEGER NOT NULL REFERENCES parcels(id) ON DELETE CASCADE,
  building_type    TEXT NOT NULL,
  field_id         TEXT NOT NULL,
  increment        TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('computed', 'unlimited', 'unregulated', 'not_applicable', 'not_buildable', 'not_evaluated',
                                                    'permitted', 'not_permitted', 'not_modelled')),
  value            NUMERIC NULL,
  unit             TEXT NULL,
  reason           TEXT NULL,
  flags            TEXT[] NOT NULL DEFAULT '{}',
  trace            JSONB NOT NULL,
  content_sha      TEXT NOT NULL,
  switches         JSONB NOT NULL,
  catalogue_sha    TEXT NOT NULL,
  switchboard_sha  TEXT NOT NULL,
  settings_sha     TEXT NOT NULL,
  layer2_table_version TEXT NOT NULL,
  computed_at      TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (parcel_id, building_type, field_id),
  CONSTRAINT parcel_maxbld_scenarios_value_iff_computed CHECK ((status = 'computed') = (value IS NOT NULL) OR (field_id = 'gain_reasons' AND status = 'computed' AND value IS NULL)),
  CONSTRAINT parcel_maxbld_scenarios_reason_iff_undecided CHECK ((status IN ('not_evaluated', 'not_modelled', 'not_permitted')) = (reason IS NOT NULL) OR status IN ('permitted', 'computed', 'unlimited', 'unregulated', 'not_applicable', 'not_buildable'))
);

CREATE INDEX IF NOT EXISTS idx_parcel_maxbld_scenarios_field ON parcel_maxbld_scenarios (building_type, field_id, status);

CREATE TABLE IF NOT EXISTS parcel_maxbld_population (
  parcel_id  INTEGER PRIMARY KEY REFERENCES parcels(id) ON DELETE CASCADE,
  cohort     TEXT NOT NULL,
  added_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Read 6 (the street-scoped abutment rows of MB-31 plan section 22) and read 5 look a lot's frontage street up per population lot; without
-- an index every lot scans parcels (measured read-only 2026-11-11 on the golden 25: about 3 s a lot, about 98 min for the 1,921-lot
-- cohort, over the step's 90 min step_timeout). Partial: a null street never matches (plain equality). About 5 to 16 MB on parcels.
CREATE INDEX IF NOT EXISTS idx_parcels_primary_frontage_street_name ON parcels (primary_frontage_street_name) WHERE primary_frontage_street_name IS NOT NULL;

-- RLS: ENABLE with zero policies (Spec 114 Class B, default deny); the pipeline role bypasses RLS (R-CT: the same file as the tables).
ALTER TABLE parcel_maxbld_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE parcel_maxbld_population ENABLE ROW LEVEL SECURITY;

-- DOWN -- manual rollback only (lessons.md: migrate.js executes every uncommented line).
-- DROP INDEX IF EXISTS idx_parcels_primary_frontage_street_name;
-- DROP TABLE IF EXISTS parcel_maxbld_population;
-- DROP TABLE IF EXISTS parcel_maxbld_scenarios;
