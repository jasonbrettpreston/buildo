◇ injected env (18) from .env // tip: ⌘ override existing { override: true }
🔍 Adversarial review of scripts/compute-trade-forecasts.js

Here is your adversarial code review.

---

- **[CRITICAL]** (line 182): The script loads all active permit-trade pairs into memory with an unbounded `SELECT` query. This directly violates engineering standard §3.2 (Pagination Enforcement). As the `permits` and `permit_trades` tables grow, this query will exhaust the script's memory, causing it to crash. The `.toLocaleString()` in the log message on line 198 indicates awareness that this number can be large, making the lack of streaming or pagination inexcusable.
**Fix:** Refactor the entire processing logic (lines 182 through 411) to use a database cursor or paginated queries. Use `pipeline.streamQuery` or a `LIMIT`/`OFFSET` loop to process permits in manageable chunks instead of loading the entire dataset at once.

- **[CRITICAL]** (line 326, 381): The stale forecast `DELETE` and the new forecast `UPSERT`s are performed as separate, non-atomic operations. There is no transaction wrapping these mutations. If the script fails for any reason after the `DELETE` (line 326) but before all `UPSERT` batches complete (line 411), the `trade_forecasts` table will be left in a permanently inconsistent state, with valid forecasts having been deleted but not replaced. This violates standard §9.1 (Transaction Boundaries).
**Fix:** Wrap the entire mutation phase in a transaction. Add `await pool.query('BEGIN')` before line 326. Wrap the `DELETE` and the `UPSERT` loop in a `try...catch...finally` block that issues a `COMMIT` on success and a `ROLLBACK` on failure.

- **[HIGH]** (line 89): The main async function of `pipeline.run` lacks a top-level `try...catch` block. Any single rejected promise from a database query (e.g., `loadMarketplaceConfigs`, the main `SELECT`, any batch `UPSERT`) will result in an unhandled promise rejection, crashing the entire script. This makes the pipeline brittle and provides no opportunity for graceful failure, logging, or transaction rollback.
**Fix:** Wrap the entire body of the `async (pool) => { ... }` function in a `try...catch` block. The `catch` block should log the specific error and ensure a transaction is rolled back if one was initiated.

- **[MEDIUM]** (line 306, 64): The `classifyUrgency` function is not robust against missing configuration. If `logicVars.expired_threshold_days` is `undefined` because it's missing from the database, `Math.abs(undefined)` on line 65 results in `NaN`. The comparison `daysUntil <= NaN` is always false, meaning no forecast can ever be classified as `expired`. This silently degrades the system's ability to filter out dead leads.
**Fix:** Provide a hardcoded fallback for `expired_threshold_days` at the call site, e.g., `classifyUrgency(daysUntil, isPastTarget, logicVars.expired_threshold_days || -90)`. Alternatively, the `config-loader` should be responsible for guaranteeing non-null values for critical variables.

- **[MEDIUM]** (line 223): The script assumes that `lifecycle_phase` values from the `permits` table will always have a corresponding entry in the `PHASE_ORDINAL` constant map. If a new phase is introduced in the database but not in the shared library, `PHASE_ORDINAL[lifecycle_phase]` will be `undefined`. The `!= null` checks on line 235 correctly prevent a crash, but the permit will silently fall through to the `work_phase` target logic, which may be incorrect and produce a wildly inaccurate forecast.
**Fix:** Add an `else` block after the bimodal routing logic (around line 241) to handle cases where `currentOrdinal` or `bidOrdinal` is null. It should log a warning with the permit number and unmapped phase, and then `continue` to the next record to avoid generating a forecast based on bad data.

- **[LOW]** (line 335): The list of terminal/orphan phases is hardcoded inside the `DELETE` query string. This is a duplicate of the `SKIP_PHASES` constant defined on line 28. If a new phase is added to `SKIP_PHASES`, it must also be manually added to this SQL string. This is fragile and prone to drift.
**Fix:** Build the `IN (...)` clause dynamically using a parameterized query. Generate a placeholder string like `p.lifecycle_phase NOT IN (${Array.from(SKIP_PHASES).map((_, i) => `$${i+1}`).join(',')})` and pass the `SKIP_PHASES` values as parameters to the query.

- **[NIT]** (line 263): Using `new Date(phase_started_at)` is susceptible to timezone parsing issues depending on the exact string format returned by the database driver. While it often works correctly with timestamp-with-timezone types, it's not guaranteed to be consistent across all environments. A more robust method is to receive the date as a string and parse it explicitly.
**Fix:** Since all subsequent math is in UTC, ensure the database driver is configured to return timestamps in a consistent ISO 8601 format and that parsing here doesn't implicitly convert to the server's local timezone before being normalized back to UTC.

---

### Overall Verdict

This script contains critical architectural flaws that jeopardize data integrity and scalability. The in-memory processing of the entire dataset is a ticking time bomb that guarantees future production failures, and the lack of a transaction around the delete-then-upsert logic creates a significant risk of data loss. While the core business logic for bimodal routing and stall recalibration appears complex and well-considered, it is built on a fragile foundation. The identified issues must be addressed before this code can be considered production-ready. The author has clearly put thought into the details of the forecasting algorithm but has overlooked fundamental principles of robust pipeline construction.

---
⏱  51463ms
📊 Tokens: 13296 (input: 7979, output: 1335)
