---
write_scope:
- scripts/analysis/mcbylaws-loop/loop-floors.mjs
- scripts/analysis/mcbylaws-loop/loop-gate-eval.mjs
- scripts/analysis/mcbylaws-loop/loop-gate.mjs
- scripts/analysis/mcbylaws-loop/loop-gate-run.mjs
- src/tests/mcbylaws-loop-floors.logic.test.ts
- src/tests/mcbylaws-loop-gate-eval.logic.test.ts
- src/tests/mcbylaws-loop-gate.logic.test.ts
- src/tests/mcbylaws-loop-gate-commands.logic.test.ts
---
# MB-68 R2 - round-0 count floors through the ruling door (operator ruling 4 of CARD-gates-recheck; M-330, M-322, M-372) - DeepSeek
Tools: read_file, edit_file, grep_files, run_command (npx vitest run, npx tsc --noEmit). Never git add/commit. Small edit_file changes (files are long); no console.log left. Red test first for each item, then the code; run the touched test files after each. The file to be written later by this tool is `mcbylaws/loop/floors-172.json`; do NOT write it yourself and do not type any count.
1. **Owed baseline door.** `loop-floors.mjs`: add `setOwedBaseline(floors, line, value, ruling, rulings)` exactly like `setCountFloor` (authority check -> throws `ruling_not_authority:<ruling>`), setting `owed_baseline[line] = value` and appending `{ ruling, lines: [{ line: 'owed_baseline ' + line, from, to: value }] }` (that key is what `flattenFloors` exposes for `owed_baseline`, check the exact key it uses and match it). `checkOwedRatchet` compares at the scorer's printed precision: `Math.round(measured * 10) / 10 + 1e-9 < baseline` is a fall (91.666 prints 91.7, so a baseline of 91.7 holds; 91.6 falls). Tests: door with RULED id ok, fake id throws; the ratchet holds at 91.7 for a measured 91.6667, falls for 91.6 and for 90.0.
# MB-68 R2b - 5 tests of the R2 contract still fail (DeepSeek)
Tools: read_file, edit_file, grep_files, run_command (npx vitest run, npx tsc --noEmit). Never git add/commit. Small edit_file changes; no console.log. Contract: `.cursor/engine-briefs/mb68/r2-floorswrite.md`. Work one failing test at a time (module vs fixture: fix whichever disagrees with the contract; the `owed` item `line` stays the plain scorer line, e.g. `article 10.5.40 accuracy`, NOT group-prefixed). Known causes: (a) the commands fixtures' fake `computeRun` result must look like a real push run: include `ranGroups` listing every group in `groups` (the command refuses a non-full run with run_needs_mode_push_or_full); (b) the missing-ruling violation code the module returns is `floors_write_needs:ruling` while the test expects another shape: make the test follow the module (`floors_write_needs:<names joined by |>`, read the module); (c) the eval commit-like test and the owed-door test: print the actual values and fix.
Failures:
AssertionError: expected [ …(2) ] to deeply equal []

- Expected
+ Received

- Array []
+ Array [
+   "ruling_line_unknown:owed_baseline article 10.5.40 accuracy",
+   "ruling_line_unknown:owed_baseline article 10.5.40 accuracy",
+ ]
--
AssertionError: expected [ 'run_needs_mode_push_or_full' ] to deeply equal []

- Expected
+ Received

- Array []
+ Array [
+   "run_needs_mode_push_or_full",
+ ]

--
AssertionError: expected [ 'run_needs_mode_push_or_full' ] to deeply equal [ 'ruling_not_authority:M-999' ]

- Expected
+ Received

  Array [
-   "ruling_not_authority:M-999",
+   "run_needs_mode_push_or_full",
  ]

--
AssertionError: expected [ 'floors_write_needs:ruling' ] to deeply equal [ Array(1) ]

- Expected
+ Received

  Array [
-   "floors_write_needs:ruling|owed-ruling",
+   "floors_write_needs:ruling",
  ]

--
AssertionError: expected [ Array(1) ] to deeply equal []

- Expected
+ Received

- Array []
+ Array [
+   "floor_fell:coa4d cases not_measured",
+ ]
Finish when `npx vitest run src/tests/mcbylaws-loop --exclude src/tests/mcbylaws-loop-realdata.logic.test.ts` passes and tsc is clean for mcbylaws-loop files.
