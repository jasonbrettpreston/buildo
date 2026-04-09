◇ injected env (16) from .env // tip: ⌘ enable debugging { debug: true }
🔍 Adversarial review of docs/reports/phase0-3-comprehensive-review/bundle-phase1.txt

## ADVERARIAL REVIEW FINDINGS

### **src/features/leads/types.ts**
- **[HIGH]** (line 78-79): `TradeTimingEstimateTier1` allows both `'high'` and `'low'` confidence, but the union doesn't enforce that `'low'` only occurs with staleness fallback. This allows arbitrary `tier:1, confidence:'low'` combos without staleness checks. **Fix**: Separate type for staleness fallback or runtime validation.
- **[MEDIUM]** (line 137-138): `LeadFeedCursor` sorting relies on `lead_type` and `lead_id` string ordering for pagination stability. `lead_id` is `permit_num:revision_num` vs `entity_id`—different collation rules could break cursor ordering. **Fix**: Ensure consistent zero-padding and same-length strings, or use numeric tie-breaker.
- **[LOW]** (line 149): `LeadFeedInput` has `lat`/`lng` but no validation ranges. API layer should reject invalid coordinates, but missing here. **Fix**: Add `lat ∈ [-90,90]`, `lng ∈ [-180,180]` validation before SQL.

### **src/features/leads/lib/distance.ts**
- **[MEDIUM]** (line 47-49): `formatDistanceForDisplay` uses `Math.floor(meters)` for `<1000m`. For 999.9m, displays "999m" but should round to nearest meter or show "1.0km"? Edge-case confusion at 999.5m. **Fix**: Use `Math.round` or clarify spec.
- **[NIT]** (line 38-40): `metersFromKilometers` and `kilometersFromMeters` lack precision handling. `km*1000` and `/1000` with floating-point inputs could accumulate error. **Fix**: Use integer arithmetic where possible, or round to millimeter precision.

### **src/features/leads/lib/cost-model.ts**
- **[CRITICAL]** (line 164-178): `determineBaseRate` has known gaps for "Institutional"/"Industrial"/"Mixed-Use" permits. Falls back to `BASE_RATES.sfd` or `interior_reno` arbitrarily, causing wild cost misestimates. **Fix**: Add explicit fallback rates NOW, don't wait for spec update.
- **[HIGH]** (line 241-243): `computeBuildingArea` uses `FALLBACK_URBAN_COVERAGE = 0.7`, `FALLBACK_SUBURBAN_COVERAGE = 0.4`. No source cited; arbitrary constants produce ±30% error. **Fix**: Document derivation from zoning bylaws or empirical data.
- **[HIGH]** (line 333-334): `buildDisplay` uses `premiumFactor >= 1.35` to tag "Premium neighbourhood". This threshold is hardcoded, not derived from `PREMIUM_TIERS`. Income $100k–150k yields 1.35x—is that truly "premium"? **Fix**: Use income >150k threshold explicitly.
- **[MEDIUM]** (line 314-315): `estimateCost` returns `computed_at: now` per call. Batch processing in `compute-cost-estimates.js` will have microsecond variations across rows. Breaks "same batch" grouping. **Fix**: Accept optional `computed_at` parameter, default to `now`.
- **[MEDIUM]** (line 204-205): `isCommercial` checks for "commercial", "office", "retail". Misses "industrial", "warehouse", "hotel". May misclassify. **Fix**: Expand list or use allowlist from permit data.
- **[LOW]** (line 277-279): `sumScopeAdditions` lowercases tags but `scope_tags` may have standardized enums. Case-insensitive comparison is defensive but could match unintended tags. **Fix**: Use exact enum matching, validate upstream.

### **src/features/leads/lib/timing.ts**
- **[CRITICAL]** (line 280-292): `getStageSequence` hardcodes stage-name→sequence mapping. If `inspection_stage_map` adds new stages, this function returns `null`, breaking `tier1StageBased` logic for those stages. **Fix**: Fetch sequence from DB or have a fallback sequence value.
- **[HIGH]** (line 239-241): `findEnablingStage` uses `LIMIT 1` with `ORDER BY precedence ASC`. If multiple rows for same `trade_slug`, picks arbitrary one. Could miss correct stage. **Fix**: Validate uniqueness in `inspection_stage_map` or add error if >1 row.
- **[HIGH]** (line 184-186): `pickBestCandidate` joins `permit_parcels` twice—expensive for permits with many parcels. No index hints. Could become slow. **Fix**: Add composite index on `parcel_id, permit_num, revision_num`.
- **[MEDIUM]** (line 387-389): `tier2IssuedHeuristic` uses `calibrationCache` global. If cache load fails, empty map persists for `REFRESH_INTERVAL_MS` (5 min). During outage, every request uses bootstrap fallback, but logs only once. **Fix**: Implement exponential backoff retry for cache load.
- **[MEDIUM]** (line 409-411): `tier2IssuedHeuristic` calculates `elapsedDays` using `daysBetween` with `issued_date`. If `issued_date` is future-dated (data error), `elapsedDays` negative, causing negative `remainingMin/Max`. **Fix**: Clamp `elapsedDays ≥ 0`.
- **[LOW]** (line 150-152): `ensureCalibrationLoaded` sets `calibrationCache = new Map()` on error, but `calibrationLoadedAt` remains 0. Next call within 5 min will retry (good), but if error persists, will retry every call. Could cause DB thundering herd. **Fix**: Implement circuit-breaker pattern.

### **src/features/leads/lib/builder-query.ts**
- **[HIGH]** (line 118-122): `BUILDER_QUERY_SQL` uses `(SELECT business_size FROM wsib_registry ... LIMIT 1)` subquery without correlation to main query's `e.id` in `builder_aggregates`? Actually it's correlated via `WHERE w.linked_entity_id = e.id`. OK, but subquery runs per row—performance hit. **Fix**: Use `LATERAL JOIN` as in lead-feed SQL.
- **[MEDIUM]** (line 136-138): `fit_score` calculation uses `LEAST(..., 20)` to cap at 20. However, `active_permits_nearby >= 5` gives 20, plus WSIB bonus 3 → 23, capped to 20. WSIB bonus is useless at high activity. **Fix**: Reorder: apply WSIB bonus before cap, or adjust base values.
- **[LOW]** (line 199): `toNumberOrNull` converts `string | number | null`. If `avg_project_cost` is `string` due to SQL aggregation, `Number()` may return `NaN` (not finite). Returns `null`—good. But `Number('')` is 0 (finite)—could misinterpret empty string as zero cost. **Fix**: Explicitly check for empty string.

### **src/features/leads/lib/get-lead-feed.ts**
- **[CRITICAL]** (line 149-151): `LEAD_FEED_SQL` uses `LPAD(p.revision_num, 2, '0')` for `lead_id`. If `revision_num` is not numeric (e.g., "A"), `LPAD` returns "0A", breaking `lead_id` uniqueness. **Fix**: Validate `revision_num` is numeric upstream, or use `regexp_replace`.
- **[HIGH]** (line 244-246): `mapRow` drops malformed rows with `logWarn`. If SQL UNION produces many malformed rows, feed returns fewer items than `limit` silently. Client may paginate forever. **Fix**: Throw error if >X% rows malformed, or at least count dropped rows in meta.
- **[HIGH]** (line 206-208): Cursor pagination uses tuple comparison `(relevance_score, lead_type, lead_id) < ($6, $7, $8)`. With `ORDER BY relevance_score DESC, lead_type DESC, lead_id DESC`, the inequality must match order direction. Correct if using `<` with same ordering? Actually `ORDER BY DESC` with `<` yields previous page. Might be correct but subtle. **Fix**: Comment why this works, or use `ROW()` constructor.
- **[MEDIUM]** (line 130-132): Builder `value_score` uses `AVG(p.est_const_cost)` filtered `WHERE p.est_const_cost > 0`. If all nearby permits have `est_const_cost = 0` or `null`, average is `null` → score 3. This may unfairly penalize builders with zero-cost permits (data issue). **Fix**: Treat `null` as unknown, but zero as "small" score.
- **[LOW]** (line 299-301): `getLeadFeed` clamps `radius_km` and `limit` but does not adjust `cursor` accordingly. If original `radius_km` was >MAX, cursor from previous page may skip valid items. **Fix**: Reject cursor if radius changed, or recompute cursor score based on new radius.

### **src/features/leads/lib/record-lead-view.ts**
- **[MEDIUM]** (line 95-97): `recordLeadView` runs upsert and competition count in separate transactions. Concurrent views can cause count to be off by ±N. Acceptable per spec, but could confuse users. **Fix**: Use `SERIALIZABLE` transaction or accept race condition.
- **[LOW]** (line 64-66): `buildLeadKey` uses `padStart(2,'0')`. If `revision_num` is "000", becomes "00"? Actually `"000".padStart(2,'0')` is "000" (length ≥2). Could produce 3-digit key, breaking match with SQL's `LPAD(p.revision_num, 2, '0')` (max 2). **Fix**: Use `slice(-2)` or enforce revision_num length ≤2 upstream.

## OVERALL VERDICT

The code is well-structured with defensive programming and good error handling, but contains several critical flaws: cost-model's unknown permit-type fallback is dangerously arbitrary, timing's hardcoded stage-sequence mapping is brittle, and lead-feed's cursor pagination has subtle ordering risks. The dual code-path requirement (TS↔JS) is a maintenance hazard. Multiple magic numbers and thresholds lack derivation. Security is adequate with input clamping and SQL parameterization, but data validation is incomplete. Priority fixes: cost-model fallback rates, stage-sequence DB-driven lookup, and cursor pagination validation.

---
⏱  162794ms (162.8s)
📊 Tokens — total: 29801, input: 22919, output: 6882, reasoning: 4487
