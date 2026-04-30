# Active Task: Mobile Backend Foundations — Lead Detail, Flight-Board Detail, permits.updated_at
**Status:** Implementation
**Workflow:** WF3 — Bug Fix (3 mobile blockers, all backend)
**Domain Mode:** Cross-Domain — Scenario B (API consumed by Expo). Read `.claude/domain-crossdomain.md` ✓ + `scripts/CLAUDE.md` ✓ + `.claude/domain-admin.md` ✓.

---

## Context

* **Goal:** Unblock three mobile bugs by shipping their backend prerequisites:
  1. **Lead Investigation View** (`/(app)/[lead]`) — currently reads from TanStack feed cache only; on cold-boot from a push notification, the cache is empty and the screen has no source of truth. Build `GET /api/leads/detail/:id` joining `permits + cost_estimates + neighbourhoods + lead_views`.
  2. **Flight Board cold-boot** (`/(app)/[flight-job]`) — currently looks up a single job by id-walking the `useFlightBoard()` array; cold-boot from a push notification → empty array → "Job not found". Build `GET /api/leads/flight-board/detail/:id` returning the single saved job by id.
  3. **"Newly Updated" amber flash** on `FlightCard.tsx` — the component already implements the animation, but `hasUpdate` is never passed because the flight-board response shape lacks an `updated_at` field. Add `permits.updated_at` column + DB trigger (matching the Migration 100 pattern) and expose it on the list and both detail endpoints.

* **Target Specs:**
  - `docs/specs/03-mobile/91_mobile_lead_feed.md §4.3` (Detailed Investigation View) — backs `/api/leads/detail/:id`
  - `docs/specs/03-mobile/77_mobile_crm_flight_board.md §3.3` (Detailed Investigation View for flight board) + §3.2 "Amber Update Flash" — backs `/api/leads/flight-board/detail/:id` and the `updated_at` exposure

* **Validation findings (pre-flight):**
  - `permits.updated_at` — **MISSING** from `src/lib/db/schema.ts:888-970` and from migrations 100/114. Permits has `firstSeenAt`, `lastSeenAt`, `geocodedAt`, etc. but no `updated_at`.
  - `cost_estimates` table — **PRESENT** at `schema.ts:857-886`, FK to permits via `(permit_num, revision_num)`. Columns: `estimated_cost`, `cost_source`, `cost_tier`, `cost_range_low`, `cost_range_high`, `modeled_gfa_sqm`, `effective_area_sqm`, `premium_factor`, `complexity_score`, `model_version`, `computed_at`, `trade_contract_values` (JSONB), `is_geometric_override`.
  - `neighbourhoods` table (British spelling) — **PRESENT** at `schema.ts:307-334`. Columns: `id` (serial PK), `neighbourhood_id`, `name`, `avg_household_income`, `median_household_income`, `low_income_pct`, `tenure_owner_pct`, `period_of_construction`, `university_degree_pct`, `immigrant_pct`, `visible_minority_pct`, `english_knowledge_pct`, `top_mother_tongue`, `census_year`, `geom`. FK from `permits.neighbourhood_id` (integer).
  - `lead_views` — **PRESENT**, holds `(user_id, permit_num, revision_num, saved, saved_at, lead_type)`. Used by `flight-board/route.ts` to filter `saved=true AND lead_type='permit'`.

* **Cross-spec dependencies:**
  - Spec 95 (committed) — auth helper `getCurrentUserContext(request, pool)` returns `{ uid, trade_slug, ... }` or null (`src/lib/auth/get-user-context.ts:32`).
  - Migration 100 — established the `trigger_set_timestamp()` reusable trigger function. We reuse it (don't redefine).
  - Existing route patterns: `src/app/api/leads/feed/route.ts` and `src/app/api/leads/flight-board/route.ts` — both use `withApiEnvelope`, `ok(data)`, `internalError(cause, { route })`, `unauthorized()`. Inherit verbatim.

* **Key Files:**

  NEW — server:
  - `migrations/115_permits_updated_at.sql`
  - `src/app/api/leads/detail/[id]/route.ts`
  - `src/app/api/leads/detail/[id]/types.ts`
  - `src/app/api/leads/flight-board/detail/[id]/route.ts`
  - `src/app/api/leads/flight-board/detail/[id]/types.ts`
  - `src/lib/leads/parse-lead-id.ts` — shared id parser (rejects malformed; returns `{ kind: 'permit', permit_num, revision_num } | { kind: 'coa', application_number } | null`)
  - `src/lib/leads/lead-detail-query.ts` — composed SELECT for detail endpoint
  - `src/tests/leads-detail.infra.test.ts`
  - `src/tests/flight-board-detail.infra.test.ts`
  - `src/tests/permits-updated-at.logic.test.ts` — verifies trigger fires on UPDATE

  MODIFY:
  - `src/lib/db/schema.ts` — add `updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()` to `permits` table
  - `src/app/api/leads/flight-board/route.ts` — add `p.updated_at` to `FLIGHT_BOARD_SQL` SELECT, extend `FlightBoardRow` interface and the mapped output object with `updated_at: string`
  - `docs/specs/03-mobile/91_mobile_lead_feed.md` — append §4.3.1 documenting the `/api/leads/detail/:id` contract
  - `docs/specs/03-mobile/77_mobile_crm_flight_board.md` — append §3.3.1 documenting the `/api/leads/flight-board/detail/:id` contract + amend §3.2 to specify `updated_at` is now present in list responses

---

## API Contract Note (Cross-Domain Scenario B)

| Method | Path | Auth | Status codes | Response shape |
|--------|------|------|--------------|----------------|
| GET | `/api/leads/detail/:id` | Bearer/cookie | 200, 400 (bad id), 401, 404 (no permit), 500 | `{ data: LeadDetail, error: null, meta: null }` |
| GET | `/api/leads/flight-board/detail/:id` | Bearer/cookie | 200, 400 (bad id), 401, 404 (not on user's board), 500 | `{ data: FlightBoardDetail, error: null, meta: null }` |
| GET | `/api/leads/flight-board` (modified) | Bearer/cookie | unchanged | each item adds `updated_at: string (ISO)` |

**`LeadDetail` shape (defined in `src/app/api/leads/detail/[id]/types.ts`):**
```ts
export interface LeadDetail {
  lead_id: string;                       // `${permit_num}--${revision_num}` or `COA-${application_number}`
  lead_type: 'permit' | 'coa';
  permit_num: string | null;             // null for COA-only leads (rare)
  revision_num: string | null;
  address: string;                       // composed from street_num + street_name
  location: { lat: number; lng: number } | null;
  work_description: string | null;
  applicant: string | null;              // best-effort from permits.applicant or builders join (deferred — null for now)
  lifecycle_phase: string | null;
  lifecycle_stalled: boolean;
  target_window: 'bid' | 'work' | null;
  opportunity_score: number | null;
  competition_count: number;             // count(*) FROM lead_views WHERE permit_num=… AND revision_num=… AND saved=true
  predicted_start: string | null;
  p25_days: number | null;
  p75_days: number | null;
  cost: {
    estimated: number | null;
    tier: string | null;
    range_low: number | null;
    range_high: number | null;
    modeled_gfa_sqm: number | null;
  } | null;
  neighbourhood: {
    name: string | null;
    avg_household_income: number | null;
    median_household_income: number | null;
    period_of_construction: string | null;
  } | null;
  updated_at: string;                    // ISO timestamp from permits.updated_at
}
```

**`FlightBoardDetail` shape:** identical to a single `FlightBoardItem` from the list endpoint plus `updated_at: string`. Re-exported from the same `types.ts`.

**Client consumption (downstream — out of scope):**
- `mobile/app/(app)/[lead].tsx` — `useLeadDetail(id)` hook will call `GET /api/leads/detail/:id` on mount, fall back to `lead-feed` cache walk for warm-boot speed.
- `mobile/app/(app)/[flight-job].tsx` — `useFlightJob(id)` hook will call `GET /api/leads/flight-board/detail/:id` on mount; existing `useFlightBoard()` cache walk becomes the synchronous fast-path.
- `mobile/src/components/feed/FlightCard.tsx` — parent (`flight-board.tsx`) tracks `{ [permitId]: lastSeenUpdatedAt }` in MMKV; passes `hasUpdate={item.updated_at !== mmkvSeen[id]}`.

---

## Technical Implementation

### Migration 115 — `permits.updated_at`

`permits` is **237K+ rows**, classifies as the §3.1 zero-downtime case. Use the **add → backfill → constrain → trigger** sequence:

```sql
-- UP
-- Step 1: nullable add (no rewrite, instant on PG 11+)
ALTER TABLE permits ADD COLUMN updated_at TIMESTAMPTZ;

-- Step 2: backfill — coalesce to best-known recency signal
UPDATE permits SET updated_at = COALESCE(last_seen_at, first_seen_at, NOW())
WHERE updated_at IS NULL;

-- Step 3: constrain after backfill (no row scan needed, all rows now non-null)
ALTER TABLE permits ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE permits ALTER COLUMN updated_at SET NOT NULL;

-- Step 4: reuse trigger_set_timestamp() from migration 100
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON permits
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- DOWN
DROP TRIGGER IF EXISTS set_updated_at ON permits;
ALTER TABLE permits DROP COLUMN IF EXISTS updated_at;
```

The trigger means **the ingestion script and any other UPDATE path automatically gets fresh `updated_at` without code changes** — that's the point of the trigger pattern (Bug Prevention Strategy §5).

### `GET /api/leads/detail/[id]`

Composes a single SELECT joining permits + cost_estimates + neighbourhoods + a `lead_views` competition count subquery. Outline:

```ts
// route.ts (top-level structure — full impl in execution)
export const GET = withApiEnvelope(async function GET(request, { params }) {
  try {
    const ctx = await getCurrentUserContext(request, pool);
    if (!ctx) return unauthorized();

    const parsed = parseLeadId(params.id);
    if (!parsed) return badRequestInvalidId();
    if (parsed.kind === 'coa') return notImplemented('COA detail not yet supported');  // Phase 2

    const result = await pool.query<LeadDetailRow>(LEAD_DETAIL_SQL, [
      parsed.permit_num,
      parsed.revision_num,
      ctx.trade_slug,
    ]);
    if (result.rowCount === 0) return notFound();
    return ok(toLeadDetail(result.rows[0]));
  } catch (cause) {
    return internalError(cause, { route: 'GET /api/leads/detail/[id]' });
  }
});
```

The `LEAD_DETAIL_SQL` joins:
- `permits p` (base)
- `LEFT JOIN cost_estimates ce ON ce.permit_num = p.permit_num AND ce.revision_num = p.revision_num`
- `LEFT JOIN neighbourhoods n ON n.id = p.neighbourhood_id`
- `LEFT JOIN trade_forecasts tf ON tf.permit_num = p.permit_num AND tf.revision_num = p.revision_num AND tf.trade_slug = $3`
- `LEFT JOIN LATERAL (SELECT COUNT(*)::int AS c FROM lead_views WHERE permit_num = p.permit_num AND revision_num = p.revision_num AND saved = true) lv_count ON TRUE`

### `GET /api/leads/flight-board/detail/[id]`

Reuses `FLIGHT_BOARD_SQL` modified with a `WHERE` predicate for the specific `(permit_num, revision_num)`. Hits `lead_views` with `user_id = $1 AND saved = true AND permit_num = $2 AND revision_num = $3`. Returns 404 if the user does not have this permit saved (the natural filter, no extra logic). Includes `updated_at` from `p.updated_at`.

### Modified `flight-board/route.ts`

Two changes:
1. Add `p.updated_at::text AS updated_at` to the SELECT.
2. Extend the `FlightBoardRow` interface and the mapped output object with `updated_at: string`.

No client-side breakage: the mobile Zod schema (in `mobile/src/lib/schemas.ts`) currently doesn't enforce `updated_at`. Adding the field is additive — old clients ignore it, new clients use it. Confirmed Cross-Domain Scenario B safe.

---

## Standards Compliance

* **Try-Catch Boundary (§2.2):** Both new routes use `withApiEnvelope` + inner `try/catch` returning `internalError(cause, { route })`. No `err.message` ever returned to client.
* **Unhappy Path Tests (§2.1):** infra tests cover 401 (no auth), 400 (malformed id `"not-an-id"`, `"COA-"` empty), 404 (unknown permit, removed-from-board), 500 (forced pool throw — assert no `err.message` leak in body).
* **Pagination (§3.2):** N/A — both endpoints return a single row by primary key. The added competition `COUNT(*)` is bounded by `(permit_num, revision_num)` PK and existing `lead_views` indexes.
* **Parameterization (§4.2):** All queries use `pool.query<T>(SQL, [params])`. Lead id is parsed and decomposed into separate `$1, $2` parameters before any SQL composition. No string interpolation.
* **logError Mandate (§6.1):** `internalError()` already calls `logError` per existing pattern in feed/flight-board routes. New helpers also use `logError(tag, err, ctx)`.
* **Migration Safety (§3.1):** 237K+ row table — using the **add nullable → backfill → set default + NOT NULL → trigger** sequence to avoid table rewrite. Step 2 (`UPDATE ... WHERE updated_at IS NULL`) runs in batches if Cloud SQL latency requires (will validate during implementation).
* **Route Export Rule (§8.1):** `route.ts` files only export `GET`. All helpers live in `src/lib/leads/` and `src/app/api/leads/.../types.ts`.
* **Auth coverage (§4.1):** Both new endpoints sit under `src/app/api/leads/` which is already covered by the auth middleware path matcher (verify during Step 0).
* **Test pattern (§5.2):** `*.infra.test.ts` for routes, `*.logic.test.ts` for the trigger fire test.
* **§10 note:** Trigger reuses `trigger_set_timestamp()` from migration 100 — do not redefine the function in 115; only the trigger.

---

## Execution Plan

- [ ] **Step 0 — Pre-flight:** `node scripts/ai-env-check.mjs`. Confirm last migration = 114, no `permits.updated_at` column. Confirm `src/app/api/leads/detail/` and `src/app/api/leads/flight-board/detail/` do not exist. Verify `middleware.ts` already covers `/api/leads/*` (it should — same prefix as feed/flight-board).

- [ ] **Step 1 — Migration 115:** `migrations/115_permits_updated_at.sql`. UP block: add nullable column, backfill from `last_seen_at`/`first_seen_at`/NOW(), set default, set NOT NULL, create trigger reusing `trigger_set_timestamp()`. DOWN block: drop trigger, drop column.

- [ ] **Step 2 — Drizzle schema sync:** Add `updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()` to the `permits` table in `src/lib/db/schema.ts`. Run `npm run db:generate` to confirm types regenerate cleanly.

- [ ] **Step 3 — Run migration locally:** `npm run migrate` (or equivalent). Verify column + trigger exist via `psql` `\d permits`. Run a one-row UPDATE test to confirm the trigger fires.

- [ ] **Step 4 — Type contracts (Cross-Domain mandate):** Create `src/app/api/leads/detail/[id]/types.ts` and `src/app/api/leads/flight-board/detail/[id]/types.ts` with the exported interfaces. These are the **published contract** the Expo app will consume — define them BEFORE the route handler.

- [ ] **Step 5 — Shared helpers:**
  - `src/lib/leads/parse-lead-id.ts` — `parseLeadId(id: string): ParsedLeadId | null`. Accepts `${permit_num}--${revision_num}` (split on first `--`) or `COA-${application_number}`. Returns null for malformed (empty, no separator, etc.).
  - `src/lib/leads/lead-detail-query.ts` — exports `LEAD_DETAIL_SQL` const + `LeadDetailRow` raw row interface + `toLeadDetail(row): LeadDetail` mapper (decimal→number, null-safe, JSONB unwrap if any).

- [ ] **Step 6 — `GET /api/leads/detail/[id]/route.ts`:** Implement per the outline above. Uses `withApiEnvelope`, `getCurrentUserContext`, `parseLeadId`, `pool.query`, `ok`, `internalError`, `unauthorized`, plus new `notFound()` and `badRequestInvalidId()` helpers (extend `src/features/leads/api/error-mapping.ts` if absent).

- [ ] **Step 7 — `GET /api/leads/flight-board/detail/[id]/route.ts`:** SQL adds `WHERE lv.user_id = $1 AND lv.permit_num = $2 AND lv.revision_num = $3 AND lv.saved = true AND lv.lead_type = 'permit'`. Returns 404 when `rowCount === 0`. Includes `updated_at` from `p.updated_at::text`.

- [ ] **Step 8 — Modify list endpoint `flight-board/route.ts`:** Add `p.updated_at::text AS updated_at` to `FLIGHT_BOARD_SQL`; extend `FlightBoardRow`; add `updated_at: row.updated_at` to mapped output. Verify existing `flight-board.infra.test.ts` (if any) still passes.

- [ ] **Step 9 — Tests:**
  - `src/tests/permits-updated-at.logic.test.ts` — SPEC LINK header. Inserts a permit, snapshots `updated_at`, sleeps 100ms, runs `UPDATE permits SET work_description = 'x' WHERE …`, asserts `updated_at` advanced.
  - `src/tests/leads-detail.infra.test.ts` — SPEC LINK header. Cases: 200 (full join hydration), 401 (no ctx), 400 (malformed id), 404 (unknown permit), 500 (forced pool throw → no leak).
  - `src/tests/flight-board-detail.infra.test.ts` — SPEC LINK header. Cases: 200 (saved permit returns), 404 (permit exists but user hasn't saved), 401, 400, 500.

- [ ] **Step 10 — Spec docs:** Append API contracts to `91_mobile_lead_feed.md §4.3.1` and `77_mobile_crm_flight_board.md §3.3.1`. Amend `77 §3.2` "Amber Update Flash" with: "The list response includes `updated_at: string (ISO 8601)` per item; clients store the last-seen value per permit in MMKV and trigger the flash when the values diverge on a subsequent fetch."

- [ ] **Step 11 — Independent code review (WF6 gate, NOT adversarial per WF3):** Spawn `feature-dev:code-reviewer` agent with `isolation: "worktree"`. Inputs: relevant spec paths + 3 new + 3 modified files + one-sentence summary. Triage → fix FAIL items. Deferred → `docs/reports/review_followups.md`.

- [ ] **Step 12 — Test gate:**
  - `npm run typecheck`
  - `npx vitest run src/tests/permits-updated-at.logic.test.ts`
  - `npx vitest run src/tests/leads-detail.infra.test.ts`
  - `npx vitest run src/tests/flight-board-detail.infra.test.ts`
  - `npx vitest related src/app/api/leads/flight-board/route.ts --run` (catches regressions on the modified list endpoint)
  - `npm run lint -- --fix`
  - All must pass before commit.

- [ ] **Step 13 — Commit:** `feat(91_mobile_lead_feed,77_mobile_crm_flight_board): backend foundations — lead detail, flight-board detail, permits.updated_at`

---

## Out of Scope / Deferred

- **Mobile wiring** of the new endpoints — `useLeadDetail`, `useFlightJob`, `mmkv hasUpdate` tracking. This is its own WF3/WF1 task once the contracts are stable.
- **COA detail join** — `parseLeadId` recognises `COA-…` ids but the detail handler returns 501 for now; CoA detail is a separate spec scope.
- **Builder/applicant unmasking** in `LeadDetail.applicant` — currently null. Spec 91 §4.3 lists "builder/applicant entity (if unmasked)" as a future enhancement gated on a permits/builders join helper that doesn't exist yet.
- **Street View image** — client-side `expo-image` cached fetch, no backend involvement.

---

> **PLAN LOCKED. Do you authorize this WF3 plan? (y/n)**
> §10 note: trigger function `trigger_set_timestamp()` from migration 100 is reused, not redefined — migration 115 only adds the column + the new CREATE TRIGGER row.
> DO NOT generate code. DO NOT run commands. TERMINATE RESPONSE.
