Grounder: Cairn-Ground-G3C
Ruled: out-compliance-inc-S-p1.txt sha256:df75612b0585 findings:7
Ruled: out-compliance-inc-S-p2.txt sha256:76a4e63b6ec9 findings:4
Ruled: out-compliance-inc-S-p3.txt sha256:b796a96664f2 findings:3
Ruled: out-compliance-inc-S-p4.txt sha256:5506a0954546 findings:5
Ruled: out-compliance-inc-S-p5.txt sha256:9aa510ce05af findings:2
Ruled: out-compliance-inc-S-p6.txt sha256:91800df6bed8 findings:3
Ruled: out-compliance-inc-S-p7.txt sha256:2dc03e74d43f findings:6
Ruled: out-compliance-inc-S-p8.txt sha256:c35a8143e7ba findings:7
Ruled: out-compliance-inc-S-p9.txt sha256:5a1ab90bcc31 findings:8
Ruled: out-compliance-inc-S-p10.txt sha256:6972fd99d1e1 findings:2
Ruled: out-compliance-inc-S-p11.txt sha256:2ad63e62ce90 findings:5
Ruled: out-compliance-inc-S-p12.txt sha256:5b3cccf70237 findings:4
Ruled: out-compliance-inc-S-p13.txt sha256:d1140234720c findings:2
Ruled: out-compliance-inc-S-p14.txt sha256:0429961d16ac findings:2
Ruled: out-compliance-inc-S-p15.txt sha256:8196d3235856 findings:4
Ruled: out-compliance-inc-S-p16.txt sha256:9470db2bba2e findings:2
Ruled: out-compliance-inc-S-p17.txt sha256:ac68626c3c34 findings:5
Ruled: out-compliance-inc-S-p18.txt sha256:6c3677154da9 findings:4
Ruled: out-compliance-ms-S-p1.txt sha256:cfe805ca87aa findings:5
Ruled: out-compliance-ms-S-p2.txt sha256:c767d0de17f3 findings:1
Ruled: out-compliance-ms-S-p3.txt sha256:96f14026cdf4 findings:3
Ruled: out-compliance-ms-S-p4.txt sha256:e393038acd84 findings:2
Ruled: out-compliance-ms-S-p5.txt sha256:047f2ad4c074 findings:4
Ruled: out-compliance-ms-S-p6.txt sha256:0c574b0a3124 findings:4
Ruled: out-compliance-ms-S-p7.txt sha256:59167469243d findings:5
Ruled: out-compliance-ms-S-p8.txt sha256:7501d85f8341 findings:7
Ruled: out-compliance-ms-S-p9.txt sha256:4638369fe331 findings:3
Ruled: out-compliance-ms-S-p10.txt sha256:8779b645766c findings:2
Ruled: out-compliance-ms-S-p11.txt sha256:649b49054532 findings:0
Ruled: out-compliance-ms-S-p12.txt sha256:96a5d5a1038f findings:4
Ruled: out-compliance-ms-S-p13.txt sha256:404751fe71aa findings:5
Ruled: out-compliance-ms-S-p14.txt sha256:5d45c940d32b findings:2

Process note: `git diff --stat 8dba70e8e HEAD` shows only a backlog task file changed since the review, so no G3 file differs from the reviewed commit. By mistake I wrote one stray file, /Users/brettpreston_macmini/tmp-none (a copy of grep output from FINDINGS.tsv, no secrets). I did not delete it, because the brief forbids deletion. Please remove it.

Rulings I used (each checked at its source):
- RR-0278 (MD:1080-1082): a report is charged only when it is produced. This supersedes the G.6 text "a hit counts one report".
- "1 b 2 a" (Spec 100 §3.2 dated note 2026-11-12, docs/specs/03-mobile/100_mobile_parcel_cost_tool.md:115) and EI-D1: the legacy cost menu is withheld, so a lookup counts only with an evaluated option.
- MF-45 D-4 a (Spec 100:13): the lead_gen arm is transitional and unmetered until MF-50.
- Spec 126 §11b.3 dated note 2026-11-12 (126_maxbld_surface_standard.md:995): the Help prefill travels in the URL fragment, "never a query string".
- RR-0270 and RR-0273 (MD:1061, :1066) and task-332: the web search footer has five items, with its keys in mobile_parcel_search.content.json.
- RR-0284 (MD:1099): footprint presence and the street name were added to the lot read.
- MD:1105: billing is off until MB-44 because `page` is null for every lot.

2. TABLE (CRITICAL/HIGH/MED; 59 rows. A "none found" line is not a finding: ms-p6#1 is the only one, marked CRIT and "none found")
inc-p1#1 | HIGH | UNDETERMINED | C.3 "neighbours in zinc": the API serves neighbours on `unlinked` only (src/lib/parcels/lot-map.ts:7-9, DECISIONS-v3 item 1) and B.8 removed them. The golden at daylightSearchPages.golden.test.ts:88 bans the word everywhere. See Q1.
inc-p1#2 | MED | CONFIRMED (part) | The wording is verbatim v8 (choose-lot-states.html:277 "the City's data doesn't link"), so that part is REFUTED. "or report it" is missing from unlinked.body (content.json:17). See D3.
inc-p1#3 | MED | UNDETERMINED | The fragment URL is ruled (126:995). The topic address_match instead of wrong-lot is an orchestrator reading "not an operator ruling" (MCFRONTEND-QUEUE.md:417, task-343 item 7). See Q2.
inc-p1#4 | MED | UNDETERMINED | C.9 is removed visibly, but the a11y label still reads frontage and zoning (LotMapBinding.tsx:189, content.json:10). See Q3.
inc-p1#5 | MED | CONFIRMED | C.7: a null street gives no "at the back" (LotMapBinding.tsx:180-181). See D2.
inc-p11#1 | HIGH | DUPLICATE of p1#3 | Topic and URL are the same issue. The placement claim is refuted: web notices are outside_toronto, ratelimit, entitlement and error (SearchBinding.tsx:175-182), while the B.4-B.6 notices live on the phone lot-map page, which has the help link (LotMapBinding.tsx:96-105).
inc-p11#2 | MED | UNDETERMINED | The web search page is zinc-950 dark (SearchBinding.tsx:55). task-322 restyled only the phone pages. See Q4.
inc-p11#3 | MED | REFUTED | M_TO_FT is `pinnedSetting(seed,'parcels_m_to_ft')` (src/lib/parcels/geometry.ts:8); the permits route imports it (route.ts:6).
inc-p12#1 | HIGH | REFUTED-BY-RULING | consumer-lookup.ts:62-70 is "1 b 2 a". The null menu is EI-D1 (Spec 100:115). The page-produced rule is RR-0278.
inc-p12#2 | MED | REFUTED-BY-RULING | The EI-D1 and "1 b 2 a" rulings are in Spec 100:115 and the dated notes. The model could not see them.
inc-p12#3 | MED | REFUTED | findNearestParcel and the SPATIAL_* constants have no caller outside src/tests/parcels.logic.test.ts. It is dead code from commit 67057269c, not resolver behaviour.
inc-p12#4 | MED | REFUTED-BY-RULING | tool-gate.ts:5 is the ruled MF-45 D-4 a transitional lead_gen arm. The lookup descriptor already records the deviation.
inc-p13#1 | MED | REFUTED-BY-RULING | RR-0284 (MD:1099, "we have the data - why not") and task-336 built C.5 and C.7. doc-2 is a dated snapshot at 154e7b13f.
inc-p15#1 | MED | REFUTED-BY-RULING | RR-0278 plus MD:1105. The T-B3 pin is the ruled state.
inc-p16#1 | MED | DUPLICATE of p1#3 | Topic address_match. The test header at line 40 records the orchestrator reading.
inc-p17#1 | HIGH | REFUTED | E.2 governs the web search pages. SearchBinding.tsx:130-143 renders a footer with role 'copyright' (`footer.copyright`). The static-page footer is "unchanged" under task-332.
inc-p17#2 | MED | REFUTED-BY-RULING | The fragment form is ruled (126:995). The label "Get help with an address" is pinned at lot-map-help-link.logic.test.ts:46.
inc-p17#3 | MED | DUPLICATE of p1#5 | Same gap. RR-0289 (MD:1117) says nothing about "at the back".
inc-p18#1 | MED | REFUTED-BY-RULING | task-332 Build names mobile_parcel_search.content.json for the footer keys. RR-0270 and RR-0273 are at MD:1061 and :1066.
inc-p2#1 | MED | DUPLICATE of p1#3 | A test-file view of the same help URL and topic.
inc-p3#1 | MED | UNDETERMINED | The answers are "it's" (content.json:4) against D.4 "it is". The curly-apostrophe copy question Q3 is explicitly NOT answered (task-319:116, MCFRONTEND-QUEUE.md:716). See Q5.
inc-p3#2 | MED | REFUTED | The smoke test uses a golden fixture with a card pre-selected. The real page pins "nothing pre-checked, Select disabled" at parcelSearchScreen.behaviour.test.tsx:108 and :116-124.
inc-p4#1 | MED | DUPLICATE of p1#1 | Neighbour outlines on the matched map.
inc-p5#1 | MED | REFUTED-BY-RULING | The fragment form with q is ruled (126:995).
inc-p6#1 | HIGH | REFUTED-BY-RULING | RR-0278 at MD:1080-1082 is the ruling. contracts.json:22003 correctly states it.
inc-p6#2 | MED | REFUTED | D.8 is already BOUND-NOT-STORED against GAP.12 in doc-2, and semiQuestion.ts matches that.
inc-p7#1 | HIGH | REFUTED | Same as p17#1. A footer role 'copyright' exists for the search surface; the schema's link/legal roles serve the static pages.
inc-p7#2 | MED | DUPLICATE of p1#4 | The lot.label content key.
inc-p7#3 | MED | DUPLICATE of p1#2 | "or report it".
inc-p7#4 | MED | NOT-APPLICABLE | The static-page link pattern covers footer paths such as /help. The wrong-lot link is an open_help action, not a table link.
inc-p8#1 | HIGH | CONFIRMED (doc text, mis-rated LOW) | Stale descriptor text. See D4.
inc-p8#2 | MED | CONFIRMED (doc text) | Stale text about faint neighbours and the dark map style. See D4.
inc-p8#3 | MED | CONFIRMED (doc text) | guards.flag is "none" although the web mount is gated by the live switch. See D4.
inc-p8#4 | MED | CONFIRMED (doc text) | The note says product is lead_gen while the field says parcel_tool. See D4.
inc-p9#1 | HIGH | CONFIRMED (doc text, mis-rated LOW) | metering.why omits the page-produced rule. See D4.
inc-p9#2 | HIGH | REFUTED | The check text names both classifyRoute "authenticated" and the in-handler gate. Only the cosmetic truncation "implementati sr" is real (LOW).
inc-p9#3 | MED | CONFIRMED (doc text) | emits says "none ... no ledger INSERT" while route.ts:110 calls openReport. See D4.
inc-p9#4 | MED | REFUTED | "4 field(s)" counts the four projection sites it cites, not whitelist names.
inc-p9#5 | MED | REFUTED | entitlement index.ts:653-657 shows the display degrades to null; the meter fails closed. The why states both.
ms-p1#1 | MED | REFUTED | There is no third layout table (only parcelSearch.ts:138 and lotMap.ts:10). Test 3 at line 56 sweeps every rendered tree, the semi page included.
ms-p1#2 | MED | REFUTED | parcelScreens.golden.test.ts:58 only requires that some colour is present. daylightSearchPages.golden.test.ts bans legacy tokens separately, so the two rules are conjunctive.
ms-p12#1 | HIGH | REFUTED | The 20 is a mocked logic_variables row in the test (parcels-entitlement.infra.test.ts:43). The seed defaults are 10/10/25.
ms-p12#2 | MED | REFUTED-BY-RULING | `page` is null until MB-44 (MD:1105, route.ts:22-23).
ms-p12#3 | MED | NOT-APPLICABLE | "Task relevance" is a plan rule, not a finished-code rule. The block is a note lock.
ms-p13#1 | MED | CONFIRMED (doc, test header) | search-follow-ups.logic.test.ts:9-10. See D5.
ms-p13#2 | MED | CONFIRMED (doc, test title) | search-follow-ups.logic.test.ts:98. See D5.
ms-p2#1 | MED | REFUTED | The contract emits `resolution` (schemas.ts:449, lookup-flow). The test's forced cast only exercises the older-server fallback.
ms-p4#1 | MED | REFUTED | parcelSearchMatch.ts:20-24 says the text below is pre-MF-53 and "Prior text kept". That is the M-246 dated-note convention.
ms-p5#2 | MED | CONFIRMED (doc) | The lookup descriptor inputs.tables has no parcel_buildings. See D4.
ms-p5#3 | MED | CONFIRMED (doc, count unverifiable) | "24 fields" cannot be reconciled with 80 flattened whitelist names. See D4.
ms-p6#1 | CRIT | not a finding | The text is "none found".
ms-p6#2 | MED | REFUTED | static-page.json and its schema were created in 0e1c5b8de (MF-46). task-390 only added `screens`.
ms-p7#1 | HIGH | REFUTED | limitations carries "Closed 2026-11-11 (MF-53, prior text kept)". The leftover product_questions line goes in D4.
ms-p7#2 | MED | CONFIRMED (doc) | The search descriptor metering says "no usage_events table, measured 2026-09-16". See D4.
ms-p7#3 | MED | DUPLICATE of inc-p8#4 | The lead_gen note.
ms-p8#1 | MED | DUPLICATE of inc-p9#3 | emits against the ledger write.
ms-p8#2 | MED | CONFIRMED (doc) | parcel_maxbld_scenarios and bylaw_resolution_lot_stamps are named in data_story but absent from inputs.tables; the table counts disagree (9, 6, 7). See D4.
ms-p8#3 | MED | REFUTED | A dated 2026-11-11 note follows the "declared, not yet emitted" paragraph (prior text kept).
ms-p9#1 | MED | REFUTED-BY-RULING | MD:1105 records that `page` is null for every lot until MB-44 and billing is off.

3. CONFIRMED DEFECTS (all small and descriptive; none touches money, auth or the meter logic)
D1 (the only one that changes what a person sees, C.7 only). See D2.
D2 C.7 "at the back" is missing. Rule: doc-2 C.7 "Lot B · no building · at the back" and v8 choose-lot.html:306 "{faces {street} | at the back}". The operator applied rule at MD:776 reads "'at the back' when it has none". No later operator ruling removes it. The only support for dropping it is a lane note (MCFRONTEND-QUEUE.md:415, "not data"), and the RR-0289 words at MD:1117 are about footprints only.
 What happens: a lot with no fronting street shows "Lot B · no building" with the ruled third segment missing. The same happens for "has the house".
 Fix: add content keys for the null-street case ("Lot {letter} · no building · at the back" and the has-house twin) in mobile_parcel_disambiguation_map.content.json:5-8. Pick them at LotMapBinding.tsx:180-181 when frontageStreet === null, keeping "says neither" for an absent field. Update search-follow-ups.logic.test.ts:148-150 and the regenerated slice and goldens.
 Owner: task-336. Size: line-size to small. Impact: one wording segment for lots with no street name. Needs no decision, since the operator's rule already exists.
D3 B.6 and B.7 "or report it" is missing from the no-lot message. Rule: doc-2 B.6 "Try a nearby address or report it." and B.7 "report it inside the no-lot message", with v8 choose-lot-states.html:277 carrying an inline link. mobile_parcel_disambiguation_map.content.json:17 and the pin at lotMapScreens.golden.test.ts:207 drop it. No ruling drops it (grep of MD, the queue and task-321 found none).
 What happens: the notice ends "Try a nearby address." with only the separate "Get help with an address" link below it. The inline report link is absent.
 Fix: change unlinked.body to end "or report it" with an inline link on the existing open_help action. This is more than a string change, because it needs a nested link in the notice. Update the pin.
 Owner: task-321 (SRCH.C12, B.7). Size: small, with a one-line operator confirmation of the link shape.
D4 Descriptor and census text that no longer matches the built behaviour. These are documentation defects; no code misbehaves. All are LOW in effect even where they were rated HIGH.
 a) mobile_parcel_disambiguation_map.descriptor.json:5 and :239 still describe cards "(area, frontage, zoning)". Line 413 says "dark map style" and line 447 says "faint neighbours ... map-only". The phone no longer draws any of these (task-322 removed B.8 and C.9). Frontage and zoning stay in the whitelist only because the a11y label reads them.
 b) mobile_parcel_search.descriptor.json: guards.flag "none" although the web mount is gated by MAXBLD_WEB_LIVE; the notes still say product "is lead_gen" while the field says parcel_tool; metering says no usage_events table exists (measured 2026-09-16); product_questions still says two of five branches are unreachable.
 c) contract_parcels_lookup.descriptor.json: metering.why does not state the page-produced rule; emits.answer is "none" and ledger_events is [] although openReport runs (route.ts:110); inputs.tables omits parcel_buildings, usage_events, parcel_maxbld_scenarios and bylaw_resolution_lot_stamps; the table counts disagree (9, 6, 7); and "24 fields" cannot be reconciled with 80 flattened whitelist names.
 d) scripts/surfaces/_schema/census/contracts.json:22003 mirrors c).
 Fix: add dated notes or edit the statements to the current values. Do not add mechanisms. Owner: task-364 (SRCH.HYGIENE) follow-up; its current ACs do not cover these files. Size: line-size per file.
D5 Test-file headers that contradict their own body. src/tests/surfaces/search-follow-ups.logic.test.ts:9-10 says C.5 and C.7 are "not built ... not in the map field whitelist", yet the same file locks both fields as landed (lines 110-111, 141+). The describe title at line 98 says "no field was added", while its second test asserts two fields were added.
 Fix: reword the header lines to "landed under task-336 (RR-0284/RR-0289); whitelist 16 entries", and retitle the block to "fingerprints follow the content files". Owner: task-364 / task-336. Size: line-size.

4. LOW / NIT (recorded only; I flag none as mis-rated)
LOW: inc-S-p1#6 #7; p10#1 #2; p11#4 #5; p13#2; p14#1 #2; p15#2 #3 #4; p16#2; p17#4 #5; p18#2 #3 #4; p2#2 #3 #4; p3#3; p4#2 #3 #4 #5; p5#2; p6#3; p7#5 #6; p8#5 #6; p9#6 #7 #8. ms-S-p1#3 #4 #5; p10#1 #2; p12#4; p13#3 #4 #5; p14#1 #2; p3#1 #2; p4#2; p5#4; p6#3 #4; p7#4 #5; p8#4 #5 #6; p9#2 #3.
NIT: inc-S-p8#7; ms-S-p3#3; ms-S-p8#7.
Non-finding: ms-S-p5#1 has severity "none", so it is not a finding.
Worth a later look, though not a HIGH-class defect:
- inc-p4#4 and #5 (hidden h1 headings, A.1 and C.2) are LOW.
- The stale "20 reports" header and descriptor text (inc-p15#2, p9#6) are doc-only.
- Server neighbour query: src/lib/parcels/lot-map.ts still runs the neighbour query and its two admin variables for `unlinked`, although the phone no longer draws neighbours. This belongs under Q1.

5. TOTALS (59 CRIT/HIGH/MED findings)
CONFIRMED 14 (inc: p1#2, p1#5, p8#1, p8#2, p8#3, p8#4, p9#1, p9#3; ms: p13#1, p13#2, p5#2, p5#3, p7#2, p8#2).
REFUTED 17.
REFUTED-BY-RULING 11.
NOT-APPLICABLE 2.
DUPLICATE 9 (within this share). DUPLICATE-OF-EARLIER 0.
UNDETERMINED 5 (inc-p1#1, p1#3, p1#4, p11#2, p3#1).
Not a finding 1 (ms-p6#1).
No CRIT is confirmed, and no money, entitlement, metering or auth defect was found. The meter behaves as ruled (RR-0278 and "1 b 2 a"): billing stays off until MB-44.

Operator questions:
Q1. Should the matched-lot map draw neighbouring parcels in zinc (doc-2 C.3), given neighbours are served on `unlinked` only and B.8 removed them? If not, drop "neighbours in zinc" from C.3.
Q2. Should the help links use the built Help topics address_match and lot_match, or should a wrong-lot topic be added to the Help page, as v8 and doc-2 B.7 name? (Already on task-343 item 7.)
Q3. May the lot card's accessibility label still read frontage and zoning after C.9 removed the visible line?
Q4. Which task restyles the web search page to the Daylight v8 look? task-322 covers only the phone pages.
Q5. Do the semi answers keep the contractions ("Yes, it's one half of a semi") or follow D.4's "it is"? This is the open apostrophe question Q3 in task-319.

6. UNVERIFIED
- The "24 fields" count in the lookup descriptor against the response shape. I did not count the response keys.
- Whether the descriptor checks (field_whitelist_parity and the others) are executed by a gate. I did not run surface-validate.
- Whether v8 gives a design rule for the web search page being light.
- I did not check the source for MD:776 "applied" beyond its text; the operator's verbatim there is a question, with the rule written by the orchestrator.

### Critical Files for Implementation
- /Users/brettpreston_macmini/Buildo-wt-board/mobile/src/components/surfaces/LotMapBinding.tsx
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_disambiguation_map.content.json
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/surfaces/parcel_product/F02/contracts/contract_parcels_lookup.descriptor.json
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.descriptor.json
- /Users/brettpreston_macmini/Buildo-wt-board/src/tests/surfaces/search-follow-ups.logic.test.ts
