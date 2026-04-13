# Active Task: WF2 — Pipeline Chain Wiring + Spec Alignment
**Status:** Implementation
**Workflow:** WF2 — Feature Enhancement
**Rollback Anchor:** `30e4100` (fix(93_control_panel))
**Domain Mode:** **Backend/Pipeline**

---

## Context
* **Goal:** Wire 4 missing scripts into the permits chain, replace timing calibration v1 with v2, and align both the pipeline spec (40) and product specs (80-86) with the actual chain ordering. Also wire `classify_lifecycle_phase` into spec 40's chain definition + script registry (it's in the manifest but not in the spec).
* **Target Spec:** `docs/specs/pipeline/40_pipeline_system.md` + `docs/specs/product/future/80-86`

## Key Files
* `scripts/manifest.json` — chain definitions + script registry
* `docs/specs/pipeline/40_pipeline_system.md` §4.2 + §4.3 — chain definition + script registry table
* `docs/specs/product/future/80_lead_feed.md` — references pipeline ordering
* `docs/specs/product/future/81_opportunity_score_engine.md` — "runs nightly in permits chain"
* `docs/specs/product/future/82_crm_assistant_alerts.md` — "final step in chain"
* `docs/specs/product/future/83_lead_cost_model.md` — "permits chain step 14"
* `docs/specs/product/future/84_lifecycle_phase_engine.md` — "end of permits + coa chains"
* `docs/specs/product/future/85_trade_forecast_engine.md` — "after lifecycle phase engine"
* `docs/specs/product/future/86_control_panel.md` — references all 4 scripts

## Technical Implementation

### 4 Gaps in `manifest.json` chains:

| Gap | Fix |
|-----|-----|
| `compute_timing_calibration` (v1) at permits step 15 | Replace with `compute_timing_calibration_v2` |
| `compute_trade_forecasts` not in any chain | Add to permits chain after `classify_lifecycle_phase` |
| `compute_opportunity_scores` not in any chain | Add to permits chain after `compute_trade_forecasts` |
| `update_tracked_projects` not in any chain | Add to permits chain as final step |

### Proposed Permits Chain (25 steps):
```
assert_schema → permits → close_stale_permits → classify_permit_phase → classify_scope
→ builders → link_wsib → geocode_permits → link_parcels → link_neighbourhoods
→ link_massing → link_similar → classify_permits → compute_cost_estimates
→ compute_timing_calibration_v2 → link_coa → create_pre_permits → refresh_snapshot
→ assert_data_bounds → assert_engine_health → classify_lifecycle_phase
→ compute_trade_forecasts → compute_opportunity_scores → update_tracked_projects
```

Note: The 3 new scripts go AFTER `classify_lifecycle_phase` because:
- `compute_trade_forecasts` needs lifecycle_phase + phase_started_at (from classifier)
- `compute_opportunity_scores` needs trade_forecasts + cost_estimates
- `update_tracked_projects` needs trade_forecasts + trade_configurations

### Spec alignment:
- `40_pipeline_system.md` §4.2: Update chain JSON to match manifest
- `40_pipeline_system.md` §4.3: Add 5 missing scripts to registry table (classify_lifecycle_phase, compute_timing_calibration_v2, compute_trade_forecasts, compute_opportunity_scores, update_tracked_projects)
- `80-86`: Update pipeline wiring references to cite correct step numbers

## Standards Compliance
* **Try-Catch Boundary:** N/A — no API routes modified
* **Unhappy Path Tests:** N/A — manifest is JSON config, no logic tests
* **logError Mandate:** N/A
* **Mobile-First:** N/A — backend-only

## Execution Plan
- [ ] **State Verification:** Confirm all 6 script files exist on disk and all are in manifest scripts section.
- [ ] **Contract Definition:** N/A — no API route changes.
- [ ] **Spec Update:** Update `docs/specs/pipeline/40_pipeline_system.md` §4.2 chain definition + §4.3 script registry.
- [ ] **Schema Evolution:** N/A — no DB changes.
- [ ] **Guardrail Test:** Update `src/tests/chain.logic.test.ts` to verify new chain ordering includes the 4 new steps.
- [ ] **Red Light:** Verify new test fails before making manifest change.
- [ ] **Implementation:** Update `scripts/manifest.json` chains. Update specs 80-86 with correct step numbers and chain membership.
- [ ] **UI Regression Check:** N/A.
- [ ] **Pre-Review Self-Checklist:** Verify chain ordering matches dependency graph, no circular dependencies, all script files exist.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6.

---

**§10 Compliance:**

- ⬜ DB: N/A — no database changes
- ⬜ API: N/A — no API routes
- ⬜ UI: N/A — no frontend
- ⬜ Shared Logic: N/A — no dual-code-path changes
- ✅ Pipeline: Uses Pipeline SDK manifest pattern. No script logic changes.
- ✅ Pre-Review Self-Checklist: Will verify dependency ordering
- ⬜ Cross-Layer Contracts: N/A — no threshold changes
- ⬜ Database/Migration: N/A

**PLAN LOCKED. Do you authorize this Enhancement plan? (y/n)**
