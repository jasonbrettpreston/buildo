# Active Task: 5 production gaps — proxy auth, stale page, JSON softblock, buffer leak, ghost signals
**Status:** Implementation
**Workflow:** WF2 — Feature Enhancement
**Rollback Anchor:** `f9cb5aa2` (f9cb5aa231069fb43277e0e2cc51329ba9e30963)

## Context
* **Goal:** Fix 5 production-critical gaps in the multi-worker scraper that would cause crashes or silent failures at scale:
  1. **Proxy Auth Gap (Fatal):** Chromium ignores user:pass in `--proxy-server` URL. Need Manifest V3 extension for `onAuthRequired` callback.
  2. **Stale Page Object (Logic):** After WAF re-bootstrap in `scrape_loop`, callers in `db-queue` mode must reassign returned `browser`/`page`.
  3. **JSON Soft Block (Resilience):** `json.loads()` on 502/429/empty responses throws `JSONDecodeError` instead of triggering WAF retry.
  4. **Silent Buffer Leak (Critical):** `proc.communicate()` buffers entire worker stdout in RAM — zero output for hours, then OOM.
  5. **Ghost Signal Handler (Major):** `shutdown_requested` is set but worker subprocesses are never terminated — zombie Chrome processes.
* **Target Spec:** `docs/specs/38_inspection_scraping.md`
* **Key Files:**
  - `scripts/aic-scraper-nodriver.py` (fixes 1, 2, 3)
  - `scripts/aic-orchestrator.py` (fixes 4, 5)
  - `src/tests/inspections.logic.test.ts` (guardrail tests)

## Technical Implementation

### Fix 1: Proxy Auth via Manifest V3 Extension
- Replace `build_proxy_url()` with `build_proxy_extension()` that creates a temp directory with `manifest.json` + `background.js`
- Extension handles `chrome.webRequest.onAuthRequired` with credentials
- `bootstrap_session()` uses `--load-extension=<ext_dir>` instead of `--proxy-server=<url>`
- Extension dir cleaned up in a `finally` block after browser stops
- `shutil` import added for cleanup

### Fix 2: Stale Page Object Reassignment
- In `db-queue` mode's batch loop, the `scrape_loop()` return value `(browser, page)` must be reassigned to the outer scope variables
- Currently the loop does `browser, page = await scrape_loop(...)` — verify this is correct
- Also verify the WAF re-bootstrap inside `scrape_loop` properly returns the new browser/page

### Fix 3: JSON Soft Block Resilience
- Wrap every `json.loads()` call in `fetch_permit_chain()` with `try/except json.JSONDecodeError`
- On `JSONDecodeError`, return `{'waf_blocked': True, ...}` so the retry/backoff logic handles it
- Log the raw response snippet for debugging

### Fix 4: Streaming Subprocess Output
- Replace `proc.communicate()` with async line-by-line streaming via `proc.stdout` and `proc.stderr`
- Only buffer the `PIPELINE_SUMMARY:` line in memory
- Print all other output immediately to console
- Check `abort_event.is_set()` and `shutdown_requested` on each line

### Fix 5: Active Subprocess Termination
- When `abort_event` or `shutdown_requested` is detected in the stream reader, call `proc.terminate()`
- After `proc.terminate()`, wait briefly then `proc.kill()` if still alive
- This kills both the Python worker and its child Chrome process

* **New/Modified Components:** None (pipeline scripts only)
* **Data Hooks/Libs:** None
* **Database Impact:** NO

## Standards Compliance
* **Try-Catch Boundary:** N/A — no API routes
* **Unhappy Path Tests:** JSON decode errors, proxy extension generation, stale page detection
* **logError Mandate:** N/A — pipeline scripts
* **Mobile-First:** N/A — backend only

## Execution Plan
- [x] **State Verification:** Reviewed all 5 gaps against current code. All confirmed.
- [ ] **Contract Definition:** N/A — no API routes.
- [ ] **Spec Update:** Update `docs/specs/38_inspection_scraping.md` §3.9 proxy section. Run `npm run system-map`.
- [ ] **Schema Evolution:** N/A — no DB changes.
- [ ] **Guardrail Test:** Add tests for JSON decode resilience, proxy extension builder, stream parsing.
- [ ] **Red Light:** Verify new tests target the gaps.
- [ ] **Implementation:** Apply all 5 fixes.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass.
      Output visible execution summary using ✅/⬜ for every step above. → WF6.
