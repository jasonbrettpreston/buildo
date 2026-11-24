# Seat: reality-check: task-450 plan (PLAN-450-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board ~/Buildo-wt-board, branch wf2/board, head 9a10561ef. The plan says it read 5a26374b9. I read the whole task-450 file, FINDINGS-PLAN.md, and the plan-* review files in docs/reports/reviews/task-450/ (only FINDINGS-PLAN.md was read in full). I also read:
- mobile/src/lib/parcelSearchMatch.ts
- mobile/src/lib/schemas.ts:366-438
- mobile/__tests__/fixtures/parcelSearch.situations.json
- mobile/__tests__/parcelSearchMatch.test.ts:396-420
- src/tests/surfaces/surface-validate.logic.test.ts:85-100
- src/tests/surfaces/surface-conformance.logic.test.ts:250-265
- scripts/surfaces/screen-checks.mjs:378-405
- src/lib/parcels/lookup-flow.ts
- src/lib/admin/parcel-lookup.ts:215-312
- src/app/api/parcels/lookup/types.ts:185-200

I ran node -e on copies of the pure functions. mobile/src/lib/parcelSearchMatch.ts imports `@/lib` aliases, so a direct import fails. I copied the bodies of isIntersectionQuery and isOverCandidateCap verbatim from the file. I wrote hasHouseNumber as the plan defines it: a digit anywhere before the first comma. Local test stack (127.0.0.1:55322) was read with SELECT only inside BEGIN READ ONLY, giving counts only. MD lines (RR-0442..0452) are bounds, not re-read.

## Checked and clean
- String count 426 to 427 is real. sbindArm (screen-checks.mjs:378-405) sums `Object.keys(content).length` over the converted surfaces. My own sum over scripts/surfaces/.../*.content.json for the 17 converted ids is 426 today. One new key `help.mailto.wrong_lot` in web_help.content.json gives 427. The L5 edits change values only, so they add no keys. The two pinned literals sit at surface-validate.logic.test.ts:93 and surface-conformance.logic.test.ts:258. DeepSeek#7 (a mailto part may add two strings) is answered: strings are content keys, so a mailto part adds one.
- The `:417` truth-table line holds `showMiss).toBe(false)` for the `isFetching: true` case. Line 397 is the `RateLimitError(0)` case with `unexpected: true`.
- schemas.ts: `.strict()` is at :428, the enums at :424-425, and the AC3 fixture literals `semi_half` and `doubt_multi_parcel_abut` are enum members. A ParcelLotFormSchema fixture with `extra:1` is red today and `triplex` stays rejected.
- "Server always sends resolution" is true. lookup-flow.ts sets `resolution` at :42, :53, :66 and :94. The response schema declares `resolution: z.enum(RESOLUTIONS)` as required (types.ts:191). `ConsumerParcelLookupResponseSchema.parse(response)` runs before return, and the route sends `ok(body)` (route.ts:142). The mobile schema keeps it `.optional()` (schemas.ts:436), so only an older server or build can omit it.
- SEARCH_MIN_QUERY_LEN already comes from the slice (SearchBinding.tsx:38). The slice value is 3 (generated slice :6). The typed 3 is only in the copy: "Enter at least 3 characters…" at content.json:15 and "Type at least 3 characters to search." at :21. The plan's L5 is real.
- Expected results of the new cases through the pure functions (hasHouseNumber, isIntersectionQuery, cap 10):

| Query | hasHouseNumber | isIntersectionQuery | Plan expectation holds? |
|---|---|---|---|
| "Gerrard St" | false | false | yes |
| "Elm" | false | false | yes |
| "Gerrard St W" | false | false | yes |
| "Gerrard St, Toronto" | false | false | yes |
| "383 El" | true | false | yes |
| "679 Que" | true | false | yes |
| "123 Yongee St" | true | false | yes |
| "Unit 4, 123 Yonge St" | true | false | yes |
| "King and Bay" | false | true | yes, 'intersection' |
| "zzzz qqqq" | false | false | yes, no_match keeps the miss line |
| "123 Main St, Mississauga" | true | false | yes, isOutsideToronto: `mississauga` is in the non-Toronto list |
| "12" | true | false | yes, length 2 is under 3, so showPrompt |

- isOverCandidateCap gives false for counts 0, 1, 3 and 9, and true for 10. So the plan's "today false, so red" holds for the 1-row and 3-row cases.

## rc#1 MED: "Five fixture situations use the no-number query" is three
Plan: §5 risk 4, "Five fixture situations use the no-number query "Bathurst St" (ambiguous, fetching_with_candidates, none_checked)". Same claim in §3 step 15.
Evidence: a script over mobile/__tests__/fixtures/parcelSearch.situations.json printed the query of each of the 21 situations. Only three have query "Bathurst St": `ambiguous` (10 rows, overCap true), `fetching_with_candidates` (3 rows) and `none_checked` (3 rows). The `static` and `redirect` situations carry "Bathurst St" only inside `recent`, not as the query. The plan itself names just three.
Second gap: step 15 says only the "ambiguous" query needs a number. Under 8.1 A the two 3-row situations also change, from `overCap:false` with 3 candidates to `overCap:true` with `[]`, so they need a number too. Under B they stay as they are. So the fixture edit under A is three situations plus their goldens, not one.
Fix: say "three situations, all three get a house number under 8.1 A" and list `fetching_with_candidates` and `none_checked` in step 15.

## rc#2 MED: the plan's one-row text_candidates case cannot come from the server today
Plan: §4 AC1 `"Elm" with [1 Elm Ave 5379936] (5b): overCap true with one row`. This is also the state plan-ux#2 argues about.
Evidence: parcel-lookup.ts, in resolveAddress step 2 (about :300): `if (typeahead.length === 1) { return { match: {...typeahead[0]...}, candidates: [], resolution: 'unique'`. So a street-only query with one row opens that lot today (RR-0442 is about exact matches). It does not return text_candidates with one row. Data: 183 of 8954 streets (2.0%) have exactly one linked address row.
The test as a synthetic payload passes, because the helper reads only `outcome`. The row is only a state the plan's 8.1 A or B does not need to rule on before task 449. Do not present it to the operator as a reachable state.
Fix: label case 5b "synthetic: server returns 'unique' for one row until 449" in §4, and drop the one-row scenario from the 8.1 wording.

## rc#3 LOW: hasHouseNumber is wider than the server's own rule, and the "Highway 27" claim is unproven
Plan: §3 step 2d, "true when the text before the first comma contains a digit. It copies the server's comma cut". §5 risk 9, "'Highway 27' has a digit, so it lists as today."
Evidence: parseFreeTextAddress (parcel-lookup.ts, the function that opens `const withoutCitySuffix = stripTrailingUnit(q.split(',')[0]…`) tests the digit only on the FIRST token: `if (m && /\d/.test(m[1]!))`. The plan tests any digit before the comma. Differences, run in memory: "Unit 4" and "Highway 27" are true for the plan, but the server reads num '' for both and takes the street-only typeahead path.
Data: on the stack, `linear_name_normalized LIKE 'HIGHWAY 27%'` returns 0 rows. No linked street name contains a digit (0 of 8954 distinct names). So "Highway 27" would return no_match, not "lists as today". Risk 9's claim is unsupported on this stack. The stack may lag production, and the normalisation of highway names is UNVERIFIED.
Fix: either test the first token like the server, or drop the "lists as today" sentence from risk 9.

## rc#4 MED: data answer for the refine line "More than 10 lots match" (counts only)
This is the stack's address_points joined to parcels, live rows only (status NULL/CURRENT/NONE, maint_stage REGULAR, not retired). It counts distinct (parcel, address) per exact normalized street name, which is the server's no-number typeahead filter without the trailing `%`. So it is a floor on rows.

| Rows for a street-only query | Streets | Share |
|---|---|---|
| 10 or more (the line would be true) | 7546 | 84.3% |
| 2 to 9 (text_candidates shown, the line would be false) | 1225 | 13.7% |
| exactly 1 (server answers 'unique', no list) | 183 | 2.0% |
| total | 8954 | |

The query path with `LIKE name%` (parcel-lookup.ts:287-298) matches longer names too, so a short typed prefix returns more rows. Samples with the prefix, capped at 10: GERRARD 10, ELM 10, BATHURST 10, QUEEN 10, "HIGHWAY 27" 0. Streets with fewer than 10 rows under the exact-name count are about 1 in 7 (13.7%), and these are the cases where the line would be untrue. A further 158 street names appear in live address points with no lot link; they are not in these counts (they return unlinked or no_match, no list).
Meaning for the plan: risk 3 and 8.2 are real, but the false-line cases are about 14% of streets. The three Gerrard rows in the plan's 5a case are only the three the seat listed; the plan's UNVERIFIED line says so, and real GERRARD returns 10 here. The 3-row case in §5 risk 3 ("for a street with 3 rows") is therefore not a Gerrard fact, only a shape the data does hold for 1225 streets.
Fix: in 8.2, put the 84/14/2 split next to the wording question so the operator sees how often "More than 10" is false.

## Unverified
- Nothing run beyond node -e and read-only SELECTs; no test runner, no generators.
- Production data and the highway-name normalisation (rc#3).
- The plan's "paused first fetch reports isFetching false" (library behaviour), "projection list accepted by surface-validate", and Next resolving the slice JSON import were not checked; they are the plan's own UNVERIFIED items.

STATUS: 4 findings (0 CRITICAL, 0 HIGH, 3 MED, 1 LOW); the plan's counts, expected test results and "resolution always sent" are real, except the "five fixtures" count (three), the one-row Elm case (unreachable from the server) and the "Highway 27 lists as today" claim.
