---
write_scope:
- scripts/analysis/mcbylaws-loop/loop-regression.mjs
- src/tests/mcbylaws-loop-regression.logic.test.ts
---
# MB-68 B2 fix - loop-regression: make module and test agree (the first run ran out of iterations) - DeepSeek
Tools: `read_file`, `edit_file`/`write_file`, `run_command` (only `npx vitest run <path>`). Never git add/commit. No `process.env`. Files edited keep to small `edit_file` changes (the files are over 200 lines: do NOT rewrite them whole).
Run `npx vitest run src/tests/mcbylaws-loop-regression.logic.test.ts` first: 9 tests fail. Read the module and the test. The agreed rule for `checkRegression(base, cur, rulings)` per group is:
1. every base active id absent from the same cur group -> `regression_case_removed:<group>|<id>` (including one moved to pending), unless excused by a NEW `cur.removals` entry (beyond `base.removals.length`) whose `ruling` is authority (RATIFIED/RULED in the `rulings` Map);
2. `regression_count_fell:<group>` ONLY when `cur ids count < base ids count - (number of excused ids of that group)`; so a plain unexcused drop reports BOTH `regression_case_removed` and `regression_count_fell`, an excused drop reports neither, and an unauthorised removal entry reports `ruling_not_authority:<ruling>` plus the removed and count-fell codes;
3. a new removals entry naming ids that never fell changes nothing (green).
Fix the MODULE to follow this (the failing assertions in the test encode it; where a test assertion contradicts rules 1-3, fix the test instead, minimally). Re-run until all pass, report the final vitest output.
