---
write_scope:
- scripts/analysis/mcbylaws-loop/loop-oracle.mjs
- scripts/analysis/mcbylaws-loop/loop-gate-eval.mjs
- src/tests/mcbylaws-loop-oracle.logic.test.ts
- src/tests/mcbylaws-loop-gate-eval.logic.test.ts
---
# MB-68 O2 (O68-01 and O68-02 on the judging side, O68-06, and the two operator fixes: metadata class, prereg-only adds) - DeepSeek

# MB-68 O7 - items 4 and 5 of brief O2 were never implemented (the real-data run proves it): metadata class and prereg-only adds (DeepSeek)
Tools: read_file, edit_file, grep_files, run_command (npx vitest run, npx tsc --noEmit). Never git add/commit. Small edit_file changes; no console.log. Implement now, with tests, items 4 and 5 below, exactly as specified in the O2 brief text (copied here). Currently `makeClassifier()('scripts/analysis/bylaw/_schema/bylaw-rule-map.json')` returns 'code' (must be 'metadata') and an added prereg file alone gives `recordMissing` = ['record_missing'] (must be []).
4. **`metadata` class (operator fix 1).** In `loop-oracle.mjs` add `METADATA_GLOBS = ['scripts/analysis/bylaw/_schema/bylaw-rule-map.json','scripts/analysis/bylaw-validation/maxbld-amendment-index.json','docs/reference/maxbld-amendment-index.json']` checked FIRST in `makeClassifier` (returns `'metadata'`). Effects: `boundPaths` excludes it; `checkOracleFirst` does not count it as code; `recordMissing` does not count it (a metadata-only change needs no record); `commitStageFires` DOES fire on it (the pin and floors still run). In `evaluateGate`: when every classified path of the change is `metadata`, skip the record stages and return only `ctx.run.regenMismatch` and `ctx.run.report.violations` (and `run_missing` when `ctx.run` is null in commit/push; a note at ci). A metadata path beside any code, oracle or generated path behaves as before (`record_missing`).
5. **Prereg-only adds (operator fix 2).** A commit whose classified paths are ALL newly added (`s === 'A'`) prereg files (`scripts/analysis/bylaw-validation/coa-expected/prereg-*.json`) needs no record and no run: `commitStageFires` returns false for such a change set and `recordMissing` returns `[]` for it. A MODIFIED prereg, or a prereg beside code, is unchanged (oracle-first / record_missing as before).
Tests: one red and one green per item in the oracle and eval test files (rule-map only: classify is 'metadata', no record needed, only scorer verdicts; with regenMismatch red; rule-map plus a code path: record_missing; added prereg alone: out of scope and no record; modified prereg still fires; added prereg beside a catalogue edit: record_missing). Finish when the oracle, eval and context test files pass and tsc is clean for mcbylaws-loop files.
