# REPORT: BL-ROUTE, task-318 SRCH.ROUTE (Increment 1·B)

Status line (Spec 137 rule 3): BL-ROUTE lane · task-318 BUILT · test commit 28554fe1a, review-fix commit d22c3823f, both through the real hooks; no push, no DB.

## What landed
- One test file, src/tests/search-routing.logic.test.ts (8 cases + 1 todo). All four cases already route correctly: no routing code was changed.
- Real code in the test: GET /api/parcels/lookup, resolveAddress, fetchParcelById, readLotForm, then parcelSearchPath (mobile/src/lib/parcelSearchCore.ts). Mocked: db client (by statement text, params asserted, unknown statement throws), map read, auth/limiter edges.

## Case table (fixtures = SAMPLES.md rows as database rows)
| case | fixture | resolution | route asserted | result |
|---|---|---|---|---|
| lot map C.14 | 26 Kenneth Ave (row 9) | multi_parcel, map with lots 5112332, 5427844 | /(app)/parcel-tool/disambiguate?q=26%20Kenneth%20Ave&kind=multi_parcel | green |
| unlinked | 76R Abbott Ave (row 10) | unlinked | .../disambiguate?...&kind=unlinked | green |
| candidates B.1 (unclear) | Derwyn Road (row 12) | text_candidates | null (list in place) | green |
| two lots, two printed addresses | 32 Acacia (counter-case) | text_candidates, no map | null | green |
| semi D.1 | 49 Canoe Cres (row 5, unsure true) | unique + lotForm.unsure | report route /(app)/parcel-tool/5002012; mount source holds the redirect to semi-question | green |
| clear semi | 33 Rockbank Cres (5b) | unique, unsure false | report route, no question | green |
| lotForm null | 49 Canoe, no view row | unique, lotForm null | report route, no question | green |
| one lot | 41 Derwyn Road, Toronto (row 1) | unique | /(app)/parcel-tool/5293897 | green |
| mis-typed | 41 Derwin Road (row 7) | no_match | none | it.todo (OPERATOR item) |

## Evidence
- Red (AC6): real commit attempt through the hook with a one-line mutation of classifyRows (mutation.diff): red.out line 731 and 737 `expected 'text_candidates' to be 'multi_parcel'`, "Tests 1 failed | 6 passed | 1 todo (8)". Mutation reverted before the real commit (git status then showed only the three staged files).
- Green: commit.out `[wf1/inc1b-route 28554fe1a]`; fix round commit2.out `[wf1/inc1b-route d22c3823f]`, line 733 `Tests 8 passed | 1 todo (9)`. Typecheck ran inside the hook (the first attempt caught my import of mobile modules, TS2307, and I removed it).
- Reviews: r1-plan.txt (27 findings) and r2-output.txt, every one triaged in TRIAGE.md.

## OPERATOR items
1. Mis-typed address -> candidates (task title, RR-0182 "a mis-typed address"). Grounded: parcel-lookup.ts:286 returns no_match; SAMPLES.md row 7 (41 Derwin Road: exact 0, typeahead on DERWIN% 0, unlinked 0; the prefix 41 Derw finds 41 Derwyn Rd); no fuzzy rule exists (grep of src/lib/admin/parcel-lookup.ts, CURRENT-SEARCH.md B.1/B.9). Recommendation: leave as the no-match message (B.9) for 1·B, and add a typeahead-on-miss retry (drop the last letters of the street, show the B.1 list) as its own task with the copy designed; it is a matching rule plus copy, not routing.
2. The report meter runs on the q lookup for a parcel_tool holder (route.ts:161 openReport) before the semi question shows, so an unsure lot is counted before the question. Grounded: route.ts:129-161. Recommendation: confirm that counting before the question is intended (one row per lot per month, so no double count); no change made.

## UNVERIFIED / limits
- deriveMatchType, parcelSearchRoute and needsSemiQuestion are not loaded by the root test (they import the app's `@/lib/...`, root typecheck TS2307); outcome = server resolution (parcelSearchMatch.ts:183-186) and the mount redirect is checked by reading mobile/app/(app)/parcel-tool/[parcelId].tsx. Their locks are jest tests in mobile/__tests__, which the commit hook does not run; I did not run them.
- Semi page content is task-319 (not built); the test asserts the route and the mount redirect only.
- Intersection (B.4/B.10, LS.11) is not one of the four cases: not tested.
- Context-pack generator defects seen (for the orchestrator): doc-2 and McStorage blocks reported ENOENT with the label prepended to the path; the string "undefined" in the Storage set-up bullets.
- AC1 "committed alone": the plan was pre-registered in the context file and the task plan before any code, but not in a separate commit (the brief fixes one commit).

STATUS: ready
