# Triage — `scripts/compute-cost-estimates.js` (Spec 83)

**Reviewers:** Gemini · DeepSeek R1 · Claude-adversarial · Claude-observability · Claude-spec-compliance · self
**Script:** 553 lines · Spec: `docs/specs/product/future/83_lead_cost_model.md` · TS counterpart: `src/features/leads/lib/cost-model.ts`

---

## List 1 — WF3 (Fix now; blocks production)

| # | Issue | Line(s) | Severity | Consensus | Fix |
|---|---|---|---|---|---|
| 83-W1 | **Commercial Shell 0.60x multiplier MISSING** — spec §3 line 55 explicitly requires `0.60x` on interior trade slices for Shell permits; zero implementation in JS or TS; Shell permits will overstate interior trade values by ~67% feeding inflated `trade_contract_values` to spec 81 | (absent) | CRITICAL | Gemini, Claude-spec | Detect via `permit_type` or `work` contains "shell"; apply 0.60x to the interior-trade subset in `sliceTradeValues` in BOTH JS and TS |
| 83-W2 | **Dual-path drift: `sumScopeAdditions` de-dup missing in JS** — TS (L237) wraps tags in `new Set()`; JS (L165–176) iterates raw array; `scope_tags=['pool','pool']` inflates by $80K in DB but API recomputes clean; §7.1 violation | 165–176 | CRITICAL | Claude-adv, Claude-spec | Add `new Set(tags)` wrapper in JS to match TS |
| 83-W3 | **Dual-path drift: `computeComplexityScore` de-dup missing in JS** — same issue as W2 for complexScope +10 signal | 193–199 | CRITICAL | Claude-adv, Claude-spec | Add `new Set()` wrapper |
| 83-W4 | **Liar's Gate exists in JS only, NOT in TS `cost-model.ts`** — API read path returns raw permit cost; pipeline write path writes overridden model cost; `is_geometric_override`/`cost_source='model'` fields become untrustworthy when TS recomputes | 230–244 vs cost-model.ts L342–426 | CRITICAL | Claude-adv, Claude-spec | Port Liar's Gate to TS OR extract to shared `scripts/lib/cost-model-shared.js` consumed by both |
| 83-W5 | **Advisory lock leak** — `pool.query('pg_try_advisory_lock')` at L399 and `pg_advisory_unlock` at L551 run on potentially different pool connections; session locks tie to the original backend → unlock is a no-op; lock only releases when pool.end() called at script exit | 399, 551 | CRITICAL | Claude-obs | Use `const client = await pool.connect()` and pin lock acquire + release + all queries to that client |
| 83-W6 | **Row-level try-catch inside `withTransaction` defeats atomicity** — per-row errors swallowed at L375–381 (not re-thrown); `withTransaction` COMMITs anyway with missing rows; `failed_rows` counter never incremented for row-level failures → audit table always shows `failed_rows: 0` even when 100s silently dropped | 335–381 | CRITICAL | Claude-adv, Claude-obs | Remove per-row try-catch inside the transaction; let batch fail atomically and count the whole batch as failed |
| 83-W7 | **Advisory lock ID = 74, but spec is 83** — comment says lock 74; if spec 74 (`lead_feed_design`) also uses 74 they silently serialize each other; convention (observed in other scripts) pins lock ID to spec number | 76 | CRITICAL | Claude-adv | `const ADVISORY_LOCK_ID = 83` |
| 83-W8 | **N+1 INSERT inside transaction** — 5000 single-row INSERTs per batch × 47 batches = ~235K sequential queries per run; sibling `compute-opportunity-scores.js` uses multi-row VALUES correctly; 13 cols × 5000 rows = 65K params — at edge of §9.2 limit, so cap at `MAX_ROWS_PER_INSERT = floor(65535/14)=4681` | 334–382 | HIGH | Gemini, Claude-adv, Claude-obs | Multi-row `INSERT ... VALUES ($1,...),($14,...) ON CONFLICT DO UPDATE` per batch |
| 83-W9 | **Path 3 null-return has `cost_source: 'model'` hardcoded** — no model ran yet consumers see `cost_source='model'`; misleads display logic | 250–265 | HIGH | DeepSeek, Claude-adv | Use `cost_source: 'none'` (or null) on Path 3 |
| 83-W10 | **`liar_gate_threshold` not in `ZERO_IS_INVALID`** — config-loader accepts 0; `est_const_cost < modelCost * 0` is always false → Gate silently disabled for all permits | 393 + config-loader L127 | HIGH | Claude-adv | Add `liar_gate_threshold` to `ZERO_IS_INVALID` set in `scripts/lib/config-loader.js` |
| 83-W11 | **Float edge: `modelCost > 0` fires for 1e-10** — Liar's Gate can trip on near-zero model costs | 237 | HIGH | DeepSeek | Change to `modelCost >= PLACEHOLDER_COST_THRESHOLD && !usedFallback && …` |
| 83-W12 | **`est_const_cost` NaN handling gap** — SQL `::float8` cast of non-numeric string yields NaN; `NaN > 1000 === false` routes to Path 2 silently | 230, 302 | HIGH | Claude-adv | Add `Number.isFinite(row.est_const_cost)` guard with warn log |
| 83-W13 | **streamQuery mid-stream error drops final partial batch silently** — no dedicated try/catch around `for await` loop; stream error → final batch rows never flushed + never logged | 442–478 | HIGH | Claude-obs | Wrap stream loop in try/catch with a warn log of "dropped N rows from partial final batch" |
| 83-W14 | **`model_version = 1` hardcoded** — constant/formula changes produce indistinguishable rows; no drift tracking | 367 | HIGH | All reviewers | Externalize to config or bump with formula changes (semver string, date) |
| 83-W15 | **`data_quality_snapshots` migration 080 columns dead** — `cost_estimates_total/from_permit/from_model/null_cost` never populated | (absent) | HIGH | Claude-obs | Write to `data_quality_snapshots` after each run, or drop the columns |
| 83-W16 | **Primary-parcel selection arbitrary** — `ORDER BY parcel_id ASC LIMIT 1` picks lowest ID parcel; should prefer `is_primary` or largest lot | 312–317 | HIGH | Gemini, Claude-adv, Claude-spec | Investigate `permit_parcels.is_primary` existence; switch to `ORDER BY is_primary DESC, lot_size_sqm DESC` or similar |
| 83-W17 | **SPEC LINK points to spec 72, not 83** (in both JS + TS) — traceability break; 72 and 83 both exist as separate files | 2 (+ cost-model.ts L1) | HIGH | Gemini, Claude-adv, Claude-spec | Update both files to `docs/specs/product/future/83_lead_cost_model.md` |
| 83-W18 | **Spec §6 trade-slug/percentage drift from migration 092 seed** — spec §6 lists `foundation`, `glass-glazing`, `pool`; seed uses `glazing`, `pool-installation`, no `foundation`; spec sums ~98.5% (raw), seed normalized to ~1.0 | spec §6 + migration 092 | HIGH | Claude-spec | Pick one set of slugs + percentages; update the other; add normalization note |
| 83-W19 | **Liar's Gate override count never emitted** — product-trust metric; how many permits had reported cost overridden by geometric model? | 237–244 | HIGH | Claude-obs | Accumulate `liarGateOverrides` counter; emit as audit row with `>20% → WARN` threshold |
| 83-W20 | **`determineBaseRate` silent interior_reno fallback** — demolition/sign permits default to interior_reno rate | 131 | MEDIUM | Gemini, DeepSeek | Return `null` (or a distinct `unknown` category); signal in telemetry |
| 83-W21 | **`sumScopeAdditions` no trim** — `' pool '` fails to match after lowercase only | 169 | MEDIUM | DeepSeek | `.toLowerCase().trim()` |
| 83-W22 | **Cost tier boundary exclusive upper bound** — `cost === 100000` classifies as `'small'` not `'medium'` | 178–184 | MEDIUM | DeepSeek, Claude-adv | Use `cost < tier.max` consistently with spec (or spec-decide inclusive boundary) |
| 83-W23 | **`TRADE_ALLOCATION_PCT = {}` silent failure** — if `loadMarketplaceConfigs` returns empty (DB dead), slicer returns `{}` for every permit; no warn, no fallback to hardcoded ratios | 73, 390–392 | MEDIUM | DeepSeek, Claude-adv | On empty load, fall back to `FALLBACK_TRADE_CONFIGS` and warn loudly; abort if normalization fails |

---

## List 2 — Defer (valuable but not blocking)

| # | Issue | Line(s) | Source |
|---|---|---|---|
| 83-D1 | Add nullCost reason breakdown (no_area / no_lot_size / placeholder) instead of single `nullEstimates` | 438 | Claude-obs |
| 83-D2 | Emit cost_source distribution ('permit' vs 'model' counts) to audit_table | telemetry | Claude-obs |
| 83-D3 | Emit cost_tier distribution (small/medium/large/major/mega counts) | telemetry | Claude-obs |
| 83-D4 | Emit fallback-area-usage rate (usedFallback=true fraction) | 217 | Claude-obs |
| 83-D5 | Emit trade_contract_values population rate (non-empty slug map fraction) | 205–213 | Claude-obs |
| 83-D6 | Use `telemetry_context.data_quality` for auto-`dq_*` rows with built-in thresholds | pipeline.js L210 | Claude-obs |
| 83-D7 | Always emit `failed_rows`/`failed_batches` (even at 0) — downstream tooling gets `undefined` when zero | 500–503 | Claude-obs |
| 83-D8 | Add WHERE clause to SOURCE_SQL using `permits.updated_at > (last_run)` to avoid full 237K re-scan | 294–328 | Claude-obs |
| 83-D9 | Sum-of-slices rounding doesn't reconcile to totalCost — assign remainder to largest trade | 205–213 | Gemini |
| 83-D10 | `PREMIUM_TIERS` last tier `max: null` inconsistent — use `Infinity` | 33 | DeepSeek |
| 83-D11 | `trade_contract_values: {}` stored as empty JSONB — use NULL to save space | 370 | DeepSeek |
| 83-D12 | `determineCostTier` negative cost clamps to 'small' — add `if (cost < 0) return 'invalid'` | 178 | DeepSeek |
| 83-D13 | Advisory lock timeout / retry — avoid indefinite wait | 399 | DeepSeek |
| 83-D14 | Extract dual-path constants to `scripts/lib/cost-model-shared.js` (or JSON) consumed by both JS and TS | header comment | Gemini |
| 83-D15 | Add `pg_lock_timeout` SET before lock acquire | 399 | DeepSeek |
| 83-D16 | TS `computeComplexityScore` uses `??` vs JS `||` for storeys — 0-storey permit behavior drift | 188 vs TS L266 | Claude-spec |
| 83-D17 | Add cost_estimates_history / cost_model_version_audit table for long-term drift tracking | (new table) | Claude-obs |
| 83-D18 | Factor the dedup-set pattern into a shared util so future trades/signals inherit it | 165, 193 | Claude-adv |

---

## List 3 — Spec 83 Updates Needed

| # | Spec change | Why |
|---|---|---|
| 83-S1 | Expand Commercial Shell §3 rule: enumerate WHICH trades count as "interior" (so 0.60x applies only to those slugs); define Shell detection heuristic | 83-W1 needs a precise detection contract |
| 83-S2 | Document `renter_pct > 50` → urban vs suburban coverage heuristic (or replace with a dedicated field) | 83-W coverage heuristic entirely implementation |
| 83-S3 | Document `FALLBACK_RESIDENTIAL_FLOORS=2` / `FALLBACK_COMMERCIAL_FLOORS=1` defaults | Currently magic constants |
| 83-S4 | Document primary-parcel disambiguation rule (ORDER BY is_primary → lot_size → parcel_id) | 83-W16 has no spec anchor |
| 83-S5 | Document `model_version` semantics — when to bump, what a bump means, shadow-mode for v2 | 83-W14 — orphan column |
| 83-S6 | Define `trade_contract_values` value type contract (integer dollars? decimal? unit of measure?) + key slug set (must match migration 092 seed) | Producer/consumer contract implicit |
| 83-S7 | Document Liar's Gate `usedFallback` carve-out (spec doesn't authorize skipping the gate for lot-size-based models) | WF3 Bug 4 implementation-only |
| 83-S8 | Define NULL/NaN handling for `est_const_cost` | 83-W12 silent fall-through |
| 83-S9 | Define `cost_source` enum — add `'none'` for Path 3 null-estimate rows | 83-W9 |
| 83-S10 | Fix SPEC LINK from 72 → 83 in spec metadata (and any internal doc cross-refs that still point to 72) | 83-W17 — both files exist; resolve which is canonical |
| 83-S11 | Document advisory-lock-ID convention (lock ID == spec number) | 83-W7 |
| 83-S12 | Reconcile §6 trade slugs + percentages with migration 092 seed (foundation/glazing/pool-installation naming; raw vs normalized percentages) | 83-W18 |
| 83-S13 | Specify that this script MUST populate `data_quality_snapshots` columns added in migration 080 | 83-W15 dead columns |
| 83-S14 | Define `cost_tier` boundary semantics — inclusive or exclusive upper bound at each threshold | 83-W22 |
| 83-S15 | Specify required audit metrics (Liar's Gate override count, cost_source distribution, cost_tier distribution, usedFallback rate, trade_contract_values coverage, nullCost reason breakdown) as part of the PIPELINE_SUMMARY contract | 83-D1..D5 and Claude-obs incident-response verdict |
| 83-S16 | Document dual-path policy — either "byte-for-byte sync" (with enforcement in CI) OR "move to shared module" — spec §7.1 needs teeth | 83-W2/W3/W4 all stem from header comment's "future hardening" that never lands |

---

## Verdict

**NOT safe to run in production.** 7 CRITICAL, 12 HIGH, 4 MEDIUM findings. Top ship-blockers: Commercial Shell 0.60x missing (83-W1), three dual-path drifts between JS and TS that cause DB↔API cost disagreements (83-W2/W3/W4), advisory lock leaked across pool connections (83-W5), and the row-catch-inside-transaction pattern that silently drops failed rows while reporting success (83-W6). 23 WF3 items, 18 defer items, 16 spec updates.
