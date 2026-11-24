Grounder: Cairn-Ground-G3E
Ruled: out-engineering-eng-all-p1.txt sha256:56bf5eb5ec5f findings:5
Ruled: out-engineering-eng-all-p2.txt sha256:e193ac982c29 findings:2
Ruled: out-engineering-eng-all-p3.txt sha256:0339e1696250 findings:4
Ruled: out-engineering-eng-all-p4.txt sha256:1d9dce3d3c6f findings:2
Ruled: out-engineering-eng-all-p5.txt sha256:55250c6a6785 findings:4
Ruled: out-engineering-eng-all-p6.txt sha256:f1cc974cb989 findings:4
Ruled: out-engineering-eng-all-p7.txt sha256:26233ad7c424 findings:3
Ruled: out-engineering-eng-all-p8.txt sha256:26d93cf00ae9 findings:6
Ruled: out-engineering-eng-all-p9.txt sha256:cbe38ffb5865 findings:3
Ruled: out-engineering-eng-all-p10.txt sha256:a9c09a3080e2 findings:7
Ruled: out-engineering-eng-all-p11.txt sha256:a4099042e6a8 findings:5
Ruled: out-engineering-eng-all-p12.txt sha256:4f6008ae8d35 findings:5
Ruled: out-engineering-eng-all-p13.txt sha256:36f20440b07c findings:6
Ruled: out-engineering-eng-all-p14.txt sha256:8ad607d4a9d8 findings:7
Ruled: out-engineering-eng-all-p15.txt sha256:66590120358f findings:4
Ruled: out-engineering-eng-all-p16.txt sha256:a17b4087fb3c findings:4
Ruled: out-engineering-eng-all-p17.txt sha256:81df24200744 findings:4
Ruled: out-engineering-eng-all-p18.txt sha256:840c939f82d4 findings:4
Ruled: out-engineering-eng-all-p19.txt sha256:3a38e0fb6ef1 findings:3
(82 findings in all: 52 CRITICAL/HIGH/MED, 30 LOW/NIT. No CRITICAL. 12 HIGH, 40 MED. HEAD is faa608ce6; git diff --stat 8dba70e8e HEAD on the 52 files is empty. Ids below drop "out-engineering-eng-all-". Standard = docs/specs/00_engineering_standards.md, "Std".)

SHORT KEYS used in the table
- D4 = G2 typed-factory conformity gap (mcfixreborn-g2/GROUNDER-B.md D4, eng-all-p2#1). Fact confirmed here: none of the 26 G3 test files imports src/tests/factories.ts. Std 5.1 :99-100 says "MUST always import typed factories". Factories do exist for Parcel, Entitlement and ParcelBuilding (factories.ts:354, :220, :578); most G3 fixtures are wire-JSON shapes.
- BANG = G2 D6 / G2 eng-all-p3#3 (NOT-APPLICABLE). The undocumented-`!` mirror test src/tests/non-null-assertion-comment.logic.test.ts excludes src/tests/** by design (:14). It pins mobile/.../LotMapBinding.tsx at 2 undocumented `!` (:~67). A `!` that hits undefined in a test makes the test throw, never pass.
- LAYER = G2 eng-all-p1#2 (REFUTED: file-name layer question). Infra tests for the routes exist (parcel-lookup-gate.infra.test.ts, consumer-parcel-lookup.infra.test.ts, parcels-entitlement.infra.test.ts). The claimed logic-named tests run in the default run either way.
- G1B = mcfixreborn-g1/GROUNDER-B.md eng-front#2 and D4/D5 (Std 1.3 versus Spec 91/117 fixed palette and mono labels: decision).

2. TABLE (CRITICAL/HIGH/MED)
p1#1 | HIGH | DUPLICATE-OF-EARLIER (BANG); TypeError claim REFUTED | LotMapBinding.tsx:161 `s.map!.lots[i]!` is undocumented (pinned at 2 in the mirror test). But cards() is called only in the multi_parcel case (:248), and lotMap.ts:104-107 reaches that state only when `map` is non-null, with `lots` built from map.lots (:97). So map and lots[i] exist by construction and nothing throws.
p1#2 | MED | REFUTED | LotMapBinding.tsx:201 findIndex cannot be -1. The third branch needs route!==null and selectedLetter!==null, which means selectedParcelId is in lots (lotMap.ts:112-114, :125-126).
p2#1 | MED | REFUTED-BY-RULING | contracts.json:22822-22827 records the deviation with "adjudicated_by operator 2026-11-20, RR-0331", MD:1431 "leave the meter where it is?", MD:1432 "2. y 1 a". Brief item: meter stays in the route.
p3#1 | HIGH | REFUTED-BY-RULING | web-product.json:5592-5593 is an honest "limitations" record for web report files (ReportPage, ReportView, ReportPageToggles), none of them a G3 file. The public web report is not live until launch (RR-0438, MD:2253-2254). C-9 is a golden-node check by design (surface-conformance.logic.test.ts:632-662). Real 44 px of those three files is not read here (see UNVERIFIED).
p3#2 | MED | REFUTED | The page table (static-page.json) carries no CSS by design (schema comment: class tables stay typed per platform). C-9 and C-9m judge the golden nodes the table renders (surface-conformance.logic.test.ts:632-662, :889), so a button or cta without a 44 px size fails there.
p3#3 | MED | REFUTED-BY-RULING | Std 13.5 names a PostHog flag. DUPLICATE-OF-EARLIER: docs/reports/lanes/2026-11-20/BL-COMPLY/GROUNDER.md:233 (F-166 "REJECTED:ruling": the ruled gate is the web live switch alone, ONE-35 b, RR-0271) and G2 eng-shared-p2#2 (MD:1245, :1403, :2254). surface.schema.json:1238-1249 accepts flag "none".
p5#1 | HIGH | REFUTED-BY-RULING | Same ruling as p3#3. The phone page is gated by the parcel_tool entitlement (descriptor guards :222-229 `on_missing 403`) and not by a PostHog flag. flag "none" is a schema-legal value (surface.schema.json:1244). No phone-specific flag ruling found: see question Q2.
p5#2 | MED | REFUTED-BY-RULING | dark_mode "hardcoded" (descriptor :403) is the fixed Daylight palette, not zinc-950. Operator, task-322 card line 47: "Just looking at the small pages - love it! Let's go with modern." (open-questions.md:1098, R-D1). lotMap.ts:6-7 and :153 (`userInterfaceStyle 'light'`) follow it. Also G1B decision class.
p6#1 | HIGH | DUPLICATE of p5#1 | Same claim and ruling, semi page descriptor :158.
p6#2 | MED | REFUTED-BY-RULING | Same Daylight ruling as p5#2 (search and semi descriptors). Also G1B.
p6#3 | MED | REFUTED | The descriptor-to-seed drift is gated. The emitter throws on a difference (emit-mobile-surfaces.mjs:47-64, tested at surface-conformance.logic.test.ts:1079-1092). The server Zod range 3..120 (lookup/types.ts:42) is pinned to the seed min/max by surface-conformance.logic.test.ts:1031-1033.
p6#4 | MED | NOT-APPLICABLE | Std 10.2 (:223-224) is "Boundary Rules During Frontend Phase": do not "change how data enters the database". The descriptor tree location is set by Spec 126:145, `scripts/surfaces/<scope>/<kind>/<id>.descriptor.json`. Also G2 eng-shared-p1#2.
p7#1 | MED | CONFIRMED (conformity, low impact) | See C3.
p8#1 | MED | REFUTED | The descriptor only records the literals. The map radius and limit bounds come from ONE source, the seed: lot-map.ts:13, :62-66 (SEED_BOUNDS from logic_variables.json) fails closed outside them. The seed default is pinned (parcel-lookup-resolution.logic.test.ts:242). The route caps (LIMIT 11/10, 60/min, 30/min) are recorded as a ruled follow-up, descriptor :779 ("DECISIONS-v3 item 2 b ... the follow-up card moves them to admin settings"). Std 11 is a plan checklist.
p8#2 | MED | REFUTED-BY-RULING | The server-built `page` is the ruled design: Spec 100 dated notes at :119 and :142 (MF-48 Stage B), operator "Ball y" B-1..B-7. Descriptor data_story (:6) cites it. Std 4.4 applies, but the operator ruled this shape. The descriptor deviations[] lacks an entry for it (cosmetic, see Q3).
p8#3 | MED | UNDETERMINED | See Q1. The SQL projects an explicit list (allMappedColumns, src/lib/admin/parcel-lookup.ts), not `SELECT *`. The 24-field whitelist plus the .strict() boundary parse are the guard. The descriptor itself flags the width as CAVEAT 1. That caveat predates the group (commit 8753e6186, 2026-09-15) and the code is not a G3 file.
p8#4 | MED | REFUTED | fetchCoaProjects has `LIMIT 20` (src/lib/admin/parcel-lookup.ts:388-393) and a NULL-neighbourhood guard (:382). Std 3.3 is met. The descriptor omits the bound (documentation only).
p9#1 | MED | NOT-APPLICABLE | Std 10.2 scope as p6#4. search-golden-capture.ts is a read-only golden capture gate, not a pipeline or data-entry edit.
p9#2 | MED | REFUTED | tsconfig.json:4 `lib: ["dom","dom.iterable","esnext"]` (target ES2017 governs emitted syntax, and Std 8.2 lists syntax gotchas). tsconfig.json:27 excludes `scripts`, and these are Node .mjs/.ts gate scripts. Object.hasOwn and .at(-2) are legal.
p9#3 | MED | REFUTED | BuildingMassing.tsx:50 `massing.accessory` is a non-optional array (massing/types.ts:36-39) under a `massing && massing.primary` guard (:32). tsc checks it. The line is untouched pre-existing code.
p10#1 | HIGH | REFUTED | Std 2.1 error-path tests exist in the G3 infra files: parcel-lookup-gate.infra.test.ts:161-168 (entitlement read throws, 500), :455-465 (limits read or insert throws, 500), :526-530 (map read throws, 500), and parcels-entitlement.infra.test.ts:91-96. The consumer-parcel-lookup file is the whitelist file by design. The narrower missing-message assertion is C1.
p10#2 | HIGH | DUPLICATE-OF-EARLIER (G1B) | web SearchBinding.tsx:60 tagline and :73 chip are font-mono. Spec 117 §6.1 table (117_maxbld_brand.md:239 "mono because it reads as a label", :242 chip label mono) licenses both. Rail and badge (:79-80, drawn at :199-201) are mono labels the spec table does not name: part of the G1B decision. Not live in 1·B.
p10#3 | MED | DUPLICATE-OF-EARLIER (D4) | no factories import in consumer-parcel-lookup.infra.test.ts.
p10#4 | MED | REFUTED | src/tests/surfaces/search-web-binding.ui.test.tsx exists (renders 11 goldens, the live-switch-off state, actions and red cases, :55-140). The finding itself said "cannot see one".
p10#5 | MED | DUPLICATE-OF-EARLIER (G1B eng-front#2) | web layout table zinc-950 with no dark: variant. Spec 117 §6.1 "default palette". Std 1.3 versus spec conflict: decision, not re-litigated.
p11#1 | MED | DUPLICATE-OF-EARLIER (D4) | customer-report-compute, fix-tune, link-massing tests.
p11#2 | MED | DUPLICATE-OF-EARLIER (LAYER) | link-massing.infra.test.ts name. The test is an executed source-and-seed lock in the default run.
p11#3 | MED | DUPLICATE-OF-EARLIER (LAYER) | customer-report-compute.logic.test.ts query-shape cases.
p12#1 | HIGH | DUPLICATE-OF-EARLIER (BANG) | massing.logic.test.ts:438, :452, :484-485, :500, :550-551, :558-559 `!` in a test file. A miss throws, so no wrong pass. Rule text breached literally.
p12#2 | MED | DUPLICATE-OF-EARLIER (D4)
p12#3 | MED | CONFIRMED (conformity, low impact) | See C2.
p12#4 | MED | DUPLICATE-OF-EARLIER (LAYER)
p12#5 | MED | DUPLICATE-OF-EARLIER (LAYER) | The fences ("Fence b16c036d, verbatim") execute in the default run. Only the suffix differs.
p13#1 | HIGH | DUPLICATE-OF-EARLIER (D4) | HIGH-rated, conformity only. parcel-lookup-gate.infra.test.ts:141 `as never` literals. G2 ruled the same pattern "conformity, not HIGH-class".
p13#2 | MED | DUPLICATE-OF-EARLIER (D4) | parcel-lot-form.logic.test.ts:32.
p13#3 | MED | CONFIRMED (test gap, no code fault) | See C1.
p13#4 | MED | DUPLICATE-OF-EARLIER (BANG) | parcel-lookup-gate.infra.test.ts:128 `getMockImplementation()!`. A missing implementation throws on the next line.
p13#5 | MED | DUPLICATE-OF-EARLIER (LAYER) | parcel-lot-form.logic.test.ts:60.
p14#1 | HIGH | DUPLICATE-OF-EARLIER (D4) | parcels-lookup-page.logic.test.ts:55, parcel-tool-gate.logic.test.ts:12, parcel-tool-meter.logic.test.ts:74. Conformity only.
p14#2 | MED | DUPLICATE-OF-EARLIER (LAYER) | parcels-lookup-page.logic.test.ts:48 imports the real GET. Route infra tests exist (see LAYER).
p14#3 | MED | REFUTED | reportPeriod's invariants (start <= now < end, one stepped month) are asserted across 4 anchors x 115 dates (parcel-tool-meter.logic.test.ts:59-70), plus the Jan-31 and leap-day cases. Std 12.12 :380 names "scoring formulas, key normalizers, distance/unit conversions, cursor comparators"; a date window is not named. (The named cases, unit conversion and the coverage cap, are in C2.)
p14#4 | MED | DUPLICATE of p13#3 | Same missing-message assertion (parcels-entitlement.infra.test.ts:91-96).
p14#5 | MED | REFUTED | The fake rows 20/20/25 (parcels-entitlement.infra.test.ts:43) are test inputs inside the seed bounds 1..1000. The test proves the server computes limit minus used; the seed default (10) is pinned separately (parcel-tool-meter.logic.test.ts:79-82). Std 11 concerns spec-SQL-Zod-migration thresholds, not a fixture.
p15#1 | HIGH | DUPLICATE-OF-EARLIER (D4) | admin-media.golden.test.ts:82. The sample page feeds plainProblems (a plain-data check), not a MediaListRow shape check.
p15#2 | MED | DUPLICATE-OF-EARLIER (BANG) | lot-map-help-link.logic.test.ts:38, :61.
p16#1 | MED | DUPLICATE-OF-EARLIER (D4)
p17#1 | HIGH | DUPLICATE-OF-EARLIER (BANG) | register-locks-resolve.infra.test.ts:43, :102, :119; search-follow-ups.logic.test.ts:85-87, :159. A miss throws.
p17#2 | MED | DUPLICATE-OF-EARLIER (D4) | four surface tests.
p17#3 | MED | REFUTED | The branch is also proven by running the binding through goldens: the lot_facts_null fixture and the leadKey cases (search-follow-ups.logic.test.ts:161-170). The source-text greps (:174-175, search-reports-left:146) are an extra pin, not the only proof.
p18#1 | HIGH | DUPLICATE-OF-EARLIER (D4) | static-page.logic.test.ts:29, :55, :212. Conformity only.
p18#2 | HIGH | REFUTED | maxbld-support.ts:10, :26, :29 use logWarn and logError from the logger. The test spies on console because the logger writes there (static-page.logic.test.ts:222-223).
p18#3 | MED | DUPLICATE-OF-EARLIER (LAYER) | static-page.logic.test.ts T7.

3. CONFIRMED DEFECTS (all conformity or test gaps; no money, auth, meter or wrong-number-shown fault found)
C1. Std 2.1 :39 ("explicitly assert that the top layer ... returns a safe HTTP 500 without leaking the raw .message"). Finding ids p13#3 and p14#4.
- Where: parcel-lookup-gate.infra.test.ts:161-168 and :455-465 force `new Error('db down')` and `new Error('insert failed')` (:100, :104, :113, :164). They assert status 500 and `data` null (and `not.toContain('lot_size')`). Nothing asserts the raw text is absent. parcels-entitlement.infra.test.ts:39 and :91-96 have the same gap. :526-530 (map read) also asserts only the status.
- The code is safe: lookup route.ts:143-145 and entitlement route.ts:41-43 return internalError(), whose body is the fixed "An unexpected error occurred" (features/leads/api/error-mapping.ts:80-85). So no leak today. But a future regression that echoes the message would pass green.
- Smallest fix: add `expect(JSON.stringify(r.body)).not.toContain('db down')` (and `'insert failed'` in the insert case) after parcel-lookup-gate.infra.test.ts:464, :168 and :530. Add `.not.toContain('db down')` after parcels-entitlement.infra.test.ts:95.
- Owner: task-383 and task-334 (gate tests), task-351 (entitlement test). Size: line-size (about 4 lines). Impact: none now; closes the one Std 2.1 clause left open.
C2. Std 12.12 :380 ("distance/unit conversions ... MUST have at least one fast-check property test"). Finding id p12#3.
- Where: src/tests/property/ holds three files, none for massing. formatHeight (metre-to-foot, massing/geometry.ts:116-120, factor M_TO_FT) and computeBuildingCoverage (cap at 100, :150-158) are tested by examples only (massing.logic.test.ts:132-149 and the coverage cases).
- Smallest fix: add src/tests/property/massing.property.test.ts with two properties, `coverage(a,b) <= 100` for positive inputs and `formatHeight(m,f)` ft figure equals round(m*f,1). Same shape as report-sqft-rounding.property.test.ts.
- Owner: task-396 and task-378 (massing and formatHeight). Size: line-size (about 25 lines, new test file). Impact: low; examples pass today. Caveat: G2 ruled a like claim NOT-APPLICABLE because its arithmetic sat outside a G2 file. Here the functions are in the massing area these tasks changed.
C3. Std 5.2 :108 (`*.security.test.ts`, "Mandated when: Auth-guarded / externally-reachable surfaces"). Finding id p7#1.
- Where: `ls src/tests | grep security` shows 7 files, none for /api/parcels/*. The unauthenticated case (401, no pool call) and the 429 case are in parcels-entitlement.infra.test.ts:58-70. The route reads only ctx.uid (entitlement/route.ts:38) with no foreign-uid input, so a foreign-uid test has nothing to attack. The lookup route is in the same position.
- Smallest fix: either a small parcels-entitlement.security.test.ts (401 with no session, no uid parameter honoured) or an operator decision that the infra 401 case satisfies 5.2. Needs a decision (Q4).
- Owner: task-351 (last test edit; route built under MF-45). Size: line-size if added. Impact: none in behaviour; conformity.

NOT CONFIRMED but worth a record: Std 13.3 :432 ("API routes MUST emit at least one logInfo per successful request"). entitlement/route.ts has no logInfo (grep); lookup and lot-size routes do (lot-size route.ts:45). This is p7#2, rated LOW, correctly rated: the descriptor says emits "none" (a read-only call). Owner would be task-364 or the MF-45 build.

4. LOW / NIT (recorded only; ids)
p1#3 (44 px of icon buttons: cannot see; class tables hold it), p1#4 (help URL encode: cannot see), p1#5 (map light style: Daylight ruling, see p5#2), p10#6, p10#7, p11#4, p11#5, p13#6, p14#6, p14#7, p15#3, p15#4, p16#2, p16#3, p16#4, p17#4 (NIT), p18#4, p19#1, p19#2, p19#3, p2#2, p3#4, p4#1, p4#2, p5#3, p5#4, p7#2, p7#3, p8#5, p8#6.
Notes on specific ones: p4#2 is refuted (pageSettingBounds is tested at surface-conformance.logic.test.ts:1079-1092). p4#1, p5#3, p7#3 are refuted (descriptor-to-seed mirror is gated by the emitter). p8#5 duplicates p2#1 (RR-0331). p3#4 is NOT-APPLICABLE as p6#4. p7#2 is real but LOW-class (see section 3). No LOW or NIT is a mis-rated HIGH-class defect on its face.

5. TOTALS (52 rated findings)
confirmed 3 (C1 covers p13#3 and p14#4 as one; C2 = p12#3; C3 = p7#1) | refuted 13 (p1#2, p3#2, p6#3, p8#1, p8#4, p9#2, p9#3, p10#1, p10#4, p14#3, p14#5, p17#3, p18#2) | by-ruling 7 (p2#1, p3#1, p3#3, p5#1, p5#2, p6#2, p8#2) | not-applicable 2 (p6#4, p9#1) | duplicate 2 (p14#4 of p13#3; p6#1 of p5#1) | duplicate-of-earlier 24 (p1#1, p10#2, p10#3, p10#5, p11#1, p11#2, p11#3, p12#1, p12#2, p12#4, p12#5, p13#1, p13#2, p13#4, p13#5, p14#1, p14#2, p15#1, p15#2, p16#1, p17#1, p17#2, p18#1, p18#3) | undetermined 1 (p8#3). Sum 52.
Operator questions:
Q1 (p8#3). Should the consumer lookup SQL project only the 24 whitelisted columns, or is the explicit all-mapped column list with the JS whitelist and the .strict() parse an accepted design?
Q2 (p5#1, p6#1, p3#3). Do the phone parcel-tool pages need a rollout flag at launch, or is the parcel_tool entitlement plus the web switch constant the whole gate (as ruled for the web)?
Q3 (p8#2). Add a deviations[] entry in the lookup contract descriptor pointing at Spec 100:119/:142 ("Ball y") for the server-built `page`?
Q4 (p7#1, and the like for lookup). Does a 401 case in an `.infra.test.ts` meet Std 5.2's `*.security.test.ts` requirement for auth-guarded routes?
(The standing decisions are not repeated: D4 typed factories and G1B Std 1.3 versus Spec 91/117.)

6. UNVERIFIED
- The brief says phone screens are dark-only (Spec 117 §3.4 / Spec 91 §6.1). For the search and choose-your-lot pages that is stale. Task-322 (SRCH.DAYLIGHT) restyled them to a fixed Daylight light palette on operator "love it! Let's go with modern" (task-322 card line 47). I used that. The semi page was not re-read for its palette.
- The actual tap size of ReportPage, ReportView and ReportPageToggles (p3#1) and of the icon buttons (p1#3): not read. They are not G3 files and the web report is not live in 1·B.
- Whether the Zod-versus-seed pin at surface-conformance.logic.test.ts:1031-1033 passes now: read, not run (no runner allowed).
- Spec 100:123 "ONE-35 b" and RR-0271 text: taken from BL-COMPLY GROUNDER.md:233 as quoted, not opened.
- Whether the web SearchBinding rail and badge mono classes (p10#2) match any spec table line. I found none, so I left them in the G1B decision rather than ruling them.
- The command and hook blocks hit once each (a vitest-named config path, a python probe). Neither ran. No file was written.
