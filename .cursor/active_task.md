# Active Task: Fix 13 Pre-Existing Test Failures
**Status:** Implementation

## Context
* **Goal:** Fix 13 test failures across 3 test files that have been blocking the pre-commit hook, requiring `--no-verify` for commits.
* **Target Spec:** docs/specs/37_pipeline_system.md (pipeline SDK adoption), docs/specs/28_data_quality_dashboard.md (health banner)
* **Key Files:** `scripts/quality/assert-schema.js`, `scripts/quality/assert-data-bounds.js`, `scripts/refresh-snapshot.js`, `scripts/link-coa.js`, `scripts/run-chain.js`, `src/tests/pipeline-sdk.logic.test.ts`, `src/tests/admin.ui.test.tsx`, `src/tests/wsib.infra.test.ts`
* **Rollback Anchor:** `5c953a6`

## Technical Implementation

### Bug 1: Quality scripts bypass Pipeline SDK (6 failures)
`assert-schema.js` and `assert-data-bounds.js` use `const { Pool } = require('pg')` + `new Pool({...})` instead of `pipeline.createPool()`. Fix: migrate both to Pipeline SDK.

### Bug 2: refresh-snapshot.js empty catch blocks (1 failure)
Lines 172 and 213 have bare `catch {}` blocks. Fix: add `pipeline.log.warn()` logging.

### Bug 3: link-coa.js N+1 FTS queries (1 failure)
Per-row FTS loop. Test expects `unnest` + `CROSS JOIN LATERAL` batching. Fix: refactor to batched FTS.

### Bug 4: Chain/WSIB tests expect inline definitions in run-chain.js (5 failures)
Chain definitions moved to `manifest.json` but tests still read `run-chain.js`. Fix: update tests to read `manifest.json`.

### Bug 5: Health banner test expects `data.health.issues` (1 failure)
Code destructures to `health` prop, test expects literal `data.health.issues`. Fix: update test to match actual pattern `health.issues`.

## Standards Compliance
* **Try-Catch Boundary:** N/A (no new API routes)
* **Unhappy Path Tests:** N/A (fixing existing tests)
* **logError Mandate:** N/A
* **Mobile-First:** N/A (backend + test fixes only)

## Execution Plan
- [x] **Rollback Anchor:** 5c953a6
- [x] **State Verification:** All 13 failures documented
- [x] **Spec Review:** Read specs 37 + 28
- [ ] **Fix 1:** Migrate assert-schema.js + assert-data-bounds.js to Pipeline SDK
- [ ] **Fix 2:** Add logging to refresh-snapshot.js empty catch blocks
- [ ] **Fix 3:** Refactor link-coa.js to batched FTS
- [ ] **Fix 4:** Update chain/WSIB tests to read manifest.json
- [ ] **Fix 5:** Update health banner test assertion
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6.
