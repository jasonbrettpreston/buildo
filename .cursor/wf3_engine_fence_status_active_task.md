# Active Task: WF3 — engine fence "never prints the downgrade line" passes on a crashed CLI
**Status:** Implementation (lane D4, 2026-10-14; UNSTAGED, saved as `scratchpad/d4/wf3-engine-fence-status.patch`, applies after `wf3-spawn-sweep.patch`)
**Domain Mode:** Backend/Pipeline (test infra only)
**Execution Provider:** claude — Spec 08 §B downgrade logged (operator directive 2026-10-14). No engine API call: transcript client, `scrubbedChildEnv()` (no DEEPSEEK_API_KEY).

## Context
* **Goal:** `src/tests/deepseek-exec-fences.infra.test.ts` "a normal deepseek run … never prints the downgrade line" must prove the CLI ran before it asserts an absence (Spec 124 §7 LM-D14; Spec 08 §C F14). 68/69: N/A.

## Premise (measured with a temporary vitest mutant, since deleted)
* Real run: exit 0, signal null, last stdout line = summary JSON `{"status":"completed",…}`, stderr empty.
* The CLI path replaced by a nonexistent script (crash): the OLD body (`stderr not.toContain` only) PASSES. The NEW body FAILS (`status` 1 ≠ 0).

## Fix
* Add `expect(result.status).toBe(0)` + `summary.status === 'completed'` (a downgrade reports `delegated_to_claude`), before the existing absence check. Replaces the absence-only proof.

## Execution Plan
- [x] Premise + RED (mutant): old passes, new fails on a crashed CLI.
- [x] GREEN: the F14 describe, 2/2, one fork.
