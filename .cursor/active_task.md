# Active Task: WF1 — Lead Feed Phase 2-ii: GET /api/leads/feed Route
**Status:** Implementation
**Workflow:** WF1 — New Feature Genesis
**Rollback Anchor:** `359bc9f`

## Domain Mode
**Backend/Pipeline Mode** — one new Next.js API route handler + tests. No new migrations, no new lib functions, no UI. Per CLAUDE.md Backend Mode: §2 (try/catch), §4 (auth), §6 (logger). The route runs in the Node runtime (not edge) so it can use firebase-admin via `getCurrentUserContext` and the pg pool.

## Context
* **Goal:** Second of three sub-WFs in Phase 2. Ship the `GET /api/leads/feed` route — a thin handler that composes the Phase 1 lib functions (`getLeadFeed`) with the Phase 2-i foundation (`getCurrentUserContext`, `leadFeedQuerySchema`, envelope helpers, error mapping, request logging) and the Backend Phase 0 rate limiter (`withRateLimit`). After this WF lands, the lead feed is end-to-end functional from URL → JSON response with the full status code matrix per spec 70.
* **Target Specs (already hardened):**
  - `docs/specs/product/future/70_lead_feed.md` §API Endpoints (full spec for `/api/leads/feed`)
  - `docs/specs/product/future/75_lead_feed_implementation_guide.md` §11 Phase 2
  - `docs/specs/00_engineering_standards.md` §2 (try/catch), §4 (auth), §4.4 (response envelope), §6 (logger)
* **Key Files:** new — `src/app/api/leads/feed/route.ts`, `src/tests/api-leads-feed.infra.test.ts`. No modifications to existing files.

## Technical Implementation

### File 1 — `src/app/api/leads/feed/route.ts`

Next.js App Router GET handler. ~90 lines. Composes the Phase 2-i + Phase 1 + Backend Phase 0 building blocks with NO new logic of its own — every behavior is delegated.

```ts
// 🔗 SPEC LINK: docs/specs/product/future/70_lead_feed.md §API Endpoints
//
// GET /api/leads/feed — personalized lead feed for the authenticated user.
// Returns permits + builders interleaved by relevance score, paginated via
// the unified cursor from spec 70. Thin route handler — every behavior
// delegates to a Phase 1 lib function or Phase 2-i foundation helper.
//
// Status code matrix (spec 70 §API Endpoints):
//   200 — success
//   400 — Zod validation failure
//   401 — no session, no profile, or auth helper failure
//   403 — trade_slug parameter doesn't match user's profile trade
//   429 — rate limit exceeded (30 req/min per user)
//   500 — unexpected error (logged via logError)

import type { NextRequest } from 'next/server';
import { pool } from '@/lib/db/client';
import { getCurrentUserContext } from '@/lib/auth/get-user-context';
import { withRateLimit } from '@/lib/auth/rate-limit';
import { getLeadFeed } from '@/features/leads/lib/get-lead-feed';
import { leadFeedQuerySchema } from '@/features/leads/api/schemas';
import { ok } from '@/features/leads/api/envelope';
import {
  unauthorized,
  forbiddenTradeMismatch,
  rateLimited,
  badRequestZod,
  internalError,
} from '@/features/leads/api/error-mapping';
import { logRequestComplete } from '@/features/leads/api/request-logging';

const RATE_LIMIT_PER_MIN = 30;
const RATE_LIMIT_WINDOW_SEC = 60;

export async function GET(request: NextRequest) {
  const start = Date.now();
  try {
    // 1. Auth — get the Firebase UID + user's trade from user_profiles
    const ctx = await getCurrentUserContext(request, pool);
    if (!ctx) return unauthorized();

    // 2. Validate query params via Zod (returns 400 with field-level details on failure)
    const parsed = leadFeedQuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    if (!parsed.success) return badRequestZod(parsed.error);
    const params = parsed.data;

    // 3. Trade slug authorization — server compares requested trade to user's profile
    if (params.trade_slug !== ctx.trade_slug) {
      return forbiddenTradeMismatch(params.trade_slug, ctx.trade_slug);
    }

    // 4. Rate limit — 30 req/min per user
    const rateLimit = await withRateLimit(request, {
      key: `leads-feed:${ctx.uid}`,
      limit: RATE_LIMIT_PER_MIN,
      windowSec: RATE_LIMIT_WINDOW_SEC,
    });
    if (!rateLimit.allowed) return rateLimited(rateLimit.remaining);

    // 5. Build the cursor from the validated optional triple
    const cursor =
      params.cursor_score !== undefined &&
      params.cursor_lead_type !== undefined &&
      params.cursor_lead_id !== undefined
        ? {
            score: params.cursor_score,
            lead_type: params.cursor_lead_type,
            lead_id: params.cursor_lead_id,
          }
        : undefined;

    // 6. Call the Phase 1 lib function — never throws
    const result = await getLeadFeed(
      {
        user_id: ctx.uid,
        trade_slug: params.trade_slug,
        lat: params.lat,
        lng: params.lng,
        radius_km: params.radius_km,
        limit: params.limit,
        ...(cursor !== undefined && { cursor }),
      },
      pool,
    );

    // 7. Structured logging
    logRequestComplete(
      '[api/leads/feed]',
      {
        user_id: ctx.uid,
        trade_slug: params.trade_slug,
        lat: params.lat,
        lng: params.lng,
        radius_km: result.meta.radius_km,
        result_count: result.meta.count,
      },
      start,
    );

    // 8. Return the envelope
    return ok(result.data, result.meta);
  } catch (cause) {
    // Defensive — none of the above should throw because all helpers are
    // documented as never-throws, but if a regression slips through this
    // catches it and surfaces a 500 with the cause logged.
    return internalError(cause, { route: 'GET /api/leads/feed' });
  }
}
```

**Why this is correct (every line maps to a spec requirement):**
- Step 1 → spec 70 §3 Auth Matrix "Authenticated only"
- Step 2 → spec 70 §API Endpoints "400 Bad Request — Zod validation failure"
- Step 3 → spec 70 §API Endpoints "Trade slug authorization: server compares trade_slug against user's profile trade — mismatch returns 403"
- Step 4 → spec 70 §API Endpoints "Rate limiting: 30 requests per 60 seconds per user_id"
- Step 5 → spec 70 §API Endpoints "Pagination (unified cursor): tuple (relevance_score, lead_type, lead_id)"
- Step 6 → spec 70 §API Endpoints "Logic: All scoring happens in PostgreSQL"
- Step 7 → spec 70 §API Endpoints "Observability: Structured log per request"
- Step 8 → spec 70 §API Endpoints + §4.4 "Response envelope: { data, error: null, meta }"

**Composition uses ONLY existing helpers:**
- `pool` from Backend (existing)
- `getCurrentUserContext` from Phase 2-i
- `withRateLimit` from Backend Phase 0
- `getLeadFeed` from Phase 1b-iii
- `leadFeedQuerySchema` from Phase 2-i
- `ok` / `unauthorized` / `forbiddenTradeMismatch` / `rateLimited` / `badRequestZod` / `internalError` / `logRequestComplete` from Phase 2-i

The route handler adds ZERO new logic. If anything goes wrong it can ONLY be in the composition (parameter ordering, missing checks, etc.) — not in business logic.

### File 2 — `src/tests/api-leads-feed.infra.test.ts` (~22-28 tests)

Mocks the entire dependency surface via `vi.mock` so the test exercises the route handler's composition logic without spinning up a real DB or Firebase. The test pattern matches `src/tests/auth-get-user.logic.test.ts` (the most similar file in the codebase).

**Test scenarios (per spec 70 status code matrix):**

**200 OK happy path (3 tests):**
- Valid auth + valid params + matching trade + within rate limit → 200 with mapped feed result, envelope shape `{data, error: null, meta}`
- 200 with cursor params → cursor passed to getLeadFeed
- 200 with empty result → returns empty data array, count 0, next_cursor null

**401 Unauthorized (3 tests):**
- `getCurrentUserContext` returns null → 401 with code `UNAUTHORIZED`, body shape `{data: null, error: {code, message}, meta: null}`
- 401 path does NOT call getLeadFeed
- 401 path does NOT call withRateLimit

**400 Validation failure (5 tests):**
- Invalid lat (out of range) → 400 with code `VALIDATION_FAILED`, field-level details
- Missing trade_slug → 400
- Invalid cursor (partial) → 400
- 400 path does NOT call getLeadFeed
- 400 happens AFTER auth check (i.e. unauthenticated invalid request still returns 401, not 400)

**403 Forbidden (3 tests):**
- Authenticated user requests trade != their profile → 403 `FORBIDDEN_TRADE_MISMATCH`, message includes both requested and actual
- 403 path does NOT call getLeadFeed
- 403 happens AFTER auth + Zod parse

**429 Rate limited (3 tests):**
- `withRateLimit` returns `{allowed: false}` → 429 `RATE_LIMITED` with `remaining` detail and `Retry-After` header
- 429 path does NOT call getLeadFeed
- Rate limit key uses `leads-feed:{uid}` format (so the leads endpoint has its own bucket separate from other future leads endpoints)

**500 Internal error (3 tests):**
- `getLeadFeed` somehow throws (regression — it's documented never-throws but defense in depth) → 500 `INTERNAL_ERROR` with logError called
- `getCurrentUserContext` somehow throws → 500
- `withRateLimit` somehow throws → 500

**Composition correctness (3 tests):**
- Order of operations: auth → parse → trade check → rate limit → lib call → ok
- `getLeadFeed` receives `user_id: ctx.uid` (from auth context, NOT from query params)
- `getLeadFeed` receives the validated params (from Zod, after coercion — i.e. lat is a number, not a string)
- `logRequestComplete` called with the correct context shape

**Mocking strategy:**
```ts
vi.mock('@/lib/auth/get-user-context');
vi.mock('@/lib/auth/rate-limit');
vi.mock('@/features/leads/lib/get-lead-feed');
vi.mock('@/lib/db/client', () => ({ pool: {} }));

// In each test:
vi.mocked(getCurrentUserContext).mockResolvedValueOnce({ uid: 'u1', trade_slug: 'plumbing', display_name: null });
vi.mocked(withRateLimit).mockResolvedValueOnce({ allowed: true, remaining: 29 });
vi.mocked(getLeadFeed).mockResolvedValueOnce({ data: [...], meta: {...} });
```

Build a `NextRequest` via `new NextRequest('http://localhost/api/leads/feed?lat=43.65&lng=-79.38&trade_slug=plumbing')` and pass it directly to `GET`. Read the response via `await res.json()`.

### Database Impact
**NO** — no migrations. Reads tables created by Phase 1a + Phase 2-i.

## Standards Compliance (§10)

### DB
- ⬜ N/A — no migrations
- ✅ Uses the shared pool from `src/lib/db/client.ts` — never `new Pool()`
- ✅ All DB access via the Phase 1 lib functions (`getLeadFeed`) — route doesn't issue raw queries

### API
- ✅ Spec 70 status code matrix fully covered (200/400/401/403/429/500)
- ✅ Spec 70 + §4.4 response envelope `{data, error, meta}` via `ok()`/`err()`
- ✅ Zod returns 400 (NOT 500) via `badRequestZod`
- ✅ Trade slug authorization per spec 70 (server-side comparison, NOT client-trusted)
- ✅ Rate limiting per spec 70 (30 req/min per user via `withRateLimit`)
- ✅ Authenticated by middleware (route-guard added `/api/leads` to AUTHENTICATED_API_ROUTES in Phase 2-i)
- ✅ Auth check happens at the route level too (defense in depth)

### UI
- ⬜ N/A — backend route only

### Shared Logic (§7)
- ✅ Composes Phase 1b-iii `getLeadFeed`, Phase 2-i schemas + helpers, Backend Phase 0 `withRateLimit` + `getUserIdFromSession` (via `getCurrentUserContext`)
- ✅ NO duplication of business logic — every line delegates
- ✅ NO dual code path
- ✅ Imports `pool` from the shared client

### Pipeline (§9)
- ⬜ N/A — no scripts

### Try/Catch (§2) + logError mandate
- ✅ Top-level try/catch around the entire handler
- ✅ Catch calls `internalError(cause, context)` which logs via `logError` and returns the generic 500 envelope
- ✅ Never throws to the Next.js framework — Next would otherwise return its default 500 page which doesn't match our envelope shape

### Unhappy Path Tests
- ✅ Each spec 70 status code (401/400/403/429/500) has at least one test
- ✅ Order-of-operations tests verify auth happens BEFORE Zod parse (so unauthenticated invalid requests return 401, not 400)
- ✅ Rate limit bypass test verifies the lib function isn't called when rate limit denies
- ✅ Defensive 500 path tested (lib functions throwing despite never-throws contract)

### Mobile-First
- ⬜ N/A — backend route

## Review Plan (per `feedback_review_protocol.md`, this is WF1)
- ✅ Independent review in worktree after commit
- ✅ Gemini + DeepSeek on **both files** (route + test) — **4 adversarial reviews + 1 independent ≈ $0.80**
- ✅ Triage via Real / Defensible / Out-of-scope tree
- ✅ Append deferred items to `docs/reports/review_followups.md`
- ✅ Post full triage table in the response

## What's IN Scope
| Deliverable | Why |
|---|---|
| `GET /api/leads/feed` route handler | Spec 70 §API Endpoints — primary entry point for the lead feed |
| Route handler infra tests | Cover full status code matrix + composition correctness |

## What's OUT of Scope
- `POST /api/leads/view` route — Phase 2-iii
- Response envelope refinement (e.g. `withErrorBoundary` wrapper) — deferred from Phase 2-i followups
- Real database integration tests — blocked by pre-existing migration 030 failure
- API client SDK — UI WF (Phase 4+)
- Caching headers (Cache-Control, ETag) — V2 perf optimization

## Execution Plan

```
- [ ] Contract Definition: GET /api/leads/feed signature locked.
      Returns ApiSuccess<LeadFeedItem[], LeadFeedMeta> on 200, ApiErrorBody
      on 4xx/5xx. All param and response shapes already defined in Phase
      1b-iii types + Phase 2-i schemas.

- [ ] Spec & Registry Sync: Spec 70 already hardened. Run
      `npm run system-map` AFTER commit.

- [ ] Schema Evolution: N/A — no migrations.

- [ ] Test Scaffolding: Create src/tests/api-leads-feed.infra.test.ts.
      Run `npx vitest run src/tests/api-leads-feed.infra.test.ts`.
      MUST fail (Red Light).

- [ ] Red Light: Confirmed.

- [ ] Implementation:
      Step 1 — Create src/app/api/leads/feed/route.ts
      Step 2 — Run the test file iteratively to green
      Step 3 — `npm run typecheck` clean
      Step 4 — `npm run lint -- --fix` clean
      Step 5 — `npm run test` full suite (2754 + ~25 ≈ 2779+)

- [ ] Auth Boundary & Secrets:
      - Route is server-only (Node runtime, uses pool + firebase-admin)
      - getCurrentUserContext + withRateLimit are the only auth/security
        helpers; both already shipped and tested
      - No new secrets
      - Middleware route-guard already authenticates /api/leads/* (added
        in Phase 2-i)

- [ ] Green Light: typecheck / lint / test all clean.

- [ ] Reviews:
      - Commit the implementation
      - Run Gemini + DeepSeek on both files in parallel (4 jobs)
      - Run independent review agent in worktree
      - Triage, fix, append followups, post triage table

- [ ] WF6 close: 5-point sweep + final state summary
```

## Risk Notes

1. **`withRateLimit` returns might confuse the route's flow.** The function returns `{allowed: boolean, remaining: number}`. The route checks `!rateLimit.allowed`. If the helper ever changes its return shape, the route silently allows everything. Mitigation: tests verify both true and false branches; type system catches structural changes.

2. **`Object.fromEntries(request.nextUrl.searchParams)`** loses repeated query params (e.g. `?foo=1&foo=2` becomes `{foo: '2'}`). Spec 70 doesn't have any repeated params, so this is fine, but if a future param needs array semantics it'll need a different parsing strategy.

3. **Cursor build is conditional spread to satisfy `exactOptionalPropertyTypes`.** The `LeadFeedInput` type from Phase 1b-iii has `cursor?: LeadFeedCursor` (optional). Passing `cursor: undefined` would fail strict-mode typecheck. Hence the `...(cursor !== undefined && { cursor })` spread.

4. **Route runs in Node runtime (not edge)** because it uses firebase-admin via `getCurrentUserContext`. Next.js infers this from the imports. No `export const runtime = 'edge'` directive — keeping it Node-only is correct.

5. **Trade slug check happens AFTER Zod parse but BEFORE rate limit.** Order matters:
   - Auth → Zod (cheap) → Trade check (cheap) → Rate limit (Upstash call) → DB query (expensive)
   - Each layer fails fast before incurring the cost of the next layer.
   - Tests verify this ordering.

6. **`getLeadFeed` is documented as never-throws.** The defensive `try/catch` around the entire handler is belt-and-suspenders — if a future regression makes any helper throw, the route still returns a clean 500 envelope instead of leaking a Next.js stack page.

7. **Local DB still broken at migration 030.** Tests use mocks; route correctness against a real DB will only be verified in CI. Same constraint as Phase 1.

8. **Independent review may flag missing 404.** Spec 70's status matrix doesn't include 404 for the feed endpoint (it always returns 200 with empty data when no leads match). If the reviewer thinks 404 is needed, the answer is "spec 70 explicitly returns 200 with empty array".
