# Active Task: Fix assert-staleness.js — broken aggregation counting stages not permits
**Status:** Implementation
**Rollback Anchor:** `e3dad53`
**Workflow:** WF3 — Bug Fix

## Context
* **Goal:** Fix the staleness query that counts inspection stages instead of permits. A single permit with 15 stages inflates `stale_14d` to 15, artificially failing the staleness check. Use CTE to group by `permit_num` first, then check staleness of the most recent scrape per permit.
* **Target Spec:** `docs/specs/38_inspection_scraping.md` §3.6 Step 5
* **Key Files:**
  - `scripts/quality/assert-staleness.js` — fix staleness SQL query (lines 62-71)
* **Note:** The `never_scraped` miscalculation (zero-stage permits counted as unscraped) requires adding `last_scraped_at` to the permits table — deferred to a separate WF2 with migration.

## Technical Implementation
* **Bug:** `COUNT(*) FILTER (WHERE pi.scraped_at < ...)` counts rows in permit_inspections (multiple per permit). Should count distinct permits.
* **Fix:** Use CTE `permit_freshness` that `GROUP BY p.permit_num` with `MAX(pi.scraped_at) AS last_scraped`, then query staleness from the CTE.
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
- [ ] **Rollback Anchor:** `e3dad53`
- [ ] **State Verification:** Confirmed COUNT(*) counts stages, not permits
- [ ] **Spec Review:** Spec 38 §3.6 defines staleness as per-permit, not per-stage
- [ ] **Reproduction:** Confirmed via SQL analysis
- [ ] **Red Light:** N/A — SQL logic fix
- [ ] **Fix:** Replace staleness query with CTE-based per-permit aggregation
- [ ] **Green Light:** typecheck + test pass → WF6
