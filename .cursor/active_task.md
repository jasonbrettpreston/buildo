# Active Task: Harden db/client.ts — HMR leak, withTransaction, timeouts
**Status:** Implementation
**Rollback Anchor:** `90154cb`
**Workflow:** WF3 — Bug Fix

## Context
* **Goal:** Fix 3 bugs in `src/lib/db/client.ts`: (1) Next.js HMR connection pool leak — each hot reload creates a new 10-connection pool, exhausting PostgreSQL. (2) Expose `withTransaction()` to eliminate manual BEGIN/COMMIT/ROLLBACK boilerplate. (3) Add connection + idle timeouts to prevent hanging API routes.
* **Target Spec:** `docs/specs/00_engineering_standards.md` §2.2 (Error Handling)
* **Key Files:**
  - `src/lib/db/client.ts` — all 3 fixes
  - `src/lib/export/csv.ts` — refactor to use withTransaction
  - `src/lib/sync/process.ts` — refactor to use withTransaction

## Technical Implementation
* **HMR fix:** Cache pool on `globalThis` in development; create fresh in production
* **withTransaction:** Port pattern from `scripts/lib/pipeline.js` — BEGIN/COMMIT/ROLLBACK/release in one wrapper
* **Timeouts:** `connectionTimeoutMillis: 5000`, `idleTimeoutMillis: 30000`
* **Deprecate getClient():** Keep exported but add @deprecated JSDoc pointing to withTransaction
* **Database Impact:** NO

## Standards Compliance
* **Try-Catch Boundary:** withTransaction wraps try-catch with ROLLBACK + logError on rollback failure
* **Unhappy Path Tests:** Test withTransaction commit, rollback, and release-on-error
* **logError Mandate:** ROLLBACK failure logged via logError
* **Mobile-First:** N/A

## §10 Plan Compliance Checklist
- ⬜ DB — N/A
- ⬜ API — N/A (no routes modified, only shared library)
- ⬜ UI — N/A
- ⬜ Shared Logic — N/A (no classification/scoring)
- ⬜ Pipeline — N/A

## Execution Plan
- [ ] **Rollback Anchor:** `90154cb`
- [ ] **State Verification:** Pool created fresh on every module load. No globalThis caching. No timeouts.
- [ ] **Spec Review:** §2.2 requires try-catch boundaries
- [ ] **Reproduction:** Pool leak observable on any HMR cycle in dev
- [ ] **Red Light:** N/A — infrastructure fix, verified by typecheck + existing tests
- [ ] **Fix:**
  1. Add globalThis pool caching for HMR safety
  2. Add connectionTimeoutMillis + idleTimeoutMillis
  3. Add withTransaction() with BEGIN/COMMIT/ROLLBACK/release
  4. Guard pool.on('error') listener count for HMR
  5. Deprecate getClient() with JSDoc
- [ ] **Green Light:** typecheck + test pass → WF6
