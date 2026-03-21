# Active Task: Phase 1 — Add audit_table to 10 permits chain scripts
**Status:** Implementation
**Rollback Anchor:** `52fd9e3`
**Workflow:** WF2 — Feature Enhancement

## Context
* **Goal:** Add structured `audit_table` objects (inside `records_meta`) to all 10 permits-chain-specific scripts that currently lack them. This enables the FreshnessTimeline UI to render per-step observability tables with Metric/Value/Threshold/Status columns — matching the pattern already working for CoA chain steps.
* **Target Spec:** `docs/specs/37_pipeline_system.md`, `docs/specs/28_data_quality_dashboard.md`
* **Key Files (10 scripts to modify):**
  1. `scripts/load-permits.js` — Phase 2: Permit Ingestion
  2. `scripts/classify-scope.js` — Phase 3: Scope Classification
  3. `scripts/extract-builders.js` — Phase 4: Builder Extraction
  4. `scripts/link-wsib.js` — Phase 5: WSIB Registry Matching
  5. `scripts/geocode-permits.js` — Phase 6: Permit Geocoding
  6. `scripts/link-parcels.js` — Phase 7: Parcel Linking
  7. `scripts/link-neighbourhoods.js` — Phase 8: Neighbourhood Linking
  8. `scripts/link-massing.js` — Phase 9: Building Footprint Linking
  9. `scripts/link-similar.js` — Phase 10: Similar Permit Linking
  10. `scripts/classify-permits.js` — Phase 11: Trade Classification

## Technical Implementation
* **Pattern:** Match existing CoA audit_table format (`{ phase, name, verdict, rows: [{ metric, value, threshold, status }] }`) nested inside `records_meta.audit_table` in existing `emitSummary()` calls.
* **No new counters needed** — all metrics reference variables already tracked in each script.
* **Existing `records_meta` fields preserved** — audit_table is additive.
* **FAIL/WARN/PASS criteria per step:**
  - **FAIL:** api_errors > 0, schema_drift > 0, records_errors > 0 (step 2), total_in_db < normalized (step 4), neighbourhoods != 158 (step 8), buildings_indexed == 0 (step 9), coverage == 0% (step 11)
  - **WARN:** tags_coverage < 50% (3), link_rate < 70% (5), coverage < 95% (6), link_rate < 75% (7), link_rate < 95% (8), link_rate < 50% (9), propagated == 0 (10), coverage < 95% or avg_trades < 1.5 (11)
  - **INFO:** All observational counters (inserted, updated, matched, latencies, etc.)
* **Database Impact:** NO
* **UI Impact:** NO — FreshnessTimeline.tsx already renders audit_table objects

## Standards Compliance
* **Try-Catch Boundary:** N/A — adding data to existing emitSummary calls
* **Unhappy Path Tests:** N/A — audit_table is informational metadata
* **logError Mandate:** N/A
* **Mobile-First:** N/A

## §10 Plan Compliance Checklist

### If Pipeline Script Created/Modified:
- [x] Uses Pipeline SDK: all 10 scripts already use `pipeline.run`, `emitSummary`, `emitMeta` (§9.4)
- [x] No new streaming changes (§9.5)

### Other categories:
- ⬜ DB — N/A
- ⬜ API — N/A
- ⬜ UI — N/A (existing renderer handles new data automatically)
- ⬜ Shared Logic — N/A

## Execution Plan
- [ ] **State Verification:** Confirmed all 10 scripts have emitSummary calls with records_meta but no audit_table
- [ ] **Contract Definition:** N/A
- [ ] **Spec Update:** N/A
- [ ] **Schema Evolution:** N/A
- [ ] **Guardrail Test:** N/A — metadata addition, existing tests unaffected
- [ ] **Red Light:** N/A
- [ ] **Implementation:** Add audit_table to emitSummary records_meta in all 10 scripts
- [ ] **UI Regression Check:** N/A — renderer auto-detects audit_table
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6.
