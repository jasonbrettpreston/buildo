◇ injected env (18) from .env // tip: ◈ encrypted .env [www.dotenvx.com]
🔍 Adversarial review of scripts/compute-cost-estimates.js

- **[CRITICAL]** (line 215): No error handling for `loadMarketplaceConfigs` failure. If DB config fetch fails (e.g., network timeout, schema mismatch), `TRADE_ALLOCATION_PCT` stays empty object and `LIAR_GATE_THRESHOLD` stays 0.25 default, causing all trade slicing to produce empty `trade_contract_values` and potentially wrong liar's gate behavior. Fix: Wrap in try-catch with fallback to hardcoded defaults and explicit error logging.

- **[CRITICAL]** (line 92): Division by zero risk in `computeBuildingArea`. If `row.lot_size_sqm = 0`, `row.lot_size_sqm * coverage * floors` yields zero area, causing modelCost = 0 in line 128. Zero-cost estimates propagate downstream. Fix: Add guard `if (row.lot_size_sqm <= 0) return { area: 0, usedFallback: true };`.

- **[HIGH]** (line 135): Floating-point equality bug. `modelCost > 0` uses strict inequality, but `modelCost` can be extremely small positive float from multiplication (e.g., 1e-10). This triggers liar's gate incorrectly for tiny modeled costs. Fix: `if (modelCost >= PLACEHOLDER_COST_THRESHOLD && !usedFallback && ...)`.

- **[HIGH]** (line 218-219): Advisory lock acquisition lacks timeout. If another process crashes while holding lock, this script will wait indefinitely until that connection closes. In containerized env with connection pooling, could deadlock for hours. Fix: Use `pg_try_advisory_lock` with retry loop and max attempts, or use `lock_timeout` setting.

- **[HIGH]** (line 175-176): Missing validation that `TRADE_ALLOCATION_PCT` values sum to ≤1.0. If DB config has erroneous percentages summing to 1.5, `sliceTradeValues` will allocate 150% of total cost, distorting downstream analytics. Fix: Add normalization or validation check after loading config, log warning if sum ≠ 1.

- **[MEDIUM]** (line 72): `determineBaseRate` fallback logic flaw. If permit is renovation but `permit_type` and `work` fields are null/empty, function returns `BASE_RATES.interior_reno` (line 72) even for exterior work. This misclassifies additions as interior reno. Fix: Explicitly check for known exterior keywords before falling back.

- **[MEDIUM]** (line 100): `sumScopeAdditions` does case-insensitive match but doesn't trim whitespace. If tag is `" pool "` (with spaces), it won't match. Tags from DB may have padding. Fix: `const norm = (tag || '').toLowerCase().trim();`.

- **[MEDIUM]** (line 254-257): Batch failure recovery discards entire batch without retry or dead-letter queue. If a single row has malformed data causing constraint violation, 5000 rows are lost. Fix: Implement per-row try-catch inside batch, collect problematic rows for later analysis.

- **[MEDIUM]** (line 122-124): `estimated_cost` null handling inconsistency. When `area = 0` and `est_const_cost ≤ PLACEHOLDER_COST_THRESHOLD`, function returns null for all fields (line 124). But `cost_source` is hardcoded to 'model' instead of 'none'. Downstream logic may misinterpret. Fix: Set `cost_source: 'none'` in null-return path.

- **[MEDIUM]** (line 143): `determineCostTier` uses exclusive upper bounds (`cost < COST_TIER_BOUNDARIES.medium.min`). A cost exactly equal to 100,000 falls into 'small' tier instead of 'medium'. This creates boundary discontinuities. Fix: Use `cost <= tier.max` for all non-null max tiers.

- **[LOW]** (line 190): Hardcoded `model_version: 1`. When cost model evolves, old and new estimates become indistinguishable. Fix: Pull from a shared constant or config file that increments with model changes.

- **[LOW]** (line 288-289): `model_coverage_pct` calculation uses `nullEstimates` which counts rows where `estimated_cost` is null. However, `nullEstimates` also includes rows where area=0 but `est_const_cost > PLACEHOLDER_COST_THRESHOLD` (which should have a permit-based cost). This undercounts coverage. Fix: Track nulls due to area=0 separately.

- **[LOW]** (line 105): `determineCostTier` doesn't handle negative costs. If bug produces negative `estimated_cost`, function returns 'small' tier (since -1 < 100000). Negative costs should be caught earlier. Fix: Add `if (cost < 0) return 'invalid';` or clamp to zero.

- **[NIT]** (line 26): `PREMIUM_TIERS` last tier has `max: null`. While loop handles null correctly, this is inconsistent with other tiers. For clarity, set `max: Infinity`.

- **[NIT]** (line 204): JSONB serialization of empty object `{}` for `trade_contract_values` when `sliceTradeValues` returns empty. Could store NULL instead to save space. Fix: `JSON.stringify(r.trade_contract_values || null)`.

**Overall verdict:** This script has critical gaps in configuration error handling and mathematical edge cases (division by zero, floating-point comparisons) that could silently corrupt cost estimates. The batch processing lacks resilience—single row failures discard entire batches. The advisory lock mechanism risks deadlocks in production. While the core model logic is sound, the operational hardening is insufficient for a mission-critical pipeline that feeds financial decisions. Immediate fixes needed for config loading, zero-area handling, and batch error isolation.

---
⏱  122071ms (122.1s)
📊 Tokens — total: 13368, input: 9489, output: 3879, reasoning: 2612
