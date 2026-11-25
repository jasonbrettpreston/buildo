# Seat: regression: task-465 plan (PLAN-465-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board head 4c22af6e8 (wf2/board; the plan says it read 320b47a02). Read: the whole task-465 file and PLAN.md in ~/Buildo-scratch/lanes-20261125/mcfixv2-465/ (identical text); FINDINGS-PLAN.md (lenses error-paths, deepseek and ux, not repeated); MD 1088-1096, 1186-1202, 1398-1423, 2494-2550; the approved mock MOCK-465-approved.html in full; parcel-tool/index.tsx, SearchBinding.tsx, parcelSearchMatch.ts, constants/parcelSearch.ts and lotMap.ts; web SearchBinding.tsx header; Spec 100 §4 notes, Spec 99 §3.4c, Spec 126:74; the tests parcelSearchScreen.behaviour, parcelScreens.golden, parcelSearchMatch, surfaceRenderer.smoke, semi-question-design.logic, daylightSearchPages. Ran nothing. Branch scan was by name pattern only (wf1/wf2 and lane names) on the 8 shared source paths and found no relevant unlanded change. A scan of every branch and worktree was not done.

## Checked and clean
- Quotes of RR-0483, RR-0485 (1 and 6), RR-0487, RR-0482 and RR-0477 match MD:2523-2546 and MD:2496.
- 1(a) is truly replaced by the operator's own words. RR-0485 item 6 reads "they need to press enter" and RR-0483 reads "does not execute until you press enter". PSM:11 does say "unique -> navigate straight to the lot".
- 1(d), the task-330 "We dont need a clear search" (MD:1088-1094): no clear control is added, so the ruling holds.
- 1(e), the task-389 legal line at the bottom and its words: kept, and legal stays last. The only change is size (but see rg7).
- P35-D17 a "nothing pre-checked": with no selected-lot state it holds trivially.
- RR-0442 and RR-0443 c: kept; the server is unchanged.
- The mock's table rows match the plan on "Enter runs the search", "list clears on first delete", "empty box on return", and hiding the count and chips while the drop is open (O7, states 2-5 draw neither).
- No Maestro flow (mobile/maestro) and no e2e file mentions search, semi, candidate or Select.
- `parcelScreens.golden.test.ts:121`: the mobile-unused key list stays exactly the four footer keys plus the four list.* keys, because the web goldens still use list.rail, badge, select and select.label.
- Recent-search recording: nothing in the plan changes the "recorded only when a search opens a page" rule. (Spec 99 §3.4c wording is in rg6.)

## rg#1 MED: a recent-search chip tap loses its one-tap open and the plan says nothing
Plan: 1(g) "chips ... P35-D16 a ... KEPT"; §4 step 5 and §3(d) chips "at rest only (input empty)"; the chip action stays `set_input`.
Evidence: the behaviour test at :154 ("a chip sets the input (the debounce still applies)") passes today only because the unique answer then auto-opens the lot. Under the plan the chip fills the box, the chip row disappears (input non-empty), and nothing opens until Enter. A chip is a saved address and is arguably "select an address" (RR-0483), but the plan does not rule on it. `set_input` must also clear `submitted`, which is not stated.
Fix: add one line to §3(b) saying a chip tap sets the input and submits (opens the lot when it is unique), plus a T-case. Otherwise record that it needs Enter and put it to the operator.

## rg#2 MED: the plan rewrites more tests than it lists, and drops four load-bearing assertions
Plan: §5 "The old cases at :88-133 ... are rewritten"; golden test list; smoke test "onSubmitEditing calls submit".
Evidence:
- parcelSearchScreen.behaviour.test.tsx also has cases that type without Enter and assert a result: :134 intersection auto-push and records, :142 miss shows `parcel-search-empty` and Retry calls `refetch()` with no argument (error-path lock), :174 the refine line (task-450 AC1), :184 the prompt for '12' (task-450 AC4, L5). All break and none is named.
- surfaceRenderer.smoke.test.tsx:101-115 expects 10 radios, a checked card, `getByLabelText('100114')` (the label fallback `c.address || c.parcelId`, SearchBinding.tsx:165 area) and "10 candidates". The plan lists only a new submit case here. The parcel-id fallback is a real lock that goes unrestated for the new row.
- parcelScreens.golden.test.ts: the planted-red proofs (checked card without border, "SELECT is enabled with nothing checked", sub-44 chip) and the block-order case "notices, list, refine, miss, prompt" are not mentioned. The 44 px floor on the new rows and chips loses its planted-red case.
- parcelSearchMatch.test.ts:405-417: `toEqual(S.*)` truth-table rows pass `selectedParcelId` and expect `showMiss` true while `isFetching` (the task-450 V4 "no flicker" lock). A new `submitted` argument changes every row.
- Lost behaviours, not restated by any T-case: "no push while fetching" (:98) and "edit then retype pushes again".
Fix: list each of these as rewritten with its old title kept in a dated note. Add T-cases for the address-else-parcel-id label on a row, the planted-red 44 px check on rows and chips, and "Enter does not push while fetching".

## rg#3 MED: O5(b) inverts a pinned test and a stated limit with no operator word
Plan: §8 O5 "Rec (b)"; §5 "if O5(b): '100 City Centre Dr Mississauga' is true".
Evidence: parcelSearchMatch.test.ts:247 is titled "STATED LIMITATION" and asserts `isOutsideToronto('123 Main St Mississauga')` is false. Its note says "Widening this ... would refuse '26 Markham St', a real Toronto address ... Documented in parcelSearchMatch.ts and in the S-002 descriptor". PSM:63-68 and the descriptor carry the same text, from the ruling of 2026-09-16 (b). The card only says "to be decided in the plan". The plan lists new true/false cases but never names this inversion or the descriptor text.
Fix: either keep (a), or put O5 to the operator before lock. If (b), name the :247 inversion, the PSM:63-68 note and the descriptor note as edited in the owed notes list.

## rg#4 MED: task-392 is marked dead and its approved table-row conversion is left unaddressed
Plan: §1 "task-392 is now labelled dead; card 465 carries the work"; §4 builds more hand code in SearchBinding.tsx.
Evidence: task-392 (labels: dead) was the phone search page drawn from table rows. The operator approved converting it (MD:1421-1422: "approved ... Convert the other three pages only after the pilot passes"), and Spec 126:74 says "Screens are declared as data ... no page code". RR-0488 says an absorbed card is completed in the larger card. 465's plan does not do the table conversion and does not say where it went. The plan's 1(g) and "Fact" lines record only the "search box the Google way" part of RR-0486.
Fix: add a section 1 line stating that the table-row conversion of the phone search page is not done here and where it is carried (a named card, after the pilot). Otherwise put it to the operator, because the new box, drop and rows will have to be re-converted.

## rg#5 MED: three defaults depart from the approved mock, and the "illustration" reading is only partly supported
Plan: §3(f), §8 O3, O10, O11, O12; AC5 "Built to the mock the operator approved".
Evidence: the mock's own foot (line 259) says only "street names in state 2 and the districts in state 3 are examples". It does not say the semi labels are illustrations. The plan's §3(f) claims "the mock's three labels are an illustration" on its own authority. The mock draws, and the plan drops or changes:
- a district second line under each row (`.rowi .a span`, O3: none);
- "No lot found for {query}" (O10: "No lot found" only);
- a bold typed part in rows (O12: keeps the ruled differing-part highlight);
- semi answers "Yes / No / Not sure" with no dots and no Continue button, where the plan keeps the long labels, the dots and Continue (RR-0321).
The mock intro says "words, sizes and order are all open", yet the operator approved it as drawn.
Fix: for each of O3, O10, O11 and O12, state in the card why the build departs from the approved mock and get a one-line operator OK. Or default to the mock. Say outright that the semi Continue and dots are kept over the mock (RR-0321) so AC5 does not read as a miss.

## rg#6 LOW: the rule text for "SELECT on the address list" is not in the owed-notes list
Plan: §7 notes owed: Spec 100 §4 and Spec 117 §6.1 only.
Evidence: docs/specs/03-mobile/99_mobile_state_architecture.md §3.4c lists the `add(query)` triggers as "the lot report, SELECT on the address list, the map page". The behaviour test header cites 99 §3.4c and 98:79. A copy of the Spec 100 text sits in .claude/review-templates/packs/mobile-100-p2.md (UNVERIFIED whether a check reads it).
Fix: add a dated note in Spec 99 §3.4c ("a row tap or Enter", not SELECT). Check whether the review pack is regenerated.

## rg#7 LOW: legal line and counts go quiet; the mock's soft colour is not a repo token
Plan: §3(e) "Legal line: text-[11px] leading-[15px]"; no colour named.
Evidence: the mock's `.legal` uses `--soft` #8a8172 on #f4f1eb. I computed 3.41:1 with node. The repo's `report-soft` (tailwind.config.js:42, "small grey captions (ruling 2)") is #655f55, 5.61:1, the same value as the mock's `--t3`. The legal line carries the disclaimer ruled in MD:1401 (C3 b, small-pages-v8, 13/18 muted today at parcelSearch.ts `legal`).
Fix: name the token in §3(e) as report-muted or report-soft, never the mock's #8a8172, and keep the legal line at the same contrast as today.

## rg#8 LOW: the Enter-required rule is extended to map kinds, but 1(a) does not say so
Plan: §3(b), T10 "map kinds open only on Enter or a tap"; 1(a) records only "unique".
Evidence: RR-0485 item 6 covers "an address that matches one lot". The 2026-11-11 MF-53 note (Spec 100 §3.2) ruled multi_parcel, unlinked and intersection open `disambiguate`, and PSM:11-17 lists them as automatic. Extending Enter-required to them is a reasonable reading of RR-0483's general rule, but it is the planner's reading.
Fix: name the map kinds in 1(a) and in the Spec 100 §4 note owed.

## rg#9 LOW: shared situation shape and derived names, stated loosely
Plan: §4 step 1 "candidates and overCap keep their meaning"; step 5 "DERIVED_NAMES (:49) drops candidate_count ... with the descriptor deviation (:530) noted"; step 6 "selectedParcelId ... go".
Evidence: web/SearchBinding.tsx:37-50 types `selectedParcelId` and `route`, and :202, :206 and :281 read `selectedParcelId` and `candidate_count`. The descriptor deviation at :530 declares the surface's derived names for both targets. The truth table in parcelSearchMatch.test.ts passes `selectedParcelId`.
Fix: say that only the phone `DERIVED_NAMES` and the screen's state lose them. The situation type and field (null) and the descriptor's declared name stay for the web. Otherwise SV-SBIND or the web golden breaks.

## rg#10 LOW: the non-"outside" notices are not placed
Plan: §4 step 5 moves the outside, miss, hint, prompt and refine lines into the drop. It is silent on the rate-limit, entitlement and error-with-Retry notices (`notices()` today, with testIDs parcel-search-ratelimit, -entitlement, -error, -retry).
Evidence: the behaviour and golden tests pin these, and the "one message for retry-after 0" lock (task-450 L3) uses their order.
Fix: add one line that they stay as Alerts in their present position (or move them), plus the matching golden order update. The failed-fetch state itself is already raised in plan-error-paths#1.

Other open work (UNVERIFIED): task-267 (WAITS, lane BL-LOAD2) takes "the search only finds the lot" and touches the push hand-off. Its work may land in parcel-tool/index.tsx beside the 465 `submitted` and focus-clear edits. Task-317 and task-268 were not read.

STATUS: 10 findings (0 CRITICAL, 0 HIGH, 5 MED, 5 LOW); the older rulings are replaced by the operator's own words except the map-kind extension and the O5(b) reversal, and the real losses are unlisted test rewrites, chip behaviour and the dead task-392 conversion.
