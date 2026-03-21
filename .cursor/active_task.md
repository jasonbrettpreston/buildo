# Active Task: Fix 3 CQA audit_table bugs — circuit breaker, missing metrics, missing sources table
**Status:** Implementation
**Rollback Anchor:** `ab3dc8a`
**Workflow:** WF3 — Bug Fix

## Context
* **Goal:** Fix 3 bugs in CQA scripts introduced during audit_table implementation:
  1. `assert-schema.js` — broken circuit breaker: schema drift in chain mode is non-fatal, allowing load-permits to run with malformed data
  2. `assert-data-bounds.js` — permits audit_table missing null-rate metrics (description, builder_name, status) that are computed but not included in rows
  3. `assert-data-bounds.js` — no sources-chain audit_table: sources chain gets empty UI accordion
* **Target Spec:** `docs/specs/37_pipeline_system.md`, `docs/specs/28_data_quality_dashboard.md`
* **Key Files:**
  - `scripts/quality/assert-schema.js` — restore circuit breaker (process.exit(1) on schema drift regardless of chain mode)
  - `scripts/quality/assert-data-bounds.js` — add null-rate metrics to permits audit_table + build sources audit_table

## Technical Implementation
* **Bug 1 (circuit breaker):** Remove the `!CHAIN_ID` guard on process.exit(1). Schema drift must halt the chain — the gate was defeating Tier 1's purpose.
* **Bug 2 (missing metrics):** Add `descNull`, `builderNull`, `statusNull` variables to `permitAuditRows` array. Variables are already computed (lines 82-111) but scoped inside an `if (recentTotal > 0)` block — need to hoist them or conditionally spread.
* **Bug 3 (sources table):** Build `sourcesAuditTable` from existing source checks (apCount, apDupes, parcelCount, parcelDupes, lotOutliers, bfCount, heightOutliers, nhoodCount, nhoodDupes). Add to exclusive IIFE.
* **Database Impact:** NO

## Standards Compliance
* **Try-Catch Boundary:** N/A
* **Unhappy Path Tests:** N/A
* **logError Mandate:** N/A
* **Mobile-First:** N/A

## §10 Plan Compliance Checklist
### If Pipeline Script Created/Modified:
- [x] Uses Pipeline SDK (§9.4)
- [x] No streaming changes (§9.5)
### Other: ⬜ All N/A

## Execution Plan
- [ ] **Rollback Anchor:** `ab3dc8a`
- [ ] **State Verification:** Confirmed all 3 bugs via code review
- [ ] **Spec Review:** Tier 1 schema validation must be a hard gate (§CQA)
- [ ] **Reproduction:** Confirmed via source reading
- [ ] **Red Light:** N/A — metadata + control flow fix
- [ ] **Fix:**
  1. assert-schema.js: make process.exit(1) unconditional on schema drift
  2. assert-data-bounds.js: add null-rate rows to permits audit_table
  3. assert-data-bounds.js: build sources audit_table + add to exclusive IIFE
- [ ] **Green Light:** typecheck + test pass → WF6
