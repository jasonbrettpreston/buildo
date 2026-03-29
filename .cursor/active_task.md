# Active Task: Fix 3 review agent gaps in stealth hardening
**Status:** Implementation
**Workflow:** WF3 — Bug Fix

## Context
* **Goal:** Independent review agent found 3 issues in the stealth hardening implementation: (1) browser leak if bootstrapSession fails after launchBrowser, (2) inconsistent bootstrapAttempts counting between initial and re-bootstrap, (3) double-close risk when re-bootstrap fails and the finally block tries to close an already-closed browser.
* **Target Spec:** `docs/specs/38_inspection_scraping.md`
* **Key Files:** `scripts/poc-aic-scraper-v2.js`
* **Rollback Anchor:** `dceda6b`

## Technical Implementation

### Fix 1: Browser leak in bootstrapSession (HIGH)
- Wrap bootstrapSession internals in try/catch after launchBrowser
- On failure, close the browser before re-throwing
- Already applied in working tree

### Fix 2: Inconsistent bootstrap counting (MEDIUM)
- Change initial bootstrap from `attempts - 1` to `attempts` to match re-bootstrap counting
- Both paths now count total attempts consistently
- Already applied in working tree

### Fix 3: Double-close guard on re-bootstrap failure (LOW)
- When WAF trap re-bootstrap fails, `browser` still references the old closed instance
- Set `browser = null` after closing, guard the finally block with `if (browser)`
- Not yet applied

## Standards Compliance
* **Try-Catch Boundary:** N/A — pipeline script
* **Unhappy Path Tests:** N/A
* **logError Mandate:** N/A
* **Mobile-First:** N/A

## Execution Plan
- [x] **Rollback Anchor:** dceda6b
- [x] **State Verification:** Review agent identified all 3 gaps with line numbers
- [x] **Spec Review:** No spec violations — these are implementation correctness issues
- [x] **Reproduction:** Code review confirms gaps
- [ ] **Fix:** Apply fix 3 (double-close guard). Fixes 1-2 already applied.
- [ ] **Green Light:** npm run test && npm run lint -- --fix. All pass. → WF6
