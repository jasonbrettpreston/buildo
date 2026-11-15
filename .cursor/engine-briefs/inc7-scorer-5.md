---
write_scope:
- scripts/analysis/mcbylaws-loop/loop-inc7-score.mjs
- src/tests/mcbylaws-loop-inc7-score.logic.test.ts
- mcbylaws/loop/inc7-scorer-settings.json
allow_commit: false
---
# INC7-S step 5: panel findings (error-paths and spec lenses, verified by the orchestrator). RED first. NEVER git add/commit/stash/reset. edit_file only. No .env, no Python.
Five fixes. For each: write the failing test first, run the file and record that it fails, then fix, then run all (target: every test passes; the existing J lock test must still pass: if it deep-compares a field you add, report instead of loosening).
F1 Direction vacuous pass: in `scoreDirection`, `pass` must be `denominator > 0 && correct >= required` (the test brief said so; no test locked it). Tests: `M.scoreDirection([], [], [], S).gfa.pass` is false and `M.scoreInc7({cases: [], layer3Rows: [], varianceRows: [], settings: S}).ok` is false; also all cases with no applicant figure -> pass false.
F2 Ambiguous maxima: in `maxFor`, when two or more USABLE rows for the same parcel, class and field carry different numeric values, return `{value: null, reason: 'ambiguous'}` (identical values are fine, first returned). Tests: two rows 100 and 120 -> ambiguous; two rows 100 and 100 -> ok 100; the result must not depend on row order (swap the order, same result). A scoreDirection case on such a parcel counts as not_evaluated.
F3 Verdict roles as settings: add to the settings file under `catch` `"verdict_roles": {"exceeds": "EXCEEDS", "may_exceed": "MAY EXCEED", "complies": "COMPLIES", "not_evaluated": "NOT EVALUATED"}`. `validateSettings` returns `verdict_role_missing:<role>` for a role absent or not in `catch.verdicts`. In the module, `derivedVerdict` takes the verdicts from `catch.verdict_roles` (not from the position in `catch.verdicts`): remove the positional destructure. Test: a settings clone where `verdicts` is reordered but roles unchanged scores the same; a clone with a role missing -> validateSettings has `verdict_role_missing:exceeds`.
F4 Fallback category as a setting: add `"false_alarm_fallback_category": "other"` under `catch` in the settings file; `validateSettings` returns `fallback_category_invalid` when it is not one of `catch.false_alarm_categories`; the module's `otherCategory` logic (last-category guess) is replaced by this setting. Test: unknown category falls to the setting; a clone with the fallback set to `existing/party wall` puts an unknown-category false alarm into that bucket (and fails its zero threshold); invalid fallback -> violation code.
F5 Closeness ignores a maximum that is zero or negative (`m.value <= 0`, today only 0 is skipped). Test: a parcel with max -5 is excluded from `values`.
Report: the failing-first evidence (test ids and received values) and the final counts.
