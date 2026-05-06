# Spec 34 — Web Admin Testing Protocol

**Status:** ACTIVE
**Cross-references:** Spec 33 (Web Admin Engineering Protocol), Spec 35 (Web Admin State Architecture), Spec 30 (App Health Dashboard), Spec 76 (Lead-Feed Tooling), Spec 86 (Control Panel)

**Numbering note:** Spec 34 in `docs/specs/02-web-admin/` parallels Spec 98 in `docs/specs/03-mobile/` (mobile testing protocol). The 98 slot is taken by mobile; web-admin uses 34 to disambiguate.

## 1. Goal & Scope

**Goal:** establish a reproducible testing bar for the Buildo admin web app at `/admin/*` so contributors can verify admin features end-to-end (Playwright), assert route handler contracts at the boundary (Vitest infra tests), and pin pure logic against regressions (Vitest logic tests) — without each contributor re-deriving testing conventions.

**Scope:** this spec governs `src/app/admin/**`, `src/app/api/admin/**`, `src/components/admin/**`, and the corresponding test surface in `src/tests/**`. The mobile testing protocol (`docs/specs/03-mobile/98_mobile_testing_protocol.md`) is the authority for `mobile/__tests__/**` and `mobile/maestro/**` — different platforms, different toolchains.

## 2. Local Environment Setup

### 2.1 Prerequisites
- **Node.js:** 22 LTS (matches the repo `.nvmrc`).
- **Postgres:** 16 with PostGIS 3.4 (testcontainer convention from `src/tests/db/setup-testcontainer.ts`).
- **Docker Desktop:** required for testcontainer-backed `*.db.test.ts` integration tests when `BUILDO_TEST_DB=1` is set.
- **Playwright browsers:** `npx playwright install --with-deps` (CI installs via the workflow).

### 2.2 Boot Sequence (running tests locally)

**Logic + infra tests (no DB needed):**
```bash
npm run test                    # full Vitest suite
npx vitest run src/tests/admin-app-health.logic.test.ts   # single file
```

**DB integration tests (`*.db.test.ts`) — Docker required:**
```bash
# Option A — testcontainer (slower; spins up postgres each run):
BUILDO_TEST_DB=1 npm run test

# Option B — pre-running postgres + DATABASE_URL in env (faster; CI uses this):
docker run -d --name buildo-test-pg -p 5432:5432 -e POSTGRES_PASSWORD=test postgres:16-3.4
DATABASE_URL=postgresql://postgres:test@localhost:5432/buildo npm run test
```

`*.db.test.ts` files use `describe.skipIf(!dbAvailable())` per the `setup-testcontainer.ts` convention so the default `npm run test` doesn't fail when Docker isn't running.

**Playwright E2E tests:**
```bash
npm run dev                     # in one terminal — starts Next.js dev server
npx playwright test             # in another — runs the suite
npx playwright test --ui        # opens Playwright UI mode for debugging
```

## 3. End-to-End (E2E) Testing Strategy

**Tool:** Playwright (NOT Maestro — that's mobile-only per Spec 98).
**Location:** `tests/e2e/` (new directory; mirrors the existing `mobile/maestro/` pattern but for web).

Playwright validates critical admin user journeys from the perspective of a black-box operator. Tests interact with the rendered UI via accessibility tree (preferred) and CSS selectors (fallback). Per Spec 33 §10 testing mandate, every major admin route MUST have at least a smoke flow.

### 3.1 Admin-Session Login Fixture

Every E2E flow assumes an authenticated admin. The login fixture lives at `tests/e2e/fixtures/admin-session.ts` and:
- Mocks the Firebase admin claim verification by setting a deterministic `__session` cookie.
- Sets the `X-Admin-Key` header on requests where the cookie path is impractical.
- Resets between tests so flows don't pollute each other.

**Test admin credentials:** never store production admin tokens in tests. Use a dev-only fixture user provisioned by `scripts/seed-admin-test.ts` (TBD when first E2E flow lands).

### 3.2 Required Test Suites (CI-Blocking)

Every major admin route MUST have an E2E flow. The list below is the **launch-blocking minimum** — additions per route.

| Flow | Spec | Asserts |
|---|---|---|
| `tests/e2e/admin-shell.spec.ts` | Spec 26 §3.1 | `/admin` loads, admin auth gate redirects non-admins to `/sign-in`, command palette `cmd+k` opens. |
| `tests/e2e/data-quality.spec.ts` | Spec 26 §3.2 | `/admin/data-quality` renders, polling fires after mount, "Update Now" triggers a pipeline run. |
| `tests/e2e/market-metrics.spec.ts` | Spec 26 §3.3 | `/admin/market-metrics` renders all 6 KPI sections, period toggle (MTD / YTD) works. |
| `tests/e2e/control-panel.spec.ts` | Spec 86 | `/admin/control-panel` renders the 4 grids, draft state activates on edit, save triggers diff modal, save confirmation calls the resync endpoint. |
| `tests/e2e/lead-feed-test-feed.spec.ts` | Spec 76 §3.2–§3.3 | `/admin/lead-feed` renders the Test Feed Tool, form submission returns scored results + debug overlay. |
| `tests/e2e/lead-feed-flight-center.spec.ts` | Spec 76 §3.4 (PENDING implementation) | Admin saves a permit, Flight Center renders the saved board, tap-card opens the Flight Job Detail Inspector drawer. **Blocked until Cycle 4 implementation lands.** |
| `tests/e2e/lead-feed-inspectors.spec.ts` | Spec 76 §3.5 + §3.6 (PENDING implementation) | Lead Detail Inspector + Flight Job Detail Inspector each accept a `lead_id`, render the corresponding endpoint output, schema-drift surfaces as a parse error. **Blocked until Cycle 4.** |
| `tests/e2e/app-health.spec.ts` | Spec 30 (PENDING implementation) | `/admin/app-health` renders 5 tiles, each tile renders one of {ok, unavailable} states, deep-link buttons present and target the correct external URL. **Blocked until Spec 30 implementation cycle.** |

### 3.3 Playwright Execution

```bash
# Run all
npx playwright test

# Run a specific spec
npx playwright test tests/e2e/admin-shell.spec.ts

# Run with the test runner UI (best for debugging)
npx playwright test --ui

# Run in a specific browser (CI matrix runs all 3)
npx playwright test --project=chromium
```

### 3.4 Browser Matrix

CI runs Playwright against Chromium + Firefox + WebKit on every PR. Local dev defaults to Chromium for speed. Browser-specific failures (rare) are escalated to the platform matrix in the PR before merge.

### 3.5 State Management in E2E Tests

- **Database:** every E2E flow assumes a fresh testcontainer postgres (CI provisions; local dev sets `BUILDO_TEST_DB=1`).
- **Seed fixtures:** `tests/e2e/fixtures/seed.ts` populates a deterministic test dataset (admin user, ~50 permits, ~10 lead_views) before each flow. The seed is idempotent and isolated per worker.
- **External APIs (Sentry, PostHog, Stripe):** mocked at the network layer via Playwright's `page.route()` interceptor. **NEVER** point E2E flows at real external APIs — flaky tests are inevitable.
- **Cleanup:** Playwright's `afterEach` hook truncates the test fixtures (admin user, test permits) so flows don't pollute each other.

## 4. Unit & Integration Testing Strategy

**Tool:** Vitest + React Testing Library (RTL).
**Location:** `src/tests/**` (existing convention).

The split:
- `*.logic.test.ts` — pure functions, business logic, transformations. Mocks irrelevant; runs fastest.
- `*.infra.test.ts` — route handlers with mocked `pool.query` + `getCurrentUserContext`. Asserts response shape, auth gates, error mapping.
- `*.db.test.ts` — runs against real testcontainer postgres. Used for SQL semantics that mocks can't validate (LATERAL EXISTS scoping, FK cascades, geography casts).
- `*.ui.test.tsx` — component rendering via RTL. Used sparingly — Playwright covers most UI assertions; RTL is for components with non-trivial internal state machines.

### 4.1 Required Test Boundaries

This section is **non-exhaustive**. The normative test mandate set sits at **Spec 35 §8 (Test Mandates)** — every implementation MUST satisfy:

- **§8.1** — bridge idempotency tests (B1 server→TanStack, B2 TanStack→Zustand draft, B3 Zustand→Server with rollback, B4 auth invalidation, B5 logout reset).
- **§8.2** — admin route auth-gate tests (every `/api/admin/**` handler asserts 401/403 on unauthorized; 200 on admin claim).
- **§8.3** — Zod boundary tests (request + response parse, Spec 33 §13 mandate — closes the audit's "admin endpoints lack Zod validation" gap).
- **§8.4** — Action telemetry tests (every state-mutating admin endpoint asserts the `Sentry.addBreadcrumb({category: 'admin_action'})` call fires per Spec 33 §11).

**Existing infra-test pattern** (precedent: `src/tests/leads-detail.infra.test.ts`):
- `vi.mock('@/lib/db/client', () => ({ pool: { query: vi.fn() } }))` — pool.query is mocked at module level.
- `vi.mock('@/lib/auth/get-user-context', ...)` — admin auth resolver mocked.
- The test asserts: 401 on missing auth, 200 with envelope shape on success, 4xx error mapping for each defined error code.

**Existing db-test pattern** (precedent: `src/tests/db/lead-detail-saved-state.db.test.ts`):
- `getTestPool()` returns `null` when Docker isn't running; `describe.skipIf(!dbAvailable())` gates the suite.
- Seeds fixtures via `pool.query` in `beforeAll`.
- Cleans up via `afterAll` deletions narrowly targeting the seeded data.

### 4.2 Coverage Threshold

- **Source coverage:** 75% line + 75% branch for new code in `src/app/admin/**`, `src/app/api/admin/**`, `src/components/admin/**`. Lower than mobile's 80% because admin has more end-to-end test surface in Playwright that's hard to count under unit-test coverage tools.
- **Critical-path coverage:** 95% for Spec 33 §5 anti-pattern guards (auth gate, Zod boundary, PII strip in logger). These are security-relevant; they MUST be near-complete.
- **Coverage is reported but not blocking** in PRs. CI fails on test failure, not coverage drop. Drops below 60% trigger a warning in the PR comment.

### 4.3 Test File Naming Discipline

Follow the precedent established by existing `src/tests/`:
- `feature.logic.test.ts` — pure logic.
- `feature.infra.test.ts` — route handlers (mocked pool).
- `feature.db.test.ts` — real-DB integration.
- `feature.ui.test.tsx` — component RTL.
- `feature.security.test.ts` — auth-gate / privilege-escalation tests (precedent: `src/tests/user-profiles.security.test.ts`).

## 5. Continuous Integration (CI)

**Tool:** GitHub Actions.

**Pull request checks** (every PR targeting `main`):
```yaml
- npm run typecheck     # tsc --noEmit
- npm run lint          # next lint
- npm run test          # Vitest full suite (logic + infra + db.test if DATABASE_URL set)
- npx playwright test   # Playwright E2E (in a separate job with browser cache)
```

**Pre-commit gauntlet** (husky `.husky/pre-commit`):
- typecheck + lint + Vitest run on every commit (fast — `*.db.test.ts` skipped when Docker isn't running).
- Playwright NOT run pre-commit (too slow). CI catches regressions.

### 5.1 GitHub Actions matrix

```yaml
unit-tests:
  runs-on: ubuntu-latest
  services:
    postgres:
      image: postgis/postgis:16-3.4
      env:
        POSTGRES_USER: postgres
        POSTGRES_PASSWORD: test
        POSTGRES_DB: buildo
      ports: ['5432:5432']
  steps:
    - run: npm ci
    - run: DATABASE_URL=postgresql://postgres:test@localhost:5432/buildo npm run test

e2e-tests:
  runs-on: ubuntu-latest
  needs: unit-tests
  steps:
    - run: npm ci
    - run: npx playwright install --with-deps chromium firefox webkit
    - run: npm run build && npm start &  # production-like server
    - run: npx playwright test
```

### 5.2 CI failure escalation

A failed CI run blocks merge. If a flow is flaking (passes locally, fails in CI), document in `docs/reports/ci-flake-log.md` with the run URL + suspected cause. Three flakes in 30 days on the same flow → file a stabilization WF.

## 6. Historical Context & Past Issues

### 6.1 Why Playwright not Cypress

Cypress's iframe-based test runner doesn't support cross-origin OAuth flows cleanly — admin login via Firebase requires bouncing to `accounts.google.com` for some test paths, which Cypress historically tripped on. Playwright handles cross-origin natively. The migration cost from Cypress was zero (we never adopted Cypress).

### 6.2 Why testcontainer postgres not SQLite

The admin uses PostGIS for geospatial queries (`/api/admin/leads/test-feed` consumes `getLeadFeed` which uses `ST_DWithin` per Spec 76 §2.1). SQLite has no PostGIS equivalent; tests run against real postgres + PostGIS via testcontainer. The 2026-Q2 audit found a class of bugs where mocked-pool tests passed but the real SQL semantics differed; `*.db.test.ts` exists to catch that class.

### 6.3 Why no React Testing Library mandate for every component

Mobile Spec 98 §4 explicitly excludes UI snapshot testing. Web-admin DOES use RTL but selectively — primitives from shadcn/ui are upstream-tested; admin compositions get RTL coverage only when their internal state machine is non-trivial (e.g., the `<HealthTile>` component with three render states). Snapshot tests are BANNED — they encode current behavior as truth and produce noise on every visual change.

---

**Cross-spec dependencies:**
- **Authoritative for:** test surface in `src/tests/**` and `tests/e2e/**` for any code under `src/app/admin/**`, `src/app/api/admin/**`, `src/components/admin/**`.
- **Relies on:** Spec 33 (engineering protocol — defines what's testable), Spec 35 §8 (test mandate enumeration).
- **Consumed by:** Spec 21, 26, 30, 76, 86 (every web-admin feature spec must satisfy this protocol).
