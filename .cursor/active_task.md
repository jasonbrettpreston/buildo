# Active Task: Headless Chrome mode and zombie process cleanup
**Status:** Implementation
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `54421b63` (54421b63dd2726ee6dbfa7e87b936c0f521ac657)

## Context
* **Goal:** Fix 2 bugs discovered during WF5 live testing:
  1. **Visible Chrome windows** — nodriver defaults to headed mode. Every bootstrap opens a Chrome window on the user's desktop, navigates to toronto.ca, then AIC portal. Production scraper must run headless (invisible).
  2. **Zombie Chrome processes** — failed bootstrap retries and WAF re-bootstraps leave orphaned Chrome processes. `bootstrap_with_retry` calls `browser.stop()` on preflight failure, but `bootstrap_session` only stops on exception within its own try block. Failed retries between attempts 1→2→3 may leave Chrome processes alive.
* **Target Spec:** `docs/specs/38_inspection_scraping.md`
* **Key Files:**
  - `scripts/aic-scraper-nodriver.py` — `bootstrap_session()` and `bootstrap_with_retry()`

## Technical Implementation

### Bug 1: Headless mode
- nodriver supports `headless=True` parameter in `uc.start()` which adds `--headless=new` to Chrome args
- Change `bootstrap_session()` line 279 from:
  ```python
  browser = await uc.start(browser_args=browser_args)
  ```
  to:
  ```python
  browser = await uc.start(headless=True, browser_args=browser_args)
  ```
- This is a one-line fix. Chrome runs invisibly, no windows on desktop.

### Bug 2: Zombie cleanup
- In `bootstrap_with_retry()`, when preflight fails, `browser.stop()` is called before raising — this is correct.
- But `bootstrap_session()` catches exceptions and calls `browser.stop()` — if `uc.start()` succeeds but the warm bootstrap to `toronto.ca` hangs and times out, the browser is stopped. This path looks correct.
- The real zombie risk is in `scrape_loop` WAF re-bootstrap at line 712: `browser.stop()` is called, then `bootstrap_with_retry()` may fail 3 times, each spawning and killing a Chrome. If the 3rd attempt also fails, the exception propagates — but each attempt's browser IS stopped in `bootstrap_session`'s except block. So this path is also correct.
- **Additional safety:** Add explicit process kill in the outer `finally` block of `main()` to catch any edge case zombies.

* **Database Impact:** NO

## Standards Compliance
* **Try-Catch Boundary:** N/A
* **Unhappy Path Tests:** N/A — headless is a Chrome flag, not testable in Vitest
* **logError Mandate:** N/A
* **Mobile-First:** N/A

## Execution Plan
- [x] **Rollback Anchor:** `54421b63`
- [x] **State Verification:** Confirmed — Chrome windows visible on desktop during every test run. Multiple zombie processes observed.
- [x] **Spec Review:** §3.8 says "nodriver launches Chrome via CDP" — headless is implied for pipeline scripts.
- [ ] **Fix:** Add `headless=True` to `uc.start()`. Add zombie kill safety net in `main()` finally block.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass.
- [ ] **Spec Audit:** Update §3.8 to explicitly state headless mode.
