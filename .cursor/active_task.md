# Active Task: Delete 7 orphan POC/test scripts
**Status:** Implementation
**Rollback Anchor:** `da5fe6d`
**Workflow:** WF3 — Bug Fix

## Context
* **Goal:** Delete 7 orphan scripts identified by the WF5 pipeline health audit. These are POC experiments and integration tests that are not registered in manifest.json, not referenced by any src/ code, and not part of any pipeline chain. They add repo clutter and could confuse future developers.
* **Target Spec:** `docs/specs/37_pipeline_system.md` (manifest is single source of truth)
* **Key Files to DELETE:**
  - `scripts/bandwidth-sniff.js` — Network bandwidth POC
  - `scripts/bandwidth-test.js` — Network bandwidth POC
  - `scripts/bandwidth-test-v3.js` — Network bandwidth POC
  - `scripts/bandwidth-test-v4.js` — Network bandwidth POC
  - `scripts/bandwidth-test-v5.js` — Network bandwidth POC
  - `scripts/poc-aic-scraper.js` — Scraper v1, superseded by poc-aic-scraper-v2.js
  - `scripts/test-wsib-download.js` — One-time WSIB integration test

## Technical Implementation
* **Deletions only** — no code modifications, no schema changes.
* **Database Impact:** NO

## Standards Compliance
* **Try-Catch Boundary:** N/A
* **Unhappy Path Tests:** N/A
* **logError Mandate:** N/A
* **Mobile-First:** N/A

## §10 Plan Compliance Checklist
- ⬜ DB — N/A
- ⬜ API — N/A
- ⬜ UI — N/A
- ⬜ Shared Logic — N/A
- ⬜ Pipeline — N/A (deleting unregistered scripts, not modifying pipeline steps)

## Execution Plan
- [ ] **Rollback Anchor:** `da5fe6d`
- [ ] **State Verification:** All 7 files confirmed as orphans — not in manifest.json, not imported by src/, not in any chain.
- [ ] **Spec Review:** §9.6 mandates manifest.json as single source of truth. These scripts are outside that registry.
- [ ] **Reproduction:** Confirmed via grep — zero references in manifest or src.
- [ ] **Red Light:** N/A — file deletions, not logic changes.
- [ ] **Fix:** Delete all 7 files.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6.
