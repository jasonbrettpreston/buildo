# Active Task: Extract Funnel Panel Components from FreshnessTimeline (WF2)
**Status:** Planning

## Context
* **Goal:** Resolve component bloat audit finding — extract inline accordion panel components from `FreshnessTimeline.tsx` (1088 lines) into `src/components/funnel/FunnelPanels.tsx`. Pure refactor, zero behavior change.
* **Target Spec:** `docs/specs/28_data_quality_dashboard.md`
* **Key Files:** `src/components/FreshnessTimeline.tsx`, `src/components/funnel/FunnelPanels.tsx` (new), `src/tests/admin.ui.test.tsx`

## Technical Implementation

### What moves to `src/components/funnel/FunnelPanels.tsx`:
1. `CircularBadge` — SVG donut percentage badge (lines 280-301)
2. `MetricRow` — reusable label/value row (lines 303-310)
3. `FunnelAllTimePanel` — Baseline/Intersection/Yield accordion (lines 312-371)
4. `FunnelLastRunPanel` — Last Run accordion with rich parsing (lines 390-447)
5. `INTERSECTION_LABELS` — contextual label constant (lines 374-388)

### What stays in `FreshnessTimeline.tsx`:
- All types/interfaces (`PipelineRunInfo`, `FreshnessTimelineProps`, etc.)
- All config constants (`PIPELINE_REGISTRY`, `PIPELINE_CHAINS`, `NON_TOGGLEABLE_SLUGS`, `GROUP_LABELS`)
- All utility functions (`timeAgo`, `formatDate`, `formatDuration`, `getStatusDot`, `computeStepNumbers`)
- The main `FreshnessTimeline` component

### Test impact:
~20 source-inspection tests in `admin.ui.test.tsx` currently read `FreshnessTimeline.tsx` looking for `CircularBadge`, `FunnelAllTimePanel`, `FunnelLastRunPanel`, `INTERSECTION_LABELS`. These must be updated to read `funnel/FunnelPanels.tsx` instead. Tests that check the *usage* of these components (e.g., `<FunnelAllTimePanel`) in FreshnessTimeline.tsx remain unchanged.

### Database Impact
NO

## Standards Compliance
* **Try-Catch Boundary:** N/A — no API routes modified.
* **Unhappy Path Tests:** N/A — no API routes modified.
* **logError Mandate:** N/A — no API routes modified.
* **Mobile-First:** N/A — no layout changes, pure file-move refactor.

## Execution Plan
- [x] **Rollback Anchor:** `762c643`
- [x] **State Verification:** FreshnessTimeline.tsx is 1088 lines. Components to extract: CircularBadge, MetricRow, FunnelAllTimePanel, FunnelLastRunPanel, INTERSECTION_LABELS (lines 276-447). ~20 tests inspect source of these components.
- [x] **Spec Review:** Spec 28 confirmed — funnel computation in `src/lib/admin/funnel.ts`, presentation in FreshnessTimeline. No constraint against splitting presentation files.
- [ ] **Spec Update:** N/A — spec references `FreshnessTimeline.tsx` generically; component extraction doesn't change the spec contract.
- [ ] **Viewport Mocking:** Backend Only, N/A.
- [ ] **Guardrail Test:** Add test verifying FreshnessTimeline.tsx imports from `./funnel/FunnelPanels` and is under 700 lines.
- [ ] **Red Light:** New test must fail before extraction.
- [ ] **Implementation:** (a) Create `src/components/funnel/FunnelPanels.tsx` with extracted components. (b) Replace inline definitions in FreshnessTimeline.tsx with imports. (c) Update ~20 source-inspection tests to read correct file.
- [ ] **UI Regression Check:** `npx vitest run src/tests/*.ui.test.tsx` — verify no sibling UI broke.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`.
- [ ] **Collateral Check:** `npx vitest related src/components/FreshnessTimeline.tsx --run`.
- [ ] **Atomic Commit:** `refactor(28_data_quality_dashboard): extract funnel panels from FreshnessTimeline`
- [ ] **Spec Audit:** Update audit report to mark component bloat finding resolved.
