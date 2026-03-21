# Active Task: Fix assert-pre-permit-aging.js — decision filter misses 132 approved permits + phase mismatch
**Status:** Implementation
**Rollback Anchor:** `d41992f`
**Workflow:** WF3 — Bug Fix

## Context
* **Goal:** Fix 2 bugs: (1) Decision filter `IN ('Approved', 'Approved with Conditions')` misses 132 approved CoA applications with variant spellings ('approved', 'Approved on condition', 'Approved wih Conditions', 'APPROVED', etc.). Use case-insensitive `ILIKE 'approved%'` to catch all variants. (2) Phase number mismatch — log says "Phase 6" but audit_table says `phase: 5`. Should be 6 (step 6 in CoA chain).
* **Target Spec:** `docs/specs/12_coa_integration.md`
* **Key Files:**
  - `scripts/quality/assert-pre-permit-aging.js` — fix SQL filter + phase number

## Technical Implementation
* **Bug 1:** Replace `decision IN ('Approved', 'Approved with Conditions')` with `decision ILIKE 'approved%'`. This catches all 18 variants (26,914 total vs 26,782 current — 132 missed approvals).
* **Bug 2:** Change `phase: 5` to `phase: 6` in audit_table.
* **Note:** The same filter is used in `create-pre-permits.js` — should be updated there too for consistency.
* **Database Impact:** NO

## §10 Plan Compliance Checklist
### If Pipeline Script Created/Modified:
- [x] Uses Pipeline SDK (§9.4)
- [x] No streaming changes (§9.5)
### Other: ⬜ All N/A

## Execution Plan
- [ ] **Rollback Anchor:** `d41992f`
- [ ] **State Verification:** Confirmed 18 decision variants via psql, 132 missed
- [ ] **Fix:** ILIKE 'approved%' + phase: 6 in assert-pre-permit-aging.js + create-pre-permits.js
- [ ] **Green Light:** typecheck + test pass → WF6
