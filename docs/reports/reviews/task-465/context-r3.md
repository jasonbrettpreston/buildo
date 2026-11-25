# Review context for task-465 (no plan id) written 2026-11-25 by backlog-brief.mjs (round 3)

## Task
task-465 McFixV2.1 Search box the Google way: Enter runs the search, suggestions and messages drop under the box, the box is the only focus; semi question reworded
status: RUNNING · milestone: m-1 · assignee: @lane-BL-MCFIX465 · labels: McFixV2

## Description
McFixV2.1 Search box the Google way (phone search page and semi question page).

Source: the operator phone walk of 2026-11-25 on a real iPhone (findings file ~/Buildo-scratch/lanes-20261125/PHONE-WALK-FINDINGS-20261125.md, items 1-4, 6, 11-15, 17-19, 21, 22, 25, 27-29, 32, 36; sort with file:line in ~/Buildo-scratch/lanes-20261125/PHONE-WALK-SORT-20261125.txt).

Rulings (operator, verbatim, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md):
- RR-0483 (:2523): "With google maps - suggestions appear below as you type - and you can select them - but your typed search does not execute until you press enter or select an address. And if you press enter with an incomplete address - you get the error".
- RR-0485 (:2533): "1 inside" (semi wording and sizes ride in this card); "6. Open that lot - they need to press enter - after filling out the address in the search box."
- RR-0482 (:2518): "larger tasks and using existing components as well."
- Operator on focus (finding 6): "The main focus for the user is the search bubble and nothing else should distract from it."

What changes (each needs the approved mock first; this replaces parts of the approved search design, so the mock is the operator gate):
1. The Enter key runs the search (today no submit action is wired). Nothing opens while typing.
2. While typing, suggestions drop directly under the box, part of the box, under a thin grey line; tapping a row opens that lot. No Select button, no radio cards, no "Ambiguous address query" title for one candidate.
3. Enter on an address that matches one lot opens that lot; Enter on an address that matches nothing shows the not-found line in the same drop-down. "No parcel found for that address." becomes "No lot found".
4. An address outside Toronto shows its message in the same drop-down (not a red banner); the no-comma case is to be decided in the plan.
5. The list clears as soon as the user starts deleting. The box is empty when the user comes back from a report.
6. Only the box draws the eye: recent-search chips, the legal line and the reports-left line are smaller and quieter; the typed text is centred in the box; the searching state is aligned.
7. Semi question page: the question reads "Is this a semi?"; the question is the focus and the answers are not larger than it.

Constraints: no database step. Reuse the existing builders (addressList, notice, chips, reportsLeft in SearchBinding.tsx; PageTableBinding for the semi page) and the existing settings (debounce_ms, min_query_len, candidate_cap); a new component needs a named reason. The hand-off to the loading screen and the one-time report calculation belong to task-267, not here.

Files: mobile/app/(app)/parcel-tool/index.tsx, mobile/src/components/surfaces/SearchBinding.tsx, mobile/src/components/surfaces/SurfaceRenderer.tsx, mobile/src/components/surfaces/SemiQuestionBinding.tsx, mobile/src/constants/parcelSearch.ts, mobile/src/lib/parcelSearchMatch.ts, mobile/src/constants/lotMap.ts, src/components/surfaces/web/SearchBinding.tsx, src/lib/surfaces/maxbld-web.ts, scripts/surfaces/_schema/bindings.json, scripts/surfaces/_schema/census/mobile-product.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.content.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_semi_question.content.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.descriptor.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_semi_question.descriptor.json, mobile/__tests__/fixtures/parcelSearch.situations.json, mobile/__tests__/fixtures/surfaces/mobile_parcel_search.goldens.json, mobile/__tests__/fixtures/surfaces/mobile_parcel_semi_question.goldens.json, mobile/src/generated/surfaces/mobile_parcel_search.json, mobile/src/generated/surfaces/mobile_parcel_semi_question.json, src/tests/fixtures/surfaces/mobile_parcel_search, src/tests/fixtures/surfaces/mobile_parcel_semi_question, mobile/__tests__/parcelSearchScreen.behaviour.test.tsx, mobile/__tests__/parcelSearchMatch.test.ts, mobile/__tests__/parcelScreens.golden.test.ts, mobile/__tests__/surfaceRenderer.smoke.test.tsx, mobile/__tests__/semiQuestionPage.behaviour.test.tsx, src/tests/semi-question-design.logic.test.ts, src/tests/surfaces/search-parity.golden.test.ts, src/tests/surfaces/search-web-binding.ui.test.tsx, src/tests/maxbld-web-pages.logic.test.ts, src/tests/surfaces/nav-by-route.logic.test.ts, docs/specs/03-mobile/100_mobile_parcel_cost_tool.md, docs/specs/00-architecture/117_maxbld_brand.md, docs/specs/03-mobile/99_mobile_state_architecture.md, docs/specs/02-web-admin/126_maxbld_surface_standard.md, src/tests/surfaces/admin-media.golden.test.ts, src/tests/surfaces/site-footer.logic.test.ts, docs/reports/generated/127-surface-registry.md, docs/reports/generated/127-surface-review-queue.md, docs/reports/generated/rule-lists-by-kind.md, src/tests/surfaces/contract-binding.logic.test.ts, src/tests/surfaces/parcel-legacy-oracle.logic.test.ts, src/tests/surfaces/search-reports-left.logic.test.ts, src/tests/surfaces/surface-conformance.logic.test.ts, src/tests/surfaces/surface-validate.logic.test.ts

## Acceptance criteria
- #1 Nothing opens while typing; Enter or a tap on a suggestion opens a lot
- #2 Suggestions, the not-found line and the outside-Toronto line appear under the box below a thin grey line; no Select button
- #3 The box is empty on return from a report and the list clears on the first delete
- #4 The semi question reads: Is this a semi? and the answers are not larger than the question
- #5 Built to the mock the operator approved for this card

## Implementation Plan
Planner: Cairn-Plan-465
Plan id: PLAN-465-v1
Head read: 320b47a02 (wf2/board); the plan grounder re-read it at 4c22af6e8 (only backlog files moved since). Fold plan: this card names no task numbers (phone walk 2026-11-25), so there are no fold section 2 lines. The sort's file:line cites were re-read at this head and hold: IDX:42, :98-109; PSM:176-196, :344-362; parcelSearchCore.ts:25-27; PL:416-436, :472-476; SB:71-91, :128-130, :165-225; PS:125, :138-148; LM:48; content :18-20; semi content :3.

#### 1. Rule quoted first
- RR-0483, MORNING-DECISIONS.md:2523: "your typed search does not execute until you press enter or select an address. And if you press enter with an incomplete address - you get the error".
- RR-0485, :2533: "1 inside" and "6. Open that lot - they need to press enter - after filling out the address in the search box." Items 4 and 5 belong to tasks 343 and 267, not this card.
- RR-0487, :2543: "465 Mock  approved". The mock "replaces the approved search page design where the two differ" (:2544).
- RR-0482, :2518: "larger tasks and using existing components as well." RR-0477, :2496: batch items that touch the same files and need no database step.
- RR-0442, :2276: "It should open on an exact match". RR-0443 c, :2284: "they need to select from the available addresses that are close".
- Finding 6: "The main focus for the user is the search bubble and nothing else should distract from it." Finding 18: "It should be "Is this a semi?"."
- Spec 136 fe.31 (136_mcfrontend_handbook.md:124): "Every build reuses existing components, bindings and patterns; a new library, component kind or binding is an operator ruling first".
- 44 px floor: 00_engineering_standards.md:14; bindings.json touch_targets.mobile (Button min-h-[44px] or [48px]); PS:125 says "NativeWind's rem is 14 here".
- Older rulings, and whether this card replaces each:
  a) The match-type ruling 2026-09-16, "unique -> navigate straight to the lot" (PSM:11). REPLACED in part: unique, and the map kinds (multi_parcel, unlinked, intersection: the planner's reading of RR-0483's general rule, named here and in the Spec 100 note), open only on Enter or a tap (RR-0483, RR-0485 item 6). Owes a dated note in Spec 100 §4 and one above buildSearchSituation in PSM, not in the header at :11 (a line added above :258 would move the PSM cites at :91, :98, :183-186 and :258 that other descriptors and search-routing.logic.test.ts:9 hold).
  b) Spec 117 §6.1 note 2026-11-10 (117_maxbld_brand.md:250, "the address list as radio cards ... an amber SELECT button") and Spec 100 note 2026-11-10 (:146, "a candidate tap selects a radio card and SELECT opens that lot"; D17 a). REPLACED on the phone (findings 12, 15; mock "No Select button"). Owes notes in Spec 117 §6.1 and Spec 100 §4. The web is built in the same card (O13 ruled, step 12): the FE-07 parity lock forbids a phone-only change.
  c) RR-0442 and the Spec 100 note 2026-11-24 (:147): KEPT and narrowed to "an exact match, on Enter or a tap". A follow-on note goes in Spec 100 §4. RR-0443 c is KEPT.
  d) "We dont need a clear search" (:1093-1094, task-330): KEPT. No clear (x) is added; the list clears on delete and the box clears on return. Mentioned in the Spec 100 note.
  e) RR-0320 / decision-105 / task-389 (legal line at the bottom, words verbatim): KEPT. Only its size changes (card item 6), stated in the Spec 100 note. static-page T8 still pins footer.legal = search.legal.
  f) Semi mock approval (:1186-1200): the full-width heading is KEPT. The wording and sizes are REPLACED (RR-0485 "1 inside", findings 18-19, mock state 7). Owes a Spec 100 note replacing the question quoted at :105. RR-0321 (:1399 "3 a", Continue 48 px) is KEPT, and so are the selection dots: the approved mock's table lists only the question as changed on this page, no ruling removes them, and the picture draws the answers only (so AC5 does not read as a miss). The answer labels become the mock's Yes, No and Not sure (state 7 as drawn, O11), which also ends the apostrophe question Q3 (:1200).
  g) P35-D16 a (chips are recent searches, saved when a search opens a page), RR-0313 (placeholder) and task-450 Q8.1 B (refine line for a street with no number): KEPT.
  h) P35-D15 b (Spec 100:146, operator "D15 b": no area line under the addresses until a later contract row): KEPT. It settles O3. RR-0487 (:2544) makes the approved mock replace the older search design where they differ; the mock's foot exempts only the street names (state 2) and the districts (state 3) as examples not read from the address data.
- Fact, not a ruling: RR-0486 (:2538) put "search box the Google way" into task-392 ("no new cards"). task-392 is now labelled dead; card 465 carries the work and RR-0487 approved its mock. RR-0488 (:2547) says an absorbed card is dead and its work is completed in the larger card. task-392 (PAGE.SEARCH-M) also held the approved table-row conversion of the phone search page (MD:1421-1422; Spec 126:74), and tasks 390 to 394 are all labelled dead, so no live card carries it. This card does NOT do it: its Constraints, RR-0482 and the mock's foot name the existing pieces (the address list, the notice line, the chips, the count line). Whether the conversion is dropped or added here is the operator's (QUESTIONS-RULED.md, Q1); the plan stands as written until he answers.

#### 2. What exists and is reused
- Debounce, length gate and cap read from the slice: SB:36-41. The query hook: useParcelLookup.ts:82-92 (key ['parcel-search', q]). The navigation effect and ref: IDX:97-109. The recent store: IDX:38-39, :87-93.
- Builders in SearchBinding.tsx: pill :71-91, legal :94, reportsLeft :101-107, chips :109-120, notice :122-126, the addressList row and highlight :157-188 (diffCandidateAddress, the ruled "differing part highlighted"), tail :216-225.
- The help link :205-212 stays in the ambiguous golden; static-page.logic.test.ts:279 pins it.
- Route builder parcelSearchRoute (PSM:221; core :20-38); it is not changed.
- Icons that already exist: MapPin and Info (SurfaceRenderer.tsx:31). Parts View, Text, Button, Icon, Input and ActivityIndicator are all in mapping.mobile.SEARCH, so no new component is needed.
- The Enter pattern already exists: onSubmitEditing in mobile/app/(onboarding)/address.tsx:174.
- The server already answers what the drop-down needs:
  - unique for an exact address (PL:418-436), with match.parcelId and match.address in field_whitelist (descriptor :87-93);
  - text_candidates for prefixes and leftovers (PL:472-476);
  - multi_parcel with candidates (PL:438-444).
- Semi page: semiHeading, semiCard and semiCardText (LM:48-55); PageTableBinding; rows in static-page.json:1380.
- Restamp tools: emit-mobile-surfaces.mjs --write; search-golden-capture.ts --write (header :11-12); semi-question-golden-capture.ts --write; src/tests/surfaces/surface-goldens.ts (the web goldens, through its one-line tsx caller, as task-454 context-r3.md:225 did); scripts/violations/generate-surface-registry.mjs.

#### 3. Answers to (a)-(f)
- (a) Server: no change. A unique answer is drawn as one row from match.address. Navigation happens only on Enter or a tap.
  - Cost while typing is WORSE. Today the phone leaves on the first unique answer. Under this card it stays, so each further debounced text that resolves to the same lot ("41 derwyn", "41 derwyn rd") runs the stored read and the compute again (lookup-flow.ts:79-90). The meter also runs on the q path (route.ts:110-121).
  - On the board today MAXBLD_WEB_LIVE is false (maxbld-web.ts:19): the compute answers null, so the meter reads not_evaluated (route.ts:114 tests hasEvaluatedOption first). The cost shows only with the switch on (RR-0481 local, or after LS.12).
  - With the switch on, three things follow, and none is changed here. (1) The suggestion row waits 11-23 s, because the compute runs inside the q lookup (lookup-flow.ts:79-90). (2) After Enter on a lot the box spins about that long, and the report screen then computes the same lot again (the parcelId lookup), so mock state 6 (a brief spinner, the box never waits for the report) holds only with the switch off or a cached key. (3) A suggestion the user never taps could be counted once costs are evaluated; openReport counts a lot once per period (already_counted, entitlements/index.ts:606), so repeated texts for one lot do not repeat the count. Task-267 (PLAN-267-v1, built after this card) moves the compute and the count to the parcelId request and does not touch index.tsx; it must land before LS.12. Card notes go to 267 and 343.
  - No guard is built here: the compute and the meter are not to be touched (tasks 267, 343). O1 is ruled in section 8.
- (b) What Enter does, by answer:
  - unique (including a held unsure lot): push /(app)/parcel-tool/<id>; the report screen redirects to the semi page as today.
  - text_candidates with 2 or more rows: rows plus list.hint, no push. A capped list or a street with no number shows list.refine instead of list.hint: one line only. The refine line is task-450's and unchanged: it shows with the rows while typing too (guidance, not an error); list.hint shows after Enter only.
  - text_candidates from a street with no number (task-450): rows plus list.refine.
  - no_match, after Enter only: "No lot found for {query}" in the drop-down (state 4; O10).
  - outside Toronto: refused before the network, shown in the drop-down after Enter only (RR-0483: the error comes on Enter; finding 32 complained of an error shown while typing). While typing nothing shows.
  - multi_parcel, unlinked and intersection: push the disambiguate route only on Enter or a tap.
  - fewer than min_query_len characters (not blank): the miss line, "No lot found for {query}" with its hint, as for any incomplete address (RR-0483: "if you press enter with an incomplete address - you get the error"); nothing is sent to the server. The search.prompt line and its key are dropped (O14 ruled). Enter on a blank box does nothing and writes no state.
  - text_candidates with one row (a partial address): the miss line plus that row (O4 ruled: RR-0483 "if you press enter with an incomplete address - you get the error", RR-0443 c "select from the available addresses that are close"); no list.hint, because one row is not more than one.
  - a recent-search chip tap sets the box text and submits it (set_input also sets submitted), so it acts as typing that address and pressing Enter: before this card a chip tap opened a unique lot, and RR-0483 lets a selected address run.
  - the rate-limit, entitlement and error notices (the error with its Retry) stay as Alerts where notices() puts them today.
- (c) The drop-down is built from the existing addressList row, notice and tail builders. There is no new component kind.
  - Candidates carry only {parcelId, address} (schemas.ts:364-367; server types.ts:188). There is no district or municipality field.
  - The row shows the address only: no district line (O3 ruled).
- (d) Clearing:
  - Pure rule: rows hide when the trimmed input no longer starts with the query the data belongs to (case-folded). The first delete hides the rows; typing forward keeps them only until the debounced text changes (the hook keeps no previous data, useParcelLookup.ts:86); buildSearchSituation already receives input.
  - After navigate() has pushed a page (the lot, the semi page or the map page), the next focus empties the box and the submitted text and clears the ref. A flag set in navigate() is read and reset by a useFocusEffect with stable deps (no situation in them), so a tab switch or any other focus never wipes a half-typed address.
  - The recent chips show at rest only (input empty). The search just opened is first in the chips, because it was recorded at navigation.
- (e) Quiet page. Arbitrary text-[Npx] classes are exact px; rem-based classes (text-base = 14 px, text-lg about 15.75 px) shrink by 14/16 on the phone.
  - Typed text: text-[16px]. Count line: text-[12px] leading-[16px]. Legal line: text-[11px] leading-[15px]. Colours are the existing tokens: text-report-soft for the count and legal lines (the mock's soft #8a8172 measures 3.41:1 on the page colour, below WCAG AA 4.5:1, 00_claude_code_operating_model.md:253; report-soft #655f55 is 5.61:1 and is the mock's own t3).
  - Chips: text-[13px] font-normal, inside a transparent 44 px Button with an inner 32 px View pill, so the 44 floor holds (O16).
  - Rows: one min-h-[48px] and no other min-h token, text-[15px]; the typed part bold (segment font-bold) and the rest medium (segmentDiffers font-medium), both text-report-ink: the existing diffCandidateAddress segments with the two classes swapped (O12 ruled). The drop carries border-t, the thin grey line (the mock's line-soft). Message lines: 15/20 and 13/18. Hint: 12/16.
  - Box: rounded-[26px] with overflow hidden (rounded-full would turn a tall box into a capsule).
  - Spinner: in a 44x44 centred View at the right edge.
  - Centring: the Input drops py-3, keeps its one min-h-[44px] (parcelScreens.golden.test.ts:60-61 needs exactly one min-h token on an Input) and gets h-[44px] (the vendored base adds h-10 and leading-5, input.tsx:6). This is checked on the device only (section 9).
- (f) Wording (content files):
  - search.miss becomes "No lot found for {query}" (state 4; RR-0483 "can't find 41 derwyn"): a template with the var query = derived input; templates already exist on both targets (search.ratelimit), so there is no phone-only key.
  - New: search.miss.hint "Check the house number and street name."; search.outside_toronto.title "Outside Toronto" (the existing search.outside_toronto becomes its second line); list.hint "More than one address matches. Tap the one you mean." These three are the mock's own words (states 4, 5 and 3). Removed, dead on both targets after step 12: list.rail, list.badge, list.select, list.select.label.
  - question.title becomes "Is this a semi?".
  - The answer labels become the mock's, as drawn in state 7: answer.yes "Yes", answer.no "No", answer.not_sure "Not sure" (semi content :4-6). select.go "Continue" and the dots stay (RR-0321).

#### 4. The change, file by file, in build order (the card's Files line is the complete list of these paths, set by the plan grounder's fold)
1. mobile/src/lib/parcelSearchMatch.ts. buildSearchSituation (:329-366) gains the argument `submitted: string|null`.
   - query = submitted ?? debounced.
   - New fields: rows {parcelId, address, route}[] (text_candidates capped; unique gives [match]; multi_parcel gives [candidates[0]] with the map route); open; hint ('several'|'refine'|null); showChips; showCount.
   - route is set only when submitted is not null and the fetch has settled (the hook keeps no previous data, so a payload always belongs to the active query). showMiss (also true for a submitted non-blank query shorter than min_query_len, with no fetch) and the outside line (a new boolean, showOutside) are set only when submitted; showPrompt is removed from the situation; an outside query is still refused before the network.
   - candidates and overCap keep their meaning. selectedParcelId leaves the situation, the builder's arguments, the screen, both bindings and the tests (no other reader: the lot map has its own selectedParcelId in lotMap.ts, a different situation, which stays).
   - Plus a dated note above buildSearchSituation, not in the header (section 1 a).
   - isOutsideToronto (:101-116) is not changed (O5 ruled (a)).
2. mobile/src/constants/parcelSearch.ts. Add the box, bar, drop, row, rowText, hint, msg, msgTitle, msgSub and spinnerSlot classes. Change input, allowance, chip, chipText, legal, segment and segmentDiffers (:139-148, :168-169). PARCEL_SEARCH_ICON gains row:18 and msg:18.
   - Keep card, cardChecked, select, rail, badge and listHeader: LotMap reads them (LM:9-44), and semi-question-design.logic.test.ts:113 pins select.
3. OUTSIDE FILES LINE: mobile/src/components/surfaces/SurfaceRenderer.tsx. ACTION_PROPS (:148) gains onSubmitEditing. The action switch (:111-145) and SurfaceActions (:36) gain submit as an optional member, submit?: () => void, called as act.submit?.() (like open_help, :43). select stays required: the wall host (useWallState.ts:28) and the disambiguate and semi-question hosts still pass it. This is needed because the renderer drops unknown action props. Reading of Spec 136 fe.31 (:124, a new component kind or binding is an operator ruling first): submit is a new action name and one prop name on an existing binding, not a new component kind or binding (COMPONENTS, bindings.json modules and mapping.mobile.SEARCH do not change); the authority is RR-0483 (Enter) and RR-0487; the precedent is open_help, added on both targets with a dated note (Spec 126:995).
4. OUTSIDE FILES LINE: scripts/surfaces/_schema/bindings.json. non_display_keys (:95) gains onSubmitEditing, and the web prop name for Enter if SV-SBIND asks, with a dated note in its $comment. SV-SBIND judges golden prop names.
5. mobile/src/components/surfaces/SearchBinding.tsx.
   - pill() becomes a box: bar row plus drop. Input gets onSubmitEditing {action:'submit'}. The spinner goes in the slot.
   - Each row is a Button (testID parcel-candidate-<id>, onPress {action:'push', route}, MapPin icon, the existing segment Texts). The rows are not candidates: a unique or multi_parcel row lives in match, so segmentsOf, searchData's label and segments and the row refs are built from rows (the push uses the row's literal route, so no contract ref is needed); the DERIVED_NAMES patterns label.i and segments.i.j.text still cover them, so the deviation stays derived-only.
   - Hint, miss (keeps testID parcel-search-empty plus the new hint Text), outside line (keeps parcel-search-outside-toronto, now not an Alert), and refine (same testID) go inside the drop; the prompt block, its testID and its key are removed (O14).
   - The help link goes in the drop after the rows (O9).
   - Rail, badge, radio cards and Select are removed from the phone tree. reportsLeft and chips are gated on showCount and showChips. legal() stays last. The rate-limit, entitlement and error notices stay where notices() puts them; the block-order case "notices, list, refine, miss, prompt" in parcelScreens.golden.test.ts is updated for the drop and loses prompt.
   - DERIVED_NAMES (:49) drops candidate_count (unused on both targets after step 12); the descriptor's declared derived names (deviation :530) lose it in step 9.
6. mobile/app/(app)/parcel-tool/index.tsx.
   - useState submitted. change_input clears it. The submit action sets it to the trimmed input, and does nothing when that is empty. set_input (a chip tap) sets the input and submitted together.
   - The hook query becomes searchQueryArg(submitted ?? debounced), so Enter does not wait for the debounce.
   - selectedParcelId and its effect (:37, :44-47) go.
   - navigate() records submitted ?? debounced (so an Enter before the debounce records the typed text; the recent store already de-duplicates, recentSearchesStore.ts:52-59) and sets a pushed flag. A new useFocusEffect with stable deps clears input, submitted and navigatedForRef only when that flag is set, then resets it. The effect (:100-109) is kept as it is: it pushes only when situation.route is set, which needs submitted. useWallState keeps reading error as today (O2 ruled).
7. mobile/src/constants/lotMap.ts. The keys semiHeading, semiCard, semiCardChecked and semiCardText are also read by WallBinding.tsx (:38-44, the report-limit and reactivate wall, which has no mock and no ruling for a new look), so they are not edited. Four new keys are added beside them (semiQuestionHeading, semiAnswerCard, semiAnswerCardChecked, semiAnswerText) and SemiQuestionBinding.tsx (:47-52, added to the Files line) reads them; the wall and its goldens do not move.
   - semiQuestionHeading: mt-6 w-full text-[26px] leading-[32px] font-bold text-report-ink.
   - semiAnswerText: flex-1 text-[15px] leading-[20px] font-normal text-report-muted.
   - semiAnswerCard and semiAnswerCardChecked: the semiCard classes with py-3 and one min-h-[48px], replacing min-h-[44px] and py-4.
   - The dots and Continue stay (RR-0321).
8. Content files: scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.content.json and mobile_parcel_semi_question.content.json, as in 3(f).
9. OUTSIDE FILES LINE, descriptors. The census file is the source of record and the descriptor files are emitted from it, so the edits below are made in the census rows and then emitted (see the census bullet):
   - mobile_parcel_search.descriptor.json: states (:319-364) gain a twelfth state, `partial`, whose golden is `suggest` (O8: the state names are a closed list, surface.schema.json:1999-2055, and the golden name is free, as reports_left under hit). Dated notes in docs.purpose (:5), checks parcelsearch_empty_state and parcelsearch_toronto_only, and the deviation; parcelsearch_empty_state names three non-result renders (empty, prompt, refine) and loses the prompt, and the measured_states entry prompt_type_more becomes short_query_enter. Re-point the SearchBinding/IDX line cites in errors.evidence and checks by hand: no tool catches a stale cite (the evidence at :266 already cites parcel-tool/index.tsx:287 in a 135-line file).
   - mobile_parcel_semi_question.descriptor.json: purpose (:5) gets a dated note on the new question.
   - scripts/surfaces/_schema/census/mobile-product.json: rows mobile_parcel_semi_question (:7154) and mobile_parcel_search (:7578) are JSON-identical to their descriptor files today (checked in memory). Edit the census rows first, then run generate-surface-registry.mjs --emit-descriptors (:1596), which writes both descriptor files from the census and rewrites src/lib/surfaces/generated/surface-descriptor.d.ts and validate-descriptor.mjs (expected byte-unchanged; if either differs, stop and add it to the Files line). Never hand-edit a descriptor file: generate-surface-registry.mjs --check prints DESCRIPTOR DRIFT and surface-registry.infra.test.ts:277-281 fails.
10. OUTSIDE FILES LINE, fixtures and generated files:
   - mobile/__tests__/fixtures/parcelSearch.situations.json: every situation gains submitted, rows, hint, showChips, showCount and showOutside and loses selectedParcelId; a new suggest situation is added; showPrompt is removed from every situation, the static one included (O14); the named case prompt_type_more becomes short_query_enter (a submitted 2-character query, expecting parcel-search-empty). The same file is read by the web goldens (surface-goldens.ts SITUATIONS), so step 12 changes the web situations the same way.
   - Then, in order (after the census edit and the --emit-descriptors run of step 9):
     1. search-golden-capture.ts --write, which writes src/tests/fixtures/surfaces/mobile_parcel_search/*.mobile.json (11 plus suggest).
     2. surface-goldens.ts, which writes *.web.json. The web tree mirrors the mobile tree (step 12), so every web golden changes in content, plus a new suggest.web.json.
     3. semi-question-golden-capture.ts --write, which writes the 8 semi *.mobile.json.
     4. emit-mobile-surfaces.mjs --write, which writes mobile/src/generated/surfaces/mobile_parcel_search.json and mobile_parcel_semi_question.json, and mobile/__tests__/fixtures/surfaces/mobile_parcel_search.goldens.json and mobile_parcel_semi_question.goldens.json.
     5. generate-surface-registry.mjs (the default run), which rewrites docs/reports/generated/127-surface-registry.md and 127-surface-review-queue.md: the text moves beyond the state count, so commit what it writes; its --check must print clean.
11. OUTSIDE FILES LINE, specs: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md (§4 note), docs/specs/00-architecture/117_maxbld_brand.md (§6.1 note), docs/specs/03-mobile/99_mobile_state_architecture.md (§3.4c note: the add(query) triggers are a row tap or Enter, not SELECT) and docs/specs/02-web-admin/126_maxbld_surface_standard.md (§11b dated note: the submit action, the non_display_keys gain and the web mirror).
12. OUTSIDE FILES LINE, the web target (O13 ruled, both targets). Why: Spec 135 FE-07 (operator Q-MFP a: mobile, web, admin and PDF render the same declaration; parity compares each target's real output), RR-0445 (mobile first, also on the web) and the committed lock src/tests/surfaces/search-parity.golden.test.ts, which requires per state the same refs, action names, ordered testIDs and situation on the web and mobile goldens (:5-8, :69-74) and pins the state list (11 states); open_help was added on both targets for the same reason (Spec 126:995). The web page is static (SearchPageClient.tsx sends no lookup and passes no actions), so this mirrors the tree and adds no behaviour.
   - src/components/surfaces/web/SearchBinding.tsx: pill becomes the box (bar plus drop); rows are Buttons with onClick push (no radio role, no Select, no list header or badge) and, for a row whose route is a lot route (/parcel-tool/<id>), the same route as href, which the web renderer already draws as Button component={Link} href (NAV-6 of nav-by-route.logic.test.ts; a map-kind row carries no href: the web never navigates to disambiguate?q=, maxbld-web.ts:16, S-7); hint, miss template, outside line (not an Alert) and refine sit in the drop (no prompt); chips and count are gated on showChips and showCount; WebActions and the handler allow-list (:333) gain submit, fired on Enter by the TextInput; WebSituation gains the new fields and loses selectedParcelId; segmentsOf and searchWebData read rows. A difference in refs, actions or testIDs between the targets, other than the ruled footer and legal-line difference, is a parity failure: fix the binding, never the lock.
   - src/lib/surfaces/maxbld-web.ts: WEB_STATIC_SITUATION and its two spreads carry the new fields (submitted null, rows [], hint null, showChips, showCount, showOutside false) and no showPrompt field (O14).
   - Tests, each rewritten with a dated note keeping its old title: search-parity.golden.test.ts (the state list gains suggest, 11 becomes 12), search-web-binding.ui.test.tsx (:77 list.badge, :33 and :81 the prompt text, :90 the idle prompt (the idle page now holds none), :95 static equality, :105 and :129 radio and Select) and maxbld-web-pages.logic.test.ts (:134); nav-by-route.logic.test.ts loses its allow-list entry for node:Button#select (audit 46: the Select button is gone and the rows now meet the owed Button component={Link} href), with a dated note; the lock reads the rows as web binding Buttons with an href key.
- Unchanged: parcelSearchCore.ts, server code, static-page.json (question.title is still the key), WallBinding.tsx and the wall goldens.

#### 5. Tests first (each written red, then green). Server cases are already locked by parcel-lookup tests; no server change.
mobile/__tests__/parcelSearchScreen.behaviour.test.tsx (mocked hook, fake timers):
- T1 "typing an exact address never navigates": hit 5293897 on '41 Derwyn Rd' after 400 ms. Expect no push, row parcel-candidate-5293897, recent []. (AC1)
- T2 "Enter on a unique opens the lot once and records it": submitEditing. Expect a push to /(app)/parcel-tool/5293897, recent ['41 Derwyn Rd'], no second push on rerender. (AC1)
- T3 "Enter before the debounce queries the typed text at once": '679 Queen St W', submit at 100 ms. Expect the hook called with that text before 400 ms; with hit 5476455, a push. (AC1)
- T4 "a tap on a row opens that lot; no Select": '383 El' rows 5106944, 5461541, 5191692. Press 5191692: push /(app)/parcel-tool/5191692. queryByTestId('parcel-search-select') is null. (AC1, AC2)
- T5 "Enter on several matches keeps the rows and shows the hint": '383 El' (3 rows: 5106944, 5191692, 5461541) plus submit. Expect parcel-search-hint and no push. A second case, '12 Elm' (10 rows, the cap), expects parcel-search-refine and no parcel-search-hint. (AC2)
- T6 "a miss shows only after Enter": '108' no_match while typing gives no parcel-search-empty; after submit its text is 'No lot found'. (AC2, finding 32)
- T7 "outside Toronto inside the box": '123 Main St, Mississauga'. While typing nothing shows; after submit the line shows in the drop; the hook gets '' throughout; no push. (AC2)
- T8 "the first delete clears the list": rows for '383 El' (the stack has no '67 Northbridge Cres'; near-match rows draw as they come), then changeText '383 E' before the debounce. Expect no parcel-candidate-*. (AC3)
- T9 "the box is empty on return": after a push, fire the captured focus callback (the file's useFocusEffect mock captures nothing and re-runs on a new callback: change it to capture, and keep the new effect's deps stable). Expect input value '' and chip '41 Derwyn Rd'; a focus with no earlier push leaves the box alone. (AC3)
- T10 "map kinds open only on Enter or a tap": '78 Robert St' multi_parcel (5259138, 5438421) and 'King and Bay' intersection. No push while typing; submit pushes the disambiguate route with kind. (AC1)
- T11 "a held unsure lot opens its lot route on Enter": '14 Norwood Ter', 5334051. (AC1)
- T12 "a street with no number: Enter gives rows plus refine, no push": 'Gerrard St'; the same rows with refine show while typing, before any Enter (the suggest golden). (AC2)
- T13 "a chip tap submits": chip '41 Derwyn Rd' with a unique hit: one push, no Enter. T14 "a blank Enter does nothing": no state change, no push. T15 "a row label is the address, else the parcel id" (restates the c.address || c.parcelId fallback and getByLabelText('100114') of surfaceRenderer.smoke.test.tsx:101-115). T16 "Enter does not push while fetching; edit then retype pushes again" (restates :98). T17 "a short Enter shows the miss line": '26' plus submit: parcel-search-empty reads No lot found for 26, nothing is fetched, no push. (AC2)
- Every old case that types without Enter and expects a result is rewritten with a dated note that keeps its prior title: :88 unique navigates once, :98 no push while fetching and retype, :112 a tap selects and SELECT pushes, :124 nothing pre-checked, :134 an intersection auto-push, :142 a miss and an error record nothing and Retry calls refetch with no argument (kept: the error notice and Retry are unchanged), :154 a chip sets the input (now it submits), :174 the refine line (task-450 AC1), :184 the prompt carries min_query_len (task-450 AC4: the {min} binding now lives in search.input.hint, which the same case checks; the prompt is gone and a short Enter shows the miss line) and :80 outside Toronto. :71 and :164 stand.

mobile/__tests__/parcelSearchMatch.test.ts (buildSearchSituation):
- route is null unless submitted is set and the fetch has settled; the truth table (:405-417) is restated with submitted and without selectedParcelId, keeping "a settled miss keeps its line on a re-fetch (task-450 V4)" and "error + data lists no candidates";
- a unique answer gives one row;
- the deletion rule;
- showMiss (a short submitted query included) and showOutside only after submit, no showPrompt field, and a blank submit changes nothing; the old showPrompt cases (:419, :479) become the short-Enter miss case;
- the hint kinds;
- O5 is ruled (a): the STATED LIMITATION case (:247) stays as it is; no isOutsideToronto test changes.

mobile/__tests__/parcelScreens.golden.test.ts:
- no golden has role radio or parcel-search-select;
- the outside line is not an Alert;
- legal is still last;
- the unused-by-mobile key list (:121) stays the four footer keys, because the four list.* keys leave the content file (dead on both targets); the planted-red proofs are kept for the 44 px floor (a sub-44 chip or row) and the block order; the radio and Select proofs go with their blocks (dated note);
- 12 goldens.

mobile/__tests__/surfaceRenderer.smoke.test.tsx: onSubmitEditing calls submit, and an unknown action still throws; its cases at :101-115 (10 radios, a checked card, the parcel-id label, "10 candidates", Select) are rewritten for rows with a dated note.

Semi page:
- semiQuestionPage.behaviour.test.tsx:68, :69 and :280 expect 'Is this a semi?' and the label 'Yes'. (AC4)
- src/tests/semi-question-design.logic.test.ts:35, :54: the heading is text-[26px] leading-[32px] font-bold and the answers text-[15px] (they read the new semiQuestionHeading and semiAnswerText keys); a new case proves the heading px is larger than the answer px. That is a class check only: the heading was already larger by class (text-lg 15.75 px against text-base 14 px) when the operator saw the answers larger (finding 19), so it is NOT a lock for finding 19. The cause of finding 19 is unknown (UNVERIFIED), and the device walk measures the rendered heading and answer sizes as an explicit gate. (AC4)
- AC5 is covered by the class assertions against the mock table plus the device walk.

#### 6. Limits, and failure risks with how the build catches each
- Out of scope: no database step, no setting, no server, meter, compute, loading or report change, web binding unchanged.
- The mobile jest suite is not run by the commit hook (semi-question-design.logic.test.ts:9 says so). It must be run by hand or at the station, with the output kept.
- Line-cite drift is NOT caught by a tool: the descriptor evidence at :266 already cites parcel-tool/index.tsx:287 in a 135-line file, so cites are re-pointed by hand. A missing Files-line path is refused at the close (cards 454 and 456 hit it): the card's Files line is the complete list, resolved in memory against rule-lists.json with no unmatched path. It attaches the list step-132 (the descriptor files match scripts/**/*.descriptor.json), so the card's references gain compliance:step-132 docs/specs/01-pipeline/132_step_standard_handbook.md (backlog CLI --add-ref). Checked and unaffected: daylightSearchPages.golden.test.ts walks every fixture situation through the class-token rules (the new classes must pass), and the admin "No parcel found" copy (ParcelCostTool.tsx:210) is a separate string.
- The web is built here (step 12): its goldens change in content in every state, and the parity lock is the check. The old rule "stop if a web golden diff is not fingerprint-only" is withdrawn.
- O2 is ruled: no change. A ReportLimitError needs a produced page (route.ts:114-123), so it cannot come on the q path while MAXBLD_WEB_LIVE is false; with the switch on it can until task-267 lands, which is why 267 must land before LS.12.

#### 7. Notes owed (backlog files only through the backlog CLI)
- Spec 100 §4 and Spec 117 §6.1: dated notes (M-246, prior text kept) quoting RR-0483, RR-0485 (1, 6) and RR-0487, covering a, b, c, e, f and h above; Spec 99 §3.4c (a row tap or Enter, not SELECT); Spec 126 §11b (the submit action, the non_display_keys gain and the web mirror; precedent open_help, :995).
- Descriptor dated notes and their census copies (section 4 step 9).
- Header notes in PSM and IDX.
- Card 465 (backlog CLI): the plan id; the Files line is the final list set by the grounder fold (every OUTSIDE path of section 4 is in it); the references gain compliance:step-132; the meter note; the departure from the drawn mock, stated once: no district line (P35-D15 b).
- Cards 267, 287 and 343 (backlog CLI): a note on the typing cost (O1). Card 267 also: its "search only finds the lot" (McFixV2 addition (c)) must land before LS.12; finding 4 is split: Enter is fixed here, and the no-report screen and the 21 s wait stay with 267 and 343.
- doc-2 D.3 wording (backlog doc CLI): open.

#### 8. Open choices (my recommendation is marked "rec")
- O1 Cost and meter while typing. (a) Accept it for now (switch off) and make 267's "search only finds the lot" (task-267, McFixV2 addition (c)) land before LS.12. (b) A server flag that skips the page and the meter on the q path: this needs a field and touches 267/343 (RR-0392). RULED (a): task-267's PLAN-267-v1 (unreviewed, built after this card) moves the compute and the count to the parcelId request, with no field and no meter change, and does not touch index.tsx; it must land before LS.12. Card notes as in section 7.
- O2 The limit wall while typing. Show it only for a submitted query (phone-only), or keep today's behaviour. RULED: no change (section 6). A limit needs a produced page (route.ts:114-123 calls openReport only then), so it cannot come on the q path while MAXBLD_WEB_LIVE is false, and task-267 removes the q-path page before the switch goes on.
- O3 District line. None exists. Either a server and contract field (its own card), or no second line. RULED: none. P35-D15 b (Spec 100:146) says no area line until a later contract row; no field exists (schemas.ts:364-367); the card allows no server change; the mock's foot says the districts are examples not read from the address data. The later contract row has no card and is not opened here.
- O4 Enter on a single-row text_candidates (a partial address). Either the row plus the hint, or "No lot found" plus the row (RR-0483 "you get the error"; RR-0443 c). RULED: the miss line plus the row (section 3(b)).
- O5 Outside Toronto with no comma. (a) Keep the stated limit (PSM:63-68): it reaches the server and shows "No lot found". (b) Refuse when the last words are a NON_TORONTO name after a street-type word. RULED (a): the card hands the no-comma case to the plan; (b) would invert the pinned STATED LIMITATION test (parcelSearchMatch.test.ts:247) and the notes at PSM:63-68 and in the descriptor, and needs a street-type word list (a new rule) that can refuse a real Toronto address. A no-comma outside address reaches the server and reads "No lot found for ..."; finding 29 is met for the comma form only.
- O6 Map kinds while typing. One row (multi_parcel's printed address) and nothing for intersection, or nothing for any. RULED: one row (nothing opens while typing; a tap on the row opens the map page).
- O7 Hide the count and chips while the drop-down is open (mock states 2-6). RULED: yes (mock states 2 to 5 draw neither).
- O8 New states. RULED: no new state name. The typing render is the twelfth state under the existing name partial (a partial address, RR-0443 c) with golden suggest. `suggest` is not in the closed list (surface.schema.json:1999-2055) and adding one is not needed: fe.31 asks one golden per reachable state, screen-checks.mjs:264 refuses a name declared twice, and precedent maps a golden to the nearest unused name (the disambiguation map: hit, miss, empty, static; the semi page: ambiguous to ask, hit to answered; this page: hit to reports_left). The outside case keeps its named state, with submitted set. The refine line keeps its task-450 behaviour: it shows with the rows while typing (guidance, not an error; the mock state 2 draws only an uncapped numbered list), and list.hint shows after Enter only. So the suggest golden is a capped or no-number list with list.refine, and the ambiguous golden is Enter on a few numbered rows with list.hint; together they cover both content keys (parcelScreens.golden.test.ts:114-123).
- O9 "Report incorrect address match" (ruled P35-D18 a; not drawn in the mock). Keep it inside the drop under the rows, or drop it. RULED: keep (P35-D18 a is ruled and nothing removes it; the mock is silent).
- O10 The miss text. RULED: the mock's "No lot found for {query}" plus the hint (state 4; RR-0483 "can't find 41 derwyn"), as one key, search.miss, a template with the var query; templates already exist on both targets, so it is not a phone-only key.
- O11 Semi answers. RULED: the mock's Yes, No and Not sure (state 7 as drawn; the foot exempts only street names and districts). Continue and the dots stay (RR-0321).
- O12 Highlight. RULED: the mock's bold typed part, built with the existing segments and their classes swapped (RR-0487: the approved mock replaces the older amber differing-part rule where they differ).
- O13 Web. RULED: both targets now (step 12; Spec 135 FE-07, RR-0445 and the committed parity lock search-parity.golden.test.ts).
- O14 The at-rest prompt (it shows today with '' typed): show it only after Enter with a short query. RULED: no prompt at rest (mock state 1 draws none) and no prompt line at all (second addendum): RR-0487 (MD:2544) replaces the older design where they differ, the seven drawn states hold no prompt, no ruling or spec holds its words (task-450 L5 only bound {min}, which search.input.hint keeps), and RR-0483 (MD:2523) says that on Enter with an incomplete address "you get the error". A short submitted query therefore shows the miss line. The key search.prompt, its testID and showPrompt are removed on both targets; WEB_STATIC_SITUATION loses showPrompt and its two spreads lose showPrompt false.
- O15 Commit trailers: search is MF-35 and semi is MF-93 (git log). Two commits, or one if the gate accepts one trailer. RULED: one McFrontend-Task trailer per commit (cite-arms.mjs:147-154 reads one trailer and its newest prereg), so commit by surface group (search MF-35, semi MF-93, web MF-44) unless a dry run shows one trailer passes; no bypass.
- O16 Chips: a 32 px look inside a 44 px Button (rec), or a 44 px pill. RULED: the 32 px look inside the 44 px Button (the 44 floor holds, bindings.json touch_targets.mobile).

#### 9. UNVERIFIED
- On-device sizes, the centring of the typed text and the spinner position: needs the phone walk.
- iOS firing onSubmitEditing with returnKeyType 'search' (the standard return-key handler; the key already shows on the phone, finding 4). A gate at the phone walk, the standing step of RR-0488: if it does not fire, stop and put it to the operator; no fallback button is built.
- (settled) the census is the source of record: surface-registry.infra.test.ts:277-281 and generate-surface-registry.mjs --check, step 9.
- (O15) the prereg coverage of each McFrontend-Task is not read here; the first commit is a dry run.
- The exact one-line caller for surface-goldens.ts.
- How the Button ghost variant classes fare under the layout rules.
- The meter's already_counted scope.
- No tests or generators were run (read-only).
- Finding 19's cause: the heading was already larger by class (text-lg 15.75 px against text-base 14 px), so the cause is unknown; the device walk measures the rendered sizes, and the class test is not a lock for it.
- Other tests that read the search goldens (search-reports-left, screen-checks, surface-conformance, failure-state-declared, parcel-legacy-oracle) were not read in full; a red one is added to the Files line by the backlog CLI before its commit.
- .claude/review-templates/packs/mobile-100-p2.md copies Spec 100 text; no script or test reads it (git grep), so it is not edited.

Plan review round 1: 41 folded, 0 task, 0 ruling, 0 wontfix, 1 pile; grounder docs/reports/reviews/task-465/GROUNDER-PLAN.md; triage docs/reports/reviews/task-465/TRIAGE-PLAN.md
in#1 HIGH folded 12. OUTSIDE FILES LI
in#2 HIGH folded The census file is t
in#3 HIGH folded The same file is rea
plan-error-paths#3 MED folded Enter on a blank box
plan-error-paths#5 MED folded A new useFocusEffect
plan-error-paths#6 MED folded RULED: no change (se
plan-error-paths#7 MED folded so repeated texts fo
plan-plan-review-deepseek#3 MED folded RULED: no change (se
plan-plan-review-deepseek#4 MED folded O1 is ruled in secti
plan-plan-review-deepseek#5 MED folded if it does not fire,
plan-plan-review-deepseek#7 MED folded selectedParcelId lea
plan-ux#1 MED folded shown in the drop-do
plan-ux#2 MED folded if it does not fire,
plan-ux#3 MED folded the miss line plus t
plan-ux#4 MED folded A new useFocusEffect
plan-ux#5 MED folded The drop carries bor
in#4 MED folded submit is a new acti
in#5 MED folded select stays require
in#6 MED folded searchData's label a
rc#1 MED folded mock state 6 (a brie
rc#2 MED folded which has no mock an
rc#3 MED folded it is NOT a lock for
rc#4 MED folded expects parcel-searc
rg#1 MED folded a recent-search chip
rg#2 MED folded that types without E
rg#3 MED folded the card hands the n
rg#4 MED folded This card does NOT d
rg#5 MED folded The answer labels be

## Implementation Notes
2026-11-25: mock APPROVED by the operator (RR-0487, MORNING-DECISIONS.md:2543, verbatim "465 Mock  approved"). Approved mock: ~/Buildo-scratch/lanes-20261125/mcfixv2-465/MOCK-465-approved.html sha256 05b387fa3304 (published https://claude.ai/artifact/NDup2QHQMFKcfLSo9Howk1). Seven states: at rest; typing with suggestions; Enter with more than one match; Enter with no match (No lot found); outside Toronto; Enter with one match (finding the lot); semi question (Is this a semi?). The mock notes that sizes are close, not measured, and that the example street names and districts are illustrations.

2026-11-25: plan PLAN-465-v1 by Cairn-Plan-465 set on the card (planner hand-back saved at ~/Buildo-scratch/lanes-20261125/mcfixv2-465/PLAN.md). Files line owes every OUTSIDE FILES LINE path of the plan section 4; the plan grounder rules that.

2026-11-25 taken on the board at lane launch (lane BL-MCFIX465, worktree /Users/brettpreston_macmini/Buildo-wt-mcfix465, branch wf2/mcfix465), RR-0240

2026-11-25 (RR-0495, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2579, operator verbatim "correct" to the lane's option a): the type-more prompt line is dropped; Enter on a too-short entry shows the No lot found line. The plan grounder folds the exact plan text.

Build (lane BL-MCFIX465, 2026-11-25): plan PLAN-465-v1 as folded (addenda ea79b4d9e: typing state partial with golden suggest, refine line keeps its task-450 timing; 1aee693d6: RR-0495, the prompt line dropped, a short Enter shows the miss line). Deviation recorded once: none beyond the addenda. Notes: (1) the web rows push the web route of their lot (parcelSearchPath unique, WEB_BASE); a multi_parcel row on the web has no handler (rendered disabled) because the web never navigates to the core's disambiguate?q= path (maxbld-web.ts, MF-44 security S-7); no web golden carries that case. (2) The mobile jest tests are not run by the commit hook: their red and green are UNVERIFIED until the push station; an in-memory tsx probe over every search situation (layout rules, derived names, ref resolution) was clean; mobile tsc clean. (3) maxbld-web-pages.logic.test.ts needed no edit (its :134 equality holds with the new WEB_STATIC_SITUATION).

Files line (2026-11-25, lane BL-MCFIX465): + src/tests/surfaces/admin-media.golden.test.ts and src/tests/surfaces/site-footer.logic.test.ts, under the plan line "Other tests that read the search goldens (...) were not read in full; a red one is added to the Files line by the backlog CLI before its commit": both are count pins that went red in the work-commit related run because the search page gains one web golden (suggest): admin-media fresh.size 70 to 71, site-footer web search goldens 11 to 12. Go: orchestrator message to lane BL-MCFIX465, 2026-11-25 ("go, under the plan own rule"). Only the two counts and a dated note change in each.

Files line (2026-11-25, lane BL-MCFIX465): + docs/reports/generated/127-surface-registry.md, 127-surface-review-queue.md and rule-lists-by-kind.md. The work commit was refused by the commit-msg hook check-task-files: "docs/reports/generated/127-surface-registry.md is outside the Files: line of task-465 ... Declare it on the task or move it to its own task." (the same for the other two). scripts/hooks/check-task-files.mjs:10 always allows only the task file, docs/reports/reviews/<task>/ and docs/reports/lanes/; the note in QUESTIONS-RULED.md that these pages are exempt (docs/reports/) was wrong. The pre-commit generator checks require all three current (generate-surface-registry.mjs --check, rule-lists.mjs page --check). Precedent: task-450 carries the same three on its Files line. Go: orchestrator message to lane BL-MCFIX465, 2026-11-25.

Files line (2026-11-25, station FAIL on b3791a88c, RR-0467; plan line "a red one is added to the Files line by the backlog CLI before its commit"; go: orchestrator message to lane BL-MCFIX465 of 2026-11-25): + src/tests/surfaces/contract-binding.logic.test.ts: the non_display_keys pin 81 -> 82 and its last four names, because bindings.json gains onSubmitEditing (plan step 4). The web prop onSubmit, added beside it in b3791a88c, is removed: the plan adds it only if SV-SBIND asks, and SV-SBIND does not judge its object value.

Files line (2026-11-25, station FAIL on b3791a88c, RR-0467; plan line "a red one is added to the Files line by the backlog CLI before its commit"; go: orchestrator message to lane BL-MCFIX465 of 2026-11-25): + src/tests/surfaces/parcel-legacy-oracle.logic.test.ts: three legacy literals become ruled changes in INTENTIONALLY_CHANGED: the testID parcel-search-prompt and the text Type at least {SEARCH_MIN_QUERY_LEN} characters to search. (RR-0495, the prompt dropped) and the text No parcel found for that address. (card item 3: it becomes No lot found; RR-0483, RR-0487 mock state 4); the planted-red list is unchanged (it measures against the same list).

Files line (2026-11-25, station FAIL on b3791a88c, RR-0467; plan line "a red one is added to the Files line by the backlog CLI before its commit"; go: orchestrator message to lane BL-MCFIX465 of 2026-11-25): + src/tests/surfaces/search-reports-left.logic.test.ts: the count of committed states without a reports-left line 10 -> 11 (the typing state partial, golden suggest, O8).

Files line (2026-11-25, station FAIL on b3791a88c, RR-0467; plan line "a red one is added to the Files line by the backlog CLI before its commit"; go: orchestrator message to lane BL-MCFIX465 of 2026-11-25): + src/tests/surfaces/surface-conformance.logic.test.ts: the C-1 notes: S-screen goldens 103 -> 105 (suggest on both targets) and S-sbind strings 444 -> 442 (search content: list.rail, list.badge, list.select, list.select.label and search.prompt removed; list.hint, search.miss.hint and search.outside_toronto.title added).

Files line (2026-11-25, station FAIL on b3791a88c, RR-0467; plan line "a red one is added to the Files line by the backlog CLI before its commit"; go: orchestrator message to lane BL-MCFIX465 of 2026-11-25): + src/tests/surfaces/surface-validate.logic.test.ts: the exact status string, the same two numbers (105 goldens, 442 strings).

Files line (2026-11-25, station FAIL on b3791a88c; plan third addendum, NAV-6 option 1 real links; go: orchestrator message to lane BL-MCFIX465): + src/tests/surfaces/nav-by-route.logic.test.ts: allow-list entry audit 46 (node:Button#select, the owed Button component={Link} href) deleted with a dated note, and its now unused WEB_SEARCH constant with it; a lot row on the web is a Button with an href (its web route), drawn as Button component={Link} href, and keeps onClick push for action-name parity; a map-kind row (multi_parcel) has href undefined and onClick null (no web route, S-7). The web UI test checks the href. surface-validate accepts the href literal (non_display_keys lists href).

Merge of wf2/board (2026-11-25, 7be07be67, task-469 folded): the card conflicted on two hunks; the board side was taken (task-469 plan section 3) and this lane re-added its 10 Files-line paths and its notes above through the CLI. The merge commit was made with git -c core.quotepath=false commit, as scripts/board/board-commit.zsh:13 does: check-partial-staging.sh:23-30 lists staged paths quoted, so the task-343 card (a non-ASCII middle dot in its name, 32,726 bytes) read as size unreadable (orchestrator go; the defect goes to the loose-ends card).

## References
- docs/reports/reviews/task-465/GROUNDER-PLAN.md
- docs/reports/reviews/task-465/TRIAGE-PLAN.md
- docs/reports/reviews/task-465/seat-integration-1.md
- docs/reports/reviews/task-465/seat-reality-check-1.md
- docs/reports/reviews/task-465/seat-regression-1.md
- compliance:step-132 docs/specs/01-pipeline/132_step_standard_handbook.md
- compliance:mobile-90 docs/specs/03-mobile/90_mobile_engineering_protocol.md
- compliance:mobile-98 docs/specs/03-mobile/98_mobile_testing_protocol.md
- compliance:mobile-99 docs/specs/03-mobile/99_mobile_state_architecture.md
- compliance:surface-136 docs/specs/02-web-admin/136_mcfrontend_handbook.md
- compliance:eng-all docs/specs/00_engineering_standards.md
- compliance:plan-protocol docs/specs/00-architecture/plan-protocol.md
- compliance:inc-S backlog/docs/increments/doc-2 - Increment-S-requirements.md
- compliance:ms-S backlog/milestones/m-1 - increment-1·b-search-[s].md

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
- RR-0320 C3 legal line at the bottom of the phone search page — "2 b" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1399)
- RR-0321 D13 semi page buttons 48 px is the operator ruling — "3 a" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1399)
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
- RR-0387 McFixReborn: each built task gets its own output review and confirmed findings are fixed by ordinary fix tasks; no new infrastructure; old findings dropped
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
- RR-0444 fold the McFixReborn findings
- RR-0147 Operator answer NAME-1
- RR-0445 limit and reactivate screens: mobile first, also on the web, follow the earlier process — "01 - we are mobie first - we always take that approach but it works onthe web.  We follow the same process with all the development - look back and follow" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2296)
- RR-0446 several-lots map stays as built; no-plan page joins the limit-screen task
- RR-0447 clean the board (label dead), review all tasks, then add the search-fix tasks
- RR-0448 the search-fix cards are created as 8 merged tasks
- RR-0450 queue rules and orchestrator note off for code reviews; step handbook for compute only; three questions replace the five principles
- RR-0452 tooling plan approved; the three questions are not added
- RR-0453 Real addresses stay in the task 449 test rows
- RR-0454 No switch on exact match; task 14 after launch; limit and no-plan screens wait for the buying work
- RR-0455 Task 452: web waits for switch-on; card split; spring is one card in Increment 1·C
- RR-0456 Semi question page gets a time limit; a zero-second rate limit retries once
- RR-0149 Increment 1·A tooling location
- RR-0457 Output review shape agreed: code review, mechanical checks, one validating grounder; plan to follow
- RR-0458 Output review shape applies to all cards; plan shown against the agreed actions as one small task
- RR-0459 Smaller output review: no error-paths review at output; task created with label ProcessImprovement
- RR-0460 Phone tests local first; inline report it link accepted; proof for new phone tests
- RR-0461 Card 461 clean seat report: run a fresh integration seat
- RR-0462 Phone checks quick plan approved; a dead card carries only the label dead
- RR-0463 Task 458 haptic feedback moves to Increment 1C
- RR-0464 Task 460: no separate security review at output; the validating grounder reads the sensitive files
- RR-0465 task 455 (a confidence word per reading) moves to Increment 1·D beside task 76
- RR-0466 task 452 limit screen keeps the notice box, first line emphasised, new wording
- RR-0150 Infra freeze named list
- RR-0467 task 452 line three is wording A; station runs on the fix commit before the review — "1 What is a lot service - doesnt make sense 2. a 3 what is this? 4 yes" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2424)
- RR-0468 task 452 failed-read notice on the limit screen: Something went wrong on our side. Please try again.
- RR-0469 task 452 the limit screen's own code file WallBinding.tsx is confirmed
- RR-0471 iPhone run: free Apple account, phone may reach the Mac on the home Wi-Fi, GO for a read-only test database check
- RR-0472 GO: bring the local test database up to the current migrations
- RR-0473 Yes: install CocoaPods and copy the Google settings file, local only
- RR-0474 External drive left alone; tasks 463, 456 and 454 worked overnight
- RR-0475 answers to the six morning questions
- RR-0476 phone test next; two process questions asked
- RR-0477 phone test now; batching rule adopted — "batch items that touch the same files or the same kind of file and need no database step. Keep anything with a database step or its own operator question on its own card." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2496)
- RR-0152 Increment 1·A re-use and drops
- RR-0478 sign-up allow-list entry confirmed (task-456)
- RR-0479 brief lines and the batching line, without the lane process
- RR-0480 phone test: onboarding flag for one test user on the local test database
- RR-0481 phone test: report switch on locally, onboarding flag for the at-limit test user — "approved" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2514)
- RR-0482 phone walk findings: sort, rule, batch into larger cards; fold 454 and seed the test stack — "Agreed. Remember our new policy on tasks - ie larger tasks and using existing components as well." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2518)
- RR-0483 search box the Google way, Enter wired, a card for the report counter — "your typed search does not execute until you press enter or select an address" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2523)
- RR-0484 dev GO for the six task-454 settings rows
- RR-0485 phone walk rulings: semi inside the search card, range check 1.C, no onboarding question, no report without pricing, loading animation always, Enter opens the lot — "We should not send a report without pricing - the report needs to be complete." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2533)
- RR-0486 McFixV2: phone walk fixes go into five existing cards, relabelled; go given — "relablet these fixes as McFixV2 - and remove all other labels - 5 tasks in total." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2538)
- RR-0487 task-465 search box mock approved — "465 Mock  approved" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2543)
- RR-0154 Work pulling
- RR-0488 dead label only for absorbed cards; pushed cards move on to done; phone walk a standing proof step; search proof split — "But tasks that finish and are pushed then move through as normal as done." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2547)
- RR-0489 search proof reduced to four steps: phone walk, one database read, pointer to passing tests, known gaps list
- RR-0490 load failure: keep the built sentence; animation finishes before a failure shows; no-report screen with the address; give-up time pending a mock
- RR-0491 loading screen endings mock approved, loading line centred
- RR-0492 loading: a failure shows right away; lines stay on the ending screens for now; changes RR-0490 3 b
- RR-0493 loading: 60 seconds is the failure limit; the label Checks for this lot is shown; no-report shows at once (as read)
- RR-0494 loading: a lot with no report shows the no-report screen at once
- RR-0495 search box: the type-more prompt line is dropped; a too-short entry on Enter shows No lot found — "correct" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2579)
- RR-0496 app first: the app tasks grouped as McApp (incl. saving a lot or report); McWeb pages; McLive and McNightlyTests proposed for later
- RR-0497 loading plan: 1 A, 2 A, 3 A; saving a lot is McApp; no cloud database move until the increments are complete
- RR-0156 Push 6 literal test
- RR-0498 McApp and McWeb: Account first version yes; nightly tests later; card for plans, success and cancel pages; 8 db test failures onto the loose-ends card; paid test user to its limit on the test database
- RR-0499 the MaxBLD app lives inside the one project (A); search page not converted to table rows; Expo upgrade yes
- RR-0500 saving a lot builds now with McApp
- RR-0501 Increment 1-C plan approved: McApp four cards first, then McWeb three with wiring; polish and later items to the last increment
- RR-0502 review skip list: add the generated phone picture copies (card 465 blocker)
- RR-0503 card 313 front door: no-plan user reaches search and sees the notice (1 A); start-up screen differences accepted (3 A)
- RR-0504 stay with A: the MaxBLD app stays inside the one project
- RR-0505 card 313: a deleted account reaches search with the no-plan notice until card 2 (A)
- RR-0506 McApp: the phone icon logo joins card 313; card 469 order: build, station, review, grounder, fold, close
- RR-0507 the phone icon is the approved House Mark with the MaxBLD brand name added at the top
- RR-0157 Push 6 R-MD
- RR-0508 phone icon: MaxBLD inside the square just above the house; BLD in the agreed colour
- RR-0509 phone icon: the mark alone, no name inside (replaces RR-0507 and RR-0508)
- RR-0510 card 313 title is stale; retitled to match RR-0499
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
- RR-0313 Search box says Enter a Toronto address (task-352 question 3) — "c. can't we put in the search box. Enter a Toronto address" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1216)
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
- RR-0320 C3 legal line at the bottom of the phone search page (names RR-0320) — "2 b" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1399)
- RR-0321 D13 semi page buttons 48 px is the operator ruling (names RR-0321) — "3 a" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1399)
- RR-0392 one push for all four; no other infrastructure beyond this (names RR-0392) — "Push for all 4. I  don't think we need any other infastrcuture beyond this.. we are good to go!" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975)
- RR-0442 the search opens a lot on an exact match (names RR-0442) — "It should open on an exact match and we have a different process for address mistakes, if the lot is shared by two parcels - you need to pick one - if its a semi potentially - you need to state that?" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2276)
- RR-0443 report limit: top-up or higher-subscription screen; questions grounded before they reach the operator; partial address = pick from close addresses (names RR-0443) — "4) Nbr 2- why is this a defect? yes, they need a screen with a top up or a higher subscription" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2283)
- RR-0445 limit and reactivate screens: mobile first, also on the web, follow the earlier process (names RR-0445) — "01 - we are mobie first - we always take that approach but it works onthe web.  We follow the same process with all the development - look back and follow" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2296)
- RR-0467 task 452 line three is wording A; station runs on the fix commit before the review (names RR-0467) — "1 What is a lot service - doesnt make sense 2. a 3 what is this? 4 yes" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2424)
- RR-0477 phone test now; batching rule adopted (names RR-0477) — "batch items that touch the same files or the same kind of file and need no database step. Keep anything with a database step or its own operator question on its own card." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2496)
- RR-0481 phone test: report switch on locally, onboarding flag for the at-limit test user (names RR-0481) — "approved" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2514)
- RR-0482 phone walk findings: sort, rule, batch into larger cards; fold 454 and seed the test stack (names RR-0482) — "Agreed. Remember our new policy on tasks - ie larger tasks and using existing components as well." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2518)
- RR-0483 search box the Google way, Enter wired, a card for the report counter (names RR-0483) — "your typed search does not execute until you press enter or select an address" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2523)
- RR-0485 phone walk rulings: semi inside the search card, range check 1.C, no onboarding question, no report without pricing, loading animation always, Enter opens the lot (names RR-0485) — "We should not send a report without pricing - the report needs to be complete." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2533)
- RR-0486 McFixV2: phone walk fixes go into five existing cards, relabelled; go given (names RR-0486) — "relablet these fixes as McFixV2 - and remove all other labels - 5 tasks in total." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2538)
- RR-0487 task-465 search box mock approved (names task-465, RR-0487) — "465 Mock  approved" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2543)
- RR-0488 dead label only for absorbed cards; pushed cards move on to done; phone walk a standing proof step; search proof split (names RR-0488) — "But tasks that finish and are pushed then move through as normal as done." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2547)
- RR-0495 search box: the type-more prompt line is dropped; a too-short entry on Enter shows No lot found (names RR-0495) — "correct" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2579)
- RR-0313 Search box says Enter a Toronto address (task-352 question 3) (names RR-0313) — "c. can't we put in the search box. Enter a Toronto address" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1216)

## Prior reviews and lane reports
### task-465 (this task)
- docs/reports/reviews/task-465/FINDINGS-PLAN.md
- docs/reports/reviews/task-465/FOLD-CHECK.md
- docs/reports/reviews/task-465/GROUNDER-PLAN.md
- docs/reports/reviews/task-465/QUESTIONS-RULED.md
- docs/reports/reviews/task-465/TRIAGE-PLAN.md
- docs/reports/reviews/task-465/seat-integration-1.md
- docs/reports/reviews/task-465/seat-reality-check-1.md
- docs/reports/reviews/task-465/seat-regression-1.md
- docs/reports/lanes/2026-11-25/BL-MCFIX469/REPORT.md (lane report naming task-465)

## Dependencies
- (none)
