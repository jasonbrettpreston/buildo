# Active Task: WF1 #coa-pipeline-parity-phase-d-R5.5 — compute-coa-cost-estimates.js (geometric-only cost path producing coa_applications cost cols + lead_id-keyed cost_estimates rows)

**Status:** Implementation (4-reviewer plan review complete; 14 folds applied; user authorized 2026-05-14 with Spec 48 observability reference)
**Workflow:** WF1 (New Feature — NEW consumer script for the R5.1 substrate at `scripts/lib/coa-cost-model.js`; reuses existing Brain at `src/features/leads/lib/cost-model-shared.js` unchanged)
**Domain Mode:** Backend/Pipeline (`scripts/`, `src/lib/cost/`, `docs/specs/`)
**Rollback Anchor:** `d474208` (R5.4 classify-coa-trades shipped)
**Parent WF:** WF1 #coa-pipeline-parity-phase-d (R5.1 ✅ → R5.2 ✅ → R5.3 ✅ → R5.4 ✅ → **R5.5** → R5.6 manifest registration)
**Predecessor:** R5.4 (commit `d474208`)
**Adversarial review:** USER-REQUESTED — 4 reviewers: independent worktree + Gemini + DeepSeek + an ADDITIONAL adversarial focused on observability + integration + logic.

## Context
* **Goal:** Build `scripts/compute-coa-cost-estimates.js` — the CoA-side cost estimator. Streams CoAs joined with parcel/building/neighbourhood/trade context through the existing `estimateCostShared` Brain (configured for geometric-only mode via R5.1 substrate `scripts/lib/coa-cost-model.js`), writing 4 cost columns to `coa_applications` plus an UPSERT into `cost_estimates` keyed on `lead_id` (Phase D PK per mig 145).
* **Target Spec:** `docs/specs/01-pipeline/42_chain_coa.md` §6.5 (step 12 — cost) + §6.6.D (column table rows for `modeled_gfa_sqm`/`estimated_cost`/`cost_source`/`cost_classified_at`) + §6.8 row 668 (Spec 47 compliance contract) + `docs/specs/01-pipeline/83_lead_cost_model.md` §Geometric-Only Path for CoA + §7 Engine Mechanics + `docs/specs/01-pipeline/47_pipeline_script_protocol.md` §R1-R12.
* **Key Files (read at plan time):**
  - `docs/specs/01-pipeline/42_chain_coa.md` §6.5, §6.6.D, §6.7, §6.8 (lock 4204 row), §6.11 Phase D R5.5
  - `docs/specs/01-pipeline/83_lead_cost_model.md` §Geometric-Only Path for CoA (lines 118-130) + §7 Engine Mechanics
  - `docs/specs/01-pipeline/47_pipeline_script_protocol.md` §R1-R12 + §6.3 BATCH_SIZE + §8.1 records_updated
  - `migrations/138_promote_cost_estimates_lead_id_not_null.sql` (lead_id NOT NULL)
  - `migrations/145_phase_d_classifier_substrate.sql` (cost_estimates PK swap to lead_id + cost_source CHECK extension)
  - `scripts/compute-cost-estimates.js` (twin — read for pattern, NOT byte parity; permit-side is still PK on (permit_num, revision_num) until §6.9 REKEY)
  - `scripts/lib/coa-cost-model.js` (R5.1 substrate — already shipped at cea6d47; reuse as-is)
  - `src/features/leads/lib/cost-model-shared.js` (Brain — reused unchanged)
  - `src/tests/coa-cost-model.logic.test.ts` (R5.1 substrate tests — extend if needed)

## Technical Implementation
* **New Components:**
  - **NEW** `scripts/compute-coa-cost-estimates.js` — consumer script (~300 lines)
  - **NEW** `src/tests/compute-coa-cost-estimates.infra.test.ts` — Spec 47 §R1-R12 + R5.5 contract regression-lock
  - **EXTEND** `src/tests/coa-cost-model.logic.test.ts` — add fixtures covering scope_tags-rateable vs non-rateable paths (per Spec 42 line 207 test contract)
* **Data Hooks/Libs:** Reuses existing `scripts/lib/coa-cost-model.js` (buildCoaConfig + mapCoaRowToBrainInput) — no new lib code.
* **Database Impact:** NO — schema unchanged; mig 145 already enabled CoA-side writes (lead_id PK + 'geometric' cost_source + nullable permit_num/revision_num). Write target: `coa_applications` (4 cols) + `cost_estimates` (15 cols via existing schema).

## Standards Compliance
* **Try-Catch Boundary:** Pipeline SDK handles top-level; per-batch failures propagated via `withTransaction` rollback.
* **Unhappy Path Tests:** (1) CoA with no `lead_parcels` row → NULL cost + reason='no_parcel'; (2) CoA with parcel but no `parcel_buildings`/`building_footprints` → NULL cost + reason='no_building'; (3) CoA with `scope_tags=NULL` → NULL cost + reason='no_scope_tags'; (4) CoA with `scope_tags` non-NULL but zero rateable tags → NULL cost + reason='no_rate'; (5) idempotency — re-run with no source changes produces 0 records_updated.
* **logError Mandate:** N/A — no new catch blocks (SDK-managed via withTransaction).
* **UI Layout:** N/A (backend script).

## Spec 42 §6.8 row 668 Contract

| Field | Requirement | Plan compliance |
|---|---|---|
| Advisory lock | 4204 | `const ADVISORY_LOCK_ID = 4204;` |
| §R7 Read | streamQuery 6-table LEFT JOIN: `coa_applications ca → lead_parcels lp ON lp.lead_id = ca.lead_id → parcels p → parcel_buildings pb → building_footprints bf → neighbourhoods n → lead_trades lt LATERAL filtered ON lt.lead_id = ca.lead_id`. All JOINs use `ca.lead_id` directly | Mirrored. `lead_trades lt` aggregated via LATERAL `ARRAY_AGG(t.slug) FILTER (WHERE lt.is_active = true)` |
| §R7 Cursor predicate | (none in spec literal — design choice) | Plan choice: `WHERE cost_classified_at IS NULL OR cost_classified_at < trade_classified_at` — re-fetches when R5.4 produces new trade outputs |
| §R9 Write atomicity | `withTransaction` → UPDATE `coa_applications` cost columns AND INSERT `cost_estimates` row keyed on `lead_id`. Atomic | Single `withTransaction` per batch: (a) bulk UPSERT `cost_estimates`, (b) bulk UPDATE `coa_applications` |
| §R9 cost_source | `'geometric'` always (permitted by mig 145 CHECK) | Plan: transform Brain's `cost_source='model'`/`'none'` → `'geometric'` for CoAs producing a non-null estimate; preserve `'none'` for skip cases |
| §R9 permit_num/revision_num | NULL (permitted by mig 145 DROP NOT NULL) | Plan: pass NULL through to `cost_estimates` rows |
| §R10 audit_table | `cost_estimate_coverage_pct`, `null_cost_reasons` (no_parcel/no_building/no_scope_tags/no_rate), `cost_distribution_p25_p50_p75` | All three emitted as audit rows (coverage_pct with WARN threshold from `coa_cost_coverage_threshold_pct` logic_var) |

## Classifier output (per CoA → 0..1 cost_estimates row + always 1 coa_applications UPDATE)

For each CoA processed:
- **Always:** UPDATE `coa_applications` SET `cost_classified_at = $RUN_AT`, plus `modeled_gfa_sqm`/`estimated_cost`/`cost_source` (NULL if no estimate produced).
- **When estimate produced (non-NULL):** UPSERT into `cost_estimates` with:
  - `lead_id` = `ca.lead_id`
  - `permit_num` = NULL
  - `revision_num` = NULL
  - `estimated_cost` = Brain output
  - `cost_source` = `'geometric'` (transformed from Brain's `'model'`)
  - `cost_tier`, `cost_range_low`, `cost_range_high`, `premium_factor`, `complexity_score`, `model_version`, `is_geometric_override`, `modeled_gfa_sqm`, `effective_area_sqm`, `trade_contract_values`, `computed_at` — pass-through from Brain
- **When no estimate (no_parcel / no_building / no_scope_tags / no_rate):** `coa_applications` still gets `cost_classified_at = $RUN_AT` to advance the cursor + `cost_source = 'none'`; NO `cost_estimates` row written (avoids polluting the cost-distribution percentile).

### NULL-reason buckets (R5.4 lesson — actionable observability)

| Reason | Detection condition | Notes |
|---|---|---|
| `no_parcel` | `coaRow.parcel_id IS NULL` (LEFT JOIN miss on `lead_parcels`) | R5.2 link-coa-to-parcels didn't link |
| `no_building` | `coaRow.parcel_id NOT NULL` but `building_footprint.footprint_area_sqm IS NULL` | Parcel linked but no massing |
| `no_scope_tags` | `coaRow.scope_tags IS NULL OR LENGTH = 0` | R5.3 classify-coa-scope didn't classify |
| `no_rate` | All other failure modes (Brain returned null cost) — typically: scope_tags exist but no matching `trade_sqft_rates` row, or `active_trade_slugs` empty (R5.4 produced no trades) | Catch-all reason |

Emitted as `records_meta.null_cost_reasons = { no_parcel: N, no_building: N, no_scope_tags: N, no_rate: N }` PLUS an audit_table row per reason (4 INFO rows) so the dashboard surfaces the breakdown.

### Cost-distribution percentiles

For all CoAs with non-NULL `estimated_cost` in this run:
- `cost_distribution_p25_p50_p75` = `{ p25, p50, p75 }` (using JS percentile-rank from sorted array — bounded by INSERT_BATCH_SIZE × number of batches, finite memory)

Emitted as `records_meta.cost_distribution = { p25, p50, p75 }` PLUS a single audit_table row with value formatted as `"$X / $Y / $Z"`.

## Audit table

| Metric | Value | Threshold | Status |
|---|---|---|---|
| `coa_eligible` | processed (CoA count) | `> 0` | WARN if 0 (Worktree#2 IMP-1 lesson from R5.4) |
| `coa_with_cost` | count of CoAs producing non-NULL estimated_cost | null | INFO |
| `coa_without_cost` | count of CoAs producing NULL estimated_cost | null | INFO |
| `cost_estimate_coverage_pct` | (coa_with_cost / processed) * 100 | `>= coa_cost_coverage_threshold_pct%` | PASS / WARN |
| `null_reason_no_parcel` | count | null | INFO |
| `null_reason_no_building` | count | null | INFO |
| `null_reason_no_scope_tags` | count | null | INFO |
| `null_reason_no_rate` | count | null | INFO |
| `cost_distribution_p25_p50_p75` | `"$X / $Y / $Z"` (or `"N/A"` when coa_with_cost=0) | null | INFO |
| `records_new` | xmax-derived (Spec 47 §8.1) | null | INFO |
| `records_updated` | xmax-derived (Spec 47 §8.1) | null | INFO |
| `records_skipped` | rows_processed - rows_returned (IS DISTINCT FROM short-circuited) | null | INFO |

## SQL shape

### Source SELECT (streamQuery)

```sql
SELECT
  ca.id,
  ca.lead_id,
  ca.application_number,
  ca.coa_type_class,
  ca.project_type,
  ca.scope_tags,
  ca.structure_type,
  ca.dwelling_units_proposed,
  ca.storeys_proposed,
  lp.parcel_id,
  p.lot_size_sqm::float8       AS lot_size_sqm,
  p.frontage_m::float8         AS frontage_m,
  bf.footprint_area_sqm::float8 AS footprint_area_sqm,
  bf.estimated_stories         AS estimated_stories,
  n.avg_household_income::float8 AS avg_household_income,
  n.tenure_renter_pct::float8  AS tenure_renter_pct,
  COALESCE(lt_agg.active_trades, ARRAY[]::text[]) AS active_trade_slugs
FROM coa_applications ca
LEFT JOIN LATERAL (
  SELECT lp.parcel_id
  FROM lead_parcels lp
  WHERE lp.lead_id = ca.lead_id
  ORDER BY lp.confidence DESC NULLS LAST, lp.parcel_id ASC
  LIMIT 1
) lp ON true
LEFT JOIN parcels p ON p.id = lp.parcel_id
LEFT JOIN LATERAL (
  SELECT building_id
  FROM parcel_buildings
  WHERE parcel_id = lp.parcel_id AND is_primary = true
  LIMIT 1
) pb ON true
LEFT JOIN building_footprints bf ON bf.id = pb.building_id
LEFT JOIN neighbourhoods n ON n.id = ca.neighbourhood_id
LEFT JOIN LATERAL (
  SELECT ARRAY_AGG(t.slug ORDER BY t.slug) FILTER (WHERE lt.is_active = true) AS active_trades
  FROM lead_trades lt
  JOIN trades t ON t.id = lt.trade_id
  WHERE lt.lead_id = ca.lead_id
) lt_agg ON true
WHERE ca.cost_classified_at IS NULL
   OR ca.cost_classified_at < ca.trade_classified_at
ORDER BY ca.id ASC;
```

### Per-batch UPSERT into cost_estimates

```sql
INSERT INTO cost_estimates (
  lead_id, permit_num, revision_num,
  estimated_cost, cost_source, cost_tier,
  cost_range_low, cost_range_high, premium_factor, complexity_score,
  model_version, is_geometric_override, modeled_gfa_sqm,
  effective_area_sqm, trade_contract_values, computed_at
)
VALUES <unrolled $N batch>
ON CONFLICT (lead_id) DO UPDATE SET
  estimated_cost        = EXCLUDED.estimated_cost,
  cost_source           = EXCLUDED.cost_source,
  cost_tier             = EXCLUDED.cost_tier,
  cost_range_low        = EXCLUDED.cost_range_low,
  cost_range_high       = EXCLUDED.cost_range_high,
  premium_factor        = EXCLUDED.premium_factor,
  complexity_score      = EXCLUDED.complexity_score,
  model_version         = EXCLUDED.model_version,
  is_geometric_override = EXCLUDED.is_geometric_override,
  modeled_gfa_sqm       = EXCLUDED.modeled_gfa_sqm,
  effective_area_sqm    = EXCLUDED.effective_area_sqm,
  trade_contract_values = EXCLUDED.trade_contract_values,
  computed_at           = EXCLUDED.computed_at
WHERE EXCLUDED.estimated_cost     IS DISTINCT FROM cost_estimates.estimated_cost
   OR EXCLUDED.cost_source        IS DISTINCT FROM cost_estimates.cost_source
   OR EXCLUDED.cost_tier          IS DISTINCT FROM cost_estimates.cost_tier
   OR EXCLUDED.modeled_gfa_sqm    IS DISTINCT FROM cost_estimates.modeled_gfa_sqm
   OR EXCLUDED.effective_area_sqm IS DISTINCT FROM cost_estimates.effective_area_sqm
   OR EXCLUDED.trade_contract_values::text IS DISTINCT FROM cost_estimates.trade_contract_values::text
RETURNING (xmax = 0) AS is_insert;
```

### Per-batch UPDATE of coa_applications

```sql
UPDATE coa_applications
   SET modeled_gfa_sqm    = v.modeled_gfa_sqm,
       estimated_cost     = v.estimated_cost,
       cost_source        = v.cost_source,
       cost_classified_at = $2::timestamptz
  FROM (VALUES <unrolled $N batch>) AS v(id, modeled_gfa_sqm, estimated_cost, cost_source)
 WHERE coa_applications.id = v.id;
```

(No IS DISTINCT FROM guard on the coa_applications UPDATE — cost_classified_at must advance unconditionally to prevent infinite re-fetch per R5.4 WF3 BUG-5 lesson.)

## BATCH_SIZE

Per Spec 47 §6.3: `BATCH_SIZE = Math.floor(65535 / COL_COUNT)`. `cost_estimates` INSERT has 15 columns + shared `computed_at` → `Math.min(1000, Math.floor(65535 / 15)) = Math.min(1000, 4369) = 1000`. The cap is memory-bounded (in-process row staging).

## Standards Compliance (Spec 47 §R1-R12)

* §R1 — `require('./lib/pipeline')` + `require('./lib/coa-cost-model')` + `require('../src/features/leads/lib/cost-model-shared')` + `require('./lib/pipeline-realtor-availability')` skipped (no realtor)
* §R2 — `ADVISORY_LOCK_ID = 4204`
* §R3 — `pipeline.run('compute-coa-cost-estimates', async (pool) => {...})`
* §R3.5 — `RUN_AT = await pipeline.getDbTimestamp(pool)` BEFORE withAdvisoryLock
* §R4 — Zod schema validates `liar_gate_threshold`, `model_range_pct`, `fallback_range_pct`, `coa_cost_coverage_threshold_pct`
* §R5 — Pre-flight: load `trade_sqft_rates` + `scope_intensity_matrix` at startup
* §R6 — `pipeline.withAdvisoryLock(pool, 4204, async () => {...})`
* §R7 — `pipeline.streamQuery` for the 6-table LEFT JOIN (~32K CoAs)
* §R8 — Brain logic delegated to `estimateCostShared` (existing — unchanged); config built via `buildCoaConfig`
* §R9 — Single `withTransaction` per batch: UPSERT `cost_estimates` + UPDATE `coa_applications`
* §R10 — `emitSummary` with `audit_table` per §6.8 row 668; phase=42; verdict aggregated from row statuses
* §R10 + §8.1 — `records_new`/`records_updated` from `RETURNING (xmax = 0)` (lesson 81-W5/82-W6/85-W6/R5.4 fold #10)
* §R11 — `emitMeta` declares 7 source tables read + 2 target tables written
* §R12 — `if (!lockResult.acquired) return;` after withAdvisoryLock

## Pre-Review Self-Checklist (16 items)

- (a) §6.8 lock 4204
- (b) §6.8 idempotency cursor `cost_classified_at IS NULL OR < trade_classified_at`
- (c) §6.8 audit metrics all present (3 spec-mandated + 4 null-reason buckets + 3 records_* + coverage scalar)
- (d) `cost_source='geometric'` transform (Brain's 'model' → 'geometric' on the way to DB)
- (e) `ON CONFLICT (lead_id) DO UPDATE SET` includes computed_at (re-runs refresh timestamp)
- (f) Spec 47 §R3 BATCH_SIZE formula
- (g) Spec 47 §R7 streamQuery
- (h) Spec 47 §R9 withTransaction wraps cost_estimates UPSERT + coa_applications UPDATE
- (i) Spec 47 §R10 + §8.1 records_new/_updated from RETURNING (xmax = 0)
- (j) WF3 BUG-5 lesson: `cost_classified_at` advances unconditionally on UPDATE coa_applications (no IS DISTINCT FROM trap)
- (k) Spec 84 §7 dual-path: Brain unchanged; config-builder is JS-only (no TS twin needed — pure config object, not consumed by mobile/admin)
- (l) Cross-script dependency: SELECT requires `trade_classified_at IS NOT NULL` (R5.4 must run first) — enforced via cursor predicate
- (m) Full CoA chain order in manifest: `link_coa_to_parcels → classify_coa_scope → classify_coa_trades → compute_coa_cost_estimates → link_coa → ...`
- (n) RUN_AT captured BEFORE `withAdvisoryLock` per Spec 47 §R3.5
- (o) Zod ConfigSchema covers new key `coa_cost_coverage_threshold_pct`; audit row references config, not literal
- (p) `cost_source` Brain→DB transform actually fires (defensive test: assert Brain output of 'model' is mapped to 'geometric' before INSERT)

## R5.4 lessons applied prophylactically

| Lesson | Application here |
|---|---|
| Batch threshold on rows.length, not coaIds.length | N/A — this script is 1 CoA → 1 cost_estimates row (1:1). batch.length is unambiguous. |
| TAG_ALIASES coverage gaps | N/A — this script consumes `active_trade_slugs` (R5.4 output) and `scope_tags` (R5.3 output) but doesn't do tag lookups itself. |
| coa_eligible WARN audit row | INCLUDED — first row in auditRows table. |
| slug_resolution_misses array | N/A — Brain handles trade_slug lookups; misses already counted in R5.4 audit. |
| `lead_score = Math.round(confidence * 100)` formula | N/A — cost_estimates has no lead_score column. |
| DUAL PATH NOTE on Brain lib | N/A — Brain is permit+CoA-shared (already documented as such). No new TS twin in scope. |
| Realtor availability guard | N/A — no realtor writes from this script. |
| ON CONFLICT classified_at | Equivalent: `computed_at = EXCLUDED.computed_at` included. |
| Per-batch UPDATE for state col | INCLUDED — `coa_applications.cost_classified_at` updated in same withTransaction. |
| xmax-derived records_new/updated | INCLUDED — `RETURNING (xmax = 0)` per Spec 47 §8.1 + R5.4 fold #10. |

## Plan-Review (4-reviewer plan review — completed 2026-05-14)

Reviewers: Gemini + DeepSeek + Independent worktree (general) + Worktree (observability + integration + logic).

### Triage Table — 13 FOLDs, 5 REJECTs, 4 DEFERs

| # | Sev | Conf | Source | Finding | Decision |
|---|---|---|---|---|---|
| 1 | **CRIT** | 100 | W#1 L-1 + W#2 CRIT-1 | R5.1 substrate ships with config field-name MISMATCH: `buildCoaConfig` returns `tradeRateBySlug` (Map) + `scopeIntensity` (Map). Brain (`cost-model-shared.js:233,286`) reads `config.tradeRates[slug]` + `config.scopeMatrix[matrixKey]` (plain-object bracket access). Defensive guards return undefined → every trade missed → surgicalTotal=0 → Zero-Total Bypass → 100% null cost. | **FOLD as R5.1 SUBSTRATE FIX**: rename to `tradeRates`/`scopeMatrix`; convert Maps to plain objects. |
| 2 | **CRIT** | 95 | W#2 CRIT-3 | R5.1 substrate misses `urbanCoverageRatio` + `suburbanCoverageRatio` config keys. Brain (lines 200-201) falls back to hardcoded 0.7/0.4 — operators can't tune CoA-side coverage ratios via Control Panel (Spec 47 §4.1 violation). | **FOLD as R5.1 SUBSTRATE FIX**: pass both from logicVars in `buildCoaConfig`; add to Zod ConfigSchema. |
| 3 | **CRIT** | 95 | Gemini + W#2 HIGH-3 + W#1 M-4 | `cost_distribution_p25_p50_p75` plan accumulates all estimated_cost values in JS array across batches. Independent confirmed array sort step also missing. Post-run `PERCENTILE_CONT` SQL is the correct pattern. | **FOLD**: replace JS accumulation with post-run `SELECT PERCENTILE_CONT(0.25/0.50/0.75) WITHIN GROUP (ORDER BY estimated_cost) FROM cost_estimates WHERE lead_id LIKE 'coa:%' AND computed_at = $RUN_AT`. |
| 4 | HIGH | 90 | Gemini | `parcel_buildings` LATERAL has `LIMIT 1` without `ORDER BY` → non-deterministic if multiple primary buildings exist (data anomaly). | **FOLD**: add `ORDER BY building_id ASC LIMIT 1`. |
| 5 | HIGH | 95 | W#2 HIGH-5 | R5.1 substrate sets `skipPermitTypeClassGating: true` in config — Brain never reads this flag. The actual mechanism is the `permit_type_class: 'construction'` sentinel in `mapCoaRowToBrainInput`. Dead-code risk: future dev removes sentinel trusting flag → silent breakage. | **FOLD as R5.1 SUBSTRATE FIX**: remove the flag; add explanatory comment at sentinel site. |
| 6 | HIGH | 92 | W#1 H-2 + W#2 HIGH-4 | Spec literal `null_cost_reasons = {no_parcel/no_building/no_scope_tags/no_rate}` but `no_building` does NOT cause null cost (Brain falls back to lot-size path); `no_rate` is a catch-all conflating "no active trades" + "no matching rate". | **FOLD**: restructure to `no_parcel` / `no_scope_tags` / `no_active_trades` / `no_matching_rate`. Track `cost_with_fallback_pct` (lot-size fallback fired) as separate INFO metric. |
| 7 | HIGH | 92 | W#2 HIGH-1 | `cost_estimate_coverage_pct` threshold WARN fires when `processed=0` (denominator path returns 0% < threshold). False WARN on healthy empty-cursor first-run. | **FOLD**: emit value as `'N/A'` + status `'INFO'` when `processed=0`. `coa_eligible` row already covers the empty-cursor signal. |
| 8 | HIGH | 90 | W#2 MED-1 | Spec 83 claims `is_geometric_override=true ALWAYS` but Brain returns `false` on Zero-Total Bypass path. Plan transforms `cost_source` but not `is_geometric_override`. | **FOLD**: explicit transform — non-null estimate: `cost_source='geometric'`, `is_geometric_override=true` (override Brain output); null estimate: `cost_source='none'`, no cost_estimates row written (cleaner than writing 'none' with is_geometric_override=false). |
| 9 | MED | 80 | Gemini | `trade_contract_values::text IS DISTINCT FROM ...::text` cast is redundant. PostgreSQL JSONB has canonical storage; direct `IS DISTINCT FROM` on JSONB compares canonically. | **FOLD**: drop `::text` casts. (Twin pattern matches; could be a follow-up cleanup on permit twin.) |
| 10 | MED | 88 | DeepSeek CRIT + W#1 H-1 | Plan claims 15 cols but actually 16 (lead_id + 15 others). `Math.floor(65535/15)=4369` would parameter-overflow if cap removed; correct: `Math.floor((65535-1)/16)=4095`. | **FOLD**: correct column count to 16; use `Math.min(1000, Math.floor((65535-1)/16))`. Cap at 1000 still active — runtime safe. |
| 11 | MED | 85 | DeepSeek HIGH-1 | `records_new`/`records_updated` semantics ambiguous when script writes to TWO target tables. cost_estimates is the primary (xmax-tracked); coa_applications UPDATE is side-effect. | **FOLD**: explicit doc comment + separate `coa_applications_updated` INFO audit row. records_new/_updated reflect cost_estimates UPSERT only (matches Spec 47 §8.1 primary-write convention). |
| 12 | MED | 90 | W#2 MED-3 | Self-checklist item (l) says "cursor enforces R5.4 must run first" — factually wrong. Cursor's `cost_classified_at IS NULL` branch fetches CoAs even when R5.4 hasn't run. Behavior is safe; doc is wrong. | **FOLD**: rewrite item (l) — "CoAs without `trade_classified_at` fetched on first run, produce `no_active_trades`/`no_scope_tags`, advance `cost_classified_at`. Re-fetched after R5.4 runs (`cost_classified_at < trade_classified_at`). Cursor does NOT gate on R5.4 completion." |
| 13 | MED | 82 | W#2 MED-4 | Zod schema references `coa_cost_coverage_threshold_pct` but plan doesn't seed the key. Zod throws on startup if absent. | **FOLD**: add `coa_cost_coverage_threshold_pct` to `scripts/seeds/logic_variables.json` (default 70 — below the §6.3 success target of 80 to allow first-run latitude). |
| 14 | MED | 78 | DeepSeek HIGH-3 | Twin script supports `--dry-run` and `--limit=N` CLI flags; plan omits them. Operator-safety improvement. | **FOLD**: add both flags. |
| 15 | LOW (REJECT) | 50 | Gemini CRIT-2 | LPAD revision_num collision. | **REJECT — out of R5.5 scope** — already fixed by WF3 #lpad-revision-num-collision / mig 146. |
| 16 | NIT (REJECT) | 60 | Gemini NIT | Transaction isolation level not specified. | **REJECT** — default READ COMMITTED acceptable; drift mid-stream is by-design re-fetch. |
| 17 | CRIT (REJECT) | 30 | DeepSeek CRIT-2 | Cursor `cost_classified_at < trade_classified_at` becomes NULL when trade_classified_at IS NULL → "permanently stuck". | **REJECT** — claim is wrong. SQL NULL semantics + `IS NULL` first branch correctly handle the case. Chain order guarantees R5.4 → R5.5 always. |
| 18 | MED (REJECT) | 40 | DeepSeek MED-1 | Multiple CoAs per lead_id → UPSERT collision overwrites prior estimate. | **REJECT** — `coa_applications.application_number` is unique; `lead_id = 'coa:' || application_number` is consequently 1:1 with CoA row. |
| 19 | MED (REJECT) | 50 | DeepSeek MED-2 | RUN_AT captured outside lock (twin captures inside). | **REJECT** — Spec 47 §R3.5 mandates BEFORE-lock capture. Twin behavior is a spec violation; our plan is correct. |
| 20 | HIGH (REJECT) | 60 | W#1 H-3 | No TS twin for `coa-cost-model.js` substrate. | **REJECT** — no client-side consumer exists. Brain itself has TS twin (`cost-model.ts`). The substrate is pipeline-internal. |
| 21 | HIGH (DEFER) | 75 | W#1 H-4 | Plan does not commit explicitly to xmax pattern from R5.4 fold #10. | **DEFER** as ALREADY ADDRESSED: plan §R10 + checklist (i) already specify `RETURNING (xmax = 0)` per Spec 47 §8.1 + R5.4 fold #10. |
| 22 | LOW (DEFER) | 70 | Gemini LOW + W#2 MED-2 | `no_rate` sub-split distinguishability (no_active_trades vs no_matching_rate). | **DEFER** — fold #6 partially addresses by splitting `no_rate` into `no_active_trades` + `no_matching_rate`. Further sub-split (e.g., "rate missing for slug X") deferred to post-burn-in instrumentation. |
| 23 | LOW (DEFER) | 60 | W#2 HIGH-4 | `no_building` sub-split (`no_primary_building` vs `no_building_footprint`). | **DEFER** — fold #6 removes `no_building` from null-bucket entirely; tracked separately as `cost_with_fallback_pct`. Sub-split unnecessary. |
| 24 | LOW (DEFER) | 75 | W#2 LOW-2 | `is_geometric_override` omitted from `IS DISTINCT FROM` WHERE guard. | **DEFER** — for CoA non-null path, `is_geometric_override` is always `true` (post-fold #8). Never differs → guard never fires unnecessarily. |
| 25 | DOC (DEFER) | 75 | W#2 MED-5 | Chain manifest order should explicitly document geocoding dependency. | **DEFER** — checklist (m) already lists the chain order; documenting the geocoding gate in spec §6.11 is a separate doc-only commit. |

### Revised Technical Design (post-plan-review)

#### R5.1 substrate fixes (`scripts/lib/coa-cost-model.js`)

```js
// REPLACE buildCoaConfig output:
const tradeRates = {};
for (const row of tradeRatesInput) {
  tradeRates[row.trade_slug] = {
    base_rate_sqft: Number(row.base_rate_sqft) || 0,
    structure_complexity_factor: Number(row.structure_complexity_factor) || 1.0,
  };
}

const scopeMatrix = {};
for (const row of scopeMatrixInput) {
  scopeMatrix[`${row.permit_type}::${row.structure_type}`] = Number(row.gfa_allocation_percentage) || 0;
}

return {
  tradeRates,             // R5.5 review fold #1: rename from tradeRateBySlug + plain object
  scopeMatrix,            // R5.5 review fold #1: rename from scopeIntensity + plain object
  liarGateThreshold:    Number(lv.liar_gate_threshold) || DEFAULT_LIAR_GATE_THRESHOLD,
  modelRangePct:        Number(lv.model_range_pct)      || DEFAULT_MODEL_RANGE_PCT,
  fallbackRangePct:     Number(lv.fallback_range_pct)   || DEFAULT_FALLBACK_RANGE_PCT,
  urbanCoverageRatio:   Number(lv.urban_coverage_ratio) || 0.7,    // R5.5 review fold #2
  suburbanCoverageRatio:Number(lv.suburban_coverage_ratio) || 0.4, // R5.5 review fold #2
  coaContext: true,
  // R5.5 review fold #5: skipPermitTypeClassGating removed — was dead code.
  // The Brain doesn't read it; CoA rows pass the gate via the
  // permit_type_class:'construction' sentinel in mapCoaRowToBrainInput.
};
```

#### Source SQL (revised — fold #4)

```sql
LEFT JOIN LATERAL (
  SELECT building_id
  FROM parcel_buildings
  WHERE parcel_id = lp.parcel_id AND is_primary = true
  ORDER BY building_id ASC   -- R5.5 review fold #4 (Gemini HIGH)
  LIMIT 1
) pb ON true
```

#### Audit table (revised — folds #3, #6, #7, #8, #11)

| Metric | Value | Threshold | Status |
|---|---|---|---|
| `coa_eligible` | processed | `> 0` | WARN if 0 |
| `coa_with_cost` | count | null | INFO |
| `coa_without_cost` | count | null | INFO |
| `cost_estimate_coverage_pct` | `processed > 0 ? pct : 'N/A'` | `>= coa_cost_coverage_threshold_pct%` (skipped when N/A) | PASS / WARN / **INFO when N/A** (fold #7) |
| `null_reason_no_parcel` | count | null | INFO |
| `null_reason_no_scope_tags` | count | null | INFO |
| `null_reason_no_active_trades` | count | null | INFO (fold #6) |
| `null_reason_no_matching_rate` | count | null | INFO (fold #6) |
| `cost_with_fallback_pct` | % of non-null estimates that used lot-size fallback path | null | INFO (fold #6) |
| `cost_distribution_p25_p50_p75` | `"$X / $Y / $Z"` from post-run PERCENTILE_CONT (fold #3) | null | INFO |
| `records_new` | xmax-derived for cost_estimates UPSERT | null | INFO |
| `records_updated` | xmax-derived for cost_estimates UPSERT | null | INFO |
| `records_skipped` | rows_processed - rows_returned (IS DISTINCT FROM short-circuited) | null | INFO |
| `coa_applications_updated` | rowCount sum of coa_applications UPDATE batches | null | INFO (fold #11) |

#### Cost-source transform (revised — fold #8)

```js
let dbCostSource, dbIsGeometricOverride;
if (brainOutput.estimated_cost != null && brainOutput.cost_source === 'model') {
  dbCostSource = 'geometric';
  dbIsGeometricOverride = true;
} else if (brainOutput.estimated_cost != null && brainOutput.cost_source === 'permit') {
  // Unreachable for CoA (est_const_cost is always null) but defensive.
  dbCostSource = 'geometric';
  dbIsGeometricOverride = true;
} else {
  // Brain returned cost_source='none' or null estimated_cost — skip cost_estimates row entirely.
  // Only coa_applications gets cost_classified_at=$RUN_AT (cursor advancement) + cost_source='none'.
  dbCostSource = 'none';
  dbIsGeometricOverride = false;
}
```

#### Cost percentiles query (post-run — fold #3)

```sql
-- Run AFTER streamQuery completes. Bounded-memory (DB-side).
SELECT
  PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY estimated_cost) AS p25,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY estimated_cost) AS p50,
  PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY estimated_cost) AS p75
FROM cost_estimates
WHERE lead_id LIKE 'coa:%'
  AND computed_at = $RUN_AT
  AND estimated_cost IS NOT NULL;
```

#### Self-checklist item (l) (revised — fold #12)

> **(l) Cross-script dependency:** On first run, CoAs without `trade_classified_at` (R5.4 not yet run) ARE fetched via the `cost_classified_at IS NULL` cursor branch, produce `no_active_trades`/`no_scope_tags`, and advance `cost_classified_at`. After R5.4 runs and sets `trade_classified_at > cost_classified_at`, they are re-fetched via the `<` cursor branch. Cursor does NOT gate on R5.4 completion — the chain manifest order is the gate.

### BATCH_SIZE (revised — fold #10)

```js
const COL_COUNT = 16; // lead_id + permit_num + revision_num + 13 cost cols incl. computed_at
const INSERT_BATCH_SIZE = Math.min(1000, Math.floor((65535 - 1) / COL_COUNT)); // = 1000 (cap < formula)
```

### DEFERS (4 — appended to `docs/reports/review_followups.md` after authorization)

- DeepSeek HIGH-3 fold rejection: cursor predicate (chain order guarantees)
- Spec 83 `is_geometric_override=true ALWAYS` text vs Brain behavior — spec amendment candidate
- `no_rate` further sub-distinguishability (per-slug rate-miss tracking)
- compute-trade-forecasts.js Phase H gap (same as R5.4 — already documented in §6.11 Phase H)

---

> **PLAN LOCKED — 4-reviewer plan review complete; 14 BUGs folded, 4 DEFERs queued, 5 REJECTs documented.**
>
> Spec 42 alignment: **on plan** with one acknowledged spec text vs implementation gap (`is_geometric_override` ALWAYS true — deferred to spec amendment).
>
> Files to modify (after authorization):
> - NEW `scripts/compute-coa-cost-estimates.js` (~350 lines after fold)
> - MODIFY `scripts/lib/coa-cost-model.js` (3 fold-driven substrate fixes: rename keys to plain objects, add coverage ratios, remove dead flag)
> - MODIFY `scripts/seeds/logic_variables.json` (add `coa_cost_coverage_threshold_pct`)
> - NEW `src/tests/compute-coa-cost-estimates.infra.test.ts` (Spec 47 §R1-R12 + R5.5 contract regression-lock)
> - EXTEND `src/tests/coa-cost-model.logic.test.ts` (add fold #1+#2+#5 regression coverage — config field names, coverage ratios, dead-flag removal)
> - MODIFY 6-7 collateral files (manifest, FreshnessTimeline, funnel, chain.logic, quality.logic, assert-global-coverage, control-panel.logic, pipeline-advisory-lock LOCK_ID_REGISTRY)
>
> **Do you authorize this WF1 plan with all 14 review folds? (y/n)**
> DO NOT generate code. DO NOT run pipeline scripts. TERMINATE RESPONSE until authorization.
