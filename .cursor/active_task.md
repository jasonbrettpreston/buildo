# Active Task: WF3 — App Health route exports test-only function — Next.js production build fails
**Status:** Implementation (authorized 2026-05-06 — user said "proceed" on the WF3 file)
**Workflow:** WF3 — Bug Fix
**Domain Mode:** Admin (web admin API route + test seam)
**Rollback Anchor:** `2901fcd` (current HEAD — last Cycle 7 commit)

## Bug

`npm run build` (Next.js production build) fails with:

```
.next/types/app/api/admin/app-health/route.ts:12:13
Type error: Type 'OmitWithTag<typeof import("...src/app/api/admin/app-health/route"),
  "POST" | "PATCH" | "PUT" | "DELETE" | "GET" | "config" | ...>'
  does not satisfy the constraint '{ [x: string]: never; }'.
  Property '__resetAppHealthCacheForTests' is incompatible with index signature.
    Type '() => void' is not assignable to type 'never'.
```

Next.js's App Router enforces that route files (`route.ts`) export ONLY HTTP method handlers (GET/POST/etc.) plus a fixed set of config exports (`dynamic`, `runtime`, etc.). Any other named export is rejected at type-check time during `next build`. Cycle 2 P4 (commit `345c429`) added `__resetAppHealthCacheForTests` as a test-only reset seam to `src/app/api/admin/app-health/route.ts`; it works in dev (where the type-checker is more permissive) but blocks production builds.

Surfaced by my Cycle 7 build attempt during validation. Production deployments are blocked until this is fixed.

## State Verification (WF3 step 2)

**Affected files (verified by grep):**
- `src/app/api/admin/app-health/route.ts:253` — defines + exports `__resetAppHealthCacheForTests`
- `src/app/api/admin/app-health/route.ts:55-78` — defines `CacheEntry` interface + `let cache: CacheEntry | null = null` module-level state
- `src/tests/admin-app-health.infra.test.ts:122-125` — imports `__resetAppHealthCacheForTests` from the route file's module specifier and calls it in `beforeEach`

**Constraint:** Next.js can ONLY type-check the public exports of `route.ts`. The cache state's lifecycle (in-memory promise dedup + minute-boundary TTL) MUST be preserved exactly — Cycle 2 Phase 4 added the dog-pile defense + minute-boundary TTL via Multi-Agent Review fixes; reverting any of that would re-open closed bugs.

## Spec Review (WF3 step 3)

`docs/specs/02-web-admin/30_app_health_dashboard.md` §2.2: "in-memory 60s TTL keyed on snapshot_at minute boundary". The cache mechanism is the spec contract; only the MODULE LOCATION of its state changes.

`docs/specs/02-web-admin/33_web_admin_engineering_protocol.md` §5: admin route handlers must call `verifyAdminAuth` first. Unaffected by this WF3 — auth boundary stays inside `route.ts`.

## Reproduction (WF3 step 4)

The bug is reproduced by running `npm run build`. No new vitest needed for the bug itself — the build error IS the reproduction. However:

- A new test asserting that `route.ts` exports ONLY canonical Next.js handler/config names (no `__` test-only seams) would prevent the same regression class. Adding this as the regression-lock test.

## Fix (WF3 step 5)

**Strategy:** extract the cache state + reset helper into a new module `src/app/api/admin/app-health/cache.ts`. The route file imports the helpers from there. The test file imports the reset helper from `cache.ts` instead of `route.ts`.

The new module is NOT a Next.js route file (only `route.ts` is constrained), so non-handler exports are allowed there.

## Files to change

1. **NEW** — `src/app/api/admin/app-health/cache.ts`:
   - Export `CacheEntry` interface (was inline in route.ts)
   - Export module-level `cache: CacheEntry | null = null` STATE — implementation detail; not exported directly. Instead expose:
     - `getCachedBody(): Promise<AppHealthResponse> | null` — returns the pending/resolved promise if within TTL, else null
     - `setCachedBody(promise: Promise<AppHealthResponse>, expiresAt: number): void` — writes the cache slot
     - `clearCache(): void` — wipes the slot (used by route's error-recovery path AND by tests)
     - `nextMinuteBoundary(now: number): number` — pure helper (was inline)
2. **MODIFIED** — `src/app/api/admin/app-health/route.ts`:
   - Remove inline `CacheEntry` + `cache` + `nextMinuteBoundary` + `__resetAppHealthCacheForTests`
   - Import `getCachedBody`, `setCachedBody`, `clearCache`, `nextMinuteBoundary` from `./cache`
   - Adjust the GET handler's cache-read/write/clear sites to call the helpers
3. **MODIFIED** — `src/tests/admin-app-health.infra.test.ts`:
   - Change `import { __resetAppHealthCacheForTests } from '@/app/api/admin/app-health/route'` to `import { clearCache } from '@/app/api/admin/app-health/cache'`
   - Update the `beforeEach` call accordingly
4. **NEW** — `src/tests/admin-app-health-route-exports.logic.test.ts`:
   - Regression-lock test: imports the route module + asserts the exported names are a subset of `{ GET, POST, PATCH, PUT, DELETE, HEAD, OPTIONS, dynamic, runtime, fetchCache, revalidate, preferredRegion, config, maxDuration }`. Catches future test-only-export accidents.

## Pre-Review Self-Checklist (WF3 step 8)

3-5 sibling bugs that could share the same root cause:

1. **Other admin route files exporting test seams.** Grep for `^export (function|const) __` in `src/app/**/route.ts`. If any siblings exist, file follow-up WFs.
2. **Spec 30's other test seams (test-only mocks / fixtures).** Cycle 2 Phase 4 added cache-reset; were any other test-only exports added to route files? Grep `__` exports across the app/api tree.
3. **Cache state divergence between dev + production.** Module-level `let cache` is intentional but does it survive HMR cleanly? Cycle 2 Phase 4 fixed the dog-pile race with the promise-dedup; verify the extraction doesn't reintroduce the race.
4. **Test isolation regression.** The Cycle 2 P4 cache test (`admin-app-health.infra.test.ts > 60s in-memory cache > concurrent cache misses share ONE fan-out (dog-pile defense)`) depends on the test seam working. Verify it still passes after the extraction.
5. **Bundle size/import cycle.** `cache.ts` is imported by `route.ts`; `route.ts` is the only production consumer. No circular import risk.

## Execution Plan

- [ ] **R1** — Rollback anchor (above): `2901fcd`. Confirmed.
- [ ] **R2** — Reproduction: `npm run build` fails today with the exact error above. Confirmed during Cycle 7 validation.
- [ ] **F1** — Create `src/app/api/admin/app-health/cache.ts` with the 4 exported helpers.
- [ ] **F2** — Refactor `src/app/api/admin/app-health/route.ts` to import from `./cache`.
- [ ] **F3** — Update `src/tests/admin-app-health.infra.test.ts` import + call.
- [ ] **F4** — Add `src/tests/admin-app-health-route-exports.logic.test.ts` regression-lock.
- [ ] **G1** — `npx vitest run src/tests/admin-app-health.infra.test.ts src/tests/admin-app-health-route-exports.logic.test.ts` → both green.
- [ ] **G2** — `npm run typecheck && npm run build` → build passes.
- [ ] **G3** — Full vitest suite for regressions.
- [ ] **G4** — Multi-Agent Review: ONE worktree code-reviewer agent per WF3 protocol (no Gemini/DeepSeek unless requested). Inputs: Spec 30, modified files, one-sentence summary.
- [ ] **G5** — Triage. BUG → fix-now. DEFER → `docs/reports/review_followups.md`.
- [ ] **G6** — Commit + push.

## Standards Compliance

* **Try-Catch Boundary:** unchanged — the route's existing try/catch around `recordLeadView`-equivalent path stays intact.
* **Unhappy Path Tests:** the existing `admin-app-health.infra.test.ts` already exercises 9 failure paths (auth, malformed payload, Zod boundary, dog-pile dedup, minute-boundary TTL, unavailable tiles, etc.). All MUST still pass post-extraction.
* **logError Mandate:** unchanged — `route.ts` keeps its `logError` calls in the same locations.
* **UI Layout:** N/A.

## Idempotency Check
**N/A — Admin/Frontend fix, not pipeline.**

> **PLAN LOCKED. Status set to Implementation per user authorization ("proceed").**
> §10 note: chose extraction (separate module) over `// @ts-expect-error` suppression on the export. Suppression would mask the failure; extraction expresses the architectural separation cleanly (route file = handlers; cache.ts = stateful helpers). Plus extraction creates a stable home for future cache-related additions (TTL config, telemetry, etc.).
