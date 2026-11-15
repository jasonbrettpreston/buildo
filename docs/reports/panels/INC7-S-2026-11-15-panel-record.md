# INC7-S OUTPUT panel record, 2026-11-15 (MB-27 increment 7 scorer; becomes increment 9 by the 2026-11-15 renumbering)

Seats: DeepSeek lenses (deepseek-chat, `--fast`): spec, error-paths, idempotency, run on the module twice (commit 8ab3e0ad4, then the rulings build); one Sonnet grounder (this lane) re-read each finding against the code and the tests. Rulings applied: operator "1,2 and 4 y" and "3 y" (2026-11-15). Disposition vocabulary: FIXED (red test first, evidence `docs/reports/red-evidence/INC7/`), REJECTED (reason given).

## Round 1 (module at 8ab3e0ad4)
| Finding | Disposition |
|---|---|
| Direction measure with an empty denominator passes (vacuous) | FIXED red-first (`denominator > 0`), tests K1 |
| pct_min compares a 1-dp rounded percentage | FIXED red-first (exact compare), G5b |
| Two usable Layer 3 maxima: first row wins (order dependence) | FIXED red-first (`ambiguous`), K2 |
| Verdict roles taken by position in `catch.verdicts` | FIXED (setting `catch.verdict_roles`), K3 |
| Unknown false-alarm category falls to the last listed category | FIXED (setting `false_alarm_fallback_category`), K4 |
| Closeness keeps a negative maximum | FIXED (max <= 0 skipped), K8 |
| null closeness threshold counts as pass | REJECTED: the threshold is deliberately unset until recorded from this increment's data before MB-28 (69a:498); `threshold_met` stays null and is shown |
| NOT SCORED rows leave the catch denominator silently | OPEN for the operator (counts show them; no threshold exists) |
| Quartile positions hard-coded | REJECTED for 0.25/0.5/0.75: the statistic is ruled (D-3); only the method is a setting |

## Round 2 (rulings build; the coordinator's list plus every other HIGH or CRITICAL line of the three lens outputs)
| Finding | Disposition |
|---|---|
| Invalid regex in `text_patterns` throws an uncoded SyntaxError at scoring time | FIXED: `validateSettings` code `text_pattern_invalid:<id>`, red tests S1 |
| `buildings.scoring[].when` keys not validated; non-array `main_status` silently matches all | FIXED: `when_key_unknown`, `when_main_status_not_array`, `when_suite_new_not_boolean`, S2 |
| "already prepared" sniff (`duplicate_exempt` on input rows) in `varianceIndex` | FIXED: sniff and the row field removed; `prepareRows` is idempotent on its own output; an input field is never trusted, T1-T4 |
| `maxFor` reports `status:<status>` for a usable status with an unreadable value | FIXED: `value_not_numeric:<status>`, U1 |
| Float equality in the ambiguity test | FIXED: setting `layer3.ambiguity_tolerance` (smallest figure returned, order independent), U3 |
| Limit comparison has no float tolerance | FIXED: setting `catch.limit_match.epsilon`, V1 |
| pct_min compared as float division | FIXED: cross multiplication `numerator*100 >= value*denominator` with `denominator > 0` |
| Duplicate key built from raw strings (null/undefined/"0" differ) | FIXED: key from parsed numbers; and (found on the real file) numeric duplicates now also need a displaced_by link, so two real side yards (A0203 6 and 7, A0277 9 and 10) stay two rows |
| Laneway rows scored against the main house (A0375, no keyed suite type) | FIXED: the row's building decides; a row whose building has no entry in the case is NOT EVALUATED with no limit; new row field `held`; manifest `held_rows` and `data_gaps` (A0375: laneway_suite, rows 1-7, `suite_type_missing`), W1-W8 |
| Text-valued duplicate rows (A0461 rows 2 and 3) not caught | FIXED: displaced_by link plus identical numeric tokens of permitted and requested text (setting `buildings.duplicate_rule.text_match`), X1-X7, Y1; on the real file exactly A0461 row 2 is skipped |
| (spec CRITICAL) `field_missing` flags extra `field_by_measure` keys | REJECTED: the check only fires for a key with no string value; extra valid keys pass (shipped settings validate clean) |
| (spec HIGH) suite-only case: main status read as existing | REJECTED: intended (ruling 3); locked by P2 |
| (spec HIGH) `when` evaluation | covered by the `when` fix above |
| (spec HIGH) both-displaced or both-plain duplicates keep the first | REJECTED: documented, and now unreachable without a displaced link |
| (spec HIGH) `directionCase` no_applicant_figure branch dead in `scoreDirection` | REJECTED: the function is exported and tested standalone (C1) |
| (spec HIGH) pass rule changes under floor or round | REJECTED: rounding is a setting; the ruled value is ceil, and for ceil the test equals `correct*10 >= 9*denominator` exactly |
| (spec HIGH) held unit counted wrong in the denominator | REJECTED: ruling D-2 (our not-evaluated counts as wrong) and the laneway ruling (scored not evaluated with the disclosure) |
| (spec HIGH) variance inversion | REJECTED: the ruled direction rule (M-362) |
| (error-paths CRITICAL) `SUITE_WORDS` used before declaration | REJECTED: used only at call time, after the module has fully evaluated |
| (error-paths HIGH) FALSE ALARM category never set from the building file | REJECTED: the file holds City rows only; our alarms are supplied by the caller with their category |
| (error-paths HIGH, idempotency HIGH) `named_cause: false` filter "inverted" | REJECTED: it counts rows with no cause, which is the intended line (tested T7) |
| (idempotency CRITICAL) pass not equal to `correct*10 >= 9*denominator` | REJECTED: equal for ceil and integer percent (R1 table); now written by cross multiplication in the catch thresholds as well |
| (idempotency HIGH) percent fraction beyond 6 decimals, MAX_SAFE_INTEGER | REJECTED: `threshold_pct` is a validated 0-100 setting (90); products stay far below 2^53 |
| (idempotency) repeated `prepareRows` calls | REJECTED as a defect: deterministic, cost only |

## Data gaps carried to the operator
- A0375: no keyed suite type (`golden_p_suite_type` null); its 7 laneway rows are listed in `manifest.data_gaps` and score NOT EVALUATED (held).
- `buildings.class_map` and the main new-text patterns are provisional (M-364 rule 6, type map not frozen).
- A0461 rows 2 and 3 are text-valued: the skip depends on the text rule setting.
