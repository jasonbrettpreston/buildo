# Active Task: Fix 3 review agent gaps — preflight abort, proxy sessions, browser reuse
**Status:** Implementation
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `1e8eea1a` (1e8eea1aeab3bd35d61938443f57623388223194)

## Context
* **Goal:** Fix 3 gaps found by independent review agent:
  1. **A8 — Real-time preflight abort:** Preflight failure check runs AFTER `asyncio.gather()` returns (all workers already finished). Spec says 2+ preflight failures should abort remaining workers immediately.
  2. **I1 — Per-worker proxy sticky sessions:** Spec §3.9 requires `buildo-worker-{id}-{timestamp}` Decodo sticky session per worker. Neither orchestrator nor scraper implements this.
  3. **B6 — Browser reuse across batches:** Each batch spawns a new subprocess → new Chrome. Spec §3.9 Worker Lifecycle says "Kill browser, claim next batch, repeat" — implying browser reuse within a worker across batches. Current design wastes ~3s bootstrap per 25-permit batch.
* **Target Spec:** `docs/specs/38_inspection_scraping.md`
* **Key Files:**
  - `scripts/aic-orchestrator.py` (fixes A8)
  - `scripts/aic-scraper-nodriver.py` (fixes I1, B6)
  - `src/tests/inspections.logic.test.ts` (reproduction tests)

## Technical Implementation

### Fix 1: A8 — Real-time preflight abort
- Add a shared `asyncio.Event` (`abort_event`) that the orchestrator creates before spawning workers
- Pass the event to each `run_worker()` coroutine
- When a worker detects a preflight failure, it sets `abort_event`
- All workers check `abort_event.is_set()` at the top of each batch loop iteration
- Orchestrator also tracks preflight failure count; when count >= `MAX_PREFLIGHT_FAILURES`, it sets `abort_event`
- This requires `run_worker` to report preflight failures back to orchestrator in real-time (via a shared counter or callback)
- **Approach:** Use `asyncio.Event` + shared `preflight_failure_count` (an `int` protected by the GIL since all workers are coroutines in the same event loop, not threads)

### Fix 2: I1 — Per-worker proxy sticky sessions
- In `aic-scraper-nodriver.py`, when `PROXY_HOST` is set and `--worker-id` is provided:
  - Construct sticky session ID: `buildo-worker-{worker_id}-{timestamp}`
  - Pass as Decodo session parameter in proxy URL or header
- Rotate session ID every `SESSION_REFRESH_INTERVAL` permits (200)
- When `PROXY_HOST` is unset (default), no change — direct connection

### Fix 3: B6 — Browser reuse across batches
- Currently: orchestrator's `run_worker()` spawns a new subprocess per batch (each subprocess bootstraps a new Chrome)
- Fix: Change worker mode so the subprocess stays alive, reading batch files from stdin or a batch loop
- **Approach:** Instead of spawning a new subprocess per batch, the orchestrator writes ALL claimed year_seqs for a worker into one batch file, and the worker processes them in a single long-lived Chrome session. The worker claims batches itself via DB rather than the orchestrator claiming for it.
- This means: move the `claim_batch` → scrape → `complete_batch` loop INTO the worker subprocess, and the orchestrator just spawns + monitors.

* **New/Modified Components:** None
* **Data Hooks/Libs:** None
* **Database Impact:** NO

## Standards Compliance
* **Try-Catch Boundary:** N/A — no API routes
* **Unhappy Path Tests:** Preflight abort scenario, proxy session construction, long-lived worker batch loop
* **logError Mandate:** N/A — pipeline scripts
* **Mobile-First:** N/A — backend only

## Execution Plan
- [x] **Rollback Anchor:** `1e8eea1a`
- [x] **State Verification:** Reviewed orchestrator and scraper code. Confirmed all 3 gaps exist as described.
- [x] **Spec Review:** Read §3.9 — preflight abort, proxy sessions, and worker lifecycle all documented.
- [ ] **Reproduction:** Create failing tests for each gap.
- [ ] **Red Light:** Run tests, confirm they fail.
- [ ] **Fix:** Apply all 3 fixes.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass.
      Output visible execution summary using ✅/⬜ for every step above. → WF6.
