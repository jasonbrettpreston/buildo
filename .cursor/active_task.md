# Active Task: WF1 — Lead Feed Phase 2-i: API Foundation + User Profile
**Status:** Implementation
**Workflow:** WF1 — New Feature Genesis
**Rollback Anchor:** `43f366a`

## Domain Mode
**Cross-Domain** — one new migration (Backend), new server-only TS helpers, route-guard.ts edit (the only Frontend-Mode-relevant touch since middleware runs at the edge runtime). Per CLAUDE.md, both Backend Mode and Frontend Mode rules apply to their respective files.

## Context
* **Goal:** First of three sub-WFs splitting Phase 2 along Phase 1's pattern (foundation → consumers). After this WF the cross-cutting plumbing every Phase 2 leads route needs is shipped: a `user_profiles` table for trade-slug authorization, a `getCurrentUserContext` helper combining Firebase auth + DB profile lookup, shared Zod schemas, response envelope helpers, error → HTTP-status mapping, and structured request logging. Phase 2-ii (`/api/leads/feed`) and Phase 2-iii (`/api/leads/view`) will be thin wrappers on top.
* **Critical gap from recon:** there is currently NO user_profiles table, NO Firebase custom claims wiring, NO way to map a Firebase UID to a trade slug. Spec 70 §API Endpoints explicitly requires "The server compares `trade_slug` against the authenticated user's profile trade. Mismatch returns 403 Forbidden." Phase 2-i closes this gap.
* **Target Specs:**
  - `docs/specs/product/future/70_lead_feed.md` §API Endpoints
  - `docs/specs/product/future/75_lead_feed_implementation_guide.md` §11 Phase 2
  - `docs/specs/00_engineering_standards.md` §2 / §4 / §4.4 / §6
* **Key Files:** new — `migrations/075_user_profiles.sql`, `src/lib/auth/get-user-context.ts`, `src/features/leads/api/schemas.ts`, `src/features/leads/api/envelope.ts`, `src/features/leads/api/error-mapping.ts`, `src/features/leads/api/request-logging.ts`, 4 test files. Modified — `src/lib/auth/route-guard.ts`, `src/lib/permits/types.ts`, `src/tests/factories.ts`.

## Technical Implementation

### Migration 075 — `user_profiles` table

```sql
-- UP
CREATE TABLE user_profiles (
  user_id      VARCHAR(100) PRIMARY KEY,           -- Firebase UID
  trade_slug   VARCHAR(50)  NOT NULL,
  display_name VARCHAR(200),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT user_profiles_trade_slug_not_empty CHECK (length(trade_slug) > 0)
);
CREATE INDEX idx_user_profiles_trade_slug ON user_profiles (trade_slug);

-- DOWN
-- ALLOW-DESTRUCTIVE
-- DROP INDEX IF EXISTS idx_user_profiles_trade_slug;
-- DROP TABLE IF EXISTS user_profiles;
```

Notes:
- `user_id` is a Firebase UID, not a FK — same convention as `lead_views.user_id` in migration 070.
- `trade_slug` is NOT a FK to a `trades` table per the existing codebase pattern (Phase 1a triage). The `length > 0` CHECK prevents empty-string drift.
- `display_name` is optional metadata so the future onboarding UI can populate it without another migration.
- No `email` column — Firebase owns identity.

### File 1 — `src/lib/auth/get-user-context.ts`

Combines `getUserIdFromSession` (Backend Phase 0) + DB profile lookup. Returns `{uid, trade_slug, display_name}` or null on ANY failure (no session, invalid cookie, JWT verify fail, no profile row, DB error). Phase 2 routes treat all four cases as 401.

```ts
export interface UserContext { uid: string; trade_slug: string; display_name: string | null; }
export async function getCurrentUserContext(request: NextRequest, pool: Pool): Promise<UserContext | null>;
```

Wraps the DB query in try/catch → `logError` → null. Never throws.

### File 2 — `src/features/leads/api/schemas.ts`

Shared Zod schemas. **Returns 400** with field-level error messages (NOT 500) per spec 70.

- `leadFeedQuerySchema`: lat (-90..90), lng (-180..180), trade_slug (1-50), radius_km (0..MAX_RADIUS_KM, default DEFAULT_RADIUS_KM), limit (1..MAX_FEED_LIMIT, default DEFAULT_FEED_LIMIT), cursor_score/lead_type/lead_id (all-or-nothing via `.refine`), `z.coerce.number` for URL query string handling
- `leadViewBodySchema`: trade_slug + action enum + `z.discriminatedUnion('lead_type', [permit branch, builder branch])` enforcing XOR

Imports `MAX_FEED_LIMIT`/`DEFAULT_FEED_LIMIT` from `get-lead-feed.ts` and `MAX_RADIUS_KM`/`DEFAULT_RADIUS_KM` from `distance.ts` — single source of truth, no constant drift.

### File 3 — `src/features/leads/api/envelope.ts`

Per spec 70 + §4.4 response envelope `{data, error, meta}`:

```ts
export function ok<T, M = null>(data: T, meta?: M, status?: number): NextResponse;
export function err(code: string, message: string, status: number, details?: unknown): NextResponse;
```

### File 4 — `src/features/leads/api/error-mapping.ts`

Spec 70 status code matrix → NextResponse helpers:
- `unauthorized()` → 401 `UNAUTHORIZED`
- `forbiddenTradeMismatch(requested, actual)` → 403 `FORBIDDEN_TRADE_MISMATCH` with mismatch detail
- `rateLimited(remaining)` → 429 `RATE_LIMITED` with remaining
- `badRequestZod(zodError)` → 400 `VALIDATION_FAILED` with `zodError.flatten()` field-level details
- `internalError()` → 500 `INTERNAL_ERROR` (generic, no leaked stack)

### File 5 — `src/features/leads/api/request-logging.ts`

`logRequestComplete(tag, context, startMs)` — wraps `logInfo` with consistent shape per spec 70 observability requirement (`{user_id, trade_slug, lat, lng, radius_km, result_count, duration_ms}`). Tiny but enforces shape consistency between Phase 2-ii and 2-iii.

### Type addition — `src/lib/permits/types.ts`

```ts
export interface UserProfile {
  user_id: string;
  trade_slug: string;
  display_name: string | null;
  created_at: Date;
  updated_at: Date;
}
```

### route-guard.ts update

Add `/api/leads/` to the existing authenticated-API mechanism (recon will confirm exact shape; current file uses `PUBLIC_PREFIXES` for public-by-default). The fix is to ensure `/api/leads/feed` and `/api/leads/view` get classified as `'authenticated'` so middleware enforces the cookie shape pre-check before the handler runs `getCurrentUserContext`. Defense in depth.

### Database Impact
**YES.** One new migration on a brand-new empty table. Zero impact on existing tables. No backfill — table starts empty, populated by future onboarding flow.

### Tests

**File 6 — `src/tests/user-profiles-schema.infra.test.ts`** (6-8 tests) — file-shape regex assertions on migration 075

**File 7 — `src/tests/get-user-context.logic.test.ts`** (10-12 tests):
- No session → null
- Session valid + profile row → returns context
- Session valid + no profile row → null
- Session valid + DB throws → null + logError
- display_name null handling
- Parameterized query verification

**File 8 — `src/tests/api-schemas.logic.test.ts`** (15-20 tests):
- leadFeedQuerySchema: lat/lng range bounds, radius/limit clamps, defaults, cursor partial/full, coerce from string, empty trade_slug
- leadViewBodySchema: permit/builder happy paths, XOR violations, missing fields, action enum

**File 9 — `src/tests/api-envelope.logic.test.ts`** (8-10 tests):
- ok/err shapes, custom status, details handling, all error helpers (unauthorized/forbiddenTradeMismatch/rateLimited/badRequestZod/internalError)

## Standards Compliance (§10)

### DB
- ✅ Migration 075 with UP + DOWN blocks
- ✅ ALLOW-DESTRUCTIVE marker on commented DOWN
- ⬜ N/A CONCURRENTLY — single-column index on a brand-new empty table
- ✅ CHECK constraint on trade_slug non-emptiness
- ✅ Pool injected as parameter; no `new Pool()`
- ✅ Parameterized query in `getCurrentUserContext`
- ✅ Migration safety validator gates the commit

### API
- ✅ Spec 70 status code matrix codified in `error-mapping.ts`
- ✅ Spec 70 + §4.4 response envelope codified in `envelope.ts`
- ✅ Zod returns 400 (not 500) via `badRequestZod`
- ✅ XOR enforced via Zod `discriminatedUnion`
- ✅ Foundation files don't ship route handlers themselves — Phase 2-ii/2-iii do
- ✅ route-guard.ts updated to authenticate `/api/leads/*`

### UI
- ⬜ N/A — backend foundation only

### Shared Logic (§7)
- ✅ Imports `MAX_FEED_LIMIT`/`DEFAULT_FEED_LIMIT` from `get-lead-feed.ts` (single source of truth)
- ✅ Imports `MAX_RADIUS_KM`/`DEFAULT_RADIUS_KM` from `distance.ts` (single source of truth)
- ✅ NO dual code path
- ✅ Composes `getUserIdFromSession` from Backend Phase 0 — no duplication

### Pipeline (§9)
- ⬜ N/A — no scripts

### Try/Catch (§2) + logError mandate
- ✅ `getCurrentUserContext` wraps DB call, returns null on error, logs via `logError`
- ✅ Envelope/error-mapping helpers are pure — no throws
- ✅ Zod schemas throw `ZodError` by design — caught + mapped via `badRequestZod`

### Unhappy Path Tests
- ✅ Pool throws → null + logError
- ✅ Empty profile result → null
- ✅ Each Zod boundary
- ✅ XOR violations
- ✅ Each error helper produces correct shape

### Mobile-First
- ⬜ N/A — backend-only

## Review Plan (per `feedback_review_protocol.md`, this is WF1)
- ✅ Independent review in worktree after commit
- ✅ Gemini + DeepSeek on **all 10 files** (1 migration + 5 source + 4 test) = **20 adversarial reviews + 1 independent ≈ $4.00**
- ✅ Triage via Real / Defensible / Out-of-scope tree
- ✅ Append deferred items to `docs/reports/review_followups.md`
- ✅ Post full triage table in the response

## What's IN Scope
| Deliverable | Why |
|---|---|
| Migration 075 user_profiles | Spec 70 trade_slug authorization requires server-side profile lookup |
| `getCurrentUserContext` helper | Single source of truth for "who is calling and what trade are they?" |
| Shared Zod schemas | Both routes validate input; one definition prevents drift |
| Response envelope helpers | Spec 70 + §4.4 envelope codified once |
| Error → HTTP mapping | Spec 70 status code matrix codified once |
| Request logging helper | Spec 70 observability shape codified once |
| route-guard.ts update | Add `/api/leads/*` to authenticated paths |
| `UserProfile` type | Schema row shape exposed to consumers |

## What's OUT of Scope
- `/api/leads/feed` route handler — Phase 2-ii
- `/api/leads/view` route handler — Phase 2-iii
- User profile creation/onboarding flow — separate WF (UI-driven)
- Email/notification fields on user_profiles — future expansion
- Firebase custom claims as a faster trade lookup — V2 optimization
- Firebase Admin reconciliation script for orphaned profile rows — separate WF

## Execution Plan

```
- [ ] Contract Definition: getCurrentUserContext + envelope/error helpers
      + Zod schemas signatures locked. No Phase 2-ii/iii route handlers
      in this WF.

- [ ] Spec & Registry Sync: Specs 70/75 hardened. Run `npm run system-map`
      AFTER commit.

- [ ] Schema Evolution: Migration 075 written, validate-migration.js
      passes, factories updated, `npm run db:generate` deferred (local
      DB still broken at migration 030).

- [ ] Test Scaffolding: 4 test files, run vitest, MUST fail (Red Light).

- [ ] Red Light: Confirmed.

- [ ] Implementation:
      Step 1 — migrations/075_user_profiles.sql + validator
      Step 2 — UserProfile type + factory
      Step 3 — get-user-context.ts
      Step 4 — envelope.ts
      Step 5 — error-mapping.ts
      Step 6 — schemas.ts
      Step 7 — request-logging.ts
      Step 8 — route-guard.ts update
      Step 9 — Iterate tests to green
      Step 10 — typecheck / lint / full test (2699 + ~40 ≈ 2740+)

- [ ] Auth Boundary & Secrets:
      - getCurrentUserContext is server-only (NextRequest + Pool)
      - Never imported from 'use client'
      - No new secrets
      - Migration 075 has no PII beyond Firebase UID (already in lead_views)
      - route-guard.ts update tightens, not loosens, security

- [ ] Green Light: typecheck / lint / test all clean.

- [ ] Reviews: 10 files × 2 adversarial + 1 independent worktree.
      Triage, fix, post table.

- [ ] WF6 close: 5-point sweep + final state summary
```

## Risk Notes

1. **Local DB still broken at migration 030.** Migration 075 won't apply locally; validator + file-shape tests cover structural correctness. Same constraint as Phase 1.

2. **First-time user with no profile row → 401.** Onboarding flow must populate the row before they can use the leads API. Documented contract; UI WF will handle.

3. **Zod discriminated union with `.and()` for lead_view body.** Inference can be subtle. Tests verify shape parsing; if Phase 2-iii hits awkward narrowing, that sub-WF can refactor.

4. **route-guard.ts edit must compile in edge runtime.** Mitigation: only add string array entries, no new imports, no runtime logic beyond what's already there. Run middleware tests after the edit.

5. **`user_profiles` lacks FK to a `users` table because there isn't one.** Same convention as `lead_views.user_id`. Orphan reconciliation deferred to a separate WF + tracked in followups.

6. **Migration 075 numbering.** Sequential, documented. Solo project — no collision risk.
