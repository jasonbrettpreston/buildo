# Active Task: Fix chain gate abort marking chains as failed
**Status:** Implementation

## Context
* **Goal:** Fix two bugs in `scripts/run-chain.js`: (1) Gate abort (0 new records = stale data) incorrectly marks chain as `failed` instead of `completed`. (2) Chain error_message conflates assert_schema stdout warnings with gate abort message.
* **Target Spec:** `docs/specs/28_data_quality_dashboard.md`
* **Key Files:**
  - `scripts/run-chain.js` — gate abort logic (lines 250-258, 291-294)
  - `src/tests/chain.logic.test.ts` — chain behavior tests

## Technical Implementation

### Bug 1: Gate abort should not mark chain as `failed`
**Current:** When gate step returns `records_new=0, records_updated=0`, code sets `failedStep = slug` and breaks. At line 293, `failedStep` truthy → `chainStatus = 'failed'`, `process.exit(1)`.

**Fix:** Introduce a `gateSkipped` flag separate from `failedStep`. When the gate fires, set `gateSkipped = true` (not `failedStep`). At chain finalization:
- `wasCancelled` → status `cancelled`
- `failedStep` → status `failed` (real script crash)
- `gateSkipped` → status `completed` with error_message noting "0 new records — downstream steps skipped"
- No `process.exit(1)` for gate skips

### Bug 2: Chain error_message includes unrelated assert_schema stdout
**Current:** The `error_message` for `chain_coa` contains `FAIL: CoA Active is missing columns: APPLICATION_DATE, STATUS` which leaked from assert_schema stdout into the chain's error field.

**Root cause:** The chain error_message at line 294 is `Stopped at step: ${failedStep}`. But the API response's `error_message` for the chain includes the step stdout from assert_schema. This is because the step's stdout is piped to process.stdout (line 196), and assert_schema's warning goes to stderr. Need to verify — the error_message field in the DB is set per-step and per-chain independently. The chain row should only have "Stopped at step: coa", not the assert_schema output.

**Investigation needed:** Check if the error_message leakage is from the stats API returning the wrong row, or from the chain update query.

## Standards Compliance
* **Try-Catch Boundary:** N/A — no API routes.
* **Unhappy Path Tests:** N/A — no API routes.
* **logError Mandate:** N/A — no API routes.
* **Mobile-First:** N/A — backend-only fix.

## Execution Plan
- [ ] **Rollback Anchor:** Git commit `689be2d`
- [ ] **State Verification:** Confirmed via WF5: `chain_coa` shows `failed` with `error_message` containing assert_schema stdout despite all 6 steps completing.
- [ ] **Spec Review:** Spec 28 §3 documents pipeline chain orchestrator with gate mechanism.
- [ ] **Reproduction:** Add test asserting gate abort produces `completed` status (not `failed`).
- [ ] **Red Light:** New test must fail against current code.
- [ ] **Fix:** Modify `run-chain.js` gate logic: separate `gateSkipped` from `failedStep`, use `completed` status for gate skips.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6.
