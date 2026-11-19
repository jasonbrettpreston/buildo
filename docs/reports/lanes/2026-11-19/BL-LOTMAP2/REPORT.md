# REPORT BL-LOTMAP2 (task-362, SRCH.LOTMAP-2)

## The five plain lines for the operator
1. Before: tapping "Get help with an address" (lot map page) or "Report incorrect address match" (search page) threw the person into the phone browser; now it opens Help in the in-app browser sheet (iOS shows Done). Before: the greyed "Choose a lot" button had no line under it; now it shows "Pick a lot on the map or in the list." until a lot is picked, then the line goes (v8 choose-lot.html:278).
2. Not built: the help topic names (lot_match, address_match versus the v8 wrong-lot) are untouched, as told; Terms and Privacy were not touched (they already open in the in-app browser, terms.tsx:146,162); no busy state on the lot map (semi-question.html:130 is the semi page, pinned at semiQuestionPage.behaviour.test.tsx:102).
3. Operator items (design is silent, RR-0233, left unbuilt). (a) If the sheet cannot open, the tap shows nothing; today it only logs the topic. Grounded: maxbldHelp.ts catch; the v8 mocks draw no failure state (UNVERIFIED: not every v8 page was opened). Recommendation: UNVERIFIED by the repo review; a short line on the page, which is a design decision; a Linking fallback would contradict AC1. (b) Android Custom Tab has no Done button; the system back closes it (AC5 statement). (c) When a lot is picked the hint line goes and the Help row moves up by one line; the mock draws no hint in the chosen state (choose-lot.html has pick-hint only at line 278), so this follows the mock; reserving the height is a design choice.
4. Lenses: DeepSeek compliance, code-review, ux, error-paths ran at plan (r1-*) and at output (r2-*); they changed the build: the hint carries accessibilityHint (aria-describedby), one predicate awaitingPick drives disabled and hint, a rejecting-open test, a search-page caller case, a verbatim mock quote, mocks restored after each case, two stale Linking comments corrected. Rejected with file:line: see TRIAGE.md.
5. Unproven: no mobile jest ran (the hook does not run it; CI after the push or a device is needed): the phone look of the sheet and of the hint line (12px text-xs token vs v8 13px), and the new mobile cases are reasoned only.

## Acceptance criteria
| AC | Status | Evidence |
|---|---|---|
| 1 | checked | `git grep -n "Linking.openURL" mobile/src/lib/maxbldHelp.ts` prints nothing (rc=1); maxbldHelp.ts:24 `await WebBrowser.openBrowserAsync(helpUrl(topic, q));`; mocked-expo-web-browser case written first (maxbldHelp.test.ts); red = the refused attempt in red.out (pin tests; the mobile cases are not run by the hook) |
| 2 | checked (mobile case UNVERIFIED, not run) | content key select.hint in mobile_parcel_disambiguation_map.content.json:15; LotMapBinding.tsx pickHint + awaitingPick; case in lotMapPage.behaviour.test.tsx "task-362 AC2" (shown at open, gone after a card press, accessibilityHint set/unset); golden pin in lotMapScreens.golden.test.ts |
| 3 | checked | checks.out AFTER-FINAL: lotmap goldens ok (11); surfaces ok (4 surfaces, 30 goldens); surface-validate ... S-sbind ok (17 surfaces, 426 strings), no new finding; all 9 gates exit=0 |
| 4 | typecheck checked; jest UNVERIFIED | root `npm run typecheck` clean (typecheck.out rc=0); mobile jest not run locally: CI or device owed; mobile tsc has 13 environmental missing-module errors none in the changed sources (typecheck-mobile.out) |
| 5 | checked (cases UNVERIFIED, not run) | callers: disambiguate.tsx:51 and parcel-tool/index.tsx:117 (`open_help: openHelp`; no call sites of openHelp( elsewhere). Cases: lotMapPage.behaviour.test.tsx (press parcel-lotmap-help -> openBrowserAsync lot_match URL), parcelSearchScreen.behaviour.test.tsx (press parcel-search-report -> address_match URL), maxbldHelp.test.ts rejection case (resolves, warns topic only, address absent); Android: system back, stated in maxbldHelp.ts doc comment and here |
| 6 | checked | lotMapScreens.golden.test.ts quotes choose-lot.html:278 verbatim; semi-question.html:130 busy pin belongs to the semi page, existing at semiQuestionPage.behaviour.test.tsx:102 (not a lot map element) |

## Lenses (DeepSeek, repo review tool, narrow lens templates)
- Plan stage (r1-compliance, r1-code-review, r1-ux, r1-error-paths on the context file with the lane plan): 19 findings; changed: rejection test, search caller case, accessibilityHint, one predicate, typecheck/UNVERIFIED wording.
- Output stage (r2-* on review-input.diff with pasted-context.md): 4 lens runs; changed: verbatim mock quote, awaitingPick in disabled/accessibilityState, afterEach restoreAllMocks, stale comments. Every finding adjudicated in TRIAGE.md by this lane against the files.
- "Verified" here means: the DeepSeek lenses plus this lane's reading of the files, and the pre-commit related run for the two root pin tests (commit.out: Test Files 2 passed, 95 tests). Nothing mobile was run.

## Checks and hook tails
- red.out: first attempt refused: "Test Files 2 failed (2) / Tests 2 failed | 93 passed (95)" (S-sbind note expected 426, received 425).
- commit.out (aea5883ad): "Test Files 2 passed (2) / Tests 95 passed (95)", "GATE OK", "POLICY CHECKS OK (commit-msg): 11 file(s)". Refusals met and answered: check-task-files (Files line widened through the backlog CLI, the parenthetical path replaced by the exact content file path).
- Rebase onto wf2/board: already contains head 34d90b858, nothing to rebase, no task-file conflict.
- Node gate script, final checks: see checks.out.

## Commits (branch wf1/inc1b-lotmap2, unpushed)
- aea5883ad feat(126_maxbld_surface_standard): lot map Help in-app sheet and pick hint (code, tests, goldens by scripts, generated slice, task file)
- the docs commit carrying this report (last commit of the branch)

## UNVERIFIED
- All mobile jest cases (lotMapPage.behaviour, parcelSearchScreen.behaviour, maxbldHelp, lotMapScreens.golden) are reasoned, not run; CI after the push.
- Device look of the sheet (iOS Done, Android back) and of the hint line (text-xs vs 13px).
- openBrowserAsync double-tap behaviour (a rejected second call is caught and logged; not measured).
- mobile tsc cannot run clean here: shared mobile/node_modules lacks testing-library and four vendor deps (environment, not this change).
