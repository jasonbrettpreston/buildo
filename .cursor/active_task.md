# Active Task: Fix 4 review agent gaps in nodriver scraper
**Status:** Implementation
**Workflow:** WF3 — Bug Fix

## Context
* **Goal:** Independent review agent found 4 issues: (1) chain orchestrator error message hardcodes "node", (2) `python` may not exist on Linux — needs `python3` fallback, (3) f-string interpolation of external API values into page.evaluate JS, (4) .env parser doesn't strip quotes.
* **Target Spec:** `docs/specs/38_inspection_scraping.md`
* **Key Files:**
  - `scripts/run-chain.js` (fixes 1, 2)
  - `scripts/aic-scraper-nodriver.py` (fixes 3, 4)
* **Rollback Anchor:** `bcd89e0`

## Technical Implementation

### Fix 1: Error message uses `runtime` variable (run-chain.js)
- Change hardcoded "node" in error message to `${runtime}`

### Fix 2: Python runtime fallback (run-chain.js)
- Try `python3` first, fall back to `python` — or use manifest config

### Fix 3: Sanitize external values before JS interpolation (aic-scraper-nodriver.py)
- Validate `property_rsn`, `folder_rsn`, `process_rsn` are alphanumeric before interpolating into page.evaluate

### Fix 4: Strip quotes from .env values (aic-scraper-nodriver.py)
- Strip surrounding quotes from parsed values

## Standards Compliance
* All N/A — pipeline scripts

## Execution Plan
- [x] **Rollback Anchor:** bcd89e0
- [x] **State Verification:** Review agent identified all 4 gaps
- [ ] **Fix:** Apply all 4 fixes
- [ ] **Green Light:** npm run test && npm run lint -- --fix. All pass. → WF6
