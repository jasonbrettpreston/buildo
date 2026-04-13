-- Migration 092: Marketplace Control Panel
--
-- Replaces hardcoded JS constants with DB-driven configuration tables.
-- Operators can tune trade allocations, scoring multipliers, and
-- imminent window thresholds without code deployments.
--
-- lead_analytics already exists (migration 091) — NOT recreated here.
--
-- SPEC LINK: docs/specs/product/future/81_opportunity_score_engine.md

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

-- 1. Trade-specific rules (allocations, bimodal windows, alert thresholds)
CREATE TABLE trade_configurations (
  trade_slug           VARCHAR(50) PRIMARY KEY,
  bid_phase_cutoff     VARCHAR(10) NOT NULL,
  work_phase_target    VARCHAR(10) NOT NULL,
  imminent_window_days INTEGER NOT NULL DEFAULT 14,
  allocation_pct       DECIMAL(5,4) NOT NULL DEFAULT 0.0500
    CONSTRAINT chk_allocation_pct CHECK (allocation_pct >= 0 AND allocation_pct <= 1),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Global scoring constants (key-value store for multipliers)
CREATE TABLE logic_variables (
  variable_key   VARCHAR(100) PRIMARY KEY,
  variable_value DECIMAL NOT NULL,
  description    TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════
-- SEED: trade_configurations (32 trades)
-- Values match the normalized TRADE_ALLOCATION_PCT + TRADE_TARGET_PHASE
-- from scripts/lib/lifecycle-phase.js as of commit fd91c68.
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO trade_configurations (trade_slug, bid_phase_cutoff, work_phase_target, imminent_window_days, allocation_pct) VALUES
  ('excavation',         'P3',  'P9',  7,  0.0244),
  ('shoring',            'P3',  'P9',  7,  0.0163),
  ('demolition',         'P3',  'P9',  7,  0.0163),
  ('temporary-fencing',  'P3',  'P9',  7,  0.0081),
  ('concrete',           'P3',  'P10', 14, 0.0650),
  ('waterproofing',      'P3',  'P10', 14, 0.0163),
  ('framing',            'P3',  'P11', 14, 0.0974),
  ('structural-steel',   'P3',  'P11', 14, 0.0813),
  ('masonry',            'P7a', 'P11', 14, 0.0488),
  ('elevator',           'P3',  'P11', 21, 0.0407),
  ('plumbing',           'P3',  'P12', 14, 0.0650),
  ('hvac',               'P3',  'P12', 14, 0.0813),
  ('electrical',         'P3',  'P12', 14, 0.0650),
  ('drain-plumbing',     'P3',  'P12', 14, 0.0325),
  ('fire-protection',    'P3',  'P12', 14, 0.0244),
  ('roofing',            'P7a', 'P16', 14, 0.0407),
  ('insulation',         'P7a', 'P13', 14, 0.0244),
  ('glazing',            'P7a', 'P16', 21, 0.0244),
  ('drywall',            'P3',  'P15', 14, 0.0325),
  ('painting',           'P7a', 'P15', 14, 0.0244),
  ('flooring',           'P7a', 'P15', 14, 0.0325),
  ('tiling',             'P7a', 'P15', 14, 0.0163),
  ('trim-work',          'P11', 'P15', 14, 0.0081),
  ('millwork-cabinetry', 'P7a', 'P15', 21, 0.0163),
  ('stone-countertops',  'P11', 'P15', 21, 0.0081),
  ('security',           'P11', 'P15', 14, 0.0081),
  ('eavestrough-siding', 'P7a', 'P16', 14, 0.0163),
  ('caulking',           'P7a', 'P16', 7,  0.0081),
  ('solar',              'P7a', 'P16', 21, 0.0163),
  ('landscaping',        'P12', 'P17', 14, 0.0163),
  ('decking-fences',     'P12', 'P17', 14, 0.0081),
  ('pool-installation',  'P7a', 'P17', 21, 0.0163)
ON CONFLICT (trade_slug) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- SEED: logic_variables (scoring constants)
-- Values match compute-opportunity-scores.js as of commit fd91c68.
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO logic_variables (variable_key, variable_value, description) VALUES
  ('los_multiplier_bid',      2.5,   'Urgency multiplier for bid-window forecasts'),
  ('los_multiplier_work',     1.5,   'Urgency multiplier for work-window forecasts'),
  ('los_penalty_tracking',    50,    'Competition penalty per tracked (claimed) user'),
  ('los_penalty_saving',      10,    'Competition penalty per saved user'),
  ('los_base_cap',            30,    'Max base score (tradeValue / $10K, capped)'),
  ('los_base_divisor',        10000, 'Trade value divisor for base score'),
  ('stall_penalty_precon',    45,    'Days added to predicted_start for pre-construction stalls'),
  ('stall_penalty_active',    14,    'Days added to predicted_start for active construction stalls'),
  ('expired_threshold_days',  -90,   'daysUntil threshold for expired urgency classification'),
  ('liar_gate_threshold',     0.25,  'If reported < modeled * this, override with geometric estimate')
ON CONFLICT (variable_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- DOWN
-- ═══════════════════════════════════════════════════════════════════
-- DROP TABLE IF EXISTS logic_variables;
-- DROP TABLE IF EXISTS trade_configurations;
