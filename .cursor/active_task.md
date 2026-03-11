# Active Task: Stream C — Wire T5 Sparkline + Dead Code Cleanup
**Status:** Planning

## Context
* **Goal:** Complete T1-T5 DB transparency by wiring the T5 historical sparkline (the only unfinished feature from Stream B). Also clean up dead exports and the TABLE_MAP duplication flagged in WF6 review.
* **Target Spec:** docs/specs/28_data_quality_dashboard.md (primary)
* **Key Files:** `src/components/FreshnessTimeline.tsx`, `src/components/funnel/FunnelPanels.tsx`, `src/components/DataQualityDashboard.tsx`

## Technical Implementation

### Feature 1: Wire T5 Sparkline
The `Sparkline` component and `/api/admin/pipelines/history` endpoint exist but aren't connected. Wire them:
- Import `Sparkline` + `SparklineRun` in FreshnessTimeline.tsx
- Add lazy-load fetch on accordion expand: `GET /api/admin/pipelines/history?slug={step.slug}&limit=10`
- Cache results in a `Map<string, SparklineRun[]>` ref to avoid re-fetching
- Render `<Sparkline runs={...} />` in the pipeline tile header row (right-aligned, hidden on mobile via existing `hidden md:inline-block`)

### Feature 2: Clean up dead MetricRow export
`MetricRow` is exported from FunnelPanels.tsx but only used internally. Remove the `export` keyword to avoid knip dead-code warnings.

### Feature 3: Extract shared TABLE_MAP constant
`FreshnessTimeline.tsx` and `src/app/api/admin/stats/route.ts` both define the same slug→table mapping inline. Extract to `src/lib/admin/funnel.ts` (the existing shared constants file) as `PIPELINE_TABLE_MAP`.

## Standards Compliance
* **Try-Catch Boundary:** N/A — no new API routes
* **Unhappy Path Tests:** N/A — no new API routes
* **logError Mandate:** N/A
* **Mobile-First:** Sparkline already uses `hidden md:inline-block` (mobile-hidden by design — tiny 40×16px chart not useful on mobile)

## Execution Plan
- [ ] **State Verification:** Confirm Sparkline/SparklineRun exist and history API works
- [ ] **Contract Definition:** N/A — no API changes
- [ ] **Spec Update:** Update docs/specs/28_data_quality_dashboard.md to note T5 wiring complete. Run `npm run system-map`.
- [ ] **Schema Evolution:** N/A — no DB changes
- [ ] **Guardrail Test:** Add test asserting Sparkline is imported and rendered in FreshnessTimeline.tsx; add test asserting PIPELINE_TABLE_MAP is used by both stats route and FreshnessTimeline
- [ ] **Red Light:** Verify new tests fail
- [ ] **Implementation:**
  - Wire Sparkline fetch + render in FreshnessTimeline.tsx
  - Remove `export` from MetricRow in FunnelPanels.tsx
  - Extract TABLE_MAP to funnel.ts, import in both consumers
- [ ] **UI Regression Check:** `npx vitest run src/tests/*.ui.test.tsx`
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6.
