---
write_scope:
- scripts/analysis/mcbylaws-loop/loop-gate-context.mjs
- scripts/analysis/mcbylaws-loop/loop-gate-eval.mjs
- scripts/analysis/mcbylaws-loop/loop-decide.mjs
- scripts/analysis/mcbylaws-loop/loop-gate.mjs
- src/tests/mcbylaws-loop-gate-context.logic.test.ts
- src/tests/mcbylaws-loop-gate-eval.logic.test.ts
- src/tests/mcbylaws-loop-decide.logic.test.ts
- src/tests/mcbylaws-loop-gate.logic.test.ts
---
# MB-68 O10 (output panel O68-12, O68-15, O68-22, O68-11 code side) - DeepSeek
Tools: read_file, edit_file, grep_files, run_command (npx vitest run, npx tsc --noEmit). Never git add/commit. Small edit_file changes; no console.log left. One fix plus its red and green test each, run the touched tests after each. Update old assertions that encode the old behaviour and name them in your report.
1. **O68-15 malformed new record dropped.** In `loop-gate-context.mjs` `listRecords` keep an unparsable record path with `rec: null`; `evaluateGate` emits `record_unparsable:<path>` for it and returns (a malformed record can never fall back to the previous round). Test: a new `round-02.json` containing `{ not json` beside a code edit gives `record_unparsable`.
2. **O68-22 merge commits.** `perCommitNameStatus` (loop-gate.mjs) drops `--no-merges` for the ORACLE-FIRST input: keep the per-commit lists as they are, but make the context append the whole range name-status (`rangeNameStatus`) as one extra list to `commits` so a hand-oracle edit made only in a merge's conflict resolution is seen by `checkOracleFirst`. Test on a throw-away repo with a merge commit whose resolution modifies an oracle file beside a code file in the range: `oracle_moved_with_code`.
3. **O68-12 accepted finding bound to nothing.** In `checkDecision` (loop-decide.mjs): an accepted finding's `case` must be one of the record's `cases` ids (else `finding_case_unknown:<case>`); a case with status `accepted` must have been `fail` in the fresh run (`evaluateGate` stageRun: `accepted_case_was_not_failing:<id>`). Tests red and green.
4. **O68-11 OWED baseline, code side.** In `loop-gate-context.mjs` read `baselineOwed` from the BASE side count-floors file (`countBase`'s `owed_baseline`), never from the current file; if the base has none, `{}`. In `loop-floors.mjs` is NOT in scope: say in your report that `flattenFloors` must include `owed_baseline` keys so an edit needs a ruling (the next brief does it). Test: a current file that raises its own baseline does not change the ratchet.
Finish when the four test files plus `npx vitest run src/tests/mcbylaws-loop` pass and tsc is clean for mcbylaws-loop files.
