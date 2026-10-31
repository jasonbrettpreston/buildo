---
write_scope:
- scripts/analysis/mcbylaws-loop/loop-increment.mjs
- scripts/analysis/mcbylaws-loop/data/increments.json
- src/tests/mcbylaws-loop-increment.logic.test.ts
---
# MB-68 B1 - loop-increment.mjs (one increment per round) - DeepSeek, red first, LEAVE UNCOMMITTED

Tools: `read_file`, `write_file`/`edit_file`, `run_command` (only `npx vitest run <path>`). Never git add/commit. ESM `.mjs`, 2-space indent, no `process.env`, no `process.exit`, no network. Pure functions return `string[]` of violation codes (empty = green); a code with a detail is `code:detail`.
Rules: plan `~/Buildo-scratch/mcbylaws/MB-68/plan.md` section 5; PR-68-4 (closed increment set, batch al, M-3xx row); queue lines 83-93.

## Order (red first)
1. Write `src/tests/mcbylaws-loop-increment.logic.test.ts` and `scripts/analysis/mcbylaws-loop/data/increments.json`; run `npx vitest run src/tests/mcbylaws-loop-increment.logic.test.ts`; it must FAIL (module missing).
2. Write `scripts/analysis/mcbylaws-loop/loop-increment.mjs`; run vitest again; it must PASS. Report both outputs.

## data/increments.json (exact)
`{ "schema": "increments-v1", "ids": ["1","2","3","4","5","6","6b","7","8","9","10"] }`

## Module contract (`loop-increment.mjs`)
- `loadIncrements(root)` -> reads `<root>/scripts/analysis/mcbylaws-loop/data/increments.json` (relative to the repo root passed in), returns `ids` (array of strings). Missing/invalid file throws `Error('data_missing: <path>')`.
- `checkOneIncrement({ prereg, record, rowsTouched = [], newCases = [], ids })`:
  - for each of `['prereg', prereg.increment]`, `['record', record.increment]`: not a string, or not in `ids` -> `increment_not_one_id:<label>` (arrays, `"2,3"`, empty string, unknown id are all caught by that rule).
  - `prereg.increment !== record.increment` -> `increment_differs_prereg_vs_record`.
  - the distinct non-null `increment` tags in `rowsTouched` (array of `{id, increment}`) number more than 1 -> `rows_from_two_increments`.
  - each `newCases` item `{id, introduced_in}` with `introduced_in !== record.increment` -> `regression_case_wrong_increment:<id>`.
- `checkSkipAhead(increment, greenHistory, ids)`: position `i` of `increment` in `ids` (the closed order, so the id before `7` is `6b`); `i < 0` -> `increment_not_one_id:skip`; `i > 0` and `ids[i-1]` not in `greenHistory` (array of increment ids) -> `increment_skips_ahead_previous_not_green`. The first id never skips.
- `greenIncrements(records)`: `records` = `[{increment, decision, green}]`; returns the distinct increments having at least one record with `decision === 'accept'` and `green === true`.
- `incrementGreen({ increment, ids, groups, cases, floorsOk, canaryOk })`: `groups` = `[{id, introduced_in}]` (`introduced_in` an increment id or `"baseline"`), `cases` = `[{id, group, status}]`. In scope = groups whose `introduced_in` is `"baseline"` or sits at or before `increment` in `ids`. Returns `{ green: boolean, reasons: string[] }`; reasons: `case_not_green:<id>` for each in-scope case whose status is not `pass`/`accepted`, `floors_fell` when `!floorsOk`, `canary_not_red` when `!canaryOk`, `empty_set` when no in-scope cases. green = reasons empty.

## Tests to write (describe blocks, each red AND its green twin)
loadIncrements reads the real file (11 ids, starts `1`, contains `6b`, ends `10`); missing root throws `/data_missing/`. checkOneIncrement: green for equal `'1'`; red `['2','3']`, `'2,3'`, `''`, `'11'`, differing prereg `'2'` vs record `'1'` (both codes as expected), rows tagged 1 and 2, a new case introduced_in `'2'` in round `'1'`. checkSkipAhead: `'3'` with `['1']` red; `'2'` with `['1']` green; `'1'` with `[]` green; `'7'` needs `'6b'`; `'zz'` red. greenIncrements: accept+green counts, revert+green and accept+not-green do not. incrementGreen: green; a failing case; a `pending` case; a skipped case; floors fell; canary not red; zero cases; a group of a LATER increment with a failing case is ignored (green).
Header: two `// SPEC LINK:` lines (`docs/specs/01-pipeline/69a_mcbylaw_register.md` PR-68 / M-3xx and `~/Buildo-scratch/mcbylaws/MB-68/plan.md section 5`), `import { describe, expect, it } from 'vitest'`, `const M = await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-increment.mjs'))` with `ROOT = path.resolve(__dirname, '../..')`. Type fixtures plainly; no `any`.
