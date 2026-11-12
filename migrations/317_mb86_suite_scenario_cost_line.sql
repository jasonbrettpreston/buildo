-- Migration 317: MB-86 suite-house scenario cost line (MB-94 part (b)) — one parcel_cost_lines row.
--
-- SPEC LINK: docs/specs/01-pipeline/88_parcel_cost_model.md §2.3 / §2.4 / §2.11 (dated notes 2026-11-09 and 2026-11-12)
--   + docs/specs/01-pipeline/69a_mcbylaw_register.md M-67 (dated note 2026-11-12: the house_with_secondary_suite
--   cost line is owed now that increment 4 is closed; ENGINE-INPUTS-PLAN v2 §4b, §10 step 6)
--
-- OPERATOR DB JOB. This file is committed, NOT applied by the lane. Apply it before the first
-- compute_parcel_cost_estimates run on the code that carries the suite line: until the row exists the line
-- states `no_rate_line` (counted by the scenario_gfa_computed_cost_missing WARN), it never halts the step.
--
-- The suite house prices on FB, base confidence high (the same band as the three detached lines); its area
-- is the stored Layer 3 `house_with_secondary_suite/gfa_max_m2` row. No new rate, no new column.
-- Rollback comments-only (Rule 6 — single-txn runner).

-- UP
SET LOCAL lock_timeout = '5s';

INSERT INTO parcel_cost_lines (id, archetype, base_confidence, fit_permitted_values) VALUES
  ('scenario:house_with_secondary_suite/gfa_max_m2', 'FB', 'high', NULL)
ON CONFLICT (id) DO NOTHING;

-- DOWN (comments-only — Rule 6, single-txn runner):
-- DELETE FROM parcel_cost_lines WHERE id = 'scenario:house_with_secondary_suite/gfa_max_m2';
