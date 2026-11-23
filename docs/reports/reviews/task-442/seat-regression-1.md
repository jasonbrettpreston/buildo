# Seat: regression: task-442 plan (PLAN-442-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.

Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.

Basis: board head 086e6bcc6. Read: the whole customer-report-read test and the admin test head, F, G25 and L4/ST (:1-240); report-binding.logic.test.ts :48-155; report-generator-fields.logic.test.ts :80-125, :168, :203; nav-by-route.logic.test.ts :8-30, :288-312, :342-393; the engine's write rule (maxbld/rows.js :496-512); seed-report-v2.mjs :55-95; a grep of src/tests, scripts/analysis and scripts/surfaces for the read-stored guard message, `circulation` and the page text. The change is tests only (two files, no src edit committed), so the regression risk is to the test files themselves and to what the new tests claim.

Nothing in the plan weakens an existing test or hook: no source, seed or hook file is changed in a commit, and the existing cases in both files keep their static imports and data. Findings are about what the new tests would miss or mis-state.

## rg#1 MED: T3's allow list shows the live break but nothing makes anyone own it
Plan: T3 entry `row.unit_size_basis_value`, kind `exception`, why "owed: bind houseplex_circulation_share ...; named to the orchestrator by task-442, no card"; Q6.
Evidence: nav-by-route.logic.test.ts:288 says each exception reason is "owed: <row>", and :364-368 asserts every `exception` and `flag` `why` matches `/^owed: MF-\d+/`; each of its five exceptions names a real queue row (MF-49, MF-50, MF-44; :301-324). T3 has no owner row and the plan copies the form without that assertion.
What goes wrong: the entry is counted (fail-closed both ways, so a second typed digit or a stale entry fails), so the break is visible in the file. But the test stays green forever with a known false-able number on the page; nothing fails when the setting is refitted either, because the test never reads logic_variables.json. The nav pattern's strength is the named owner; here it is missing, so the list can only be shrunk by someone who happens to remember.
Fix: the orchestrator opens the card before landing (Q6), and T3 asserts `why` matches `/^owed: task-\d+/`. A cheap extra: a case that reads logic_variables.json and fails if `houseplex_circulation_share` min and max differ while the typed text still says "10 %" (it ties the text to the pin, so a refit turns the test red).

## rg#2 MED: T1's switch cases test the test's own copy of a rule that is already locked elsewhere
Plan: T1 repeats seed-report-v2.mjs:70, :82 and plants (c), (d) on switchboard copies.
Evidence: the same rule has three homes: the generator (seed-report-v2.mjs:70, :82), the engine (maxbld/rows.js:496-512, which differs: it writes off increment-1 rows as not_evaluated and reads a missing switch as ON), and the new test copy. The generator's effective-ON is already locked by report-generator-fields.logic.test.ts:83 ("one catalogue field per effective-ON row") and by `report-fields.mjs --check` in pre-commit, and a switch turned off already makes the page's field undeclared (`pageBindings` throws "not declared exactly once", project.ts:108).
What goes wrong: cases (c) and (d) prove the copy against itself, so they cannot detect drift: if the generator changes (a third switch state, a new per-type rule), the control (a) stays green on the committed data and the planted cases stay green on the stale copy. The only check T1 adds that nothing else holds is type membership (row's building_type list holds the section's type), cases (a) and (b).
Fix: keep (a) and (b); drop (c) and (d) or derive the on/off state from the generator's own output; if the claim is "the engine writes", run `S.buildParcelRows` with the harness the file already has (`storedRowsOf`, :84-90) and assert the 17 (building_type, field_id) pairs are present in its rows. That has no copy of any rule to drift.

## rg#3 MED: T3 does not see 9 of the 90 texts
Evidence: the walk of report-page.json reaches 79 content keys plus `pending.estimated` and `pending.classified`. Not reached: `sheet.link_dims`, `sheet.err_range_sqft`, `sheet.err_range_m2`, `sheet.err_side_ft`, `sheet.err_side_m`, `sheet.err_dims_area_sqft`, `sheet.err_dims_area_m2`, `sheet.err_ratio`, `summary.not_evaluated`. The error texts carry {lo}/{hi} placeholders; a typed limit added there would pass T3 with no entry.
Other routes to the page that T3 does not scan: the blocks outside `page` in report-presentation.json (display_label, states, disclosure_texts, status_text). They hold no digit in a displayed string today; the plan scopes T3 to `page`, which is fine if the header says so.
Fix: scan every key of `page`; say in the test header which presentation blocks are out of scope.

## rg#4 LOW: T2's module reset does not leak into the file's other cases, as designed
Evidence: static imports (customer-report-read.logic.test.ts:54-63) are bound once at load; a later reset affects only later dynamic imports. T2 is the last describe; `beforeEach` does `vi.clearAllMocks()` and `poolQuery.mockReset()` (:106-110). The hoisted factories run again on the next import but nothing after T11 imports. vitest.config.ts has no shuffle, so the order holds.
Residual: the safety rests on "T2 is last". The thinroute branch (unlanded) edits T10 just above; anyone who later appends a describe after T11 inherits a reset registry. Keep the `finally` with doUnmock and resetModules, and say in a comment that T11 must stay last or that later cases must not use a dynamic import.

## rg#5 LOW: T1 does not check the design option, so a swapped field in o1 or o2 passes
Evidence: o1 is `detached_house/pitched` and its size part binds gfa_pitched_m2 (catalogue design_option roof_form pitched); o2 binds gfa_flat_m2 (flat_or_shallow_roof). T1 uses the type before "/" as project.ts does, so binding o1's size to gfa_flat_m2 would pass T1. Nothing else in the plan checks it; G25 would catch it where the key states a value. Not a plan defect, a stated limit: say it in the test header.

## rg#6 LOW: existing coverage checked; T1 (type membership), T2 and T3 are not duplicates
- T2: the guard's message exists only in read-stored.ts. report-binding.logic.test.ts:95-100 covers a parcels column that is not a migration column (RS-3) and :145 a path off the whitelist (RS-2); neither reaches read-stored.ts's static SELECT list. Gates 4 and 5 (ledger, consumer registry) check the SQL's columns exist and have writers, not that the page's bound columns are selected. Real gap, T2 fills it.
- T1: report-generator-fields.logic.test.ts:83 covers effective-ON per row (see rg#2); nothing checks that a page section's type is in a bound row's building_type list.
- T3: no test mentions the page text digits. admin test :228 comment on unit_area_m2 concerns the numeric invariant, not the label. report-no-maths scans arithmetic only.

## rg#7 NIT: the two placeholders are called "user-input exception" but are unit-agnostic
`sheet.width_placeholder` "e.g. 50" and `sheet.depth_placeholder` "e.g. 120" (report-presentation.json:342, :344) show beside `sheet.unit_ft`/`sheet.unit_m`; the same digits show for both units. They are example hints, fine as entries, but the `why` should not claim they are bound to anything.

UNVERIFIED (not checked by this seat):
- Whether any existing test elsewhere pins the content of the 4 digit-bearing texts by exact string (a copy edit of "10 %" would then need two edits); grep of src/tests for the string found none.
- The full suite was not run (not allowed); no claim here rests on a run.
- Other tests that import `pageBindings` or `read-stored` (parcels-lookup-page, customer-report-compute) were checked by grep only, not read whole.
- Whether the engine's `renovation.renovationApplies` filter ever drops a type the page binds (o1 to o3 are new-build types; not traced).
