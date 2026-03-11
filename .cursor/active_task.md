# Active Task: Remove redundant All Time / Last Run tiles (B4)
**Status:** Implementation

## Context
* **Goal:** The step accordion renders three tile zones: DataFlowTile (live telemetry), FunnelAllTimePanel (snapshot-derived), and FunnelLastRunPanel (snapshot-derived). Now that DataFlowTile shows live reads/writes, row count deltas (T1), pg_stat mutations (T2), and NULL fill rates (T4) from actual pipeline runs, the All Time and Last Run panels are redundant and sometimes contradict the live data. Remove them.
* **Target Spec:** `docs/specs/28_data_quality_dashboard.md`
* **Key Files:**
  - `src/components/FreshnessTimeline.tsx` — renders tiles at lines 891-966
  - `src/components/funnel/FunnelPanels.tsx` — component definitions
  - `src/tests/admin.ui.test.tsx` — structural tests referencing both panels
  - `src/tests/chain.logic.test.ts` — chain behavior tests

## Technical Implementation

### Current behavior
Each step accordion shows three zones:
1. **DataFlowTile** — live source→target with PIPELINE_META + telemetry (T1/T2/T4)
2. **All Time** — FunnelAllTimePanel (baseline/intersection/yield from snapshot)
3. **Last Run** — FunnelLastRunPanel (funnel sources) or inline status/duration/records (non-funnel)

### New behavior
- Remove zone 2 (All Time) entirely — lines 891-897
- Remove zone 3's funnel branch (FunnelLastRunPanel) — lines 899-904
- Keep zone 3's non-funnel fallback (inline status/duration/records/error + CQA metadata) — this serves steps that don't have STEP_DESCRIPTIONS entries and thus no DataFlowTile
- Remove `FunnelAllTimePanel` and `FunnelLastRunPanel` imports from FreshnessTimeline.tsx
- Keep component definitions in FunnelPanels.tsx (dead code cleanup is a separate task)
- Update tests that assert these panels are rendered in the accordion

## Standards Compliance
* **Try-Catch Boundary:** N/A — no API routes.
* **Unhappy Path Tests:** N/A — no API routes.
* **logError Mandate:** N/A — no API routes.
* **Mobile-First:** Remaining tiles use existing mobile-first layout (base `flex-col`, `md:grid-cols-3`).

## Execution Plan
- [x] **Rollback Anchor:** Git commit `fb775be`
- [x] **State Verification:** Current accordion shows All Time + Last Run tiles for funnel steps (confirmed via WF5 manual audit).
- [x] **Spec Review:** Spec 28 §3 documents all three zones. The spec describes DataFlowTile as the primary drill-down, with All Time/Last Run as supplementary.
- [ ] **Reproduction:** Add test asserting accordion does NOT render FunnelAllTimePanel/FunnelLastRunPanel.
- [ ] **Red Light:** New test must fail against current code.
- [ ] **Fix:** Remove FunnelAllTimePanel and FunnelLastRunPanel from FreshnessTimeline.tsx accordion. Remove unused imports.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6.
