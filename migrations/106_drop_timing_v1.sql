-- UP
DROP TABLE IF EXISTS timing_calibration; -- ALLOW-DESTRUCTIVE

-- DOWN
-- Recreate the v1 timing calibration table if rollback is needed:
--   CREATE TABLE timing_calibration (
--     id SERIAL PRIMARY KEY,
--     permit_type VARCHAR(100) NOT NULL,
--     median_days_to_first_inspection INTEGER NOT NULL,
--     p25_days INTEGER NOT NULL,
--     p75_days INTEGER NOT NULL,
--     sample_size INTEGER NOT NULL,
--     computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
--     UNIQUE (permit_type)
--   );
-- Data was last populated 2026-04-11 by scripts/compute-timing-calibration.js.
-- Replaced by phase_calibration (v2) populated by compute-timing-calibration-v2.js.
