# Active Task: WF3-A — Add permits-chain audit_tables to 3 CQA scripts
**Status:** Implementation
**Rollback Anchor:** `a01edb7`
**Workflow:** WF3 — Bug Fix

## Context
* **Goal:** The 3 CQA scripts (`assert-schema.js`, `assert-data-bounds.js`, `assert-engine-health.js`) are chain-aware and emit audit_tables for CoA and deep_scrapes chains, but NOT for the permits chain. When running in the permits chain, they fall back to the old scalar format (checks_passed/checks_failed), so the UI shows the legacy "ALL CHECKS PASSED" banner instead of the structured Metric/Value/Threshold/Status table.
* **Target Spec:** `docs/specs/37_pipeline_system.md`, `docs/specs/28_data_quality_dashboard.md`
* **Key Files:**
  - `scripts/quality/assert-schema.js` — add permits-chain audit_table (schema field validation)
  - `scripts/quality/assert-data-bounds.js` — add permits-chain audit_table (cost/null/orphan checks)
  - `scripts/quality/assert-engine-health.js` — add permits-chain audit_table (dead tuples, seq scans)

## Technical Implementation
* **Pattern:** Follow the existing CoA audit_table pattern in each script. Add `runPermitChecks` guard and build permits-specific `audit_table` alongside the existing CoA one.
* **assert-schema.js:** Already has `runPermitChecks` flag (line 214). Build permits audit_table with permit column check results. Emit alongside CoA audit_table via chain-aware spread.
* **assert-data-bounds.js:** Already has `runPermitChecks` flag (line 50). Build permits audit_table from the permit-specific SQL checks (cost outliers, null rates, orphans, PKs).
* **assert-engine-health.js:** No chain filter currently — always runs same checks. Build permits audit_table from the engine health metrics (same data, different phase/name label).
* **Database Impact:** NO

## Standards Compliance
* **Try-Catch Boundary:** N/A — adding audit_table to existing emitSummary
* **Unhappy Path Tests:** N/A — metadata addition
* **logError Mandate:** N/A
* **Mobile-First:** N/A

## §10 Plan Compliance Checklist
### If Pipeline Script Created/Modified:
- [x] Uses Pipeline SDK (§9.4)
- [x] No streaming changes (§9.5)
### Other: ⬜ All N/A

## Execution Plan
- [ ] **Rollback Anchor:** `a01edb7`
- [ ] **State Verification:** Confirmed 3 scripts only emit CoA/deep_scrapes audit_tables
- [ ] **Spec Review:** §9.6 mandates consistent observability across chains
- [ ] **Reproduction:** UI shows old scalar format for permits chain CQA steps
- [ ] **Red Light:** N/A — metadata addition
- [ ] **Fix:** Add permits-chain audit_tables to all 3 scripts
- [ ] **Green Light:** typecheck + test pass → WF6
