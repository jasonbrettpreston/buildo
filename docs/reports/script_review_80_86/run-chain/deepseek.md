◇ injected env (18) from .env // tip: ◈ encrypted .env [www.dotenvx.com]
🔍 Adversarial review of scripts/run-chain.js

## Adversarial Review

**CRITICAL ISSUES:**

- **[CRITICAL]** (line 36-37, 48-57): Unvalidated `externalRunId` integer parsing and SQL injection vulnerability. `parseInt` returns `NaN` for non-numeric input, which when used in SQL could cause type errors or unexpected behavior. The `externalRunId` is directly interpolated into SQL string concatenation (line 54: `WHERE id = $2` uses parameterization, but the previous query at line 48 uses `externalRunId` variable without validation). If `externalRunId` is `NaN` or negative, could affect wrong rows. **Fix:** Add validation: `if (externalRunId && (!Number.isInteger(externalRunId) || externalRunId <= 0)) { /* handle error */ }`.

- **[CRITICAL]** (line 175-187): Race condition in cancellation check. The script queries `pipeline_runs` for cancellation status, but between that check and step execution, another process could mark it cancelled and this script wouldn't know. Steps could continue running after cancellation. **Fix:** Use advisory locks or atomic `SELECT ... FOR UPDATE` at chain start to lock the row.

- **[CRITICAL]** (line 254): Child process spawn error handling is incomplete. If `spawn` fails (e.g., script not executable, ENOMEM), the `error` event triggers `rejectSpawn`, but there's no timeout. A hanging child process could block the entire chain indefinitely. **Fix:** Add timeout and `child.kill()`.

**HIGH ISSUES:**

- **[HIGH]** (line 135-150): Pre-flight bloat check queries `pg_stat_user_tables` which is a statistics view that may be stale (updated by ANALYZE). Relying on this for abort decisions could cause false positives. Also, the check only runs at chain start - bloat could accumulate during chain execution and cause later steps to fail. **Fix:** Use `pg_stat_user_tables` as advisory only, not for abort.

- **[HIGH]** (line 195-196): Disabled steps logic uses global `disabledSlugs` set from `pipeline_schedules`, but the query doesn't filter by chain. A step disabled for one chain would be disabled for all chains. **Fix:** Add chain-specific filtering or use scoped slugs.

- **[HIGH]** (line 233-250): StringDecoder usage has edge case: if a UTF-8 character is split across chunk boundaries, `decoder.write(data)` handles it, but the line-splitting logic (`lineBuffer.split('\n')`) could still corrupt multi-byte characters if the split occurs mid-character. **Fix:** Use `decoder.write(data)` then process complete lines, but ensure the `lineBuffer` preserves incomplete UTF-8 sequences.

- **[HIGH]** (line 309-311): Gate-skip logic depends on `recordsNew` and `recordsUpdated` being numeric. If a script outputs non-numeric values (e.g., strings), the comparison `(recordsNew || 0) === 0` will fail (e.g., `"0" === 0` is false). **Fix:** Explicit type coercion: `Number(recordsNew) === 0`.

**MEDIUM ISSUES:**

- **[MEDIUM]** (line 30-32): Synchronous manifest file read blocks event loop. For large manifests, this could cause startup delay. **Fix:** Use `fs.promises.readFile` with async/await.

- **[MEDIUM]** (line 117-130): Previous chain failure check has race condition. If two chains run concurrently, they could see each other as "previous" and incorrectly set `prevChainFailed`. **Fix:** Add `WHERE completed_at IS NOT NULL` or use `id < $2` ordering.

- **[MEDIUM]** (line 200-215): Gate-skip logic for infrastructure steps uses hardcoded prefix checks. If new infrastructure steps are added with different naming patterns, they won't be recognized and will be incorrectly skipped. **Fix:** Move infrastructure step identification to manifest configuration.

- **[MEDIUM]** (line 287-296): `summaryMatches` uses `matchAll` with global regex, which could match `PIPELINE_SUMMARY:` strings in unexpected places (e.g., in JSON values). **Fix:** Use more specific pattern like `/^PIPELINE_SUMMARY:/` or parse lines more carefully.

- **[MEDIUM]** (line 313): Step completion UPDATE query has no `.catch()`. The comment says DB failures must halt the chain, but the error will propagate to the outer catch block and be marked as step failure, which might not be accurate (could be network blip). **Fix:** Add explicit error handling that differentiates between step failure and DB failure.

**LOW ISSUES:**

- **[LOW]** (line 64-71): When using externalRunId, the script doesn't verify that the row exists and is in 'running' status. Could update wrong or already-completed run. **Fix:** Add validation query.

- **[LOW]** (line 84-90): `disabledSlugs` query failure is caught and logged, but script continues. If DB is having issues, should we really continue? **Fix:** Consider making this non-fatal but more prominent warning.

- **[LOW]** (line 220-221): Script path existence check uses `fs.existsSync` which has race condition (file could be deleted between check and spawn). **Fix:** Let spawn fail and handle the error.

- **[LOW]** (line 412): Chain metadata update uses `||` (concatenation) operator on jsonb, which will overwrite duplicate keys from left with right. If `records_meta` already had data (from earlier update?), it gets merged potentially overwriting. **Fix:** Use `jsonb_set` or more explicit merge.

**NITPICKS:**

- **[NIT]** (line 36): `parseInt` without radix parameter for `externalRunId` - though 10 is default, explicit is better.
- **[NIT]** (line 437): `setTimeout(() => process.exit(1), 500)` - hardcoded delay. Could be configurable.

**OVERALL VERDICT:**

This chain orchestration script has significant critical flaws including race conditions, incomplete error handling, and potential security issues. The architecture is complex with many interdependent state checks (gate-skip, disabled steps, cancellation, previous failure detection) that create subtle failure modes. While it includes thoughtful features like telemetry capture and bloat checking, the implementation has dangerous gaps: child processes can hang indefinitely, UTF-8 parsing can corrupt data, and concurrent execution can cause incorrect behavior. The script needs hardening around process lifecycle management, atomic state operations, and comprehensive input validation before it can be considered production-ready for mission-critical pipelines.

---
⏱  150853ms (150.9s)
📊 Tokens — total: 14327, input: 9629, output: 4698, reasoning: 3245
