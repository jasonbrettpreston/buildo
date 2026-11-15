---
write_scope:
- scripts/analysis/mcbylaws-loop/loop-inc7-score.mjs
- src/tests/mcbylaws-loop-inc7-score.logic.test.ts
allow_commit: false
---
# INC7-S step 3: reconcile 7 failing tests (orchestrator diagnosed each; apply exactly these). NEVER git add/commit/stash/reset. Use edit_file with anchored text. No .env, no Python.
Run first: `npx vitest run src/tests/mcbylaws-loop-inc7-score.logic.test.ts` (45 pass, 7 fail now). Target: 52 pass.

## Module fixes (scripts/analysis/mcbylaws-loop/loop-inc7-score.mjs)
M1 (E5) `ratioValues`: the settings `closeness.population` is a filter table: each key that is a boolean must EQUAL the case's fact (`new_build` equals c.new_build === true; `variance_on_measure` equals hasVariance(...)); null/absent key = no filter. Today `variance_on_measure:false` is misread as "do not exclude". Replace the two need/excl flags with: for new_build and variance_on_measure, `if (typeof population.X === 'boolean' && fact !== population.X) continue;`.
M2 (E2) the median (and q1/q3) must be rounded to 3 dp: `medianOf` returns roundDp(quantile, RATIO_DP) (0.85 not 0.8500000000000001).

## Test fixes (src/tests/mcbylaws-loop-inc7-score.logic.test.ts): the test arithmetic was wrong, the module is right
T1 D1: expected values for the 6-case fixture on gfa: cases 6, evaluated 5, correct 4 (c1,c2,c3 and c4 by its variance), wrong 1, not_evaluated 1, no_applicant_figure 0, denominator 6, required 6 (ceil(5.4)), pass false. Fix the comment and title accordingly ("4 correct").
T2 D4: first block (c5 applicant `{}`): no_applicant_figure 1, not_evaluated 0, denominator 5 (c1,c2,c3,c4,c6); fix the stale comments. Second block (evaluated_cases): evaluated 5, denominator 5, not_evaluated 1, required 5, pass false.
T3 D5: `no`: correct 4, wrong 1. `yes` and `modified`: correct 3, wrong 2. Fix comments.
T4 D2 and H1 need a PASSING fixture, because the 6-case fixture cannot reach ok true (c5 not evaluated and c6 wrong fail the 90 % on height and storeys, and the catch denominator is empty). Add a helper `inputPass(settings = S): Inc7Input` after `input6`: 10 cases `pa1..pa10` on parcels `pa1..pa10`, class detached_house, new_build true, applicant `{gfa:90, height:8, storeys:2, footprint:95, units:1}`; L3 rows per parcel `gfa_max_m2 100, height_max_m 9, storeys_max 2, footprint_max_m2 80, units_max 2` (use `row`); variance rows: for pa1..pa8 `VROW(id, 'setback', 'yes', true, {city_limit: 100, our_verdict: 'EXCEEDS', our_limit: 100})` (a non-direction measure name, so direction is untouched; class CAUGHT) and for pa9, pa10 `VROW(id, 'setback', 'yes', true, {our_verdict: 'COMPLIES'})` (class MISSED): caught 80 percent passes 70 and 50. Then: D2 uses `inputPass` instead of `input6`: base footprint `pass` false (95 > 80 with no variance, 0 correct), gated false, base ok true; after adding footprint to gate_measures `ok` false and `correct` unchanged. H1 uses `inputPass()`: gated flags as written, closeness.values cases equal pa1..pa10 in order, catch.pass true, ok true; remove the stale comment lines about c3. Any other test using `input6` expecting ok true: report it instead of guessing.
Run the file again; report pass/fail counts; if a test still fails, report its id and the received/expected values, do not edit anything beyond this brief.
