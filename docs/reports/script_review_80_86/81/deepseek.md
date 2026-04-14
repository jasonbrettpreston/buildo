◇ injected env (18) from .env // tip: ◈ secrets for agents [www.dotenvx.com]
🔍 Adversarial review of scripts/compute-opportunity-scores.js

**[HIGH]** (line ~40): Unbounded SELECT without streaming or pagination. The query loads all active `trade_forecasts` rows into memory at once, which will cause memory exhaustion at scale (millions of rows). Use `pipeline.streamQuery()` with batch processing or implement cursor-based pagination with `LIMIT` and `OFFSET`.

**[HIGH]** (line ~60-66): Missing transaction boundary for multi-batch updates. If the script crashes after batch 2 of 10, the database is left partially updated. Wrap the entire scoring + update loop in an explicit `BEGIN`/`COMMIT` with a `ROLLBACK` in a try-catch that itself catches rollback failures.

**[MEDIUM]** (line ~53): No validation or fallback for missing `logic_variables`. If `vars.los_base_divisor` is 0 (or null), the division will produce Infinity/NaN, breaking scoring. Add defensive checks: `const divisor = vars.los_base_divisor || 10000;` and log an error if critical variables are missing.

**[MEDIUM]** (line ~56-64): Urgency multiplier fallback logic is brittle. If `row.multiplier_bid` is `null` and `vars.los_multiplier_bid` is also missing/unset, `parseFloat(undefined)` returns `NaN`, making all scores NaN. Should be: `parseFloat(row.multiplier_bid ?? vars.los_multiplier_bid ?? 1.0)`.

**[MEDIUM]** (line ~40): LEFT JOIN on `lead_analytics` uses a computed `lead_key` that may not match the actual key format. If the format diverges (e.g., revision padding changes), all competition counts become 0, inflating scores silently. Validate the key format in a test or use a stored function.

**[MEDIUM]** (line ~40): Missing index coverage check. The query joins on `tf.permit_num, tf.revision_num` and filters on `tf.urgency`. No mention of indexes in spec; without a composite index on `(urgency, permit_num, revision_num)` plus indexes on join columns, performance will degrade.

**[LOW]** (line ~67-69): Competition penalty can exceed 100, but clamping happens after subtraction. If `base=30, multiplier=3.5 → 105, penalty=200`, raw = -95 → score 0. This is mathematically correct but wastes compute. Consider early exit: if `penalty >= base * multiplier`, set score = 0 immediately.

**[LOW]** (line ~53): Extracting `tradeValues[row.trade_slug]` assumes the JSONB key exists and is a number. If the value is a string or null, `tradeValue` becomes 0 (due to `|| 0`), which may hide data corruption. Add a warning log if `typeof tradeValue !== 'number'`.

**[LOW]** (line ~40): `WHERE tf.urgency NOT IN ('expired')` assumes 'expired' is the only excluded value. If new urgency values are added (e.g., 'archived'), they will be included incorrectly. Use `WHERE tf.urgency <> 'expired'` or a positive list (`IN ('bid', 'work')`).

**[LOW]** (line ~85): Integrity audit only logs a warning. Tracked leads with no geometric basis indicate data inconsistency but are not flagged for follow-up. Should insert into an `audit_issues` table or at least emit a distinct metric for alerting.

**[NIT]** (line ~95-110): Batch UPDATE uses `IS DISTINCT FROM` to avoid no-op updates, but this prevents index-only updates and forces full row evaluation. Since scores are recomputed nightly, consider unconditional update or add a condition `AND (tf.opportunity_score IS NULL OR tf.opportunity_score != v.score)`.

**[NIT]** (line ~40): SQL string lacks formatting for readability in logs. Consider using a dedicated SQL template function or at least break lines consistently for debugging.

**Overall verdict:** This script has critical scaling flaws (unbounded SELECT, no transactions) and several medium-severity data safety issues (missing validation, brittle joins). It will fail catastrophically at production scale or with malformed configuration data. The logic is correct for the happy path, but the lack of defensive programming and observability makes it brittle and hard to debug during failures. Prioritize adding transaction boundaries, streaming the input query, and validating all configuration inputs with explicit defaults.

---
⏱  111192ms (111.2s)
📊 Tokens — total: 7612, input: 4089, output: 3523, reasoning: 2565
