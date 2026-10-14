-- 258: vocab_coverage_statement_timeout_minutes — the per-triple READ ONLY snapshot bound for
-- assert_global_coverage's vocabulary-coverage reads.
--
-- Compute-purity seam S2 (Spec 124 R-CH, operator y 2026-10-12): the vocabulary read moves out of the
-- compute (which opened its own transaction and SET LOCAL statement_timeout) into the runner-owned
-- READ ONLY snapshot `ctx.readSnapshot`, bounded by `execution.statement_timeout_minutes_from_config`.
-- The bound was a bare 15000 ms default inside scripts/lib/vocab-coverage.js; it becomes this
-- operator-visible logic variable. 0.25 minutes = 15,000 ms, so behaviour is byte-identical.
--
-- Idempotent: ON CONFLICT (variable_key) DO NOTHING preserves any operator-set value.
--
-- SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (R-CH; Rule 3 tunables externalized)
-- SPEC LINK: docs/specs/01-pipeline/49_data_completeness_profiling.md §3 (vocabulary coverage)

-- UP

INSERT INTO logic_variables (variable_key, variable_value, description) VALUES
  ('vocab_coverage_statement_timeout_minutes', 0.25,
   'assert-global-coverage: per-triple READ ONLY snapshot statement_timeout, in minutes ' ||
   '(0.25 = 15 s, the former hard-coded default). CONSUMED by assert_global_coverage.')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN — manual rollback only, intentionally not transactional
-- (matches mig 159: a transactional DOWN would destroy an operator-tuned value).
-- DELETE FROM logic_variables WHERE variable_key = 'vocab_coverage_statement_timeout_minutes';
