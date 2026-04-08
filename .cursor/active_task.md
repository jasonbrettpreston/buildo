# Active Task: WF1 — Lead Feed Phase 1b-i: Cost Model
**Status:** Implementation
**Workflow:** WF1 — New Feature Genesis
**Rollback Anchor:** `800b19a`

## Domain Mode
**Backend/Pipeline Mode** — pure library + 1 pipeline script. NO API routes, NO UI, NO new migrations. Per CLAUDE.md Backend rules: §2/§6/§7/§9 of `00_engineering_standards.md`. Pipeline script via `scripts/lib/pipeline.js` SDK only — never `new Pool()`.

## Context
* **Goal:** First of three sub-WFs replacing the too-large Phase 1b. Land the base of the lead feed data layer: shared types for `src/features/leads/`, the distance helpers, the pure `estimateCost` function (spec 72), and the nightly pipeline script that populates `cost_estimates`. This sub-WF proves the **dual code path discipline** (TS + JS port of the same formula) the later phases will follow. After this WF, `cost_estimates` table can be populated from real data, and the TS `estimateCost` function is importable by Phase 1b-iii's `get-lead-feed.ts`.
* **Target Specs (already hardened):**
  - `docs/specs/product/future/72_lead_cost_model.md` §Implementation (`estimateCost`, base rates, premium tiers, scope additions, cost tiers, complexity score, pipeline step)
  - `docs/specs/product/future/75_lead_feed_implementation_guide.md` §11 Phase 1 (distance helper + types boundaries)
  - `docs/specs/00_engineering_standards.md` §2 (try/catch), §6 (logger), §7 (dual code path), §9 (pipeline safety)
* **Key Files:** new — `src/features/leads/types.ts`, `src/features/leads/lib/distance.ts`, `src/features/leads/lib/cost-model.ts`, `scripts/compute-cost-estimates.js`, `src/tests/distance.logic.test.ts`, `src/tests/cost-model.logic.test.ts`, `src/tests/compute-cost-estimates.infra.test.ts`.

## Technical Implementation

### File 1 — `src/features/leads/types.ts`

Single import surface for everything `src/features/leads/` consumers will need. Re-exports from `src/lib/permits/types.ts` (added in Phase 1a) plus the new lib-local interfaces.

**Re-exports (from `@/lib/permits/types`):** `CostEstimate`, `CostSource`, `CostTier`, `LeadView`, `LeadType`, `InspectionStageMapRow`, `StageRelationship`, `TimingCalibrationRow`.

**New interfaces (defined here):**
- `TradeTimingEstimate` — `{ confidence, tier, min_days, max_days, display }` per spec 71 §4 (used by Phase 1b-ii)
- `BuilderLeadCandidate` — builder row shape from spec 73 (used by Phase 1b-iii)
- `LeadFeedCursor` — `{ score, lead_type, lead_id }` per spec 70 cursor contract
- `LeadFeedInput` — `{ user_id, trade_slug, lat, lng, radius_km, cursor?, limit }` per spec 70 API params
- `LeadFeedItem` — unified row shape from the CTE (used by Phase 1b-iii)
- `LeadFeedResult` — `{ data, meta: { next_cursor, count, radius_km } }`

**Note:** Interfaces for Phase 1b-ii/iii are defined now so the types.ts file is complete after this sub-WF. This avoids type-surface churn in later sub-WFs. Only `CostEstimate` and the distance constants are consumed BY this sub-WF; the rest are inert until their consumers ship.

### File 2 — `src/features/leads/lib/distance.ts`

Pure helpers, no DB, ~25 lines. Per spec 75 §11 Phase 1 bullet 5, distance math stays in SQL via PostGIS `ST_Distance` — these helpers exist for unit conversion and display formatting only.

```ts
export const DEFAULT_RADIUS_KM = 10;
export const MAX_RADIUS_KM = 50;  // spec 70 enforces via Zod

export function metersFromKilometers(km: number): number;
export function kilometersFromMeters(meters: number): number;
export function formatDistanceForDisplay(meters: number): string;
// '450m', '999m', '1.0km', '12km' (whole km ≥10km)
```

### File 3 — `src/features/leads/lib/cost-model.ts`

Pure `estimateCost` function implementing spec 72 §Implementation exactly. No DB calls. ~180 lines. Signature:

```ts
export function estimateCost(
  permit: CostModelPermitInput,
  parcel: CostModelParcelInput | null,
  footprint: CostModelFootprintInput | null,
  neighbourhood: CostModelNeighbourhoodInput | null,
): CostEstimate;
```

Input interfaces are defined locally (NOT exported from `@/lib/permits/types.ts`) to keep the cost-model surface small and self-documenting. Each input is the minimum shape needed for the calculation.

**Algorithm (verbatim from spec 72 §Implementation):**
1. If `permit.est_const_cost > 1000` → source='permit', `cost_range_low === cost_range_high === estimated_cost`
2. Else model path:
   - Determine `base_rate_per_sqm` from permit category (SFD $3000, semi/town $2600, multi-res $3400, addition $2000, commercial $4000, interior reno $1150)
   - Compute building area: `footprint_area_sqm × estimated_stories` if footprint present; else urban-aware fallback (tenure_renter_pct > 50% → lot × 0.7 × floors_estimate, else → lot × 0.4 × floors_estimate; floors_estimate defaults: 2 residential, 1 commercial)
   - Apply `premium_factor` from neighbourhood income tier (<60K→1.0, 60K-100K→1.15, 100K-150K→1.35, 150K-200K→1.6, >200K→1.85; null income → 1.0)
   - `base = area × base_rate × premium`
   - Add scope additions (pool +$80K, elevator +$60K, underpinning +$40K, solar +$25K) — ADDITIVE AFTER multiplication
3. Compute `cost_tier` from numeric cost (<100K=small, <500K=medium, <2M=large, <10M=major, ≥10M=mega)
4. Compute `complexity_score` independently:
   - High-rise (stories > 6) +30
   - Multi-unit (dwelling_units > 4) +20
   - Large footprint (>300 sqm) +15
   - Premium neighbourhood (income > 150K) +15
   - Each of pool / elevator / underpinning +10 each
   - New build +10
   - Cap via `Math.min(100, sum)` — spec uses `LEAST(100, sum)` in SQL, JS mirrors
5. Output range: ±25% for full-data model, ±50% for fallback (urban-aware)
6. Build display string per spec variants

**Exports:**
- `estimateCost(...)`
- Input interface types (`CostModelPermitInput`, etc.)
- Constants as exported `const` objects for tests + dual code path: `BASE_RATES`, `PREMIUM_TIERS`, `SCOPE_ADDITIONS`, `COST_TIER_BOUNDARIES`, `COMPLEXITY_SIGNALS`

**File header comment:** cross-reference to `scripts/compute-cost-estimates.js` for dual code path discipline per CLAUDE.md §7.

### File 4 — `scripts/compute-cost-estimates.js`

CommonJS Pipeline SDK script, ~200 lines. Pre-computes `cost_estimates` rows for every permit using the model. Per spec 72 §Implementation "Pipeline step (REQUIRED — not optional)".

**Structure:**
```js
// 🔗 SPEC LINK: docs/specs/product/future/72_lead_cost_model.md §Implementation
// 🔗 DUAL CODE PATH: src/features/leads/lib/cost-model.ts — these files MUST
// stay in sync per CLAUDE.md §7. Any change to base rates / premium tiers /
// scope additions / tier boundaries / complexity signals must land in BOTH.
const pipeline = require('./lib/pipeline');

const BASE_RATES = { /* same numbers as cost-model.ts */ };
const PREMIUM_TIERS = [ /* same */ ];
const SCOPE_ADDITIONS = { /* same */ };
const COST_TIER_BOUNDARIES = [ /* same */ ];
const COMPLEXITY_SIGNALS = { /* same */ };
const ADVISORY_LOCK_ID = 74;
const BATCH_SIZE = 5000;

function estimateCostInline(permit, parcel, footprint, neighbourhood) {
  // Mirrors cost-model.ts algorithm — same branches, same constants
}

pipeline.run('compute-cost-estimates', async (pool) => {
  const lockRes = await pool.query('SELECT pg_try_advisory_lock($1) AS locked', [ADVISORY_LOCK_ID]);
  if (!lockRes.rows[0].locked) {
    pipeline.log.warn('[compute-cost-estimates]', 'Advisory lock 74 held — exiting');
    return;
  }
  try {
    // streamQuery with JOIN to parcels, building_footprints, neighbourhoods
    // Batch of 5000, UPSERT per batch inside withTransaction
    // Track inserted vs updated via xmax = 0 check
  } finally {
    await pool.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID]);
  }
});
```

**SQL source query:** joins `permits` LEFT JOIN `permit_parcels` LEFT JOIN `parcels` LEFT JOIN `building_footprints` LEFT JOIN `neighbourhoods`. `permit_parcels` may have multiple rows per permit — deduplicate by picking one parcel per permit (smallest parcel_id) so each permit produces exactly one estimate.

**UPSERT target:** `cost_estimates (permit_num, revision_num, estimated_cost, cost_source, cost_tier, cost_range_low, cost_range_high, premium_factor, complexity_score, model_version, computed_at)` with `ON CONFLICT (permit_num, revision_num) DO UPDATE SET ... computed_at = NOW()`.

**Emits:** `PIPELINE_META` reads `{permits, parcels, building_footprints, neighbourhoods}` writes `{cost_estimates}`, `PIPELINE_SUMMARY` with `{records_total, records_new, records_updated}` from the xmax counter.

**Failure recovery:** each batch wrapped in try/catch via `pipeline.withTransaction`; if a batch throws, log with `pipeline.log.error`, continue with next batch. Single-permit failures inside a batch roll back the whole batch — acceptable because spec 72 says "next nightly run picks up failures".

### Tests

**File 5 — `src/tests/distance.logic.test.ts`** (8-10 tests)
- Imports from `@/features/leads/lib/distance`
- `metersFromKilometers(10) === 10000`, `(0.5) === 500`, `(0) === 0`
- `kilometersFromMeters(1000) === 1`, round-trip symmetry
- `formatDistanceForDisplay(0) === '0m'`
- `(450) === '450m'`, `(999) === '999m'`
- `(1000) === '1.0km'`, `(1234) === '1.2km'`, `(9999) === '10.0km'`
- `(10000) === '10km'`, `(12345) === '12km'` (whole km ≥10km)
- `DEFAULT_RADIUS_KM === 10`, `MAX_RADIUS_KM === 50`

**File 6 — `src/tests/cost-model.logic.test.ts`** (22-28 tests)
Inline fixture builders `makePermit(overrides)`, `makeParcel`, `makeFootprint`, `makeNeighbourhood` at the top of the file with sensible defaults you override per test. Cover:

- **Permit-reported cost path (3 tests):**
  - `est_const_cost > 1000` → source='permit', range_low = range_high = cost, tier matches boundary
  - `est_const_cost === 1000` → falls through to model (boundary: `> 1000`, not `>= 1000`)
  - `est_const_cost === 1` → placeholder rejected, falls through to model

- **Base rate categories (6 tests):**
  - SFD → 3000
  - Semi/town → 2600
  - Multi-res → 3400
  - Addition → 2000
  - Commercial new → 4000
  - Interior reno → 1150

- **Urban-aware fallback (4 tests):**
  - No footprint, tenure_renter_pct > 50 → coverage 0.7 × floors_estimate
  - No footprint, tenure_renter_pct ≤ 50 → coverage 0.4
  - Residential → floors_estimate=2; Commercial → floors_estimate=1
  - Fallback path → ±50% range not ±25%, confidence implicit via range width

- **Premium tiers (5 tests):**
  - Each boundary: <60K→1.0, 60K-100K→1.15, 100K-150K→1.35, 150K-200K→1.6, >200K→1.85
  - null income → 1.0

- **Scope additions (4 tests):**
  - pool +80K, elevator +60K, underpinning +40K, solar +25K
  - All 4 stacked → +205K
  - Additive, not multiplicative (verify total = base + sum)

- **Cost tiers (5 tests):**
  - <100K=small, 100K-500K=medium, 500K-2M=large, 2M-10M=major, ≥10M=mega
  - Boundary cases: exactly 100K → medium, exactly 500K → large, exactly 2M → major, exactly 10M → mega

- **Complexity score (5 tests):**
  - Each signal in isolation hits the right number
  - All signals together hit 120 → capped at 100
  - Zero signals → 0

- **Display strings (3 tests):**
  - Permit-reported: `"$1,200,000 · Large Job · Premium neighbourhood"`
  - Model with full data: `"$1.2M–$1.8M estimated · Large Job · Premium neighbourhood"`
  - Without sufficient data: `"Large lot, premium neighbourhood — cost estimate unavailable"` (or the spec wording)

**File 7 — `src/tests/compute-cost-estimates.infra.test.ts`** (10-12 tests)
File-shape tests via `fs.readFileSync('scripts/compute-cost-estimates.js', 'utf-8')`:

- `pipeline.run('compute-cost-estimates'` present
- `pg_try_advisory_lock($1` with `ADVISORY_LOCK_ID = 74`
- `pg_advisory_unlock` in finally block
- `pipeline.streamQuery(` used (not `loadAll`)
- `pipeline.withTransaction(` used
- `ON CONFLICT (permit_num, revision_num) DO UPDATE` present
- References `cost_estimates`, `parcels`, `building_footprints`, `neighbourhoods`, `permit_parcels`
- `BATCH_SIZE = 5000`
- `pipeline.emitSummary` with records_total / records_new / records_updated
- `pipeline.emitMeta` present with correct reads/writes map
- Cross-reference comment to `src/features/leads/lib/cost-model.ts` present (dual code path discipline)
- Inline `estimateCostInline` function present
- Constants (`BASE_RATES`, `PREMIUM_TIERS`, `SCOPE_ADDITIONS`, `COST_TIER_BOUNDARIES`, `COMPLEXITY_SIGNALS`) defined in the script file
- `pipeline.log.error` used in catch block (NOT bare `console.error`)

### Database Impact
**NO** — this WF only consumes tables created in Phase 1a (`cost_estimates`, `parcels`, `building_footprints`, `neighbourhoods`, `permits`, `permit_parcels`). No new migrations.

## Standards Compliance (§10)

### DB
- ⬜ N/A — no migrations
- ✅ Script uses Pipeline SDK (`pipeline.run`, `streamQuery`, `withTransaction`) — never `new Pool()`
- ✅ Parameterized queries only (`$1` placeholder for advisory lock ID)
- ✅ `ON CONFLICT` UPSERT for idempotency
- ✅ Advisory lock `pg_try_advisory_lock(74)` per spec 72 concurrency safety
- ✅ Batched writes (5000 per transaction) per spec 72 to avoid long transactions

### API
- ⬜ N/A — no API routes (Phase 2)

### UI
- ⬜ N/A — backend-only

### Shared Logic
- ✅ **Dual code path (§7):** `cost-model.ts` (TS) and `compute-cost-estimates.js` (JS inline port) MUST use identical numeric constants. Cross-reference comments in both files. Infra test verifies both files reference the same constant names.
- ✅ `src/features/leads/types.ts` re-exports Phase 1a types — single import surface for Phase 2
- ✅ No existing consumers affected — this is pure addition

### Pipeline (§9)
- ✅ `pipeline.run` wrapper
- ✅ `pipeline.withTransaction` for atomic batch writes
- ✅ `pipeline.streamQuery` for the 237K-permit scan (no load-all)
- ✅ Idempotent UPSERT
- ✅ Advisory lock acquire + release in try/finally
- ✅ `PIPELINE_META` + `PIPELINE_SUMMARY` emitted
- ✅ Batch size 5000 — under PostgreSQL parameter limit
- ✅ Per-batch failure recovery with `pipeline.log.error` — next run catches up
- ✅ `pipeline.log.{info, warn, error}` instead of bare `console.*`
- ✅ CommonJS script in `scripts/` — `process.exit` allowed (not `src/`)

### Try/Catch (§2) + logError mandate
- ✅ `estimateCost` is pure — no throws possible except on malformed input; input interfaces constrain shape
- ✅ Script wraps each batch in try/catch via `pipeline.withTransaction`; failure logged, continues
- ✅ Advisory unlock in `finally` block — never leaked

### Unhappy Path Tests
- ✅ `est_const_cost === 1` placeholder handling
- ✅ No footprint / no parcel / no neighbourhood → fallback paths
- ✅ Null income → premium factor 1.0 (not crash)
- ✅ Complexity cap when all signals present (120 → 100)

### Mobile-First
- ⬜ N/A — backend-only

## Review Plan (per `feedback_review_protocol.md`, this is WF1)
- ✅ **Independent review** in worktree after commit
- ✅ **BOTH adversarial models** on EVERY changed/created file (7 files):
  - `src/features/leads/types.ts`
  - `src/features/leads/lib/distance.ts`
  - `src/features/leads/lib/cost-model.ts`
  - `scripts/compute-cost-estimates.js`
  - `src/tests/distance.logic.test.ts`
  - `src/tests/cost-model.logic.test.ts`
  - `src/tests/compute-cost-estimates.infra.test.ts`
- **7 files × 2 models = 14 adversarial reviews + 1 independent ≈ $2.80**
- ✅ Triage via Real / Defensible / Out-of-scope tree
- ✅ Append deferred items to `docs/reports/review_followups.md`
- ✅ Post full triage table in the response

## Execution Plan

```
- [ ] Contract Definition: All signatures locked in this plan.
      Phase 2 will consume estimateCost via the cost_estimates cache,
      not directly. Phase 1b-iii will import from src/features/leads/types.

- [ ] Spec & Registry Sync: Spec 72 already hardened. Run
      `npm run system-map` AFTER commit to capture new src/features/leads/
      paths.

- [ ] Schema Evolution: N/A — Phase 1a created all tables.

- [ ] Test Scaffolding: Create the 3 test files. Run
      `npx vitest run src/tests/distance.logic.test.ts
       src/tests/cost-model.logic.test.ts
       src/tests/compute-cost-estimates.infra.test.ts`
      MUST fail — modules don't exist.

- [ ] Red Light: Confirmed (typecheck errors + vitest module-not-found).

- [ ] Implementation:
      Step 1 — src/features/leads/types.ts (re-exports + new interface
        definitions; no implementation behavior)
      Step 2 — src/features/leads/lib/distance.ts (3 functions + 2
        constants)
      Step 3 — Run distance tests — must pass
      Step 4 — src/features/leads/lib/cost-model.ts (pure function,
        ~180 lines, constants as exports)
      Step 5 — Run cost-model tests — must pass
      Step 6 — scripts/compute-cost-estimates.js (CommonJS, Pipeline
        SDK, inline port of cost-model algorithm with IDENTICAL
        constants, advisory lock, batched UPSERT)
      Step 7 — Run compute-cost-estimates infra test — must pass
      Step 8 — `npm run typecheck` — must be clean
      Step 9 — `npm run lint -- --fix` — must be clean
      Step 10 — `npm run test` full suite — 2541 + ~40 new ≈ 2580+
      Step 11 — Manual constants audit: diff the exported constant
        blocks between cost-model.ts and compute-cost-estimates.js;
        values must match byte-for-byte

- [ ] Auth Boundary & Secrets: N/A — no routes, no new secrets.
      estimateCost is pure; script uses PG_* env vars via pipeline SDK.

- [ ] Green Light:
      - typecheck / lint / test all clean
      - dual code path constant audit passes
      Output visible execution summary ✅/⬜ for every step.

- [ ] Reviews:
      - Commit the implementation
      - Run Gemini + DeepSeek on all 7 files in parallel (14 jobs)
      - Run independent review agent in worktree against the commit
      - Triage, apply real fixes in a follow-up commit, append deferred
        items to review_followups.md
      - Post full triage table

- [ ] WF6 close: 5-point sweep + final state summary
```

## Risk Notes

1. **Local DB broken at migration 030 (pre-existing).** All tests mock the pool or read script file shape — no real DB roundtrip. The compute-cost-estimates.js script's SQL will only be runtime-validated when CI runs against a clean DB or when the local DB is repaired. Mitigation: infra test asserts the SQL structure; adversarial reviews catch parameter mismatches; once the DB is repaired, a smoke run against real data before Phase 1b-iii wraps.

2. **Dual code path drift.** cost-model.ts (TS) and compute-cost-estimates.js (JS inline) must use identical numeric constants. Any future rate change must land in BOTH. Mitigation: cross-reference comments in both files; infra test asserts constant names present in script; Step 11 of implementation explicitly diffs the constant blocks. Extracting to a shared JSON file is noted in `review_followups.md` as future hardening.

3. **`permit_parcels` multi-parcel-per-permit.** Some permits link to multiple parcels (shared lots, condo units). The cost model expects a SINGLE parcel. Mitigation: SQL picks smallest parcel_id per permit (arbitrary but stable). A future enhancement could pick the largest or aggregate; acceptable for V1.

4. **`parseFloat` vs `Number` parsing of DB DECIMAL fields.** pg returns DECIMAL(15,2) as a JS string by default. The cost-model input interface must accept `number | string` OR the SQL must `CAST` to float. Mitigation: script CASTs via `::float8` in the SELECT; cost-model.ts input types use `number`. Tested by the infra test asserting the `::float8` casts are present.

5. **Complexity cap.** Spec 72 says max theoretical sum is 120 (30+20+15+15+10+10+10+10). If a future signal is added, the cap still holds — defensive. Tests verify Math.min(100, sum) applied.
