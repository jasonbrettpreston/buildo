Grounder: Cairn-Ground-G3D
Ruled: out-compliance-five-words-p1.txt sha256:a4f868df242b findings:5
Ruled: out-compliance-five-words-p10.txt sha256:b8d2413f8d81 findings:2
Ruled: out-compliance-five-words-p11.txt sha256:eb339b4f8678 findings:5
Ruled: out-compliance-five-words-p12.txt sha256:3e6fa64479e7 findings:3
Ruled: out-compliance-five-words-p13.txt sha256:77e15dc0fd30 findings:6
Ruled: out-compliance-five-words-p14.txt sha256:043cf5e3dcf1 findings:5
Ruled: out-compliance-five-words-p15.txt sha256:37997a9cb74c findings:2
Ruled: out-compliance-five-words-p2.txt sha256:c199a75fa492 findings:0
Ruled: out-compliance-five-words-p3.txt sha256:cd23e42edd64 findings:2
Ruled: out-compliance-five-words-p4.txt sha256:ea16048e764f findings:2
Ruled: out-compliance-five-words-p5.txt sha256:2253ded9182b findings:3
Ruled: out-compliance-five-words-p6.txt sha256:1e04a9cef652 findings:0
Ruled: out-compliance-five-words-p7.txt sha256:9e52347d287c findings:6
Ruled: out-compliance-five-words-p8.txt sha256:93e70c7d1802 findings:4
Ruled: out-compliance-five-words-p9.txt sha256:bd9a5818920a findings:0
Ruled: out-compliance-plan-protocol-p1.txt sha256:d73650f6ef0f findings:4
Ruled: out-compliance-plan-protocol-p10.txt sha256:0ff2d26a7193 findings:3
Ruled: out-compliance-plan-protocol-p11.txt sha256:82be920ad465 findings:3
Ruled: out-compliance-plan-protocol-p12.txt sha256:a6f1ddb3781a findings:2
Ruled: out-compliance-plan-protocol-p13.txt sha256:870b49a06eff findings:5
Ruled: out-compliance-plan-protocol-p14.txt sha256:e3aa25c56d6d findings:5
Ruled: out-compliance-plan-protocol-p15.txt sha256:8110afdaec9e findings:4
Ruled: out-compliance-plan-protocol-p2.txt sha256:8deec550aad0 findings:2
Ruled: out-compliance-plan-protocol-p3.txt sha256:1a1c42d868df findings:4
Ruled: out-compliance-plan-protocol-p4.txt sha256:754cd630ae93 findings:2
Ruled: out-compliance-plan-protocol-p5.txt sha256:bce4b05c71b1 findings:2
Ruled: out-compliance-plan-protocol-p6.txt sha256:1e9db5eed74b findings:4
Ruled: out-compliance-plan-protocol-p7.txt sha256:a7aa3c802602 findings:3
Ruled: out-compliance-plan-protocol-p8.txt sha256:193f648dbdb1 findings:7
Ruled: out-compliance-plan-protocol-p9.txt sha256:028848c69fad findings:2

Board head is faa608ce6. `git diff --stat 8dba70e8e HEAD` shows one changed file (21 insertions, a backlog card), so no G3 file moved. Short names below: fw = five-words, pp = plan-protocol, MD = ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md.

2. TABLE (41 findings rated CRIT/HIGH/MED)
id | sev | verdict | reason
fw-p1#1 | CRIT | NOT-APPLICABLE | text is "none raised"; not a finding
pp-p3#1 | CRIT | NOT-APPLICABLE | text is "No CRIT BUG is raised"; not a finding
fw-p12#1 | HIGH | REFUTED | G1..G7 are local case labels in src/tests/parcel-tool-gate.logic.test.ts:25-53. Scorecard G7 is scored from a step's notes fences and its (scripts/analysis/step-validate.mjs:3026), never from this file.
fw-p13#1 | HIGH | REFUTED | operator "1 b 2 a" 2026-11-12 (route.ts:101-105): a hit with no evaluated option is served and not counted. A produced page that is evaluated counts: parcel-lookup-gate.infra.test.ts:342, :350, :383.
pp-p13#1 | HIGH | DUPLICATE | of fw-p13#1
fw-p14#1 | HIGH | REFUTED | FE-36 is in the register: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md:58 (FE-35 at :57). Only the header comment at nav-by-route.logic.test.ts:2-3 is stale (LOW).
fw-p7#1 | HIGH | NOT-APPLICABLE | "lock" is the step handbook's glossary term; Spec 127 does not make a surface check's "why" need a src/tests lock. The cited mobile test exists and asserts it: parcelSearchMatch.test.ts:178-187.
fw-p7#2 | HIGH | NOT-APPLICABLE | same as fw-p7#1. The zero-candidate to no_match case is at parcelSearchMatch.test.ts:122-125.
pp-p8#1 | HIGH | CONFIRMED | see D1
fw-p1#2 | MED | CONFIRMED | wording only, see D7
fw-p1#3 | MED | NOT-APPLICABLE | glossary "lock" governs steps. The PAGE.TABLE move to mobile CI is a recorded task conflict (pageTable.logic.test.ts:6).
fw-p11#2 | MED | REFUTED-BY-RULING | operator "all as recommmended" (MF-19 D-1..D-8, 2026-11-11), recorded in Spec 126:818 and cited at lot-size-entry.ts:5
fw-p12#2 | MED | NOT-APPLICABLE | B13 is the pre-existing lock label of a test re-homed at the Spec 122 §5.1 conversion (massing.logic.test.ts:396). No clause makes a lock title name a rule id.
fw-p12#3 | MED | REFUTED | A-8 OVERRIDE is an operator ruling of 2026-08-27 at scripts/link-massing.descriptor.json:358 and Spec 124:55. The knowingly-retired ledger rows are locked at src/tests/steps/link_massing/violations.test.ts:1241.
fw-p13#2 | MED | NOT-APPLICABLE | the reviewer could not see the criteria text; this is no finding about the code
fw-p14#2 | MED | REFUTED | FE-35 is in the register (:57), so there is no pending pointer to mark †
fw-p14#3 | MED | REFUTED | parcel-legacy-oracle.logic.test.ts:22 says "CONTRACT, S6 vocabulary". It claims no DISPOSITION_VOCAB. The header wording at :2 is loose (NIT).
fw-p3#1 | MED | NOT-APPLICABLE | the #NN glossary governs numbers in the step handbook's own hand-written parts. index.tsx:112 and disambiguate.tsx:48 cite NAV-AUDIT item numbers, not step invariants.
fw-p3#2 | MED | NOT-APPLICABLE | same glossary scope as fw-p1#3
fw-p7#3 | MED | CONFIRMED | see D6
fw-p7#4 | MED | REFUTED-BY-RULING | Spec 128:45 states that the generator resolves each number from its seed row "refusing a mismatch or an out-of-range value", after operator "yes follow the rules register them." (MD:1494)
pp-p1#1 | MED | REFUTED | no other palette class exists. A grep for slate, gray, neutral, stone, bg-black and text-white over lotMap.ts, parcelSearch.ts and the three bindings returns nothing. A whitelist would harden the test but nothing is wrong today.
pp-p1#2 | MED | DUPLICATE | of fw-p1#2
pp-p12#1 | MED | REFUTED | link-massing.infra.test.ts:21-37 pins the seed defaults 20 and 60 and bounds. The descriptor declares both at scripts/link-massing.descriptor.json:1332-1344. massing.logic.test.ts:602 is only a classifier unit test.
pp-p13#2 | MED | REFUTED | the boundary is pinned at src/tests/parcel-reset-label.logic.test.ts:23-25 (02:00Z gives 8 Dec, 05:00Z gives 9 Dec). The card asks for a date label, not a time.
pp-p13#5 | MED | NOT-APPLICABLE | the file is in the G3 list. No plan-protocol clause bars one file holding another task's block.
pp-p14#1 | MED | CONFIRMED | see D8
pp-p14#2 | MED | REFUTED | the placeholder is asserted on the slice at mobile/__tests__/parcelScreens.golden.test.ts:266. The content file holds it at content.json:17.
pp-p15#1 | MED | REFUTED-BY-RULING | the C-12 pin is task-384 AC#2 and card line 74. Operator, MD:1476: "Let the grounder resolve them all as long as the result is compliant".
pp-p4#1 | MED | NOT-APPLICABLE | the finding is about which rule list reads which file; it names no defect in the code
pp-p6#1 | MED | NOT-APPLICABLE | the principle governs recommendations. The five bounds say "NO SOURCE" in the descriptor itself, the values are unchanged, and the operator ruled "register them with bounds" (MD:1494). See Q1.
pp-p6#2 | MED | CONFIRMED | see D5
pp-p6#3 | MED | DUPLICATE | of pp-p8#2; the census mirrors the descriptor
pp-p7#1 | MED | REFUTED | the descriptor `config` has additionalProperties:false (surface.schema.json:2510-2512), so an unknown key is refused by the validator. The emitter filter at emit-mobile-surfaces.mjs:90 never sees it.
pp-p7#2 | MED | CONFIRMED | see D4
pp-p7#3 | MED | REFUTED | the vars bind to entitlement fields (SearchBinding.tsx:101-103). Those fields are in contract_parcels_entitlement's whitelist, and the search descriptor lists /api/parcels/entitlement in contract_ref (:79-82). The search whitelist covers the lookup response only.
pp-p8#2 | MED | CONFIRMED | see D3
pp-p8#3 | MED | REFUTED | `on_invalid: fail` describes the meter consumer, which refuses on a bad value (entitlements/index.ts:484-503). The same entry's `why` says the read contract degrades to null counts (:636-638). They describe two consumers, not a contradiction.
pp-p8#4 | MED | DUPLICATE | of pp-p9#1
pp-p8#5 | MED | CONFIRMED | see D3
pp-p9#1 | MED | CONFIRMED | see D2

3. CONFIRMED DEFECTS
D1. Stale metering block in the lookup contract (pp-p8#1, HIGH rating, doc-class).
- Rule: RR-0278 (MD:1082), "I should only be charged a report if I find the address and lot ... and a report is produced". The route follows it: route.ts:105-111 gives not_evaluated, semi_pending and not_produced before it counts.
- Where: scripts/surfaces/parcel_product/F02/contracts/contract_parcels_lookup.descriptor.json:762, `metering.why`. It still says "Each new lot a parcel_tool holder opens ... writes one usage_events row". The `unit` and `on_exceeded` fields and the evidence cites route.ts:124 and :132-137 have the same old shape. The same file's data_story was corrected to the page-produced rule.
- What happens: no customer is mischarged, since the route is right. Anyone reading the contract learns the wrong billing rule.
- Fix: rewrite metering.why to the data_story wording (counts only when `page` is produced; not_produced, semi_pending and not_evaluated count nothing). Update the evidence line cites to route.ts:105-111. Owner task-376 (FIX.SPECS). Line-size. Real impact is documentation only, but it is a billing contract.

D2. Rate limits are code literals (pp-p9#1, dup pp-p8#4).
- Rule: Spec 128 Rule 3 (:30): "every debounce, page size, stale time and rate limit is a registered logic variable with bounds and an on_invalid posture". Reinforced by Spec 128:45 and the operator, MD:1494: "yes follow the rules register them."
- Where: src/app/api/parcels/lookup/route.ts:59-60 (60 and 30 per minute) and src/app/api/parcels/entitlement/route.ts:25 (30 per minute). The descriptor `config.why` admits "not yet registered: the follow-up card ... moves them to admin settings".
- No card exists: a grep of backlog/tasks finds nothing for the follow-up. Task-378's scope was only D14 and D15.
- What happens: the caps cannot be changed without a deploy, and the promised follow-up is untracked.
- Fix: this is a new card, not a line fix. It needs 3 seed rows, a migration and the contract entries. Needs a decision (Q2). Owner would be task-378's follow-up.

D3. The lookup contract under-declares reads and over-declares a write (pp-p8#2, pp-p6#3, pp-p8#5).
- Rule: the descriptor's own inputs.tables and outputs.tables declare what the route touches.
- Reads: inputs.tables lists 7 tables (contract_parcels_lookup.descriptor.json). The route also reads `parcel_lot_form` (src/lib/parcels/lot-form.ts:31, :70, which supplies lotForm.unsure) and `parcel_buildings` (lot-map.ts:105, the has_footprint EXISTS). The "reads 9 tables" and "6 table(s)" counts disagree, and census/contracts.json:22003 mirrors the 9.
- Write: outputs.why says "writes 2 table(s)", listing user_profiles. That insert runs only under isDevMode() for 'dev-user' (get-user-context.ts:83-89), and data_story says "writes one".
- What happens: the generated data lineage misses two live reads and shows a dev-only write as a production write. No customer effect.
- Fix: add parcel_lot_form (owner_spec docs/specs/01-pipeline/78_optimal_lot_configuration.md) and parcel_buildings to inputs.tables. Recount the sentences. Drop user_profiles from outputs.tables or mark it dev-only, and say "writes 1". Regenerate the census. Owners: task-360 and task-336 (reads), task-376 (writes). Needs a decision on whether the report-page tables behind the web switch count (all read-only, switch off); otherwise line-size.

D4. Schema and generator disagree on a zero setting (pp-p7#2).
- Where: surface.schema.json:2686-2734 does not require a registration when debounce_ms or min_query_len is 0. emit-mobile-surfaces.mjs:51 requires an entry for any number. I ran pageSettingBounds({debounce_ms:0, min_query_len:0}, [], {}) and got two "no config.logic_variables entry" problems.
- What happens: latent. The converted mobile list has 4 surfaces and none uses 0, and `--check` is clean. A future converted surface with 0 would fail generation loudly.
- Fix: emit-mobile-surfaces.mjs:51 `if (typeof v !== 'number') continue;` becomes `if (typeof v !== 'number' || (v === 0 && (k === 'debounce_ms' || k === 'min_query_len'))) continue;`. Owner task-395. Line-size.

D5. Stale field count (pp-p6#2).
- Where: contract_parcels_lookup.descriptor.json data_story, and census/contracts.json, say "pick-by-name projection of 24 fields".
- The whitelist is 80 entries and has been since it grew past 24 (24 at 8753e6186, 80 now). The reviewer's "26" is also wrong.
- Fix: drop the number and point at inputs.field_whitelist. Owner task-364 (stale cites). Line-size.

D6. Wrong chain positions (fw-p7#3).
- Where: mobile_parcel_disambiguation_map.descriptor.json:112, :135, :151, :165. It gives parcels sources[1], parcel_address_points sources[3] and parcel_buildings sources[4].
- scripts/manifest.json chains.sources puts parcels at index 4, link_parcel_addresses at 8 and link_massing at 15. mobile_parcel_search says [4] and [8].
- What happens: wrong data-lineage metadata. No gate catches it, since `--check` passes.
- Fix: correct the four values and the matching census/mobile-product.json rows. Owner task-336. Line-size.

D7. Test title and comment say "three layout tables" (fw-p1#2, dup pp-p1#2).
- Where: mobile/__tests__/daylightSearchPages.golden.test.ts:7 and :43. Only two tables exist, PARCEL_SEARCH_LAYOUT and LOT_MAP_LAYOUT. The semi page has no layout constant (a grep finds none); its render trees are swept at the "every class in every render tree" case.
- Fix: "three" becomes "two" in both places. Owner task-322. Line-size. Wording only.

D8. Stale header in the search follow-ups test (pp-p14#1; fw-p14#4 is the same defect at LOW).
- Where: src/tests/surfaces/search-follow-ups.logic.test.ts:8-10 lists C.5 and C.7 as "not in the map field whitelist", but :106-110 asserts both fields (frontageStreet, hasFootprint) are in it (14 to 16, RR-0284).
- Fix: delete C.5 and C.7 from the "Not built here" sentence. Owner task-336 (task-364's remit). Line-size. Comment only.

Also seen, not rated as defects here: nav-by-route.logic.test.ts:2-3 still says FE-36 is "owed ... reserved" though it landed at Spec 135:58 (fw-p14#1 text). :6 says six exceptions but the list has five (fw-p14#5, LOW).

4. LOW/NIT ids recorded (none mis-rated as HIGH-class)
fw LOW: p1#4 p1#5 p10#1 p10#2 p11#3 p13#3 p13#4 p13#5 p13#6 p14#4 (= D8) p14#5 p4#1 p5#1 p5#2 p5#3 p7#5 p7#6 p8#1 (the route literals, = D2) p8#2 (the counts, = D3)
fw NIT: p11#4 p11#5 p15#1 p15#2 (the C-12 pin, settled by task-384 AC#2 and MD:1476) p4#2 p8#3 p8#4
pp LOW: p1#3 p1#4 p10#1 p10#2 p10#3 p11#1 p11#2 p12#2 p13#3 p13#4 p14#3 p14#4 p14#5 p15#2 p15#3 p15#4 p2#1 p2#2 p3#2 p3#3 p4#2 p5#1 p6#4 p8#6 p9#2
pp NIT: p11#3 p3#4 p5#2 p8#7
I peeked at two:
- fw-p8#4 (the golden capture fingerprints fewer files than screen-checks.mjs) is latent. mobile_parcel_search has no schema_ref (grep count 0).
- pp-p10#1 (migration 229 stated two ways in entitlements/index.ts:8 and :85) is a comment contradiction.

5. TOTALS (41 rated findings)
- Confirmed: 9 (pp-p8#1, pp-p8#2, pp-p8#5, pp-p6#2, pp-p9#1, pp-p14#1, pp-p7#2, fw-p7#3, fw-p1#2). These make 8 deduplicated defects, D1 to D8.
- Refuted: 13.
- Refuted-by-ruling: 3.
- Not-applicable: 12 (includes the two "none raised" CRIT lines).
- Duplicate (inside my share): 4.
- Duplicate-of-earlier: 0.
- Undetermined: 0.
- CRIT: both are "none"; no real CRIT. Billing, entitlement and meter claims (the three metering findings) were all re-executed and none shows a wrong charge.

Operator questions:
- Q1: Are the five page bounds marked "NO SOURCE" (debounce max 5000 ms, entitlement-stale max, retry range 0 to 10, the semi 1000 to 600000 range, and lookup_stale_ms) acceptable as envelope choices, or do you want specific numbers?
- Q2: Do you want the three lookup and entitlement per-minute rate limits (60, 30 and 30) registered as admin settings now under Spec 128 Rule 3 (needs a new card), or deferred until after launch?

6. UNVERIFIED
- I did not run the test suites or the DB; verdicts come from reading code and tests plus `--check` (emit-mobile-surfaces: "surfaces ok").
- Reviewer line numbers are offset from the files. massing.logic.test.ts:598 is really :602, so I judged by content.
- The census/contracts.json mirrors (:22003) were checked by string only, not regenerated.
- One extra observation outside any finding in my share. The code reads three allowance variables (entitlements/index.ts:433-437: plan, trial and pro), but both contract descriptors' config.logic_variables declare only plan and trial, and their `why` says "the two monthly allowances". Pro (migration 322, MF-47) is undeclared against Spec 128 Rule 3's "presence". I did not confirm whether a gate requires it. It needs a ruling on whether to add the pro entry; owner would be task-395 or MF-47.
