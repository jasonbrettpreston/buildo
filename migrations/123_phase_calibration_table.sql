-- 123: phase_stay_calibration table — pre-computed cohort percentiles per
-- (permit_type, phase). Closes Spec 84 bug 84-W4 ("Dead Transition
-- Write: Ledger is written but not used. Fix: Wire Spec 86 Calibration
-- to read this ledger.") by giving the permit_phase_transitions ledger
-- a downstream consumer.
--
-- Spec 84 §7 (Calibration Source): mandates Spec 86 use the ledger as
-- primary data source for velocity math. This table is the materialized
-- result of that aggregation.
--
-- Spec 86 §4: chain step 21.5 (`compute-phase-calibration.js`) populates
-- this table after step 21 (classify-lifecycle-phase) writes new
-- transitions and before step 22 (compute-trade-forecasts) consumes
-- velocity data.
--
-- Spec 76 §3.5 Cycle 7: read-path consumer is the admin Lead Detail
-- Inspector's `lifecycle.timeline[]` panel — every entry's
-- `cohort_median_days`/`p25_days`/`p75_days`/`sample_size` come from
-- this table.
--
-- Sample sizes < 30 are unreliable for percentile estimation; consumers
-- (the inspector) should treat low-sample buckets as "no cohort data"
-- and rely on the median/p25/p75 fields' nullability rather than the
-- sample_size threshold.

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS phase_stay_calibration (
  permit_type   VARCHAR(100) NOT NULL,
  phase         VARCHAR(20)  NOT NULL,
  median_days   INTEGER,
  p25_days      INTEGER,
  p75_days      INTEGER,
  sample_size   INTEGER      NOT NULL,
  computed_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (permit_type, phase),
  CONSTRAINT phase_stay_calibration_sample_size_nonneg CHECK (sample_size >= 0),
  CONSTRAINT phase_stay_calibration_percentiles_ordered CHECK (
    p25_days IS NULL
    OR p75_days IS NULL
    OR p25_days <= p75_days
  )
);

CREATE INDEX IF NOT EXISTS idx_phase_stay_calibration_lookup
  ON phase_stay_calibration (permit_type, phase);

-- ═══════════════════════════════════════════════════════════════════
-- DOWN — manual rollback only, intentionally not transactional
-- (Rule 6 / commit 8b1c10b)
-- ═══════════════════════════════════════════════════════════════════
-- Reverting this migration would erase the calibration data + the
-- inspector's timeline panel would lose its cohort comparison fields.
-- The ledger remains intact (this table is just a materialized view
-- of it). To roll back manually:
--
--   DROP INDEX IF EXISTS idx_phase_stay_calibration_lookup;
--   DROP TABLE IF EXISTS phase_stay_calibration;
--
-- Then revert scripts/compute-phase-calibration.js and the
-- src/lib/leads/lead-inspect-query.ts extension.
