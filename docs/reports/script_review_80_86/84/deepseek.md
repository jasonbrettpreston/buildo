◇ injected env (18) from .env // tip: ◈ encrypted .env [www.dotenvx.com]
🔍 Adversarial review of scripts/classify-lifecycle-phase.js

- **[CRITICAL]** (line 154-168): Advisory lock acquisition and early return leaks connection. In the early return path when lock isn't acquired, you call `lockClient.release()` then return, but the outer `try` block's `finally` (line 205) will still execute, attempting to release the lock and client again. This causes double-release of the client (second release will throw) and attempts to unlock a lock that was never acquired. This will crash the process on skipped runs. Fix by restructuring: move the lock acquisition outside the main `try` block, or set a flag to skip the finally block on early return.

- **[HIGH]** (line 186-188): Unbounded `SELECT` on `permits` table violates §3.2 pagination enforcement. The table has ~237K rows, and this loads all dirty rows into memory at once. At scale (10x data volume), this will cause memory exhaustion and process crashes. Fix by using `pipeline.streamQuery()` with a cursor or implementing chunked fetching with `LIMIT` and `OFFSET` based on `permit_num` ranges.

- **[HIGH]** (line 194-197): Another unbounded `SELECT` on `permits` table to build BLD/CMB map. This loads all permit numbers (not just dirty ones) for orphan detection. With 237K rows, this is another memory spike. The comment says "three O(n) passes" but memory usage is O(n) × 2. Fix by combining this with the dirty permits query using a window function or lateral join to compute orphan status in SQL, eliminating the separate map.

- **[HIGH]** (line 204-205): Unbounded aggregation query on `permit_inspections` (94K rows) loads results into a Map. While the result set is smaller (~10K rows), this still violates §3.2. It also creates a third large memory structure. Fix by joining this aggregation directly in the dirty permits query using a LATERAL subquery or moving the aggregation to the database side of the batch updates.

- **[MEDIUM]** (line 247-250): Time-bucket suppression logic may incorrectly suppress legitimate transitions. The `TIME_BUCKET_GROUPS` mapping includes `O2` and `O3` as same group, but `O2→O3` transition occurs when an orphan permit goes from active to stalled after 180 days—this is a real state change that should be logged for calibration. Suppressing it loses visibility into stalled orphans. Fix by removing `O2`/`O3` from the suppression map or adding a separate stall-logging mechanism.

- **[MEDIUM]** (line 307-308): CoA days_since_activity calculation uses `GREATEST(0, ...)` which returns 0 for negative values (future dates). If `last_seen_at` is in the future due to timezone or data errors, `days_since_activity` becomes 0, incorrectly marking active CoAs as not stalled. This masks data quality issues. Fix by removing `GREATEST` and letting negative values propagate, then handle them in `classifyCoaPhase` as "future activity" (e.g., treat as `null`).

- **[MEDIUM]** (line 327-328): CoA batch update uses `COA_BATCH_SIZE = 1000` with 3 parameters per row = 3000 parameters per batch, but the update SQL includes a `VALUES` clause with 3 parameters per tuple. This is safe (under 65535), but there's no guard against empty batches. If `coaUpdates.length` is 0, `chunkArray` returns `[[]]`, causing `buildCoaUpdateSQL(0)` to generate an invalid SQL with an empty `VALUES` clause. Fix by adding an early return if `coaUpdates.length === 0`.

- **[LOW]** (line 364-365): Backfill query for `phase_started_at` uses a correlated subquery (`SELECT MAX(i.inspection_date)...`) inside a `CASE` expression. This will execute for every row in the update (potentially 237K times), causing severe performance degradation. Fix by rewriting as a JOIN with an aggregated inspection CTE.

- **[LOW]** (line 389-390): Initial transition backfill query uses a `NOT EXISTS` subquery that will scan the entire `permit_phase_transitions` table for each permit. With 237K permits, this is O(n²) behavior. Fix by using an anti-join with a hash aggregate or materialized CTE.

- **[LOW]** (line 417-418): Unclassified CoA query uses complex regex normalization (`regexp_replace(COALESCE(decision,''), '\\s+', ' ', 'g')`) inline. This duplicates logic from `lib/lifecycle-phase.js`'s `normalizeDecision` function, violating DRY and risking drift. Fix by extracting normalization to a shared SQL function or computing normalized decision in application code.

- **[NIT]** (line 153): The advisory lock acquisition is wrapped in a `try` block that catches `lockErr` and releases the client, but the error is re-thrown. This is unnecessary—if `pg_try_advisory_lock` fails (e.g., database error), the connection is likely broken and `lockClient.release()` may also fail. Simplify by removing the inner `try-catch` and letting errors bubble to the outer handler.

Overall verdict: This script is architecturally sound but violates multiple engineering standards around unbounded queries and memory usage, contains a critical connection leak in the lock acquisition flow, and has several performance anti-patterns (correlated subqueries, duplicate aggregation) that will degrade at scale. The logic is robust for current data volumes but will fail catastrophically under load. Immediate fixes are required for the CRITICAL and HIGH issues; MEDIUM and LOW issues should be addressed before scaling beyond 1M rows.

---
⏱  118244ms (118.2s)
📊 Tokens — total: 15246, input: 11567, output: 3679, reasoning: 2410
