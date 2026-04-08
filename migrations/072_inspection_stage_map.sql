-- Migration 072 — inspection_stage_map + seed data
-- Spec: docs/specs/product/future/71_lead_timing_engine.md §Database Schema
--
-- Reference table mapping construction inspection stages to downstream
-- trade slugs with lag windows. Seed data is inline (21 rows, small and
-- deterministic). `painting` appears under both Fire Separations (prec 10)
-- and Occupancy (prec 20), so the unique key is on
-- (stage_name, trade_slug, precedence).

-- UP
CREATE TABLE inspection_stage_map (
  id             SERIAL PRIMARY KEY,
  stage_name     TEXT        NOT NULL,
  -- Known construction-stage vocabulary. Drives sequence-based ordering in
  -- the Tier 1 timing engine; bad values (e.g. 15) would break comparisons.
  stage_sequence INTEGER     NOT NULL CHECK (stage_sequence IN (10, 20, 30, 40, 50, 60, 70)),
  trade_slug     VARCHAR(50) NOT NULL,
  relationship   VARCHAR(20) NOT NULL CHECK (relationship IN ('follows', 'concurrent')),
  min_lag_days   INTEGER     NOT NULL,
  max_lag_days   INTEGER     NOT NULL,
  precedence     INTEGER     NOT NULL DEFAULT 100 CHECK (precedence > 0),
  -- Data integrity: lag window must be non-degenerate
  CHECK (min_lag_days >= 0 AND max_lag_days >= min_lag_days)
);

CREATE UNIQUE INDEX idx_inspection_stage_map_stage_trade_prec
  ON inspection_stage_map (stage_name, trade_slug, precedence);
CREATE INDEX idx_inspection_stage_map_trade ON inspection_stage_map (trade_slug);

INSERT INTO inspection_stage_map (stage_name, stage_sequence, trade_slug, relationship, min_lag_days, max_lag_days, precedence) VALUES
('Excavation/Shoring', 10, 'concrete', 'follows', 5, 14, 100),
('Excavation/Shoring', 10, 'waterproofing', 'follows', 7, 21, 100),
('Excavation/Shoring', 10, 'drain-plumbing', 'concurrent', 0, 7, 100),
('Footings/Foundations', 20, 'framing', 'follows', 7, 21, 100),
('Footings/Foundations', 20, 'structural-steel', 'follows', 7, 21, 100),
('Footings/Foundations', 20, 'masonry', 'follows', 14, 28, 100),
('Structural Framing', 30, 'plumbing', 'follows', 5, 14, 100),
('Structural Framing', 30, 'electrical', 'follows', 5, 14, 100),
('Structural Framing', 30, 'hvac', 'follows', 5, 14, 100),
('Structural Framing', 30, 'fire-protection', 'follows', 7, 21, 100),
('Structural Framing', 30, 'roofing', 'concurrent', 0, 14, 100),
('Insulation/Vapour Barrier', 40, 'drywall', 'follows', 5, 14, 100),
('Fire Separations', 50, 'painting', 'follows', 7, 21, 10),
('Fire Separations', 50, 'flooring', 'follows', 7, 21, 100),
('Fire Separations', 50, 'tiling', 'follows', 7, 21, 100),
('Fire Separations', 50, 'trim-work', 'follows', 14, 28, 100),
('Fire Separations', 50, 'millwork-cabinetry', 'follows', 14, 28, 100),
('Fire Separations', 50, 'stone-countertops', 'follows', 14, 28, 100),
('Interior Final Inspection', 60, 'landscaping', 'follows', 0, 14, 100),
('Interior Final Inspection', 60, 'decking-fences', 'follows', 0, 14, 100),
('Occupancy', 70, 'painting', 'follows', 0, 7, 20);

-- DOWN
-- ALLOW-DESTRUCTIVE
-- DROP TABLE IF EXISTS inspection_stage_map;
