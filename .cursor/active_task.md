# Active Task: Fix API route chain row overwrite + stale run cleanup
**Status:** Implementation

## Context
* **Goal:** Fix three related bugs in the pipeline trigger API: (B2) API callback overwrites chain rows that `run-chain.js` already manages, replacing clean error_message with raw stderr. (B9) When API timeout kills a chain, the callback fails to update the DB — row stuck as `running` forever. (B10) No periodic cleanup for orphaned `running` rows where the process is dead.
* **Target Spec:** `docs/specs/28_data_quality_dashboard.md`
* **Key Files:**
  - `src/app/api/admin/pipelines/[slug]/route.ts` — execFile callback (lines 131-177), timeout (line 129)
  - `scripts/run-chain.js` — chain self-manages its own row
  - `src/tests/chain.logic.test.ts` — chain behavior tests

## Technical Implementation

### Bug B2: API route overwrites chain rows
**Current:** The execFile callback (line 135) ALWAYS fires after the chain process exits and runs `UPDATE pipeline_runs SET status=$1, error_message=$3 WHERE id=$4`. For chains, `run-chain.js` already updates the same row at lines 297-302 with correct status and a clean error_message. The API callback then overwrites it — replacing "Stopped at step: X" with raw stderr content (assert_schema FAIL messages, JSON log entries).

**Fix:** For chain slugs (`isChain === true`), the callback should NOT overwrite `status` or `error_message` — the chain script owns those fields. The callback should only log errors. For non-chain individual pipelines, the callback continues to work as-is (those scripts don't manage their own tracking row).

### Bug B9: Timeout kills chain, DB stuck as `running`
**Current:** API route sets `timeout: 3_600_000` (1 hour) for chains. When the timeout fires, Node kills the child process. The callback should fire with `err` and update the row to `failed`. But `child.unref()` (line 184) combined with Next.js HMR causes the async callback to lose its DB connection context — the UPDATE never executes. Result: row permanently stuck as `running`.

**Fix:** For chains, since `run-chain.js` manages its own row, the API callback doesn't need to update status. But for the timeout case specifically, `run-chain.js` never gets to its finalization code (it's killed). So we need a safety net: a stale-run sweep that detects orphaned rows.

### Bug B10: No stale-run cleanup
**Current:** Only cleanup is force-cancel on new run for same slug (lines 94-104). No periodic detection of dead processes.

**Fix:** Add a stale-run check at the START of every chain/pipeline trigger. Before starting a new run, check for any `running` rows older than the timeout threshold and mark them as `failed` with error_message "Process timed out — cleaned up on next run".

## Standards Compliance
* **Try-Catch Boundary:** Existing try-catch in API route at line 121. No new routes.
* **Unhappy Path Tests:** Test that chain callback skips status overwrite. Test that stale run cleanup fires.
* **logError Mandate:** Existing logError calls. Will add logError to empty catch at line 102 (B6).
* **Mobile-First:** N/A — backend-only fix.

## Execution Plan
- [ ] **Rollback Anchor:** Git commit `861b6b4`
- [ ] **State Verification:** Confirmed via WF5: chain_permits row 458 stuck as `running` with dead process. chain_coa error_message was overwritten by stderr content.
- [ ] **Spec Review:** Spec 28 §3 documents pipeline chain orchestrator. API route is the trigger mechanism.
- [ ] **Reproduction:** Add tests: (1) chain callback should not overwrite status/error_message for chain slugs, (2) stale run cleanup marks old `running` rows as failed.
- [ ] **Red Light:** New tests must fail against current code.
- [ ] **Fix:** Modify `route.ts`: skip chain row overwrite in callback for chain slugs; add stale-run cleanup before each trigger; fix empty catch at line 102.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6.
