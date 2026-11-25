---
id: TASK-465
title: >-
  McFixV2.1 Search box the Google way: Enter runs the search, suggestions and
  messages drop under the box, the box is the only focus; semi question reworded
status: LATER
assignee: []
created_date: '2026-11-25T17:05:00Z'
updated_date: '2026-11-25T17:58:00Z'
labels:
  - McFixV2
milestone: m-1
dependencies: []
references:
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

Files: mobile/app/(app)/parcel-tool/index.tsx, mobile/src/components/surfaces/SearchBinding.tsx, mobile/src/constants/parcelSearch.ts, mobile/src/lib/parcelSearchMatch.ts, mobile/src/constants/lotMap.ts, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.content.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_semi_question.content.json
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
Head read: 320b47a02 (wf2/board). Fold plan: this card names no task numbers (phone walk 2026-11-25), so there are no fold section 2 lines. The sort's file:line cites were re-read at this head and hold: IDX:42, :98-109; PSM:176-196, :344-362; parcelSearchCore.ts:25-27; PL:416-436, :472-476; SB:71-91, :128-130, :165-225; PS:125, :138-148; LM:48; content :18-20; semi content :3.

## 1. Rule quoted first
- RR-0483, MORNING-DECISIONS.md:2524: "your typed search does not execute until you press enter or select an address. And if you press enter with an incomplete address - you get the error".
- RR-0485, :2534: "1 inside" and "6. Open that lot - they need to press enter - after filling out the address in the search box." Items 4 and 5 belong to tasks 343 and 267, not this card.
- RR-0487, :2544: "465 Mock  approved". The mock "replaces the approved search page design where the two differ" (:2546).
- RR-0482, :2519: "larger tasks and using existing components as well." RR-0477, :2497: batch items that touch the same files and need no database step.
- RR-0442, :2280: "It should open on an exact match". RR-0443 c, :2284: "they need to select from the available addresses that are close".
- Finding 6: "The main focus for the user is the search bubble and nothing else should distract from it." Finding 18: "It should be "Is this a semi?"."
- Spec 136 fe.31 (136_mcfrontend_handbook.md:124): "Every build reuses existing components, bindings and patterns; a new library, component kind or binding is an operator ruling first".
- 44 px floor: 00_engineering_standards.md:14; bindings.json touch_targets.mobile (Button min-h-[44px] or [48px]); PS:125 says "NativeWind's rem is 14 here".
- Older rulings, and whether this card replaces each:
  a) The match-type ruling 2026-09-16, "unique -> navigate straight to the lot" (PSM:11). REPLACED in part: unique opens only on Enter or a tap (RR-0483, RR-0485 item 6). Owes a dated note in Spec 100 §4 and in the PSM header.
  b) Spec 117 §6.1 note 2026-11-10 (117_maxbld_brand.md:250, "the address list as radio cards ... an amber SELECT button") and Spec 100 note 2026-11-10 (:146, "a candidate tap selects a radio card and SELECT opens that lot"; D17 a). REPLACED on the phone (findings 12, 15; mock "No Select button"). Owes notes in Spec 117 §6.1 and Spec 100 §4. The web keeps them until O13 is ruled.
  c) RR-0442 and the Spec 100 note 2026-11-24 (:147): KEPT and narrowed to "an exact match, on Enter or a tap". A follow-on note goes in Spec 100 §4. RR-0443 c is KEPT.
  d) "We dont need a clear search" (:1093-1094, task-330): KEPT. No clear (x) is added; the list clears on delete and the box clears on return. Mentioned in the Spec 100 note.
  e) RR-0320 / decision-105 / task-389 (legal line at the bottom, words verbatim): KEPT. Only its size changes (card item 6), stated in the Spec 100 note. static-page T8 still pins footer.legal = search.legal.
  f) Semi mock approval (:1186-1200): the full-width heading is KEPT. The wording and sizes are REPLACED (RR-0485 "1 inside", findings 18-19, mock state 7). Owes a Spec 100 note replacing the question quoted at :105. RR-0321 (:1399 "3 a", Continue 48 px) is KEPT. The apostrophe question Q3 (:1200) stays open.
  g) P35-D16 a (chips are recent searches, saved when a search opens a page), RR-0313 (placeholder) and task-450 Q8.1 B (refine line for a street with no number): KEPT.
- Fact, not a ruling: RR-0486 (:2538) put "search box the Google way" into task-392 ("no new cards"). task-392 is now labelled dead; card 465 carries the work and RR-0487 approved its mock.

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
  - On the board today MAXBLD_WEB_LIVE is false (maxbld-web.ts:19): the compute answers null, so the meter reads not_produced. The cost shows only with the switch on (RR-0481 local, or after LS.12).
  - With the switch on, the one suggestion row waits 11-23 s for the compute, and a suggestion the user never taps could be counted once costs are evaluated.
  - No cheap guard fits inside this card's limits: the compute and the meter are not to be touched (tasks 267, 343). See O1.
- (b) What Enter does, by answer:
  - unique (including a held unsure lot): push /(app)/parcel-tool/<id>; the report screen redirects to the semi page as today.
  - text_candidates with 2 or more rows: rows plus the hint line, no push.
  - text_candidates from a street with no number (task-450): rows plus list.refine.
  - no_match: "No lot found" in the drop-down.
  - outside Toronto: refused before the network, shown in the drop-down (it shows while typing too).
  - multi_parcel, unlinked and intersection: push the disambiguate route only on Enter or a tap.
  - fewer than min_query_len characters: the prompt line in the drop-down.
  - text_candidates with one row: see O4.
- (c) The drop-down is built from the existing addressList row, notice and tail builders. There is no new component kind.
  - Candidates carry only {parcelId, address} (schemas.ts:364-367; server types.ts:188). There is no district or municipality field.
  - The row shows the address only; the district line is open (O3).
- (d) Clearing:
  - Pure rule: rows hide when the trimmed input no longer starts with the query the data belongs to (case-folded). The first delete hides the rows; typing forward keeps them until the next answer.
  - On return from a report, a focus effect empties the box and the submitted text and clears the ref.
  - The recent chips show at rest only (input empty). The search just opened is first in the chips, because it was recorded at navigation.
- (e) Quiet page. Arbitrary text-[Npx] classes are exact px; rem-based classes (text-base = 14 px, text-lg about 15.75 px) shrink by 14/16 on the phone.
  - Typed text: text-[16px]. Count line: text-[12px] leading-[16px]. Legal line: text-[11px] leading-[15px].
  - Chips: text-[13px] font-normal, inside a transparent 44 px Button with an inner 32 px View pill, so the 44 floor holds (O16).
  - Rows: min-h-[48px], text-[15px] (weight 500). Message lines: 15/20 and 13/18. Hint: 12/16.
  - Box: rounded-[26px] with overflow hidden (rounded-full would turn a tall box into a capsule).
  - Spinner: in a 44x44 centred View at the right edge.
  - Centring: the Input drops py-3 and gets h-[44px] (the vendored base adds h-10 and leading-5, input.tsx:6). This is checked on the device only (section 9).
- (f) Wording (content files):
  - search.miss becomes "No lot found" (the card's words).
  - New: search.miss.hint "Check the house number and street name."; search.outside_toronto.title "Outside Toronto" (the existing search.outside_toronto becomes its second line); list.hint "More than one address matches. Tap the one you mean."
  - question.title becomes "Is this a semi?".
  - The answer labels stay the real ones, "Yes, it’s one half of a semi", "No, it's detached" and "Not sure" (semi content :4-6). The mock's three labels are an illustration (O11).

## 4. The change, file by file, in build order
1. mobile/src/lib/parcelSearchMatch.ts. buildSearchSituation (:329-366) gains the argument `submitted: string|null`.
   - query = submitted ?? debounced.
   - New fields: rows {parcelId, address, route}[] (text_candidates capped; unique gives [match]; multi_parcel gives [candidates[0]] with the map route); open; hint ('several'|'refine'|null); showChips; showCount.
   - route is set only when submitted equals query and the fetch has settled. showMiss and showPrompt are set only when submitted.
   - candidates and overCap keep their meaning, because the web binding reads them.
   - Plus a dated note in the header (:11).
   - Option O5(b) would add a no-comma city check to isOutsideToronto (:101-116).
2. mobile/src/constants/parcelSearch.ts. Add the box, bar, drop, row, rowText, hint, msg, msgTitle, msgSub and spinnerSlot classes. Change input, allowance, chip, chipText and legal (:139-148). PARCEL_SEARCH_ICON gains row:18 and msg:18.
   - Keep card, cardChecked, select, rail, badge and listHeader: LotMap reads them (LM:9-44), and semi-question-design.logic.test.ts:113 pins select.
3. OUTSIDE FILES LINE: mobile/src/components/surfaces/SurfaceRenderer.tsx. ACTION_PROPS (:148) gains onSubmitEditing. The action switch (:111-145) and SurfaceActions (:36) gain `submit`. select becomes optional, as open_help is (:43). This is needed because the renderer drops unknown action props.
4. OUTSIDE FILES LINE: scripts/surfaces/_schema/bindings.json. non_display_keys (:95) gains onSubmitEditing, with a dated note in its $comment. SV-SBIND judges golden prop names.
5. mobile/src/components/surfaces/SearchBinding.tsx.
   - pill() becomes a box: bar row plus drop. Input gets onSubmitEditing {action:'submit'}. The spinner goes in the slot.
   - Each row is a Button (testID parcel-candidate-<id>, onPress {action:'push', route}, MapPin icon, the existing segment Texts).
   - Hint, miss (keeps testID parcel-search-empty plus the new hint Text), outside line (keeps parcel-search-outside-toronto, now not an Alert), prompt and refine (same testIDs) all go inside the drop.
   - The help link goes in the drop after the rows (O9).
   - Rail, badge, radio cards and Select are removed from the phone tree. reportsLeft and chips are gated on showCount and showChips. legal() stays last.
   - DERIVED_NAMES (:49) drops candidate_count (no longer used on the phone), with the descriptor deviation (:530) noted.
6. mobile/app/(app)/parcel-tool/index.tsx.
   - useState submitted. change_input clears it. The submit action sets it to the trimmed input.
   - The hook query becomes searchQueryArg(submitted ?? debounced), so Enter does not wait for the debounce.
   - selectedParcelId and its effect (:37, :44-47) go.
   - navigate() records the query. The useFocusEffect also clears input, submitted and navigatedForRef. The effect (:100-109) is kept as it is.
7. mobile/src/constants/lotMap.ts.
   - semiHeading (:48): text-[26px] leading-[32px] font-bold w-full text-report-ink.
   - semiCardText (:55): text-[15px] leading-[20px] font-normal text-report-muted.
   - semiCard and semiCardChecked: py-3 with min-h-[48px], replacing min-h-[44px].
   - The dots and Continue stay (RR-0321).
8. Content files: scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.content.json and mobile_parcel_semi_question.content.json, as in 3(f).
9. OUTSIDE FILES LINE, descriptors:
   - mobile_parcel_search.descriptor.json: states (:319-364) gain `suggest` (O8). Dated notes in docs.purpose (:5), checks parcelsearch_empty_state and parcelsearch_toronto_only, and the deviation. Re-point the SearchBinding/IDX line cites in errors.evidence and checks.
   - mobile_parcel_semi_question.descriptor.json: purpose (:5) gets a dated note on the new question.
   - census/mobile-product.json: the same text by hand (a hand-kept mirror, task-454 GROUNDER-PLAN.md:51); entries at :7123 and :7578ff.
10. OUTSIDE FILES LINE, fixtures and generated files:
   - mobile/__tests__/fixtures/parcelSearch.situations.json: every situation gains submitted, rows, hint, showChips and showCount; a new `suggest` situation is added.
   - Then, in order:
     1. search-golden-capture.ts --write, which writes src/tests/fixtures/surfaces/mobile_parcel_search/*.mobile.json (11 plus suggest).
     2. surface-goldens.ts, which writes *.web.json. Expected to be fingerprint-only, plus a new suggest.web.json.
     3. semi-question-golden-capture.ts --write, which writes the 8 semi *.mobile.json.
     4. emit-mobile-surfaces.mjs --write, which writes mobile/src/generated/surfaces/mobile_parcel_search.json and mobile_parcel_semi_question.json, and mobile/__tests__/fixtures/surfaces/mobile_parcel_search.goldens.json and mobile_parcel_semi_question.goldens.json.
     5. generate-surface-registry.mjs, which writes docs/reports/generated/127-surface-registry.md (the state count) and 127-surface-review-queue.md if it moves.
11. OUTSIDE FILES LINE, specs: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md (§4 note) and docs/specs/00-architecture/117_maxbld_brand.md (§6.1 note).
- Unchanged: web SearchBinding.tsx, parcelSearchCore.ts, server code, static-page.json (question.title is still the key).

## 5. Tests first (each written red, then green). Server cases are already locked by parcel-lookup tests; no server change.
mobile/__tests__/parcelSearchScreen.behaviour.test.tsx (mocked hook, fake timers):
- T1 "typing an exact address never navigates": hit 5293897 on '41 Derwyn Rd' after 400 ms. Expect no push, row parcel-candidate-5293897, recent []. (AC1)
- T2 "Enter on a unique opens the lot once and records it": submitEditing. Expect a push to /(app)/parcel-tool/5293897, recent ['41 Derwyn Rd'], no second push on rerender. (AC1)
- T3 "Enter before the debounce queries the typed text at once": '679 Queen St W', submit at 100 ms. Expect the hook called with that text before 400 ms; with hit 5476455, a push. (AC1)
- T4 "a tap on a row opens that lot; no Select": '383 El' rows 5106944, 5461541, 5191692. Press 5191692: push /(app)/parcel-tool/5191692. queryByTestId('parcel-search-select') is null. (AC1, AC2)
- T5 "Enter on several matches keeps the rows and shows the hint": '12 Elm' (10 rows) plus submit. Expect parcel-search-hint and no push. (AC2)
- T6 "a miss shows only after Enter": '108' no_match while typing gives no parcel-search-empty; after submit its text is 'No lot found'. (AC2, finding 32)
- T7 "outside Toronto inside the box": '123 Main St, Mississauga'. The hook gets '', the line shows, no push. (AC2)
- T8 "the first delete clears the list": rows for '67 Northbridge Cres', then changeText '67 Northbridge Cre' before the debounce. Expect no parcel-candidate-*. (AC3)
- T9 "the box is empty on return": after a push, fire the captured focus callback. Expect input value '' and chip '41 Derwyn Rd'. (AC3)
- T10 "map kinds open only on Enter or a tap": '78 Robert St' multi_parcel (5259138, 5438421) and 'King and Bay' intersection. No push while typing; submit pushes the disambiguate route with kind. (AC1)
- T11 "a held unsure lot opens its lot route on Enter": '14 Norwood Ter', 5334051. (AC1)
- T12 "a street with no number: Enter gives rows plus refine, no push": 'Gerrard St'. (AC2)
- The old cases at :88-133 (unique auto-push, SELECT, pre-checked) are rewritten with a dated note. Their prior titles are kept in the note.

mobile/__tests__/parcelSearchMatch.test.ts (buildSearchSituation):
- route is null unless submitted === query and the fetch has settled;
- a unique answer gives one row;
- the deletion rule;
- showMiss and showPrompt only after submit;
- the hint kinds;
- if O5(b): '100 City Centre Dr Mississauga' is true; '26 Markham St', '1000 Markham Rd' and '5 King St, Scarborough' are false.

mobile/__tests__/parcelScreens.golden.test.ts:
- no golden has role radio or parcel-search-select;
- the outside line is not an Alert;
- legal is still last;
- the unused-by-mobile key list (:121) grows by the four list.* keys (dated note);
- 12 goldens.

mobile/__tests__/surfaceRenderer.smoke.test.tsx: onSubmitEditing calls submit, and an unknown action still throws.

Semi page:
- semiQuestionPage.behaviour.test.tsx:68 and :280 expect 'Is this a semi?'. (AC4)
- src/tests/semi-question-design.logic.test.ts:35, :54: the heading is text-[26px] leading-[32px] font-bold and the answers text-[15px]; a new case proves the heading px is larger than the answer px. (AC4)
- AC5 is covered by the class assertions against the mock table plus the device walk.

## 6. Limits, and failure risks with how the build catches each
- Out of scope: no database step, no setting, no server, meter, compute, loading or report change, web binding unchanged.
- The mobile jest suite is not run by the commit hook (semi-question-design.logic.test.ts:9 says so). It must be run by hand or at the station, with the output kept.
- Line-cite drift in the descriptor evidence is caught by check-cites. Missing Files-line paths (as cards 454 and 456 hit) are caught by the close check. The list in section 4 is meant to be complete.
- A situation shape the web binding cannot read shows up as a web golden content diff. The rule is to stop if any web golden diff is not fingerprint-only, except the new suggest.web.json.
- The limit wall can show while typing: a ReportLimitError on a q lookup goes to useWallState (IDX:66). See O2.

## 7. Notes owed (backlog files only through the backlog CLI)
- Spec 100 §4 and Spec 117 §6.1: dated notes (M-246, prior text kept) quoting RR-0483, RR-0485 (1, 6) and RR-0487, covering a, b, c, e and f above.
- Descriptor dated notes and their census copies (section 4 step 9).
- Header notes in PSM and IDX.
- Card 465 (backlog CLI): the plan id; the Files line gains every OUTSIDE path in section 4; the meter note.
- Cards 267, 287 and 343 (backlog CLI): a note on the typing cost (O1).
- doc-2 D.3 wording (backlog doc CLI): open.

## 8. Open choices (my recommendation is marked "rec")
- O1 Cost and meter while typing. (a) Accept it for now (switch off) and make 267's "search only finds the lot" (task-267:120) land before LS.12. (b) A server flag that skips the page and the meter on the q path: this needs a field and touches 267/343 (RR-0392). Rec (a), plus the card notes.
- O2 The limit wall while typing. Show it only for a submitted query (phone-only), or keep today's behaviour. Rec: submitted only.
- O3 District line. None exists. Either a server and contract field (its own card), or no second line. Rec: none (the mock foot says the districts are examples).
- O4 Enter on a single-row text_candidates (a partial address). Either the row plus the hint, or "No lot found" plus the row (RR-0483 "you get the error"; RR-0443 c). Rec: the miss line plus the row.
- O5 Outside Toronto with no comma. (a) Keep the stated limit (PSM:63-68): it reaches the server and shows "No lot found". (b) Refuse when the last words are a NON_TORONTO name after a street-type word. Rec (b), with the Markham tests.
- O6 Map kinds while typing. One row (multi_parcel's printed address) and nothing for intersection, or nothing for any. Rec: one row.
- O7 Hide the count and chips while the drop-down is open (mock states 2-6). Rec: yes, as drawn.
- O8 New states: add `suggest` only, or also `outside`. Rec: suggest only (outside_toronto is already a named case).
- O9 "Report incorrect address match" (ruled P35-D18 a; not drawn in the mock). Keep it inside the drop under the rows, or drop it. Rec: keep.
- O10 The miss text: "No lot found" or the mock's "No lot found for {query}" (a new phone-only key; the web has no vars). Rec: "No lot found" plus the hint.
- O11 Semi answers: keep the real labels, or new labels (needs his words). Rec: keep. Continue stays (RR-0321).
- O12 Highlight: the ruled differing-part highlight, or the mock's bold typed part. Rec: keep the ruled one, at 15 px.
- O13 Web: phone now and the web on its own card (live switch off, task-287), or both now (RR-0445). Rec: phone now.
- O14 The at-rest prompt (it shows today with '' typed): show it only after Enter with a short query. Rec: yes.
- O15 Commit trailers: search is MF-35 and semi is MF-93 (git log). Two commits, or one if the gate accepts one trailer. Rec: ask the gate (section 9).
- O16 Chips: a 32 px look inside a 44 px Button (rec), or a 44 px pill.

## 9. UNVERIFIED
- On-device sizes, the centring of the typed text and the spinner position: needs the phone walk.
- iOS firing onSubmitEditing with returnKeyType 'search'.
- Which test enforces the search census mirror is byte-equal.
- Whether cite-arms accepts one McFrontend-Task trailer for both surfaces.
- The exact one-line caller for surface-goldens.ts.
- How the Button ghost variant classes fare under the layout rules.
- The meter's already_counted scope.
- No tests or generators were run (read-only).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-25: mock APPROVED by the operator (RR-0487, MORNING-DECISIONS.md:2543, verbatim "465 Mock  approved"). Approved mock: ~/Buildo-scratch/lanes-20261125/mcfixv2-465/MOCK-465-approved.html sha256 05b387fa3304 (published https://claude.ai/artifact/NDup2QHQMFKcfLSo9Howk1). Seven states: at rest; typing with suggestions; Enter with more than one match; Enter with no match (No lot found); outside Toronto; Enter with one match (finding the lot); semi question (Is this a semi?). The mock notes that sizes are close, not measured, and that the example street names and districts are illustrations.
<!-- SECTION:NOTES:END -->
