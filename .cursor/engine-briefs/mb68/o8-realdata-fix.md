---
write_scope:
- src/tests/mcbylaws-loop-realdata.logic.test.ts
- scripts/analysis/mcbylaws-loop/loop-gate-context.mjs
- src/tests/mcbylaws-loop-gate-context.logic.test.ts
---
# MB-68 O8 - make the real-data test assert what the real CLI does; add the deleted-path rule (DeepSeek)
Tools: read_file, edit_file, grep_files, run_command (npx vitest run, npx tsc --noEmit). Never git add/commit (the test commits inside its own throw-away clone only). Small edit_file changes; no console.log left. Do not weaken an assertion about exit status or FAIL codes; fix the SETUP. Real behaviour was verified by hand: honest round green (step 1 passes now). Diagnoses for the failing steps of `src/tests/mcbylaws-loop-realdata.logic.test.ts` (read its brief `.cursor/engine-briefs/mb68/o5-realdata.md`):
- Every `it` must start from a clean clone state: `git reset -q --hard HEAD` and `git clean -fdq` (leftovers from a previous step caused false results).
- Step 2 "stale": a code change AFTER the record was written. Do: stage a first comment line in `assembly.mjs`, run `run --write ...` (a new record is written; `git add` it), THEN append a second comment line and `git add` it: `gate(['--mode','commit'])` gives status 1 and `stale_green`. (A code change with no record at all is `record_missing`, which is also correct: assert that in a separate small `it`.)
- Step 3 "forged case": `--mode push` reads COMMITTED state, not the index: after editing and re-binding the record, COMMIT it in the clone (with the code edit), then `gate(['--mode','push','--base',<sha before that commit>])` gives status 1 and `record_differs_from_run`.
- Step 5 metadata alone: assert status 0 only (no 'out of scope' text is printed; the scorer verdict is). Beside the code edit: status 1 + `record_missing`.
- Step 6 prereg-only add: assert status 0 and stdout contains `out of scope` (run it from a clean state).
- Step 7 floors: do not assert a path in stdout of `run --write` (rounds are numbered by the tool); assert the status of the commit-mode check (1) and `floor_fell`.
- Step 4 and step 1 already pass; keep them.
2. **O68-06 deleted bound paths.** In `loop-gate-context.mjs`, `changedBound` must exclude paths that are DELETED (name-status `D`) and the old side of a rename, so an honest deletion of a bound file with a fresh record is not `input_not_bound`; `recordMissing` still sees the deletion. Test in the context test file: a repo where a bound code file is deleted with a new record gives `changedBound` without it and `evaluateGate` (the real one, as the existing end-to-end test does) has no `input_not_bound`.
Finish when `npx vitest run src/tests/mcbylaws-loop-realdata.logic.test.ts` (takes about 2 minutes; set the per-test timeout generously) and the context test pass and tsc is clean for mcbylaws-loop files. Report the outputs.
