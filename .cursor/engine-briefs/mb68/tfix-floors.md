---
write_scope:
- src/tests/mcbylaws-loop-floors.logic.test.ts
---
# MB-68 type fix for src/tests/mcbylaws-loop-floors.logic.test.ts - DeepSeek
Tools: `read_file`, `edit_file`, `run_command` (`npx vitest run <path>`, `npx tsc --noEmit`). Never git add/commit. Small `edit_file` changes only; do NOT change test intent or loosen any assertion, and do NOT edit the module.
The repo typechecks tests strictly (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). Run `npx tsc --noEmit`: it prints errors; fix every error that names `src/tests/mcbylaws-loop-floors.logic.test.ts` (the output is long only if other files fail; ignore other files). Typical fixes: add `| undefined` to optional property types in the test's own interfaces, use `!` or a guard for array/object index access, do not name a local type `Record` (it shadows the TypeScript built-in: rename it, e.g. `LoopRecord`). Also one test fails: `checkPercentFloors ... a line below its floor is floor_fell ...` expects 3 violation lines but the real report gives 4 (it lists every falling line: overall accuracy, overall answered, article accuracy, article answered). Make its expected list match what the real report returns for that fixture (print it once to see), keeping the OWED/violation split intent.
Finish when `npx tsc --noEmit` prints no error for this file and `npx vitest run src/tests/mcbylaws-loop-floors.logic.test.ts` passes. Report both outputs.
