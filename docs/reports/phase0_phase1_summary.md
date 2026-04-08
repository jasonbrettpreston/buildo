# Phase 0 + Phase 1 Foundation — Complete Architecture Summary

**Period:** 2026-04-07 → 2026-04-08 (two days)
**Commit range:** `6603cd6..4c04ef5` (19 commits)
**Test count:** ~1823 → 2697 (+874 tests across both phases)

This document is the input to a final phase-level adversarial review covering BOTH Phase 0 (frontend tooling foundation + backend infrastructure) AND Phase 1 (lead feed data layer). The DeepSeek and independent reviews have already covered Phase 1; this is Gemini's final cross-phase pass to catch anything that survived per-WF + per-file + per-phase reviews.

---

## Phase Inventory

### Phase 0a — Frontend Tooling Foundation (Day 1)

| Commit | What |
|---|---|
| `bc6cbd6` | Enable strict tsconfig flags (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`) + fix 377 latent errors across `src/lib/`, API routes, components, and tests. Strict mode is now enforced repo-wide. |
| `f4fc527` | Frontend Phase 0 tooling: Biome 2.4 scoped to `src/features/leads/**` + `src/lib/observability/**`, lint-staged, husky pre-commit additions, PostHog wrapper (`src/lib/observability/capture.ts` with type-safe EventName + init queue), Sentry instrumentation (`src/instrumentation.ts` + `sentry.client.config.ts`, production-only), Lighthouse CI config + GitHub Actions workflow, `logInfo` added to `src/lib/logger.ts`, root layout wired with `<PostHogProvider>`. |
| `ad85dcb` | Research artifacts + adversarial review tooling (`scripts/gemini-review.js` + `scripts/deepseek-review.js`) used to power the per-WF reviews throughout Phase 0 + Phase 1. |

### Phase 0b — Backend Infrastructure (Day 1)

| Commit | What |
|---|---|
| `64c19e0` | Migration safety net (`scripts/validate-migration.js`): pre-commit linter for new migrations with quote-aware comment stripping, top-level comma splitting, string-literal blanking. Catches `DROP TABLE`/`DROP COLUMN`/`ALTER ... DROP COLUMN`/`TRUNCATE` without `-- ALLOW-DESTRUCTIVE` marker, `CREATE INDEX` without `CONCURRENTLY` on known-large tables (`permits`, `permit_trades`, `permit_parcels`, `wsib_registry`, `entities`), `ALTER ADD COLUMN NOT NULL` without `DEFAULT`. 22 tests. `.sqlfluff` config added. |
| `dfc75ec` | PostGIS location columns: migrations 067 (`permits.location` geometry(Point, 4326) + `permits_set_location()` trigger + GIST index — PostGIS-conditional via DO block matching the existing 065 pattern), 068 (`permits.photo_url`), 069 (initial `lead_views` table — later corrected by Phase 1a migration 070). Backfill script `scripts/backfill-permits-location.js` using Pipeline SDK with streaming + batched UPSERT. |
| `63cbbe3` | Firebase auth helper (`src/lib/auth/get-user.ts`): `getUserIdFromSession(request) → Promise<string \| null>`. Lazy firebase-admin import, JWT shape pre-check, expired/revoked → null + logWarn, uninitialized admin in production → null + logError. Upstash rate limiter (`src/lib/auth/rate-limit.ts`): `withRateLimit(request, opts)` with per-(limit, windowSec) Map cache (NOT singleton — caught in adversarial review), `{count, expiresAt}` in-memory bucket shape, sample-weighted not present here, fail-closed in prod / fail-open in dev. SHA-256 12-char `key_hash` in logs (NOT raw key) per PII concern. Middleware comment update explaining edge-runtime cookie pre-check vs node-runtime full verifyIdToken split. |
| `45e7c86` | Biome scope expansion to API routes via `overrides` block + 9 backend latent fixes (7 regex `exec` loops → `matchAll`, 2 forEach callbacks wrapped in braces). Independent review caught the missing `noConsole` rule in the override; closed in `0a9d4c3`. |
| `0a9d4c3` | Independent-review-driven `noConsole` gap closed in API biome override. |

### Phase 1a — Data Schema (Day 2)

| Commit | What |
|---|---|
| `23a32a5` | Five new migrations spanning specs 70/71/72/73 — **migration 070 is a destructive rebuild** correcting the spec-drift in Backend Phase 0's migration 069 (table was 1 commit old with zero data). New `lead_views` shape: `id SERIAL PK, user_id, lead_key, lead_type, permit_num, revision_num, entity_id, trade_slug, viewed_at, saved`. CHECK on `lead_type IN ('permit','builder')`, XOR (permit-cols ∧ entity_id NULL ∨ entity_id ∧ permit-cols NULL). UNIQUE `(user_id, lead_key, trade_slug)`. FK CASCADE on permits + entities. 3 indexes: covering `(lead_key, trade_slug, viewed_at)`, user history `(user_id, viewed_at DESC)`, BRIN on `viewed_at`. Migration 071 `cost_estimates` (composite PK, FK CASCADE, CHECK constraints, idx). Migration 072 `inspection_stage_map` (21 seed rows verbatim from spec 71 — painting dual-entry Fire Separations prec 10 + Occupancy prec 20). Migration 073 `timing_calibration`. Migration 074 entities `photo_url` + `photo_validated_at` (HTTPS CHECK constraint, V1 leaves null). Types added to `src/lib/permits/types.ts`. Factories updated. 38 tests. |
| `909b3d5` | Adversarial review fixes: `CHECK (premium_factor >= 1.0)` on cost_estimates, `CHECK (cost_range_low <= cost_range_high)`, `CHECK (min_lag_days <= max_lag_days)` on inspection_stage_map, `CHECK (precedence > 0)`, `CHECK (stage_sequence IN (10,20,30,40,50,60,70))` enforcing the known construction-stage vocabulary. |
| `800b19a` | `docs/reports/review_followups.md` tracking log seeded with Phase 1a items. |

### Phase 1b-i — Cost Model (Day 2)

| Commit | What |
|---|---|
| `a460904` | `src/features/leads/types.ts` (single import surface — re-exports Phase 1a types + defines `TradeTimingEstimate`, `BuilderLeadCandidate`, `LeadFeedCursor`, `LeadFeedInput`, `LeadFeedItem`, `LeadFeedResult` upfront so subsequent sub-WFs don't churn). `src/features/leads/lib/distance.ts` (3 pure helpers + 2 constants, no JS haversine — distance math stays in PostGIS). `src/features/leads/lib/cost-model.ts` (~180 LOC pure `estimateCost(permit, parcel, footprint, neighbourhood) → CostModelResult` with all spec 72 §Implementation logic; exports `BASE_RATES`, `PREMIUM_TIERS`, `SCOPE_ADDITIONS`, `COST_TIER_BOUNDARIES`, `COMPLEXITY_SIGNALS`). `scripts/compute-cost-estimates.js` (CommonJS Pipeline SDK script with advisory lock 74, streamQuery for 237K permits, 5000-row batches in `pipeline.withTransaction`, ON CONFLICT UPSERT, **inline `estimateCostInline` mirroring cost-model.ts byte-for-byte per CLAUDE.md §7 dual code path**). 65 new tests. |
| `cca37a7` | Adversarial review fixes (7): the most important caught by a behavioral test was `'Interior Alteration'` matching `addition` rate ($2000) instead of `interior_reno` ($1150) because `'alteration'` substring matched first. Fixed in BOTH cost-model.ts AND compute-cost-estimates.js (dual code path). Also: `formatDistanceForDisplay` rounding 999.5 → "1000m" (now `Math.floor`), `Number.isFinite` guard for NaN/Infinity/negative inputs, 5 new behavioral base-rate tests with exact expected values, 3 test cleanups. |

### Phase 1b-ii — Timing Engine (Day 2)

| Commit | What |
|---|---|
| `13657da` | `src/features/leads/lib/timing.ts` (~460 LOC): async `getTradeTimingForPermit(permit_num, trade_slug, pool) → TradeTimingEstimate` with 3-tier model + parent/child permit merge + module-level calibration cache (5-min refresh) + bootstrap fallback (spec 71 seed: p25=44, median=105, p75=238). Tier 1 stage-based with `inspection_stage_map` enabling-stage lookup ordered by precedence ASC (handles painting Fire Separations prec 10 winning over Occupancy prec 20). Staleness check (>180d) fires BEFORE enabling-stage lookup. Tier 2 issued heuristic with sample-weighted global median fallback. Tier 3 pre-permit window (240-420d). Reads `PHASE_TRADE_MAP` from `src/lib/classification/phases.ts` (read-only dependency per spec 71). Never throws — top-level try/catch returns safe fallback `{confidence:'low', tier:3, ...}`. `scripts/compute-timing-calibration.js` with PERCENTILE_CONT(0.25/0.50/0.75) WITHIN GROUP, BETWEEN 0 AND 730 outlier filter, HAVING COUNT >= 5. 31 new tests. |
| `c66f21f` | Adversarial review fixes (6): `pickBestCandidate` siblings query lacked `ORDER BY` (non-deterministic fallback) — added `ORDER BY p.issued_date DESC NULLS LAST, p.permit_num ASC`. `compute-timing-calibration.js` JOIN ignored revision_num — collapsed permits to one row per `permit_num` via `permit_root` CTE before the inspections join. `getGlobalMedianCalibration` was unweighted arithmetic mean of percentiles → now sample-weighted by `row.sample_size`. Cache load failure was bumping `calibrationLoadedAt` → now leaves it at 0 to retry. Tier 2 `elapsedDays > p75` produced "0-0 weeks remaining" → explicit overdue branch with sensible messaging. PERCENTILE_CONT `::int` truncation → `ROUND()::int`. |

### Phase 1b-iii — Builder Query + Unified Feed (Day 2)

| Commit | What |
|---|---|
| `5aac708` | `src/features/leads/lib/builder-query.ts`: `BUILDER_QUERY_SQL` constant (verbatim spec 73 3-CTE structure: nearby_permits → builder_aggregates → scored, all 4 pillars in SQL, multi-WSIB tie-breaker subquery, WSIB allowlist filter, `ORDER BY relevance_score DESC + closest_permit_m ASC`, `LIMIT 20`). `queryBuilderLeads(trade_slug, lat, lng, radius_km, pool)` async function. Note: function signature is `(slug, lat, lng, ...)` — internally reorders to PostGIS `ST_MakePoint(lng, lat)`. `src/features/leads/lib/get-lead-feed.ts`: `LEAD_FEED_SQL` constant (verbatim spec 70 unified CTE with permit_candidates + builder_candidates + UNION ALL + ranked + cursor pagination via row tuple comparison `(relevance_score, lead_type, lead_id) < ($cursor_score, ...)`. All 4 pillars in SQL for both lead types. Permit timing pillar uses fast SQL proxy via `permit_trades.phase` because the full Phase 1b-ii engine is too slow per-row. Builder timing fixed at 15 ("ongoing capacity"). Lead ID format: permits `'permit_num:revision_num'`, builders `entity_id::text`). `getLeadFeed(input, pool)` async function. 38 tests. |
| `c23004f` | Adversarial review fixes (3): **`MAX_FEED_LIMIT = 30`** clamp added (spec 70 documents max 30; `input.limit` was unvalidated → DoS vector). Builder `value_score` `IS NULL → 5` branch (was falling to 10 "small", confusing "unknown" with "small"). Explicit JSDoc PARAMETER ORDER WARNING on `queryBuilderLeads` documenting the lat-first signature + internal PostGIS reordering. |

### Phase 1 Close (Day 2)

| Commit | What |
|---|---|
| `2778b6a` | **Discriminated unions** for `TradeTimingEstimate` (3-branch DU keyed on `tier`, eliminates impossible `{tier:1, confidence:'medium'}` states) and `LeadFeedItem` (`PermitLeadFeedItem | BuilderLeadFeedItem` keyed on `lead_type`, eliminates flat-with-nullable shape that forced defensive null checks in consumers). `mapRow` in `get-lead-feed.ts` narrows on `lead_type` and returns the right branch. **Spec doc fixes**: spec 70 line 62 ("migration 067" → "migration 070, after the spec-drift correction") and spec 71 line 29 (`(stage_name, trade_slug)` → `(stage_name, trade_slug, precedence)` matching migration 072). **cost-model.ts JSDoc** documenting the Institutional/Industrial best-effort default and warning future maintainers about dual code path. `phase1_summary.md` written for the holistic review. |
| `4c04ef5` | **CRITICAL bug fix from holistic independent review**: `get-lead-feed.ts` referenced `pt.trade_slug` on `permit_trades` in BOTH the permit_candidates CTE (line 117) AND the builder_candidates CTE (line 183). The column does NOT exist on `permit_trades` (only `trade_id INTEGER REFERENCES trades(id)` per migration 006). The unified feed SQL would have failed at runtime against any real database; the try/catch would have silently returned empty results. The bug passed every per-file review (Gemini + DeepSeek + per-WF independent across 3 sub-WFs) because all tests use mocked pools — only the holistic phase-level review caught it. Fixed in BOTH CTEs with `JOIN trades t ON t.id = pt.trade_id, t.slug = $1`. **`recordLeadView` helper** added (`src/features/leads/lib/record-lead-view.ts`) for Phase 2's `POST /api/leads/view` route — `recordLeadView(input, pool) → {ok, competition_count}` + exported `buildLeadKey()`, view action preserves saved state, save/unsave force the column, 30-day window competition count via the covering index. **Confidence threshold symmetry**: `pt.confidence >= 0.5` filter added to BOTH builder paths (the `builder_candidates` CTE in get-lead-feed.ts AND `nearby_permits` CTE in builder-query.ts). Symmetry restored across all 3 lead-discovery code paths. Regression test asserts `LEAD_FEED_SQL` contains `JOIN trades` and explicitly does NOT contain `pt.trade_slug`. |

---

## Cross-cutting Properties

### Standards compliance enforced everywhere

- **Strict TypeScript**: 5 strict flags active across the entire repo. `noUncheckedIndexedAccess` forces explicit null guards on every array indexing.
- **No `any`**: zero `any` types in any new code. `unknown` + narrowing where needed.
- **No `@ts-ignore`**: not used in any new code.
- **Try/catch boundary**: every async function has try/catch returning a safe fallback. Never throws to caller — Phase 2 routes can rely on this contract.
- **Logger discipline**: every catch block uses `logError`/`logWarn`/`logInfo` from `src/lib/logger.ts`. No bare `console.error` in `src/`.
- **Pipeline SDK**: every script uses `scripts/lib/pipeline.js` (`pipeline.run`, `pipeline.withTransaction`, `pipeline.streamQuery`). Never `new Pool()`.
- **Parameterized queries**: every SQL uses `$1, $2, ...` placeholders with explicit `::float8`/`::int`/`::text` casts at parameter sites.
- **Migration safety**: every migration has UP + DOWN blocks. `ALLOW-DESTRUCTIVE` markers on `DROP TABLE`/`DROP COLUMN`/`ALTER DROP COLUMN`/`TRUNCATE`. `CONCURRENTLY` on indexes for known-large tables (when supported by the migration framework — `scripts/migrate.js` runs each file in a single multi-statement query which prevents `CREATE INDEX CONCURRENTLY`; documented inline in 067).
- **Pre-commit gauntlet**: husky → `npx lint-staged` (Biome scoped) → `validate-migrations.sh` → `npm run typecheck` → `npm run lint` → `npm run test`. Passes on every commit in the range.

### Test coverage growth

- **Start of session (2026-04-07):** ~1823 tests (per MEMORY.md)
- **End of session (2026-04-08):** **2697 tests**
- **Net growth:** +874 tests across 19 commits
- **Test pattern:** Logic (`*.logic.test.ts`) / UI (`*.ui.test.tsx`) / Infra (`*.infra.test.ts`) triad. All Phase 1 tests use mocked `pool` — local DB is broken at pre-existing migration 030.

### Dual code path discipline

The single instance of dual code path in this range is `cost-model.ts` (TypeScript) ↔ `compute-cost-estimates.js` (CommonJS pipeline script with inline JS port). All 32 constants verified byte-for-byte in commit `cca37a7`'s manual audit + the holistic review re-verified at the phase level. Cross-reference comments in both files. Future hardening could extract to a shared JSON config.

### Adversarial review economics

- **38 per-file adversarial reviews** (Gemini + DeepSeek across 4 sub-WFs)
- **6 per-WF independent worktree reviews** (3 hit Anthropic 529 overload during Phase 1b-ii — 4th passed cleanly; deferred reviews tracked in followups log)
- **2 phase-level reviews** of Phase 1 (DeepSeek spec mode + independent worktree — both completed; independent caught the critical `pt.trade_slug` bug that all per-file reviews missed)
- **Total real bugs caught:** 22 across the entire range
- **Total spend:** ~$8 in API costs
- **Highest-leverage finding:** the holistic independent review's `pt.trade_slug` discovery in commit `4c04ef5`. Per-file reviews structurally couldn't see the cross-file inconsistency.

---

## Library Surface Available to Phase 2

Phase 2 routes can call any of these without their own try/catch:

```ts
// src/features/leads/lib/get-lead-feed.ts
getLeadFeed(input: LeadFeedInput, pool: Pool): Promise<LeadFeedResult>

// src/features/leads/lib/record-lead-view.ts
recordLeadView(input: RecordLeadViewInput, pool: Pool): Promise<RecordLeadViewResult>
buildLeadKey(input: RecordLeadViewInput): string

// src/features/leads/lib/timing.ts
getTradeTimingForPermit(permit_num: string, trade_slug: string, pool: Pool): Promise<TradeTimingEstimate>

// src/features/leads/lib/builder-query.ts
queryBuilderLeads(trade_slug: string, lat: number, lng: number, radius_km: number, pool: Pool): Promise<BuilderLeadCandidate[]>

// src/features/leads/lib/cost-model.ts
estimateCost(permit, parcel, footprint, neighbourhood): CostModelResult  // pure, no DB

// src/lib/auth/get-user.ts (Backend Phase 0)
getUserIdFromSession(request: NextRequest): Promise<string | null>

// src/lib/auth/rate-limit.ts (Backend Phase 0)
withRateLimit(request: NextRequest, opts: RateLimitOptions): Promise<RateLimitResult>
```

Plus type definitions in `src/features/leads/types.ts`:
- `LeadFeedInput`, `LeadFeedResult`, `LeadFeedCursor`
- `LeadFeedItem` = `PermitLeadFeedItem | BuilderLeadFeedItem` (discriminated union on `lead_type`)
- `TradeTimingEstimate` = 3-branch DU on `tier` (Tier 1 high/low, Tier 2 medium, Tier 3 low)
- `BuilderLeadCandidate`
- Re-exports of Phase 1a DB shapes

---

## Known Gaps (current followups state)

**Closed during this session:** 11+ followups across `2778b6a` and `4c04ef5`
**Currently OPEN:** 14 items, all correctly categorized:

- **Phase 2 dependencies (2):** Zod input validation, auth check at API route layer
- **Operational, blocked by environment (2):** `db:generate`, DB-roundtrip integration tests — both blocked by pre-existing local migration 030 failure
- **V2 hardening (6):** cost-model brittle string matching, tenure_renter_pct cliff, bulk INSERT perf, model_version increment policy, duplicate scope tags, stale permit_type cleanup
- **Pre-existing types.ts tech debt (8):** Gemini scope-leak from Phase 1a — 8 unrelated `src/lib/permits/types.ts` issues this WF didn't touch (`PermitChange`, `PermitFilter.sort_by`, `Inspection` dates, `Permit.dwelling_units_*`, `TradeMappingRule.match_field`, `Permit.location`, `SyncRun.status`, `Entity.is_wsib_registered`). Should be a single dedicated future WF.
- **Documentation (1):** Tier 2 SQL proxy in feed vs full timing engine on detail page can tell mutually-inconsistent stories — design tension, not bug

---

## Questions for Gemini's Final Pass

This is the LAST review before Phase 2 starts. Be especially adversarial about:

1. **Cross-phase integration**: Phase 0 Backend shipped `getUserIdFromSession` and `withRateLimit`. Phase 1 lib functions never call these directly — that's Phase 2's job. Are there any **implicit assumptions** in Phase 1 about who calls them or in what order?

2. **Spec gaps survived through 38 reviews**: the holistic independent review caught one critical bug (`pt.trade_slug`). Are there others in this same class — cross-file inconsistencies where each file looks fine in isolation? Specifically:
   - Are there any other column references in Phase 1 SQL that don't exist in the migrations?
   - Are there any FK relationships claimed in JOIN clauses that the migrations don't actually create?
   - Does `compute-timing-calibration.js` SQL reference any columns that the migrations don't define?

3. **Migration ordering risk**: Backend Phase 0 created migrations 067-069. Phase 1a created migrations 070-074. Migration 070 is a destructive rebuild of the table 069 created. If a developer runs migrations on a partially-applied database (069 applied but 070 not), they'd see the old `lead_views` shape and any code expecting the new shape would fail. Is there a migration ordering check anywhere?

4. **Dual code path drift surface**: cost-model.ts ↔ compute-cost-estimates.js are the only dual code path. The constants are claimed to match byte-for-byte. **Walk through 2-3 inputs through both files mentally** and verify the outputs are identical. If they diverge, the cache and the API will silently disagree.

5. **Unused exports**: Phase 1b-i defined types upfront for Phase 1b-ii and Phase 1b-iii. Are any of those types defined but never consumed? Are any constants defined but never used?

6. **PostGIS index assumptions**: `idx_permits_location_gist` was created in migration 067. Both `builder-query.ts` and `get-lead-feed.ts` rely on it for `ST_DWithin` and `<->` performance. The index uses `geometry(Point, 4326)` (GIST). Does PostgreSQL actually use the index for the queries as written? Or could there be a casting issue (`::geography` vs `::geometry`) that disables index use?

7. **Cursor pagination edge cases**: spec 70 documents cursor as `(score, lead_type, lead_id)`. With score ties, the lead_type tiebreak then lead_id tiebreak. Could there be a case where two identical-score rows from the same lead_type produce a cursor that the next page query treats as exclusive when the user expected inclusive? Walk through the comparison semantics.

8. **`recordLeadView` helper**: just added in commit `4c04ef5`. The function does upsert + count in two separate queries (race condition explicitly accepted per spec 70). Walk through the SQL — does the UPSERT correctly satisfy migration 070's XOR CHECK constraint for both lead types?

9. **Phase 0 stricter tsconfig — survived 19 commits**: 377 latent errors were fixed in commit `bc6cbd6`. Did any of the Phase 1 commits accidentally re-introduce any of those patterns? Specifically: `array[0]` without null check (`noUncheckedIndexedAccess`) and `obj.optional = undefined` (`exactOptionalPropertyTypes`).

10. **Logging contract**: every lib function logs success via `logInfo` and failure via `logError`. Phase 2 will rely on the absence of a success log line + presence of an error log line as the "lib failed" signal. Are there any code paths in Phase 1 lib functions where neither log fires (silent path)?

Be thorough. This is the final cross-check.
