# Active Task: WF3 — sweep live child-process tests that can pass without having looked
**Status:** Implementation (lane D4 sweep, 2026-10-14; UNSTAGED, saved as `scratchpad/d4/wf3-spawn-sweep.patch`; applies after the staged T6 WF3)
**Domain Mode:** Backend/Pipeline (test infra only)
**Execution Provider:** claude — Spec 08 §B downgrade logged (operator directive 2026-10-14).

## Context
* **Goal:** every live spawn of `step-validate.mjs` (or another long child process) in `src/tests` asserts that the run completed before it asserts on output (Spec 124 §7 LM-D14).
* **Target Spec:** `docs/specs/01-pipeline/124_step_standard_policy.md` §7 (LM-D14), §5 R-BA (gate V), item 9 programme registry; 68/69: N/A.
* **Depends on:** `src/tests/helpers/step-validate-run.ts` (`notLookedReasons`, from the T6 WF3).

## Sweep (measured: grep of every spawnSync/execFileSync/execSync of `scripts/analysis/*` in `src/tests`, excluding `src/tests/db/`)
| Site | Assertions | Vacuous on empty/killed output? |
|---|---|---|
| programme-backlog "RED-proof (EP-D13-adjacent, P9)" | `threw === true` + `not.toMatch(#9 informational)` | **YES**. Probe, 5 s timeout: threw, status null, SIGTERM, 0 bytes, test passes. Real run: exit 1, 16 050 bytes, #9 line present, 1 score row. |
| gate-five-words T5 / T5b (`--all --fast`, memo) | `blocks > 0` / `summaryLines > 0` | No (fails on empty), but the bound is weak (1 of 27 passes) and the 180 s timeout < the 214 s measured run, so it went red without naming the timeout |
| gate-captures T6e, gate-registries T8b, score-floor T6 | fixed in the T6 WF3 (staged) | YES / YES / no |
| gate-matrix-statuses T4, gates-from-one, step-conformance (all `--step` / `--self-test-only`), programme-backlog other cases, chain-args-generated `--check` | positive match, `status` 0, or a `> 0` count | No |
| `src/tests/db/*` halt tests | not run (test:db forbidden for lanes) | not assessed |
| deepseek-exec-fences:942 "never prints the downgrade line" | `stderr not.toContain` only, no status check | Yes in shape, but short-lived and not a step-validate run. Out of this sweep, raised as a question. |

## Fix
* programme-backlog RED-proof: build a `StepValidateRun` from the success value or the thrown error. Assert `notLookedReasons(run, 1)` equals `[]`, plus a positive `#9: unmet cutover_prereq … compute_centroids` match. Replaces the negative-only proof.
* gate-five-words T5/T5b: `notLookedReasons(run, converted.length)` equals `[]`; the block bound becomes `>= converted.length` (28 blocks measured); timeout 180 s → 420 s (operator 2026-10-14).

## Execution Plan
- [x] Premise per site (probe `scratchpad/d4/redproof-probe.mjs`).
- [x] RED: temporary mutant in vitest. The old body PASSES on a 5 s-killed run; the new body FAILS (`spawn error ETIMEDOUT, killed by SIGTERM, exit null, no summary header, 0 score rows < 1 converted`). Mutant deleted.
- [x] GREEN: programme-backlog "programme section" 10/10; five-words T5/T5b 2/2.
- [x] Regression Guardian.
