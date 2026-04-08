# Phase 1 Lead Feed Data Layer — Architecture Summary

**Period:** 2026-04-08 (single day)
**Commit range:** `23a32a5..c23004f` (8 commits across 4 sub-WFs)
**Test count:** 2536 → 2684 (+148 tests)

This document is the input to phase-level adversarial + independent review of all of Phase 1, looking for architectural gaps, integration risks, and consistency issues that per-file reviews may have missed.

---

## Sub-WFs Shipped

| Sub-WF | Implementation commit | Review fix commit | Spec |
|---|---|---|---|
| **Phase 1a** — Data Schema | `23a32a5` | `909b3d5` | spec 70/71/72/73 §Database Schema |
| **Phase 1b-i** — Cost Model | `a460904` | `cca37a7` | spec 72 §Implementation |
| **Phase 1b-ii** — Timing Engine | `13657da` | `c66f21f` | spec 71 §Implementation |
| **Phase 1b-iii** — Builder Query + Unified Feed | `5aac708` | `c23004f` | spec 70 + 73 §Implementation |

---

## Database Schema (Phase 1a)

### Migrations created
- **070** `lead_views_corrected.sql` — DROP+CREATE rebuild correcting Backend Phase 0's spec drift. New shape per spec 70: `id SERIAL PK, user_id, lead_key, lead_type, permit_num, revision_num, entity_id, trade_slug, viewed_at, saved`. CHECK constraints: `lead_type IN ('permit','builder')`, XOR (permit-cols ∧ entity_id NULL ∨ entity_id ∧ permit-cols NULL). UNIQUE `(user_id, lead_key, trade_slug)`. FK CASCADE on permits + entities. 3 indexes: covering on `(lead_key, trade_slug, viewed_at)`, user history `(user_id, viewed_at DESC)`, BRIN on `viewed_at`.
- **071** `cost_estimates.sql` — composite PK `(permit_num, revision_num)`, FK CASCADE to permits. CHECK constraints on `cost_source IN ('permit','model')`, `cost_tier IN (small/medium/large/major/mega)`, `complexity_score 0-100`, `premium_factor >= 1.0`, `cost_range_low <= cost_range_high`. Index on `cost_tier`.
- **072** `inspection_stage_map.sql` — 21 seed rows verbatim from spec 71 table. UNIQUE `(stage_name, trade_slug, precedence)` accommodating painting's dual entry (Fire Separations prec 10 + Occupancy prec 20). CHECK constraints: `stage_sequence IN (10,20,30,40,50,60,70)`, `precedence > 0`, `min_lag_days <= max_lag_days`, `relationship IN ('follows','concurrent')`.
- **073** `timing_calibration.sql` — `permit_type UNIQUE`, integer percentile fields, computed_at default NOW.
- **074** `entities_photo_url.sql` — adds `photo_url VARCHAR(500)` + `photo_validated_at TIMESTAMPTZ` to existing entities table. CHECK `photo_url IS NULL OR photo_url LIKE 'https://%'` (defense in depth).

### Type definitions added (`src/lib/permits/types.ts`)
- `LeadView`, `LeadType` (literal union 'permit'|'builder')
- `CostEstimate`, `CostSource`, `CostTier`
- `InspectionStageMapRow`, `StageRelationship`
- `TimingCalibrationRow`
- Extended `Entity` with `photo_url` + `photo_validated_at` (additive, no breaking change)

### Factories added (`src/tests/factories.ts`)
- `createMockLeadView` rewritten to new shape
- `createMockCostEstimate`, `createMockInspectionStageMapRow`, `createMockTimingCalibrationRow` added
- `createMockEntity` updated with photo defaults

---

## Cost Model (Phase 1b-i)

### Files
- `src/features/leads/types.ts` — single import surface for `src/features/leads/`. Re-exports Phase 1a DB types + defines `TradeTimingEstimate`, `BuilderLeadCandidate`, `LeadFeedCursor`, `LeadFeedInput`, `LeadFeedItem`, `LeadFeedResult` (defined upfront so subsequent sub-WFs don't churn the type surface)
- `src/features/leads/lib/distance.ts` — `metersFromKilometers`, `kilometersFromMeters`, `formatDistanceForDisplay`, `DEFAULT_RADIUS_KM=10`, `MAX_RADIUS_KM=50`. NO JS haversine — distance math stays in PostGIS via `ST_Distance` / `<->` KNN.
- `src/features/leads/lib/cost-model.ts` — pure `estimateCost(permit, parcel, footprint, neighbourhood) → CostModelResult`. Implements spec 72 §Implementation verbatim. Exports `BASE_RATES`, `PREMIUM_TIERS`, `SCOPE_ADDITIONS`, `COST_TIER_BOUNDARIES`, `COMPLEXITY_SIGNALS` as `as const` objects.
- `scripts/compute-cost-estimates.js` — Pipeline SDK script. Advisory lock 74, streamQuery 237K permits, batches of 5000 in `pipeline.withTransaction`, ON CONFLICT UPSERT. **Inline `estimateCostInline` mirrors `cost-model.ts` byte-for-byte** per CLAUDE.md §7 dual code path discipline.

### Algorithm
1. If `permit.est_const_cost > 1000` → use directly (source='permit')
2. Else compute `area × base_rate × premium + scope_additions`
3. Building area: footprint × stories OR urban-aware fallback (tenure_renter_pct > 50% → coverage 0.7, else 0.4)
4. Premium tiers: <60K→1.0, 60K-100K→1.15, 100K-150K→1.35, 150K-200K→1.6, >200K→1.85
5. Scope additions: pool +80K, elevator +60K, underpinning +40K, solar +25K
6. Cost tiers: <100K=small, <500K=medium, <2M=large, <10M=major, ≥10M=mega
7. Complexity score (capped at 100 via `Math.min`): high-rise +30, multi-unit +20, large footprint +15, premium nbhd +15, complex scope +10 each, new build +10

---

## Timing Engine (Phase 1b-ii)

### Files
- `src/features/leads/lib/timing.ts` (~460 LOC) — async `getTradeTimingForPermit(permit_num, trade_slug, pool) → TradeTimingEstimate`. Module-level calibration cache with 5-min refresh. Reads `PHASE_TRADE_MAP` from `src/lib/classification/phases.ts` (read-only dependency per spec 71).
- `scripts/compute-timing-calibration.js` — single PERCENTILE_CONT(0.25/0.50/0.75) WITHIN GROUP query, BETWEEN 0 AND 730 outlier filter, HAVING COUNT >= 5, ROUND() before ::int cast, UPSERT in `pipeline.withTransaction`. Collapses permits by `permit_num` (DISTINCT ON earliest issued_date) BEFORE the inspections JOIN to avoid revisions sharing first_inspection_date.

### Algorithm
- **Tier 1 (high confidence):** finds canonical enabling stage for trade via ORDER BY precedence ASC, computes lag from `inspection_stage_map`. Staleness check (>180d) fires BEFORE enabling-stage lookup so it works for trades without a map entry. "Not Passed" adds +14d penalty + "delayed" string. Outstanding stages count `stage_sequence` gap × 30d.
- **Tier 2 (medium confidence):** reads `timing_calibration` cache, falls back to **sample-weighted** global median on miss / >30d stale / <20 sample. Uses BOOTSTRAP_CALIBRATION (spec 71 seed: p25=44, median=105, p75=238) when cache empty so Tier 2 works from day 0. Tier 2 has explicit overdue branch (elapsed > p75) with sensible messaging.
- **Tier 3 (low confidence):** pre-permit, 240-420 day window.
- **Parent/child merge:** `pickBestCandidate` queries `permit_parcels` for siblings on same parcel (with stable ORDER BY p.issued_date DESC, p.permit_num ASC), picks one whose phase contains the trade per `PHASE_TRADE_MAP[phase]`.
- **Never throws** — top-level try/catch returns safe fallback `{confidence:'low', tier:3, ...}`.

---

## Builder Query + Unified Feed (Phase 1b-iii)

### Files
- `src/features/leads/lib/builder-query.ts` — exports `BUILDER_QUERY_SQL` constant + `queryBuilderLeads(trade_slug, lat, lng, radius_km, pool) → BuilderLeadCandidate[]`. Spec 73 §Implementation 3-CTE structure (nearby_permits → builder_aggregates → scored). 4 pillars in SQL: proximity (0-30), activity (0-30), contact (0-20), fit (0-23 with WSIB +3 bonus). Multi-WSIB tie-breaker subquery.
- `src/features/leads/lib/get-lead-feed.ts` — exports `LEAD_FEED_SQL` constant + `getLeadFeed(input, pool) → LeadFeedResult`. Spec 70 §Implementation unified CTE: `permit_candidates + builder_candidates + UNION ALL + ranked` with cursor pagination via row tuple comparison. **MAX_FEED_LIMIT=30 clamp** + **radius_km clamp to MAX_RADIUS_KM=50**, both BEFORE the empty-result fallback so meta reflects clamped values on error.

### Critical decisions
- **Two scoring schemes coexist** for builders: spec 73 standalone uses 30/30/20/23 (proximity/activity/contact/fit), spec 70 unified feed uses 30/30/30/10 (proximity/timing/value/opportunity). The same builder gets different scores between the two endpoints. Documented in `builder-query.ts` header.
- **SQL↔SQL "duplication"** between `BUILDER_QUERY_SQL` and `builder_candidates` CTE inside `LEAD_FEED_SQL` is by design (different aggregations + spec mapping). NOT a CLAUDE.md §7 dual code path violation (which is JS↔SQL).
- **Lead ID format:** permits `'permit_num:revision_num'` (e.g. `'24 101234:01'`), builders `entity_id::text` (e.g. `'9183'`). Disjoint by colon presence.
- **Cursor pagination:** row-tuple comparison `(relevance_score, lead_type, lead_id) < ($6::int, $7::text, $8::text)`. Page 1 sends `null/null/null` → `$6::int IS NULL` short-circuits the WHERE. Single SQL handles both first-page and subsequent pages.
- **Fast SQL timing proxy** in `get-lead-feed.ts` permit_candidates uses `permit_trades.phase` for the timing pillar (mapped 30/25/20/15/10) — the full Phase 1b-ii 3-tier engine is too slow per-row for the feed CTE. The full engine drives the per-permit detail page.
- **`<-> distance` repetition** in CTEs: PostgreSQL planner CSEs the expression per row (verified by independent review). Visual repetition only.

---

## Cross-cutting Properties

### Standards compliance
- Every async function has try/catch returning safe fallback — never throws to caller (Phase 2 routes can rely on this contract)
- Every catch block uses `logError` from `src/lib/logger` (no bare console.error)
- Every script uses Pipeline SDK (`pipeline.run`, `pipeline.withTransaction`, `pipeline.streamQuery`) — never `new Pool()`
- All DB access via parameterized queries; explicit `::float8`/`::int`/`::text` casts at parameter sites
- All migration DOWN blocks present; ALLOW-DESTRUCTIVE markers on DROP TABLE / DROP COLUMN
- Pre-commit gauntlet (typecheck + ESLint + Vitest + Biome scoped to `src/features/leads/**`) passed on every commit

### Test coverage
- **148 new tests** across:
  - 5 schema infra tests (Phase 1a) — file-shape regex assertions
  - 9 distance + 40 cost-model + 16 compute-cost-estimates (Phase 1b-i)
  - 20 timing + 11 compute-timing-calibration (Phase 1b-ii)
  - 17 builder-query + 23 get-lead-feed (Phase 1b-iii)
- All tests use **mocked pool** (`vi.fn()`) — no real DB connection because local DB is broken at pre-existing migration 030
- File-shape tests for migrations and pipeline scripts (regex assertions on SQL content) — limitation acknowledged in followups log

### Adversarial review summary
- 14 + 8 + 8 + 8 = **38 adversarial reviews** (Gemini + DeepSeek per file)
- 4 independent worktree reviews (3 hit Anthropic 529 overload — 4th passed cleanly)
- ~$8 total spend
- **18 real bugs caught** across the four sub-WFs — including the `'Interior Alteration'` matching `addition` rate (test caught it too), the timing cache load failure 5-min lockout, the `compute-timing-calibration` revision_num join bias, the `MAX_FEED_LIMIT` DoS gap, and the `pickBestCandidate` non-deterministic ORDER BY
- All caught bugs were **fixed in same-WF follow-up commits**

---

## Known Gaps (followups log entries)

**Operational (waiting for environment fix):**
- `db:generate` deferred — local DB broken at migration 030
- DB-roundtrip integration tests deferred — same constraint
- File-shape regex SQL tests are a deliberate fallback

**Phase 2 dependencies:**
- Auth check (`getUserIdFromSession` → trade_slug authorization) — Phase 2 route layer
- Rate limiting (`withRateLimit`) — Phase 2 route layer
- Zod input validation on lat/lng/limit — Phase 2 boundary
- Already-viewed exclusion via `lead_views` — Phase 2+

**V2 hardening:**
- `LeadFeedItem` discriminated union refactor (currently flat with nullable fields per lead type)
- `cost-model.ts` brittle string matching for permit categorization
- `tenure_renter_pct = 50%` cliff effect smoothing
- `compute-cost-estimates.js` bulk INSERT perf optimization
- Spec 72 institutional/industrial structure type coverage
- Stale `permit_type` cleanup in `timing_calibration` table
- `builder-query.ts` redundant subquery + GROUP BY cosmetic cleanup

**Pre-existing tech debt** (8 Gemini findings on `src/lib/permits/types.ts` from Phase 1a scope leak — out of scope for Phase 1)

---

## Phase 2 Readiness

**What's ready to consume:**
- `getLeadFeed(input, pool) → LeadFeedResult` — main `/api/leads/feed` entry
- `getTradeTimingForPermit(permit_num, trade_slug, pool) → TradeTimingEstimate` — per-permit detail page
- `queryBuilderLeads(...) → BuilderLeadCandidate[]` — standalone builder listings
- `estimateCost(...)` — pure function for ad-hoc cost computation (cache is the primary path)
- `getUserIdFromSession(request)` — Backend Phase 0 auth helper
- `withRateLimit(request, opts)` — Backend Phase 0 rate limiter

**What Phase 2 routes need to do:**
1. Read trade_slug from session via `getUserIdFromSession` (Firebase admin verifies the JWT)
2. Validate input via Zod schema — clamp limit, validate lat/lng bounds, reject invalid trade_slug
3. Call `withRateLimit(request, { key: uid, limit: 30, windowSec: 60 })`
4. Verify `req.trade_slug === user.trade_slug` (403 if mismatch)
5. Call `getLeadFeed(input, pool)` and return `{ data, error: null, meta: {...} }`
6. POST `/api/leads/view` upserts to `lead_views` using deterministic `lead_key` format

---

## Questions for the Reviewer

1. **Cross-sub-WF consistency:** the type definitions in `src/features/leads/types.ts` were defined upfront in Phase 1b-i for use by Phase 1b-ii and Phase 1b-iii. Did the actual implementations end up matching? Are any defined types unused or shaped incorrectly?

2. **Integration risk:** with 4 separate libraries (cost-model, timing, builder-query, get-lead-feed) all reading the same DB tables, are there any unintended interactions? (e.g., does `getLeadFeed` accidentally re-query timing data per row when it shouldn't?)

3. **Spec drift:** spec 70/71/72/73 were hardened before Phase 1 started. Did any implementation deviate from spec without documenting the reason in commit messages or `review_followups.md`?

4. **Phase 2 assumptions:** the lead feed API contract is `getLeadFeed(input, pool) → LeadFeedResult`. Are there any undocumented assumptions about the caller (e.g., must call `ensureCalibrationLoaded` first) that Phase 2 wouldn't know to honor?

5. **Test surface gaps:** with the local DB broken at migration 030, all tests are mock-based. Are there critical SQL paths whose runtime correctness has NEVER been verified (against any DB)?

6. **Standalone vs unified scoring divergence:** spec 73's standalone builder query uses `30/30/20/23` pillars (proximity/activity/contact/fit+WSIB), while spec 70's unified feed uses `30/30/30/10` (proximity/timing/value/opportunity). The same builder gets a different score depending on which endpoint Phase 2 routes hit. Is this a real product issue, or acceptable spec design?
