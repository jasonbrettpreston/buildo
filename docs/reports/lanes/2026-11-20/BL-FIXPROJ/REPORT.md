# REPORT BL-FIXPROJ (task-372 FIX.PROJ, Increment 1·B). Grounder owed. No verdicts.

## Five plain lines for the operator
1. D2 and D9 and D6 are fixed: the sq ft number and the 50 / 5,000 lot-size window now come from registered pinned settings (the existing parcels_sqm_to_sqft, and two new ones), and the rounding has a property test. For a person nothing changes: the same numbers print.
2. No stored value and no golden moved (factor 10.7639, window 50 and 5000, unchanged; the pre-commit related run of 11 files, 303 tests, passed). One lock was edited on purpose: the test that said the formatter imports nothing now allows its two imports.
3. Stopped for you: D1 (freshness comparing the settings sha and evaluator version). The stored row has no evaluator_version column and the current settings sha needs database reads inside a pure compare. Draft with options: D1-OPERATOR-DRAFT.md (Grounded, Recommendation UNVERIFIED). Also owed: the database row for the two new settings is a migration whose number I could not claim (outside my write scope).
4. Unverified: that format.ts importing the whole seed never reaches a phone or browser bundle; that the settings sha ignores the two new variables (read from the code, not run); doc-16 is DRAFT.
5. Left for another task, listed only: mobile/src/lib/leadDetailFormat.ts:15, mobile/src/lib/parcelCostFormat.ts:11 (also src/lib/parcels/geometry.ts:3) still type the factor.

## Defects confirmed on the head (AC1), file:line
- D1 project.ts:179-184 (freshnessOf compares layer2_table_version, catalogue_sha, switchboard_sha; settings_sha at :38 stored, never compared); read-stored.ts:31-34 no evaluator_version column.
- D2 format.ts:14 `export const SQFT_PER_M2 = 10.7639;` used at :35.
- D9 project.ts:76 `LOT_SIZE_PLAUSIBLE_M2 = Object.freeze({ min: 50, max: 5000 })`.
- D6 format.ts:35 rounding; only example tests (git grep fast-check lists only two other property files, per grounder).

## What changed (commit 83fb9959668d7c87c68fa63036b42bb9371a5edf, branch wf1/inc1b-fixproj, 15 files)
- New src/lib/report-projection/pinned-settings.ts (pinnedSetting: throws by name when the row is absent, not a number, or not min = max = default).
- format.ts reads parcels_sqm_to_sqft (seed row scripts/seeds/logic_variables.json, pinned 10.7639, existing, migration 262). project.ts reads two new pinned seed rows maxbld_report_lot_size_implausible_min_sqm (50) and _max_sqm (5000), group "MaxBLD Lot Size", and throws if the window is inverted.
- Generated files refreshed by their generators: logic-variable-groups.json, logic-variables-registry.md, programme-items.json, maxbld-report-field-inventory.{json,md} (only the seed hash moved).
- Tests: src/tests/report-projection-settings.logic.test.ts (13 tests), src/tests/property/report-sqft-rounding.property.test.ts (4 properties), control-panel expected keys +2, admin-report-preview-live lock edited (the moved lock: imports must equal the seed and ./pinned-settings).

## Red and green hook tails
Red (red.out, a commit attempt with only the tests and the task file staged; refused at typecheck, before the related run):
  src/tests/report-projection-settings.logic.test.ts(11,31): error TS2307: Cannot find module '@/lib/report-projection/pinned-settings'
  rc=1
Note: the D6 property test passes on the old code (the defect was a missing test); a mutation red was not run: UNVERIFIED that it catches factor drift (the pin test and the independent 10.7639 reference are what catch drift).
Green (commit.out, real hooks; first green attempt commit-attempt1.out failed on the old "formatter imports nothing" lock and report-fields drift, both fixed):
  Test Files  11 passed (11) / Tests  303 passed (303)
  GATE OK
  POLICY CHECKS OK (commit-msg): 8 file(s)
  [wf1/inc1b-fixproj 83fb99596] ... 15 files changed, 196 insertions(+), 18 deletions(-) / rc=0
Checks run before (all clean) and after (checks-after.txt, all clean): logic-vars docs --check, logic-variable-groups --check, consumer-registry --check, estate-literals (0 findings), rule-map --check; npm run typecheck clean.

## Goldens
No golden or stored value moved. One test lock moved: admin-report-preview-live.logic.test.ts:134-141 (formatter imports nothing -> imports exactly the seed and ./pinned-settings), because D2 requires the formatter to read the registered variable.

## Lens set (rule lists whole in --context, rulings pasted: rulings.md)
Findings count by lens (plan / output): compliance 132: 5/4; 136: 4/4; doc-16 (DRAFT): 3/5; engineering standards: 4/6; code-review 7/6; error-paths 5/3; regression and failure modes 16/10. By id: FINDINGS.md; triage KEEP/REJECT with opened lines: TRIAGE.md. Substitution noted: the "regression" lens is the plan-review-deepseek template (failure modes, data reality, siblings); no regression-guardian seat was run.
Tool notes: lens runs used the plan or the diff as the file (the repo tool sends it twice) with every $ doubled.

## UNVERIFIED
- format.ts and project.ts bundled to a client (seed import); not checked.
- Settings sha excludes the two new variables (code reading only; no live stack).
- The DB mirror row of the two new variables is not written (migration owed, number not claimed); admin visibility depends on it.
- D1 options not reviewed by the repo review.
- No grounder verdict yet; no mutation red for D6.
- Task AC checkboxes and DoD are not checked by me (grounder owed); task left RUNNING.

STATUS: ready (grounder owed; D1 stopped for the operator; migration for D9 owed)
