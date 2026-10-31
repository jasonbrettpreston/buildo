---
write_scope:
- scripts/analysis/mcbylaws-loop/loop-floors.mjs
- scripts/analysis/mcbylaws-loop/loop-regression.mjs
- scripts/analysis/mcbylaws-loop/loop-increment.mjs
- scripts/analysis/mcbylaws-loop/loop-decide.mjs
- src/tests/mcbylaws-loop-floors.logic.test.ts
- src/tests/mcbylaws-loop-regression.logic.test.ts
- src/tests/mcbylaws-loop-increment.logic.test.ts
- src/tests/mcbylaws-loop-decide.logic.test.ts
---
# MB-68 O11 (output panel O68-11 floors side, O68-13, O68-17, O68-20) - DeepSeek
Tools: read_file, edit_file, grep_files, run_command (npx vitest run, npx tsc --noEmit). Never git add/commit. Small edit_file changes; no console.log left. One fix plus its red and green test each, run the touched tests after each. Update old assertions that encode the old behaviour and name them in your report.
1. **O68-13 authority scoping, code side.** In `checkFloorEdit` (loop-floors.mjs) a ruling entry's named `line` must EQUAL a floor key exactly, or equal a key minus its metric suffix (` accuracy` / ` answered`); a bare prefix such as `article` or `overall` matches nothing: an entry naming a line that is not a floor key gives `ruling_line_unknown:<line>` and excuses nothing. Same in `removeCases` (loop-regression.mjs): ids must be exact active ids (already) and the entry names the group. Test: a RULED id with line `article` cannot excuse lowering every article.
2. **O68-11 floors side.** `flattenFloors` includes the keys of `owed_baseline` (as `owed_baseline <line>`) so lowering or deleting one needs a ruling; `checkOwedRatchet` unchanged. Test.
3. **O68-17.** `incrementGreen` for an increment not in `ids` returns `{ green: false, reasons: ['increment_not_one_id'] }`. Test.
4. **O68-20 canary.** `mutateExpected({})` returns `{ __canary__: true }`; `runCanary` tries the first case whose mutated value differs from the original (canon compare), not only the first passing case. Test: first case value `{}` still gives observed `fail`.
Finish when the four test files plus `npx vitest run src/tests/mcbylaws-loop` pass and tsc is clean for mcbylaws-loop files.
