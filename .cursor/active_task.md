# Active Task: Fix compute-cost-estimates.js — SQL join error + transaction cascade failure
**Status:** Implementation
**Workflow:** WF3 — Bug Fix
**Domain Mode:** **Backend/Pipeline**
**Rollback Anchor:** `f168b1e`

## Context
* **Goal:** Fix compute-cost-estimates.js failing as step 14 in the permits chain.
* **Target Spec:** `docs/specs/product/future/72_lead_cost_model.md`
* **Key Files:** `scripts/compute-cost-estimates.js`

## Bug 1 (FIXED): `bf.parcel_id does not exist`
SOURCE_SQL joined `building_footprints bf ON bf.parcel_id = pp.parcel_id` but building_footprints has no `parcel_id` column. The relationship goes through the `parcel_buildings` join table.
**Fix applied:** Added `parcel_buildings pb` intermediate join: `pp.parcel_id → pb.parcel_id → pb.building_id → bf.id`.

## Bug 2 (IN PROGRESS): Transaction cascade failure — 0 records written
After fixing the SQL, the script runs against 243K permits but writes 0 records. The first row in each batch hits an error (likely CHECK constraint), which aborts the PostgreSQL transaction. All subsequent rows in that batch get "current transaction is aborted" errors. Need to identify the root cause INSERT failure.

## Execution Plan
- [x] **Rollback Anchor:** `f168b1e`
- [x] **Reproduction:** `node scripts/compute-cost-estimates.js` — exits 1 with `bf.parcel_id does not exist`
- [x] **Fix 1:** SQL join path corrected
- [ ] **State Verification:** Identify first-row INSERT failure in each batch
- [ ] **Fix 2:** Resolve the CHECK constraint or data issue
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`
