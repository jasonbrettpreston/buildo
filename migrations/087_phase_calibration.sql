-- Migration 087: Phase Calibration Table
--
-- Phase 3 of the predictive timing system. Stores historically computed
-- median lead times between lifecycle phases, stratified by permit_type.
-- The calibration engine (compute-timing-calibration-v2.js) writes these;
-- the flight tracker (Phase 4) reads them.
--
-- SPEC LINK: docs/reports/lifecycle_phase_implementation.md

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE phase_calibration (
  id              SERIAL PRIMARY KEY,
  from_phase      VARCHAR(10) NOT NULL
    CONSTRAINT chk_calibration_from_phase
    CHECK (from_phase IN (
      'P1','P2','P3','P4','P5','P6','P7a','P7b','P7c','P7d','P8',
      'P9','P10','P11','P12','P13','P14','P15','P16','P17','P18',
      'P19','P20','O1','O2','O3','O4',
      'ISSUED'
    )),
  to_phase        VARCHAR(10) NOT NULL
    CONSTRAINT chk_calibration_to_phase
    CHECK (to_phase IN (
      'P1','P2','P3','P4','P5','P6','P7a','P7b','P7c','P7d','P8',
      'P9','P10','P11','P12','P13','P14','P15','P16','P17','P18',
      'P19','P20','O1','O2','O3','O4'
    )),
  permit_type     VARCHAR(100),  -- NULL = all types aggregated
  median_days     INT NOT NULL,
  p25_days        INT NOT NULL,
  p75_days        INT NOT NULL,
  sample_size     INT NOT NULL,
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Idempotent UPSERT key. NULL permit_type is the "all types"
  -- aggregate; Postgres treats NULLs as distinct in UNIQUE, so we
  -- use COALESCE in the constraint via a unique index instead.
  CONSTRAINT chk_calibration_sample CHECK (sample_size >= 5)
);

-- Unique index using COALESCE so NULL permit_type participates
-- in uniqueness (Postgres UNIQUE constraints treat NULL as distinct).
CREATE UNIQUE INDEX idx_phase_calibration_unique
  ON phase_calibration (from_phase, to_phase, COALESCE(permit_type, '__ALL__'));

-- Lookup: "given current phase + permit_type, what are the medians
-- to all reachable downstream phases?"
CREATE INDEX idx_phase_calibration_from
  ON phase_calibration (from_phase, permit_type);

-- ═══════════════════════════════════════════════════════════════════
-- DOWN
-- ═══════════════════════════════════════════════════════════════════
-- DROP TABLE IF EXISTS phase_calibration;
