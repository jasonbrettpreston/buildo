-- Migration 073 — timing_calibration
-- Spec: docs/specs/product/future/71_lead_timing_engine.md §Database Schema
--
-- Per-permit-type calibration of median / p25 / p75 days from issue to
-- first inspection. Populated by compute-timing-calibration.js in Phase 1b.

-- UP
CREATE TABLE timing_calibration (
  id                              SERIAL       PRIMARY KEY,
  permit_type                     VARCHAR(100) NOT NULL,
  median_days_to_first_inspection INTEGER      NOT NULL,
  p25_days                        INTEGER      NOT NULL,
  p75_days                        INTEGER      NOT NULL,
  sample_size                     INTEGER      NOT NULL,
  computed_at                     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (permit_type)
);

-- DOWN
-- ALLOW-DESTRUCTIVE
-- DROP TABLE IF EXISTS timing_calibration;
