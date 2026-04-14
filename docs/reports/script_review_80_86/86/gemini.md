◇ injected env (18) from .env // tip: ⌘ custom filepath { path: '/custom/path/.env' }
🔍 Adversarial review of scripts/compute-timing-calibration-v2.js

This script has significant design and correctness flaws. It violates core engineering principles regarding transaction safety, configuration management, and code duplication. The SQL-based classification logic contains a subtle but critical bug that will lead to incorrect calibration data. The entire script needs to be reworked to use transactions, fetch configuration from the database, and consolidate its redundant and inefficient queries.

---

- **[CRITICAL]** (line 292): The multi-row UPSERT loop is not wrapped in a transaction. If the script fails for any reason halfway through the `allRows` loop (e.g., database connection drops, process is killed), the `phase_calibration` table will be left in a partially updated, inconsistent state. This violates data integrity. All multi-statement write operations must be atomic. Wrap the entire loop from lines 292-305 in a `BEGIN`/`COMMIT` block with `ROLLBACK` on error, per engineering standard §9.1.

- **[CRITICAL]** (line 20): The entire approach of mirroring `mapInspectionStageToPhase` in a hardcoded SQL `CASE` statement is a massive dual code path violation (Standard §7). The comment on line 26 acknowledges this is critical, but relying on an "infra test" is insufficient. Logic like this inevitably drifts, causing subtle, maddening bugs in production where predictions don't match what the API-side code would do. This logic must be centralized. The best fix is to create a new table, `stage_to_phase_mapping (stage_pattern TEXT, phase TEXT, precedence INT)`, and replace both this SQL and the Javascript function with a query against that table. This eliminates the dual code path entirely.

- **[HIGH]** (line 42): The classification logic in `STAGE_TO_PHASE_SQL` is buggy due to the ordering of `LIKE` clauses. For a `stage_name` like `'framing insulation'`, the expression `lower(stage_name) LIKE '%framing%'` will match first, incorrectly classifying it as `P11`. The more specific `'insulation'` rule for `P13` on line 45 is never reached. This will generate incorrect calibration data, poisoning downstream predictions. The `WHEN` clauses must be ordered from most-specific to least-specific, or the patterns must be made more precise (e.g., using word boundaries with regex or more explicit `LIKE` patterns).

- **[HIGH]** (lines 145, 191, 224, 265): The minimum sample size is hardcoded as `HAVING COUNT(*) >= 5`. The provided context document clearly outlines a new "Control Panel" schema (`logic_variables`) for centralizing exactly this kind of "magic number". This script has not been updated to follow the new configuration-driven design pattern. This creates maintenance debt and violates the project's architectural direction. This value should be fetched from `logic_variables` at the start of the script run.

- **[MEDIUM]** (line 292): The script performs a separate `UPSERT` for every row in a `for` loop. This is a classic N+1 anti-pattern. If `allRows` contains 500 items, this makes 500 separate round trips to the database. This is inefficient and slow. Refactor this to perform a single bulk upsert. You can do this by creating a large `VALUES` list, or by using a helper library like `pg-format`, or by `UNNEST`ing arrays of parameters.

- **[MEDIUM]** (lines 109, 159, 203, 241): The script executes four separate, large, and nearly identical queries. The queries for "per permit_type" and "all types" can (and should) be combined into a single query using `GROUP BY GROUPING SETS`. This would halve the number of expensive queries against `permit_inspections` and reduce code duplication. The current implementation is inefficient and violates the DRY principle.

- **[MEDIUM]** (line 274): The telemetry logic for calculating `records_new` and `records_updated` is racy and inefficient. It runs a `COUNT(*)` before and after the writes. If any other process modifies the `phase_calibration` table during the script's run, the counts will be incorrect. Furthermore, this requires three separate queries (pre-count, upserts, post-count). A more robust and efficient solution is to modify the `UPSERT` query to return whether a row was inserted or updated. You can do this by comparing the `xmax` system column in the `DO UPDATE` clause, e.g., `... DO UPDATE SET ... RETURNING (xmax = 0) AS inserted`. This gives you an accurate count in a single query pass.

- **[LOW]** (line 114): The queries perform a full scan over `permit_inspections` and `permits` without any `WHERE` clause to limit the date range. While calibration requires historical data, this will become progressively slower as these tables grow. For a regularly scheduled job, consider adding a filter to only re-process permits with recent activity (e.g., `WHERE p.updated_at > NOW() - '30 days'::interval`), and running a full historical rebuild only periodically. As-is, this does not meet the spirit of standard §3.2.

- **[NIT]** (line 71): Generating SQL via `String.prototype.replace()` is brittle. If the original `STAGE_TO_PHASE_SQL` string were ever changed to include the text "stage_name" in a comment or a different context, this replacement would break it. A safer, though more verbose, approach is to define the `CASE` statement logic in a function that takes the column name as an argument and builds the string.

### Overall Verdict

This script appears to work on the surface but is riddled with critical design flaws, correctness bugs, and performance problems. The lack of transaction safety is unacceptable for any production data pipeline. The hardcoded, duplicated logic for both classification and aggregation directly contradicts the project's stated architectural goals of centralization and configuration-driven behavior. The classification logic itself is flawed and will produce bad data. This script should not be approved. It requires a significant refactor to address the transaction, dual code path, and configuration issues before it can be considered robust and maintainable.

---
⏱  52945ms
📊 Tokens: 12046 (input: 6783, output: 1386)
