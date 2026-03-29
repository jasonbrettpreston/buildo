# Active Task: Fix 5 gaps identified by independent review agent
**Status:** Implementation
**Workflow:** WF3 — Bug Fix

## Context
* **Goal:** Independent review agent identified 5 issues in the scraper and classify-inspection-status scripts: SQL interpolation, scraped_at not advancing on unchanged data, chain/spec divergence, hardcoded year cap, and NULL-invisible stalled detection.
* **Target Spec:** `docs/specs/38_inspection_scraping.md`
* **Key Files:**
  - `scripts/poc-aic-scraper-v2.js` (fixes 4a, 9a)
  - `scripts/classify-inspection-status.js` (fixes 2a, 13b)
  - `docs/specs/38_inspection_scraping.md` (fix 6a)
* **Rollback Anchor:** `a18c46c`

## Technical Implementation

### Fix 2a: SQL interpolation in classify-inspection-status.js
- Replace `INTERVAL '${STALE_MONTHS} months'` with parameterized `INTERVAL '1 month' * $1`
- Lines 30, 48

### Fix 4a: scraped_at never advances on unchanged data
- After processing all stages for a permit, unconditionally touch scraped_at:
  `UPDATE permit_inspections SET scraped_at = NOW() WHERE permit_num = $1`
- This ensures the 7-day cooldown works even when nothing changed
- Run this as a single bulk update per permit, not per stage

### Fix 6a: Spec chain doesn't include classify_inspection_status
- Update docs/specs/38_inspection_scraping.md section 3.6 chain definition to include the new step

### Fix 9a: Hardcoded year cap <= 26
- Replace `SUBSTRING(p.permit_num FROM '^[0-9]{2}')::int <= 26` with dynamic `<= EXTRACT(YEAR FROM CURRENT_DATE) % 100`

### Fix 13b: NULL inspection_date invisible to stalled detection
- Use `COALESCE(MAX(pi.inspection_date), MIN(pi.scraped_at)::date)` as the activity timestamp
- If no inspection_date exists, fall back to when we first scraped it — if that was 10+ months ago with no stage activity, it's stalled

## Standards Compliance
* **Try-Catch Boundary:** N/A — pipeline scripts
* **Unhappy Path Tests:** N/A
* **logError Mandate:** N/A
* **Mobile-First:** N/A

## Execution Plan
- [x] **Rollback Anchor:** a18c46c
- [x] **State Verification:** Review agent identified all 5 gaps with line numbers
- [x] **Spec Review:** Spec 38 §3.6 chain definition needs updating
- [ ] **Reproduction:** Code review confirms all 5 gaps
- [ ] **Fix:** Apply all 5 fixes
- [ ] **Green Light:** npm run test && npm run lint -- --fix. All pass. Spawn review agent. → WF6
