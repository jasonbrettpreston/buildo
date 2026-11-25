---
id: TASK-465
title: >-
  McFixV2.1 Search box the Google way: Enter runs the search, suggestions and
  messages drop under the box, the box is the only focus; semi question reworded
status: RUNNING
assignee:
  - '@lane-BL-MCFIX465'
created_date: '2026-11-25T17:05:00Z'
updated_date: '2026-11-25T18:59:00Z'
labels:
  - McFixV2
milestone: m-1
dependencies: []
references:
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
type: fix
ordinal: 159210
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
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

Files: mobile/app/(app)/parcel-tool/index.tsx, mobile/src/components/surfaces/SearchBinding.tsx, mobile/src/components/surfaces/SurfaceRenderer.tsx, mobile/src/components/surfaces/SemiQuestionBinding.tsx, mobile/src/constants/parcelSearch.ts, mobile/src/lib/parcelSearchMatch.ts, mobile/src/constants/lotMap.ts, src/components/surfaces/web/SearchBinding.tsx, src/lib/surfaces/maxbld-web.ts, scripts/surfaces/_schema/bindings.json, scripts/surfaces/_schema/census/mobile-product.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.content.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_semi_question.content.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.descriptor.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_semi_question.descriptor.json, mobile/__tests__/fixtures/parcelSearch.situations.json, mobile/__tests__/fixtures/surfaces/mobile_parcel_search.goldens.json, mobile/__tests__/fixtures/surfaces/mobile_parcel_semi_question.goldens.json, mobile/src/generated/surfaces/mobile_parcel_search.json, mobile/src/generated/surfaces/mobile_parcel_semi_question.json, src/tests/fixtures/surfaces/mobile_parcel_search, src/tests/fixtures/surfaces/mobile_parcel_semi_question, mobile/__tests__/parcelSearchScreen.behaviour.test.tsx, mobile/__tests__/parcelSearchMatch.test.ts, mobile/__tests__/parcelScreens.golden.test.ts, mobile/__tests__/surfaceRenderer.smoke.test.tsx, mobile/__tests__/semiQuestionPage.behaviour.test.tsx, src/tests/semi-question-design.logic.test.ts, src/tests/surfaces/search-parity.golden.test.ts, src/tests/surfaces/search-web-binding.ui.test.tsx, src/tests/maxbld-web-pages.logic.test.ts, docs/specs/03-mobile/100_mobile_parcel_cost_tool.md, docs/specs/00-architecture/117_maxbld_brand.md, docs/specs/03-mobile/99_mobile_state_architecture.md, docs/specs/02-web-admin/126_maxbld_surface_standard.md
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Nothing opens while typing; Enter or a tap on a suggestion opens a lot
- [ ] #2 Suggestions, the not-found line and the outside-Toronto line appear under the box below a thin grey line; no Select button
- [ ] #3 The box is empty on return from a report and the list clears on the first delete
- [ ] #4 The semi question reads: Is this a semi? and the answers are not larger than the question
- [ ] #5 Built to the mock the operator approved for this card
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
Planner: Cairn-Plan-465
Plan id: PLAN-465-v1
Head read: 320b47a02 (wf2/board); the plan grounder re-read it at 4c22af6e8 (only backlog files moved since). Fold plan: this card names no task numbers (phone walk 2026-11-25), so there are no fold section 2 lines. The sort's file:line cites were re-read at this head and hold: IDX:42, :98-109; PSM:176-196, :344-362; parcelSearchCore.ts:25-27; PL:416-436, :472-476; SB:71-91, :128-130, :165-225; PS:125, :138-148; LM:48; content :18-20; semi content :3.

## 1. Rule quoted first
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

## 2. What exists and is reused
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

## 3. Answers to (a)-(f)
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
  - fewer than min_query_len characters (not blank): the prompt line in the drop-down. Enter on a blank box does nothing and writes no state.
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

## 4. The change, file by file, in build order (the card's Files line is the complete list of these paths, set by the plan grounder's fold)
1. mobile/src/lib/parcelSearchMatch.ts. buildSearchSituation (:329-366) gains the argument `submitted: string|null`.
   - query = submitted ?? debounced.
   - New fields: rows {parcelId, address, route}[] (text_candidates capped; unique gives [match]; multi_parcel gives [candidates[0]] with the map route); open; hint ('several'|'refine'|null); showChips; showCount.
   - route is set only when submitted is not null and the fetch has settled (the hook keeps no previous data, so a payload always belongs to the active query). showMiss, showPrompt and the outside line (a new boolean, showOutside) are set only when submitted; an outside query is still refused before the network.
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
   - Hint, miss (keeps testID parcel-search-empty plus the new hint Text), outside line (keeps parcel-search-outside-toronto, now not an Alert), prompt and refine (same testIDs) all go inside the drop.
   - The help link goes in the drop after the rows (O9).
   - Rail, badge, radio cards and Select are removed from the phone tree. reportsLeft and chips are gated on showCount and showChips. legal() stays last. The rate-limit, entitlement and error notices stay where notices() puts them; the block-order case "notices, list, refine, miss, prompt" in parcelScreens.golden.test.ts is updated for the drop.
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
   - mobile_parcel_search.descriptor.json: states (:319-364) gain a twelfth state, `partial`, whose golden is `suggest` (O8: the state names are a closed list, surface.schema.json:1999-2055, and the golden name is free, as reports_left under hit). Dated notes in docs.purpose (:5), checks parcelsearch_empty_state and parcelsearch_toronto_only, and the deviation. Re-point the SearchBinding/IDX line cites in errors.evidence and checks by hand: no tool catches a stale cite (the evidence at :266 already cites parcel-tool/index.tsx:287 in a 135-line file).
   - mobile_parcel_semi_question.descriptor.json: purpose (:5) gets a dated note on the new question.
   - scripts/surfaces/_schema/census/mobile-product.json: rows mobile_parcel_semi_question (:7154) and mobile_parcel_search (:7578) are JSON-identical to their descriptor files today (checked in memory). Edit the census rows first, then run generate-surface-registry.mjs --emit-descriptors (:1596), which writes both descriptor files from the census and rewrites src/lib/surfaces/generated/surface-descriptor.d.ts and validate-descriptor.mjs (expected byte-unchanged; if either differs, stop and add it to the Files line). Never hand-edit a descriptor file: generate-surface-registry.mjs --check prints DESCRIPTOR DRIFT and surface-registry.infra.test.ts:277-281 fails.
10. OUTSIDE FILES LINE, fixtures and generated files:
   - mobile/__tests__/fixtures/parcelSearch.situations.json: every situation gains submitted, rows, hint, showChips, showCount and showOutside and loses selectedParcelId; a new suggest situation is added; static has showPrompt false (O14). The same file is read by the web goldens (surface-goldens.ts SITUATIONS), so step 12 changes the web situations the same way.
   - Then, in order (after the census edit and the --emit-descriptors run of step 9):
     1. search-golden-capture.ts --write, which writes src/tests/fixtures/surfaces/mobile_parcel_search/*.mobile.json (11 plus suggest).
     2. surface-goldens.ts, which writes *.web.json. The web tree mirrors the mobile tree (step 12), so every web golden changes in content, plus a new suggest.web.json.
     3. semi-question-golden-capture.ts --write, which writes the 8 semi *.mobile.json.
     4. emit-mobile-surfaces.mjs --write, which writes mobile/src/generated/surfaces/mobile_parcel_search.json and mobile_parcel_semi_question.json, and mobile/__tests__/fixtures/surfaces/mobile_parcel_search.goldens.json and mobile_parcel_semi_question.goldens.json.
     5. generate-surface-registry.mjs (the default run), which rewrites docs/reports/generated/127-surface-registry.md and 127-surface-review-queue.md: the text moves beyond the state count, so commit what it writes; its --check must print clean.
11. OUTSIDE FILES LINE, specs: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md (§4 note), docs/specs/00-architecture/117_maxbld_brand.md (§6.1 note), docs/specs/03-mobile/99_mobile_state_architecture.md (§3.4c note: the add(query) triggers are a row tap or Enter, not SELECT) and docs/specs/02-web-admin/126_maxbld_surface_standard.md (§11b dated note: the submit action, the non_display_keys gain and the web mirror).
12. OUTSIDE FILES LINE, the web target (O13 ruled, both targets). Why: Spec 135 FE-07 (operator Q-MFP a: mobile, web, admin and PDF render the same declaration; parity compares each target's real output), RR-0445 (mobile first, also on the web) and the committed lock src/tests/surfaces/search-parity.golden.test.ts, which requires per state the same refs, action names, ordered testIDs and situation on the web and mobile goldens (:5-8, :69-74) and pins the state list (11 states); open_help was added on both targets for the same reason (Spec 126:995). The web page is static (SearchPageClient.tsx sends no lookup and passes no actions), so this mirrors the tree and adds no behaviour.
   - src/components/surfaces/web/SearchBinding.tsx: pill becomes the box (bar plus drop); rows are Buttons with onClick push (no radio role, no Select, no list header or badge); hint, miss template, outside line (not an Alert), prompt and refine sit in the drop; chips and count are gated on showChips and showCount; WebActions and the handler allow-list (:333) gain submit, fired on Enter by the TextInput; WebSituation gains the new fields and loses selectedParcelId; segmentsOf and searchWebData read rows. A difference in refs, actions or testIDs between the targets, other than the ruled footer and legal-line difference, is a parity failure: fix the binding, never the lock.
   - src/lib/surfaces/maxbld-web.ts: WEB_STATIC_SITUATION and its two spreads carry the new fields (submitted null, rows [], hint null, showChips, showCount, showOutside false) and showPrompt false at rest (O14).
   - Tests, each rewritten with a dated note keeping its old title: search-parity.golden.test.ts (the state list gains suggest, 11 becomes 12), search-web-binding.ui.test.tsx (:77 list.badge, :90 the idle prompt, :95 static equality, :105 and :129 radio and Select) and maxbld-web-pages.logic.test.ts (:134).
- Unchanged: parcelSearchCore.ts, server code, static-page.json (question.title is still the key), WallBinding.tsx and the wall goldens.

## 5. Tests first (each written red, then green). Server cases are already locked by parcel-lookup tests; no server change.
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
- T13 "a chip tap submits": chip '41 Derwyn Rd' with a unique hit: one push, no Enter. T14 "a blank Enter does nothing": no state change, no push. T15 "a row label is the address, else the parcel id" (restates the c.address || c.parcelId fallback and getByLabelText('100114') of surfaceRenderer.smoke.test.tsx:101-115). T16 "Enter does not push while fetching; edit then retype pushes again" (restates :98). (AC1)
- Every old case that types without Enter and expects a result is rewritten with a dated note that keeps its prior title: :88 unique navigates once, :98 no push while fetching and retype, :112 a tap selects and SELECT pushes, :124 nothing pre-checked, :134 an intersection auto-push, :142 a miss and an error record nothing and Retry calls refetch with no argument (kept: the error notice and Retry are unchanged), :154 a chip sets the input (now it submits), :174 the refine line (task-450 AC1), :184 the prompt carries min_query_len (task-450 AC4, now after Enter) and :80 outside Toronto. :71 and :164 stand.

mobile/__tests__/parcelSearchMatch.test.ts (buildSearchSituation):
- route is null unless submitted is set and the fetch has settled; the truth table (:405-417) is restated with submitted and without selectedParcelId, keeping "a settled miss keeps its line on a re-fetch (task-450 V4)" and "error + data lists no candidates";
- a unique answer gives one row;
- the deletion rule;
- showMiss, showPrompt and showOutside only after submit, and a blank submit changes nothing;
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

## 6. Limits, and failure risks with how the build catches each
- Out of scope: no database step, no setting, no server, meter, compute, loading or report change, web binding unchanged.
- The mobile jest suite is not run by the commit hook (semi-question-design.logic.test.ts:9 says so). It must be run by hand or at the station, with the output kept.
- Line-cite drift is NOT caught by a tool: the descriptor evidence at :266 already cites parcel-tool/index.tsx:287 in a 135-line file, so cites are re-pointed by hand. A missing Files-line path is refused at the close (cards 454 and 456 hit it): the card's Files line is the complete list, resolved in memory against rule-lists.json with no unmatched path. It attaches the list step-132 (the descriptor files match scripts/**/*.descriptor.json), so the card's references gain compliance:step-132 docs/specs/01-pipeline/132_step_standard_handbook.md (backlog CLI --add-ref). Checked and unaffected: daylightSearchPages.golden.test.ts walks every fixture situation through the class-token rules (the new classes must pass), and the admin "No parcel found" copy (ParcelCostTool.tsx:210) is a separate string.
- The web is built here (step 12): its goldens change in content in every state, and the parity lock is the check. The old rule "stop if a web golden diff is not fingerprint-only" is withdrawn.
- O2 is ruled: no change. A ReportLimitError needs a produced page (route.ts:114-123), so it cannot come on the q path while MAXBLD_WEB_LIVE is false; with the switch on it can until task-267 lands, which is why 267 must land before LS.12.

## 7. Notes owed (backlog files only through the backlog CLI)
- Spec 100 §4 and Spec 117 §6.1: dated notes (M-246, prior text kept) quoting RR-0483, RR-0485 (1, 6) and RR-0487, covering a, b, c, e, f and h above; Spec 99 §3.4c (a row tap or Enter, not SELECT); Spec 126 §11b (the submit action, the non_display_keys gain and the web mirror; precedent open_help, :995).
- Descriptor dated notes and their census copies (section 4 step 9).
- Header notes in PSM and IDX.
- Card 465 (backlog CLI): the plan id; the Files line is the final list set by the grounder fold (every OUTSIDE path of section 4 is in it); the references gain compliance:step-132; the meter note; the departure from the drawn mock, stated once: no district line (P35-D15 b).
- Cards 267, 287 and 343 (backlog CLI): a note on the typing cost (O1). Card 267 also: its "search only finds the lot" (McFixV2 addition (c)) must land before LS.12; finding 4 is split: Enter is fixed here, and the no-report screen and the 21 s wait stay with 267 and 343.
- doc-2 D.3 wording (backlog doc CLI): open.

## 8. Open choices (my recommendation is marked "rec")
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
- O14 The at-rest prompt (it shows today with '' typed): show it only after Enter with a short query. RULED: yes (mock state 1 draws no prompt at rest); the static fixture and WEB_STATIC_SITUATION carry showPrompt false.
- O15 Commit trailers: search is MF-35 and semi is MF-93 (git log). Two commits, or one if the gate accepts one trailer. RULED: one McFrontend-Task trailer per commit (cite-arms.mjs:147-154 reads one trailer and its newest prereg), so commit by surface group (search MF-35, semi MF-93, web MF-44) unless a dry run shows one trailer passes; no bypass.
- O16 Chips: a 32 px look inside a 44 px Button (rec), or a 44 px pill. RULED: the 32 px look inside the 44 px Button (the 44 floor holds, bindings.json touch_targets.mobile).

## 9. UNVERIFIED
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
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-25: mock APPROVED by the operator (RR-0487, MORNING-DECISIONS.md:2543, verbatim "465 Mock  approved"). Approved mock: ~/Buildo-scratch/lanes-20261125/mcfixv2-465/MOCK-465-approved.html sha256 05b387fa3304 (published https://claude.ai/artifact/NDup2QHQMFKcfLSo9Howk1). Seven states: at rest; typing with suggestions; Enter with more than one match; Enter with no match (No lot found); outside Toronto; Enter with one match (finding the lot); semi question (Is this a semi?). The mock notes that sizes are close, not measured, and that the example street names and districts are illustrations.

2026-11-25: plan PLAN-465-v1 by Cairn-Plan-465 set on the card (planner hand-back saved at ~/Buildo-scratch/lanes-20261125/mcfixv2-465/PLAN.md). Files line owes every OUTSIDE FILES LINE path of the plan section 4; the plan grounder rules that.

2026-11-25 taken on the board at lane launch (lane BL-MCFIX465, worktree /Users/brettpreston_macmini/Buildo-wt-mcfix465, branch wf2/mcfix465), RR-0240

2026-11-25 (RR-0495, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2579, operator verbatim "correct" to the lane's option a): the type-more prompt line is dropped; Enter on a too-short entry shows the No lot found line. The plan grounder folds the exact plan text.
<!-- SECTION:NOTES:END -->
