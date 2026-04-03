# Active Task: WF3 — Gate-Skip + refresh-snapshot Crash
**Status:** Planning
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `2a2fa96`

## Context
* **Goal:** Fix two bugs discovered during permits pipeline production run.
* **Key Files:** `scripts/run-chain.js` (gate-skip), `scripts/refresh-snapshot.js` (scoping)

## Bug 1: Gate-Skip Ignores Unprocessed Records from Failed Prior Run
**Reproduction:** Run 1 loaded 202 new records but bloat gate killed chain at step 3. Run 2 finds 0 new records → gate-skip skips enrichment steps (6-12, 14-15). 202 records never enriched.

**Root Cause:** Gate-skip only checks `records_new` from the CURRENT run's gate step. It doesn't know that a prior run's records were loaded but never processed downstream.

**Fix:** The gate-skip should check if there are unclassified/unlinked permits, not just whether the current run loaded new ones. Change the gate condition: instead of `records_new === 0`, check `records_new === 0 AND no pending work exists`. Or simpler: **only gate-skip if records_new === 0 AND the previous chain completed successfully**. If the previous chain failed, always run all steps.

Simplest approach: check if the previous chain_permits run completed successfully. If it failed, disable gate-skip (force all steps).

## Bug 2: refresh-snapshot.js `total_permits` Not Defined
**Reproduction:** `node scripts/refresh-snapshot.js` → `ReferenceError: total_permits is not defined` at line 368.

**Root Cause:** `const total_permits` declared at line 154 inside a `try {}` block (lines 18-187). JavaScript `const` is block-scoped. Line 368 accesses it from `pipeline.withTransaction()` callback which is outside the try block.

**Fix:** Move `total_permits` (and other variables declared in the try block) to the outer function scope by declaring them with `let` before the try block.

## Execution Plan
- [ ] **Rollback Anchor:** `2a2fa96`
- [ ] **Fix 1:** Gate-skip: check previous chain status, disable skip if prior run failed
- [ ] **Fix 2:** refresh-snapshot.js: hoist variables out of try block
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass.
