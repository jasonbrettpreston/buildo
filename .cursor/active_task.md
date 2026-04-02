# Active Task: Fix classify-inspection-status.js — 10 bugs
**Status:** Planning
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `97ab721`

## Context
* **Goal:** Fix 10 temporal, cross-revision, and systems-level bugs in the stalled-permit classification script
* **Target Spec:** `docs/specs/pipeline/53_source_aic_inspections.md`
* **Key Files:** `scripts/classify-inspection-status.js`, `src/tests/inspections.logic.test.ts`

## Bug Inventory
| # | Bug | Severity |
|---|-----|----------|
| 1 | Scraper Verification Paradox — `MAX(scraped_at)` always today, GREATEST always fresh, never stalls | CRITICAL |
| 2 | Historical Inspection Override — COALESCE stops at first non-null, ignores newer issued_date | CRITICAL |
| 3 | last_seen_at Poison Pill — refreshed nightly, zero-inspection permits never age | HIGH |
| 4 | Cross-Revision Bleed — JOIN on permit_num without revision_num, all revisions get same status | HIGH |
| 5 | Silent State Mutation — no last_seen_at bump, downstream CDC/cache never sees change | MEDIUM |
| 6 | Terminal State Clobbering — reactivation overwrites 'Inspections Complete' | HIGH |
| 7 | Zombie Polling IO Drain — Step 2 scans infinite Stalled graveyard every night | MEDIUM/HIGH |
| 8 | Metric Inflation via rowCount — counts revisions, not unique projects | MEDIUM |
| 9 | Dynamic Telemetry Schema — distribution keys are dynamic, breaks observability tools | MEDIUM |
| 10 | Calendar-Aware Interval Drift — INTERVAL '1 month' * 10 varies by season | LOW |

## Technical Implementation
* **Fix 1:** Remove `MAX(scraped_at)` — use only `MAX(inspection_date)`
* **Fix 2:** Replace outer COALESCE with GREATEST across all temporal indicators
* **Fix 3:** Remove `last_seen_at` from staleness check entirely
* **Fix 4:** Add `AND p.revision_num = '00'` — spec says only rev 00 has inspections
* **Fix 5:** Add `last_seen_at = NOW()` to SET clause (permits has no updated_at)
* **Fix 6:** Exclude terminal states from both stalling and reactivation queries
* **Fix 7:** Drive reactivation from recent permit_inspections (last 24h) joined to permits
* **Fix 8:** Use RETURNING + COUNT(DISTINCT permit_num) instead of rowCount
* **Fix 9:** Emit distribution as array of `{status, count}` objects
* **Fix 10:** Replace `INTERVAL '1 month' * $1` with `INTERVAL '300 days'`

## Standards Compliance
* **Try-Catch Boundary:** N/A — pipeline script, SDK handles errors
* **Unhappy Path Tests:** Zero-inspection permits, multi-revision permits, terminal state permits
* **logError Mandate:** N/A — uses pipeline SDK logging
* **Mobile-First:** N/A — backend script

## Execution Plan
- [ ] **Rollback Anchor:** `97ab721`
- [ ] **State Verification:** permits PK = (permit_num, revision_num), permit_inspections has no revision_num, permits has no updated_at
- [ ] **Spec Review:** rev 01+ has no inspections, only rev 00
- [ ] **Reproduction:** Create failing tests isolating all 10 bugs
- [ ] **Red Light:** Run tests — must fail
- [ ] **Fix:** Rewrite classify-inspection-status.js addressing all 10 bugs
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6
