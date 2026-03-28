# Active Task: Fix ancient_dates threshold in assert-data-bounds
**Status:** Implementation
**Workflow:** WF3 — Bug Fix

## Context
* **Goal:** `assert-data-bounds.js` step 17 fails because `ancient_dates` check requires exactly 0 inspection records before 2020-01-01, but 2 legitimate records exist (permit `18 145660 BLD` with passed Excavation/Shoring and Footings/Foundations inspections from 2018-2019). These are real scraped data, not corruption.
* **Target Spec:** `docs/specs/28_data_quality_dashboard.md`
* **Key Files:**
  - `scripts/quality/assert-data-bounds.js` (line 560)
  - `src/tests/quality.logic.test.ts`
* **Rollback Anchor:** `c6bf9f1d6741271f666b2af4487b70d52bbdfe23`

## Technical Implementation
* Change `ancient_dates` threshold from `== 0` (FAIL) to `<= 5` (WARN)
* This follows the same baseline pattern used by other checks (e.g., `null_status` uses WARN, CoA NULL addresses has baseline of 3)
* Old permits with valid inspection history are legitimate — the scraper can encounter them

## Standards Compliance
* **Try-Catch Boundary:** N/A — pipeline script
* **Unhappy Path Tests:** N/A
* **logError Mandate:** N/A
* **Mobile-First:** N/A

## Execution Plan
- [x] **Rollback Anchor:** c6bf9f1
- [x] **State Verification:** 2 records with inspection_date < 2020-01-01, both legitimate (permit 18 145660 BLD)
- [x] **Spec Review:** assert-data-bounds is CQA Tier 2 post-ingestion validation
- [ ] **Reproduction:** Existing pipeline failure reproduces the bug
- [ ] **Red Light:** `node scripts/quality/assert-data-bounds.js` fails with ancient_dates = 2
- [ ] **Fix:** Change threshold from `== 0` FAIL to `<= 5` WARN
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6
