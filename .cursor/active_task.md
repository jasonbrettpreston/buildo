# Active Task: Universal Pipeline Drill-Downs + Dual View + Description Section
**Status:** Implementation

## Context
* **Goal:** Three enhancements to the FreshnessTimeline pipeline accordion drill-downs:
  1. **Every step gets a drill-down** — not just the 13 funnel sources. Steps without funnel data get a simpler drill-down showing description, fields updated, and last-run stats.
  2. **Show both All Time and Last Run simultaneously** — remove the toggle, stack both views inside the accordion.
  3. **Add a "Description" section** — each drill-down starts with a description of what the step does and which database fields/tables it updates.
* **Target Spec:** `docs/specs/26_admin.md` (primary) + `docs/specs/28_data_quality_dashboard.md` (cross-spec)
* **Reference:** `docs/reports/corporate_identity_pipeline_evaluation.md` Section 6 (UI Strategy + New Funnel Metrics Required)
* **Key Files:**
  - `src/lib/admin/funnel.ts` — Add `STEP_DESCRIPTIONS` registry covering all 25 pipeline slugs
  - `src/components/FreshnessTimeline.tsx` — Universal drill-down for all steps, remove toggle, show both views, add Description zone
  - `src/components/DataQualityDashboard.tsx` — Remove funnelViewMode state and onFunnelViewModeChange prop (toggle removed)
  - `src/tests/admin.ui.test.tsx` — Update accordion tests for universal drill-down + dual view
  - `src/tests/quality.logic.test.ts` — Add STEP_DESCRIPTIONS coverage test

* **Database Impact:** NO

## Technical Implementation

### Phase 1: Add STEP_DESCRIPTIONS to funnel.ts
- Add `StepDescription` interface: `{ summary: string; fields: string[]; table: string }`
- Add `STEP_DESCRIPTIONS: Record<string, StepDescription>` covering all 25 pipeline slugs in PIPELINE_REGISTRY
- Each entry describes what the step does (1-line summary) and which DB fields/tables it writes to
- Steps from corporate_identity_pipeline_evaluation.md Section 6 (New Funnel Metrics Required):
  - `assert_schema`: "Validates upstream CKAN/CSV column headers before ingestion" — fields: schema metadata
  - `assert_data_bounds`: "Post-ingestion SQL checks for cost outliers, null rates, referential integrity" — fields: pipeline_runs
  - `link_similar`: "Clusters permits by address proximity to find related applications" — fields: similar_permit_id
  - `create_pre_permits`: "Creates placeholder permits from eligible CoA applications" — fields: permits (pre-permit rows)
  - `refresh_snapshot`: "Captures data quality metrics snapshot to data_quality_snapshots table" — fields: all snapshot columns
  - `compute_centroids`: "Computes geometric centroids for parcel polygons" — fields: centroid_lat, centroid_lng
  - `inspections`: "Scrapes permit inspection stages from City portal" — fields: permit_inspections
  - `coa_documents`: "Downloads Committee of Adjustment plans and decision PDFs" — fields: coa_documents
  - Plus all 13 existing funnel sources get descriptions derived from their config

### Phase 2: Universal drill-down in FreshnessTimeline
- **Every step** gets an expand chevron (not just funnelRow steps)
- For steps WITH funnelData: show Description + All Time panel + Last Run panel (stacked, no toggle)
- For steps WITHOUT funnelData: show Description + basic last-run stats from `pipelineLastRun[scopedKey]`
- Remove `funnelViewMode` and `onFunnelViewModeChange` props entirely
- Remove the All Time / Last Run toggle from header
- Accordion layout (top to bottom):
  1. **Description** zone: step summary + fields grid
  2. **All Time** zone (if funnelRow exists): Baseline | Intersection | Yield (3-col grid)
  3. **Last Run** zone: either rich FunnelLastRunPanel (if funnelRow) or basic records/duration from PipelineRunInfo
- Infrastructure steps (`refresh_snapshot`, `assert_schema`, `assert_data_bounds`) get drill-downs too — showing description + last run stats

### Phase 3: Simplify DataQualityDashboard
- Remove `funnelViewMode` state and `setFunnelViewMode`
- Remove `onFunnelViewModeChange={setFunnelViewMode}` prop from FreshnessTimeline call

### Phase 4: Update tests
- Update accordion tests: chevron shown for ALL steps (not just funnelRow), assert 'Description' section rendered
- Add test: STEP_DESCRIPTIONS covers all PIPELINE_REGISTRY slugs
- Remove tests referencing the removed All Time / Last Run toggle
- Add test: both All Time and Last Run panels render simultaneously when funnelRow exists

### Phase 5: Update specs
- Update `docs/specs/26_admin.md` — Note universal drill-downs and dual view
- Update `docs/specs/28_data_quality_dashboard.md` — Remove toggle reference, note Description section

## Standards Compliance
* **Try-Catch Boundary:** No new API routes. Existing routes unchanged.
* **Unhappy Path Tests:** Test drill-down when pipelineLastRun has no data for a step (graceful empty state).
* **Mobile-First:** Description zone uses `grid grid-cols-1 md:grid-cols-2` for fields list. All Time + Last Run panels keep existing `grid grid-cols-1 md:grid-cols-3`. Touch targets verified via `min-h-[44px]`.
* **Touch Targets:** Expand/collapse chevron button meets 44px minimum via `min-h-[44px] min-w-[44px]`.

## Execution Plan
- [ ] **Standards Verification:** Plan adheres to Try-Catch (no new routes), Unhappy Path (empty drill-down), Mobile-First (grid-cols-1 base), Touch Targets (44px expand button).
- [ ] **Viewport Mocking:** This task modifies frontend UI components (FreshnessTimeline accordion, Description zone). Responsive grid uses `grid-cols-1` base (mobile) with `md:grid-cols-2` (description fields) and `md:grid-cols-3` (funnel panels) for desktop. Touch targets verified via string assertion on `min-h-[44px]`. No 375px viewport mock test required — source-level assertions confirm mobile-first class ordering.
- [ ] **State Verification:** Currently only 13 funnel sources have drill-downs. Toggle switches between All Time / Last Run. No description section exists.
- [ ] **Guardrail Test:** Add tests for: (1) STEP_DESCRIPTIONS covers all PIPELINE_REGISTRY slugs, (2) chevron shown for all steps, (3) Description section renders, (4) both All Time + Last Run shown without toggle.
- [ ] **Red Light:** Run tests — new tests must fail.
- [ ] **Implementation:**
  - Add STEP_DESCRIPTIONS to `src/lib/admin/funnel.ts`
  - Update FreshnessTimeline: universal drill-down, remove toggle, add Description, stack both views
  - Simplify DataQualityDashboard: remove funnelViewMode state
- [ ] **UI Regression Check:** Run `npx vitest run src/tests/*.ui.test.tsx`
- [ ] **Green Light:** Run `npm run test && npm run lint -- --fix`. All tests must pass.
- [ ] **Atomic Commit:** Prompt user to commit: `feat(26_admin+28_quality): universal pipeline drill-downs with description + dual view`
- [ ] **Founder's Audit:** Verify no laziness placeholders, all exports resolve, test coverage complete.
