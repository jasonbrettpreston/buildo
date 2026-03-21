# Active Task: Fix assert-coa-freshness.js — Time Traveler Bug
**Status:** Implementation
**Rollback Anchor:** `0ea3498`
**Workflow:** WF3 — Bug Fix

## Context
* **Goal:** Fix the "Time Traveler Bug" — future hearing dates (up to 12 months ahead) mask portal rot by producing `maxDaysStale = 0` even when the CKAN portal is frozen. Use `MAX(last_seen_at)` (ingestion timestamp) as the primary freshness indicator, with `MAX(decision_date)` as a secondary check. Remove `hearing_date` from staleness calculation since hearings are scheduled in the future.
* **Target Spec:** `docs/specs/12_coa_integration.md`
* **Key Files:**
  - `scripts/quality/assert-coa-freshness.js` — fix staleness calculation

## Technical Implementation
* **Root cause:** `newestMs = Math.max(maxHearingMs, maxDecisionMs)` picks the future hearing date. `Math.max(0, Date.now() - futureDate)` evaluates to 0. Portal rot is hidden for months.
* **Fix:** Replace with `MAX(last_seen_at)` as primary freshness metric (updated by load-coa.js on every ingestion). Keep `decision_date` and `hearing_date` as INFO metrics for context. Add `last_ingestion` metric with the `< 45 days` threshold.
* **Confirmed:** `coa_applications.last_seen_at` is `2026-03-17` (3 days ago). `hearing_date` max is `2027-03-10` (12 months future). Bug is live.
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
- [ ] **Rollback Anchor:** `0ea3498`
- [ ] **State Verification:** Confirmed hearing_date max is 2027-03-10 (future), last_seen_at is 2026-03-17 (correct)
- [ ] **Spec Review:** Portal rot detection should measure ingestion freshness, not event dates
- [ ] **Reproduction:** Confirmed via psql query
- [ ] **Red Light:** N/A — SQL logic fix
- [ ] **Fix:** Use MAX(last_seen_at) for staleness, keep dates as INFO
- [ ] **Green Light:** typecheck + test pass → WF6
