# Active Task: Reorder permits chain — move classify_permits after all linking steps
**Status:** Implementation
**Rollback Anchor:** `3fa259c`
**Workflow:** WF2 — Feature Enhancement

## Context
* **Goal:** Move `classify_permits` from step 4 to step 11 in the permits chain so that trade classification and lead scoring run after all identity resolution (builders, WSIB) and spatial linking (geocode, parcels, neighbourhoods, massing) are complete. Future-proofs the scoring formula for when WSIB/neighbourhood/parcel signals are added.
* **Target Spec:** `docs/specs/37_pipeline_system.md`
* **Key Files:**
  - `scripts/manifest.json` — reorder permits chain array
  - `src/components/FreshnessTimeline.tsx` — reorder UI steps array (step numbers auto-computed by `computeStepNumbers`)

## Technical Implementation
* **Current order (steps 3–11):**
  ```
  3:classify_scope → 4:classify_permits → 5:builders → 6:link_wsib →
  7:geocode_permits → 8:link_parcels → 9:link_neighbourhoods → 10:link_massing → 11:link_similar
  ```
* **New order (steps 3–11):**
  ```
  3:classify_scope → 4:builders → 5:link_wsib → 6:geocode_permits →
  7:link_parcels → 8:link_neighbourhoods → 9:link_massing → 10:link_similar → 11:classify_permits
  ```
* **UI impact:** Step numbers in FreshnessTimeline are auto-computed from array position (`computeStepNumbers` increments a counter). Reordering the array automatically renumbers the badges. No manual numbering edits needed.
* **Dependency audit (verified via grep — zero permit_trades readers in steps 5–10):**
  - `classify_permits` reads `scope_tags` → set by step 3 (classify_scope) ✅
  - `classify_permits` reads `permits` → loaded at step 2 ✅
  - `link_similar` reads `scope_tags` → still after step 3 ✅
  - `refresh_snapshot` reads `permit_trades` → runs at step 14 (after new step 11) ✅
  - Chain gate on step 2 still skips steps 3–13 when 0 new ✅
  - `chain.logic.test.ts` checks count (16) + last step, not exact order ✅
* **Database Impact:** NO

## Standards Compliance
* **Try-Catch Boundary:** N/A — no code changes
* **Unhappy Path Tests:** N/A
* **logError Mandate:** N/A
* **Mobile-First:** N/A — reordering data array, no layout/touch/viewport changes

## §10 Plan Compliance Checklist

### If Database Impact = YES:
- ⬜ N/A

### If API Route Created/Modified:
- ⬜ N/A

### If UI Component Created/Modified:
- ⬜ N/A — reordering an existing data array in FreshnessTimeline.tsx, not modifying component layout, touch targets, or responsive behavior. Step numbers auto-computed.

### If Shared Logic Touched:
- ⬜ N/A

### If Pipeline Script Created/Modified:
- ⬜ N/A — no scripts modified, only chain ordering in manifest.json config

## Execution Plan
- [ ] **State Verification:** Confirmed zero dependencies on `permit_trades` in steps 5–10.
- [ ] **Contract Definition:** N/A
- [ ] **Spec Update:** N/A
- [ ] **Schema Evolution:** N/A
- [ ] **Guardrail Test:** Existing chain.logic.test.ts validates step count (16) and terminal step.
- [ ] **Red Light:** N/A — configuration change.
- [ ] **Implementation:**
  1. Update `scripts/manifest.json` permits chain array
  2. Update `src/components/FreshnessTimeline.tsx` permits steps array
- [ ] **UI Regression Check:** N/A — data array reorder, no shared component changes.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6.
