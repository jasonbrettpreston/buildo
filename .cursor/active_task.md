# Active Task: WF3 — Phase 0 Bloat Gate Still Blocking Pipeline
**Status:** Planning
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `89df196`

## Context
* **Goal:** Phase 0 bloat gate abort is blocking pipeline runs because prior run dead tuples haven't been vacuumed. Convert to warn-only.
* **Key Files:** `scripts/run-chain.js`

## Bug
**Reproduction:** Press "Run All" on permits pipeline → instantly fails. pipeline_runs shows "Pre-flight bloat gate abort: database dead tuple ratio exceeds 50%". permit_parcels at 95.2% dead from prior run's link_parcels upserts.

**Root Cause:** Phase 0 checks bloat BEFORE chain starts, but dead tuples from the PREVIOUS chain run haven't been vacuumed yet. Local dev autovacuum is lazy. The gate blocks the very pipeline that needs to run.

## Fix
Convert Phase 0 from **abort** to **warn-only**:
- Remove the `process.exit(1)` abort path entirely
- Keep the Phase 0 audit_table with WARN/FAIL verdicts for dashboard visibility
- Never block chain execution based on bloat — the pipeline must always be allowed to run
- Bloat monitoring becomes purely observational (dashboard alerts, not execution blocks)

## Execution Plan
- [ ] **Fix:** Remove ABORT path from Phase 0 bloat gate — warn only, never block
- [ ] **Update tests:** Chaos Test B threshold test
- [ ] **Update specs:** 30_pipeline_architecture.md §4.1
- [ ] **Green Light:** Tests pass, pipeline runs
