# Engineering Standards — Compliance Checklist (Backend/Pipeline Scope)

Reviewers MUST evaluate the target script against each of these rules and flag every violation with a line number. Rules that do not apply (e.g., UI rules in a pipeline script) should be marked N/A with a one-line reason.

## §2 Error Handling & Stability
- **§2.3 Assumption Documentation:** Before accessing nested object properties, optional chaining `?.` or explicit null/undefined guards must be used. Non-null assertion `!` is only allowed when mathematically guaranteed by prior validation, with an inline comment explaining why.

## §3 Database Management & Scaling
- **§3.1 Zero-Downtime Migration Pattern:** Any `ALTER TABLE ... ALTER COLUMN` on tables >100K rows must use Add-Backfill-Swap-Drop. `CREATE INDEX` on large tables must use `CONCURRENTLY`.
- **§3.2 Pagination Enforcement:** Any read from `permits`, `coa_applications`, or comparably large tables must have a `LIMIT` / pagination boundary. Unbounded `SELECT *` is forbidden. Streaming (`pipeline.streamQuery`) is an acceptable substitute.

## §4 Security & API Contracts
- **§4.2 Parameterization:** Raw SQL must use parameterized queries (`$1, $2, ...`). String concatenation for dynamic queries (especially `ORDER BY` or search terms) is forbidden unless against a static whitelist.

## §6 Centralized Logging
- **§6.1 logError Mandate:** Server-side error logging must use `logError()` from `src/lib/logger.ts` — bare `console.error()` is forbidden in API routes/lib modules. (Pipeline scripts historically use `console.error` directly, but reviewers should flag catch blocks that swallow errors silently or lack context.)

## §7 Dual Code Path Safety
- **§7.1 Classification Sync:** If the script modifies trade classification logic, the TS counterpart (`src/lib/classification/classifier.ts`) must be kept in sync.
- **§7.2 Scope Classification Sync:** Same for scope classification (`src/lib/classification/scope.ts` ↔ `scripts/classify-scope.js`).
- **General:** Any logic that exists in both a TS lib and a JS script (scoring, cost, timing, opportunity, trade forecast) must be checked for drift between the two paths.

## §9 Pipeline & Script Safety
- **§9.1 Transaction Boundaries:** Multi-row mutations must be wrapped in explicit `BEGIN` / `COMMIT`. The `ROLLBACK` in the catch block must itself be wrapped in a nested try-catch (crash-on-rollback-failure protection).
- **§9.2 PostgreSQL 65,535 Parameter Limit:** Batch INSERT statements must use sub-batch chunking. Formula: `MAX_ROWS_PER_INSERT = Math.floor(65535 / column_count)`. Flag any INSERT that could exceed this limit.
- **§9.3 Idempotent Scripts:** Every pipeline script MUST be safe to re-run — use `INSERT ... ON CONFLICT DO UPDATE` (upsert) or `DELETE + INSERT` within a transaction rather than bare `INSERT`.

## Additional Buildo-specific Review Lenses
1. **Observability & Audit Tables:** Does the script emit `PIPELINE_META` (reads/writes per table) and `PIPELINE_SUMMARY` (records_total/new/updated)? Are important state transitions written to an audit/history table? Is there enough logging to debug a 3am incident?
2. **Scaling:** Does the script stream large result sets (`pipeline.streamQuery`) or load everything into memory? Are batches sized correctly? Are there N+1 query patterns? Will it still work at 10x data volume?
3. **Deep Logic Correctness:** Off-by-one errors, null propagation, date/timezone bugs (UTC vs local), floating-point rounding, percentile/median math, empty-dataset handling, tie-breaking, concurrent run safety.
4. **Failure Modes:** Partial failure recovery, resumability, what happens if the process crashes mid-run, what happens if upstream data is missing.
5. **Spec Compliance:** Does the code actually implement what the spec says? Any behavior in code that is not in the spec, or vice versa?
