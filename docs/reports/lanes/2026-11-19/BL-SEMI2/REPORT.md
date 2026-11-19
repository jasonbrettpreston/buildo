# REPORT BL-SEMI2 · task-319 SRCH.SEMI stage 2 · MF-93 (Increment 1·B)

## Six plain lines for the operator
1. The semi question page is now built to the mock you approved: the three answers are cards with a round dot on the left (dark ring when chosen, no tick on the right), the question is 18/24 bold, Continue is 48 px, and the top bar is 56 px with a hairline and a back chevron.
2. Heading width: the stage-1 mock let the small-pages rule "text-wrap: balance" wrap the question at a narrower line than the cards; the mock (regenerated: ~/Buildo-scratch/lanes-20261119/inc1b/semi2/semi-question.html) and the app now give it the cards' full width (cause read from the v8 CSS; not rendered, UNVERIFIED).
3. Three of your four questions are built as drawn in the mock: back chevron, neutral info icon on the subscription notice, secondary Try again and a quiet "Searching" line with no spinner. That is the orchestrator's reading of "Mock looks good", not your word on each one: tell me if any should go back.
4. Q3 (curly apostrophes) is a copy change the mock does not draw: not answered, no string changed.
5. The meter now counts after the answer: Continue asks the lookup again with one flag (semi=answered), and the lot counts once per month only if a report is produced; not-produced and not-evaluated lots stay free, and an unsure lot with no answer still counts nothing. Nothing counts in the app yet because the report producer still returns nothing until 1.3 W.
6. Not proven: the phone screen (no device check, the mock was not rendered), and the mobile jest tests I wrote (the commit hook does not run them and my targeted run was refused); the search and lot map pages did not move (their golden checks are unchanged).

## Change table (element, mock form, where, change, key, test)
| Element | Mock form | Changed in | Key | Test |
|---|---|---|---|---|
| Question heading | 18/24 bold, spans the cards (the one change) | SemiQuestionBinding.tsx question node; lotMap.ts semiHeading (mt-6 w-full text-lg font-bold leading-6) | semi-only | semi-question-design.logic.test.ts "the question heading spans the cards" |
| Answer cards | radio dot left (22 px, 2 px field border; 7 px ink ring chosen), no check icon, text 400 | lotMap.ts semiCard, semiCardChecked, semiCardRow, semiDot, semiDotChecked, semiCardText | semi-only (S.card, S.cardChecked untouched) | design test "the answer cards" |
| Continue | 48 px, radius 12 | lotMap.ts semiSelect | semi-only (search keeps 44) | design test |
| Top bar and back | 56 px, hairline, chevron | header View moved out of the scroll column to the first child of the screen; semiTop, semiBack; icon ChevronLeft | semi-only | design test |
| Entitlement notice | info icon | SemiQuestionBinding.tsx icon Info | value | design test |
| Try again | secondary | variant outline, semiRetry | semi-only | design test |
| Loading | status line, no spinner | one Text role status, semiLoadingText | semi-only | design test |
| Renderer icon table | two icons | SurfaceRenderer.tsx import and ICONS: ChevronLeft, Info | shared, additive | design test source pin |
| Meter call | n/a | see below | n/a | parcel-lookup-gate.infra.test.ts (6 cases), jest cases |

## Meter design as built
- Flag: optional query parameter `semi`, only value `answered`. Schema: src/app/api/parcels/lookup/types.ts (`semi: z.literal('answered').optional()`, refused without parcelId); route reads it (route.ts:87, :90) and the hold becomes `body.lotForm?.unsure === true && semi !== 'answered'` (route.ts:164); log field `semi_answered` (route.ts:190).
- Contract: `semi` added to inputs.field_whitelist in scripts/surfaces/parcel_product/F02/contracts/contract_parcels_lookup.descriptor.json and its census mirror scripts/surfaces/_schema/census/contracts.json; consumer-registry and target-files --check clean with no regeneration needed.
- Client: mobile/src/hooks/useParcelLookup.ts fetchParcelLookup takes `semi?: 'answered'` (parcelId form only); semi-question.tsx `continueToReport`: fetch with the flag, `setQueryData(['parcel-lookup', id], result)`, mark the redirect done, `router.replace(route)`; one press at a time; a failed fetch keeps the page, shows the built error state, no navigation; Try again clears it and the answer stays chosen; if the page is left during the fetch it does not navigate (output review fix).
- Counting is unchanged below the hold: not_evaluated first, then not_produced (page null), then openReport (one row per lot per billing month; repeat = already_counted).

## Proof no other page moved
checks.out BEFORE (head 36bb28d4d) and AFTER (head 7b25b61be), identical lines: `search goldens ok (10)`, `lotmap goldens ok (11)`; surface-validate `S-sbind ok (17 surfaces, 424 strings)` (no string added: no pin moved); `git diff 36bb28d4d HEAD --name-only` lists no search, lot map or disambiguation golden file and no change to mobile/src/constants/parcelSearch.ts; lotMap.ts changed by addition only (semi keys and `backIcon: 22` size), pinned byte-for-byte in the design test. The only goldens moved: the eight semi goldens and their mobile copy.

## Checks (pasted from checks.out) and hook tails
BEFORE and AFTER, all exit=0: surface-validate (S-sbind 424), emit-mobile-surfaces `surfaces ok (4 surfaces, 29 goldens)`, generate-surface-registry `clean (171 rows, 171 descriptors)`, consumer-registry `is fresh`, generate-target-files (no output, exit 0), semi `goldens ok (8)`, search `ok (10)`, lotmap `ok (11)`.
Red (red.out, commit attempt, exit 1): `Test Files 2 failed (2) / Tests 15 failed | 53 passed (68)`.
Green (commit.out): `Test Files 8 passed | 1 skipped (9) / Tests 182 passed | 7 skipped (189)`, `GATE OK`, `POLICY CHECKS OK (commit-msg): 12 file(s)`, `[wf1/inc1b-semi2 6df83425a]`. Fix commit 7b25b61be: `GATE OK`, `POLICY CHECKS OK (commit-msg): 1 file(s)`. The first green attempts were refused: SPEC-DIFF (declared `Spec-diff: N-A ...` as faa6515fb did) and check-backlog-task (task file staged). `npm run typecheck` ran in the hook; mobile `tsc --noEmit -p mobile` (mobile-tsc.out): 13 errors, none in changed source files (missing @testing-library/react-native types in this checkout only).

## Commits (head 36bb28d4d at start)
02cbc5718 prereg and queue row (alone) · 6df83425a build (red tests staged in this commit; the red attempt itself was refused, red.out) · 7b25b61be fix from output review · then the lane report commit.

## Shared lines touched (order the fold with BL-A6)
- mobile/src/components/surfaces/SurfaceRenderer.tsx: the lucide import line and `export const ICONS` (two names added).
- mobile/src/constants/lotMap.ts: semi keys inserted before `helpRow`, and `backIcon: 22` in LOT_MAP_SIZES.
- scripts/surfaces/parcel_product/F02/contracts/contract_parcels_lookup.descriptor.json and scripts/surfaces/_schema/census/contracts.json: `"semi"` after `"unsure"` in field_whitelist.
- src/tests/parcel-lookup-gate.infra.test.ts: cases added inside the SRCH.METER describe.
- .cursor/MCFRONTEND-QUEUE.md: the "Next free id" line (MF-93 to MF-94), notes on MF-84 and MF-92, new row MF-93.
- Not touched: the S-sbind pins (424 unchanged), the consumer registry, generated target files.
- Ledger: ~/Buildo-scratch/ids/MF-93 and round-196 claimed (round numbers 194 and 195 used by MF-92 and MF-91 have no ledger claim; the MF-92 ledger dir has no owner file).

## UNVERIFIED
- Mobile jest suites (semiQuestionPage.behaviour, semiQuestionScreens.golden, useParcelLookup, daylightSearchPages): written/edited, not run (hook does not run them; a targeted jest run was refused by the auto-mode classifier).
- Heading cause (text-wrap: balance) is read from the v8 CSS; the mock was not rendered; no device check; safe-area behaviour of the header moved out of the scroll column.
- A 403 report-limit at Continue shows the existing entitlement notice (copy is a later task).
- Counting in the live app: report-page.ts:23-26 returns null on this head, so nothing counts until 1.3 W.
- The task has no Files: line (hook WARN only).

STATUS: ready
