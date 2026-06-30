-- Migration 205: archetype_cost_rates — external industry $/m² per renovation archetype (Spec 88 §2.8).
--
-- SPEC LINK: docs/specs/01-pipeline/88_parcel_cost_model.md §2.8 / §3 (rate derivation)
--
-- The parcel cost model's rate table: one row per archetype, control-panel-tunable (Spec 86), index-
-- escalated (§2.9). EXTERNAL industry $/ft² (Toronto 2025-26, see §3 source table), stored as $/m²
-- ($/ft² × 10.764). NOT sourced from Buildo permit data (declared values understate ~2×). SOLAR carries
-- a 0.75 cost_adjustment_factor (usable-roof fraction). Plus the cost logic_variables (escalation index +
-- staleness clocks + R4 min-comp). Rollback comments-only (Rule 6 — single-txn runner).

-- UP
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS archetype_cost_rates (
  archetype               TEXT          PRIMARY KEY,
  cost_per_sqm            NUMERIC(10,2) NOT NULL CHECK (cost_per_sqm > 0),
  cost_adjustment_factor  NUMERIC(5,3)  NOT NULL DEFAULT 1.000 CHECK (cost_adjustment_factor > 0),
  escalation_index_base   NUMERIC(8,3)  NOT NULL CHECK (escalation_index_base > 0),
  source                  TEXT,
  as_of_date              DATE          NOT NULL,
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Seed: 13 lines → 12 rate rows (FB serves max+CoA build; SOLAR serves both solar lines). $/m² = $/ft²×10.764.
INSERT INTO archetype_cost_rates (archetype, cost_per_sqm, cost_adjustment_factor, escalation_index_base, source, as_of_date) VALUES
  ('FB',            4844, 1.000, 100.0, 'Toronto custom-home guides 2025-26 (Xavieras/Woodcastle/Stonebrooke); $400-650/ft²; HIGH conf', '2026-06-30'),
  ('CoA',           4844, 1.000, 100.0, 'same basis as FB (new build, larger GFA); HIGH conf',                                            '2026-06-30'),
  ('SOLAR',          377, 0.750, 100.0, 'Ontario solar $2.40-3.50/W (GreenBuildingCanada/Xolar) → ~$35/roof-ft²; MEDIUM conf (per-watt→ft²)', '2026-06-30'),
  ('LANE_GARDEN',   5382, 1.000, 100.0, 'Toronto suite guides 2025-26 (DavidReno/BVM/Oriel); $450-600/ft²; MED-HIGH conf',                 '2026-06-30'),
  ('LANE_LANEWAY',  5651, 1.000, 100.0, 'Toronto laneway guides 2025-26 (Maserat/Heracon/Elevate); $450-600/ft²; MED-HIGH conf',           '2026-06-30'),
  ('KIT',           3498, 1.000, 100.0, 'Toronto kitchen guides 2025-26 (905reno/Rocpal/Sosna); $250-400/ft²; MEDIUM conf (product-driven)', '2026-06-30'),
  ('BTH',           4306, 1.000, 100.0, 'Toronto bath guides 2025-26 (EasyRenovation/HomeStars); $300-600/ft²; MEDIUM conf',               '2026-06-30'),
  ('GAR',           1938, 1.000, 100.0, 'Toronto garage guides 2025-26 (TGC/Trusscore); $150-208/ft²; MEDIUM conf',                        '2026-06-30'),
  ('BAS_UNDERPIN',  1615, 1.000, 100.0, 'Toronto underpinning guides 2025-26 (StrongBasements/NuSite); $105-200/ft² finished; MEDIUM conf', '2026-06-30'),
  ('BAS',            753, 1.000, 100.0, 'Toronto basement-finish guides 2025-26 (TrueForm/Harmony); $45-95/ft²; MED-HIGH conf',            '2026-06-30'),
  ('INT',           3229, 1.000, 100.0, 'Toronto gut-reno guides 2025-26 (Rocpal/Habitual/Lighthaus); $200-400/ft²; MEDIUM conf',          '2026-06-30'),
  ('ADD',           4306, 1.000, 100.0, 'Toronto addition ≈ new-construction 2025-26 (TGC); $300-500/ft²; MEDIUM conf',                    '2026-06-30')
ON CONFLICT (archetype) DO NOTHING;

-- Cost logic_variables (Spec 88 §2.9). All NUMERIC (variable_value is DECIMAL). The index
-- staleness clock uses this row's own `updated_at` (refreshes when an operator edits the index
-- via the admin panel) — NO separate date var (logic_variables holds numbers, not dates).
-- reno_kitchen_gfa_pct / reno_bath_gfa_pct already exist (Spec 65).
INSERT INTO logic_variables (variable_key, variable_value, description) VALUES
  ('cost_escalation_index',   '100.0', 'Spec 88 §2.9: StatCan BCPI Toronto CMA index (current). escalation = MAX(1, index/base). Manually updated quarterly; its row updated_at is the index staleness clock.'),
  ('cost_rates_stale_months', '3',     'Spec 88 §2.9: WARN when archetype_cost_rates.as_of_date older than this (months).'),
  ('cost_index_stale_months', '4',     'Spec 88 §2.9: WARN when the cost_escalation_index row''s updated_at is older than this (months).'),
  ('min_comp_count',          '3',     'Spec 88 §2 / Spec 78 R4: min family-filtered comps before kNN falls back to zoning-only.')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN (comments-only — Rule 6, single-txn runner):
-- DROP TABLE IF EXISTS archetype_cost_rates;
-- DELETE FROM logic_variables WHERE variable_key IN
--   ('cost_escalation_index','cost_rates_stale_months','cost_index_stale_months','min_comp_count');
