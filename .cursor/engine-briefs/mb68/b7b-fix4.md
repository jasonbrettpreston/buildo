---
write_scope:
- scripts/analysis/mcbylaws-loop/loop-gate-context.mjs
- src/tests/mcbylaws-loop-gate-context.logic.test.ts
---
# MB-68 B7b fix 4 - 2 of 8 context tests still fail - DeepSeek
Tools: `read_file`, `edit_file`, `grep_files`, `run_command` (`npx vitest run <path>`, `npx tsc --noEmit`). Never git add/commit. Small `edit_file` changes. Contract: `.cursor/engine-briefs/mb68/b7b-context.md`; module and test exist; `loop-gate-run.mjs` is finished: do not touch it.
Run `npx vitest run src/tests/mcbylaws-loop-gate-context.logic.test.ts`. Two failures remain, work them one at a time with a temporary `console.log` of the actual value, remove it afterwards:
1. `greenHistory from accepted records at the base, prevCases ...` (AssertionError expected true to be false, near line 478): `greenHistory` must contain ONLY the increments of records with `decision: 'accept'` that exist AT THE BASE (a record added after the base, or a revert, must not count). Decide whether the module reads the wrong revision or the fixture commits the records at the wrong point.
2. `buildContext -> evaluateGate (end to end) the honest round ...`: the honest ctx given to the real `evaluateGate` returns 8 violations, expected none. Print `verdict.violations`, then fix the fixture (the honest round needs a bound record whose `inputs` hold the blob ids of every changed bound path, a matching prereg (same `increment` and `round` as the record), a run whose cases equal the record cases, a valid binding via `bindRecord`) or the module if the ctx lacks a field that `loop-gate-eval.mjs` reads (compare the `ctx.*` names).
Finish when the whole file passes and `npx tsc --noEmit` prints no error naming mcbylaws-loop files. Report the final outputs.
