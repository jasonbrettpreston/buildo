---
write_scope:
- src/tests/mcbylaws-loop-gate-eval.logic.test.ts
---
# MB-68 O4 fix 3 - eval test factory (TEST FILE ONLY) - DeepSeek
Tools: read_file, edit_file, grep_files, run_command (npx vitest run, npx tsc --noEmit). Never git add/commit. Small edit_file changes, no console.log.
`npx vitest run src/tests/mcbylaws-loop-gate-eval.logic.test.ts` has 16 failures, nearly all from the honest factory: it gives `unexpected_move:n-2#1 ABSENT->MATCH` and `accept_with_prereg_finding`, because the factory's `run.baseRows` has fewer rows than `run.curRows` (the missing row shows as ABSENT->MATCH). Make the factory's `run.baseRows` an EQUAL copy of `run.curRows` (same ids, same statuses) so that no move exists. Also type error: the local `Prereg` type does not list `group` (add `group?: string | undefined` and `increment`). Then re-run; fix any remaining failure one at a time the same way (fixtures, not modules). Finish when the file passes and `npx tsc --noEmit` prints no error naming mcbylaws-loop files.
