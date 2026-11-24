---
id: TASK-449
title: >-
  SEARCHFIX.1 Search opens a lot only on an exact match: a partial address or a
  one-row leftover gives a list; a full correct address opens; unit and period
  forms no longer dead-end
status: LATER
assignee: []
created_date: '2026-11-24T14:47:00Z'
updated_date: '2026-11-24T14:59:00Z'
labels:
  - SEARCHFIX-PRIORITY
milestone: m-1
dependencies: []
type: fix
ordinal: 150010
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-24 by the orchestrator, Spec 137 rule 2, on the operator's rulings: RR-0444 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290, fold the findings), RR-0447 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2308, add the new tasks with the search-fix labels, dependencies and order) and RR-0448 (the 8 merged cards). Source: the fold plan docs/reports/reviews/mcfixreborn-fold/FOLD-PLAN.md, task 1 (FIX.SEARCH-EXACT) with amendment A1; every finding was ruled by a separate grounder (RR-0387, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1943; records under docs/reports/reviews/mcfixreborn-g1 to -g4). The plan's section 2 lines are this card's acceptance tests, each red first. Nothing is added that the plan or a ruling does not name (RR-0392, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975).

What changes, in plain words: the address search opens a lot only when the typed address matches exactly (RR-0442, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2276; RR-0443, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2283). A partial address ("2760 Yon") or a search that happens to leave one row gives a list to pick from. A full correct address whose number is shared by another street type ("32 Fulham Dr") opens. "Unit 4, 123 Yonge St", "2760-4 Yonge St" and "St." no longer end in no match. The wildcard characters % and _ typed by a customer are escaped.

Findings folded: ST1, 2a (server side), G2 D1, G2 D6, G3 R1; typed-address seat differences 1 to 6 (docs/reports/reviews/mcfixreborn-g3/SEAT-typed-addresses.md), whose 29 typed-address cases with real addresses are this card's tests.

Must not: add a new resolution value, or touch the report meter in the lookup route.

Dated notes owed: Spec 100 (:103, :144); objectives G.1 and A.3 of doc-2 through the backlog CLI; task-69.

Files: src/lib/admin/parcel-lookup.ts, src/tests/search-parser-guard.logic.test.ts, src/tests/consumer-parcel-lookup.infra.test.ts, scripts/surfaces/parcel_product/F02/contracts/contract_parcels_lookup.descriptor.json, scripts/surfaces/_schema/census/contracts.json, docs/specs/03-mobile/100_mobile_parcel_cost_tool.md
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A typeahead that leaves exactly one row returns a list (text_candidates), never unique; only the exact path returns unique
- [ ] #2 "Gerrard St W" with a full 10-row window returns a list, not the one W row
- [ ] #3 A full correct address with its street type opens the lot when the number is shared by another street type
- [ ] #4 Unit-first, dash-unit, letter-suffix and period forms reach the lot or the close-address list, never a dead end
- [ ] #5 A typed % or _ is escaped and returns no unrelated lots
- [ ] #6 The 29 typed-address cases of the seat record pass as tests
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
Planner: Cairn-Plan-449
Plan id: PLAN-449-v1

## 1. Rule quoted first
- RR-0442, MD:2276 (operator): "It should open on an exact match and we have a different process for address mistakes". Ruled at MD:2277: "the search opens a lot on an exact match."
- RR-0443 c, MD:2284: "What happens with a partial address? Similar to an address mistake they need to select from the available addresses that are close".
- RR-0444 (2a), MD:2291: "The search gap is resolved (a lot opens on an exact match only; RR-0442, RR-0443 c)."
- RR-0392, MD:1975: "I don't think we need any other infastrcuture beyond this". So no new mechanism.
- RR-0166 "ONE-12 a" (MD:738), which already governs this code: a trailing unit is dropped and the address still opens (parcel-lookup.ts:165-171). Direction is a guard after the match (:188-210).
- .cursor/MCBYLAWS-QUEUE.md:107: "Changing a test assertion ... is a ruling". The two assertions flipped below rest on RR-0442 and RR-0443 c.
- docs/specs/00_engineering_standards.md:465: "A behavior-changing ruling updates ALL cited specs + runbooks in the SAME commit".
- Fold plan, FOLD-PLAN.md:31-39 (task 1) and :222-225 (A1). The seat record SEAT-typed-addresses.md:57-61 and :66-95. Grounders: G3 GROUNDER-SEATS.md:20-31 (A, i.e. ST1); G2 GROUNDER-B.md:59-63 (D1) and :80-81 (D6); STATUS.md:133 (R1 = G3 D:D1, D:D3, D:D5, C:D4, A:D2, F:D9, B:D9, B:D10).

## 2. What exists and is reused
- The truncation rule of the exact path, parcel-lookup.ts:260-261 (`exactTruncated ? null : typed`). It is copied to the typeahead guard.
- conflictList, :235-237, builds a text_candidates list from rows. It is reused for the one-row typeahead, so no new shape is needed.
- guardByDirection, :203-210, is the pattern for the street-type narrowing: it narrows the returned rows only, never empties a set, and needs no new query.
- parseLinearName(...).street_type (address.ts:41-67) already returns the street type. It is used for both the typed text and the printed row address. address.ts itself is NOT edited (it is the parity mirror).
- UNIT_TAIL / stripTrailingUnit, :171-177: the leading-unit pattern copies its closed forms.
- The exact statement, :253-259, is reused for the letter and dash fallback. No new SQL is added.
- The :318 wildcard skip on the unlinked read is kept as is.
- Precedents for text locks: spec-notes-1b.logic.test.ts:48-70 (the noteIn pattern, and the census row equals its descriptor). The existing hasNonNullAssertion / importsResolver locks are at consumer-parcel-lookup.infra.test.ts:31-42.
- Generator: scripts/violations/generate-surface-registry.mjs. `--emit-descriptors` writes the descriptor files from the census (:1593-1601), the plain run writes 127-surface-registry.md (:1629), and `--check` checks both ways (:1604-1627). The census is the hand-kept source. The descriptor is emitted from it, not the other way round as FOLD-PLAN.md:36 reads.

## 3. The change, file by file, in build order (lines read at head 5a26374b9)
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

## 4. Tests first (red unless marked "green both")
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

## 5. Limits, and how it could fail or surprise
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

## 6. Notes owed, and by which tool
- Spec 100 :103 and :144 notes: by hand in the spec (a spec file, not a backlog file).
- doc-2 G.1 (doc-2:89) and A.3 (:32): `backlog doc update doc-2 --content` (the whole body, prior text kept, plus the note). backlog.md 1.55.3 has no `doc edit` (FOLD-PLAN.md:37 names it).
- task-69 (ST1 owner, FOLD-PLAN.md:134): `backlog task edit 69 --append-notes`.
- task-449 status and evidence: `backlog task edit 449`, in the same commit as the work.
- The card's DoD #2 cites 08_agents.md:462, but the quote is at :495. The orchestrator may correct it.

## 7. Open choices (not decided)
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

## 8. UNVERIFIED
- No DB read, so these were not checked:
  - whether any street key holds a period, or any addr_num_normalized holds a dash;
  - the 7 other Gerrard window rows;
  - case 21's pin;
  - whether parcels.street_type_normalized equals parseLinearName of linear_name_full.
- No test run, so the red/green claims are by reading the code.
- Whether vitest registers an imported test module's suites twice was not run.
- One of my Bash calls held a stray Python check. The hook blocked it, nothing ran, and I re-ran the call with node only.

### Critical Files for Implementation
- /Users/brettpreston_macmini/Buildo-wt-board/src/lib/admin/parcel-lookup.ts
- /Users/brettpreston_macmini/Buildo-wt-board/src/tests/search-parser-guard.logic.test.ts
- /Users/brettpreston_macmini/Buildo-wt-board/src/tests/consumer-parcel-lookup.infra.test.ts
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/surfaces/_schema/census/contracts.json
- /Users/brettpreston_macmini/Buildo-wt-board/src/tests/parcel-lookup-resolution.logic.test.ts
<!-- SECTION:PLAN:END -->
