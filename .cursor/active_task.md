# Active Task: WF1 — Lead Feed Phase 1b-iii: Builder Query + Unified Feed
**Status:** Implementation
**Workflow:** WF1 — New Feature Genesis
**Rollback Anchor:** `c66f21f`

## Domain Mode
**Backend/Pipeline Mode** — async DB-backed library, NO API routes, NO new migrations. Per CLAUDE.md Backend rules: §2/§6/§7/§9 of `00_engineering_standards.md`. All DB access via the `pool` parameter (consumers inject from `src/lib/db/client.ts`).

## Context
* **Goal:** Final sub-WF of the Phase 1b split. Ship spec 73's builder-leads query + spec 70's unified lead-feed CTE. After this WF, `getLeadFeed(input, pool)` is the single entry point Phase 2 wraps in `/api/leads/feed`. The unified query ranks permit and builder leads in one SQL pass with cursor pagination — no application-level interleaving (the foot-gun spec 70 explicitly calls out).
* **Target Specs:**
  - `docs/specs/product/future/70_lead_feed.md` §Implementation
  - `docs/specs/product/future/73_builder_leads.md` §Implementation
  - `docs/specs/product/future/75_lead_feed_implementation_guide.md` §11 Phase 1
  - `docs/specs/00_engineering_standards.md` §2/§6
* **Key Files:** new — `src/features/leads/lib/builder-query.ts`, `src/features/leads/lib/get-lead-feed.ts`, `src/tests/builder-query.logic.test.ts`, `src/tests/get-lead-feed.logic.test.ts`. Reads from (no modifications) — `src/features/leads/types.ts`, `src/features/leads/lib/distance.ts`.

## Technical Implementation

### File 1 — `src/features/leads/lib/builder-query.ts` (~200 lines)

```ts
export const BUILDER_QUERY_SQL: string;          // exported for tests
export const BUILDER_QUERY_LIMIT = 20;
export async function queryBuilderLeads(
  trade_slug: string,
  lat: number,
  lng: number,
  radius_km: number,
  pool: Pool,
): Promise<BuilderLeadCandidate[]>;
```

**SQL = exact 3-CTE structure from spec 73 §Implementation:**
- `nearby_permits`: joins permits + entity_projects (role='Builder') + permit_trades + trades; filters status IN ('Permit Issued', 'Inspection') and ST_DWithin
- `builder_aggregates`: groups by entity_id, picks most-recent WSIB row via subquery (multi-WSIB tie-breaker per spec), filters via WSIB EXISTS, HAVING COUNT(np.permit_num) >= 1
- `scored`: 4 pillars in SQL — proximity (closest_permit_m bands 500/1000/2000/5000/10000/20000), activity (count >=5/3/2/else), contact (website+phone/either/email/none), fit (count tiers + WSIB +3 bonus)
- Final SELECT: `relevance_score = sum`, ORDER BY DESC + `closest_permit_m ASC` tiebreak, LIMIT 20

**Parameters:** `$1=trade_slug`, `$2=lng`, `$3=lat`, `$4=radius_m`. PostGIS `ST_MakePoint(lng, lat)` order. All casts explicit (`::float8`).

**Function flow:** try → `pool.query(BUILDER_QUERY_SQL, [...])` → map rows → `BuilderLeadCandidate[]` → return. Catch → `logError` + return `[]`. Log success via `logInfo` with `{ trade_slug, count, duration_ms }`.

### File 2 — `src/features/leads/lib/get-lead-feed.ts` (~350 lines)

```ts
export const LEAD_FEED_SQL: string;     // single SQL, parameterized cursor
export async function getLeadFeed(input: LeadFeedInput, pool: Pool): Promise<LeadFeedResult>;
```

**Function flow:**
1. `radius_km = Math.min(input.radius_km, MAX_RADIUS_KM)` — clamp DoS-bounded
2. `radius_m = metersFromKilometers(radius_km)`
3. Build params: `[trade_slug, lng, lat, radius_m, limit, cursor?.score ?? null, cursor?.lead_type ?? null, cursor?.lead_id ?? null]`
4. `start = Date.now()`
5. `pool.query<LeadFeedRow>(LEAD_FEED_SQL, params)`
6. Map rows → `LeadFeedItem[]`
7. `next_cursor = rows.length === limit ? { score, lead_type, lead_id } from last row : null`
8. `logInfo('[lead-feed/get]', 'success', { user_id, trade_slug, lat, lng, radius_km, result_count, duration_ms })`
9. Return `{ data, meta: { next_cursor, count, radius_km } }`
10. Catch → `logError` + return empty result with safe meta

**Unified CTE (verbatim from spec 70 §Implementation, with all 4 pillars completed in SQL — spec sketched only proximity):**

Four CTEs:
- **`permit_candidates`**: SELECT FROM permits + permit_trades + LEFT JOIN cost_estimates. Computes:
  - `proximity_score` (0-30): CASE on `(p.location <-> ST_MakePoint($2,$3)::geography)` distance bands
  - `timing_score` (0-30): fast SQL proxy via `permit_trades.phase` (structural=30, finishing=25, early_construction=20, landscaping=15, else 10) — the full 3-tier engine from Phase 1b-ii is too slow per-row for the feed CTE; it's a per-permit detail call
  - `value_score` (0-30): CASE on `cost_estimates.cost_tier` (mega=30, major=25, large=20, medium=15, small=10, NULL=5)
  - `opportunity_score` (0-10): CASE on `permits.status` (Permit Issued=10, Inspection=7, Application=5, else 0)
  - WHERE `pt.trade_slug = $1 AND pt.is_active = true AND pt.confidence >= 0.5 AND p.location IS NOT NULL AND ST_DWithin(...) AND p.status NOT IN ('Cancelled', 'Revoked', 'Closed')`

- **`builder_candidates`**: SELECT FROM entities + entity_projects + permits + permit_trades + LATERAL wsib_registry. Same 4 pillars, builder-specific:
  - proximity from `MIN(p.location <-> ...)` (closest active permit)
  - timing fixed at 15 (builders are "ongoing capacity")
  - value from `AVG(p.est_const_cost)` bucketed
  - opportunity from `COUNT(p.permit_num)` bucketed
  - GROUP BY entity_id; WHERE WSIB filter (Small/Medium Business, GTA, has contact)

- **`unified`**: `SELECT * FROM permit_candidates UNION ALL SELECT * FROM builder_candidates`

- **`ranked`**: `SELECT *, (proximity_score + timing_score + value_score + opportunity_score) AS relevance_score FROM unified`

Final SELECT: `WHERE ($6::int IS NULL OR (relevance_score, lead_type, lead_id) < ($6::int, $7::text, $8::text)) ORDER BY relevance_score DESC, lead_type DESC, lead_id DESC LIMIT $5::int`

**Cursor pagination:** Page 1 sends `cursor=undefined` → params `[..., null, null, null]` → `$6::int IS NULL` short-circuits the WHERE. Page N sends prior `next_cursor` tuple. Stable across concurrent inserts because the entire ranking happens in one SQL pass.

**Lead ID format:** permits use `permit_num || ':' || revision_num` (e.g. `'24 101234:01'`), builders use `e.id::text` (e.g. `'9183'`). Colon vs no-colon makes them distinguishable; cursor comparison is text.

### Tests

**File 3 — `src/tests/builder-query.logic.test.ts`** (15-18 tests):

SQL structure (via `BUILDER_QUERY_SQL` constant):
- All 3 CTEs present (`nearby_permits`, `builder_aggregates`, `scored`)
- All 4 score pillars present
- Multi-WSIB tie-breaker subquery: `ORDER BY w.last_enriched_at DESC LIMIT 1`
- WSIB filter: `business_size IN ('Small Business', 'Medium Business')`
- Status filter: `IN ('Permit Issued', 'Inspection')`
- `ST_DWithin` + `ST_MakePoint($2::float8, $3::float8)::geography`
- `ORDER BY relevance_score DESC, closest_permit_m ASC`
- `LIMIT 20`

Function behavior (mocked pool):
- Happy path → `BuilderLeadCandidate[]`
- Empty result → `[]`
- Pool throws → `[]` + logError
- `radius_km` correctly converted via `metersFromKilometers`
- `lat`/`lng` parameter order verified (most common bug: ST_MakePoint takes lng FIRST)
- `logInfo` called with structured fields

**File 4 — `src/tests/get-lead-feed.logic.test.ts`** (18-22 tests):

SQL structure (via `LEAD_FEED_SQL` constant):
- All 4 CTEs (`permit_candidates`, `builder_candidates`, `unified`, `ranked`)
- `UNION ALL` between candidates
- All 4 pillars in BOTH candidate CTEs
- `relevance_score` sum in `ranked`
- Cursor WHERE: `($6::int IS NULL OR (relevance_score, lead_type, lead_id) <`
- ORDER BY `relevance_score DESC, lead_type DESC, lead_id DESC`
- `ST_DWithin` filters in BOTH CTEs
- Permit confidence filter: `pt.confidence >= 0.5`
- Permit status exclusion: `NOT IN ('Cancelled', 'Revoked', 'Closed')`

Function behavior:
- Happy path with mocked rows → mapped LeadFeedItems
- Full page (rows.length === limit) → next_cursor extracted from last row
- Partial page (rows.length < limit) → next_cursor null
- Empty result → empty data, null cursor, count 0
- Pool throws → empty result + logError
- First page (no cursor) → null/null/null in params $6/$7/$8
- Subsequent page → cursor values in params
- `radius_km > MAX_RADIUS_KM` → clamped to 50, reflected in meta
- `logInfo` with `{ user_id, trade_slug, lat, lng, radius_km, result_count, duration_ms }`
- Mixed permit + builder rows → both LeadFeedItem types in `data`

### Database Impact
**NO** — no migrations. Reads pre-existing tables + Phase 1a `cost_estimates`.

## Standards Compliance (§10)

### DB
- ⬜ N/A — no migrations
- ✅ Pool injected as parameter; never `new Pool()`
- ✅ Parameterized queries only
- ✅ Explicit `::float8` / `::int` casts at parameter sites
- ✅ PostGIS `ST_DWithin` + `<->` KNN — uses GIST index from Phase 1a migration 067
- ✅ LIMIT enforced server-side
- ✅ Cursor pagination via row tuple comparison — stable per spec 70

### API
- ⬜ N/A — no routes (Phase 2)
- ✅ Function signatures shaped for thin Phase 2 wrappers

### UI
- ⬜ N/A — backend-only

### Shared Logic (§7)
- ✅ Imports `metersFromKilometers`, `MAX_RADIUS_KM` from Phase 1b-i `distance.ts`
- ✅ Imports `BuilderLeadCandidate`, `LeadFeedInput`, `LeadFeedItem`, `LeadFeedResult`, `LeadFeedCursor` from Phase 1b-i `types.ts` — single source of truth, no churn
- ✅ NO dual code path (no JS↔SQL port). The SQL↔SQL "duplication" between standalone `builder-query.ts` and inlined `builder_candidates` CTE is a deliberate spec choice (spec 73 + spec 70 unification) — documented inline in both files
- ✅ NO modifications to `phases.ts`, `cost-model.ts`, `timing.ts`

### Pipeline (§9)
- ⬜ N/A — no scripts in this WF

### Try/Catch (§2) + logError mandate
- ✅ Both functions have top-level try/catch returning safe fallback (empty array / empty result)
- ✅ `logError` for unexpected throws with full context
- ✅ `logInfo` on success with structured fields
- ✅ Never throws to caller — Phase 2 routes can rely on this

### Unhappy Path Tests
- ✅ Pool throws → safe fallback for both functions
- ✅ Empty result → empty array / empty result
- ✅ Cursor null vs cursor populated paths
- ✅ Limit boundary: < limit → next_cursor null; === limit → next_cursor extracted
- ✅ radius_km > MAX_RADIUS_KM → clamped, reflected in meta

### Mobile-First
- ⬜ N/A — backend-only

## Review Plan (per `feedback_review_protocol.md`, this is WF1)
- ✅ Independent review in worktree after commit (retry the 529 from prior sub-WFs)
- ✅ BOTH adversarial models on **all 4 files** — 8 adversarial reviews + 1 independent ≈ $1.60
- ✅ Triage via Real / Defensible / Out-of-scope tree
- ✅ Append deferred items to `docs/reports/review_followups.md`
- ✅ Post full triage table in the response

## What's IN Scope
| Deliverable | Why |
|---|---|
| `builder-query.ts` + 15-18 tests | Spec 73 standalone builder query — Phase 2 builder-only endpoints + spec 73 behavior coverage |
| `get-lead-feed.ts` + 18-22 tests | Spec 70 unified CTE — main entry point Phase 2 wraps |

## What's OUT of Scope
- API routes — Phase 2
- Auth wiring (`getUserIdFromSession` already exists from Backend Phase 0)
- Rate limiting wiring (`withRateLimit` already exists from Backend Phase 0)
- Pipeline scripts — none needed
- Per-permit detail page — Phase 2+ via the timing engine from Phase 1b-ii

## Execution Plan

```
- [ ] Contract Definition: queryBuilderLeads + getLeadFeed signatures
      locked. LeadFeedInput / LeadFeedResult shapes already defined in
      Phase 1b-i types.ts.

- [ ] Spec & Registry Sync: Specs 70 + 73 already hardened. Run
      `npm run system-map` AFTER commit.

- [ ] Schema Evolution: N/A — Phase 1a created cost_estimates;
      permits/permit_trades/entities/entity_projects/wsib_registry/trades
      are pre-existing.

- [ ] Test Scaffolding: Create 2 test files. Run
      `npx vitest run src/tests/builder-query.logic.test.ts
       src/tests/get-lead-feed.logic.test.ts`
      MUST fail (Red Light).

- [ ] Red Light: Confirmed.

- [ ] Implementation:
      Step 1 — builder-query.ts (BUILDER_QUERY_SQL constant + queryBuilderLeads)
      Step 2 — Iterate builder-query tests to green
      Step 3 — get-lead-feed.ts (LEAD_FEED_SQL constant + getLeadFeed)
      Step 4 — Iterate get-lead-feed tests to green
      Step 5 — `npm run typecheck` clean
      Step 6 — `npm run lint -- --fix` clean
      Step 7 — `npm run test` full suite (2644 + ~38 ≈ 2680+)

- [ ] Auth Boundary & Secrets: N/A — no routes, no new secrets.
      Both libraries are server-only (use Pool from pg).

- [ ] Green Light: typecheck / lint / test all clean.

- [ ] Reviews:
      - Commit the implementation
      - Run Gemini + DeepSeek on all 4 files in parallel (8 jobs)
      - Run independent review agent in worktree (retry 529)
      - Triage, apply real fixes in a follow-up commit, append deferred
        items to review_followups.md
      - Post full triage table

- [ ] WF6 close: 5-point sweep + final state summary
```

## Risk Notes

1. **Local DB still broken at migration 030.** All SQL is mock-tested only. The unified CTE has 10+ join points and ~14 `<->` distance expressions — runtime errors will only surface in CI against a clean DB. Mitigation: SQL structure tests assert every pillar/CTE is present; mock-pool tests assert function flow; spec 70 SQL is the source of truth.

2. **`<->` operator repetition in builder_candidates CTE.** The KNN distance expression appears 7 times for proximity scoring. PostgreSQL caches expression evaluation per row, so structural readability cost only — not a runtime hit. Inline rather than LATERAL alias because builder uses `MIN(...)` across multiple permits per builder, not one row.

3. **Cursor pagination param ordering.** Page 1 with `cursor=undefined` → params have `null, null, null` for $6/$7/$8 → `$6::int IS NULL` short-circuits. Tests verify the param array uses `null` literal (not `undefined`) so pg doesn't complain about parameter type inference.

4. **`p.est_const_cost::float8` cast on NULL.** PostgreSQL: NULL cast to float8 returns NULL. Verified safe.

5. **`avg_project_cost` from `AVG(...) FILTER (WHERE est_const_cost > 0)`.** Returns NULL when no rows match. JS mapping handles `null`.

6. **Lead ID collision risk.** Permits: `'24 101234:01'`. Builders: `'9183'`. Colon presence makes them distinguishable. Cursor comparison treats lead_id as text — same lead_type always has same lead_id format, so the tuple ordering is consistent.

7. **Independent review agent has hit Anthropic 529 overload three times in 24h.** Phase 1b-iii reviews retry the same agent. If it fails again, the manual dual-walkthrough fallback (used in Phase 1b-i and Phase 1b-ii) is the recovery path.

8. **`builder-query.ts` SQL is technically duplicated by `builder_candidates` CTE in `get-lead-feed.ts`.** This is the cost of having a standalone builder endpoint per spec 73 + a unified feed per spec 70. CLAUDE.md §7 dual code path rule applies to JS↔SQL, not SQL↔SQL — but it's still a maintenance gotcha. Documented inline. Future hardening could share a SQL fragment via a JS template helper.
