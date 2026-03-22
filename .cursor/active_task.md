# Active Task: Fix Pipeline Trigger Hang + Add Chain Force-Recovery
**Status:** Implementation
**Workflow:** WF3 — Bug Fix (dual)

## Context
* **Goal:** Fix two pipeline system bugs:
  - **Bug 1 (Tier 3 Trigger):** API-triggered pipeline steps (`POST /api/admin/pipelines/[slug]`) hang indefinitely on Windows. `execFile` causes `pool.connect()` to block because stdin is piped (not inherited). Scripts complete in <1s from CLI but timeout at 600s via API.
  - **Bug 2 (Gate Recovery):** If a chain crashes mid-run, re-running the chain skips all downstream steps because the gate step reports 0 new records (data already loaded). No `--force` flag exists to bypass gate-skip for recovery.
* **Target Spec:** `docs/specs/37_pipeline_system.md`
* **Key Files:**
  - `src/app/api/admin/pipelines/[slug]/route.ts` — API route using `execFile` (Bug 1)
  - `scripts/run-chain.js` — Chain orchestrator with gate-skip logic (Bug 2)

## Technical Implementation

### Bug 1: Replace `execFile` with `spawn` in API route
* **Root Cause:** `execFile` sets stdin to `pipe` mode. On Windows, the pg library's `pool.connect()` blocks when stdin is a pipe with no data. `spawn` with `stdio: ['ignore', 'pipe', 'pipe']` fixes this by closing stdin.
* **Fix:** Replace `execFile(...)` call with `spawn(...)` + manual stdout/stderr buffering + timeout handling. Match the pattern used by `run-chain.js` (which uses spawn and works).
* **Affected:** `src/app/api/admin/pipelines/[slug]/route.ts` — the `POST` handler's script spawning logic.

### Bug 2: Add `--force` flag to chain orchestrator
* **Root Cause:** `run-chain.js` line 291-294 sets `gateSkipped = true` when the gate step reports 0 new + 0 updated. No mechanism to override this.
* **Fix:** Accept `--force` CLI arg (passed via API when user holds shift or adds `?force=true`). When `--force` is set, skip the gate-skip logic entirely. Update API route to forward the force flag.
* **Affected:** `scripts/run-chain.js` (gate logic), `src/app/api/admin/pipelines/[slug]/route.ts` (pass --force arg).

### Database Impact: NO

## Standards Compliance
* **Try-Catch Boundary:** API route already has overarching try-catch — no change needed.
* **Unhappy Path Tests:** Add test for spawn failure handling. Existing API tests cover 400/500.
* **logError Mandate:** Already using `logError` in catch blocks — no change needed.
* **Mobile-First:** N/A (backend only)

## Execution Plan
- [ ] **Rollback Anchor:** `326bb84`
- [ ] **State Verification:** Confirmed `execFile` hangs with `pool.connect()` on Windows; `spawn` with `stdio: ['ignore', 'pipe', 'pipe']` works. Confirmed gate-skip has no override.
- [ ] **Spec Review:** `docs/specs/37_pipeline_system.md` — SDK contract, chain orchestration model.
- [ ] **Reproduction:** `execFile` test shows 15s timeout with only 3 stdout lines. `spawn` via run-chain.js completes in 0.2s.
- [ ] **Red Light:** N/A — this is a runtime behavior bug, not testable in vitest without spawning real PG.
- [ ] **Fix Bug 1:** Replace `execFile` with `spawn` in API route, buffer stdout/stderr manually, handle timeout via `setTimeout` + `child.kill()`.
- [ ] **Fix Bug 2:** Add `--force` arg parsing in `run-chain.js`, skip gate-skip when set. Update API to pass `--force` when `?force=true` query param is present.
- [ ] **Verify Bug 1:** Trigger `builders` via API curl — must complete in <5s (not 600s timeout).
- [ ] **Verify Bug 2:** Run `node scripts/run-chain.js permits --force` — all 16 steps must execute (no gate-skip).
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6.
