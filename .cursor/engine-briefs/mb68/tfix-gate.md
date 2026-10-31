---
write_scope:
- src/tests/mcbylaws-loop-gate.logic.test.ts
---
# MB-68 type fix for src/tests/mcbylaws-loop-gate.logic.test.ts - DeepSeek
Tools: `read_file`, `edit_file`, `run_command` (`npx vitest run <path>`, `npx tsc --noEmit`). Never git add/commit. Small `edit_file` changes only; do NOT change test intent or loosen any assertion, and do NOT edit any module.
The repo typechecks tests strictly (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). Run `npx tsc --noEmit` and fix every error that names `src/tests/mcbylaws-loop-gate.logic.test.ts` (ignore other files). The errors are TS2353 on an object literal passed to a function whose parameter type is inferred from a JSDoc default; fix by building the argument in a typed variable (`const arg: Record<string, unknown> = {...}`-style, but do not name a type `Record`) or by casting the module function to a loose function type.
Finish when tsc prints no error for this file and `npx vitest run src/tests/mcbylaws-loop-gate.logic.test.ts` passes. Report both outputs.
