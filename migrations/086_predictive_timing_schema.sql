-- Migration 086: Predictive Timing Schema Architecture
--
-- Phase 1 of the predictive timing system. Adds infrastructure for:
--   1. phase_started_at on permits — immutable anchor for countdown math
--   2. permit_phase_transitions — full history of phase changes for calibration
--   3. trade_forecasts — per-permit, per-trade predictions
--
-- The classifier upgrade (Phase 2) populates phase_started_at and writes
-- transition rows. The calibration engine (Phase 3) reads transitions.
-- The flight tracker (Phase 4) writes trade_forecasts.
--
-- SPEC LINK: docs/reports/lifecycle_phase_implementation.md

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

-- 1. Add phase_started_at to permits
-- Nullable: Phase 2's classifier upgrade writes this only when
-- lifecycle_phase actually changes. No DEFAULT — instant ALTER on
-- 243K rows (Postgres 11+ doesn't rewrite the table for nullable
-- columns with no default).
ALTER TABLE permits ADD COLUMN phase_started_at TIMESTAMPTZ;

-- 2. permit_phase_transitions — every phase change logged as a row
-- The calibration engine (Phase 3) queries transition pairs to compute
-- "median days from P11 → P12 for BLD permits in neighbourhood X."
-- A single phase_started_at column can't answer that — you need the
-- full transition history.
--
-- Denormalized context note: permit_type and neighbourhood_id are
-- cached at transition time and NOT updated if the permit row changes
-- later. This is acceptable because: (a) permit_type never changes
-- after initial CKAN ingestion, (b) neighbourhood_id changes only on
-- rare boundary redraws — if that happens, a one-time backfill script
-- should update historical transitions. Document this freeze contract
-- in the calibration engine (Phase 3).
CREATE TABLE permit_phase_transitions (
  id               SERIAL PRIMARY KEY,
  permit_num       VARCHAR(30) NOT NULL,
  revision_num     VARCHAR(10) NOT NULL,
  from_phase       VARCHAR(10)
    CONSTRAINT chk_transitions_from_phase
    CHECK (from_phase IS NULL OR from_phase IN (
      'P1','P2','P3','P4','P5','P6','P7a','P7b','P7c','P7d','P8',
      'P9','P10','P11','P12','P13','P14','P15','P16','P17','P18',
      'P19','P20','O1','O2','O3','O4'
    )),
  to_phase         VARCHAR(10) NOT NULL
    CONSTRAINT chk_transitions_to_phase
    CHECK (to_phase IN (
      'P1','P2','P3','P4','P5','P6','P7a','P7b','P7c','P7d','P8',
      'P9','P10','P11','P12','P13','P14','P15','P16','P17','P18',
      'P19','P20','O1','O2','O3','O4'
    )),
  transitioned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  permit_type      VARCHAR(100),
  neighbourhood_id INTEGER,
  -- FK to permits: orphan transitions would silently poison
  -- calibration medians. CASCADE on delete so permit removal
  -- automatically cleans up its transition history.
  CONSTRAINT fk_transitions_permit
    FOREIGN KEY (permit_num, revision_num)
    REFERENCES permits(permit_num, revision_num)
    ON DELETE CASCADE
);

-- Indexes for permit_phase_transitions
-- Timeline lookup: "show me all transitions for permit X in order"
CREATE INDEX idx_phase_transitions_permit
  ON permit_phase_transitions (permit_num, revision_num, transitioned_at DESC);

-- Calibration query: "median days from P11 → P12 across all permits"
CREATE INDEX idx_phase_transitions_pair
  ON permit_phase_transitions (from_phase, to_phase);

-- Recent arrivals: "most recent permits entering phase P12"
CREATE INDEX idx_phase_transitions_target
  ON permit_phase_transitions (to_phase, transitioned_at DESC);

-- Neighbourhood-scoped calibration: "median P11→P12 in neighbourhood X"
CREATE INDEX idx_phase_transitions_neighbourhood
  ON permit_phase_transitions (neighbourhood_id, from_phase, to_phase);

-- 3. trade_forecasts — 1-to-many predictions per permit
-- One permit generates 3-8 trade predictions depending on scope.
-- The flight tracker (Phase 4) writes these; the lead feed JOINs on
-- (permit_num, revision_num, trade_slug) to surface urgency per card.
CREATE TABLE trade_forecasts (
  permit_num          VARCHAR(30) NOT NULL,
  revision_num        VARCHAR(10) NOT NULL,
  trade_slug          VARCHAR(50) NOT NULL,
  -- The prediction
  predicted_start     DATE,               -- when this trade is expected on-site
  confidence          VARCHAR(10) NOT NULL DEFAULT 'low'
    CONSTRAINT chk_forecast_confidence
    CHECK (confidence IN ('low', 'medium', 'high')),
  urgency             VARCHAR(20) NOT NULL DEFAULT 'unknown'
    CONSTRAINT chk_forecast_urgency
    CHECK (urgency IN ('unknown', 'on_time', 'upcoming', 'imminent', 'delayed', 'overdue')),
  -- Calibration source metadata (debugging + operator trust)
  calibration_method  VARCHAR(30),        -- exact / fallback_type / fallback_global
  sample_size         INT,
  median_days         INT,
  p25_days            INT,
  p75_days            INT,
  -- Bookkeeping
  computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (permit_num, revision_num, trade_slug),
  -- FK to permits: forecast rows auto-clean on permit deletion.
  CONSTRAINT fk_forecasts_permit
    FOREIGN KEY (permit_num, revision_num)
    REFERENCES permits(permit_num, revision_num)
    ON DELETE CASCADE
);

-- Feed filtering: "show me delayed plumbing leads"
CREATE INDEX idx_trade_forecasts_trade_urgency
  ON trade_forecasts (trade_slug, urgency);

-- Imminent leads: "HVAC leads starting within 30 days"
CREATE INDEX idx_trade_forecasts_trade_start
  ON trade_forecasts (trade_slug, predicted_start)
  WHERE predicted_start IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
-- DOWN
-- ═══════════════════════════════════════════════════════════════════
-- The migration runner executes the FULL file (no UP/DOWN parsing),
-- so the DOWN block MUST remain commented. To rollback, uncomment
-- and run manually:
--
-- DROP TABLE IF EXISTS trade_forecasts;
-- DROP TABLE IF EXISTS permit_phase_transitions;
-- ALTER TABLE permits DROP COLUMN IF EXISTS phase_started_at;
