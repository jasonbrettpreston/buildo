Grounder: Cairn-Ground-G3B
Ruled: out-compliance-mobile-90-p1.txt sha256:d0a6725d5b61 findings:6
Ruled: out-compliance-mobile-90-p2.txt sha256:56952af83790 findings:5
Ruled: out-compliance-mobile-90-p3.txt sha256:0f1be4b59e8c findings:1
Ruled: out-compliance-mobile-90-p4.txt sha256:bc70a4638714 findings:5
Ruled: out-compliance-mobile-90-p5.txt sha256:c6c9c84849f9 findings:3
Ruled: out-compliance-mobile-98-p1.txt sha256:bb378cf8e53d findings:3
Ruled: out-compliance-mobile-98-p2.txt sha256:80205d48687a findings:4
Ruled: out-compliance-mobile-98-p3.txt sha256:3a7d7cb64390 findings:4
Ruled: out-compliance-mobile-98-p4.txt sha256:a9810da71394 findings:3
Ruled: out-compliance-mobile-98-p5.txt sha256:629a3470e318 findings:2
Ruled: out-compliance-mobile-99-p1.txt sha256:bcc943af2b25 findings:1
Ruled: out-compliance-mobile-99-p2.txt sha256:3cf686168529 findings:2
Ruled: out-compliance-mobile-99-p3.txt sha256:690db6f958e9 findings:3
Ruled: out-compliance-mobile-99-p4.txt sha256:40fe1204ee40 findings:2
Ruled: out-compliance-mobile-99-p5.txt sha256:23fabe939d62 findings:4
Ruled: out-compliance-mobile-99-p6.txt sha256:f1f0059cfcb5 findings:3
Ruled: out-compliance-mobile-99-p7.txt sha256:9c1e30b5446e findings:0
Ruled: out-compliance-mobile-99-p8.txt sha256:1afdb7aa6408 findings:1
Ruled: out-compliance-mobile-99-p9.txt sha256:bd75154040cf findings:7
Ruled: out-compliance-mobile-99-p10.txt sha256:6ccfb25212ad findings:5
Ruled: out-compliance-mobile-99-p11.txt sha256:8dc345b70be1 findings:2
Ruled: out-compliance-mobile-99-p12.txt sha256:3b4c944ef927 findings:1
Ruled: out-compliance-mobile-99-p13.txt sha256:3f9831fbb4c7 findings:2
Ruled: out-compliance-mobile-99-p14.txt sha256:d34c8eba3592 findings:4
Ruled: out-compliance-mobile-99-p15.txt sha256:a48375302f48 findings:1
Ruled: out-compliance-mobile-99-p16.txt sha256:aedf140928df findings:2
Ruled: out-compliance-mobile-99-p17.txt sha256:bceefc6ed0f1 findings:2
Ruled: out-compliance-mobile-99-p18.txt sha256:ab90da64a87c findings:1
Ruled: out-compliance-step-132-p1.txt sha256:baf8a34a960a findings:4
Ruled: out-compliance-step-132-p2.txt sha256:7f3f20c0bf16 findings:7
Ruled: out-compliance-step-132-p3.txt sha256:0d171fe7b85b findings:3
Ruled: out-compliance-step-132-p4.txt sha256:609948eb262b findings:7
Ruled: out-compliance-step-132-p5.txt sha256:0cde24ceb10f findings:5

Method: every claim re-read against the files at board tip faa608ce6 (git diff --stat 8dba70e8e HEAD over mobile, src/lib/parcels, scripts/surfaces, src/tests printed no G3 change). Ids are `<pN>#k` under their Spec number (99-p9#1 = out-compliance-mobile-99-p9 finding 1). Three outputs raised no CRIT. Two lines are not findings: 99-p10#1 ("none raised"), 99-p12#1 and 99-p14#1 ("none"); 132-p1#1 ("severity=none is not used") likewise. No tests were run (rule); where a claim rests on TanStack runtime behaviour it is marked UNVERIFIED.

== 2. CRITICAL/HIGH/MED table (45 ids) ==
90-p2#1 | MED | REFUTED | reportScreens.golden.test.ts:80 needs one base `text-<report colour>` token; a `dark:` twin beside it passes; Daylight pages are one look by 117 §6.1 note 2026-11-10 (P35-D2 a: same values under :root and .dark:root)
90-p2#2 | MED | REFUTED-BY-RULING | the Toronto-only string rule and intersection shape are operator ruling 2026-09-16 (b); mobile_parcel_search.descriptor deviations[0] (programme D-7) and [1] (P35-D14 a, Wave 1 batch item 13). Spec 90 §3 bans PostGIS math/sorting; a regex on a typed string is neither
90-p3#1 | MED | REFUTED | Spec 90 §7 text is "Mutations (like saving a lead)"; the Continue call is a metered GET lookup run as a mutation (useParcelLookup.ts:130-140 states why networkMode 'always'); queuing it would hold the page busy offline; app persists queries only (mobile/app/_layout.tsx:503 dehydrateOptions, no mutation persist). Same view in BL-FIXSEMI TRIAGE R2/R12 (lane, not a grounder)
90-p4#1 | HIGH | REFUTED-BY-RULING | parcelSearch.ts:133-135 pins light = dark by design: Spec 117 dated note 2026-11-10 (P35-D2 a, operator "approved except for 9", 117:308) generates the RNR theme with identical values under :root and .dark:root; look is operator-ruled Daylight (task-322 card: open-questions.md:1098 "love it... go with modern"). Spec 90 §2/117 §3.4 wording not amended: see Q6
90-p4#2 | MED | DUPLICATE | of 90-p3#1
90-p5#1 | MED | CONFIRMED | D1: schemas.ts:422-428 ParcelLotFormSchema `.strict()` on an additive_only contract
90-p5#2 | MED | UNDETERMINED | parcelSearchMatch.ts:199-208 shim runs only when `resolution` absent; server now always sends it (lookup-flow.ts:42,53,66,94); Q5
98-p1#1 | MED | REFUTED-BY-RULING | props goldens are the ruled "golden render states": Spec 135 FE-03 (operator "Q-MFP a"), Spec 126 §11b.2 note 2026-11-10 "one props golden per state per target"; Spec 98 §4 note 2026-11-10 excepts smoke/behaviour. Goldens sit under src/tests/fixtures/surfaces, compared as props JSON, not rendered snapshots
98-p2#1 | HIGH | CONFIRMED | D2: parcelSearchMatch.ts:351 `&& !isFetching`; test pins the flip at parcelSearchMatch.test.ts:417. Mis-rated: impact is a one-off hide of the miss line on a same-key refetch
98-p2#2 | MED | CONFIRMED | D4: reportScreen.gateStability.behaviour.test.tsx:32-38 has no row for the held unsure lot (`ask` true, [parcelId].tsx:30-33)
99-p10#2 | MED | NOT-APPLICABLE | §7.2 governs `queryClient.invalidateQueries` calls; git grep finds none in any G3 file (hooks, pages, bindings, lib)
99-p11#1 | MED | REFUTED-BY-RULING | block order/presence in code is binding config under deviations[0] "Spec 126 §5.3 server-projected screen" (programme D-7, 2026-11-09); task-390 is the declared pilot for table-driven pages, semi page only
99-p11#2 | MED | REFUTED-BY-RULING | SearchBinding derived names (segments, candidate_count, label, recent) are deviations[1] (P35-D14 a); lot letters/pin/polygons are mobile_parcel_disambiguation_map deviations[0] ("lot letters" named, same ruling plus 2026-11-11 operator words)
99-p13#1 | HIGH | REFUTED | useParcelLookup.ts:82,106,167 gate on `!!accessToken`; the real field is accessToken (authStore.ts:69, renamed from idToken in Spec 93 SDK swap commit f1473bc95; sibling hooks useLeadDetail.ts:84, useUserProfile.ts:68, useFlightJobDetail.ts:82 do the same). Token changes value only on refresh, stays truthy: not "toggling continuously". Spec 99 §3.2 (line 146) is stale on the field name: a Spec 99 text drift outside G3's files
99-p13#2 | MED | REFUTED | key stays ['parcel-lookup', parcelId] so row 99:235 "depends ONLY on parcelId" holds; `semi` varies the request only, documented at useParcelLookup.ts:95-101 (task-360, RR-0278). Residual: UNVERIFIED item 1
99-p14#2 | MED | REFUTED | the old dark tables are live: PARCEL_SEARCH_TOKENS account.tsx:25; TRACKED_LOTS_HEX tracked.tsx:40, TrackedLotRow.tsx:21; PARCEL_SHELF_HEX _layout.tsx:37, ParcelShelf.tsx:44. task-322 restyled four pages (search, lot map, list, semi), not Account/Tracked/shelf; daylightSearchPages.golden.test.ts:8 says so
99-p15#1 | MED | DUPLICATE | of 98-p2#1
99-p17#1 | HIGH | CONFIRMED | D3: semiQuestion.ts:74 `if (isFetching) state = 'loading'` and semi-question.tsx:46 / useParcelPageHooks.ts:18; unenumerated under 99 §6.5. Mis-rated: see D3
99-p3#1 | HIGH | CONFIRMED | D5: no Spec 99 text names the parcel-tool navigation effects (grep "redirect|parcel-tool|semi" in 99 finds none); §1 and §5.1 require pattern or amendment. Doc gap, no user effect
99-p5#1 | HIGH | DUPLICATE | of 99-p13#1 (mock `accessToken` at parcelSearchScreen.behaviour.test.tsx:33 is the real store shape)
99-p5#2 | MED | DUPLICATE | of 99-p3#1 (reportScreen.mount test :113 pins the semi redirect)
99-p5#3 | MED | REFUTED | index.tsx:53-58 callback is a useCallback (stable); the stub `useEffect(cb,[cb])` re-runs only when identity changes. §6.4 title and text cover router effects; a focus refetch is not a router effect. True residual: the mock is signed-out so the token gate is not exercised (test note, LOW)
99-p6#1 | MED | DUPLICATE | of 98-p2#2
99-p9#1 | HIGH | DUPLICATE | of 99-p13#1 (index.tsx:51)
99-p9#2 | MED | DUPLICATE | of 99-p3#1
99-p9#3 | MED | REFUTED | `setQueryData` of a server result into the report's own key (useParcelLookup.ts:117-123) is B1 (server to TanStack); the Continue call now runs through useMutation after task-373 (BL-COMPLY D5 confirmed and fixed); no second store
99-p9#4 | MED | DUPLICATE | of 99-p13#2
132-p1#2 | MED | REFUTED | programme-items.json:1516 is generator-refreshed: generate-logic-variable-groups.mjs:1447-1454 rewrites "N of M" each run; 1091 equals the seed's key count (node count 1091); text says "refreshed by that generator on every regeneration"; change made in 29912ef52 by that route
132-p1#3 | MED | UNDETERMINED | disambiguation_map adjudicated_by cites date + batch item, no `<log stem>#id`; same shape programme-wide (docs/reports/decisions ends at 2026-11-12 batch-bf, no MF-45/Wave 1 log); Spec 132 x-v3.2 defers citations on converted deviations to the RE-FREEZE night; Q4
132-p2#1 | HIGH | CONFIRMED | D6: stale prose only; mis-rated
132-p2#2 | HIGH | UNDETERMINED | candidate cap 10 (parcelSearch.ts:22) is not in config.logic_variables; Q3
132-p2#3 | MED | CONFIRMED | D7
132-p2#4 | MED | DUPLICATE | of 132-p1#3 (also deviations[2] scratch path)
132-p2#5 | MED | CONFIRMED | D8
132-p3#1 | MED | DUPLICATE | of 132-p2#2 (entitlement route 30/min literal, route.ts:25)
132-p3#2 | MED | REFUTED | no contradiction: reader throws on out-of-bounds (index.ts:~478-486, on_invalid fail) and readParcelToolUsage catches ReportLimitsMissingError, logs, returns null counts (index.ts:653-657); the descriptor describes both layers
132-p4#1 | HIGH | CONFIRMED | D9
132-p4#2 | HIGH | DUPLICATE | of 132-p2#2 (route.ts:57-60 literals SLOW_QUERY_MS 500, 60, 30, LIMIT 11/10 at parcel-lookup.ts:257,298,329,359); config.why itself admits "not yet registered"
132-p4#3 | MED | CONFIRMED | D10
132-p4#4 | MED | NOT-APPLICABLE | core.15 governs frozen enum values and `execution.*` declarations; schema requires `check_id` on every limitation (surface.schema.json limitations required ["what","measured","check_id"]); a11y value stays UNRESEARCHED/descriptive
132-p4#5 | MED | DUPLICATE | of 132-p1#3 (deviations[0] scratch path; its sibling deviation does cite RR-0331)
132-p4#6 | MED | REFUTED | surface.schema.json:276-278 `blocking` is "ORTHOGONAL to severity... forces when:'pre'", i.e. a pre-render gate flag, not a verdict switch; FAIL + when:post + blocking:false is the schema's own post-assertion form
132-p5#1 | MED | REFUTED | thresholds are seed-locked in src/tests/link-massing.infra.test.ts:21-37 (default 20 and 60, bounds); seed rows exist (logic_variables.json:1398,1408); control-panel.logic.test.ts:396-397 lists them
132-p5#2 | MED | DUPLICATE-OF-EARLIER | the gap is recorded: scripts/steps/_schema/rule-map.json:7685 (R-EW partial: only coa locks through the real dispatch; older hand-built locks pinned on R-EW-LOCKS)
132-p5#3 | MED | NOT-APPLICABLE | core.7 covers "a rule kept inside compute"; B13 is a tombstone for a retired path, not a kept rule

== 3. CONFIRMED DEFECTS ==
D1. 90-p5#1. Rule: Spec 90 §13 (Zod boundary, no drift crash) and the lookup contract's own claim: contract_parcels_lookup.descriptor.json versioning "additive_only ... adding fields does not [break shipped clients]"; schemas.ts:370,401 says plain objects so "a server-added field never raises ParcelLookupSchemaError". Where: mobile/src/lib/schemas.ts:422-428 (`ParcelLotFormSchema ... .strict()`, closed enums detected/basis). What happens: if the server adds any key to `lotForm`, every installed phone fails the whole lookup parse (fetchParcelLookup throws ParcelLookupSchemaError) and shows the error state on search, report and semi pages. The server schema is also strict (types.ts:135-141), so it is a latent trap for the next additive change, not a live failure today. Fix: delete `.strict()` at schemas.ts:428 (closed enums are a design call, see LOW). Owner: task-319 (SEMI lot form schema; file homes 320,336,351,411). Size: one line plus a lenient-parse case in the schema test. Impact: none today; a future additive field would take down the report flow on old builds.
D2. 98-p2#1 / 99-p15#1 (/ 98-p5#1 LOW). Rule: Spec 99 §6.5 (gate conditions must be stable, no unenumerated isFetching carve-out; enumeration lists only AppLayout) and Spec 98 §4.1/§8.3. Where: mobile/src/lib/parcelSearchMatch.ts:351 `showMiss: outcome === 'no_match' && !isFetching && error == null`; the test pins the flip at mobile/__tests__/parcelSearchMatch.test.ts:412-417. The `!isFetching` term is redundant for a new query (data undefined gives outcome 'idle', deriveMatchType:184) and only acts on a refetch of a settled miss, where the miss line vanishes then returns (SearchBinding.tsx:215 tail). Fix: delete `&& !isFetching` at :351; flip the assertion at test :417 to `toBe(true)` (stability). Owner: task-320 (file homes 320,351). Size: line-size. Impact: small flicker of "no match" on reconnect/stale refetch; the HIGH rating overstates it.
D3. 99-p17#1 (98-p5#1 same family). Rule: Spec 99 §6.5 literal ("never gate on isFetching"; carve-outs must be enumerated in the same commit). Where: mobile/src/lib/semiQuestion.ts:74 (`if (isFetching) state = 'loading'; else redirect`) and useSettledRedirect(situation.navigate, isFetching) at semi-question.tsx:46, same hook in [parcelId].tsx:27, disambiguate.tsx:35, index.tsx:94-103. §6.5 has one enumerated carve-out (AppLayout expired). Real flip: only with `data` undefined and no error, i.e. query disabled or paused offline; an offline cold deep link to the semi page then redirects to the search tab on a non-settled frame (UNVERIFIED item 2). The flicker-loop shape of incident 3 is not present (data-defined cases never read isFetching). Mis-rated HIGH; real impact LOW. Fix options need a decision (Q1): (a) gate on a settled signal (status !== 'pending' / isFetched) at semiQuestion.ts:74 and the hook; (b) enumerate the redirect-once and miss-line uses in Spec 99 §6.5. Owner: task-361 (semiQuestion.ts) and task-381 (hook). Size: line-size either way.
D4. 98-p2#2 / 99-p6#1. Rule: Spec 98 §4.1 §8.3 / Spec 99 §8.3 "each render gate ... MUST have a test asserting toggling isFetching does NOT flip the gate". Where: reportScreen.gateStability.behaviour.test.tsx:32-38; the gate has a fifth branch (SRCH.METER-2 held lot: `ask` makes `data` undefined for reportScreenState, [parcelId].tsx:30-33) with no row. isFetching is not in that gate, so it holds by construction; the gap is the missing test. Fix: add one row `['the held unsure lot', {…hit(null), lotForm:{detected:'semi_half',basis:'doubt_multi_parcel_abut',unsure:true}}, false]`. Owner: task-373 (file) / task-360 (branch). Size: line-size. Impact: none today; guard against a later regression.
D5. 99-p3#1 / 99-p5#2 / 99-p9#2. Rule: Spec 99 §1 "a new routing `useEffect` requires either matching an existing pattern in §3-§5 or amending this spec"; §5.1 "exactly TWO routing boundaries"; line 783 requires a WF1 amendment for §5 changes. Where: the settled-redirect effects (useParcelPageHooks.ts:12-24; semi, report, disambiguate pages; search page index.tsx:94-103; report semi redirect). They pre-date task-381 (it only merged copies). Spec 99 has no note naming them (the BL-HOOKS3 triage reworded the hook's cite to §6.5 only; no grounder ruled it). Fix: dated note in Spec 99 §5 (new §5.5): the parcel-tool pages may navigate once per settled outcome through useSettledRedirect; dependency arrays name the route string, not a store field. Owner: task-381. Size: document-only, needs the §5 amendment route (Q2). Impact: none on users; a standing spec-vs-code mismatch.
D6. 132-p2#1 (mis-rated HIGH). Rule: Spec 132 core.14 "Declared equals witnessed" (reached only through the path pattern, so the fact only). Where: scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.descriptor.json notes (ENTITLEMENT vs OD5, dated 2026-09-16: "`guards.entitlement.product` is `lead_gen`") against guards.entitlement.product "parcel_tool" (line 222) and deviations[2] (2026-11-11, MF-45 D-4 a: declared parcel_tool, transitional lead_gen path). The structured fields agree with the deviation; the 2026-09-16 prose and x-draft.measured_gate are stale history. Fix: append "Closed 2026-11-11 (MF-45 D-4 a, see deviations[2])" to that notes paragraph; descriptor edits move the capture fingerprint, so do it on the next re-freeze. Owner: task-320/351/378/395 (file homes). Size: line-size. Impact: reader confusion only.
D7. 132-p2#3. Where: mobile_parcel_semi_question.descriptor.json render.projection "none" beside a populated render.list and docs.under_126 "LIST (three radio cards ...)"; the search sibling says "list". Fix: projection "none" to "list" (schema allows both; validator passes). Origin cfb4dffee (SEMI-B). Owner: task-378/395 home. Size: one line, re-freeze. Impact: none.
D8. 132-p2#5. Where: mobile_parcel_search.descriptor.json docs.data_story "It holds no client store at all" and docs.under_126 "no Layer-3 state" against state.answer "mmkv" with field `recent` (recentSearchesStore, MF-35). Fix: reword both to name the Layer 4a recent-searches store. Owner: task-320/351/378/395 home. Size: two prose lines. Impact: none.
D9. 132-p4#1 (mis-rated HIGH). Rule: surface.schema.json emits "none ... On a metered surface this is a rule-9 violation (R-23)"; core.14. Where: contract_parcels_lookup.descriptor.json emits {answer:"none", why:"... no ledger INSERT", ledger_events:[]} while metering.answer "metered" and data_story say one usage_events `property_view` row is written (insert at src/lib/entitlements/index.ts:508-512, called from route.ts:132-137; the INSERT is in the library, so "route.ts contains no INSERT" is literally true but the conclusion is false). surface-validate --check passes (it does not cross-check emits against metering). Fix: emits.answer "ledger", ledger_events ["property_view"], evidence index.ts:494-514, rewrite why. Owner: task-334 (METER) / MF-45; file homes 123,266,319,338,376,378,383. Size: line-size, re-freeze. Impact: the registry and census under-report the meter write; no user effect.
D10. 132-p4#3. Where: same descriptor, hand-typed counts that disagree with their arrays: inputs.why "reads 6 table(s) ... 4 materialised" vs inputs.tables length 7; data_story "reads 9 tables" and "24 fields"; field_whitelist_parity why "pick-by-name of 4 field(s)" vs inputs.field_whitelist length 80. Fix: restate each from its array (no new mechanism). Owner: task-376/378/383 home. Size: three prose lines. Impact: none.

== 4. LOW/NIT recorded ==
90: p1#1-#6 LOW (p1#4 lotMapPage.behaviour smoke builds error inputs with no error: a real test gap, not verified further; LOW stands); p2#3-#5 LOW; p4#3-#5 LOW; p5#3 LOW (closed `resolution` enum on additive_only contract: same family as D1, arguably MED; raise to the D1 fix task).
98: p1#2-#3, p2#3-#4, p3#1-#4, p4#1-#3 (all "cannot see" or reading-chunk limits), p5#1 (dup of D2), p5#2 (closed `kind` enum, same family as D1; binding throws on unplaced parts by design at ReportBinding).
99: p1#1, p2#1-#2, p3#2-#3, p4#1-#2, p5#4, p6#2-#3, p8#1, p9#5-#7(#7 NIT), p10#3-#5 (#5 NIT), p14#3-#4, p16#1 (NIT) #2, p17#2, p18#1. No-finding lines: p7 (0), p10#1, p12#1, p14#1.
132: p1#4, p2#6-#7, p3#3 (said "HIGH if `blocking` is not a schema field": it is, surface.schema.json:276; stays LOW/refuted), p4#7, p5#4-#5.
Mis-rated down: 98-p2#1, 99-p17#1, 132-p2#1, 132-p4#1 (HIGH, real impact LOW). Mis-rated up: none; 90-p5#3 and 98-p5#2 sit next to D1.

== 5. Totals and operator questions ==
Of 45: CONFIRMED 10 (D1 90-p5#1; D2 98-p2#1; D3 99-p17#1; D4 98-p2#2; D5 99-p3#1; D6 132-p2#1; D7 132-p2#3; D8 132-p2#5; D9 132-p4#1; D10 132-p4#3) | REFUTED 11 | REFUTED-BY-RULING 5 | NOT-APPLICABLE 3 | DUPLICATE 12 (in-share, to the ids above) | DUPLICATE-OF-EARLIER 1 (132-p5#2) | UNDETERMINED 3 (90-p5#2, 132-p1#3, 132-p2#2). No finding is a money, auth or wrong-number defect; the meter, entitlement and rate paths checked (lookup route, readParcelToolUsage) behave as the descriptors claim apart from stale prose.
Q1. Spec 99 §6.5: should the redirect-once and the search miss line be added as enumerated isFetching carve-outs, or move to a settled-signal gate in code (D2, D3)?
Q2. May a dated note in Spec 99 §5 register the parcel-tool settled-redirect pattern (D5)?
Q3. Must the lookup/entitlement rate limits (60 and 30 per minute), SLOW_QUERY_MS, LIMIT 10/11 and the candidate cap of 10 become registered settings now (Spec 128 rule 3 table "page size ... rate limit"), or wait for the follow-up card the descriptor names? I found no such card in backlog/tasks.
Q4. Commit the McFrontend-era operator rulings (open-questions.md records, scratch paths) as docs/reports/decisions logs and cite log ids from deviations[], or keep quote-plus-date form until the RE-FREEZE night (x-v3.2)?
Q5. Delete the pre-MF-53 count-based shim in deriveMatchType (parcelSearchMatch.ts:199-208) now that the server always sends `resolution`?
Q6. Should Spec 90 §2 and Spec 117 §3.4 be reworded to say the Daylight pages are one light look in both system modes (code and 117:308 already say so)?

== 6. UNVERIFIED ==
1. Semi-answered cached-data case: a deep link to /parcel-tool/[id]?semi=answered while the persisted cache holds a fresh (under 60 s) unanswered lookup would skip the semi=answered request (key unchanged) and show the miss text; the normal Continue flow stores the answered result first. Not run; no mobile runner.
2. TanStack v5 behaviour that an offline-paused first fetch gives isFetching false with data undefined (basis for D3's real flip) is from library knowledge, not run.
3. Whether the server counts a second semi=answered lookup twice (BL-FIXSEMI R18 also left this open).
4. Spec 99 §3.2 and §4 wording drift (idToken vs accessToken) sits in a document, outside G3's files; owner not traced.
5. Whether the F01/F02 descriptor edits in D6-D10 can land without a capture re-freeze: x-v3.2 says deviations edits move the fingerprint; I did not run the capture check.
6. 90-p1#4 and the other LOW test-gap claims were not followed to the code.

### Critical Files for Implementation
- /Users/brettpreston_macmini/Buildo-wt-board/mobile/src/lib/schemas.ts
- /Users/brettpreston_macmini/Buildo-wt-board/mobile/src/lib/parcelSearchMatch.ts
- /Users/brettpreston_macmini/Buildo-wt-board/mobile/src/lib/semiQuestion.ts
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/surfaces/parcel_product/F02/contracts/contract_parcels_lookup.descriptor.json
- /Users/brettpreston_macmini/Buildo-wt-board/mobile/__tests__/reportScreen.gateStability.behaviour.test.tsx
