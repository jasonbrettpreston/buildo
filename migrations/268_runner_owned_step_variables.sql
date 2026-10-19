-- 268: EXT-1 runner-owned step variables — the numbers scripts/lib/step decides with become logic variables.
--
-- Operator y 2026-10-18 (runner lane, rulings 9 and 10; Spec 124 R-EB (a), McDonald's Airtight V3
-- EXTERNALIZED): gate E's estate arm now scans scripts/lib/step/** and admits no ledger. Each variable
-- carries the former literal as its default, so behaviour is byte-identical at these defaults. They are
-- RUNNER-OWNED: scripts/lib/step/config.js RUNNER_VARIABLES resolves them for EVERY step in the same
-- logic_variables statement as declared config (R-CM), bounded by the seed min/max; a missing row or an
-- out-of-bounds value refuses the run (failed_config_out_of_bounds). Compute never sees them.
-- admin group "Pipeline Runner" (step_post_check_concurrency and step_post_check_statement_timeout_minutes,
-- already seeded, join that group too).
--   step_maintenance_default_timeout_minutes      15  [1, 60]
--   step_audit_value_max_chars                   300  [50, 2000]
--   step_acquire_pdf_pace_ms                    2000  [2000, 60000]
--   step_acquire_max_redirects                     5  [1, 10]
--   step_phase_recancel_max_ms                  5000  [100, 60000]
--   step_phase_recancel_min_ms                    50  [10, 5000]
--   step_phase_recancel_divisor                    4  [1, 20]
--   step_stall_ticker_multiplier                   2  [1, 10]
--   step_seam_chain_run_scan_limit                40  [2, 1000]
-- Deleted fallbacks (no variable): plausibility.js `: 4` and the 0.99 / 3 / 0.0001 distribution defaults,
-- index.js `|| 100` stream batch; index.js:6829's `: 4` now reads step_post_check_concurrency.
-- Apply BEFORE any step runs on the RE-FREEZE #37 tree: an absent row fails every step by design.
--
-- Idempotent: ON CONFLICT (variable_key) DO NOTHING preserves any operator-set value.
--
-- SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (R-EB (a); R-CM; R-DF EXTERNALIZED)
-- SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §2 (the PDF politeness floor = the pace min)

-- UP
INSERT INTO logic_variables (variable_key, variable_value, description) VALUES
  ('step_maintenance_default_timeout_minutes', 15,
   'McDonald''s Airtight V3 EXT-1 (operator y 2026-10-18; Spec 124 R-EB (a)): the statement_timeout (minutes) an execution.maintenance VACUUM/ANALYZE/REINDEX runs under when its table declares no <table>_maintenance_timeout_minutes of its own. Formerly the MAINTENANCE_DEFAULT_TIMEOUT_MS = 15 * 60000 literal at scripts/lib/step/plausibility.js:369. Runner-owned: resolved for every step by scripts/lib/step/config.js RUNNER_VARIABLES; compute never sees it. CONSUMED by scripts/lib/step/plausibility.js (runMaintenanceStatement, via scripts/lib/step/index.js).'),
  ('step_audit_value_max_chars', 300,
   'McDonald''s Airtight V3 EXT-1 (operator y 2026-10-18; Spec 124 R-EB (a)): the most characters of one check value rendered into the persisted records_meta errors[]/warnings[] (LM-D16), so one large detail cannot make the audit unbounded. Formerly the RENDER_VALUE_MAX_LENGTH = 300 literal at scripts/lib/step/verdict.js:358. Runner-owned: resolved for every step by scripts/lib/step/config.js RUNNER_VARIABLES; compute never sees it. CONSUMED by scripts/lib/step/verdict.js (buildAuditTable, via scripts/lib/step/index.js).'),
  ('step_acquire_pdf_pace_ms', 2000,
   'McDonald''s Airtight V3 EXT-1 (operator y 2026-10-18; Spec 124 R-EB (a)): the floor (ms) under a pdf_document_set step''s declared document pace (pdf.pace_ms_from_config); the min 2000 is Spec 129 §2''s politeness floor, so an operator may raise it but never lower it. Formerly the PDF_PACE_FLOOR_MS = 2000 literal at scripts/lib/step/acquire.js:997. Runner-owned: resolved for every step by scripts/lib/step/config.js RUNNER_VARIABLES; compute never sees it. CONSUMED by scripts/lib/step/acquire.js (acquirePdfDocumentSet).'),
  ('step_acquire_max_redirects', 5,
   'McDonald''s Airtight V3 EXT-1 (operator y 2026-10-18; Spec 124 R-EB (a)): the most redirect hops the pdf_document_set arm follows (each hop re-checked against the host allowlist) before refusing the document as http_error. Formerly the MAX_REDIRECTS = 5 literal at scripts/lib/step/acquire.js:1022. Runner-owned: resolved for every step by scripts/lib/step/config.js RUNNER_VARIABLES; compute never sees it. CONSUMED by scripts/lib/step/acquire.js (fetchPdfCapped).'),
  ('step_phase_recancel_max_ms', 5000,
   'McDonald''s Airtight V3 EXT-1 (operator y 2026-10-18; Spec 124 R-EB (a)): the ceiling (ms) on the phase-deadline cancel-retry cadence min(max, max(min, bound/divisor)). Formerly the PHASE_DEADLINE_RECANCEL_MS = 5000 literal at scripts/lib/step/index.js:3887. Runner-owned: resolved for every step by scripts/lib/step/config.js RUNNER_VARIABLES; compute never sees it. CONSUMED by scripts/lib/step/index.js (startPhaseDeadline).'),
  ('step_phase_recancel_min_ms', 50,
   'McDonald''s Airtight V3 EXT-1 (operator y 2026-10-18; Spec 124 R-EB (a)): the floor (ms) on the phase-deadline cancel-retry cadence. Formerly the Math.max(50, …) literal at scripts/lib/step/index.js:3982. Runner-owned: resolved for every step by scripts/lib/step/config.js RUNNER_VARIABLES; compute never sees it. CONSUMED by scripts/lib/step/index.js (startPhaseDeadline).'),
  ('step_phase_recancel_divisor', 4,
   'McDonald''s Airtight V3 EXT-1 (operator y 2026-10-18; Spec 124 R-EB (a)): the fraction of the phase bound the cancel-retry cadence derives from (bound / divisor). Formerly the timeoutMs / 4 literal at scripts/lib/step/index.js:3982. Runner-owned: resolved for every step by scripts/lib/step/config.js RUNNER_VARIABLES; compute never sees it. CONSUMED by scripts/lib/step/index.js (startPhaseDeadline).'),
  ('step_stall_ticker_multiplier', 2,
   'McDonald''s Airtight V3 EXT-1 (operator y 2026-10-18; Spec 124 R-EB (a)): how many heartbeat intervals pass before the stall ticker captures its one diagnostic (interval x multiplier). Formerly the intervalMs * 2 literal at scripts/lib/step/index.js:3898. Runner-owned: resolved for every step by scripts/lib/step/config.js RUNNER_VARIABLES; compute never sees it. CONSUMED by scripts/lib/step/index.js (startStallTicker).'),
  ('step_seam_chain_run_scan_limit', 40,
   'McDonald''s Airtight V3 EXT-1 (operator y 2026-10-18; Spec 124 R-EB (a)): how many recent pipeline_runs rows the seam check scans for a shared chain_run_id (and for the temporal fallback), bound as a query parameter. Formerly the LIMIT 40 literals at scripts/lib/step/seam.js:220 and :256. Runner-owned: resolved for every step by scripts/lib/step/config.js RUNNER_VARIABLES; compute never sees it. CONSUMED by scripts/lib/step/seam.js (checkSeam, via scripts/analysis/chain-end-synthesis.mjs).')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN — manual rollback only, intentionally not transactional (matches mig 159).
-- DELETE FROM logic_variables WHERE variable_key IN ('step_maintenance_default_timeout_minutes', 'step_audit_value_max_chars', 'step_acquire_pdf_pace_ms', 'step_acquire_max_redirects', 'step_phase_recancel_max_ms', 'step_phase_recancel_min_ms', 'step_phase_recancel_divisor', 'step_stall_ticker_multiplier', 'step_seam_chain_run_scan_limit');
