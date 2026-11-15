---
write_scope:
- scripts/analysis/mcbylaws-loop/loop-inc7-score.mjs
- src/tests/mcbylaws-loop-inc7-score.logic.test.ts
allow_commit: false
---
# INC7-S step 8: finish the rulings build (continue step 7; module now loads: 10 failing in the new file, 2 in the old). NEVER git add/commit/stash/reset. edit_file only. No .env, no Python, no process.exit.
**ENGINE LIMITS:** the engine allows only `npx vitest run <ONE test file>` per command (no flags, one file). Run the new file `src/tests/mcbylaws-loop-inc7-score-buildings.logic.test.ts` and the old file `src/tests/mcbylaws-loop-inc7-score.logic.test.ts` separately. Do NOT spend iterations probing the runner; read the failing test, fix, run.
Same hard rules as `.cursor/engine-briefs/inc7-scorer-7.md` (read its design groups 1-6: no clause/building/measure literals in the module; settings are the data). Do NOT edit the new test file or the settings. The old test file may be edited ONLY at F2 (below).
Failing now, with the orchestrator's hypothesis (verify against the test text; if a test of the NEW file is itself wrong, do not edit it: report id and reason):
1. O2 and U5 (prepareRows duplicate rule): the module keeps the DISPLACED row (ordinals [1,2]) and skips the other; the data rule `buildings.duplicate_rule` says keep the displacing clause: the row with `displaced_by` set is skipped. Fix the choice.
2. T6 (classifyRow with off_scope true gives CAUGHT, expected MISSED): the rule matcher does not apply the `off_scope` / `relative` conditions of a rule correctly (a rule that has `off_scope: true` must require the fact true; the first table entry is the off-scope MISSED rule, which has no `our_verdict` list: absent means any verdict). Fix.
3. T7, T9 (catch row shape and `complete_inputs`): read the tests; rows must carry `clause`, `ordinal`, `building`, `off_scope`, `relative`, `cause`, `complete_inputs`; complete_inputs per design group 5 (the row's scored building has a class and every measure of `catch.complete_inputs.measures` has a non-null applicant figure). Threshold filters `complete_inputs: true` and `named_cause: false` per group 5.
4. U1 (garden-suite height variance must not flip the main unit; and suite-only case scores the suite unit): read the test; check `unitsOf` for a suite-only case and the variance-by-building filter (`variance_buildings`).
5. Q1, Q2 (adaptBuildingFile): Q1 `new_build` expectation and Q2 crash reading `.class` of undefined: when the golden_p_type is unmapped the main building still exists with `class: null`; read the tests for the exact shape.
6. R3 and W2 (manifest): the `excluded` list and `disclosures` count per the tests (a disclosure per measure with an applicant figure for a held unit; `excluded` = applicant figure null only, never a held unit).
7. Old-file D3 (`count_rounding` floor flips pass): `pass` must be `denominator > 0 && correct >= required` where `required` is the exact integer rounding from `requiredCorrect` (for ceil identical to `correct*100 >= pct*denominator`); this keeps the rounding setting working.
8. Old-file F2: the test moves the NOT EVALUATED verdict out of a class rule by INDEX (`class_rules[3]` style) and the new first two rules shifted the indices. Edit the old test to find the rule by its `class` (`'MISSED'` rule that lists `NOT EVALUATED` in `our_verdict`) instead of by index; change nothing else in that file.
**Verify and report:** both files pass fully (new file 57, old file 61), `node --check` the module; list any test you consider wrong.
