-- 278: coa (scripts/load-coa.js) — the legacy loader's literals become registered logic variables (phase-4, commit ②).
--
-- McDonald's Airtight V3 (Spec 124 R-DF EXTERNALIZED, Rule 3, R-CV form of migration 263; defect COA-D1). The
-- converted step (scripts/load-coa.descriptor.json) reads, each defaulting to the former literal's behaviour:
--   coa_page_size                              10000  (fetchAllRecords limit, load-coa.js:99)
--   coa_download_retries                           2  (MAX_RETRIES 3 = attempts, load-coa.js:34; the runner counts
--                                                      retries AFTER the first attempt, acquire.js resolveRetryPolicy)
--   coa_download_retry_backoff_ms               2000  (RETRY_BASE_MS, load-coa.js:35; waits 2000 then 4000 ms, as legacy)
--   coa_skip_rate_max_pct                          5  (skipRate >= 5 FAIL, load-coa.js:620; inclusive pct <=, R-DC form)
--   coa_max_days_stale_warn                       45  (maxDaysStale >= 45 WARN, load-coa.js:590/:626; inclusive value_max)
--   coa_applications_dead_tuple_ratio_warn_max     0  (the unconditional VACUUM ANALYZE, load-coa.js:602; COA-D7)
-- Not seeded: BATCH_SIZE 500 (load-coa.js:33) — Spec 124 R-DY (d): no per-batch transaction form, coa_batch_size is
-- not seeded; and the stats query's INTERVAL '90 days' (load-coa.js:703) — the query is dropped (operator decision 5).
--
-- All six names are NEW (the legacy loader reads none of them), so there is no copy-window row to carry: commit ②
-- lands at stage compute_ported (W4A-R6; Spec 124 R-EF) and the legacy shell keeps its literals until ③.
--
-- ORDERING (trap 7): the legacy script reads no logic variable, so the PRE captured on the ① tree stays valid after
-- this migration is applied.
--
-- Idempotent: ON CONFLICT (variable_key) DO NOTHING preserves any operator-set value.
--
-- SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 3; R-CV; R-DF EXTERNALIZED; R-DY (d))
-- SPEC LINK: docs/specs/01-pipeline/51_source_coa.md (the coa source contract)

-- UP
INSERT INTO logic_variables (variable_key, variable_value, description) VALUES
  ('coa_page_size', 10000,
   'Records per CKAN datastore_search page for the coa ingest (formerly the fetchAllRecords limit 10000, load-coa.js:99). CONSUMED by coa via inputs.reads.externals[].ckan.page_size_from_config.'),
  ('coa_download_retries', 2,
   'Retries after the first attempt per CKAN datastore_search page before the coa run fails (the legacy MAX_RETRIES 3 counted attempts, load-coa.js:34: 2 retries = the same 3 attempts). CONSUMED by coa via execution.network.retries_from_config.'),
  ('coa_download_retry_backoff_ms', 2000,
   'Backoff unit between CKAN page attempts, ms: the runner waits backoff x attempt, i.e. 2000 then 4000 ms, the legacy RETRY_BASE_MS 2000 x 2^(n-1) schedule (load-coa.js:35). CONSUMED by coa via execution.network.retry_backoff_from_config.'),
  ('coa_skip_rate_max_pct', 5,
   'FAIL bound on coa records skipped (blank REFERENCE_FILE#, schema mismatch) as a percent of records fetched (formerly skipRate >= 5, load-coa.js:620; inclusive pct <=, Spec 124 R-DC form). CONSUMED by coa via checks[].limit_from_config (skip_rate).'),
  ('coa_max_days_stale_warn', 45,
   'Portal-rot WARN bound: days from the newest CoA hearing on/before the run date to the run clock (formerly maxDaysStale >= 45, load-coa.js:590/:626; COA-D6 operator-ruled 2026-10-17; inclusive value_max). CONSUMED by coa via checks[].limit_from_config (max_days_stale).'),
  ('coa_applications_dead_tuple_ratio_warn_max', 0,
   'Dead-tuple ratio above which the runner VACUUM ANALYZEs coa_applications after the coa write (scripts/lib/step/plausibility.js runMaintenance, by naming convention). 0 = whenever any dead tuple exists, the faithful form of the legacy unconditional VACUUM (load-coa.js:602, COA-D7). CONSUMED by coa via execution.maintenance.')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN — manual rollback only, intentionally not transactional (matches mig 159).
-- DELETE FROM logic_variables WHERE variable_key IN ('coa_page_size', 'coa_download_retries', 'coa_download_retry_backoff_ms', 'coa_skip_rate_max_pct', 'coa_max_days_stale_warn', 'coa_applications_dead_tuple_ratio_warn_max');
