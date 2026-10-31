---
write_scope:
- scripts/analysis/mcbylaws-loop/loop-floors.mjs
- src/tests/mcbylaws-loop-floors.logic.test.ts
---
# MB-68 B3 fix - loop-floors tests: three wrong expected lists (the first run ran out of iterations) - DeepSeek
Tools: `read_file`, `edit_file`/`write_file`, `run_command` (only `npx vitest run <path>`). Never git add/commit. Small `edit_file` changes only (file is over 200 lines).
Run `npx vitest run src/tests/mcbylaws-loop-floors.logic.test.ts` first: 3 tests in `describe('checkPercentFloors ...')` fail. The MODULE is right: it calls the real `reportFloors` of `coa-round.mjs`, which reports EVERY floor line (`overall accuracy`, `overall answered`, `article X accuracy`, `article X answered`, and pooled) that falls, in that order; the tests expected only some of them. Fix the three tests' expected values so each asserts what the real report produces for that fixture (print `r.violations` with a throwaway `console.log` while fixing, then remove it), while keeping each test's intent: the OWED line (named by a RULED register row) appears in `owed` and NOT in `violations`; with an empty register the same line is a violation; a run above every floor is green. Do not change the module unless the module disagrees with the contract in the `describe` titles. Re-run until all pass; report the final vitest output.
