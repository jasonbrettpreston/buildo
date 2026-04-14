◇ injected env (18) from .env // tip: ◈ encrypted .env [www.dotenvx.com]
🔍 Adversarial review of scripts/compute-timing-calibration-v2.js

## **ADVERSARIAL CODE REVIEW**

### **[HIGH]** (line 30-62): Hardcoded stage-to-phase mapping creates maintenance and synchronization risk.
The `STAGE_TO_PHASE_SQL` CASE expression duplicates logic from `mapInspectionStageToPhase` in `lib/lifecycle-phase.js`. The comment mentions an "infra test verifies structural parity," but this is fragile. Changes to the JavaScript mapping must be manually synchronized with this SQL, risking subtle bugs. **Fix:** Generate the SQL CASE dynamically from the JavaScript function at runtime, or store the mapping in a database table.

### **[CRITICAL]** (line 73-78): Phase ordinal mapping omits phases P1-P8 and P18.
The `PHASE_ORDINAL_SQL` only maps P9-P17. This means transitions involving phases P1-P8 or P18 will produce `NULL` ordinals, causing the forward-transition filter `(${TO_ORDINAL_SQL}) > (${FROM_ORDINAL_SQL})` to exclude valid transitions (e.g., ISSUED→P1 or P17→P18). The script will systematically undercount early and late phase transitions. **Fix:** Extend ordinal mapping to all 18 phases or adjust filter to handle `NULL` ordinals appropriately.

### **[MEDIUM]** (line 87-118): Duplicate query patterns violate DRY and increase bug surface.
The phase-pair queries for per-type and all-types are nearly identical but duplicated. Any change (like adding a filter) must be made in multiple places. The `allTypesResult` query also drops the `permits` join but keeps the same window logic, which could subtly change behavior if permits are missing. **Fix:** Refactor into a reusable function parameterized by `include_permit_type` boolean.

### **[HIGH]** (line 91, 121, 147, 169): `PERCENTILE_CONT` cast to `int` discards fractional days.
Using `::int` truncates the percentile values. If the median is 10.5 days, it becomes 10. This biases estimates downward and loses precision. The spec doesn't mandate integer days. **Fix:** Store as `numeric` or `float`, or use `ROUND()` if integers are required downstream.

### **[MEDIUM]** (line 91, 121, 147, 169): Minimum sample size (`HAVING COUNT(*) >= 5`) is arbitrary and hardcoded.
Five samples may be insufficient for stable percentiles, especially for rare phase transitions. This threshold should be configurable via `logic_variables`. **Fix:** Move `MIN_SAMPLE_SIZE` to `logic_variables` table and fetch it at runtime.

### **[HIGH]** (line 144, 166): `DISTINCT ON` without deterministic tie-breaking.
`DISTINCT ON (i.permit_num)` with `ORDER BY i.permit_num, i.inspection_date ASC` may non-deterministically choose which `stage_name` to use when multiple inspections share the same earliest date. This affects phase mapping and calibration. **Fix:** Add a tie-breaker (e.g., `i.stage_name`) to the `ORDER BY`.

### **[CRITICAL]** (line 187-208): Individual row UPSERT in loop violates §9.2 and is inefficient.
The loop does `await pool.query()` for each calibration row. With potentially thousands of rows, this creates excessive database round-trips and is slow. Also violates the 65,535 parameter limit guideline (though each INSERT has only 7 parameters, batching is still needed for performance). **Fix:** Use batch UPSERT with `UNNEST` or chunked inserts.

### **[MEDIUM]** (line 187-208): UPSERT conflict target may not match table's actual unique constraint.
The `ON CONFLICT` clause uses `(from_phase, to_phase, COALESCE(permit_type, '__ALL__'))`. This assumes the `phase_calibration` table has a unique index exactly on that expression. If the actual constraint differs (e.g., uses `NULL` instead of `'__ALL__'`), conflicts won't be detected, causing duplicate rows. **Fix:** Verify the actual constraint matches, or use the exact constraint name.

### **[LOW]** (line 209-213): No transaction wrapping the UPSERTs.
Individual UPSERTs are auto-committed. If the script fails mid-loop, the table will be left in a partially updated state. Violates §9.1. **Fix:** Wrap the entire upsert loop in a transaction with proper rollback.

### **[MEDIUM]** (line 222-236): Telemetry `newRows` calculation is race-condition prone.
`newRows = postRowCount - preRowCount` assumes no concurrent modifications to `phase_calibration`. Another process could insert/delete rows between the two counts, making `newRows` inaccurate (even negative). **Fix:** Compute new rows by tracking which keys were actually inserted vs updated during the upsert loop.

### **[MEDIUM]** (line 91, 121, 147, 169): No handling of negative `gap_days`.
Filtering `gap_days >= 0` is correct, but negative gaps indicate data corruption (inspection before previous inspection). These are silently dropped without logging or alerting. **Fix:** Log counts of negative gaps for data quality monitoring.

### **[NIT]** (line 45-62): SQL CASE sensitive to column aliasing.
`STAGE_TO_PHASE_SQL` assumes the column is named exactly `stage_name`. If used in a subquery with a different alias, it will break. The `replace` technique for `PREV_STAGE_TO_PHASE_SQL` works but is fragile. **Fix:** Use a common table expression (CTE) to standardize column names before applying the CASE.

### **[LOW]** (line 1-8): Script lacks configuration loading from `logic_variables`.
Per additional context, all scripts should fetch configuration from `logic_variables` and `trade_configurations`. This script hardcodes all thresholds (e.g., sample size ≥5). **Fix:** Use `loadMarketplaceConfigs(pool)` to fetch thresholds.

### **[MEDIUM]** (line 30-62): Case-insensitive `LIKE` patterns may match unintended stage names.
Patterns like `'%hvac%'` will match `'HVAC Final'`, which is already captured by `'%hvac final%'` and maps to P15. The order of `WHEN` clauses matters—first match wins. `'%hvac final%'` appears after `'%hvac%'`, so `'HVAC Final'` will incorrectly map to P12. **Fix:** Reorder `WHEN` clauses so more specific patterns come first, or use regex for exact matching.

**Overall verdict:** This script has critical flaws in its ordinal mapping and UPSERT performance, high-severity issues in data consistency (DISTINCT ON tie-breaking, percentile truncation), and multiple medium-severity code hygiene problems (DRY violations, hardcoded configs). It will produce systematically biased calibration data, especially for early/late phases, and will not scale. The author prioritized SQL elegance over correctness and maintainability. Immediate fixes are required for the ordinal mapping, UPSERT batching, and deterministic tie-breaking before this can be safely deployed.

---
⏱  274748ms (274.7s)
📊 Tokens — total: 15052, input: 6332, output: 8720, reasoning: 7151
