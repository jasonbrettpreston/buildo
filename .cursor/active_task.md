# Active Task: WF3 — Remove Per-Step Bloat Gate + Fix Visibility
**Status:** Planning
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `98fdea2`

## Context
* **Goal:** Remove the per-step bloat gate (which falsely aborts after normal upserts) and make Phase 0 pre-flight the sole bloat defense. Add pipeline_runs row creation when Phase 0 detects pre-existing bloat.
* **Target Spec:** `docs/specs/pipeline/30_pipeline_architecture.md` §4.1
* **Key Files:** `scripts/run-chain.js`, `src/tests/chain.logic.test.ts`, `src/tests/pipeline-sdk.logic.test.ts`, `docs/specs/pipeline/30_pipeline_architecture.md`, `docs/specs/pipeline/40_pipeline_system.md`

## Bug
**Reproduction:** `node scripts/run-chain.js permits` → chain aborts at step 3.
**Root Cause:** Step 2 upserts 237K+ rows → 99.8% dead ratio (normal MVCC behavior) → per-step bloat gate aborts. Any ABORT threshold < 99.9% would still block this.
**Additionally:** When the gate aborted, no pipeline_runs row was created for the blocked step — the failure was invisible on the dashboard.

## Technical Implementation

### Change 1: Remove per-step bloat gate from the step loop
Delete the entire per-step bloat gate block (lines ~180-210 in run-chain.js). The Phase 0 pre-flight check already catches "autovacuum stalled" scenarios by checking bloat BEFORE any steps run.

**Why this is safe:** If the DB was healthy at chain start (Phase 0 PASS), intra-chain bloat is expected and temporary. Autovacuum handles it between runs.

### Change 2: Phase 0 pre-flight becomes the sole defense
Keep Phase 0 unchanged — it checks all chain tables before step 1. Raise thresholds slightly:
- WARN: 0.20 → 0.30 (30% pre-chain bloat = autovacuum is falling behind)
- ABORT: 0.50 → 0.50 (50% pre-chain bloat = autovacuum stalled, genuine crisis)

50% ABORT is appropriate for Phase 0 because this is checked BEFORE any steps run — there's no upsert explanation for high bloat at chain start.

### Change 3: Phase 0 ABORT creates pipeline_runs row with FAIL audit_table
When Phase 0 detects ABORT-level bloat:
1. Insert chain row with `status: 'failed'`, `error_message: 'Pre-flight bloat gate abort'`
2. Include `records_meta.pre_flight_audit` with FAIL verdict and `sys_db_bloat_*` metrics
3. Dashboard shows red indicator with bloat drill-down

### Change 4: Update tests
- Remove per-step bloat gate source assertions
- Update threshold logic tests for new values
- Add test: Phase 0 abort writes chain row with error

### Change 5: Update specs
- `30_pipeline_architecture.md` §4.1: Document Phase 0 as sole defense, remove per-step language
- `40_pipeline_system.md` §3.1 step 4d: Remove per-step bloat gate step

## Standards Compliance
* **Try-Catch Boundary:** N/A — orchestrator logic
* **Unhappy Path Tests:** Phase 0 ABORT creates visible chain row
* **logError Mandate:** N/A
* **Mobile-First:** N/A

## Execution Plan
- [ ] **Rollback Anchor:** `98fdea2`
- [ ] **State Verification:** pipeline_runs row 1626 confirms per-step abort
- [ ] **Reproduction:** Confirmed via production run (99.8% dead ratio)
- [ ] **Red Light:** Tests for removed per-step gate, updated thresholds
- [ ] **Fix:**
  - [ ] Remove per-step bloat gate from run-chain.js step loop
  - [ ] Update Phase 0 thresholds (WARN 0.30, ABORT 0.50)
  - [ ] Add Phase 0 ABORT → chain pipeline_runs row with FAIL audit_table
  - [ ] Update tests
  - [ ] Update specs
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass.
