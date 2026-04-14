# Active Task: WF3 — Deferred Control Panel Wiring + v1 Removal
**Status:** Implementation — Path A authorized
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `e0a25b6` (feat(41_chain_permits))
**Domain Mode:** **Backend/Pipeline**

---

## Context
* **Goal:** Close 4 deferred items from the previous WF3/WF2 reviews. Variables were seeded in migration 093 but no consuming logic was written. Plus remove deprecated v1 timing calibration from the permits chain.
* **Target Spec:** `docs/specs/product/future/86_control_panel.md` (control panel), `docs/specs/product/future/84_lifecycle_phase_engine.md` (stall), `docs/specs/product/future/82_crm_assistant_alerts.md` (auto-archive)

## Bugs

### Bug 1 — Remove v1 `compute_timing_calibration` from permits chain
**⚠️ BLOCKING DECISION NEEDED — see top of response.** v1 feeds spec 71 detail-page timing engine (`src/features/leads/lib/timing.ts`), admin health dashboard, and CQA. Removing v1 from chain will cause `timing_calibration` table to go stale. Must decide whether to:
- (A) Just remove from chain (detail-page timing degrades over time)
- (B) Remove + migrate `timing.ts` to read `phase_calibration` (v2's table) in same WF
- (C) Keep v1, only do bugs 2-4

Assuming Path A for the plan below.

### Bug 2 — `classifyUrgency` hardcodes `-90` instead of using `logic_variables.expired_threshold_days` / `lead_expiry_days`
`scripts/compute-trade-forecasts.js` line 64:
```js
if (daysUntil <= -90) return 'expired';
```
Should use `logicVars.expired_threshold_days` (already in seed as `-90`) and also respect `lead_expiry_days` (90) for TTL consistency.

### Bug 3 — `coa_stall_threshold` seeded but not consumed
`scripts/classify-lifecycle-phase.js` should use `logicVars.coa_stall_threshold` (30 days) when deciding if a CoA application has been inactive long enough to flag `lifecycle_stalled = true`. Currently the classifier has no CoA-specific stall logic (only generic construction stall detection).

### Bug 4 — CRM Assistant not auto-archiving `expired` urgency claimed leads
`scripts/update-tracked-projects.js` currently only archives on `isWindowClosed` or `urgency === 'expired'` for **saved** status. For **claimed** projects, the `isWindowClosed` branch archives, but `urgency === 'expired'` is NOT archived — it just silently accumulates. Per roadmap: claimed projects with `urgency = 'expired'` should auto-archive after the `lead_expiry_days` TTL.

## Execution Plan

- [ ] **Rollback Anchor:** `e0a25b6` recorded.
- [ ] **State Verification:** Confirm logic_variables has `expired_threshold_days=-90`, `lead_expiry_days=90`, `coa_stall_threshold=30`. Confirm v1 script still exists and is referenced by `timing.ts`.
- [ ] **Spec Review:** Read spec 82 (CRM auto-archive), 84 (CoA stall), 85 (urgency classification).
- [ ] **Reproduction Tests (Red Light):**
  - Test: `classifyUrgency(-95, false)` must return 'expired' when `expired_threshold_days=-90`
  - Test: compute-trade-forecasts script source contains `logicVars.expired_threshold_days` (not hardcoded `-90`)
  - Test: classify-lifecycle-phase script source contains `coa_stall_threshold` consumption for CoA rows
  - Test: update-tracked-projects source contains branch that archives claimed projects with `urgency === 'expired'`
  - Test: manifest permits chain does NOT contain `compute_timing_calibration` (only v2)
- [ ] **Fix 1:** Remove `compute_timing_calibration` from `scripts/manifest.json` permits chain (keep v2). Remove from `FreshnessTimeline.tsx` PIPELINE_CHAINS. Update chain.logic.test.ts 25→24 step expectation. Update spec 40/41.
- [ ] **Fix 2:** Update `compute-trade-forecasts.js` to use `logicVars.expired_threshold_days` in classifyUrgency. Pass `logicVars` into the classifier closure.
- [ ] **Fix 3:** Update `classify-lifecycle-phase.js` to load `logicVars.coa_stall_threshold` via shared config loader and apply it when classifying CoA lifecycle_stalled.
- [ ] **Fix 4:** Update `update-tracked-projects.js` to archive claimed projects where `urgency === 'expired'` (in addition to existing `isWindowClosed` branch).
- [ ] **Pre-Review Self-Checklist:** List 3-5 sibling bugs — hardcoded 90-day TTL elsewhere? Other DB constants not loaded? Other CRM paths missing archive?
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass.
- [ ] **Review Agents:** Independent + adversarial, triage, defer to review_followups.
- [ ] **Migration 093 Runbook:** Document ops procedure (pause pipeline → apply migration → deploy JS → resume) in `docs/specs/pipeline/41_chain_permits.md` or a new runbook file.
- [ ] **Commit.**

## Standards Compliance
* **Try-Catch Boundary:** N/A — no new API routes
* **Unhappy Path Tests:** Red Light tests for each bug before fix
* **logError Mandate:** N/A — existing pipeline scripts already use `pipeline.log.warn`
* **Mobile-First:** N/A — backend-only
* **Dual-Code Path:** `classifyLifecyclePhase` in `scripts/lib/lifecycle-phase.js` is pure logic — if CoA stall detection needs TS parity, the TS module in `src/lib/classification/lifecycle-phase.ts` must also be updated.

---

**§10 Compliance:**

- ⬜ DB: N/A — variables already seeded in migration 093
- ⬜ API: N/A — no routes
- ⬜ UI: N/A — no frontend
- ✅ Shared Logic: `lifecycle-phase.js` has a TS twin. If CoA stall logic lives in the pure function, dual-path applies.
- ✅ Pipeline: Uses shared `loadMarketplaceConfigs` helper. No new SDK patterns.
- ✅ Pre-Review Self-Checklist: Listed in execution plan
- ⬜ Cross-Layer Contracts: N/A — no new thresholds, only wiring existing seeded values
- ⬜ Database/Migration: N/A

**PLAN LOCKED. Do you authorize? (y/n)**

Specifically confirm which v1-removal path to take (A/B/C above).
