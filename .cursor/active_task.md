# Active Task: Fix enriched_status not written for permits with no inspection stages
**Status:** Implementation
**Workflow:** WF3 — Bug Fix

## Context
* **Goal:** In the scraper, permits that return `no_processes` or `no_status_link` errors from AIC skip the enriched_status writeback entirely. These are permits where AIC has the folder but the inspector hasn't created stages yet — they should get `enriched_status = 'Permit Issued'` since work hasn't started.
* **Target Spec:** `docs/specs/38_inspection_scraping.md`
* **Key Files:** `scripts/poc-aic-scraper-v2.js` (line ~308)
* **Rollback Anchor:** `704e25f`

## Technical Implementation
* In the `for (const result of results)` loop, when `result.error` is `no_processes` or `no_status_link`, still write `enriched_status = 'Permit Issued'` to the permits table
* These permits have a folder on AIC but no stages — inspector hasn't set them up yet, which means work definitely hasn't started

## Standards Compliance
* **Try-Catch Boundary:** N/A — pipeline script
* **Unhappy Path Tests:** N/A
* **logError Mandate:** N/A
* **Mobile-First:** N/A

## Execution Plan
- [x] **Rollback Anchor:** 704e25f
- [x] **State Verification:** Permits with no_processes/no_status_link skip enriched_status update
- [x] **Spec Review:** Spec 38 §3.3 — "Missing Status link" permits should be re-scraped next run
- [ ] **Reproduction:** Code review confirms gap at line ~308
- [ ] **Fix:** Add enriched_status = 'Permit Issued' writeback for error results with valid permitNum
- [ ] **Green Light:** npm run test && npm run lint -- --fix. All pass. → WF6
