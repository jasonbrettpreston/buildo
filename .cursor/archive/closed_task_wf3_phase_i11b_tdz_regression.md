# Active Task: WF3 — fix Phase I.1.1b TDZ regression in classify-lifecycle-phase.js
**Status:** Implementation (v2 — Independent reviewer ESCALATE folded: line numbers corrected 1186-1187→1176-1177; test file changed to `classify-lifecycle-phase.lifecycle-status-history.infra.test.ts` with explicit indexOf assertion)
**Workflow:** WF3 — per-finding fix from Spec 79 SUMMARY.md (B-fix-now-1; user authorized 2026-05-19)
**Domain Mode:** Backend/Pipeline

---

## Context

* **Goal:** Fix the temporal dead zone (TDZ) ReferenceError in `scripts/classify-lifecycle-phase.js` that crashes the permit-side flushPermitBatch whenever the SAVEPOINT catch path fires.
* **Surfaced by:** Spec 79 pipeline validation Step 21 (2026-05-19 run on `auto-unblock/validation-2026-05-19` branch). Validation record: `docs/reports/pipeline-validation/permits/step_21_classify_lifecycle_phase.md` (on validation branch).
* **Target Spec:** `docs/specs/01-pipeline/84_lifecycle_phase_engine.md` §3.7 (Phase I.1.1b matchedStatus contract). Regression introduced in commit `73b257b`.

## Reproduction

Step 21 validation run captured:
```
ReferenceError: Cannot access 'lifecycleStatusHistoryErrors' before initialization
  at scripts/classify-lifecycle-phase.js:1019:11
  at flushPermitBatch (line 928)
```
Exit code 1 in 4.4 seconds. Crashes deterministically on first permit-side batch that hits the SAVEPOINT catch path.

## Root cause

Phase I.1.1b (commit `73b257b`) introduced two counter accumulators:
```js
let lifecycleStatusHistoryInserted = 0;  // line 1176 (corrected from earlier draft 1186)
let lifecycleStatusHistoryErrors = 0;    // line 1177 (corrected from earlier draft 1187)
```
These are declared **inside the CoA-side section** of the script (line 1176-1177; positioned between `coaPhaseTransitionsCount` at line 1173 and `coaStalledCount` at line 1178 — NOT immediately after coaPhaseTransitionsCount), but they are referenced from `flushPermitBatch` at line 1019 in the SAVEPOINT catch:
```js
} catch (ledgerErr) {
  ...
  lifecycleStatusHistoryErrors++;  // line 1019 — TDZ
}
```

`flushPermitBatch` is called from the permits streaming loop which executes BEFORE the CoA section runs. The `let` declarations are hoisted but not yet initialized → temporal dead zone → ReferenceError.

The happy-path execution worked because the other counters (`permitsUpdated`, `transitionsLogged`) are declared earlier (line 854-856). The TDZ only fires when the catch path is entered.

## Why this wasn't caught in tests

- `lifecycle-status-history-writers.db.test.ts` SAVEPOINT-path test (BEFORE INSERT trigger fault injection) is `describe.skip` pending CKAN fixture work from Phase I.1.1a
- Other unit tests don't exercise the catch path
- The TDZ only manifests on the ledger-write-failed branch, which is rare in normal runs

## Proposed fix

Move the two `let` declarations from line 1186-1187 to right after the permit-side counters (line 866). Net +4 LOC after accounting for comment expansion.

**Before** (current location, line 1173-1178):
```js
let coaPhaseTransitionsCount = 0;     // line 1173 — STAYS HERE
// Phase I.1: classifier-side lifecycle_status_history ledger counters (both streams).
// Tracked at script scope so flushPermitBatch + flushCoaBatch share them.
let lifecycleStatusHistoryInserted = 0;  // line 1176 — MOVE
let lifecycleStatusHistoryErrors = 0;    // line 1177 — MOVE
let coaStalledCount = 0;              // line 1178 — STAYS HERE
```
**After**: declarations moved to line ~866 (alongside other permit-side `let` counters); CoA section gets a removed-and-pointer comment. `coaPhaseTransitionsCount` and `coaStalledCount` remain in the CoA section unchanged.

## Test plan (v2 — Independent reviewer fold)

Add a regression-lock test to `src/tests/classify-lifecycle-phase.lifecycle-status-history.infra.test.ts` (NOT `classify-lifecycle-phase.infra.test.ts` — the lifecycle-status-history-specific file is the natural home for Phase I.1.x shape contracts):

```js
it('lifecycleStatusHistoryErrors is declared before flushPermitBatch (TDZ regression-lock)', () => {
  const src = readFileSync('scripts/classify-lifecycle-phase.js', 'utf-8');
  const declIdx = src.indexOf('let lifecycleStatusHistoryErrors');
  const flushIdx = src.indexOf('const flushPermitBatch');
  expect(declIdx).toBeGreaterThan(-1);
  expect(flushIdx).toBeGreaterThan(-1);
  expect(declIdx).toBeLessThan(flushIdx);  // TDZ-safe ordering
});
```

Same pattern for `lifecycleStatusHistoryInserted`. This locks in source-order so the regression can't recur via accidental refactor.

## Standards Compliance

* **Try-Catch Boundary:** N/A (script, not route)
* **Unhappy Path Tests:** the SAVEPOINT catch path test in `lifecycle-status-history-writers.db.test.ts` is the canonical regression-lock; currently `describe.skip` — re-enabling is out of scope for this WF3
* **logError Mandate:** unchanged (existing `pipeline.log.warn` in catch path)
* **IS DISTINCT FROM:** N/A
* **Idempotency:** preserved (no logic change)

## Execution Plan (WF3 — `.claude/workflows.md`)

- [ ] **Spec Touchpoint:** Spec 84 §3.7 Phase I.1.1b contract validated (matchedStatus extension preserved)
- [ ] **Reproduction / Verification:** confirmed via Step 21 validation record + direct script invocation
- [ ] **Test First:** add two regression-lock tests to `src/tests/classify-lifecycle-phase.lifecycle-status-history.infra.test.ts` using `src.indexOf('let lifecycleStatusHistoryErrors') < src.indexOf('const flushPermitBatch')` ordering assertion (per Independent reviewer fold). Locks in TDZ-safe source order.
- [ ] **Red Light:** new regression tests fail against pre-fix code (declarations at line 1176-1177, after flushPermitBatch at line 890)
- [ ] **Implementation:** move 2 `let` declarations from line 1186-1187 to line ~866 (after permit-side counters); add anchor comment in CoA section
- [ ] **Multi-Agent Review:** per `[[feedback_review_protocol]]` — Independent code-reviewer ONLY (WF3 default; no adversarial unless requested)
- [ ] **Green Light:** `npm run test && npm run typecheck && npm run lint -- --fix`
- [ ] **WF6 close-out:** single commit; archive task

## Operating Boundaries

* **Target files:** `scripts/classify-lifecycle-phase.js`
* **Out-of-scope:**
  - Re-enabling `describe.skip` SAVEPOINT test (separate WF — needs CKAN fixtures)
  - Other Phase I.1.1b post-validation findings (each gets its own WF3)
  - Bug 2 (`ca.permit_type` SQL) — separate WF3
