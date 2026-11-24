# Review context for task-449 (no plan id) written 2026-11-24 by backlog-brief.mjs (round 1)

## Task
task-449 SEARCHFIX.1 Search opens a lot only on an exact match: a partial address or a one-row leftover gives a list; a full correct address opens; unit and period forms no longer dead-end
status: LATER · milestone: m-1 · assignee: none · labels: SEARCHFIX-PRIORITY

## Description
Card opened 2026-11-24 by the orchestrator, Spec 137 rule 2, on the operator's rulings: RR-0444 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290, fold the findings), RR-0447 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2308, add the new tasks with the search-fix labels, dependencies and order) and RR-0448 (the 8 merged cards). Source: the fold plan docs/reports/reviews/mcfixreborn-fold/FOLD-PLAN.md, task 1 (FIX.SEARCH-EXACT) with amendment A1; every finding was ruled by a separate grounder (RR-0387, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1943; records under docs/reports/reviews/mcfixreborn-g1 to -g4). The plan's section 2 lines are this card's acceptance tests, each red first. Nothing is added that the plan or a ruling does not name (RR-0392, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975).

What changes, in plain words: the address search opens a lot only when the typed address matches exactly (RR-0442, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2276; RR-0443, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2283). A partial address ("2760 Yon") or a search that happens to leave one row gives a list to pick from. A full correct address whose number is shared by another street type ("32 Fulham Dr") opens. "Unit 4, 123 Yonge St", "2760-4 Yonge St" and "St." no longer end in no match. The wildcard characters % and _ typed by a customer are escaped.

Findings folded: ST1, 2a (server side), G2 D1, G2 D6, G3 R1; typed-address seat differences 1 to 6 (docs/reports/reviews/mcfixreborn-g3/SEAT-typed-addresses.md), whose 29 typed-address cases with real addresses are this card's tests.

Must not: add a new resolution value, or touch the report meter in the lookup route.

Dated notes owed: Spec 100 (:103, :144); objectives G.1 and A.3 of doc-2 through the backlog CLI; task-69.

Files: src/lib/admin/parcel-lookup.ts, src/tests/search-parser-guard.logic.test.ts, src/tests/consumer-parcel-lookup.infra.test.ts, scripts/surfaces/parcel_product/F02/contracts/contract_parcels_lookup.descriptor.json, scripts/surfaces/_schema/census/contracts.json, docs/specs/03-mobile/100_mobile_parcel_cost_tool.md

## Acceptance criteria
- #1 A typeahead that leaves exactly one row returns a list (text_candidates), never unique; only the exact path returns unique
- #2 "Gerrard St W" with a full 10-row window returns a list, not the one W row
- #3 A full correct address with its street type opens the lot when the number is shared by another street type
- #4 Unit-first, dash-unit, letter-suffix and period forms reach the lot or the close-address list, never a dead end
- #5 A typed % or _ is escaped and returns no unrelated lots
- #6 The 29 typed-address cases of the seat record pass as tests

## Implementation Plan
Planner: Cairn-Plan-449
Plan id: PLAN-449-v1

#### 1. Rule quoted first
- RR-0442, MD:2276 (operator): "It should open on an exact match and we have a different process for address mistakes". Ruled at MD:2277: "the search opens a lot on an exact match."
- RR-0443 c, MD:2284: "What happens with a partial address? Similar to an address mistake they need to select from the available addresses that are close".
- RR-0444 (2a), MD:2291: "The search gap is resolved (a lot opens on an exact match only; RR-0442, RR-0443 c)."
- RR-0392, MD:1975: "I don't think we need any other infastrcuture beyond this". So no new mechanism.
- RR-0166 "ONE-12 a" (MD:738), which already governs this code: a trailing unit is dropped and the address still opens (parcel-lookup.ts:165-171). Direction is a guard after the match (:188-210).
- .cursor/MCBYLAWS-QUEUE.md:107: "Changing a test assertion ... is a ruling". The two assertions flipped below rest on RR-0442 and RR-0443 c.
- docs/specs/00_engineering_standards.md:465: "A behavior-changing ruling updates ALL cited specs + runbooks in the SAME commit".
- Fold plan, FOLD-PLAN.md:31-39 (task 1) and :222-225 (A1). The seat record SEAT-typed-addresses.md:57-61 and :66-95. Grounders: G3 GROUNDER-SEATS.md:20-31 (A, i.e. ST1); G2 GROUNDER-B.md:59-63 (D1) and :80-81 (D6); STATUS.md:133 (R1 = G3 D:D1, D:D3, D:D5, C:D4, A:D2, F:D9, B:D9, B:D10).

#### 2. What exists and is reused
- The truncation rule of the exact path, parcel-lookup.ts:260-261 (`exactTruncated ? null : typed`). It is copied to the typeahead guard.
- conflictList, :235-237, builds a text_candidates list from rows. It is reused for the one-row typeahead, so no new shape is needed.
- guardByDirection, :203-210, is the pattern for the street-type narrowing: it narrows the returned rows only, never empties a set, and needs no new query.
- parseLinearName(...).street_type (address.ts:41-67) already returns the street type. It is used for both the typed text and the printed row address. address.ts itself is NOT edited (it is the parity mirror).
- UNIT_TAIL / stripTrailingUnit, :171-177: the leading-unit pattern copies its closed forms.
- The exact statement, :253-259, is reused for the letter and dash fallback. No new SQL is added.
- The :318 wildcard skip on the unlinked read is kept as is.
- Precedents for text locks: spec-notes-1b.logic.test.ts:48-70 (the noteIn pattern, and the census row equals its descriptor). The existing hasNonNullAssertion / importsResolver locks are at consumer-parcel-lookup.infra.test.ts:31-42.
- Generator: scripts/violations/generate-surface-registry.mjs. `--emit-descriptors` writes the descriptor files from the census (:1593-1601), the plain run writes 127-surface-registry.md (:1629), and `--check` checks both ways (:1604-1627). The census is the hand-kept source. The descriptor is emitted from it, not the other way round as FOLD-PLAN.md:36 reads.

#### 3. The change, file by file, in build order (lines read at head 5a26374b9)
A. Tests first (section 5). Run them and prove them red.

B. src/lib/admin/parcel-lookup.ts
1. Clean the typed text before the parse (A1, seat items 4-5).
   - Old: `q.split(',')[0]` at :226 and :183 cuts "Unit 4, 123 Yonge St" down to "Unit 4", which is a miss. "St." leaves "." in the key ("QUEEN ."), which is a miss.
   - New: add one small `typedText(q)` beside UNIT_TAIL. It turns every `.` into a space and strips one leading closed-form unit: `/^\s*(?:UNIT\s*#?|APT|APARTMENT|SUITE|STE|#)\s*\d{1,5}[A-Z]?\s*,?\s*(?=\d)/i`, anchored, with no nested quantifiers.
   - parseFreeTextAddress (:225) and typedDirection (:193) call it first. Their return shapes do not change, so the tests at :62-78 still hold.
2. Street-type narrowing on the exact path (A1, AC #3).
   - Old: at :264-279, two or more exact rows always give a list, so "32 Fulham Dr" lists Fulham St and Fulham Dr.
   - New: after the direction guard (:261-263), and only when the window is not truncated, there are 2 or more rows, and a typed street type exists, keep the rows whose printed type equals it. This runs only when it leaves a non-empty set. One row left means `unique`, matchType exact.
   - The typed type comes from parseLinearName on the street part. Export `typedStreetType(q)` beside typedDirection. The row type comes from parseLinearName of the printed address minus its number.
3. Gerrard (ST1, AC #2).
   - :301 becomes `guardByDirection(typeahead, typeahead.length >= 10 ? null : typed)`.
   - Reword the :313 comment so it says street-only windows are covered.
4. Only the exact path opens (2a, AC #1).
   - :304-311 becomes `if (typeahead.length === 1) return conflictList(typeahead);`, with a why-comment citing RR-0442.
   - The matchType 'typeahead' is no longer emitted. The enum in types.ts:123 is left alone (additive_only contract).
5. Escape LIKE wildcards (D1, AC #5).
   - Add `likePrefix(s) = s.replace(/[\\%_]/g, '\\$&') + '%'` and use it at :299 and :330. Postgres's default LIKE escape is backslash, so the SQL text does not change.
   - Reword :316-317 ("a follow-up card" becomes done).
6. Letter and dash fallback (A1, AC #4).
   - Just before the final `no_match` (:366), add: when num matches `^\d+[A-Z]$` (2760A) or `^\d+-\d+[A-Z]?$` (2760-4), run the exact statement for each bare number (at most 2 reads), merge the rows, and return them as `text_candidates`. It never returns `unique`.
   - It runs only after a full miss, so every hit is unchanged, and so is an unlinked "76R Abbott Ave".
7. D6: write a why-comment on or directly above every `!` that remains: :176, :183, :185, :226, :228, :229, :266 (x2), :333 (the :306 pair is deleted in step 4). New code adds no `!`. The pin at non-null-assertion-comment.logic.test.ts:67 (11) is not edited.

C. scripts/surfaces/_schema/census/contracts.json (row at :22050). This is R1, edited as text only.
- data_story: add a dated note: "exact match opens; a typeahead, a street type or direction conflict, a unit, letter or dash form, and a mistype list".
- Drop "24 fields" and point at inputs.field_whitelist (80).
- Make the table counts agree with inputs.tables (7). Fix :81 "6 table(s)", data_story "9 tables" and the parity why "4 field(s)" against 80.
- states.ambiguous / miss: refresh the parcel-lookup.ts cites (:180-186 and :163 are stale) to the new lines.
- metering.why: use the page-produced rule wording that data_story already holds. Refresh the cites to route.ts:102-114 and entitlements/index.ts:590-609.
- emits / outputs: use the property_view write through openReport, drop the dev-only user_profiles write, and say "writes 1".
- Must NOT add a key or change resolution_vocabulary (:658).

D. scripts/surfaces/parcel_product/F02/contracts/contract_parcels_lookup.descriptor.json: emitted with `node scripts/violations/generate-surface-registry.mjs --emit-descriptors`, never edited by hand.

E. OUTSIDE FILES LINE: docs/reports/generated/127-surface-registry.md. It carries this row's text (2 hits for "24 fields" / "reads 9 tables"). Regenerate it with the plain run, then `--check` must be clean. If emitTypes output moves, that is outside too. The lane shows the diff.

F. OUTSIDE FILES LINE: src/tests/parcel-lookup-resolution.logic.test.ts:64-69 pins "typeahead, 1 row -> unique". The suite stays red unless this flips: it now expects text_candidates, match null and candidates [P9].

G. docs/specs/03-mobile/100_mobile_parcel_cost_tool.md: add one dated note after :107 (the §3.2 note block that starts at :103) and one after :144 (the MF-35 note: "`unique` opens the lot"). Both are M-246 style, prior text kept, quoting the RR-0442 and RR-0443 c words verbatim, and naming what lists now.

H. OUTSIDE FILES LINE, open choice 6: docs/specs/02-web-admin/89_parcel_cost_model_tool.md:34. The admin tool calls the same resolver, so Standard :465 asks for a note there.

#### 4. Tests first (red unless marked "green both")
In src/tests/search-parser-guard.logic.test.ts (the statement-text mock at :20-26), add a describe "SEARCHFIX.1 exact opens, the rest lists":
- T1 (ST1, AC #2): typeahead = 1 Gerrard St W 5440777, 1000 Gerrard St E 10640216, 1001 Gerrard St E 5402856, plus 7 more E rows (the seat did not record their ids; UNVERIFIED). Input "Gerrard St W". Expected: text_candidates, 10 candidates.
- T2 (2a, AC #1): replace :194-199. Rows E1/W1, input "100 Queen St W". Expected: text_candidates, [W1], match null.
- T3 (D1, AC #5): "100 %" binds `\%%` as the typeahead $1. "12 Ma_n St" binds `MA\_N%`. The :134 behaviour stays green both.
- T4 (D6): findUndocumentedBangs (exported at non-null-assertion-comment.logic.test.ts:99) over parcel-lookup.ts returns []. See open choice 4.
- T5 (AC #6): it.each over the seat cases. Each fixture is the seat's recorded rows. "now" = red today.

| # | Typed | Fixture rows | Expected |
|---|---|---|---|
| 1 | 679 Queen St W | 679\|QUEEN → 5476455 "679 Queen St W" | unique 5476455 |
| 2 | 679 queen street west | same | unique |
| 3 | 679  QUEEN  ST  W | same | unique |
| 4 | 679 Queen | same | unique |
| 5 | 679 Queen St E | same | text_candidates [5476455] |
| 6 | 100 Queen St E | 100\|QUEEN → 5456212 "100 Queen St W" | text_candidates [5456212] |
| 7 | 100 Queen St W | same | unique 5456212 |
| 8 | 6 Glenaden Ave | 5484745 "6 Glenaden Ave E", 5485663 "…W" | text_candidates, 2 rows |
| 9 | 6 Glenaden Ave E | same | unique 5484745 |
| 10 (now) | 32 Fulham Dr | 5067128 "32 Fulham St", 5514141 "32 Fulham Dr" | unique 5514141 |
| 11 (now) | 123 Yonge St | 5179889 "123 Yonge Blvd", 5464983 "123 Yonge St" | unique 5464983 |
| 12 (now) | 2760 Yon | typeahead 5229356 "2760 Yonge St" | text_candidates [5229356] |
| 13 (now) | 14 Norwood | typeahead 5334051 "14 Norwood Ter" | text_candidates [5334051] |
| 14 | 383 El | typeahead 5106944, 5461541, 5191692 | text_candidates, 3 rows |
| 15 | 12 Elm | typeahead of 10 (5492668, 5264433, 5510910, 5017163 + 6) | text_candidates, 10 rows |
| 16 (now) | Gerrard St W | same as T1 | not unique |
| 17 | Gerrard St | 10 rows | text_candidates (the number prompt is task 2) |
| 18 | 123 Yongee St | fuzzy 5179889, 5464983 | text_candidates, match null |
| 19 | 2760 Yongee St | fuzzy 5229356 | text_candidates, never unique |
| 20 | 78 Robert St | 5259138, 5438421, both "78 Robert St" | multi_parcel |
| 21 | 2 Lake Cres | unlinked point, pin | unlinked with pin |
| 22 | 2750 St Clair Ave W | 5260587 "2750 St Clair Ave E" | text_candidates [5260587] (today; open choice 7) |
| 23 | King and Bay | none | no_match |
| 25 | 123 Main St Mississauga | none | no_match |
| 26 | 2760 Yonge St Unit 4 | 2760\|YONGE → 5229356 | unique |
| 27a (now) | Unit 4, 123 Yonge St | as 11 | unique 5464983 (open choice 1) |
| 27b (now) | 2760-4 Yonge St | 2760 → 5229356 | text_candidates |
| 27c (now) | 2760A Yonge St | 2760 → 5229356 | text_candidates |
| 28 | 14 Norwood Ter | 14\|NORWOOD TER → 5334051 | unique (the lotForm half is the existing flow test, search-routing.logic.test.ts:136) |
| extra 2e (now) | 679 Queen St. W | as 1 | unique |
| extra (now) | 2750 St. Clair Ave W | as 22 | as 22 |

- Cases 24 (outside Toronto), 29 (two characters) and the phone half of 23 are existing phone tests: parcelSearchMatch.test.ts:63 and :316, and the outside_toronto cases in the same file. They are cited, not re-written.
- Case 21's lat/lng are placeholders (UNVERIFIED).

In src/tests/consumer-parcel-lookup.infra.test.ts:
- T6 (AC #1): parcel-lookup.ts holds exactly one `resolution: 'unique'` and no `matchType: 'typeahead'`. Plus a RED plant control.
- T7 (R1): census row equals descriptor. data_story contains the exact-opens sentence. No "24 fields". The stated table count equals inputs.tables.length and the field count equals the whitelist length.
- T8: Spec 100 carries the SEARCHFIX.1 note with the RR-0442 and RR-0443 c words verbatim (the noteIn pattern).

F above: flip parcel-lookup-resolution:64-69.

Green both (survive the fix): search-parser-guard :99-192 and :201-227; parcel-lookup-resolution all except :64; search-routing.logic.test.ts:186, :206, :211; surface-registry.infra.test.ts:277 (--check); spec-notes-1b.logic.test.ts:63-69.

#### 5. Limits, and how it could fail or surprise
Not done here:
- No new resolution value; ParcelResolution stays at :136.
- route.ts and its meter are untouched. Check: the route.ts diff is empty.
- address.ts and the parity test are untouched.
- The phone and web are untouched (task 2).
- The "add a house number" prompt is not added (task 2, A5 i).
- Case 2f ("679QUEEN ST", no space) is not fixed.
- Seat item 6 (the unlinked W point hidden behind an E lot) is not fixed.

How it could fail or surprise:
- Admin tool: it shares the resolver, so a one-row typeahead now shows a list of one there too (ParcelCostTool.tsx:215).
- Period strip: if any stored street_name_normalized holds a ".", that street stops matching. UNVERIFIED without the DB. The db smoke test (src/tests/db/parcel-lookup.db.test.ts:66-70) still passes either way.
- "4-2760 Yonge St" (the unit-first Canadian form): only the dash fallback reaches it, it lists both numbers, and it never opens.
- More reads on a full miss (up to 2). The miss path only.
- Type narrowing relies on the printed address. A row with an empty address never narrows.
- The 10-row skip: a number+street with exactly 10 lots loses the direction narrowing and shows a list, same as the exact path (GROUNDER-SEATS.md:31).
- T4 imports a test module, so its suites register twice (open choice 4).
- The generator may also move the types/validator outputs. Detected by `--check` and the lane's diff.

#### 6. Notes owed, and by which tool
- Spec 100 :103 and :144 notes: by hand in the spec (a spec file, not a backlog file).
- doc-2 G.1 (doc-2:89) and A.3 (:32): `backlog doc update doc-2 --content` (the whole body, prior text kept, plus the note). backlog.md 1.55.3 has no `doc edit` (FOLD-PLAN.md:37 names it).
- task-69 (ST1 owner, FOLD-PLAN.md:134): `backlog task edit 69 --append-notes`.
- task-449 status and evidence: `backlog task edit 449`, in the same commit as the work.
- The card's DoD #2 cites 08_agents.md:462, but the quote is at :495. The orchestrator may correct it.

#### 7. Open choices (not decided)
1. "Unit 4, 123 Yonge St".
   - (a) Strip and follow the normal path: it opens 5464983. This is A1's "stripped before the parse", and is the same as the ruled trailing unit (RR-0166; seat case 26 opens).
   - (b) Always a list: the seat's case 27 expectation, written before fix 3 existed.
   - Recommend (a).
2. Dash form "2760-4".
   - (a) Read both numbers on a miss and list them.
   - (b) Strip to the left number and follow the normal path (A1's literal words). This opens the wrong lot for "4-2760".
   - Recommend (a): RR-0443 c says "select from ... close".
3. Source of the street type.
   - (a) The printed address, as guardByDirection does. No SQL change.
   - (b) Add street_type_normalized to the exact SELECT.
   - Recommend (a).
4. D6 proof.
   - (a) Import findUndocumentedBangs (the suite runs twice).
   - (b) Remove every `!` and reuse hasNonNullAssertion (infra :42). More edits.
   - (c) No new test; the pin only (it never goes red).
   - Recommend (a). FOLD-PLAN.md:35 says "carries a why-comment".
5. Admin parity.
   - (a) One rule on both paths.
   - (b) Consumer only, behind an option.
   - Recommend (a). It is the simplest, it adds no option (RR-0392), and Spec 89:38 already says typeahead gives "≤10 candidates".
6. Spec 89 :34 dated note (OUTSIDE FILES LINE). Standard :465 asks for it.
   - Recommend adding it, or the grounder rules it out.
7. A single exact row with a different typed type (e.g. "383 Elm St" where only Elm Rd exists) still opens today. Case 22 is also still a list of the E lot. A1 names neither.
   - Recommend no change here, and put both to the grounder (RR-0443 b).
8. R1 width.
   - (a) All of STATUS.md:133: metering, emits, writes, counts, cites.
   - (b) Only the exact/typeahead sentence plus counts.
   - Recommend (a). It is text only, and FOLD-PLAN.md:153 puts R1 here. The meter code is untouched.

#### 8. UNVERIFIED
- No DB read, so these were not checked:
  - whether any street key holds a period, or any addr_num_normalized holds a dash;
  - the 7 other Gerrard window rows;
  - case 21's pin;
  - whether parcels.street_type_normalized equals parseLinearName of linear_name_full.
- No test run, so the red/green claims are by reading the code.
- Whether vitest registers an imported test module's suites twice was not run.
- One of my Bash calls held a stray Python check. The hook blocked it, nothing ran, and I re-ran the call with node only.

#### Critical Files for Implementation
- /Users/brettpreston_macmini/Buildo-wt-board/src/lib/admin/parcel-lookup.ts
- /Users/brettpreston_macmini/Buildo-wt-board/src/tests/search-parser-guard.logic.test.ts
- /Users/brettpreston_macmini/Buildo-wt-board/src/tests/consumer-parcel-lookup.infra.test.ts
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/surfaces/_schema/census/contracts.json
- /Users/brettpreston_macmini/Buildo-wt-board/src/tests/parcel-lookup-resolution.logic.test.ts

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
- RR-0445 limit and reactivate screens: mobile first, also on the web, follow the earlier process
- RR-0446 several-lots map stays as built; no-plan page joins the limit-screen task
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
- RR-0166 Answer ONE-12 — "ONE-12 a" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738)
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
- RR-0447 clean the board (label dead), review all tasks, then add the search-fix tasks (names RR-0447) — "(1) all tasks that are no longer needed or merged are given the label dead - this should be all McFix labels" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2308)
- RR-0448 the search-fix cards are created as 8 merged tasks (names RR-0448) — "8" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2314)
- RR-0166 Answer ONE-12 (names RR-0166) — "ONE-12 a" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738)

## Prior reviews and lane reports
### task-449 (this task)
- (none)

## Dependencies
- (none)
