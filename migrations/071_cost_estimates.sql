-- Migration 071 — cost_estimates
-- Spec: docs/specs/product/future/72_lead_cost_model.md §Database Schema
--
-- Cached cost estimates for permits, produced either from the permit's own
-- declared cost or from the Phase 1b cost model. Composite PK keyed on
-- (permit_num, revision_num) with CASCADE on the permits FK.

-- UP
CREATE TABLE cost_estimates (
  permit_num       VARCHAR(30)   NOT NULL,
  revision_num     VARCHAR(10)   NOT NULL,
  estimated_cost   DECIMAL(15,2),
  cost_source      VARCHAR(20)   NOT NULL CHECK (cost_source IN ('permit', 'model')),
  cost_tier        VARCHAR(20)   CHECK (cost_tier IN ('small', 'medium', 'large', 'major', 'mega')),
  cost_range_low   DECIMAL(15,2),
  cost_range_high  DECIMAL(15,2),
  premium_factor   DECIMAL(3,2),
  complexity_score INTEGER       CHECK (complexity_score >= 0 AND complexity_score <= 100),
  model_version    INTEGER       NOT NULL DEFAULT 1,
  computed_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (permit_num, revision_num),
  FOREIGN KEY (permit_num, revision_num)
    REFERENCES permits(permit_num, revision_num) ON DELETE CASCADE
);

CREATE INDEX idx_cost_estimates_tier ON cost_estimates (cost_tier);

-- DOWN
-- ALLOW-DESTRUCTIVE
-- DROP INDEX IF EXISTS idx_cost_estimates_tier;
-- DROP TABLE IF EXISTS cost_estimates CASCADE;
