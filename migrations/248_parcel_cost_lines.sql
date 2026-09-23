-- Migration 248: parcel_cost_lines — the editable half of the 13-line cost catalogue (Spec 88 §2.3).
--
-- SPEC LINK: docs/specs/01-pipeline/88_parcel_cost_model.md §2.3 (line catalogue) + §2.8 (admin editing)
--   + docs/specs/01-pipeline/124_step_standard_policy.md R-AU (declared INTERIM state, closing row)
--
-- Batch-2 row 2.5 (Fold A2): PARCEL_COST_LINES structural fields (areaField, scalar, scalarKind,
-- isCoaLine) — the column bindings the require-time invariant + ParcelCostTool.tsx key-lock depend
-- on — stay FROZEN in scripts/lib/parcel-cost.js by design; they are never admin-editable. This
-- table holds ONLY the fields an operator may tune: which archetype_cost_rates row a line prices
-- against, its base confidence band, and (for the 3 fit-gated lines) the permission vocabulary that
-- gates it. readCostContract merges this table with PARCEL_COST_LINES by id at read time.
-- RLS bare (227's form, no policy). Rollback comments-only (Rule 6 — single-txn runner).

-- UP
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS parcel_cost_lines (
  id                     TEXT          PRIMARY KEY,
  archetype              TEXT          NOT NULL REFERENCES archetype_cost_rates(archetype),
  base_confidence        TEXT          NOT NULL CHECK (base_confidence IN ('high', 'medium', 'low')),
  fit_permitted_values   TEXT[]        NULL,
  updated_at             TIMESTAMPTZ   NOT NULL DEFAULT now()
);

COMMENT ON TABLE parcel_cost_lines IS
  'Spec 88 §2.3: the EDITABLE half of the 13-line parcel cost catalogue. The structural half '
  '(id, areaField, scalar, scalarKind, fitField, isCoaLine) lives in scripts/lib/parcel-cost.js '
  'PARCEL_COST_LINES and is never admin-editable — readCostContract merges the two by id.';
COMMENT ON COLUMN parcel_cost_lines.id IS
  'Must equal one of the 13 frozen ids in scripts/lib/parcel-cost.js PARCEL_COST_LINES.';
COMMENT ON COLUMN parcel_cost_lines.archetype IS
  'Which archetype_cost_rates row this line prices against. Admin-editable.';
COMMENT ON COLUMN parcel_cost_lines.base_confidence IS
  'Admin-editable override of the line''s base confidence band (areaConfidenceFor input).';
COMMENT ON COLUMN parcel_cost_lines.fit_permitted_values IS
  'The permission vocabulary this line''s fitField is checked against (replaces the former '
  'module-level PERMITTED_VALUES constant). NULL for the 10 lines with no fitField.';

-- Seed: 13 lines derived from scripts/lib/parcel-cost.js PARCEL_COST_LINES (id, archetype,
-- baseConfidence). fit_permitted_values = '{as_of_right,coa_required}' on the 3 fitField lines
-- (garden_suite, laneway_suite, garage — the module carries 3, not 2), NULL elsewhere.
INSERT INTO parcel_cost_lines (id, archetype, base_confidence, fit_permitted_values) VALUES
  ('max_build',         'FB',           'high',   NULL),
  ('coa_build',         'CoA',          'high',   NULL),
  ('solar_max',         'SOLAR',        'high',   NULL),
  ('solar_coa',         'SOLAR',        'high',   NULL),
  ('garden_suite',      'LANE_GARDEN',  'high',   '{as_of_right,coa_required}'),
  ('laneway_suite',     'LANE_LANEWAY', 'high',   '{as_of_right,coa_required}'),
  ('kitchen',           'KIT',          'medium', NULL),
  ('bath',              'BTH',          'medium', NULL),
  ('garage',            'GAR',          'high',   '{as_of_right,coa_required}'),
  ('basement_underpin', 'BAS_UNDERPIN', 'medium', NULL),
  ('basement',          'BAS',          'medium', NULL),
  ('gut',               'INT',          'low',    NULL),
  ('addition',          'ADD',          'medium', NULL)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE parcel_cost_lines ENABLE ROW LEVEL SECURITY;

-- DOWN (comments-only — Rule 6, single-txn runner):
-- DROP TABLE IF EXISTS parcel_cost_lines;
