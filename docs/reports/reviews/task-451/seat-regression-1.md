# Seat: regression: task-451 plan (PLAN-451-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board wf2/board head b1e4012f5. The plan says it was read at 0841db559, and the task-450 plan at 5a26374b9. Both task files are as they stand in the working tree. I read these:
- backlog/tasks/task-451 and task-450 (whole file, including each plan)
- docs/reports/reviews/task-451/FINDINGS-PLAN.md (no GROUNDER-PLAN.md exists for 451)
- FOLD-PLAN.md, the g3 grounder records, MD:774-776, MD:1117, MD:2290
- the source and test files cited below
- the task-449 Files line and plan

Branches wf2/inc1b-sfx1, sfx2, sfx5 and wf1/inc1b-gate375 have no commits ahead of the board. Every branch that does diverge on these files is a stale mf46/mf76/mb37 branch, so a branch-level conflict check says nothing about 449 or 450. No test runner was run and nothing was written. Nothing was denied.

## Checked and clean
- The "at the back" inversion has a real ruling behind it. The old lock came from a lane note (.cursor/MCFRONTEND-QUEUE.md:415, "at the back is not data and is not used"). MD:1117 says nothing about "at the back" (GROUNDER-C D2, g3). MD:776 says "'at the back' when it has none", and the operator withdrew the question about it. FOLD-PLAN.md:57 orders the change.
- The lot.null change from "—" to "Not available" is ruled (RR-0444 2c, FOLD-PLAN.md:55). It now also covers a genuinely missing area, not only an implausible one. That is consistent because it is the one null value for the card.
- The plausible window is 50 to 5,000 inclusive. scripts/seeds/logic_variables.json:8192 and :8202 pin both ends (min = max, so they cannot drift). project.ts:267 uses `< min || > max`, so the plan's inclusive test matches it. report-compute.ts:20 already imports project.ts, so the precedent claim is true.
- select.label is only reached when route is non-null and selectedLetter is null. lotMap.ts:127 gives a route only when selectedParcelId is set, and :113 derives selectedLetter from the same id, so the branch is unreachable and its deletion is safe. mobile/__tests__/pageTable.logic.test.ts:33 uses its own synthetic descriptor (a generic fixture) and is unaffected. The semi page has its own select.label key.
- A 449/451 clash on source files does not exist. 449's Files line lists only src/tests/consumer-parcel-lookup.infra.test.ts from 451's set, not consumer-lookup.ts.
- The new nested link keeps the lot-map-help-link.logic.test.ts invariant that `HELP` appears once per golden. parcel-lotmap-report is a different testID. The unlinked state then carries two links to the same topic, which matches the mock and doc-2 B.6/B.7.
- Index shifts in static-page.logic.test.ts:55-67 are correctly foreseen. The footer-list pin ['/help','/privacy','/terms'] stays.
- The string pins 426 to 427 to 435 add up. The map content file nets 0 (select.label removed, unlinked.report added). The four static content files carry no "nav." key today (grep count 0 each), so +8 is exact. The S-golden counts (18 states, 100 goldens) do not change.

## rg#1 MED: the "at the back is not used" lock is rewritten with no named replacement, and its home rule text gets no dated note
Plan: section 3 step 10 ("the 'at the back is not used' assertion :148-150 and :163"). Section 7 lists doc-2 and task-336 notes only.
Evidence: src/tests/surfaces/search-follow-ups.logic.test.ts:149 and :151 pin `expect(Object.values(mapContent).filter((v) => /at the back/.test(v))).toEqual([])`. Its title cites RR-0289. The rule text is .cursor/MCFRONTEND-QUEUE.md:415: `"at the back" is not data and is not used`. That row is an M-246 record. lot-map-help-link.logic.test.ts:128-138 checks that the MF-53 row keeps its earlier notes.
Fix: name the new lock in section 4. Exactly lot.lead.house and lot.lead.no_building end "· at the back". The two *_faces keys and lot.letter never contain it. Retitle the test, dropping the RR-0289 claim. Add one appended dated note (prior text kept) on the MF-53 queue row at :415 saying the lane note is superseded by FOLD-PLAN.md:57 and doc-2 C.7.

## rg#2 MED: the num('') edit reaches more fields than the plan's regression story covers
Plan: section 3 step 1 (":81 `if (v == null || v === '') return null;`") and "The headline `areas` (:104-111) is not touched".
Evidence: src/lib/parcels/consumer-lookup.ts:110 reads `areas[c] = Number.isNaN(Number(v)) ? v : num(v)`. Number('') is 0, so a '' headline string went to 0 and now goes to null. The same helper feeds :146 (every numeric comparable-build field) and :166-170 (compCount, compBuildRatioP50, compFsiP50, neighbourhoodId). Error-paths#2 raised compCount only. No existing test builds a '' row: infra test :157-168 and legacy-hide :37 use only numbers.
Fix: either use a local `numOrNull` for lot_size_sqm and comp_count only, or keep the shared edit and add a '' red case for a headline column, a comparable field and neighbourhood_id. Name each reader of those fields in the plan. Also note that areaSqftM2Dot already treats '' as null (display-rules.ts:21), so the map area needs no change for L2.

## rg#3 MED: the T4 lock cannot hold as written once the header links exist, and the plan only describes the list change
Plan: section 4 ("T4 (:146): the header hrefs ['/', '/login'] are public host rows with a page (same check as web-landing.logic.test.ts:277)").
Evidence: static-page.logic.test.ts:148-153 asserts, per href, `internal` equals `/parcel-tool${h}` and that `${MOUNTS}${h}/page.tsx` exists. host-policy.ts:43 maps /login to /parcel-tool/login, and web-landing.logic.test.ts:369 shows '/' maps to /parcel-tool/home. Neither exists under (static)/${h}, and `/parcel-tool/` is not an internal for '/'. The per-href assertion fails for both new hrefs.
Fix: say in section 4 that the per-href block is rewritten. Use `row.routeClass==='public' && pageExists(row.internal)` for the header hrefs. Keep the strict `/parcel-tool${h}` and (static) mount check for the footer set. Keep both lists pinned exactly, so a stray new link still fails.

## rg#4 LOW: frontage and zoning leave the screen reader, the only place the Daylight work kept them
Plan: section 3 step 3 (:189 label becomes `{lead}, {area}`) and section 4 AC4.
Evidence: mobile/__tests__/lotMapPage.behaviour.test.tsx:63-65 (comment) says SRCH.DAYLIGHT removed the facts line, so "the frontage and zoning facts reach the screen through the card's accessibility label". Commit 247026905 pinned that. doc-2:61 says C.9 is "REMOVED by the design". The V3 ruling is a grounder "conventional default" (g3 GROUNDER-QUESTIONS.md:50), not an operator word. The fold plan decides this at FOLD-PLAN.md:59.
Fix: the plan already adds the C.9 doc-2 note. Make the note say the two facts are still sent (field_whitelist :86-87) but no longer reach anyone. Optionally append them after the visible text in the label, which still satisfies "contains the visible text".

## rg#5 LOW: the stated expected result for the unchanged area case is wrong
Plan: section 4 AC1 ("'284' still gives '3,052 sq ft · 284 m²' (:286)").
Evidence: infra test :279 feeds '283.5', and :286 asserts '3,052 sq ft · 284 m²'. The repo's own rule over 284 gives a different figure. `node -e` of Math.round(284*10.7639) printed 3057, and the same call on 283.5 printed 3052. A test written from the plan's text would fail on its green side.
Fix: change the plan text to "'283.5' still gives ...".

## rg#6 MED: descriptor :57 is orphaned unless 451 takes it unconditionally
Plan: section 6 and section 3 step 7 ("`:57` only if 450's final plan does not take it").
Evidence: the map descriptor :57 says `falls back to the client derivation`. The 450 plan, section 3 step 2a, deletes exactly that derivation (parcelSearchMatch.ts:193-208) for Q19. 450's steps 10 and 11 edit only the search and semi descriptors, so it does not touch the map descriptor.
Fix: make the :57 reword unconditional in 451: an absent resolution reads as no_match. Add a "re-check 450's diff" line to the anchor-edit note.

## rg#7 NIT: the "ruled message texts are verbatim" test pins the old unlinked body
Plan: section 4 AC3 says the :207 pin becomes the new body.
Evidence: mobile/__tests__/lotMapScreens.golden.test.ts:200-203 names the group "the ruled message texts are verbatim" and pins `Try a nearby address.` as the full body.
Fix: pin the new body plus the new key `unlinked.report`, and cite doc-2:48 as the ruling source in the test comment, so the lock still reads as a ruling.

## Where the 450 and 451 plans would collide
All of these should be edited by anchor text, not by line.
- scripts/surfaces/_schema/static-page.json: 450 inserts a web_help mailto part after :30. 451 inserts a header section before :7 and at the web_maxbld_error miss, and edits $comment :2. The hunks are disjoint, but every `parts[n]` index test in static-page.logic.test.ts (:55-68) shifts twice. 451 must re-read after 450 lands.
- static-page.logic.test.ts: 450 owns T8 (:229-236) and moves the topic to wrong-lot. 451 owns T1, T4, T5. Same file, so it has a textual merge.
- surface-validate.logic.test.ts:91 and surface-conformance.logic.test.ts:261: both plans rewrite the same two pins (426 to 427 to 435) and add dated comments in the same place. That is a certain textual conflict. The 435 figure holds only if 450 adds exactly one string. 450's final plan says one, so measure before and after.
- web_help.content.json: 450 adds help.mailto.wrong_lot. 451 adds nav.home and nav.sign_in. Different lines.
- The shared classifier: 450's L3 edit to classifyParcelSearchError (`retryAfterSeconds == null`) changes the rate_limited_zero case on the map page. 451's X1 test must assert the notice only, which the plan does say (risk 6).
- mobile_parcel_disambiguation_map descriptor :57: see rg#6.
- Topic orphaning: after 450 and 451 land, lot_match and address_match have no caller. The plan keeps them (8.4), which is safe, and 450's T8 pin is the only test that names them.
- The 449 overlap is src/tests/consumer-parcel-lookup.infra.test.ts only. Both add new describe blocks, so the conflict is textual. 449 also adds a source lock near :31-42 that 451's new import line in consumer-lookup.ts does not trip (it tests the route and the flow files, not consumer-lookup.ts).
- 456 will edit search-follow-ups.logic.test.ts after 451. It should read 451's new "at the back" lock from rg#1 as the baseline.

STATUS: 7 findings (0 CRITICAL, 0 HIGH, 4 MED, 2 LOW, 1 NIT); the plan is sound and grounded, but the lock rewrites for "at the back" and T4, the num('') blast radius and the descriptor :57 hand-off need naming before build.
