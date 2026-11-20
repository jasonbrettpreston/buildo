# REPORT.md - BL-MOBILECI (task-354, MOBILE.CI-1, Increment 1B)

## Plain lines for the operator
1. Mobile CI has failed since the lanes of 2026-11-19: 18 of 786 phone tests in 6 files on tip 3a36e8b26 (run 44741125636), because no commit hook or push station runs the phone tests, so cases written that day never ran.
2. None was a defect a customer would have seen: every case was an out-of-date test or saved example (a count of 10 where there are 11, a button the approved design removed, a help action the test did not list, a mock the search screen needed), and the app code is unchanged.
3. Fixed by moving each pin to the code and approved design with a dated comment (commit 7badcbb56), and by rewriting the saved expected-screen data of the five report goldens with the app's own output; no test was deleted, skipped or loosened (two got stricter).
4. Operator item (finding F-2): Spec 100's 2026-11-10 note says the legal line sits "directly under the address input"; the approved small pages put the "6 of 10 reports left" line between them. The test follows the approved design; a dated note on that spec line is owed.
5. The next Mobile CI run after your push must show 0 failed files; I could not run the phone tests here, so green is not yet proved.

## Per-case table (the 18 failing tests; paths under mobile/__tests__ unless full)
| file | case | class | cause (file:line, commit) | fix or finding |
|---|---|---|---|---|
| parcelScreens.golden.test.ts | 10 committed goldens | c stale pin | :91; ace05ccee added reports_left golden | 11 names |
| parcelScreens.golden.test.ts | every content key used (CR3-2) | a test wrong | :109; d2cd0d5a2 added 4 web-only footer keys to the shared content file (RR-0270) | used by a golden of either target; mobile-unused set pinned to exactly the 4 footer keys; web golden names pinned equal to mobile names |
| parcelScreens.golden.test.ts | RED planted | a | :127-130; 8a5387194 changed helper message, not literal | literal names 44 and 48 |
| parcelScreens.golden.test.ts | MF-58 legal line | a | :232; ace05ccee, v8 search.html:267-269 order | reports-left then legal where drawn (only reports_left situation) |
| lotMapScreens.golden.test.ts | nothing selected at open | a | :135; fdb6cd266 removed unlinked Continue (LotMapBinding.tsx:239) | unlinked must have none; others select.none |
| reportScreens.golden.test.ts | T1 | c | :110; 08c3cc0c9 sheet change, props never rewritten | props regenerated (5 files) |
| reportScreens.golden.test.ts | T3 | c | :156; same | same |
| reportScreens.golden.test.ts | T4 RED | a | :204; 8a5387194 | literal |
| semiQuestionPage.behaviour.test.tsx | busy while pending | a | :108; Pressable.js:221, test from 0cb9f9470 | busy toBeUndefined idle |
| semiQuestionPage.behaviour.test.tsx | bounded wait | a | :159; same | same |
| lotMapPage.behaviour.test.tsx | smoke multi_parcel_2, multi_parcel_3plus, unlinked, too_many_lots, intersection (5 rows) | a | SurfaceRenderer.tsx:113; d20ddec5e open_help | actions() adds open_help |
| lotMapPage.behaviour.test.tsx | 2 lots ... | a, c | open_help plus fdb6cd266 (light, no facts line), 56e96eed5 (lead line) | light; titles; labels as literals |
| lotMapPage.behaviour.test.tsx | polygon and card select | a | open_help | same |
| lotMapPage.behaviour.test.tsx | real mount unlinked | a | :129; fdb6cd266 | no Continue, Help present |
| parcelSearchScreen.behaviour.test.tsx | suite failed to run (6th file, no counted test) | a | index.tsx:54-56, ace05ccee; AsyncStorage null | 3 mocks |
Full detail with line numbers: causes.md. Class: a = test wrong, c = stale pin or golden moved as data; no case is b (code wrong).

## Evidence
- Commit: 7badcbb56 (hook tail in commit.out: "GATE OK", "POLICY CHECKS OK (commit-msg): 6 file(s)"; pre-commit said "no staged src/ or scripts/ source files, skipping the related-tests run": the hook ran NO test; UNVERIFIED that root tests over the props fixtures pass: report-page-capture --check passes, which is what report-mobile.logic.test.ts compares).
- Checks BEFORE and AFTER (checks.out): surface-validate, emit-mobile-surfaces, surface-registry, consumer-registry, generate-target-files, search/lotmap/semi-question/report-page capture --check, spec-split-check: all exit 0 both times.
- Replay of T1 and T3 (verify-props.mts, run with tsx, not the test runner): old committed goldens FAIL T1 for the 5 page states, regenerated goldens pass all 8 (T1 deepStrictEqual, text rules, 0 unresolved part refs). page_no_ad has 0 ad refs.
- mobile typecheck (typecheck-mobile.out): 13 errors, all missing local modules (@testing-library/react-native, class-variance-authority, ...) from the partial symlinked node_modules; none in a changed line. Root `npm run typecheck` excludes mobile (tsconfig.json:27).
- Not run: mobile jest (cannot run here). The proof is the next Mobile CI run after the push.

## Review rounds (TRIAGE.md)
Plan round r1 (r1-plan.txt, lens-plan/*) and diff round (lens-diff/*, lens-diff2/*): compliance once per list (Specs 90, 98, 99, 100, 136 section 2, 128, standards section 5; 99, 100, 128 split in chunks of about 40000 characters because the whole lists exceed the 120000 bound), code-review, error-paths. Order deviation: the test edits existed uncommitted when r1 ran (rule 16), disclosed in TRIAGE.md. Folded: K1, K2, K3, D-K1.

## Findings by id
- F-1: report-page-capture.ts:14 carries the props member over and no script writes it; it re-stales on the next sheet change. Recommend a props write mode with --check (new task; 08c3cc0c9 left it stale for 4 days).
- F-2: Spec 100 line 144 "directly under the address input" versus v8 order input, reports left, legal (operator item; Grounded: search.html:267-269, SearchBinding.tsx:232-235; Recommendation: a dated note on Spec 100 line 144 naming the allowance line).
- F-3: no hook or station runs mobile jest (task-343 line appended).
- F-4 (observation): context-2026-11-20.md has three ENOENT doc blocks and stale 35 s text (generator), not edited.
- OPEN-1: not added (not named by the task): a behaviour test of the reports-left line, signed-in entitlement cases for the search screen, an explicit unknown-action test.
- Review findings are listed with KEEP/REJECT in TRIAGE.md; verdicts belong to the grounder.

## UNVERIFIED
- Whether Spec 99 section 4 has a query-key row for parcel-entitlement (not grepped).
- Root suite over the changed fixtures (the commit hook ran no tests; the suite runs only at the push station).
- Gate command output (below) once run.

STATUS: blocked (task RUNNING, grounder owed; AC2 waits for the Mobile CI run after the push)
