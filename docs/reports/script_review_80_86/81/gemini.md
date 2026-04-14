◇ injected env (18) from .env // tip: ⌘ enable debugging { debug: true }
🔍 Adversarial review of scripts/compute-opportunity-scores.js

Here is a code review of `scripts/compute-opportunity-scores.js`.

---

- **[CRITICAL]** (line 27): Unbounded SELECT loads all active forecasts into memory. This query reads from `trade_forecasts` without a `LIMIT` or any form of pagination. As per engineering standard §3.2, this is forbidden on large tables. The `trade_forecasts` table will grow over time, and loading the entire result set into Node.js application memory will eventually exhaust available RAM, crashing the process. This is a severe scaling bottleneck. This should be rewritten to use a streaming query that processes one row at a time, or a cursor-based approach. The `pipeline` library likely has a utility for this, such as `pipeline.streamQuery`.

- **[HIGH]** (line 110): Batch updates are not atomic. The loop starting on line 110 iterates through batches and sends separate `UPDATE` queries to the database. If the script fails for any reason (e.g., database connection lost, process crash, a later batch failing due to bad data) after some batches have completed, the `trade_forecasts` table will be left in a partially updated, inconsistent state. This violates engineering standard §9.1. The entire update process should be wrapped in a single transaction. Add `await pool.query('BEGIN')` before the loop and `await pool.query('COMMIT')` after it, with appropriate `ROLLBACK` in a `catch` block.

- **[HIGH]** (line 70): Unsafe `parseFloat` can crash the script. The code uses `parseFloat(row.multiplier_bid)` and `parseFloat(row.multiplier_work)` without validating the result. If a non-numeric string (e.g., `'N/A'`) ever makes its way into the `trade_configurations` table, `parseFloat` will return `NaN`. Any arithmetic with `NaN` results in `NaN`. The final `score` will be `NaN`, and the batch update query on line 121 will fail when attempting to cast it to an integer with `::int`, halting the entire script. The fix is to validate the parsed value. A safe parsing utility function should be used, e.g., `const multiplier = parseFloat(row.multiplier_bid); if (isNaN(multiplier)) { /* use default, log error */ }`.

- **[MEDIUM]** (line 44): The `lead_key` join logic is brittle and may silently fail. The query constructs the `lead_key` using `LPAD(tf.revision_num, 2, '0')`. This assumes that the `lead_analytics.lead_key` column is *always* stored with a zero-padded revision number. If the system that generates `lead_key`s does not use padding (e.g., stores `permit:123:1` instead of `permit:123:01`), this `LEFT JOIN` will fail to find a match. This is a silent failure that would result in `tracking_count` and `saving_count` being incorrectly treated as 0, artificially inflating opportunity scores. This join logic must be verified against the actual data format in `lead_analytics` and the code that generates those keys. A canonical function for generating `lead_key` should be used everywhere to prevent this drift.

- **[LOW]** (line 65): Drift between specification and implementation variable names. The code uses `vars.los_base_divisor`, but the provided specification document refers to this variable as `los_base_unit`. While the code is internally consistent, this discrepancy increases cognitive load for new developers and makes it harder to map the implementation back to the business logic defined in the spec. Update either the code or the specification to use a consistent name.

- **[LOW]** (line 137): Inefficient telemetry query. After updating all the scores, the script runs a second query against the entire `trade_forecasts` table just to calculate the score distribution. On a very large table, this is a second expensive full table scan. This distribution could be calculated in memory during the main processing loop (lines 59-95) by incrementing counters for each tier as scores are computed. This would avoid the second query entirely, making the script faster and reducing database load.

### Overall Verdict

This script contains some sophisticated and efficient patterns, particularly the use of `UPDATE ... FROM VALUES` and the `IS DISTINCT FROM` clause to minimize write amplification. However, it is critically flawed in its approach to data fetching and transactional safety. Loading the entire dataset into memory is a non-starter for a production pipeline at scale, and the lack of a transaction around the batched updates creates a significant data integrity risk. While the core scoring logic appears to correctly implement the specification, a data quality issue in a configuration table could crash the entire process due to unsafe parsing. The script needs significant refactoring to address the scaling and atomicity issues before it can be considered production-ready.

---
⏱  48907ms
📊 Tokens: 9173 (input: 4360, output: 1075)
