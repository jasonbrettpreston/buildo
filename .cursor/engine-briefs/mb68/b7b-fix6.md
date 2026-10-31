---
write_scope:
- src/tests/mcbylaws-loop-gate-context.logic.test.ts
---
# MB-68 B7b fix 6 - two fixture problems in the context test (TEST FILE ONLY; the module is right) - DeepSeek
Tools: `read_file`, `edit_file`, `grep_files`, `run_command` (`npx vitest run <path>`, `npx tsc --noEmit`). Never git add/commit. Small `edit_file` changes; do not touch the module.
Run `npx vitest run src/tests/mcbylaws-loop-gate-context.logic.test.ts`. Two tests fail:
1. `commit mode > reads the index ...`: line ~457 expects `M mcbylaws/loop/regression-set.json` in the staged name-status, but the previous fix changed the fixture so that the file is `A` (added) or unchanged. Look at `seedBase`/the commit-mode fixture and assert what is true now (use `A` or `M` correctly), keeping the other assertions.
2. `end to end the honest round`: `evaluateGate` gives `input_not_bound:mcbylaws/loop/data/ids-g-b.json`, `input_not_bound:scripts/seeds/bylaw/layer3-catalogue-next.json` and `regression_case_wrong_increment:c-acc`. (a) `roundRecord` must put into `inputs` the blob id of EVERY path returned by `git diff --name-only <base> HEAD` that is a bound path (a path for which `makeClassifier()` from `scripts/analysis/mcbylaws-loop/loop-oracle.mjs` returns non-null) EXCEPT record files: compute that list from git itself after all non-record files of the round are committed or at least staged/written, so the new `ids-g-b.json` and `layer3-catalogue-next.json` are included. (b) `c-acc` must appear ONLY in the new group `g-b` (introduced_in `'2'`) at HEAD and must NOT also be added to `g-a`; `g-a`'s ids at HEAD equal its ids at the base.
Remove any console.log you add. Finish when the whole file passes, `npx vitest run src/tests/mcbylaws-loop` has no failure and `npx tsc --noEmit` prints no error naming mcbylaws-loop files. Report the final outputs.
