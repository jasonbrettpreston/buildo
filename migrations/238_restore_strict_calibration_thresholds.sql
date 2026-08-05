-- 238: restore the STRICT trade-forecast calibration verdict thresholds (20/50).
--
-- On 2026-07-07 (c6310d65) the default_calibration_pct verdict pair was relaxed from the
-- strict 20/50 to 70/85 while the post-rebuild phase_calibration corpus was cold (~60% of
-- forecast rows on the level-5 calibration_method='default'). That relaxation shipped with
-- its own revert condition, stated in the seed description and in Spec 85 §3.6:
--   "restore 20 once calibration_cohort_fill_pct recovers past 80%".
--
-- The condition is MET. Measured 2026-08-05 against cloud (run 2287, and re-derived directly
-- off the table: trade_forecasts default = 125,591 / 1,107,782 = 11.34%):
--   default_calibration_pct     11.3%  (PASS)
--   calibration_cohort_fill_pct 88.7%  (the strict-PASS point is > 80%)
-- Cause is identified, not incidental: permits:compute_timing_calibration_v2 cohorts grew
-- 32 -> 69 (Aug 4) -> 76 (Aug 5) as the Phase A deep-scrapes drain landed inspection data.
--
-- Until this lands, scripts/lib/calibration-guard.js:36-40 correctly reports
-- calibration_thresholds_relaxed = FAIL on every nightly run (relaxed AND the corpus has
-- recovered past the strict-PASS point = config drift demanding action). It is the ONLY FAIL
-- among chain_permits' 33 step verdicts. Restoring 20/50 makes `relaxed` false, the guard
-- returns PASS on its !relaxed short-circuit, and the chain goes FAIL-free
-- (completed_with_errors -> completed_with_warnings, inside check-chain-verdict's allowlist).
--
-- Why a migration at all: these two keys entered the DB via scripts/seeds/logic_variables.json,
-- and scripts/seeds/apply-logic-variables.js is INSERT ... ON CONFLICT DO NOTHING — it never
-- updates an existing row. On an existing database (cloud) a migration is the ONLY vehicle.
-- On a fresh database this migration is inert (the rows do not exist yet; migrate.js runs the
-- seed loader AFTER all migrations), and the seed JSON's new 20/50 defaults are what land.
-- Both halves are therefore required, and they do not conflict.
--
-- The description column is updated alongside the value, and the strings here are
-- BYTE-IDENTICAL to the seed JSON's. scripts/generate-logic-vars-docs.mjs renders the SEED
-- string for any key present in the seed and skips the migration-derived entry, so a
-- divergence would silently document text the database does not hold.
--
-- Idempotent + operator-safe: each UPDATE is guarded on the exact value it replaces, so a
-- re-apply changes 0 rows and a later deliberate re-relaxation is never clobbered.
--
-- SPEC LINK: docs/specs/01-pipeline/85_trade_forecast_engine.md §3.6

-- UP
UPDATE logic_variables
   SET variable_value = 20,
       description = 'WF2 D2a (Spec 85 §3.6): compute-trade-forecasts.js default_calibration_pct WARN threshold. At or above this share of forecast rows on the level-5 calibration_method=''default'', the trade-forecast audit verdict WARNs. STRICT baseline, restored 2026-08-05 by migration 238 after the 2026-07-07 relaxation to 70 (c6310d65) met its own stated revert condition: calibration_cohort_fill_pct recovered past 80% (measured 88.7%, default_calibration_pct 11.3%) once compute_timing_calibration_v2 cohorts grew 32 to 76 on the Phase A inspection drain. Any future relaxation re-arms the calibration_thresholds_relaxed guard, which emits on EVERY run while this exceeds the strict 20 and escalates to FAIL once the corpus recovers.',
       updated_at = NOW()
 WHERE variable_key = 'forecast_default_calibration_warn_pct'
   AND variable_value = 70;

UPDATE logic_variables
   SET variable_value = 50,
       description = 'WF2 D2a (Spec 85 §3.6): compute-trade-forecasts.js default_calibration_pct FAIL threshold. At or above this share on calibration_method=''default'', the verdict FAILs (blocks nothing — verdict-only, run-chain.js halts on crashes not FAIL verdicts). STRICT baseline, restored 2026-08-05 by migration 238 alongside its warn twin, after the 2026-07-07 relaxation to 85 (c6310d65) was retired. The strict pair is 20/50, mirrored as STRICT_CALIB_WARN_PCT/STRICT_CALIB_FAIL_PCT in compute-trade-forecasts.js; the calibration_thresholds_relaxed guard makes any loosening loud + permanent-by-choice-only.',
       updated_at = NOW()
 WHERE variable_key = 'forecast_default_calibration_fail_pct'
   AND variable_value = 85;

-- DOWN — manual rollback only (lessons.md: migrate.js executes every uncommented line).
-- To revert to the 2026-07-07 relaxed pair:
--   UPDATE logic_variables SET variable_value = 70, updated_at = NOW()
--    WHERE variable_key = 'forecast_default_calibration_warn_pct' AND variable_value = 20;
--   UPDATE logic_variables SET variable_value = 85, updated_at = NOW()
--    WHERE variable_key = 'forecast_default_calibration_fail_pct' AND variable_value = 50;
-- Reverting also requires restoring scripts/seeds/logic_variables.json's defaults and
-- descriptions, or a fresh database will disagree with the reverted one.
