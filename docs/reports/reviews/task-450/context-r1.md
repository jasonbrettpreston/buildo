# Review context for task-450 (no plan id) written 2026-11-24 by backlog-brief.mjs (round 1)

## Task
task-450 SEARCHFIX.2 Search page: a street with no number asks for a house number; no-match flicker, strict lot-form check, typed "3", double retry message and the wrong-lot help topic corrected
status: LATER · milestone: m-1 · assignee: none · labels: SEARCHFIX-PRIORITY

## Description
Card opened 2026-11-24 by the orchestrator, Spec 137 rule 2, on the operator's rulings: RR-0444 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290, fold the findings), RR-0447 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2308, add the new tasks with the search-fix labels, dependencies and order) and RR-0448 (the 8 merged cards). Source: the fold plan docs/reports/reviews/mcfixreborn-fold/FOLD-PLAN.md, task 2 (FIX.SEARCH-PAGE); every finding was ruled by a separate grounder (RR-0387, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1943; records under docs/reports/reviews/mcfixreborn-g1 to -g4). The plan's section 2 lines are this card's acceptance tests, each red first. Nothing is added that the plan or a ruling does not name (RR-0392, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975).

What changes, in plain words: on the phone and web search pages, a street typed with no house number shows the existing "add a house number" line. The "no match" line no longer flickers on a re-fetch; one extra field in a lot no longer fails the form; the minimum length comes from the setting, not a typed 3; a retry-after of zero shows one message; the semi page opened cold and offline does not redirect early; the help page gains the topic "Wrong address or lot" and both search links point at it.

Findings folded: 2a (phone side), V4, V5, L1, L3, L5, N4, R2, R4, R5 (golden header), B.7 (topic and the two search-page links), Q4, Q8, Q19 (the shim).

OPEN, to be grounded at the plan stage before it reaches the operator (RR-0443 b): with no house number, the line alone (recommended, the 2026-09-16 rule at mobile/src/lib/parcelSearchMatch.ts:12-13) or the line plus the close-address list.

Dated notes owed: Spec 99 (the redirect-once pattern); task-319.

Files: mobile/src/lib/parcelSearchMatch.ts, mobile/src/lib/semiQuestion.ts, mobile/src/lib/schemas.ts, mobile/src/components/surfaces/SearchBinding.tsx, src/components/surfaces/web/SearchBinding.tsx, scripts/surfaces/_schema/static-page.json, scripts/surfaces/_schema/static-page.schema.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.content.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.descriptor.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_semi_question.content.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_semi_question.descriptor.json, mobile/src/generated/surfaces/mobile_parcel_search.json, mobile/src/generated/surfaces/mobile_parcel_semi_question.json, mobile/__tests__/parcelSearchMatch.test.ts, mobile/__tests__/parcelSearchScreen.behaviour.test.tsx, mobile/__tests__/semiQuestionPage.behaviour.test.tsx, mobile/__tests__/schemas.test.ts, mobile/__tests__/daylightSearchPages.golden.test.ts, src/tests/surfaces/search-web-binding.ui.test.tsx, docs/specs/03-mobile/99_mobile_state_architecture.md, src/tests/fixtures/surfaces/

## Acceptance criteria
- #1 A query with no house number shows the existing refine line
- #2 A settled miss fetched again keeps the no-match line
- #3 A lot form with one extra field parses; the closed enum lists stay
- #4 The minimum-length copy is filled from the setting, not a typed 3
- #5 The semi page opened cold and offline does not redirect before the lookup settles
- #6 The help page has the topic wrong-lot and both search links go to it

## Implementation Plan
Planner: Cairn-Plan-450
Plan id: PLAN-450-v1

Read-only. I ran no tests, hooks or generators and wrote no file. File:line references were read at board head 5a26374b9. MD means ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md.

#### 1. Rules quoted first
- RR-0442, MD:2276: "It should open on an exact match and we have a different process for address mistakes".
- RR-0443 c, MD:2284: "What happens with a partial address? Similar to an address mistake they need to select from the available addresses that are close".
- RR-0444, MD:2290: "Now we need to fold the findings (1) Valid Compliance finds". RR-0447 is at MD:2309 and RR-0448 at MD:2315 (the cards).
- RR-0445, MD:2296: "we are mobie first - we always take that approach but it works onthe web".
- RR-0392, MD:1975: "I don't think we need any other infastrcuture beyond this".
- The 2026-09-16 rule, mobile/src/lib/parcelSearchMatch.ts:12-13: "beyond the cap, ask for a house number instead of listing". It is repeated at mobile/src/constants/parcelSearch.ts:20: "ask for a house number, do not list." No verbatim operator words were found (GROUNDER-QUESTIONS.md:127).
- Spec 99 §6.5, docs/specs/03-mobile/99_mobile_state_architecture.md:527: "A render gate condition ... MUST evaluate to the same value across consecutive renders". Line :530 marks isFetching as BANNED. Line :782 says a §5 change "requires a WF1 amendment with adversarial review".
- The lookup's additive rule, mobile/src/lib/schemas.ts:370-371: "a server-added field never raises ParcelLookupSchemaError on an installed build".
- doc-2:49 (B.7): "Get help with an address (to /help?topic=wrong-lot)". The mock note in ~/Buildo-scratch/mcfrontend/small-pages-v8/help.html reads "Topics: General · Wrong address or lot · Billing".
- The grounder records this plan follows:
  - GROUNDER-B (g3) D1: delete `.strict()` (L1). D2: delete `&& !isFetching` (V4). D3: gate on settled data, not isFetching (V5). D5: dated note in Spec 99 (N4). D6, D8: descriptor text (R2). D7: projection "list" (R4).
  - GROUNDER-H D2: `retryAfterSeconds == null` (L3). D4: `{min}` bound to the slice value (L5). D6: semi busy state (R4).
  - GROUNDER-D D7: "three" becomes "two" (R5).
  - GROUNDER-QUESTIONS :62 (Q8, the curly apostrophe), :60 (Q6/B.7) and :73 (Q19: "Delete this block ... and it now does").

#### 2. What exists and is reused
- The refine line already exists: content key `list.refine` (mobile_parcel_search.content.json:8). It is drawn when `overCap` is set (mobile SearchBinding.tsx:214, web SearchBinding.tsx:243). The cap test is `isOverCandidateCap` (parcelSearchMatch.ts:212).
- The intersection query-shape check `isIntersectionQuery` (:154-164) is the pattern for a check on the typed text.
- `sliceNumber` (mobile/src/lib/sliceConfig.ts:14, no imports) and `SEARCH_MIN_QUERY_LEN` (SearchBinding.tsx:38) already carry the minimum length.
- Templates `{text, vars}` already fill values on both platforms (the chip label at :116; web resolveWebValue :317-320).
- The `open_help` action exists. On the phone, helpUrl (mobile/src/lib/maxbldHelp.ts:15) builds the link with the topic in the URL fragment. The web builds it at SearchBinding.tsx:385-387. On the help page, the HelpPrefill island matches the link by data-topic (HelpPrefill.tsx:34-35). Help topics are prose `mailto` parts (static-page.json:19-46) checked against a closed enum (static-page.schema.json:179-187).
- The redirect-once hook is `useSettledRedirect` (mobile/src/hooks/useParcelPageHooks.ts:16-25). It is not changed.
- Generators (the build runs them, never hand edits): scripts/surfaces/emit-mobile-surfaces.mjs --write, scripts/surfaces/search-golden-capture.ts --write, the semi golden capture, and surface-validate --check.

#### 3. The change, file by file, in build order
1. mobile/src/lib/schemas.ts:428 (L1). Old: `.strict()`. New: delete that word. The enums at :424-425 stay. Also reword the comment at :370-371 ("The client derivation ... runs only when resolution is absent"), because step 2a removes that derivation.
2. mobile/src/lib/parcelSearchMatch.ts:
   a. Q19, :193-208. Delete both blocks: the declared-matchType path and the TODO(contract) count derivation. Replace them with one line: `return isIntersectionQuery(trimmed) ? 'intersection' : 'no_match';`. A payload with no `resolution` is then read as the server's no_match. Add one dated sentence to the header at :20-24 and reword :169-170.
   b. L3, :298. Old: `!retryAfterSeconds`, which shows two messages for 0. New: `retryAfterSeconds == null`. Change :288 from "pinned, not fixed" to "MF35-DF1 closed (task-450)".
   c. V4, :351. Old: `showMiss: outcome === 'no_match' && !isFetching && error == null`. New: drop `&& !isFetching`. Reword :275.
   d. 2a, phone side:
      - Add a pure helper beside :154, `hasHouseNumber(q)`: true when the text before the first comma contains a digit. It copies the server's comma cut (src/lib/admin/parcel-lookup.ts:225-226).
      - In buildSearchSituation (:340-350), compute `noNumber = outcome === 'text_candidates' && !hasHouseNumber(debounced)`.
      - `overCap` becomes `noNumber || isOverCandidateCap(...)`. The refine line already reads overCap, so no new field is added.
      - Under option 8.1 A, candidates become [] when noNumber. Under option 8.1 B, they are unchanged.
3. mobile/src/lib/semiQuestion.ts:72-74 (V5). Old: no data, no error and not fetching redirects to Lookup. That fires on a cold offline open, because a paused first fetch reports isFetching false. New: no data with a parcelId is 'loading'. Only an empty parcelId redirects to Lookup. isFetching is no longer read there; the argument stays in the type so callers do not change (see 8.4).
4. scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.content.json:15 and :21 (L5): "at least {min} characters". mobile_parcel_semi_question.content.json:4 (Q8): "Yes, it’s one half of a semi".
5. mobile/src/components/surfaces/SearchBinding.tsx:
   - :47 DERIVED_NAMES gains `/^min_query_len$/`.
   - :84 the input hint and :221 the prompt become templates `{text, vars: {min: derived('min_query_len')}}`.
   - :208 the topic becomes 'wrong-lot'.
   - searchData.derived (:254-260) gains `min_query_len: SEARCH_MIN_QUERY_LEN`.
6. src/components/surfaces/web/SearchBinding.tsx:
   - :125 the input description and :245 the prompt become the same templates.
   - :237 the topic becomes 'wrong-lot'.
   - searchWebData.derived (:273-279) gains `min_query_len`, read by `sliceNumber` from the mobile generated slice through relative imports, the way :26 already imports parcelSearchCore.
7. scripts/surfaces/_schema/static-page.schema.json:179-187: the topic enum gains "wrong-lot".
8. scripts/surfaces/_schema/static-page.json, after :30: add one mailto part to web_help with content "help.mailto.wrong_lot", topic "wrong-lot" and value "support_inbox". The old topics stay; task 3 moves the map links.
9. scripts/surfaces/parcel_product/F06/surfaces/web_help.content.json — OUTSIDE FILES LINE. It needs "help.mailto.wrong_lot": "Wrong address or lot" (the mock's words). The page throws on a missing key (static-web-binding.ui.test.tsx:118-119).
10. mobile_parcel_search.descriptor.json (R2). Text only, as dated "prior text kept" sentences:
    - metering :419-421: the page counts nothing; the lookup it calls counts a produced report (F02).
    - flag :231: "MAXBLD_WEB_LIVE (web target only)". A string is allowed (surface.schema.json:1238-1250).
    - notes :536 and product_questions :576 and :586: closed by MF-45 D-4 a and MF-53.
    - data_story :6 and under_126 :7: name the Layer 4a recent-searches store.
    - Re-point the cites past the end of the 128-line index.tsx (:35, :266, :282, :369-373, :405) to SearchBinding.tsx and parcelSearchMatch.ts.
    - Add `min_query_len` to the derived-name list in deviations[1] (:510).
    - Add one sentence to check :266 saying refine also shows with no house number.
    - The MF-50 lead_gen deviation (:516-520) stays; src/tests/parcel-tool-meter.logic.test.ts:240-250 reads it.
11. mobile_parcel_semi_question.descriptor.json (R4): projection :166 "none" becomes "list" (see section 6, risk 1). Add one sentence to under_126 (:7) naming the busy overlay. There is no "busy" state name in the closed list.
12. mobile/__tests__/daylightSearchPages.golden.test.ts:7 and :43 (R5): "three" becomes "two".
13. Regenerate the two slices (mobile/src/generated/surfaces/*.json) and the goldens under src/tests/fixtures/surfaces/ with the generators. The content and descriptor fingerprints change, so every search, semi and web_help golden moves.
14. docs/specs/03-mobile/99_mobile_state_architecture.md: a dated note (section 7).
15. Test-side edits OUTSIDE FILES LINE, each needed because it pins old behaviour:
    - src/tests/surfaces/surface-validate.logic.test.ts:93 and surface-conformance.logic.test.ts:258: the string count goes from 426 to 427, with a dated comment.
    - mobile/__tests__/fixtures/parcelSearch.situations.json: rate_limited_zero errors.unexpected becomes false. Under 8.1 A, the "ambiguous" query "Bathurst St" also needs a house number.
    - mobile/__tests__/parcelScreens.golden.test.ts:160-169 and surfaceRenderer.smoke.test.tsx:76-82: the MF35-DF1 pins.
    - surfaceRenderer.smoke.test.tsx:41 and src/tests/surfaces/static-page.logic.test.ts:229-234: the address_match topic.
    - mobile/__tests__/semiQuestionScreens.golden.test.ts:155-156: redirect_no_data now expects loading.

#### 4. Tests first (red, then green), by acceptance line and fold section 2 line
AC1 / fold :42. New describe in mobile/__tests__/parcelSearchMatch.test.ts, "a street with no house number". The rows are the typed-address seat's real data:
- "Gerrard St" with text_candidates [1 Gerrard St W 5440777, 1000 Gerrard St E 10640216, 1001 Gerrard St E 5402856] (seat 5a): overCap true. Today false, so red.
- "Elm" with [1 Elm Ave 5379936] (5b): overCap true with one row.
- "Gerrard St W" with text_candidates [1 Gerrard St W 5440777] (case 6 after task 449): overCap true, route null.
- "Gerrard St, Toronto" with the 5a rows: overCap true.
- Each no-number case also asserts candidates: [] under 8.1 A, or the rows under B.
- Number cases keep the list and show no refine line:
  - "383 El" [5106944, 5461541, 5191692]
  - "679 Que" [5476455, 5497535]
  - "123 Yongee St" [5179889, 5464983]
  - "Unit 4, 123 Yonge St" [5464983]
- Other states:
  - "King and Bay" with no_match is 'intersection' with no refine line.
  - "zzzz qqqq" with no_match keeps the miss line.
  - "123 Main St, Mississauga" is outside_toronto.
  - "12" shows the prompt.
- mobile/__tests__/parcelSearchScreen.behaviour.test.tsx: typing "Gerrard St" over the 5a rows shows parcel-search-refine (under A, no parcel-candidate-*). The helpers `hit` (:48) and `list` (:49) gain `resolution`.

AC2 / fold :43 (V4). The truth table at :417 flips to `toBe(true)`. Add a case: the same no_match data with isFetching false, then true, keeps showMiss true. Red today.

AC3 / fold :47 (L1). mobile/__tests__/schemas.test.ts:
- ParcelLotFormSchema parses {detected:'semi_half', basis:'doubt_multi_parcel_abut', unsure:true, extra:1}. Red today.
- ConsumerParcelLookupResultSchema parses with that lotForm.
- detected:'triplex' still throws, so the closed enums stay.

AC4 / fold :45 (L5):
- parcelSearchScreen.behaviour: typing "12" shows "Type at least " + SEARCH_MIN_QUERY_LEN + " characters to search.".
- search-web-binding.ui.test.tsx "templates are filled": the prompt and the description carry no "{min}".
- Both content strings contain "{min}" and no "3". Red today.

AC5 / fold :46 (V5). mobile/__tests__/semiQuestionPage.behaviour.test.tsx: with parcelId PCL-S1, data undefined, isFetching false and no error, replace is not called and the loading state shows. Red today. An empty parcelId still goes to Lookup.

AC6 / fold :48 (B.7):
- search-web-binding.ui.test.tsx:121-125: the href is `/help#topic=wrong-lot&q=...`.
- New case: the search link's topic is a mailto topic of web_help in static-page.json. Red today.
- parcelSearchScreen.behaviour :162: the help link opens `https://maxbld.ca/help#topic=wrong-lot&q=Bathurst%20St`.

Fold :44 (L3). parcelSearchMatch.test.ts:397: `unexpected: false`. Red.

Fold :49 (Q19):
- New: "a payload without resolution is no_match even with a match". Red; it is 'unique' today.
- The tests at :82-143 move to `withResolution`. The withDeclaredType tests (:104-116) go with block 1.

Fold :50-51 (Q8, R2, R4, R5): text only. surface-validate --check and the golden tests prove them.

Phone: no 2-character request (seat case 29). The existing hook rule at useParcelLookup.ts:83 is unchanged.

#### 5. Limits, and what could fail or surprise
Limits:
- No server change (task 449) and no new resolution value.
- The map links keep address_match and lot_match (task 3).
- The web search page stays static (task 393).
- The cap of 10 and the `list.refine` wording are unchanged.
- static-page.json:2 (R5) and the nav and follow-ups headers stay with tasks 3 and 8.

Risks:
1. A LIST surface marked generated with projection "list" requires render.list.columns (surface.schema.json:3704-3790). R4 may therefore be refused by surface-validate. Fallback: keep "none" and add a dated sentence instead. Detected by surface-validate --check.
2. Until task 449 lands, "Gerrard St W" still opens a lot as 'unique'. The phone rule acts on text_candidates only.
3. `list.refine` says "More than 10 lots match". For a street with 3 rows that is false (see 8.2).
4. Five fixture situations use the no-number query "Bathurst St" (ambiguous, fetching_with_candidates, none_checked). Under 8.1 A the list golden empties unless its query gains a number. The golden tests detect this.
5. Q19 makes an older server's match a miss. The server always sends resolution (lookup-flow.ts:42, :53, :66, :94, per GROUNDER-B).
6. V5: a disabled query (no token) with an id would show loading for good. The app gate should keep signed-out users off this page. UNVERIFIED.
7. Clashes in the same wave: task 8 owns surfaceRenderer.smoke.test.tsx; task 3 owns static-page.logic.test.ts and static-page.json. Merge order matters.
8. Spec 99:782 asks for a WF1 amendment for §5 changes. A reviewer may refuse a dated note there; §6.5 is the other place for it.
9. A text like "Highway 27" has a digit, so it lists as today.
10. `overCap` now means "show the refine line". Its comment says so.

#### 6. Dated notes and card notes owed
- Spec 99, a hand edit of the spec file, in the M-246 form ("Dated note 2026-11-2x (M-246, prior text kept; task-450 SEARCHFIX.2; RR-0444 MD:2290 ...)"), placed after §5.1. It says:
  - the MaxBLD parcel-tool pages navigate once per settled outcome through useSettledRedirect (useParcelPageHooks.ts:16-25);
  - the dependencies name the route string;
  - the semi page reads no data with an id as loading, never as a redirect.
- task-319, through `node_modules/.bin/backlog task edit 319 --append-notes "..."`: `.strict()` was removed from the lot form; the enums stay.
- task-450, through the same CLI: --plan, the acceptance checks and --append-notes. The notes include MF35-DF1 closed, the 8.x answers as verbatim dated rows (DoD #5), and the evidence (sha, tests, hook result).

#### 7. Open choices (not decided)
8.1 With no house number: (A) the "add a house number" line alone, or (B) the line plus the close-address list.
- For A:
  - The 2026-09-16 rule, parcelSearchMatch.ts:12-13 and constants/parcelSearch.ts:20: "ask for a house number, do not list".
  - The grounder found the list is "the first 10 addresses alphabetically, not the 'close' ones" (GROUNDER-QUESTIONS.md:33), and said A is "already answered by the 2026-09-16 ruling plus RR-0443 c" (:36).
  - The card records A as its recommendation.
- For B:
  - RR-0443 c (MD:2284): a partial address picks "from the available addresses that are close".
  - The fold plan question 7.2 (FOLD-PLAN.md:207) notes the 2026-09-16 words were not found.
  - RR-0446 and RR-0448 left this choice unruled (MD:2304, :2316).
- Cost: A moves the list golden and fixture (section 5, risk 4). B changes no golden, but next to a list of fewer than 10 it shows "More than 10 lots match", which contradicts itself.
- Recommendation: A, ruled by the operator.

8.2 The refine copy: keep "More than 10 lots match. Add a house number to narrow it down." (the card says "existing line"), or reword it. Rewording changes copy on the 10-plus case too. Recommendation: keep it now and raise the wording with 8.1.

8.3 The topic token: "wrong-lot" (doc-2:49, as typed) or "wrong_lot" (the house style of the other topics). Content keys allow only underscores (static-page.schema.json:166), so the key is help.mailto.wrong_lot either way. Recommendation: "wrong-lot".

8.4 V5 shape: (a) the check inside semiQuestion.ts alone (no data with an id is loading), or (b) pass the query's pending status from semi-question.tsx (OUTSIDE FILES LINE, plus fixtures and the capture script). GROUNDER-B D3 offered "status !== 'pending' / isFetched". Recommendation: (a), the fewest files.

#### 8. UNVERIFIED
- Nothing was run: no tests, no generators, no device.
- That an offline, paused first fetch gives isFetching false with data undefined comes from library knowledge (GROUNDER-B UNVERIFIED 2).
- I did not check whether surface-validate accepts projection "list" here.
- I did not check whether the Next build resolves the mobile slice JSON by relative path.
- I did not confirm the exact web golden capture command.
- The seat lists only 3 of the 10 "Gerrard St" rows and 1 of the "Elm" rows.
- The 2026-09-16 ruling's operator words were not found.
- The backlog CLI is at node_modules/.bin/backlog; it is not on PATH.

#### Critical Files for Implementation
- /Users/brettpreston_macmini/Buildo-wt-board/mobile/src/lib/parcelSearchMatch.ts
- /Users/brettpreston_macmini/Buildo-wt-board/mobile/src/components/surfaces/SearchBinding.tsx
- /Users/brettpreston_macmini/Buildo-wt-board/src/components/surfaces/web/SearchBinding.tsx
- /Users/brettpreston_macmini/Buildo-wt-board/mobile/src/lib/semiQuestion.ts
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/surfaces/_schema/static-page.json

## Implementation Notes
(none)

## References
- (none)

## Documents
- (none)

## Decisions in force (titles; the ones this task names carry the operator's words)
- RR-0005 2026-11-18 · Operator direction: page-level lot information in increme
- RR-0087 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0315 Plan: go on sections A and B; tasks added to Increment 1B
- RR-0316 Plan: close check folded as built
- RR-0317 Plan: review enforcement only
- RR-0318 Plan: section E accepted
- RR-0319 C2 failed compute: error screen with Try again, not counted
- RR-0320 C3 legal line at the bottom of the phone search page
- RR-0321 D13 semi page buttons 48 px is the operator ruling
- RR-0322 C5 engine numbers to every paying user at once
- RR-0323 D1 freshness compare left until stored records exist
- RR-0324 Semi page cache write accepted as built
- RR-0088 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0325 Phone keeps its 3 retries (reading)
- RR-0326 Web search legal line at the bottom (reading)
- RR-0327 Page structure to table-driven pages: the five items go ahead
- RR-0328 The app is not in use, in development
- RR-0329 Task 370 dropped from Increment 1B (reading of the answer)
- RR-0330 Six-row table as put, including task-348 answered (reading)
- RR-0331 Report meter stays in the lookup route
- RR-0332 A McFix task may file under the McFrontend row that built what it fixes
- RR-0333 A task is not complete until it works
- RR-0334 Five reviewer-input items agreed, existing mechanisms first
- RR-0092 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0335 Rule 3 two-commit close for lane build and fix tasks
- RR-0336 Items 0 to 8 approved for task-399 and task-375
- RR-0337 Two binding checks added to the existing tasks, full panel on them
- RR-0338 Low-priority findings go to a review pile; Reality-Check and Integration on the additions
- RR-0339 Hardening rounds are warranted and bounded
- RR-0340 Four uncovered parts of the six steps go into the plans, with a second pass
- RR-0341 Loading screen gives up after 60 seconds
- RR-0342 Regression and Reality-Check seats in the lane protocol, by their written triggers
- RR-0343 Compliance documents on a task are labelled as compliance
- RR-0344 Reviews re-run; BUILT needs an output review; seats on plans
- RR-0099 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0345 Pre-launch steps by hand for task-375 then scripted
- RR-0346 The lane fixes and closes a grounder verifies the orchestrator routes
- RR-0347 Reality-Check runs when it cannot be told that no figure changes
- RR-0348 The tool-having seats run on the plan only
- RR-0349 Starting shape compliance on plan and output
- RR-0350 Build authorized tonight open questions grounded and taken as approved
- RR-0351 The cross-read adversary pass is not needed
- RR-0352 Design gaps 1 and 2 resolved now, the plan reviewed first
- RR-0353 The 29 scorecards are resolved the right way
- RR-0354 The spec wording on the cross-read adversary is changed
- RR-0136 Operator: start Increment 1·A
- RR-0355 Scorecard plan agreed, push as soon as possible, gaps in parallel
- RR-0356 A plan for the output review of the built tasks, with a grounded recommendation
- RR-0357 GO for the scorecards, given in the chat before the rehearsal
- RR-0358 The scorecard rehearsal is waived if it gives no benefit
- RR-0359 Nothing is folded before the grounder has ruled
- RR-0360 CLAUDE.md loses the cross check; the wording 'stays available on request' is approved
- RR-0361 Built tasks: ground the old findings and include them in a new pass; plan not approved
- RR-0362 GO on the queue row for migration 334 so the push can be retried
- RR-0363 The protocol shape: rules for the reviewer; plan review, grounding, fold, build, output review, grounding, fold; no review of paperwork
- RR-0364 Medium and low findings recorded not fixed; paperwork tasks get a grounder check, no review
- RR-0137 Operator: completeness, holistic and per-increment optimisation
- RR-0365 Cut the task-423 plan to the five adjustments; panel review, ground, present with tasks ready
- RR-0366 The tasks of the task-423 plan are pre-approved; output reviews limited to something reasonable
- RR-0367 Paperwork yes; plan findings ruled once yes; fix-only re-review held; important medium findings are fixed
- RR-0368 Go on step 1 of the rules sections: the check plus Spec 137, Spec 08 and the engineering standards
- RR-0369 Output round 1 fixes mediums with highs and criticals; round 2 is highs and criticals only
- RR-0370 Task-419 closing round approved on condition; station option C plus the one line; spec rules sections as later board tasks
- RR-0371 Round caps: two rounds on the plan, then to the operator; three rounds on the output
- RR-0372 Task-423 fix round; per-document form stays the default; joining decided by a three-run measure in task-427
- RR-0373 RR-0372 is withdrawn: the operator did not approve it
- RR-0374 Task-423 fix round approved (step 1); rules sections approved when they arrive (step 2)
- RR-0139 Operator: push 6, re-sort, answer page
- RR-0375 Task-423 closes if it is verified
- RR-0376 Step 2 re-scoped: Spec 137 and Spec 08 left as they are; engineering standards rule list and handbook; a look at what front-end tasks attach beside Spec 136
- RR-0377 RR-0376 is planning only: nothing starts on the step 2 re-scope
- RR-0378 Review-inputs plan approved and running: handbook plus relevant engineering sections; fresh context; rules-checked line; tasks 427 and 425 removed
- RR-0379 Step 1 runs in parallel; handbook rules are added over time
- RR-0380 Plan 431 questions: surface specs dropped once the handbook holds the critical items; engineering sent by parts now; sections 8, 10, 12 to both sides; by-law tasks gain no engineering rules
- RR-0381 Task-433: the lane reviews with a copy of the launch-commit compliance template (grounded fix approved)
- RR-0382 Engineering standards get a dated note: UI library lines superseded by Spec 126 for the front end
- RR-0383 Plan 431 question 3: tasks that edit the surface specs keep those specs attached
- RR-0384 Task-430 scope approved: stop the handbook clipping, lines reflect their dated notes, add the 13 lines (item 9 a pointer)
- RR-0140 Operator: faster pushes and GOs asked
- RR-0385 McFix Final plan: Opus plans and builds, engineering seat, two rounds, validation without the operator, unbuilt gates withdrawn, tests are the focus
- RR-0386 Task-367: gates parked, handbook tests start fresh; landing gates A and B is a later decision with its own card
- RR-0387 McFixReborn: each built task gets its own output review and confirmed findings are fixed by ordinary fix tasks; no new infrastructure; old findings dropped — "Approved. You run it.  Let's call this the McFixReborn" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1941)
- RR-0388 McFixReborn waits until the new tests are in place
- RR-0389 The model conflict is resolved by updating the key specs and docs themselves
- RR-0390 task-430 output review size: option A, one larger review message, tried once
- RR-0391 a card to widen the security lens; McFixReborn next once these close
- RR-0392 one push for all four; no other infrastructure beyond this — "Push for all 4. I  don't think we need any other infastrcuture beyond this.. we are good to go!" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975)
- RR-0393 McFixReborn next, continued after tasks 424 and 386
- RR-0394 security lens option A: API routes and library code
- RR-0141 Operator: Q-LT-1
- RR-0395 one small task adds the missing handbook lines before task-439 lands
- RR-0396 the handbook task adds the R-22 line only; no seam sentence on fe.49
- RR-0397 chain more pushes together: fewer, larger pushes
- RR-0398 the one-list task writes one Files entry with a star (option A)
- RR-0399 rule fe.36 is marked partly in the rule look
- RR-0400 R-22 only was not a limit; what is best governs
- RR-0401 investigate the typed 10 percent circulation text on the houseplex option
- RR-0402 circulation text: option A, drop the percent; card opened
- RR-0403 circulation text fix merged into task-442; no separate process for task-447
- RR-0404 planner redirect approved: task-447 planner returns a section for task-442
- RR-0143 Operator answer IMG-1: six lot-size bands
- RR-0405 houseplex size basis wording: the basement, not shared stairs and halls
- RR-0406 McFixReborn label on the tasks that process covers
- RR-0407 next push as soon as possible; does not wait for task-442
- RR-0408 McFixReborn in merged groups by shared files; map validated before anything proceeds
- RR-0409 McFixReborn map: the three hand-written schema files are reviewed; a plan is needed for the oversized files
- RR-0410 McFixReborn map: the script with no rule-list row is not reviewed
- RR-0411 McFixReborn label stays on task 349; merged groups move forward
- RR-0412 task 386 merged into McFixReborn; tasks 442 and 367 run once the push lands
- RR-0413 task-367: the three handbook rows flip to RULED with their tests; the operator confirms the three rows
- RR-0414 task 442 re-makes only its three changed lists; five McFixReborn map decisions
- RR-0012 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0144 Operator answer PRG-1: purge rule
- RR-0415 McFixReborn group reviews outside a lane: liked, to be grounded; tasks 442 and 367 to be running
- RR-0416 Operator pre-approves removing lane work folders to free disk space
- RR-0417 FE-51 tab switch may read RULED with its two named owned exceptions
- RR-0418 Rule lists per task are cut down by turning lists off in the table
- RR-0419 The rule-list table edit is approved as one task
- RR-0421 Rule-list decisions 1 to 4: all four recommendations approved
- RR-0420 Review-cost problems join the rule-list plan: plan, ground, then recommend
- RR-0422 Review-cost task: Minimum package, decision 1 stays at a
- RR-0423 Review-cost task: two small fixes added, plan approved, move forward
- RR-0424 Task 448 also corrects the close check's refusal-message sentence
- RR-0145 Operator answer TRK-1: tracked lots refresh
- RR-0425 Push order: 442 and 367 first, task 448 later
- RR-0426 Task 448: stale launch-script comment fixed; by-law pre-registrations unchanged
- RR-0427 DONE record moves for the pushed tasks, as one batch
- RR-0428 The seven pushed tasks stay BUILT; no review for the DONE word
- RR-0429 Dated notes are kept short
- RR-0430 The six unlabelled running tasks join McFixReborn
- RR-0431 McFixReborn: each set of files reviewed once, output only
- RR-0432 McFixReborn: fold the six first; progress in the orchestrator's table
- RR-0433 The six fold as they are; the group review is their one output review
- RR-0434 McFixReborn proceeds as per the status table
- RR-0146 Operator answer PG-1: pushes and GOs
- RR-0435 The orchestrator may do the merge edits and the test fix for the six
- RR-0436 Option 1 confirmed for the remaining folds
- RR-0437 Task 388 left out of the folds; nine paperwork notes approved
- RR-0438 Task 349 D3: the public web report page is wired at launch
- RR-0439 McFixReborn review calls: 120,000 characters; each list reads only its own files
- RR-0440 plan to drop the planning and process lists from reviews
- RR-0441 McFixReborn reading seats: reality check and integration run, code review dropped
- RR-0442 the search opens a lot on an exact match — "It should open on an exact match and we have a different process for address mistakes, if the lot is shared by two parcels - you need to pick one - if its a semi potentially - you need to state that?" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2276)
- RR-0443 report limit: top-up or higher-subscription screen; questions grounded before they reach the operator; partial address = pick from close addresses — "4) Nbr 2- why is this a defect? yes, they need a screen with a top up or a higher subscription" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2283)
- RR-0444 fold the McFixReborn findings — "Now we need to fold the findings (1) Valid Compliance finds (2) The reality-check and integration - a) resolve the one gap case b) This was my mistake - we need this built either - maybe call it a subscription upgrade with more report room (this was a gap)." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290)
- RR-0147 Operator answer NAME-1
- RR-0445 limit and reactivate screens: mobile first, also on the web, follow the earlier process — "01 - we are mobie first - we always take that approach but it works onthe web.  We follow the same process with all the development - look back and follow" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2296)
- RR-0446 several-lots map stays as built; no-plan page joins the limit-screen task — "04  leave it as it is 02 Agrred add to the plan." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2302)
- RR-0447 clean the board (label dead), review all tasks, then add the search-fix tasks — "(1) all tasks that are no longer needed or merged are given the label dead - this should be all McFix labels" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2308)
- RR-0448 the search-fix cards are created as 8 merged tasks — "8" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2314)
- RR-0450 queue rules and orchestrator note off for code reviews; step handbook for compute only; three questions replace the five principles
- RR-0149 Increment 1·A tooling location
- RR-0150 Infra freeze named list
- RR-0152 Increment 1·A re-use and drops
- RR-0154 Work pulling
- RR-0156 Push 6 literal test
- RR-0157 Push 6 R-MD
- RR-0014 McSTORAGE-RULINGS.md:5
- RR-0159 Push 6 recapture; 1·A panel scope
- RR-0161 Work pulling
- RR-0162 Answer ONE-1
- RR-0163 Answer ONE-2
- RR-0164 Answer ONE-4
- RR-0165 Answer ONE-5
- RR-0166 Answer ONE-12
- RR-0167 Answer ONE-13
- RR-0168 Answer ONE-21
- RR-0169 Answer ONE-22
- RR-0028 open-questions.md:1088
- RR-0170 Answer ONE-35
- RR-0172 Search lot map street name
- RR-0174 Loading screen
- RR-0176 Loading screen
- RR-0178 MB-44 W timing
- RR-0179 Load-failure page
- RR-0180 Web recent-search chips
- RR-0182 Search identification and semi wiring
- RR-0184 Semi question page design
- RR-0186 Inc6 protection window
- RR-0044 2026-11-18 · Operator direction: page-level lot information in increme
- RR-0188 Push 6 recapture
- RR-0190 Enforcement
- RR-0192 Operator oversight scope
- RR-0193 McRecommendations
- RR-0195 Push CHK.5/CHK.3
- RR-0196 Push CHK.5/CHK.3
- RR-0198 Push 6 recapture
- RR-0200 Recommendation tracking tools
- RR-0202 Backlog working board
- RR-0203 Backlog working board
- RR-0060 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0205 Backlog home of the plan
- RR-0207 Backlog: use all features, bring content and process over, ensure use
- RR-0208 Gates: assess necessity; Backlog to make the process followed and reviews validated
- RR-0210 McLane is the lane policy name
- RR-0212 Backlog plan v8 scope: loader + three gates
- RR-0214 1·A not replaced; relevancy pass after the move
- RR-0215 Images round 4 directions
- RR-0217 Concept gallery scope
- RR-0219 Backlog plan v8 approved
- 2026-11-18 re-use ruling: drop INFRA.2 guard.mjs and CHK.4 (operator words)
- RR-0080 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- Q-H2 drop the J5 storeys backfill chain (7.7-7.9, 7.23)
- RR-0232 Open decisions: grounding and verified recommendation
- RR-0233 Operator expertise scope
- RR-0235 McLane brief: full context from milestone, reviews and decisions
- RR-0242 One-command lane launch
- RR-0248 Increment 1·A parallel lanes
- RR-0264 Semi page placeholder in 1·B
- RR-0270 Web search footer: once, approved
- RR-0273 Shared footer component
- RR-0271 LOAD.1 drives the report now, ST.P1 split
- RR-0081 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0277 Search fuzzy matching reuses the permit address spec
- RR-0278 Report meter counts on report production only
- RR-0281 No clear-search button (A.11 not required)
- RR-0282 Daylight restyle token substitutions stay as built
- RR-0284 Lot map: two data reads allowed (C.5 footprint, C.7 card line)
- RR-0299 SRCH.C12 support address is a placeholder until launch
- RR-0300 1·B blockers as OPERATOR tasks
- RR-0298 Status changes only by the launch script
- RR-0301 task-341 approved: run tasks 121, 122, 123 now, then LOAD.1, LOAD.2, LOAD.4
- RR-0302 Loose ends task per milestone
- RR-0086 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0303 design-elements file: produce now if not a big job
- RR-0306 task-342 answered: the proof tool does not wait for the design-fit check
- RR-0307 task-340 answered: A.6 is built now from the existing entitlement read, compliant and researched first
- RR-0308 Semi question mock approved (task-319)
- RR-0309 Regenerated semi mock approved (task-319 stage 2)
- RR-0310 A.6 reset date served as a Toronto-time label (task-320)
- RR-0311 A.6 zero reports left still shows the line (task-352 question 1)
- RR-0312 No plan: an error page with a way to sign up (task-352 question 2)
- RR-0313 Search box says Enter a Toronto address (task-352 question 3)
- RR-0314 Outside-Toronto notice stays

## Milestone
m-1 Increment 1·B Search [S]

### Description

Increment S (re-opened, scenario slice)

### Problems
- None named in the S brief (docs/reports/plan-import/raw/2026-11-19/search-brief.json carries inc, deliverable and specs only).
- Found by the R10 validation pass (task-316, 2026-11-19), text left as found: the first two Storage set-up lines below still say a 35 s loading screen and LOAD.3; RR-0176 (decision-43, supersedes RR-0174) rules no 35 s cap and LOAD.3 dropped (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:785) "yes that is correct"
- Found by the R10 validation pass: two Storage set-up lines and four Register rulings lines end with the word undefined where a quote belongs (generator defect, draft task on backlog-brief.mjs); doc-16 section 5 row S still reads LOAD.1 to LOAD.3 (backlog/docs/doc-16 - McStorage-policy-v2.md:108)

### Project objectives
- Objective: finish a completed project, a database that works and is ready (operator 2026-11-17) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:652) "our objective is to finish a completed project ie a database that works and is ready"
- The database exists to service the designed report, details and search page (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:635) "the database is created to service the existing report and details as clairfied in the McFrontend. This includes the search page"
- A task that serves neither a designed element nor a supporting function is most likely not relevant (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:635) "If the ultimate numbers are not servicing this... or a supporting function the task most likely is not relevant or feeds old code"
- Five principles, keep it simple, no scope creep (~/Buildo-scratch/panel-tools/PLAN-PROTOCOL.md:3) "standardization, observability, scalability, accuracy, understandability; keep it simple; no scope creep"
- One plan only (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:652) "we need one plan - we can only execute one plan"

### Increment objectives
- Search comes before increment 1: the search page, then (1) address confusion, (2) lot confusion (docs/reports/plan-import/raw/2026-11-19/search-brief.json inc; ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "because we have done this plan by increments what about the "This Lot" information (Main page) and details as well as t"
- The search identifies two-or-more parcels at one address, a mis-typed address, or a possible semi lot, and wires each to the report; the semi calculation stays in Increment 7 (7.25) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:796) "Maybe the search portion done now with the page."
- What the customer sees: the 65 designed search elements A (search page), B (address confusion), C (lot confusion, lot map), D (semi question page), E (web search pages), F (landing entry), G (hand-off to the report) (backlog/docs/increments/doc-2 - Increment-S-requirements.md:27) "| id | element | where | status | deliverers | built |"

### Objectives
- Search comes before increment 1: the search page, then (1) address confusion, (2) lot confusion; most of it is already built (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "Operator, verbatim: "because we have done this plan by increments what about the "This Lot" information (Main page) and details as well as t"

### Deliverable
- A user types any Toronto address, resolves address or lot confusion through the designed pages (choose your lot, and the three states: intersection, no lot linked, many lots), and lands on the report (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:682) "Readings: (1) Q-GAP-0 image hold R-IMG1..3 LIFTED (dated note owed, M-246 form). (2) Q-GAP-2 "Most space": every option, a tie goes to the l"
- The search pages follow the Daylight product standard (small pages v8); today they are still old dark on origin (mobile/src/constants/parcelSearch.ts:58) (~/Buildo-scratch/mcfrontend/phase1/open-questions.md:1100) "R-D1 Daylight is the product standard: small pages (v8), landing (v10+), report (B v3: summary + concept gallery), demo "

### Specs
- Spec 89 parcel cost model tool (search parser rules): origin:docs/specs/02-web-admin/89_parcel_cost_model_tool.md
- Spec 126 MaxBLD surface standard: origin:docs/specs/02-web-admin/126_maxbld_surface_standard.md
- Current search (latest rendering + later rulings): ~/Buildo-scratch/lanes-20261117/search-delta/CURRENT-SEARCH.md
- MORNING-DECISIONS.md: ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md
- McFrontend phase1 open-questions.md (search and small-pages rulings): ~/Buildo-scratch/mcfrontend/phase1/open-questions.md
- PROTOCOL.md: ~/Buildo-scratch/panel-tools/PROTOCOL.md

### Rulings
- Search pages come first in the plan, before increment 1 (RR-0005) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "the search pages should be even before the increment 1"
- Search parser: fix the street direction guard and the unit-token strip before launch (RR-0166) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-12 a"
- W5 choose your parcel on the web is deferred and the web live switch stays off (RR-0170) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-35 b"
- Lot map: the street name on the road comes from the map's own road labels (RR-0172) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:775) "Map's road labels (Recommended)"
- The 'faces the street' rule question was withdrawn by the operator (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:774) "why does this matter? do you not know how to do the lookup?"
- Loading screen: the animation keeps its own length and always runs to completion; the button waits for the report AND See details; LOAD.3 not needed (RR-0176, supersedes RR-0174 which said 35,000 ms) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:785) "yes that is correct"
- The customer read module W (1.3) is built now in Increment 1 (RR-0178) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "1. it has to happen now - read the objectives"
- A load-failure page is a task, built from the other small pages (RR-0179) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "2. Add it as a task using the othr mini pages as a template"
- Web recent-search chips (E.6) stay deferred (RR-0180) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "3. This can stay defferred for now"
- 1·B builds A.6 and C.12 as their own tasks and identifies the semi lot; the semi calculation stays in 7.25 (RR-0182) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:796) "Maybe the search portion done now with the page."
- The semi question page is designed like the other small pages: a v8 mock for approval, then built (RR-0184) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:801) "also need a semi question page similar to a min page"
- Small pages: Daylight ("modern") is the product standard (R-D1) (~/Buildo-scratch/mcfrontend/phase1/open-questions.md:1098) "Just looking at the small pages - love it! Let's go with modern."
- Increment 1·B starts as a validation pass of its tasks, the semi page placeholder, the McFrontend fields and page tasks, dependencies and the prior panel records (RR-0257) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1019) "This work has been done - just validation."

### Storage set-up
- McStorage policy v2: a lot's numbers (main page and See details) are computed on first open from the search page (behind the 35 s loading screen), on track, or on owner input; stored with the stamp (Layer 2 table_version, evaluator_version, settings sha); a stale record is never served and is recomputed; no record for unopened lots; no all-lot fill (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:704; ~/Buildo-scratch/lanes-20261117/storage-policy/McSTORAGE-POLICY-v2.md) "undefined"
- Loading screen: starts at the search pick, waits for the numbers up to 35,000 ms (LOAD.1 to LOAD.3); skipped for a re-opened lot (its record is read); no screen for owner input or the Tracked Lots list (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:696; ~/Buildo-scratch/mcfrontend/MF-62/plan.md:44) "undefined"
- Search shows addresses only; the pick (lookup hit) starts the one-lot compute (LOAD.1) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:696) "undefined"
- ST-5 AMENDED 2026-11-18 (store on first open; prior text kept, superseded where it conflicts) (~/Buildo-scratch/mcbylaws/McSTORAGE-RULINGS.md:126) "undefined"

### Register rulings of this group (operator words)
- RR-0005 2026-11-18: Search pages first in the plan, before increment 1 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "Operator, verbatim: "because we have done this plan by increments what about the "This Lot" information (Main page) and details as well as t"
- RR-0137 2026-11-18: For increments 1b-10: all tasks present to fulfil each increment's objectives and deliverables (rulings most relevant, McStorage policy, compliance, project objectives; ensure relevancy); tasks optimised holistically, then within each increment, updated in the plan (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:729) "ensure all tasks are present to fufill the increments objectives and deliverables"
- RR-0144 2026-11-18: Stored lot records are purged after 90 days unopened (operator answer PRG-1 a); tracked lots are never purged while tracked (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "PRG-1 a (purge after 90 days unopened)"
- RR-0145 2026-11-18: Tracked lots are refreshed in the background when the stamp moves (operator answer TRK-1 a) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "TRK-1 a (background refresh of tracked lots when the stamp moves)"
- RR-0154 2026-11-18: When a task completes the next ready task starts at once; a task blocked on an operator question goes to the answer page and work moves to the next unblocked task; nothing waits idle. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:754) "it should pull the next task as something completes or move to the next task if a question remains"
- RR-0166 2026-11-18: Search parser (1.4): fix the two defects before launch (street direction guard, unit-token strip), with two labels and one dated note on Spec 89 line 33 (ONE-12 a) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-12 a"
- RR-0170 2026-11-18: W5 (choose your parcel) on the web: deferred; the web live switch stays off (ONE-35 b) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-35 b"
- RR-0172 2026-11-18: Lot map: the street name on the road comes from the map's own road labels; no new data read or drawing code. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:775) "Map's road labels (Recommended)"
- RR-0174 2026-11-18: Loading screen: the animation always runs its full set length (report_check_min_ms = 35,000 ms, default and maximum); the button to open the report shows when the lot's numbers are ready, at any time after the animation completes. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:779) "the animation still needs to be complete.. the button shows when its ready - anytime after the animation completes"
- RR-0176 2026-11-18: Loading screen: the animation keeps its own length (23 s today, may change later) and always runs to completion; the button to open the report shows only when the report AND See details are loaded, however long that takes (no 35 s cap); the 35,000 ms setting change (LOAD.3) is not needed now. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:785) "yes that is correct"
- RR-0178 2026-11-18: MB-44: T now, per-increment checks now, and the customer read module W (1.3) built NOW in Increment 1 (not after J9 in increment 8), because McStorage policy v2 computes at the search pick (MD:704). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "1. it has to happen now - read the objectives"
- RR-0179 2026-11-18: New task: the load-failure page shown when a lot's report or See details fails to load, built from the other small pages (small-pages-v8) as its template. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "2. Add it as a task using the othr mini pages as a template"
- RR-0180 2026-11-18: Web recent-search chips (E.6) stay deferred. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "3. This can stay defferred for now"
- RR-0182 2026-11-18: Increment 1·B builds A.6 (reports-left line, app search page) and C.12 (help link) as their own tasks; the search identifies two-or-more parcels, a mis-typed address, or a possible semi lot; the search portion and the semi question page are done now with the wiring (link) to the report; the semi calculation stays in Increment 7 (7.25). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:796) "Maybe the search portion done now with the page."
- RR-0184 2026-11-18: The semi question page is designed like the other small pages (small-pages-v8 Daylight): a mock from the v8 template for operator approval, then built (SRCH.SEMI). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:801) "also need a semi question page similar to a min page"
- RR-0186 2026-11-18: Increment-6 protection rules 1, 3, 7 and 9 are closed (D7 done); suites and pushes only through the push station and the operator; DB jobs only on the operator typed GO; rules 2, 4, 5, 6, 8, 10, 11 stay until push 6 lands. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:805) "y and your not following the McQueue rules"
- RR-0190 2026-11-18: Lane launches need an authorized plan for any repo worktree they write; every register row is marked operator words or orchestrator reading and only operator words feed reviews as rulings; orchestrator replies that recommend or name a ruling must cite file:line, an RR id or UNVERIFIED (enforced by hooks). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:813) "close the gap.  fix teh register"
- RR-0192 2026-11-18: Questions come to the operator only on database structure, the frontend, the user experience and storage; everything else is decided under the six-criteria rule, reviewed and logged as a McRecommendation card for audit. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:819) "I dont provide oversight on questions beyond the databse strcuture, the frontend the user experience and storage"
- RR-0193 2026-11-18: McRecommendations: every recommendation is a card in the repo decision log with customer / UX / space / DB-logic framing, options, rulings (operator words only), sources, research kept separate from the recommendation status (judgment only, reviewed, proven), five principles, what it serves, computed confidence and outcome. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:817) "the recommendation should be framed with an explanation that speaks to what I know"
- RR-0202 2026-11-18: The increment plan moves into the repo queue rows (Spec 137); the Backlog board generated from them is the working board, showing per task its increment, decisions and research (review/run) IDs. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:837) "I need to be able to see the board and the categories and the decisions and the research ids for each"
- RR-0203 2026-11-18: The move of the increment plan into the repo queues is done by a committed generator with --check, from a committed raw snapshot; nothing hand-copied. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:839) "use a generator"
- RR-0205 2026-11-18: The increment plan lives in Backlog.md in the repo (milestones = increments, assignees = lanes, priority/ordinal, dependencies, decision and research refs per task); the operator organises on the board; queue rows stay and are linked by id; loaded once by an import script. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:843) "yes of course"
- RR-0207 2026-11-19: Backlog: every feature is used; each increment's objectives, rulings, citations and storage objectives move over; the existing process (handbooks, Spec 08) is carried over; process documents are updated; the move is structured so the system is actually used. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:847) "Make sure opus actually uses the system"
- RR-0208 2026-11-19: The board data exists in the artifact and the procedures in Spec 08; the failure is scratch work, made-up responses and wrong reviewer context; hence the gates and full Backlog use. Each new gate is assessed as necessary or not, with how to do it right. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:848) "determine if the new gates etc are necessary and how to do this right"
- RR-0210 2026-11-19: The lane policy is named McLane in the Spec 08 and Spec 137 dated notes of the Backlog-home plan; McDecision is not adopted. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:852) "Let's stick with McLane for a name."
- RR-0212 2026-11-19: The Backlog-home plan is the loader plus the three enforcement pieces, with Backlog's own browser as the board; the v7 board job, mirror synchroniser, import verifier and structural gate are dropped (simple, no scope creep). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:867) "we needd the loader and the three gates"
- RR-0214 2026-11-19: Increment 1·A is not replaced by the Backlog plan; after the move every task on the board is re-checked for relevancy against the plan (kept / merged / changed) before 1·B starts. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:857) "ensure the tasks are updated and relevancy determined in light of the plan"
- RR-0219 2026-11-19: Backlog-home plan v8 is authorized (PLAN LOCKED): loader + three gates + Backlog's browser; D1-D5, D7-D10 as recommended; every relevant spec note lands; every imported task carries all available information; the 1·A tasks are updated or removed against the plan through the panel. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:871) "approved. ensure that all the relevant specs are updated and all the increment tasks with all the new information that can be given to the tasks"

### Compliance codes in use
- None named: no 1·B task (task-12, 13, 14, 68, 69, 266, 267, 268, and the promoted and created task-317 to task-325) carries a comp: label (checked on the task files, 2026-11-19).

### Decisions
Every file in backlog/decisions whose Groups line names S or whose Tasks named line names a 1·B plan id (checked 2026-11-19, R10):
- decision-1: RR-0005 2026-11-18 · Operator direction: page-level lot information in increme
- decision-15: RR-0137 Operator: completeness, holistic and per-increment optimisation
- decision-20: RR-0144 Operator answer PRG-1: purge rule
- decision-21: RR-0145 Operator answer TRK-1: tracked lots refresh
- decision-27: RR-0154 Work pulling
- decision-36: RR-0166 Answer ONE-12
- decision-40: RR-0170 Answer ONE-35
- decision-41: RR-0172 Search lot map street name
- decision-42: RR-0174 Loading screen
- decision-43: RR-0176 Loading screen
- decision-44: RR-0178 MB-44 W timing
- decision-45: RR-0179 Load-failure page
- decision-46: RR-0180 Web recent-search chips
- decision-47: RR-0182 Search identification and semi wiring
- decision-48: RR-0184 Semi question page design
- decision-49: RR-0186 Inc6 protection window
- decision-51: RR-0190 Enforcement
- decision-52: RR-0192 Operator oversight scope
- decision-53: RR-0193 McRecommendations
- decision-58: RR-0202 Backlog working board
- decision-59: RR-0203 Backlog working board
- decision-60: RR-0205 Backlog home of the plan
- decision-61: RR-0207 Backlog: use all features, bring content and process over, ensure use
- decision-62: RR-0208 Gates: assess necessity; Backlog to make the process followed and reviews validated
- decision-63: RR-0210 McLane is the lane policy name
- decision-64: RR-0212 Backlog plan v8 scope: loader + three gates
- decision-65: RR-0214 1·A not replaced; relevancy pass after the move
- decision-68: RR-0219 Backlog plan v8 approved

### Documents
- Requirements: backlog/docs/increments/doc-2 - Increment-S-requirements.md
- McFrontend elements: the Elements section of that doc (backlog/docs/increments/doc-2 - Increment-S-requirements.md#L27) and docs/reports/plan-import/raw/2026-11-19/elements-by-inc.json#S
- McStorage policy for this increment: backlog/docs/doc-16 - McStorage-policy-v2.md#L108-L108 and docs/reports/plan-import/raw/2026-11-19/storage-by-group.json#S

## Document sections
Cap: 120 KB in total, 12 KB per block (document blocks below; an omitted block costs its notice against the total); a block that would pass the total is listed as omitted. Sections named in a link (#L<n>-<m> or a section title) are read; with none named, the first 12 KB.

### Requirements: backlog/docs/increments/doc-2 - Increment-S-requirements.md (not readable: ENOENT; read it at Requirements: backlog/docs/increments/doc-2 - Increment-S-requirements.md)

### McFrontend elements: the Elements section of that doc (backlog/docs/increments/doc-2 - Increment-S-requirements.md (not readable: ENOENT; read it at McFrontend elements: the Elements section of that doc (backlog/docs/increments/doc-2 - Increment-S-requirements.md)

### McStorage policy for this increment: backlog/docs/doc-16 - McStorage-policy-v2.md (not readable: ENOENT; read it at McStorage policy for this increment: backlog/docs/doc-16 - McStorage-policy-v2.md)

## Decisions naming this task
- RR-0387 McFixReborn: each built task gets its own output review and confirmed findings are fixed by ordinary fix tasks; no new infrastructure; old findings dropped (names RR-0387) — "Approved. You run it.  Let's call this the McFixReborn" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1941)
- RR-0392 one push for all four; no other infrastructure beyond this (names RR-0392) — "Push for all 4. I  don't think we need any other infastrcuture beyond this.. we are good to go!" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975)
- RR-0442 the search opens a lot on an exact match (names RR-0442) — "It should open on an exact match and we have a different process for address mistakes, if the lot is shared by two parcels - you need to pick one - if its a semi potentially - you need to state that?" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2276)
- RR-0443 report limit: top-up or higher-subscription screen; questions grounded before they reach the operator; partial address = pick from close addresses (names RR-0443) — "4) Nbr 2- why is this a defect? yes, they need a screen with a top up or a higher subscription" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2283)
- RR-0444 fold the McFixReborn findings (names RR-0444) — "Now we need to fold the findings (1) Valid Compliance finds (2) The reality-check and integration - a) resolve the one gap case b) This was my mistake - we need this built either - maybe call it a subscription upgrade with more report room (this was a gap)." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290)
- RR-0445 limit and reactivate screens: mobile first, also on the web, follow the earlier process (names RR-0445) — "01 - we are mobie first - we always take that approach but it works onthe web.  We follow the same process with all the development - look back and follow" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2296)
- RR-0446 several-lots map stays as built; no-plan page joins the limit-screen task (names RR-0446) — "04  leave it as it is 02 Agrred add to the plan." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2302)
- RR-0447 clean the board (label dead), review all tasks, then add the search-fix tasks (names RR-0447) — "(1) all tasks that are no longer needed or merged are given the label dead - this should be all McFix labels" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2308)
- RR-0448 the search-fix cards are created as 8 merged tasks (names RR-0448) — "8" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2314)

## Prior reviews and lane reports
### task-450 (this task)
- (none)

## Dependencies
- (none)
