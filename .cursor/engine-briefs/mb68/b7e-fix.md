---
write_scope:
- scripts/analysis/mcbylaws-loop/loop-gate-run.mjs
- src/tests/mcbylaws-loop-gate-commands.logic.test.ts
---
# MB-68 B7e fix - make the three commands and their tests agree (first run used its 40 iterations) - DeepSeek
Tools: `read_file`, `edit_file`, `grep_files`, `run_command` (`npx vitest run <path>`, `npx tsc --noEmit`). Never git add/commit. Small `edit_file` changes only (both files are long); keep the already-passing tests and the old exports of `loop-gate-run.mjs` (expandHome, casesFromRows, runProducer, classTotals, pinMismatch, groupsForMode, computeRun; their tests are in `src/tests/mcbylaws-loop-gate-run.logic.test.ts` and must still pass).
Run `npx vitest run src/tests/mcbylaws-loop-gate-commands.logic.test.ts`: 7 tests fail. Read `.cursor/engine-briefs/mb68/b7e-commands.md` (the contract) and decide per failure whether the module or the test is wrong against that contract; fix the wrong side minimally. Known failures: write-ids message must say `unchanged` when the ids match the saved ones and name `mcbylaws/loop/data/ids-<group>.json` when it rewrites; `--write` must not touch `mcbylaws/loop/regression-set.json` unless ids changed; the status mapping (MATCH, ANSWERED, BY-LAW CHANGED, NOT SCORABLE, DATA -> pass; DIFFER, NO ANSWER, NOT MODELLED, OWED -> fail; a case named in an accepted finding -> accepted); `runCommand` called with a non-full run (mode other than push) returns `{ violations: ['run_needs_mode_push_or_full'] }`; verify output keys and `rounds_since_thresholds`.
Finish when the commands test, `src/tests/mcbylaws-loop-gate-run.logic.test.ts` and `npx tsc --noEmit` (no error naming mcbylaws-loop files) are all clean. Report the final outputs.
