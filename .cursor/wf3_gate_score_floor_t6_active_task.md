# Active Task: WF3 — live `step-validate --all --fast` tests that pass without having looked
**Status:** Implementation (lane D4, 2026-10-14; uncommitted, staged by path)
**Domain Mode:** Backend/Pipeline (test infra only; no `src/` app code, no compute)
**Execution Provider:** claude — Spec 08 §B downgrade logged: operator directive 2026-10-14 ("use these tokens"); verification-adjacent test fix.

## Context
* **Goal:** a live test that shells `step-validate.mjs --all --fast` must FAIL when the run did not complete or printed fewer score rows than the converted fleet, never pass on an empty or partial stdout (Spec 124 §7 LM-D14, "green because it never looked").
* **Target Spec:** `docs/specs/01-pipeline/124_step_standard_policy.md` §5 R-BA (gates F, G, I), §7 rung ladder (LM-D14); 68/69: N/A.
* **Key Files:** `src/tests/gate-score-floor.infra.test.ts` (T6), `src/tests/gate-captures.infra.test.ts` (T6e), `src/tests/gate-registries.infra.test.ts` (T8b), new `src/tests/helpers/step-validate-run.ts`.

## Premise (measured, worktree Buildo-wt-scorefloor @ 2d7b0d84)
1. Direct `node scripts/analysis/step-validate.mjs --all --fast`: exit 0, **214 s**, 454 155 bytes stdout, **28** summary score lines (27 converted + 1 pending `load_coa_notices`).
2. The three live tests spawn it with `timeout: 180_000` (< 214 s measured). The summary is printed only at the END of the run.
3. Probe (same spawn, 30 s timeout): `status:null, signal:SIGTERM, error:ETIMEDOUT, stdout 137 bytes, parsed 0`. So a timed-out run yields 0 score lines (lane H's observation).
4. Score-floor T6 under vitest at one fork, tip: PASS in 122 s. With 0 parsed it FAILS (`expect(scores.length).toBeGreaterThan(0)`), but the message is "expected 0 > 0", which does not name the timeout. Its guard is also weak: 1 row passes, while 27 are owed.
5. **Second defect (the actual vacuous pass):** gate-captures T6e and gate-registries T8b assert only `expect(stdout).not.toMatch(/#NN:.*FAIL/)`. On a timed-out (empty) stdout they PASS without having looked.
6. Output format, env (CI/TTY/colour) and cwd: step-validate reads no CI/TTY/colour env (grep); the regex matches all 28 lines of the direct output. No format drift.

## Technical Implementation
* **New:** `src/tests/helpers/step-validate-run.ts`: pure `parseSummaryScores(stdout)` and `notLookedReasons(run, convertedCount)` → `[]` when the run completed (no spawn error, no signal, exit 0|1, a `summary:` header, ≥ convertedCount score rows); otherwise the reasons.
* **Modified:** the three live tests call `expect(notLookedReasons(run, converted)).toEqual([])` before their own assertion; spawn timeout 180 000 → 420 000 (measured 214 s direct run; operator 2026-10-14: 420 s for headroom under suite load). T6 uses the shared parser (replaces its inline regex loop + `> 0` guard).
* **Replaces:** the inline `> 0` guard (T6) and the absent guard (T6e, T8b). No gate, ledger, floor or step-validate change.
* **Database Impact:** NO.

## Standards Compliance
* Try-Catch Boundary / logError: N/A (tests only).
* Unhappy Path Tests: fixture runs (timeout, maxBuffer ENOBUFS, crash with no summary, partial rows) → reasons non-empty; a complete run → `[]`.
* UI Layout: N/A.

## Execution Plan
- [x] Step 1: Reproduce + measure (premise 1–6).
- [x] Step 2: RED: helper unit tests (T6c) written before the helper exists → red (import fails).
- [x] Step 3: Fix: helper + wire into T6 / T6e / T8b.
- [x] Step 4: GREEN: targeted vitest at one fork.
- [x] Step 5: Regression Guardian (git blame + fence per altered line).
