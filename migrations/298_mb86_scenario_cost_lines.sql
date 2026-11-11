-- Migration 298: MB-86 per-scenario cost — the HOUSEPLEX rate row and the four scenario rows of parcel_cost_lines.
--
-- SPEC LINK: docs/specs/01-pipeline/88_parcel_cost_model.md §2.3 / §2.4 / §2.11 (dated notes 2026-11-09)
--   + docs/specs/01-pipeline/69a_mcbylaw_register.md M-67 (dated note 2026-11-09: Spec 88 prices the
--   stored Layer 3 scenario areas)
--
-- OPERATOR DB JOB (MB-86). This file is committed, NOT applied by the lane. Apply it in the same
-- job as (or before) the first compute_parcel_cost_estimates run on the MB-86 code: the scenario
-- lines read their archetype from the four parcel_cost_lines rows below (a missing row makes the
-- line state `no_rate_line`, counted by the scenario_gfa_computed_cost_missing WARN).
--
-- OPERATOR-CONFIRM BEFORE APPLY (Q6): HOUSEPLEX.escalation_index_base is the LIVE
-- cost_escalation_index (operator ruling 2026-11-09), read below at apply time from
-- logic_variables. Run plan v2 Q6 first and confirm the value; it is 100.0 only if the index
-- has never been edited (migration 205 seeds 100.0).
--
-- HOUSEPLEX (operator 2026-11-09, "1. accept"): $400/ft² = 4,306 $/m² (400 × 10.764), range
-- $320-520/ft², confidence MEDIUM-LOW; one rate for 2-6 units (the sprinkler step at 5-6 units
-- is a known gap); the neighbourhood premium applies as for FB; by-law GFA is the area basis and
-- may understate the built area by up to 12 %. Evidence:
-- ~/Buildo-scratch/mcfrontend/COST/RATE-multiplex-research.md (§5 draft row).
--
-- parcel_cost_lines: the three detached scenario lines price on FB (base confidence high, the
-- max_build line's band); the houseplex line prices on HOUSEPLEX with base confidence low (the
-- closed band's nearest honest value for MEDIUM-LOW). Rollback comments-only (Rule 6 — single-txn runner).

-- UP
SET LOCAL lock_timeout = '5s';

INSERT INTO archetype_cost_rates (archetype, cost_per_sqm, cost_adjustment_factor, escalation_index_base, source, as_of_date)
SELECT 'HOUSEPLEX', 4306, 1.000, operator_q6.escalation_index_base,
       'Toronto multiplex new-build guides Oct 2026 (The Unit Works $300-400 std/$380-450 prem; Multiplex Toronto Builders $320-520; Nexon $350-650), hard cost; floor-checked vs Altus 2026 GTA (stacked TH $180-270, 6-st wood $210-330) and City Multiplex Monitoring 2025 (declared $179-315); $400/ft² = conservative-mid, range $320-520; 2-6 units, 5-6 unit sprinkler step not modelled; MED-LOW conf',
       DATE '2026-10-31'
  FROM (SELECT variable_value::numeric AS escalation_index_base
          FROM logic_variables
         WHERE variable_key = 'cost_escalation_index') AS operator_q6
ON CONFLICT (archetype) DO NOTHING;

INSERT INTO parcel_cost_lines (id, archetype, base_confidence, fit_permitted_values) VALUES
  ('scenario:detached_house/gfa_max_m2',     'FB',        'high', NULL),
  ('scenario:detached_house/gfa_flat_m2',    'FB',        'high', NULL),
  ('scenario:detached_house/gfa_pitched_m2', 'FB',        'high', NULL),
  ('scenario:detached_houseplex/gfa_max_m2', 'HOUSEPLEX', 'low',  NULL)
ON CONFLICT (id) DO NOTHING;

-- DOWN (comments-only — Rule 6, single-txn runner):
-- DELETE FROM parcel_cost_lines WHERE id LIKE 'scenario:%';
-- DELETE FROM archetype_cost_rates WHERE archetype = 'HOUSEPLEX';
