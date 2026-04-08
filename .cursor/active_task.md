# Active Task: WF1 — Lead Feed Phase 1b-ii: Timing Engine
**Status:** Implementation
**Workflow:** WF1 — New Feature Genesis
**Rollback Anchor:** `cca37a7`

## Domain Mode
**Backend/Pipeline Mode** — async DB-backed library + 1 pipeline script. NO API routes, NO UI, NO new migrations. Per CLAUDE.md Backend rules: §2/§6/§7/§9 of `00_engineering_standards.md`. All DB access via the shared pool from `src/lib/db/client.ts`. Pipeline script via `scripts/lib/pipeline.js` SDK only.

## Context
* **Goal:** Second of three sub-WFs replacing the too-large Phase 1b. Ship the spec 71 timing engine — the 3-tier confidence model with parent/child permit merge, stage-based reasoning, and an in-memory calibration cache. Plus the nightly pipeline script that populates `timing_calibration` from real inspection data. After this WF, `getTradeTimingForPermit(permit_num, trade_slug, pool)` returns a `TradeTimingEstimate` ready for Phase 2 to wrap in an API endpoint. Phase 1b-iii's `get-lead-feed.ts` will NOT call this per-row (too slow for the feed CTE) — it uses a fast SQL proxy for the timing pillar; the full engine drives the per-permit detail page in Phase 2+.
* **Target Specs (already hardened):**
  - `docs/specs/product/future/71_lead_timing_engine.md` §Implementation
  - `docs/specs/product/future/75_lead_feed_implementation_guide.md` §11 Phase 1
  - `docs/specs/00_engineering_standards.md` §2/§6/§9
* **Key Files:** new — `src/features/leads/lib/timing.ts`, `scripts/compute-timing-calibration.js`, `src/tests/timing.logic.test.ts`, `src/tests/compute-timing-calibration.infra.test.ts`. Reads from (no modifications) — `src/lib/classification/phases.ts`, `src/features/leads/types.ts`, `src/lib/permits/types.ts`.

## Technical Implementation

### File 1 — `src/features/leads/lib/timing.ts` (~300 lines)

```ts
export async function getTradeTimingForPermit(
  permit_num: string,
  trade_slug: string,
  pool: Pool,
): Promise<TradeTimingEstimate>;
export function _resetCalibrationCache(): void;
```

Module-level state (process-wide cache):
```ts
let calibrationCache: Map<string, TimingCalibrationRow> | null = null;
let calibrationLoadedAt = 0;
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const STALENESS_DAYS = 180;
const CALIBRATION_STALE_DAYS = 30;
const NOT_PASSED_PENALTY_DAYS = 14;
const STAGE_GAP_MEDIAN_DAYS = 30;
const MIN_SAMPLE_SIZE = 20;
const PRE_PERMIT_MIN_DAYS = 240;  // 8 months
const PRE_PERMIT_MAX_DAYS = 420;  // 14 months
const BOOTSTRAP_CALIBRATION = { p25: 44, median: 105, p75: 238 }; // spec 71 seed
```

Constants exported as `const` blocks so tests can assert exact values.

**Algorithm:**
1. **Top-level guard** — try/catch wrap; on throw → `logError` + safe fallback `{confidence:'low', tier:3, min_days:0, max_days:0, display:'Timing unavailable'}`.
2. **Calibration cache lazy load** via `ensureCalibrationLoaded(pool)`. Errors logged, continues with empty/stale cache.
3. **Parent/child merge** via `pickBestCandidate(permit_num, trade_slug, pool)`:
   - Query `permit_parcels` for siblings on same parcel(s)
   - Join `permits` for permit_type, issued_date, status
   - Use `determinePhase` from phases.ts to compute each sibling's current phase
   - Pick sibling whose phase contains `trade_slug` per `PHASE_TRADE_MAP[phase]`
   - Falls back to original if no better match
4. **Inspection routing**: query `permit_inspections`. If any rows → Tier 1; else if `issued_date` → Tier 2; else → Tier 3.
5. **Tier 1 — Stage-Based:**
   - Find latest PASSED inspection (case-insensitive status match)
   - **Staleness:** if `latest_passed.inspection_date > 180 days old` → low confidence, "Project may be stalled — last activity X days ago"
   - Look up enabling stage in `inspection_stage_map` ORDER BY precedence ASC LIMIT 1 (handles painting Fire Separations prec 10 vs Occupancy prec 20)
   - If no enabling stage row → fall through to Tier 2
   - Branch A — enabling stage PASSED: return high, lag from map row
   - Branch B — enabling stage "Not Passed": +14d penalty + " (delayed — re-inspection pending)"
   - Branch C — enabling stage outstanding/missing: count `stage_sequence` gap × 30d to bounds
6. **Tier 2 — Issued Heuristic:**
   - Read calibration row for permit_type from cache
   - **Stale row check:** computed_at > 30 days → logWarn + global median fallback
   - **Insufficient sample (<20):** global median fallback
   - **Empty cache:** BOOTSTRAP_CALIBRATION (spec 71 seed values)
   - Compute months since issued_date
   - Use `determinePhase(permit)` from phases.ts → check `PHASE_TRADE_MAP[phase].includes(trade_slug)`
   - Return medium confidence with bounds derived from p25/p75
7. **Tier 3 — Pre-Permit:** No issued_date → low, 240-420d range, "Pre-permit stage — your trade estimated 8-14 months out"

**Helpers:** `ensureCalibrationLoaded`, `pickBestCandidate`, `getGlobalMedianCalibration`, `findEnablingStage`, `findLatestPassedInspection`, `findEnablingInspection`, `formatTier1Display`, `formatTier2Display`.

**Logging:** `logInfo` on successful tier resolution; `logWarn` for stale calibration, cache miss, sibling query failure; `logError` for unexpected throws.

### File 2 — `scripts/compute-timing-calibration.js` (~120 lines)

CommonJS Pipeline SDK script. Single SQL query (no streaming — 50-200 distinct permit_types max):

```sql
WITH first_inspection AS (
  SELECT p.permit_type, p.permit_num, p.revision_num, p.issued_date,
         MIN(pi.inspection_date) AS first_inspection_date
  FROM permits p
  JOIN permit_inspections pi ON pi.permit_num = p.permit_num
  WHERE p.issued_date IS NOT NULL
    AND p.permit_type IS NOT NULL
    AND pi.inspection_date IS NOT NULL
    AND pi.inspection_date >= p.issued_date
  GROUP BY p.permit_type, p.permit_num, p.revision_num, p.issued_date
),
deltas AS (
  SELECT permit_type, (first_inspection_date - issued_date) AS days_to_first
  FROM first_inspection
  WHERE first_inspection_date - issued_date BETWEEN 0 AND 730
)
SELECT permit_type,
       COUNT(*)::int AS sample_size,
       PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY days_to_first)::int AS p25,
       PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY days_to_first)::int AS median,
       PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY days_to_first)::int AS p75
FROM deltas
GROUP BY permit_type
HAVING COUNT(*) >= 5;
```

UPSERT loop inside `pipeline.withTransaction`. Emits `PIPELINE_META` reads `{permits, permit_inspections}` writes `{timing_calibration}` and `PIPELINE_SUMMARY` from xmax inserted/updated counts.

### Tests

**File 3 — `src/tests/timing.logic.test.ts`** (28-32 tests):
- Calibration cache: load on first call, reused within 5min, reloads after, error → empty cache + logError, empty → graceful
- Parent/child merge: no siblings, sibling with better phase, multiple siblings, query failure
- Tier 1: happy path PASSED, staleness >180d, outstanding gap, "Not Passed" penalty, painting precedence, no enabling stage → fallthrough
- Tier 2: cache hit, cache miss → global median, stale row → logWarn, insufficient sample, in-phase, not-in-phase
- Tier 3: pre-permit
- Top-level error guard: pool throws at each query point
- All tests use `vi.useFakeTimers({ now: '2026-04-08' })` + `_resetCalibrationCache()` in beforeEach

**File 4 — `src/tests/compute-timing-calibration.infra.test.ts`** (8-10 tests):
File-shape regex assertions: pipeline.run name, PERCENTILE_CONT(0.25/0.50/0.75) all present, WITHIN GROUP ORDER BY, withTransaction, ON CONFLICT (permit_type), table refs, BETWEEN 0 AND 730, HAVING >= 5, emitSummary, emitMeta, pipeline.log.error in catch.

### Database Impact
**NO** — no migrations. Phase 1a created `timing_calibration` and `inspection_stage_map`; `permit_inspections` and `permit_parcels` are pre-existing.

## Standards Compliance (§10)

### DB
- ⬜ N/A — no migrations
- ✅ Pool injected as parameter; no `new Pool()` anywhere
- ✅ Script uses Pipeline SDK
- ✅ Parameterized queries only
- ✅ ON CONFLICT UPSERT for idempotency
- ✅ HAVING >= 5 filters tiny samples

### API
- ⬜ N/A — no routes (Phase 2)

### UI
- ⬜ N/A — backend-only

### Shared Logic (§7)
- ✅ `timing.ts` reads `PHASE_TRADE_MAP` and `determinePhase` from `phases.ts` per spec 71's read-only dependency note. NOT modifying phases.ts.
- ✅ NO dual code path needed: `compute-timing-calibration.js` does percentile SQL only — no JS port of timing.ts logic. Different concerns: script writes the cache, library reads it.
- ✅ `TradeTimingEstimate` already defined in `src/features/leads/types.ts` from Phase 1b-i — single source of truth.

### Pipeline (§9)
- ✅ `pipeline.run` wrapper
- ✅ `pipeline.withTransaction` for atomic UPSERT
- ✅ Single SQL query (no streaming — small dataset)
- ✅ Idempotent UPSERT
- ✅ `PIPELINE_META` + `PIPELINE_SUMMARY` emitted
- ✅ `pipeline.log.{info,warn,error}` instead of bare console
- ✅ CommonJS in `scripts/`

### Try/Catch (§2) + logError mandate
- ✅ Top-level try/catch in `getTradeTimingForPermit` returns safe fallback
- ✅ Calibration load wrapped, continues with empty cache on failure
- ✅ Each tier has its own internal try semantics — no throws escape
- ✅ `logError` for unexpected, `logWarn` for known degraded paths, `logInfo` for happy-path observability

### Unhappy Path Tests
- ✅ Cache load failure
- ✅ Pool throws at each query point
- ✅ No matching enabling stage (trade not in inspection_stage_map)
- ✅ Stale calibration (>30d)
- ✅ Insufficient sample size (<20)
- ✅ Empty cache → bootstrap fallback
- ✅ Sibling query failure
- ✅ 180-day staleness on latest passed stage

### Mobile-First
- ⬜ N/A — backend-only

## Review Plan (per `feedback_review_protocol.md`, this is WF1)
- ✅ **Independent review** in worktree after commit (retry from Phase 1b-i 529 overload)
- ✅ **BOTH adversarial models** on EVERY changed/created file (4 files):
  - `src/features/leads/lib/timing.ts`
  - `scripts/compute-timing-calibration.js`
  - `src/tests/timing.logic.test.ts`
  - `src/tests/compute-timing-calibration.infra.test.ts`
- **4 files × 2 models = 8 adversarial reviews + 1 independent ≈ $1.60**
- ✅ Triage via Real / Defensible / Out-of-scope tree
- ✅ Append deferred items to `docs/reports/review_followups.md`
- ✅ Post full triage table in the response

## What's IN Scope
| Deliverable | Why |
|---|---|
| `timing.ts` + 28-32 tests | Spec 71 3-tier engine; consumed by Phase 2 detail page |
| `compute-timing-calibration.js` + 8-10 infra tests | Nightly populator for calibration cache |

## What's OUT of Scope
- `get-lead-feed.ts` — Phase 1b-iii
- `builder-query.ts` — Phase 1b-iii
- API routes — Phase 2
- Adding the script to the sources chain — separate small WF after Phase 1b proves stable
- Dual code path port — not applicable (script doesn't reuse timing.ts logic)

## Execution Plan

```
- [ ] Contract Definition: getTradeTimingForPermit signature locked at
      `(permit_num, trade_slug, pool) => Promise<TradeTimingEstimate>`.
      _resetCalibrationCache exported for tests only.

- [ ] Spec & Registry Sync: Spec 71 already hardened. Run
      `npm run system-map` AFTER commit.

- [ ] Schema Evolution: N/A — Phase 1a created timing_calibration and
      inspection_stage_map; permit_inspections and permit_parcels are
      pre-existing.

- [ ] Test Scaffolding: Create 2 test files. Run
      `npx vitest run src/tests/timing.logic.test.ts
       src/tests/compute-timing-calibration.infra.test.ts`
      MUST fail (Red Light).

- [ ] Red Light: Confirmed.

- [ ] Implementation:
      Step 1 — timing.ts skeleton (constants + ensureCalibrationLoaded + try/catch)
      Step 2 — pickBestCandidate (parent/child merge query)
      Step 3 — Tier 1 stage-based logic
      Step 4 — Tier 2 issued heuristic + cache + global fallback + bootstrap
      Step 5 — Tier 3 pre-permit
      Step 6 — Iterate timing tests until 28-32 pass
      Step 7 — compute-timing-calibration.js
      Step 8 — Run infra test
      Step 9 — `npm run typecheck` clean
      Step 10 — `npm run lint -- --fix` clean
      Step 11 — `npm run test` full suite (2613 + ~38 ≈ 2651+)

- [ ] Auth Boundary & Secrets: N/A — no routes, no new secrets.
      timing.ts is server-only (uses Pool from pg).

- [ ] Green Light: typecheck / lint / test all clean.

- [ ] Reviews:
      - Commit the implementation
      - Run Gemini + DeepSeek on all 4 files in parallel (8 jobs)
      - Run independent review agent in worktree (retry the 529 from
        Phase 1b-i)
      - Triage, apply real fixes in a follow-up commit, append deferred
        items to review_followups.md
      - Post full triage table

- [ ] WF6 close: 5-point sweep + final state summary
```

## Risk Notes

1. **Cache consistency in serverless.** Module-level cache is per-process. In Next.js serverless each instance refreshes independently. Acceptable — calibration changes daily at most. Documented inline.

2. **Date.now() in tests.** REFRESH_INTERVAL_MS and 180-day staleness depend on Date.now(). Use `vi.useFakeTimers({ now: new Date('2026-04-08') })` + `vi.advanceTimersByTime` rather than threading a clock parameter.

3. **`permit_inspections.status` enum is undocumented.** The codebase has `lib/inspections/parser.ts` with `normalizeStatus`. During implementation, read parser.ts to learn canonical values. If they differ from spec 71's "PASSED", normalize at the boundary in timing.ts via case-insensitive comparison.

4. **Parent/child merge query cost.** `pickBestCandidate` issues a permit_parcels JOIN per call. Fine on detail pages (1 call). Feed pages don't use this engine (use SQL proxy in Phase 1b-iii). Documented as "future batch query" follow-up.

5. **`determinePhase` from phases.ts is synchronous and date-based.** Reads issued_date, computes phase from elapsed months. If candidate has no issued_date the function still works (returns 'early_construction'). Verified during recon.

6. **Bootstrap calibration values.** First run after `compute-timing-calibration.js` ships will populate the table. Until then, `BOOTSTRAP_CALIBRATION = {p25:44, median:105, p75:238}` (spec 71 seed values from audit) keeps Tier 2 functional from day 0.

7. **Spec 71 says "PASSED" but DB might be "Passed"/"PASSED"/"passed".** Mitigation: case-insensitive comparison in `findLatestPassedInspection`. Tests verify both casings.
