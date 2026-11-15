---
write_scope:
- scripts/analysis/mcbylaws-loop/loop-inc7-score.mjs
- src/tests/mcbylaws-loop-inc7-score.logic.test.ts
allow_commit: false
---
# INC7-S step 4: pct_min must compare the EXACT percentage (found by the orchestrator in review). RED first. NEVER git add/commit/stash/reset. edit_file only. No .env, no Python.
Defect: in `scoreCatch` (module) the pct_min `actual` is `roundDp(numerator*100/denominator, 1)` and `pass` compares that rounded value, so 69.96 percent passes a 70 threshold. The test brief said "exact, not rounded".
1. RED: in the test file add, right after test G5 (inside the same describe), `it('G5b pct_min compares the exact percentage: 1749 of 2500 is 69.96 and fails 70', ...)`: build `v` = 2500 variance rows `{case: 'x'+i, measure: 'setback', city_row: true, granted: 'yes', city_limit: 100, our_limit: 100, our_verdict}` where our_verdict is 'EXCEEDS' for the first 1749 and 'COMPLIES' for the rest (cases/layer3 rows empty arrays), call `M.scoreCatch([], [], v, S)`; assert `th(out,'caught_plus_estimate_pct_min').pass` is false and its `actual` is within 1e-9 of 69.96 (use toBeCloseTo(69.96, 9)); a second block with 1750 of 2500 (70.0) passes. Run the file: G5b must fail on the first assertion (record the received value in your report). Do not touch the module in this step.
2. GREEN: module `scoreCatch` pct_min branch: `actual` = `(numerator * 100) / denominator` unrounded (null when denominator 0), `pass` = actual !== null && actual >= value (exact), and add `display: roundDp(actual, 1)` (null when actual null) to that rate entry. Keep every other field. Run the file again: all tests must pass (G5's `actual` toBe(70) and others still pass: if one expected a 1-dp rounded actual, report its id instead of editing).
Report counts before and after.
