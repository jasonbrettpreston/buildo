-- Migration 096 — Surgical Valuation Schema
-- SPEC LINK: docs/specs/product/future/83_lead_cost_model.md §2
--
-- Creates the two new rate/matrix tables that power the surgical estimation
-- engine and extends cost_estimates + data_quality_snapshots to surface the
-- new columns. All ALTER TABLE … ADD COLUMN operations are O(1) metadata-only
-- on PostgreSQL — no table rewrites or locks on the 237K-row permits table.

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

-- 1. cost_estimates: add surgical work-area column
ALTER TABLE cost_estimates
  ADD COLUMN IF NOT EXISTS effective_area_sqm DECIMAL(12,2);

-- 2. cost_estimates: expand cost_source enum from 2 to 3 values.
--    'none' = surgical total was zero (no active trades) — do NOT slice.
--    Cannot drop and re-add a CHECK in one statement; use two steps.
ALTER TABLE cost_estimates
  DROP CONSTRAINT IF EXISTS cost_estimates_cost_source_check;
ALTER TABLE cost_estimates
  ADD CONSTRAINT cost_estimates_cost_source_check
  CHECK (cost_source IN ('permit', 'model', 'none'));

-- 3. trade_sqft_rates — per-trade $/sqft + per-trade complexity multiplier.
--    Tunable by ops without a code deployment.
CREATE TABLE IF NOT EXISTS trade_sqft_rates (
  trade_slug                  VARCHAR(50)    PRIMARY KEY,
  base_rate_sqft              DECIMAL(10,2)  NOT NULL CHECK (base_rate_sqft > 0),
  structure_complexity_factor DECIMAL(4,2)   NOT NULL DEFAULT 1.00
    CHECK (structure_complexity_factor >= 0.50 AND structure_complexity_factor <= 3.00),
  updated_at                  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- 4. scope_intensity_matrix — (permit_type × structure_type) → GFA allocation %.
--    Drives Step B of the Three-Step Valuation (Area_Eff = GFA × intensity_pct).
CREATE TABLE IF NOT EXISTS scope_intensity_matrix (
  permit_type               VARCHAR(100)  NOT NULL,
  structure_type            VARCHAR(100)  NOT NULL,
  gfa_allocation_percentage DECIMAL(5,4)  NOT NULL
    CHECK (gfa_allocation_percentage > 0 AND gfa_allocation_percentage <= 1.0000),
  updated_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (permit_type, structure_type)
);

-- 5. data_quality_snapshots: add surgical-engine observability columns.
--    Nullable because pre-migration rows pre-date this script.
ALTER TABLE data_quality_snapshots
  ADD COLUMN IF NOT EXISTS cost_estimates_liar_gate_overrides INTEGER;
ALTER TABLE data_quality_snapshots
  ADD COLUMN IF NOT EXISTS cost_estimates_zero_total_bypass INTEGER;

-- ═══════════════════════════════════════════════════════════════════
-- SEED: logic_variables — 3 surgical knobs (83-W10)
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO logic_variables (variable_key, variable_value, description) VALUES
  ('urban_coverage_ratio',    0.70, 'GFA lot-size fallback coverage for high-density lots (tenure_renter_pct > 50)'),
  ('suburban_coverage_ratio', 0.40, 'GFA lot-size fallback coverage for low-density lots'),
  ('trust_threshold_pct',     0.25, 'Liar''s Gate: if city-reported < surgical_total * this, override with model')
ON CONFLICT (variable_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- SEED: trade_sqft_rates (32 trades)
-- base_rate_sqft derived from existing BASE_RATES / avg allocation_pct.
-- structure_complexity_factor = 1.00 for trades unaffected by multi-unit;
-- higher for trades where multi-unit complexity materially increases scope.
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO trade_sqft_rates (trade_slug, base_rate_sqft, structure_complexity_factor) VALUES
  ('excavation',         73.00,  1.00),
  ('shoring',            49.00,  1.00),
  ('demolition',         49.00,  1.00),
  ('temporary-fencing',  24.00,  1.00),
  ('concrete',          195.00,  1.20),
  ('waterproofing',      49.00,  1.00),
  ('framing',           292.00,  1.30),
  ('structural-steel',  244.00,  1.40),
  ('masonry',           146.00,  1.10),
  ('elevator',          122.00,  1.50),
  ('plumbing',          195.00,  1.40),
  ('hvac',              244.00,  1.30),
  ('electrical',        195.00,  1.40),
  ('drain-plumbing',     98.00,  1.20),
  ('fire-protection',    73.00,  1.20),
  ('roofing',           122.00,  1.00),
  ('insulation',         73.00,  1.00),
  ('glazing',            73.00,  1.10),
  ('drywall',            98.00,  1.10),
  ('painting',           73.00,  1.00),
  ('flooring',           98.00,  1.10),
  ('tiling',             49.00,  1.10),
  ('trim-work',          24.00,  1.00),
  ('millwork-cabinetry', 49.00,  1.20),
  ('stone-countertops',  24.00,  1.10),
  ('security',           24.00,  1.10),
  ('eavestrough-siding', 49.00,  1.00),
  ('caulking',           24.00,  1.00),
  ('solar',              49.00,  1.10),
  ('landscaping',        49.00,  1.00),
  ('decking-fences',     24.00,  1.00),
  ('pool-installation',  49.00,  1.10)
ON CONFLICT (trade_slug) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- SEED: scope_intensity_matrix (18 permit_type × structure_type combos)
-- Covers ~95% of Toronto permit volume. Miss → Brain defaults to 1.0.
-- Values represent the fraction of total GFA that the permit scope touches.
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO scope_intensity_matrix (permit_type, structure_type, gfa_allocation_percentage) VALUES
  ('new building',       'sfd',              1.0000),
  ('new building',       'semi-detached',    1.0000),
  ('new building',       'townhouse',        1.0000),
  ('new building',       'multi-residential',1.0000),
  ('new building',       'commercial',       1.0000),
  ('new building',       'garden suite',     1.0000),
  ('addition',           'sfd',              0.2500),
  ('addition',           'semi-detached',    0.2500),
  ('addition',           'townhouse',        0.2500),
  ('addition',           'multi-residential',0.1500),
  ('addition',           'commercial',       0.2000),
  ('alteration',         'sfd',              0.1500),
  ('alteration',         'semi-detached',    0.1500),
  ('alteration',         'townhouse',        0.1500),
  ('alteration',         'multi-residential',0.1000),
  ('alteration',         'commercial',       0.1500),
  ('interior alteration','sfd',              0.2000),
  ('interior alteration','commercial',       0.2500)
ON CONFLICT (permit_type, structure_type) DO NOTHING;

-- DOWN
-- ALLOW-DESTRUCTIVE
-- DELETE FROM logic_variables
--   WHERE variable_key IN ('urban_coverage_ratio', 'suburban_coverage_ratio', 'trust_threshold_pct');
-- DROP TABLE IF EXISTS scope_intensity_matrix;
-- DROP TABLE IF EXISTS trade_sqft_rates;
-- ALTER TABLE data_quality_snapshots DROP COLUMN IF EXISTS cost_estimates_liar_gate_overrides;
-- ALTER TABLE data_quality_snapshots DROP COLUMN IF EXISTS cost_estimates_zero_total_bypass;
-- ALTER TABLE cost_estimates DROP COLUMN IF EXISTS effective_area_sqm;
-- ALTER TABLE cost_estimates DROP CONSTRAINT IF EXISTS cost_estimates_cost_source_check;
-- ALTER TABLE cost_estimates ADD CONSTRAINT cost_estimates_cost_source_check
--   CHECK (cost_source IN ('permit', 'model'));
