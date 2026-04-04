# Active Task: WF3 — chain_wsib Not Registered in API Route
**Status:** Planning
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `ba3ad8a`

## Context
* **Goal:** Add `chain_wsib` to the pipeline API route so it can be triggered from the dashboard.
* **Key Files:** `src/app/api/admin/pipelines/[slug]/route.ts`

## Bug
Dashboard trigger fails: `Invalid pipeline: chain_wsib`. The WSIB chain exists in `manifest.json` but was never added to the API route's `PIPELINE_SCRIPTS` map or `CHAIN_SLUGS` set.

## Fix
Two lines in `route.ts`:
1. Add `chain_wsib: 'scripts/run-chain.js'` to PIPELINE_SCRIPTS
2. Add `'chain_wsib'` to CHAIN_SLUGS

## Execution Plan
- [ ] **Rollback Anchor:** `ba3ad8a`
- [ ] **Fix:** Add chain_wsib to route.ts
- [ ] **Green Light:** `npm run test`. All pass.
