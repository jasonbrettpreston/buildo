# Active Task: Fix assert-schema.js EST_CONST_COST type validation failure
**Status:** Implementation
**Workflow:** WF3 — Bug Fix
**Domain Mode:** **Backend/Pipeline**

## Context
* **Goal:** Fix the CQA Tier 1 schema validator failing on Building Permits because CKAN returns comma-formatted cost strings (e.g. `"1,000"`) and junk metadata rows (`"DO NOT UPDATE OR DELETE THIS INFO FIELD"`) that the current `validateTypeSample()` logic doesn't handle.
* **Target Spec:** `docs/specs/pipeline/40_pipeline_system.md`
* **Key Files:** `scripts/quality/assert-schema.js`

## Root Cause
`validateTypeSample()` (line 93-126) fetches 5 sample rows from CKAN and checks that `EST_CONST_COST` is parseable via `Number()`. Two problems:

1. **Junk rows not filtered:** CKAN returns metadata sentinel rows with `"DO NOT UPDATE OR DELETE THIS INFO FIELD"`. These pass the non-empty filter (line 108-110) and count as "cost rows" but fail `Number()` parsing.
2. **Comma-formatted numbers:** Real cost values like `"1,000"` fail `Number()` because JS `Number()` doesn't handle thousands separators.

The ingestion script `load-permits.js` already handles both correctly via `cleanCost()` (line 63-68): filters junk text, strips non-numeric chars via `replace(/[^0-9.\-]/g, '')`.

## Technical Implementation
* **Modified File:** `scripts/quality/assert-schema.js` — update `validateTypeSample()`:
  1. Filter out sentinel rows containing `"DO NOT UPDATE"` or `"DO NOT DELETE"` (matching `cleanCost` logic from `load-permits.js`)
  2. Strip commas/non-numeric chars before `Number()` parsing (matching `cleanCost`'s regex)
  3. Increase sample size from 5 to 20 rows to reduce chance of all-junk samples
* **Database Impact:** NO

## Standards Compliance
* **Try-Catch Boundary:** N/A — pipeline script, not API route
* **Unhappy Path Tests:** Test covering junk rows + comma-formatted costs
* **logError Mandate:** N/A — script uses `pipeline.log.warn`
* **Mobile-First:** N/A — backend-only

## Execution Plan
- [ ] **Rollback Anchor:** `64083f5`
- [ ] **State Verification:** CKAN returns junk sentinel rows + comma-formatted costs; `load-permits.js` `cleanCost()` handles both
- [ ] **Spec Review:** `docs/specs/pipeline/40_pipeline_system.md` — assert_schema is a pre-ingestion gate
- [ ] **Reproduction:** `node scripts/quality/assert-schema.js` exits 1 with "no sampled rows have parseable EST_CONST_COST"
- [ ] **Red Light:** Create failing test isolating the parsing bug with representative CKAN data
- [ ] **Fix:** Update `validateTypeSample()` — filter junk rows, strip commas, increase sample to 20
- [ ] **Pre-Review Self-Checklist:** Verify fix covers sibling bugs:
  1. Could other CKAN fields have similar junk sentinel rows? (check if any other type validation exists)
  2. Could costs have `$` prefix or space-separated thousands? (match `cleanCost` regex exactly)
  3. Does increasing limit=20 risk timeout on slow CKAN responses? (non-fatal, already has fallback)
  4. Does the fix handle the edge case where ALL 20 rows are junk? (should WARN, not FAIL — data is valid, just no cost sample available)
  5. Is the junk row pattern stable? (`"DO NOT UPDATE"` has been observed across multiple fetches)
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. Output ✅/⬜ summary. → WF6.
