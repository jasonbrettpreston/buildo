-- 148: Phase E.4 — per-seq distribution band keys for
-- assert-lifecycle-phase-distribution.js.
--
-- Derives lifecycle_seq_band_<N>_min/_max keys from
-- universal_stream_catalog.rows_count (the production snapshot baseline
-- embedded in mig 129 via docs/reports/spec_84_universal_stream_v10.csv).
--
-- v3/v4 2-branch continuous tolerance formula (no boundary discontinuity):
--   rows_count IS NULL OR 0:  band = (0, NULL)                                            INFO-only
--   rows_count >= 1:          band = (FLOOR(rows_count*0.7), CEIL(rows_count*1.3) + 20)   real assertion + additive buffer
--
-- Continuity property: at rows_count=N, max - min = ceil(N*1.3) + 20 - floor(N*0.7).
-- At N=1: [0, 22]. At N=29: [20, 58]. At N=30: [21, 59]. At N=100: [70, 150].
-- At N=1000: [700, 1320]. No cliffs; tiny data growth never triggers spurious
-- WARN cascade. The +20 additive buffer absorbs low-volume statistical noise
-- (Poisson sqrt-N variance dominates a pure ±30% below ~50 rows).
--
-- v4 fold v3-Indep-MED-D: at rows_count=1, FLOOR(0.7)=0, so a seq with that
-- baseline has band [0, 22]. Actual=0 is in-band (PASS). This is INTENTIONAL
-- — rows_count=1 baseline is statistically equivalent to zero (one occurrence
-- in the snapshot, Poisson variance dominates). Treating actual=0 as a WARN
-- here would generate noise. E.5 calibration may revisit for regulatory-
-- critical low-volume seqs.
--
-- Assertion logic on the JS side:
--   const inBand = actual >= band.min && (band.max === null || actual <= band.max);
-- A NULL max means "no upper bound" — INFO-only tracking. A real regression
-- sending huge row counts to a NULL-max seq surfaces via seq_distribution
-- records_meta inspection, but is NOT a WARN/FAIL gate (no baseline to compare
-- against; that's what E.5 calibration produces).
--
-- WARN-only on first deploy. E.5 (separate WF) tightens to FAIL after 7
-- consecutive PASS runs on staging by routing increments from seqBandsWarn
-- to seqBandsFailing.
--
-- v4 fold v3-Indep-MED-3: ALSO seeds lifecycle_seq_unclassified_max in this
-- migration so the assert script's Zod validation has a DB-side default
-- immediately after migration apply (independent of seed-logic-variables.js
-- run order).
--
-- NOTE: partial indices on lifecycle_seq columns are added by a SEPARATE
-- migration (mig 149 — non-transactional CONCURRENTLY) to avoid forcing this
-- entire INSERT migration through the non-transactional path. Mig 148 stays
-- purely transactional + atomic; mig 149 handles the index builds.
--
-- Idempotent: ON CONFLICT (variable_key) DO NOTHING preserves operator-tuned
-- values applied via admin Control Panel after deployment.
--
-- v4 fold (recurring): NO explicit BEGIN/COMMIT (mig 135 R8 hotfix convention
-- — migrate.js runner provides outer transaction).
--
-- SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase E.4
-- SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §3.4
-- SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §3.2

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO logic_variables (variable_key, variable_value, description)
SELECT
  'lifecycle_seq_band_' || seq || '_min' AS variable_key,
  CASE
    WHEN rows_count IS NULL OR rows_count = 0 THEN 0
    ELSE GREATEST(0, FLOOR(rows_count * 0.7)::INTEGER)
  END AS variable_value,
  'Min row count for lifecycle_seq=' || seq || ' (' || COALESCE(stage_label, source || ':' || status) || '). E.4 default from universal_stream_catalog snapshot; recalibrated in E.5.' AS description
FROM universal_stream_catalog
ON CONFLICT (variable_key) DO NOTHING;

INSERT INTO logic_variables (variable_key, variable_value, description)
SELECT
  'lifecycle_seq_band_' || seq || '_max' AS variable_key,
  CASE
    WHEN rows_count IS NULL OR rows_count = 0 THEN NULL   -- v4 fold v3-G-CRIT-formula: NULL == "no upper bound"
    ELSE (CEIL(rows_count * 1.3)::INTEGER + 20)           -- v3 fold v2-G-HIGH-2: +20 additive buffer
  END AS variable_value,
  'Max row count for lifecycle_seq=' || seq || ' (' || COALESCE(stage_label, source || ':' || status) || '). E.4 default from universal_stream_catalog snapshot; recalibrated in E.5. NULL=no upper bound (INFO-only).' AS description
FROM universal_stream_catalog
ON CONFLICT (variable_key) DO NOTHING;

-- v4 fold v3-Indep-MED-3: seed lifecycle_seq_unclassified_max in the
-- migration too, so the assert script's Zod validation has a DB-side default
-- immediately after migration apply (independent of seed-logic-variables.js
-- run order).
INSERT INTO logic_variables (variable_key, variable_value, description) VALUES
  ('lifecycle_seq_unclassified_max', 5000,
   'Max row count where lifecycle_seq IS NULL on permits or coa_applications. WARN threshold (E.4); Phase D + E.2 first-run state expected to violate. Tighten via E.5 after ramp-up.')
ON CONFLICT (variable_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- DOWN — manual rollback only, intentionally not transactional
-- (Rule 6 / commit 8b1c10b; matches mig 119 convention — a transactional
-- DOWN would destroy operator-tuned values applied via admin Control Panel
-- after deployment).
-- ═══════════════════════════════════════════════════════════════════
--
-- To roll back manually:
--   DELETE FROM logic_variables
--    WHERE variable_key LIKE 'lifecycle_seq_band_%_min'
--       OR variable_key LIKE 'lifecycle_seq_band_%_max'
--       OR variable_key = 'lifecycle_seq_unclassified_max';
--
-- Then revert the assert-lifecycle-phase-distribution.js extension + the
-- scripts/seeds/logic_variables.json additions + mig 149 (CONCURRENTLY
-- index drops) in one commit.
