# Active Task: Pipeline Status UX Fixes (5 items)
**Status:** Planning

## Context
* **Goal:** Fix 5 UX issues in the FreshnessTimeline pipeline status component:
  1. Chain "Run All" buttons hidden behind hover — make always visible
  2. Per-step "Run" buttons and toggle switches hidden behind hover — make always visible
  3. Toggle/Run buttons shown on steps where they don't make sense (assert_schema, assert_data_bounds, refresh_snapshot) — hide on utility steps
  4. No error summary box at bottom of pipeline status when a run fails — add one
  5. Permits pipeline "fails immediately" — this is the 409 Conflict when chain is already running; surface this clearly in-context instead of only in a banner at the top of the page
* **Target Spec:** `docs/specs/26_admin.md`
* **Key Files:**
  - `src/components/FreshnessTimeline.tsx` — all 5 fixes here

## Technical Implementation
* **(1) Chain "Run All" always visible:** Remove `opacity-0 group-hover/chain:opacity-100` from the Run All button.
* **(2) Per-step controls always visible:** Remove `opacity-0 group-hover:opacity-100` from the Run button and toggle switch.
* **(3) Hide controls on utility steps:** Define a `NON_TOGGLEABLE_SLUGS` set containing `assert_schema`, `assert_data_bounds`, `refresh_snapshot`. Don't render Run button or toggle for these steps — they are infrastructure steps that always run as part of a chain.
* **(4) Error summary at bottom of pipeline section:** Add a `chainErrors` computed list from `pipelineLastRun` entries with `status === 'failed'`. Render a red error box below the chains showing the most recent failure per chain with its `error_message`.
* **(5) 409 Conflict handling:** The `onTrigger` callback already catches the 409 error. Pass `triggerError` state into FreshnessTimeline as a new prop so the error renders inline near the chain that was triggered, not just in the top-of-page banner.
* **Database Impact:** NO

## Standards Compliance
* **Try-Catch Boundary:** No API changes.
* **Unhappy Path Tests:** Test NON_TOGGLEABLE_SLUGS filtering, error summary rendering logic.
* **logError Mandate:** No API changes.
* **Mobile-First:** Controls are already 44px touch targets. Removing hover gating improves mobile usability (hover doesn't exist on touch devices). UI tests MUST mock a narrow viewport (375px) and assert that always-visible controls render correctly at mobile width — no hover-gated elements should exist.

## Execution Plan
- [ ] **Standards Verification:** Mobile-first improved (no hover dependency). No API changes. Viewport mock at 375px required in UI tests.
- [ ] **Guardrail Tests:** Add tests for NON_TOGGLEABLE_SLUGS set, chain error summary logic, and a 375px viewport mock test asserting that Run/toggle controls are not hidden behind hover classes (no `opacity-0 group-hover` patterns in rendered output).
- [ ] **Implementation:**
  1. Define `NON_TOGGLEABLE_SLUGS` set in FreshnessTimeline.
  2. Remove `opacity-0 group-hover` from Run All, Run, and toggle buttons — make always visible.
  3. Conditionally hide Run/toggle for NON_TOGGLEABLE_SLUGS steps.
  4. Add `triggerError` prop to FreshnessTimelineProps.
  5. Add chain error summary box at bottom of each chain section showing last failure.
  6. Pass `pipelineError` from DataQualityDashboard into FreshnessTimeline as `triggerError`.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`
- [ ] **Atomic Commit.**
