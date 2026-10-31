---
write_scope:
- scripts/analysis/mcbylaws-loop/loop-gate-run.mjs
- scripts/analysis/mcbylaws-loop/loop-prereg.mjs
- scripts/analysis/mcbylaws-loop/loop-gate-context.mjs
- mcbylaws/loop/regression-set.json
- src/tests/mcbylaws-loop-gate-run.logic.test.ts
- src/tests/mcbylaws-loop-prereg.logic.test.ts
- src/tests/mcbylaws-loop-gate-context.logic.test.ts
- src/tests/mcbylaws-loop-gate-e2e.logic.test.ts
---
# MB-68 O4 (O68-03, O68-04, O68-05) - floors per group, totals per group, prereg join - DeepSeek
Tools: `read_file`, `edit_file`, `grep_files`, `run_command` (`npx vitest run <path>`, `npx tsc --noEmit`). Never git add/commit. Small `edit_file` changes; no console.log left. Work item by item and run the touched tests after each.
1. **O68-03 a group with no floors file is red forever.** A group's `producer.floors` is either a path or the string `"none"`. In `loop-gate-run.mjs` `floorsOf`: `"none"` means this group has no percent floors (skip percent-floor evaluation for the group entirely, no per-article rule, `violations: []`, `owed: []`); an UNSET `floors` throws `Error('producer_floors_unset: <group>')` (exit 2 upstream: a group must say). Set `mcbylaws/loop/regression-set.json` group `coa4d` producer `"floors": "none"` (edit only that one line, do not touch ids or hashes). In `src/tests/mcbylaws-loop-gate-e2e.logic.test.ts` the test that asserts coa4d is red (about line 208) must be REPLACED by one asserting the real 172+4d run has `floorsOk` true and exactly one OWED line `article 10.5.40 accuracy`; a test never asserts a red floor (M-360).
2. **O68-04 prereg totals compare the wrong population.** In `loop-gate-run.mjs` `computeRun`, `curRows` keep their group; in `loop-prereg.mjs` `checkPreregMoves(pre, baseRows, curRows)` compares totals for ONLY the group the prereg names: `pre.group` (a string; default `'coa172'`), i.e. filter `curRows` (and `baseRows`) by `group` first. Add `group` to what `checkPreregFile` accepts (optional string). When `baseRows` is null, moves are not checked but `evaluateGate` must add the NOTE `prereg moves not checked: no base rows` instead of silently passing (check how `loop-gate-eval.mjs` calls it; it is NOT in your scope: expose the note by returning it from `checkPreregMoves` through a new exported `preregNotes(pre, baseRows)` and tell me in the report that `loop-gate-eval.mjs` must call it). Context: stop forcing `run.baseRows = null` when `deps.computeRun` already supplied base rows.
3. **O68-05 prereg lookup.** In `loop-gate-context.mjs` find the round's prereg by FILE NAME `prereg-MB-<digits>-<round>.json` (round = the record's `round`) at `rev`, and require `prereg.increment === record.increment`; `checkPreregFile` (loop-prereg.mjs) additionally requires `increment` to be a string (violation `prereg_shape:increment must be a string`). The old `prereg.round === record.round` join is removed (the prereg's `round` is the CoA batch counter, not the loop round).
Update old tests that encode the old behaviour and say which in your report. Finish when the touched test files pass, `npx vitest run src/tests/mcbylaws-loop` has no failure in your files, and `npx tsc --noEmit` prints no error naming mcbylaws-loop files.
