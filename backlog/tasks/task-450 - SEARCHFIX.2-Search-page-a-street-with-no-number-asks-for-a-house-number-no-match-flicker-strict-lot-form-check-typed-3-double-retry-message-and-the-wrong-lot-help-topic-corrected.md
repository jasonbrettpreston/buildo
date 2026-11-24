---
id: TASK-450
title: >-
  SEARCHFIX.2 Search page: a street with no number asks for a house number;
  no-match flicker, strict lot-form check, typed "3", double retry message and
  the wrong-lot help topic corrected
status: LATER
assignee: []
created_date: '2026-11-24T14:47:00Z'
updated_date: '2026-11-24T15:26:00Z'
labels:
  - SEARCHFIX-PRIORITY
milestone: m-1
dependencies: []
type: fix
ordinal: 150020
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-24 by the orchestrator, Spec 137 rule 2, on the operator's rulings: RR-0444 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290, fold the findings), RR-0447 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2308, add the new tasks with the search-fix labels, dependencies and order) and RR-0448 (the 8 merged cards). Source: the fold plan docs/reports/reviews/mcfixreborn-fold/FOLD-PLAN.md, task 2 (FIX.SEARCH-PAGE); every finding was ruled by a separate grounder (RR-0387, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1943; records under docs/reports/reviews/mcfixreborn-g1 to -g4). The plan's section 2 lines are this card's acceptance tests, each red first. Nothing is added that the plan or a ruling does not name (RR-0392, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975).

What changes, in plain words: on the phone and web search pages, a street typed with no house number shows the existing "add a house number" line. The "no match" line no longer flickers on a re-fetch; one extra field in a lot no longer fails the form; the minimum length comes from the setting, not a typed 3; a retry-after of zero shows one message; the semi page opened cold and offline does not redirect early; the help page gains the topic "Wrong address or lot" and both search links point at it.

Findings folded: 2a (phone side), V4, V5, L1, L3, L5, N4, R2, R4, R5 (golden header), B.7 (topic and the two search-page links), Q4, Q8, Q19 (the shim).

RULED at the plan stage by the plan grounder (RR-0443 b; QUESTIONS-RULED.md Q8.1, Q8.2): with no house number the phone shows the refine line and keeps the candidate list as today, because RR-0443 c (MORNING-DECISIONS.md:2284, the operator's own words) says the person selects from the close addresses; the 2026-09-16 words at mobile/src/lib/parcelSearchMatch.ts:12-13 cover only the beyond-the-cap case and no operator wording for them was found. The refine line is reworded so it is true at any row count.

Dated notes owed: Spec 99 (the redirect-once pattern); task-319.

Files: mobile/src/lib/parcelSearchMatch.ts, mobile/src/lib/semiQuestion.ts, mobile/src/lib/schemas.ts, mobile/src/components/surfaces/SearchBinding.tsx, src/components/surfaces/web/SearchBinding.tsx, scripts/surfaces/_schema/static-page.json, scripts/surfaces/_schema/static-page.schema.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.content.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.descriptor.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_semi_question.content.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_semi_question.descriptor.json, mobile/src/generated/surfaces/mobile_parcel_search.json, mobile/src/generated/surfaces/mobile_parcel_semi_question.json, mobile/__tests__/parcelSearchMatch.test.ts, mobile/__tests__/parcelSearchScreen.behaviour.test.tsx, mobile/__tests__/semiQuestionPage.behaviour.test.tsx, mobile/__tests__/schemas.test.ts, mobile/__tests__/daylightSearchPages.golden.test.ts, src/tests/surfaces/search-web-binding.ui.test.tsx, docs/specs/03-mobile/99_mobile_state_architecture.md, src/tests/fixtures/surfaces/, scripts/surfaces/parcel_product/F06/surfaces/web_help.content.json, mobile/__tests__/parcelScreens.golden.test.ts, mobile/__tests__/surfaceRenderer.smoke.test.tsx, mobile/__tests__/semiQuestionScreens.golden.test.ts, mobile/__tests__/fixtures/parcelSearch.situations.json, mobile/__tests__/fixtures/surfaces/mobile_parcel_search.goldens.json, mobile/__tests__/fixtures/surfaces/mobile_parcel_semi_question.goldens.json, src/tests/surfaces/static-page.logic.test.ts, src/tests/surfaces/surface-validate.logic.test.ts, src/tests/surfaces/surface-conformance.logic.test.ts, src/tests/surfaces/parcel-legacy-oracle.logic.test.ts
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A query with no house number shows the refine line (worded true at any row count) and keeps the candidate list
- [ ] #2 A settled miss fetched again keeps the no-match line
- [ ] #3 A lot form with one extra field parses; the closed enum lists stay
- [ ] #4 The minimum-length copy is filled from the setting, not a typed 3
- [ ] #5 The semi page opened cold and offline does not redirect before the lookup settles
- [ ] #6 The help page has the topic wrong-lot and both search links go to it
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 The rule the task rests on is quoted with file:line in the task, or the task is a card for the missing rule — "Quote the rule first" (.cursor/MCBYLAWS-QUEUE.md:107)
- [ ] #2 The tests were written first and proven red, then green — "Every lock is proven in BOTH directions" (docs/specs/00-architecture/08_agents.md:462)
- [ ] #3 The work is committed through the real hooks, none bypassed — "Red tests first, then the code, through the real hooks." (docs/specs/00-architecture/08_agents.md:490)
- [ ] #4 The named test is green before the task is called done — "Never declare a task done until" (CLAUDE.md:32)
- [ ] #5 Any operator ruling the task needed is recorded verbatim as a dated note or a decision-log row — "A ruling enters a row as a verbatim dated note." (docs/specs/00-architecture/137_mcqueue.md:109)
- [ ] #6 The task file and its queue row are updated in the same commit as the work — "The status line changes in the same commit as the work." (docs/specs/00-architecture/137_mcqueue.md:84)
- [ ] #7 DONE carries its evidence (commit sha, test, hook result) — "The work landed and the evidence exists" (docs/specs/00-architecture/137_mcqueue.md:63)
- [ ] #8 Nothing was added that the card or ruling did not name — "no change adds a tool, field or rule its card or ruling did not name" (docs/specs/01-pipeline/124a_step_standard_policy_appendix.md:988)
- [ ] #9 The principles the task serves are named — "Each task names the ones it serves." (.cursor/MCBYLAWS-QUEUE.md:104)
- [ ] #10 The close-out reply ends with one STATUS line and at most one question — "Every reply ends with one line" (docs/specs/00-architecture/08_agents.md:505)
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Planner: Cairn-Plan-450
Plan id: PLAN-450-v1

Read-only. I ran no tests, hooks or generators and wrote no file. File:line references were read at board head 5a26374b9. MD means ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md.

## 1. Rules quoted first
- RR-0442, MD:2276: "It should open on an exact match and we have a different process for address mistakes".
- RR-0443 c, MD:2284: "What happens with a partial address? Similar to an address mistake they need to select from the available addresses that are close".
- RR-0444, MD:2290: "Now we need to fold the findings (1) Valid Compliance finds". RR-0447 is at MD:2309 and RR-0448 at MD:2315 (the cards).
- RR-0445, MD:2296: "we are mobie first - we always take that approach but it works onthe web".
- RR-0392, MD:1975: "I don't think we need any other infastrcuture beyond this".
- The 2026-09-16 rule, mobile/src/lib/parcelSearchMatch.ts:12-13: "beyond the cap, ask for a house number instead of listing". It is repeated at mobile/src/constants/parcelSearch.ts:20: "ask for a house number, do not list." No verbatim operator words were found (GROUNDER-QUESTIONS.md:127).
- Spec 99 §6.5, docs/specs/03-mobile/99_mobile_state_architecture.md:527: "A render gate condition ... MUST evaluate to the same value across consecutive renders". Line :530 marks isFetching as BANNED. Line :783 says a §3, §4 or §5 change "requires a WF1 amendment with adversarial review".
- The lookup's additive rule, mobile/src/lib/schemas.ts:370-371: "a server-added field never raises ParcelLookupSchemaError on an installed build".
- doc-2:49 (B.7): "Get help with an address (to /help?topic=wrong-lot)". The mock note in ~/Buildo-scratch/mcfrontend/small-pages-v8/help.html reads "Topics: General · Wrong address or lot · Billing".
- The grounder records this plan follows:
  - GROUNDER-B (g3) D1: delete `.strict()` (L1). D2: delete `&& !isFetching` (V4). D3: gate on settled data, not isFetching (V5). D5: dated note in Spec 99 (N4). D6, D8: descriptor text (R2). D7: projection "list" (R4).
  - GROUNDER-H D2: `retryAfterSeconds == null` (L3). D4: `{min}` bound to the slice value (L5). D6: semi busy state (R4).
  - GROUNDER-D D7: "three" becomes "two" (R5).
  - GROUNDER-QUESTIONS :62 (Q8, the curly apostrophe), :60 (Q6/B.7) and :73 (Q19: "Delete this block ... and it now does").

## 2. What exists and is reused
- The refine line already exists: content key `list.refine` (mobile_parcel_search.content.json:8). It is drawn when `overCap` is set (mobile SearchBinding.tsx:214, web SearchBinding.tsx:243). The cap test is `isOverCandidateCap` (parcelSearchMatch.ts:212).
- The intersection query-shape check `isIntersectionQuery` (:154-164) is the pattern for a check on the typed text.
- `sliceNumber` (mobile/src/lib/sliceConfig.ts:14, no imports) and `SEARCH_MIN_QUERY_LEN` (SearchBinding.tsx:38) already carry the minimum length.
- Templates `{text, vars}` already fill values on both platforms (the chip label at :116; web resolveWebValue :317-320).
- The `open_help` action exists. On the phone, helpUrl (mobile/src/lib/maxbldHelp.ts:15) builds the link with the topic in the URL fragment. The web builds it at SearchBinding.tsx:385-387. On the help page, the HelpPrefill island matches the link by data-topic (HelpPrefill.tsx:34-35). Help topics are prose `mailto` parts (static-page.json:19-46) checked against a closed enum (static-page.schema.json:179-187).
- The redirect-once hook is `useSettledRedirect` (mobile/src/hooks/useParcelPageHooks.ts:16-25). It is not changed.
- Generators (the build runs them, never hand edits): scripts/surfaces/emit-mobile-surfaces.mjs --write, scripts/surfaces/search-golden-capture.ts --write, the semi golden capture, and surface-validate --check.

## 3. The change, file by file, in build order
1. mobile/src/lib/schemas.ts:428 (L1). Old: `.strict()`. New: delete that word. The enums at :424-425 stay. Also reword the comment at :370-371 ("The client derivation ... runs only when resolution is absent"), because step 2a removes that derivation.
2. mobile/src/lib/parcelSearchMatch.ts:
   a. Q19, :193-208. Delete both blocks: the declared-matchType path and the TODO(contract) count derivation. Replace them with one line: `return isIntersectionQuery(trimmed) ? 'intersection' : 'no_match';`. A payload with no `resolution` is then read as the server's no_match. Add one dated sentence to the header at :20-24 and reword :169-170.
   b. L3, :298. Old: `!retryAfterSeconds`, which shows two messages for 0. New: `retryAfterSeconds == null`. Change :288 from "pinned, not fixed" to "MF35-DF1 closed (task-450)".
   c. V4, :351. Old: `showMiss: outcome === 'no_match' && !isFetching && error == null`. New: drop `&& !isFetching`. Reword :275.
   d. 2a, phone side:
      - Add a pure helper beside :154, `hasHouseNumber(q)`: true when the text before the first comma contains a digit. It copies the server's comma cut (src/lib/admin/parcel-lookup.ts:226) but not its digit test, which reads only the first word (:228); the any-digit test here is wider on purpose, so 'Unit 4, 123 Yonge St' counts as numbered. Known states, both failing open to today's behaviour: 'Highway 27' and a bare 'Unit 4' count as numbered, list as today and show no refine line.
      - In buildSearchSituation (:340-350), compute `noNumber = outcome === 'text_candidates' && !hasHouseNumber(debounced)`.
      - `overCap` becomes `noNumber || isOverCandidateCap(...)`. The refine line already reads overCap, so no new field is added.
      - Choice 8.1 is ruled B (QUESTIONS-RULED.md Q8.1): candidates are unchanged when noNumber, so a one-row street stays clickable and no empty list region can appear; only overCap changes.
3. mobile/src/lib/semiQuestion.ts:72-74 (V5). Old: no data, no error and not fetching redirects to Lookup. That fires on a cold offline open, because a paused first fetch reports isFetching false. New: no data with a parcelId is 'loading'. Only an empty parcelId redirects to Lookup. isFetching is no longer read there; the argument stays in the type so callers do not change (see 8.4). The error branch at :71 stays first.
4. scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.content.json:15 and :21 (L5): "at least {min} characters", and :8 (Q8.2) list.refine becomes "Add a house number to narrow it down.". mobile_parcel_semi_question.content.json:4 (Q8): "Yes, it’s one half of a semi".
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
9. scripts/surfaces/parcel_product/F06/surfaces/web_help.content.json (on the Files line since the plan grounder's round 1; steps 7, 8, 9 and the web_help golden land in one commit and revert as one unit). It needs "help.mailto.wrong_lot": "Wrong address or lot" (the mock's words). The page throws on a missing key (static-web-binding.ui.test.tsx:118-119).
10. mobile_parcel_search.descriptor.json (R2). Text only, as dated "prior text kept" sentences:
    - metering :419-421: the page counts nothing; the lookup it calls counts a produced report (F02).
    - flag :231: "MAXBLD_WEB_LIVE (web target only)". A string is allowed (surface.schema.json:1238-1250).
    - notes :536 and product_questions :576 and :586: closed by MF-45 D-4 a and MF-53.
    - data_story :6 and under_126 :7: name the Layer 4a recent-searches store.
    - Re-point the cites past the end of the 128-line index.tsx (:35, :266, :282, :369-373, :405) to SearchBinding.tsx and parcelSearchMatch.ts.
    - Add `min_query_len` to the derived-name list in deviations[1] (:510).
    - Add one sentence to check :266 saying refine also shows with no house number, next to the list (ruled B), and one dated prior-text-kept sentence to purpose :5, where "past ten it asks for a house number instead" no longer says what the page does.
    - The MF-50 lead_gen deviation (:516-520) stays; src/tests/parcel-tool-meter.logic.test.ts:240-250 reads it.
11. mobile_parcel_semi_question.descriptor.json (R4): projection :166 stays "none". Ruled by an in-memory run of the repo's schema: "list" is refused ("/render/list must have required property 'columns'"), because a generated LIST with projection list needs render.list.columns (surface.schema.json:3760-3784) and this render.list has none (:168-172). Add one dated prior-text-kept sentence to under_126 (:7) saying why the projection is none beside a populated render.list, and one naming the busy overlay. There is no "busy" state name in the closed list.
12. mobile/__tests__/daylightSearchPages.golden.test.ts:7 and :43 (R5): "three" becomes "two".
13. Regenerate the two slices (mobile/src/generated/surfaces/*.json), the two mobile/__tests__/fixtures/surfaces/*.goldens.json copies (scripts/surfaces/emit-mobile-surfaces.mjs --write writes all four) and the *.mobile.json goldens under src/tests/fixtures/surfaces/ (search-golden-capture.ts --write and semi-question-golden-capture.ts --write) with the generators. No committed generator writes the *.web.json goldens of mobile_parcel_search and web_help (git grep finds none; search-golden-capture.ts writes mobile files only): the lane rewrites them with a one-off in-memory call and commits no new tool (RR-0392), props from searchWebTree and the static web tree, fingerprints from sha16 of the content and descriptor files (scripts/surfaces/report-checks.mjs), and proves them with search-web-binding.ui.test.tsx:56-60 and surface-validate --check. The content and descriptor fingerprints change, so every search, semi and web_help golden moves.
14. docs/specs/03-mobile/99_mobile_state_architecture.md: a dated note (section 7).
15. Test-side edits OUTSIDE FILES LINE, each needed because it pins old behaviour:
    - src/tests/surfaces/surface-validate.logic.test.ts:91 and surface-conformance.logic.test.ts:261 (the dated comments above them are :90 and :260): the string count goes from 426 to 427, with a dated comment. One new label is one new string, as the +5 labels of 377 to 383 at surface-validate.logic.test.ts:86 were; the lane still measures with surface-validate --check before and after, as every earlier row did.
    - mobile/__tests__/fixtures/parcelSearch.situations.json: rate_limited_zero errors.unexpected becomes false (parcelSearchMatch.test.ts:408 rebuilds it and must still equal it).
    - mobile/__tests__/parcelScreens.golden.test.ts:160-169 and surfaceRenderer.smoke.test.tsx:76-82: the MF35-DF1 pins. parcelScreens.golden.test.ts:209-211 also pins the typed minimum length and "More than 10 lots": they become the {min} check and the new refine words. src/tests/surfaces/parcel-legacy-oracle.logic.test.ts also gets the refine legacy text in INTENTIONALLY_CHANGED (risk 3).
    - surfaceRenderer.smoke.test.tsx:41 and src/tests/surfaces/static-page.logic.test.ts:229-234: the address_match topic.
    - mobile/__tests__/semiQuestionScreens.golden.test.ts:155-156: redirect_no_data now expects loading.

## 4. Tests first (red, then green), by acceptance line and fold section 2 line
AC1 / fold :42. New describe in mobile/__tests__/parcelSearchMatch.test.ts, "a street with no house number". The rows are the typed-address seat's real data:
- "Gerrard St" with text_candidates [1 Gerrard St W 5440777, 1000 Gerrard St E 10640216, 1001 Gerrard St E 5402856] (seat 5a): overCap true. Today false, so red.
- "Elm" with [1 Elm Ave 5379936] (5b): overCap true with one row.
- "Gerrard St W" with text_candidates [1 Gerrard St W 5440777] (case 6 after task 449): overCap true, route null.
- "Gerrard St, Toronto" with the 5a rows: overCap true.
- Each no-number case also asserts the rows are kept (8.1 ruled B). One more row pins the known state: 'Highway 27' with text_candidates is numbered, so overCap stays false, as today.
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
- mobile/__tests__/parcelSearchScreen.behaviour.test.tsx: typing "Gerrard St" over the 5a rows shows parcel-search-refine (ruled B: the parcel-candidate-* rows stay on screen too). The helpers `hit` (:48) and `list` (:49) gain `resolution`.

AC2 / fold :43 (V4). The truth table at :417 flips to `toBe(true)`. Add a case: the same no_match data with isFetching false, then true, keeps showMiss true. Red today.

AC3 / fold :47 (L1). mobile/__tests__/schemas.test.ts:
- ParcelLotFormSchema parses {detected:'semi_half', basis:'doubt_multi_parcel_abut', unsure:true, extra:1}. Red today.
- ConsumerParcelLookupResultSchema parses with that lotForm.
- detected:'triplex' still throws, so the closed enums stay.

AC4 / fold :45 (L5):
- parcelSearchScreen.behaviour: typing "12" shows "Type at least " + SEARCH_MIN_QUERY_LEN + " characters to search.".
- search-web-binding.ui.test.tsx "templates are filled": the prompt and the description carry no "{min}"; :79 (the idle page holds C['search.prompt']) compares the filled text.
- Both content strings contain "{min}" and no "3". Red today. Two tests outside the card's old Files line pin the typed 3 and go red without an edit (checked in memory): mobile/__tests__/parcelScreens.golden.test.ts:209-210 become the {min} check, and src/tests/surfaces/parcel-legacy-oracle.logic.test.ts:20 drops SEARCH_MIN_QUERY_LEN from CONFIG so the legacy hint and prompt match as {} forms.

AC5 / fold :46 (V5). mobile/__tests__/semiQuestionPage.behaviour.test.tsx: with parcelId PCL-S1, data undefined, isFetching false and no error, replace is not called and the loading state shows. Red today. An empty parcelId still goes to Lookup.

AC6 / fold :48 (B.7):
- search-web-binding.ui.test.tsx:121-125: the href is `/help#topic=wrong-lot&q=...`.
- New case: the search link's topic is a mailto topic of web_help in static-page.json. Red today.
- parcelSearchScreen.behaviour :162: the help link opens `https://maxbld.ca/help#topic=wrong-lot&q=Bathurst%20St`.

Fold :44 (L3). parcelSearchMatch.test.ts:397: `unexpected: false`. Red.

Fold :49 (Q19):
- New: "a payload without resolution is no_match even with a match". Red; it is 'unique' today.
- The tests at :82-143 move to `withResolution`. The withDeclaredType tests (:104-116) go with block 1. The truth-table block's helper `lookup` (:389) builds payloads with no `resolution`, so under Q19 every rebuilt situation would read no_match: it gains resolution too ('text_candidates' with candidates, 'unique' with a match, 'no_match' with none), and :415 (nine rows, overCap false) takes a numbered query such as '100 Bathurst St'.

Fold :50-51 (Q8, R2, R4, R5): text only. surface-validate --check and the golden tests prove them.

Phone: no 2-character request (seat case 29). The existing hook rule at useParcelLookup.ts:83 is unchanged.

## 5. Limits, and what could fail or surprise
Limits:
- No server change (task 449) and no new resolution value.
- The map links keep address_match and lot_match (task 3).
- The web search page stays static (task 393).
- The cap of 10 and the `list.refine` wording are unchanged.
- static-page.json:2 (R5) and the nav and follow-ups headers stay with tasks 3 and 8.

Risks:
1. A LIST surface marked generated with projection "list" requires render.list.columns (surface.schema.json:3760-3784). Settled: step 11 takes the fallback and keeps "none"; the semi descriptor with "list" fails the repo's schema in memory.
2. Until task 449 lands, "Gerrard St W" still opens a lot as 'unique'. The phone rule acts on text_candidates only.
3. `list.refine` said "More than 10 lots match", false for a street with 3 rows. Ruled (Q8.2): the content string becomes "Add a house number to narrow it down." at every row count, so no typed 10 stays in copy. Three more places follow: the oracle src/tests/surfaces/parcel-legacy-oracle.logic.test.ts gets the legacy text in INTENTIONALLY_CHANGED with its cite (RR-0443 c, task-450), parcelScreens.golden.test.ts:211 reads the new words, and the descriptor sentences of step 10 say it.
4. Fixture situations with the no-number query "Bathurst St" (ambiguous, fetching_with_candidates, none_checked) are hand-written inputs of searchProps; only ambiguous is rebuilt (parcelSearchMatch.test.ts:406, 10 rows, overCap already true). Under B no golden moves for them. What does move in parcelSearchMatch.test.ts is in section 4 (the lookup helper and :415).
5. Q19 makes an older server's match a miss. The server always sends resolution (lookup-flow.ts:42, :53, :66, :94, per GROUNDER-B).
6. V5: a disabled query (no token) with an id shows loading until the token arrives. Settled by reading: the error branch (semiQuestion.ts:71) stays before the loading branch, so an errored lookup shows the error state, never loading (the existing 'error' input, mobile/__tests__/fixtures/semiQuestion.situations.json:169-172, covers errored with no data); AuthGate sends a signed-out user to sign-in (mobile/app/_layout.tsx:133); and the loading state keeps the header Back button (the generated slice page.sections[0], part back), so the person is never stranded.
7. Clashes in the same wave: task 8 owns surfaceRenderer.smoke.test.tsx; task 3 owns static-page.logic.test.ts and static-page.json. Merge order matters: FOLD-PLAN.md:144 says 2, 3 and 5 never run together, and :137 puts 2 and 8 side by side, so edit hunks of those files by test title, not by line number, and re-read them at the merge.
8. Spec 99:783 asks for a WF1 amendment for §3, §4 and §5 changes only. The dated note goes in §6.5 (section 6), which :783 does not name, beside the 2026-05-05 amendment at :541 that is the precedent for a dated note there (GROUNDER-QUESTIONS.md:54).
9. A text like "Highway 27" has a digit, so it lists as today.
10. `overCap` now means "show the refine line". Its comment says so.

## 6. Dated notes and card notes owed
- Spec 99, a hand edit of the spec file, in the M-246 form ("Dated note 2026-11-2x (M-246, prior text kept; task-450 SEARCHFIX.2; RR-0444 MD:2290 ...)"), placed in §6.5 after the 2026-05-05 amendment (:541-553), not in §5 (risk 8). It says:
  - the MaxBLD parcel-tool pages navigate once per settled outcome through useSettledRedirect (useParcelPageHooks.ts:16-25);
  - the dependencies name the route string;
  - the semi page reads no data with an id as loading, never as a redirect.
- task-319, through `node_modules/.bin/backlog task edit 319 --append-notes "..."`: `.strict()` was removed from the lot form; the enums stay.
- task-450, through the same CLI: --plan, the acceptance checks and --append-notes. The notes include MF35-DF1 closed, the 8.x answers as verbatim dated rows (DoD #5), and the evidence (sha, tests, hook result).

## 7. Choices (ruled at the plan stage by the plan grounder, round 1; QUESTIONS-RULED.md)
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
- Ruled B (QUESTIONS-RULED.md Q8.1): RR-0443 c is the operator's own words and the later ones; the 2026-09-16 words are a code comment with no operator wording found, and they speak of the beyond-the-cap case. B is also what the page does at the cap today (the refine line is drawn after the list, SearchBinding.tsx:214).

8.2 The refine copy: keep "More than 10 lots match. Add a house number to narrow it down." (the card says "existing line"), or reword it. Rewording changes copy on the 10-plus case too. Ruled: reword the one content string to "Add a house number to narrow it down." (Q8.2); no rule, spec or mock holds the old words, and a line that says more than 10 for a 3-row street is untrue.

8.3 The topic token: "wrong-lot" (doc-2:49, as typed) or "wrong_lot" (the house style of the other topics). Content keys allow only underscores (static-page.schema.json:166), so the key is help.mailto.wrong_lot either way. Ruled: "wrong-lot" (doc-2:49, FOLD-PLAN.md:48 and the card's AC6 all write it).

8.4 V5 shape: (a) the check inside semiQuestion.ts alone (no data with an id is loading), or (b) pass the query's pending status from semi-question.tsx (OUTSIDE FILES LINE, plus fixtures and the capture script). GROUNDER-B D3 offered "status !== 'pending' / isFetched". Ruled (a): the card's Files line and the operator's minimal-change words (QUESTIONS-RULED.md Q8.4); (b) needs semi-question.tsx, fixtures and the capture script.

## 8. UNVERIFIED
- Nothing was run: no tests, no generators, no device.
- That an offline, paused first fetch gives isFetching false with data undefined was read by the plan grounder in the installed library: isFetching is fetchStatus === 'fetching' (mobile/node_modules/@tanstack/query-core/build/modern/queryObserver.js:307, version 5.100.6); nothing was run on a device.
- Projection "list" on the semi descriptor was checked in memory by the plan grounder: the repo's schema refuses it (step 11).
- Whether the Next build resolves the mobile slice JSON by relative path was not run. The same kind of import is already built: src/lib/surfaces/maxbld-web.ts:6 and StaticBinding.tsx:40 import JSON from scripts/ by relative path, tsconfig.json:17 sets resolveJsonModule, and the web binding already imports mobile .ts by relative path (:26); sliceNumber throws on a missing key, so no undefined reaches the copy.
- There is no web golden capture command to confirm: none is committed (step 13).
- The seat lists only 3 of the 10 "Gerrard St" rows and 1 of the "Elm" rows.
- The 2026-09-16 ruling's operator words were not found.
- The backlog CLI is at node_modules/.bin/backlog; it is not on PATH.

### Critical Files for Implementation
- /Users/brettpreston_macmini/Buildo-wt-board/mobile/src/lib/parcelSearchMatch.ts
- /Users/brettpreston_macmini/Buildo-wt-board/mobile/src/components/surfaces/SearchBinding.tsx
- /Users/brettpreston_macmini/Buildo-wt-board/src/components/surfaces/web/SearchBinding.tsx
- /Users/brettpreston_macmini/Buildo-wt-board/mobile/src/lib/semiQuestion.ts
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/surfaces/_schema/static-page.json
<!-- SECTION:PLAN:END -->
