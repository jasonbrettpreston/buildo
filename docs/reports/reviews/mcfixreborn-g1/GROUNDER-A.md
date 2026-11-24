Grounder: Cairn-Ground-G1A
Ruled: out-compliance-agents-s5-1to3.txt sha256:f5e574d91fda findings:2
Ruled: out-compliance-agents-s7-s11.txt sha256:a979075c08a3 findings:1
Ruled: out-compliance-five-words-p1.txt sha256:35eaad5431c2 findings:3
Ruled: out-compliance-five-words-p2.txt sha256:6755e3c89aa1 findings:3
Ruled: out-compliance-five-words-p3.txt sha256:08af5f42607b findings:1
Ruled: out-compliance-five-words-p4.txt sha256:3bec4a1946e7 findings:5
Ruled: out-compliance-five-words-p5.txt sha256:b24681ab87ba findings:1
Ruled: out-compliance-inc-S-p1.txt sha256:329fc94cdd5a findings:4
Ruled: out-compliance-inc-S-p2.txt sha256:127dbf12b2ad findings:4
Ruled: out-compliance-inc-S-p3.txt sha256:5c290b42b8d5 findings:5
Ruled: out-compliance-inc-S-p4.txt sha256:39816aad303c findings:3
Ruled: out-compliance-inc-S-p5.txt sha256:7ea494cabd4a findings:5
Ruled: out-compliance-inc-S-p6.txt sha256:f670294f9963 findings:3
Ruled: out-compliance-mobile-90.txt sha256:8d4e75fed86e findings:6
Ruled: out-compliance-mobile-98.txt sha256:200ec15fba58 findings:4
Ruled: out-compliance-mobile-99-p1.txt sha256:2a416b0ee8de findings:4
Ruled: out-compliance-mobile-99-p2.txt sha256:112602699417 findings:0
Ruled: out-compliance-ms-S-p1.txt sha256:3aebf9e4f504 findings:4
Ruled: out-compliance-ms-S-p2.txt sha256:a9cde1ae8d9e findings:2
Ruled: out-compliance-ms-S-p3.txt sha256:8fab33b608ad findings:2
Ruled: out-compliance-ms-S-p4.txt sha256:e377372627b4 findings:1
Ruled: out-compliance-ms-S-p5.txt sha256:07b62ef34e41 findings:2
Ruled: out-compliance-orchestrator-doc17.txt sha256:8ce90c966070 findings:3
Ruled: out-compliance-plan-protocol-p1.txt sha256:54f371159a50 findings:3
Ruled: out-compliance-plan-protocol-p2.txt sha256:3a0d3a22d6a5 findings:2
Ruled: out-compliance-plan-protocol-p3.txt sha256:fc684fa34a84 findings:4
Ruled: out-compliance-plan-protocol-p4.txt sha256:d34fecc2dba7 findings:4
Ruled: out-compliance-plan-protocol-p5.txt sha256:1da5182a5e0d findings:4
Ruled: out-compliance-queue-137.txt sha256:b582fa1bb0b5 findings:2
Ruled: out-compliance-step-132.txt sha256:ab86171cba96 findings:7
Ruled: out-compliance-surface-136-p1.txt sha256:05fff4a4dbb4 findings:7
Ruled: out-compliance-surface-136-p2.txt sha256:4e31f3be4aaa findings:6
Ruled: out-compliance-surface-136-p3.txt sha256:ff57437c73cb findings:5
Ruled: out-compliance-surface-136-p4.txt sha256:34068e21fe75 findings:6
Ruled: out-compliance-surface-136-p5.txt sha256:10078f8dd137 findings:1
(119 findings in all: 59 CRIT/HIGH/MED rows, of which 3 are "none raised" rows, and 60 LOW/NIT. Board worktree HEAD is faa608ce6; `git diff 8dba70e8e HEAD` on all 37 files is empty, so I read the files as they stand. The ids below drop the "out-compliance-" prefix.)

SECTION 2. CRITICAL/HIGH/MED TABLE (id | sev | verdict | reason)
five-words-p2#1 | MED | BY-RULING | 44 px "outside C-9" is the task-384 resolution under the MD:1476 delegation (task-384 notes; binding_web_report.descriptor.json limitations). fe.57 (handbook :202) says C-9 judges converted goldens only and "the rest is PROSE-ONLY". The card's ACs #1-#4 do not ask for C-9. "C-9 reach unbuilt" is named in PLAN.md:25.
five-words-p2#2 | MED | REFUTED | The rear-suite CoA rows are covered by the operator's Q-4 (2026-10-20). Spec 78:1202-1205 already records "Q-4 ... amends LC-49" and seed-report-v2.mjs:235-237 repeats it. The "needs amendment" wording in schema-v2-proposal.json:731 is stale (LOW).
inc-S-p2#1 | HIGH | DUPLICATE of five-words-p2#2 (REFUTED)
inc-S-p2#2 | MED | BY-RULING | The third slot scenario_card is operator 2026-11-09 "scenario images and per-scenario ads", recorded at Spec 126:914 and :582 and in ad-contract.json:2,4. declared_on null is because the slot is carried per scenario by AD.scenario_fields.
inc-S-p3#1 | MED | REFUTED | Spec 128 R-18 needs only a declared auth_class_parity check at FAIL and a class (auth-class-parity.infra.test.ts:5-10). The evidence line is free text. A mobile path cited for the report surface is loose wording (LOW).
inc-S-p3#2 | MED | REFUTED | bindings.json lists LotMapBinding, SemiQuestionBinding and PageTableBinding, all archetype LIST, owner binding_mobile_list. The owns.components list is right. Only docs.purpose and evidence.files are incomplete (LOW).
inc-S-p3#3 | MED | CONFIRMED | mobile_lead_detail.descriptor.json:7 says owns.components[] is empty, but :43 lists OpportunityRing.tsx and notes (:538) say it owns it. See C3.
inc-S-p4#1 | HIGH | UNDETERMINED | Inc-S doc-2:86 F.3 says "no View report button, nothing navigates", but ReportView.tsx:89 draws "View report" for the landing demo. The same facts conflict with Spec 126:993 (Skip and View report links to /#sample) and web-landing.ui.test.tsx:108-109, which pins the link. Needs the operator or the landing mock to say which governs. See D1.
inc-S-p4#2 | MED | BY-RULING | Task-384 AC #2 pins structural findings for hand-built files (surface-conformance.logic.test.ts:39-41). MD:1421-1422 says leave the reports as components. The cannot-see part is not a breach.
inc-S-p5#1 | HIGH | DUPLICATE of inc-S-p4#1
inc-S-p5#2 | MED | BY-RULING | The landing reads (scenario list, counts, allowances) are operator MF-76 rulings, named at Spec 126:993.
inc-S-p6#1 | none | not a finding (no breach raised)
inc-S-p6#2 | MED | REFUTED | The doc-2 header says its snapshot is "as of origin 154e7b13f". reports_left was built afterwards: mobile_parcel_search.descriptor.json:362, the tracked goldens reports_left.web.json and .mobile.json, and commit b5286d4e5 (task-353).
mobile-90#1 | none | not a finding
mobile-90#2 | MED | REFUTED | Spec 117 §3.4: the brand-primary surfaces are "dark-mode-only today ... Do not introduce a light-mode toggle". Spec 90:21 dated note records that no app .tsx uses `dark:`. The screen is a dark-only zinc-950 palette.
mobile-90#3 | MED | CONFIRMED (pre-existing, whole app) | Spec 90:14 requires NativeWind breakpoints. The screen has 0 `md:` classes (grep) and app.json:17 sets supportsTablet true. See C7.
mobile-90#4 | MED | CONFIRMED (pre-existing, whole suite) | Spec 90:89 says Maestro flows MUST include `toggleAirplaneMode`. No flow in mobile/maestro has one. See C8.
mobile-90#5 | MED | REFUTED | schemas.ts:204 declares modeled_gfa_sqft, and useLeadDetail.ts:40 runs LeadDetailSchema.safeParse.
mobile-98#1 | HIGH | BY-RULING | SponsorSlot.tsx was deleted with the old lot screen. MF-48 Stage B, operator "Ball y" (B-6), 2026-11-12, is at Spec 126:873. The dated note sits in parcelCostFormat.test.ts:81-84 and no SponsorSlot exists under mobile/src. Spec 98:111 still lists the test (stale spec line, LOW).
mobile-98#2 | MED | CONFIRMED | lead-detail.yaml:19 says saved=true, but the flow taps save and asserts the filled heart. SaveButton.tsx:52 does `willSave = !isSaved`, so saved=true gives the unfilled heart. See C9.
mobile-99-p1#1 | MED | REFUTED | Spec 99 §3 is an ownership matrix of state fields: profile, auth, onboarding, engagement. It lists no lead or cost API payload field at all, so it cannot be read to require a row per API leaf.
mobile-99-p1#2 | MED | REFUTED | is_saved is server-owned with no local mirror. Spec 99:231-233 lists the ['lead-detail', id] key and :633 names useSaveLead.onMutate. The optimistic write is in useSaveLead.ts, not a G1 file; [lead].tsx:14 is only a comment. Caveat: whether B3 formally covers a cache-only optimistic write is UNVERIFIED.
ms-S-p1#1 | none | not a finding
ms-S-p1#2 | MED | DUPLICATE of surface-136-p2#1 (default m²). The note "today the screen mixes formatSqm and formatServedSqft [parcelId].tsx" is stale, because the old lot screen was deleted (LOW). See C6.
ms-S-p2#1 | MED | DUPLICATE of five-words-p2#1
plan-protocol-p3#1 | HIGH | DUPLICATE of five-words-p2#1
plan-protocol-p3#2 | HIGH | NOT-APPLICABLE | The plan-protocol walk rule and §1 "measured check on the page" define done for an increment slice plan. No plan is under review. The hit state with golden "none" is the same fe.31 point as surface-136-p3#3.
plan-protocol-p3#3 | MED | NOT-APPLICABLE | §3 "No new research topics. Only the sources in step A" is a plan-phase rule. The file's own header scopes it to "scenario slices on the existing plan".
plan-protocol-p5#1 | MED | REFUTED | report-page.ui.test.tsx:90-96 is a field-name, target-literal and hex check. The text and component checks for ReportView.tsx are in surface-conformance.logic.test.ts:41 (C-2b 13, C-8 41, display text 0).
step-132#1 | HIGH | NOT-APPLICABLE | Spec 132 is the Step Standard Handbook ("How a step is built", pipeline steps, 20 categories). binding_mobile_list/mobile_lead_detail are SURFACE descriptors (Spec 126, 21 categories). The list reached them only through the glob scripts/**/*.descriptor.json (rule-lists.json:86-88). The a11y INFO row is also honest, since its own limitation records it.
step-132#2 | MED | NOT-APPLICABLE (same scope; core.6 is about step check rows)
step-132#3 | MED | NOT-APPLICABLE as rule; the fact is CONFIRMED under C3
step-132#4 | MED | NOT-APPLICABLE as rule; the fact is CONFIRMED under C4 (stale 404 claim)
step-132#5 | MED | NOT-APPLICABLE as rule. On the facts, ownership is right (see inc-S-p3#2).
step-132#6 | MED | NOT-APPLICABLE (x-v3.2 register rows are step policy). The deviation cites MD:1476 and a dated grounder verdict.
surface-136-p1#1 | HIGH | CONFIRMED | fe.36 needs canGoBack() before back(); [lead].tsx:110 and :139 call router.back() unguarded. See C1.
surface-136-p1#2 | HIGH | REFUTED | maxBuildBasisLabel (parcelCostFormat.ts:60) is exported but used only by its test, which Spec 98:111 mandates. No screen shows it, so nothing "never a number" is shown.
surface-136-p1#3 | MED | BY-RULING | Operator 2026-11-20 "yes to all" (task-411 notes): the server sends one converted sqft figure, the phone only rounds and appends the unit. The both-units toggle applies to the report only, not lead detail (Spec 126:1132).
surface-136-p1#4 | MED | NOT-APPLICABLE | Spec 126:1132 lists "lead detail /(app)/[lead]" as outside the MaxBLD set. The $450K abbreviation (leadDetailFormat.ts:60) is a pre-rewrite format pattern, not a deviation.
surface-136-p1#5 | MED | NOT-APPLICABLE | fe.31 reads "Every MaxBLD page (a converted non-REPORT surface)". The lead detail is outside that set (126:1132) and is scope D estate_other.
surface-136-p1#6 | MED | NOT-APPLICABLE | fe.40 is the McTest catalogue. lead-detail.yaml is a 2026-05 Spec 98 Maestro regression flow (git log 656707803), and none of the 12 flows is a scenarios.json row. Reading is mine, see UNVERIFIED.
surface-136-p1#7 | MED | CONFIRMED | fe.54 (handbook :193) says an unhandled state is a FAIL, not a blank screen. [lead].tsx:398 renders `null` when not loading, no error and no data. See C2.
surface-136-p2#1 | HIGH | CONFIRMED (low impact) | fe.44 says "the default is imperial" (MD:241). seed-report-v2.mjs:606 and report-presentation.json:39 default to "m²". See C6.
surface-136-p2#2 | HIGH | BY-RULING | Same as inc-S-p2#2: Spec 126:914 and ad-contract.json (a slot BESIDE each card, outside it, R-34).
surface-136-p2#3 | MED | REFUTED | The registry says "no formatter yet" for length. fe.44 reads "Builds ui.format.area_unit ... extended to lengths" (a build instruction), and no consumer reads formats.length.
surface-136-p2#4 | MED | REFUTED | The proposal is a dated snapshot (v2-proposal-2026-10-20) of DB columns. fe.38 governs what /api/parcels/lookup sends and the screens show, and says it is a stopgap that does not discharge MB-37.
surface-136-p2#5 | MED | REFUTED | The targeting_context row is status "proposed". The live keys are in ad-contract.json (db keys only), and report-presentation.json:202 says the retired keys "return when their rows land".
surface-136-p2#6 | MED | BY-RULING | No title: operator "it doesnt need a title" at Spec 126:869. The pace is server-computed delay_ms, not a text template.
surface-136-p3#1 | HIGH | DUPLICATE of five-words-p2#1 for "unmeasured" (fe.57 :202 says prose-only). Narrow real part: the summary below, C6b.
surface-136-p3#2 | HIGH | NOT-APPLICABLE | fe.31 says "a converted non-REPORT surface". binding_web_report is the REPORT renderer (Spec 126:925-926). UNRESEARCHED is also an accepted schema value; shell_web_root has the same.
surface-136-p3#3 | MED | NOT-APPLICABLE | Same fe.31 scope. All 7 binding_* entries carry the one "hit"/"none" state, so the pattern is census-wide.
surface-136-p3#4 | MED | REFUTED | A web render smoke exists: report-page.ui.test.tsx and report-view.ui.test.tsx render the renderer. Only the descriptor's evidence line is thin (LOW).
surface-136-p3#5 | MED | DUPLICATE of inc-S-p3#3 (C3)
surface-136-p4#1 | MED | REFUTED | core.ts:653-662 (D-K) filters sections by layout.details before the view reaches ReportPage, so the lot_size and sheet cases draw only what survived.
surface-136-p4#2 | MED | BY-RULING | Spec 126:869 (no title). The comment at ReportView.tsx:58 cites the operator's words.
surface-136-p4#3 | MED | REFUTED | core.ts:247 throws "RR-STATUS unknown status" and :320-353 validates the tree. viewOf runs it before any node reaches Item.
surface-136-p4#4 | MED | BY-RULING | RR-0273 (MD:1066, task-332 notes): the footer is one shared component. The web report binds G3-G5 to it, and "the mobile report keeps its own binding until a mobile footer is ruled". Task-332 AC #4 has the three links.
surface-136-p4#5 | MED | REFUTED | core.ts:482-488 (validDrawing) drops an invalid drawing whole, and :510 gates the part on the drawing state. ReportPage only draws what the server validated.
surface-136-p5#1 | HIGH | REFUTED | fe.35 means the word "checked" is never beside the rules count. The template reads "{value} by-law rules searched", and report-checked.logic.test.ts:237-239 pins it. citywideLines (what-we-checked.ts:100-110) is the same function the live path uses.

SECTION 3. CONFIRMED DEFECTS (deduplicated)
C1. fe.36, handbook :139: "mobile expo-router with canGoBack() before back()". File: mobile/app/(app)/[lead].tsx:110 and :139, both onPress={() => router.back()}. On a cold deep link (the flow lead-detail.yaml:35 exists to test) the stack can be empty and back does nothing or errors. Precedent: useParcelPageHooks.ts:30 does it right. Fix: add `const goBack = () => (router.canGoBack() ? router.back() : router.replace(<feed route>))` and use it at :110 and :139; the feed route is the (app) index and needs a quick check. Owner: no open task. Code is from WF1-A (2026-05); task-411 only touched the file. Size: line. Impact: medium (a push-notification cold-start user cannot leave the screen).
C2. fe.54, handbook :193: "An unhandled state is a FAIL, not a blank screen". File: [lead].tsx:102-103 and :398. showLoading is `isLoading && !detail` and showNotFound needs isError. With React Query v5 (mobile/package.json:29), a query paused offline with no cache, or a disabled query (no accessToken), has isLoading false, isError false and no data, so the body is blank under the header. I read the v5 semantics; I did not run it. Fix: take isPending from useLeadDetail and set showLoading = isPending && !detail (:52, :102). Owner: none (pre-existing). Size: line. Impact: medium-low (offline cold deep link shows an empty page).
C3. mobile_lead_detail.descriptor.json contradicts itself on ownership. docs.under_126 (:7) says "It owns no component of its own, so its owns.components[] is an empty array", while identity.owns.components (:43) is ["…/OpportunityRing.tsx"] and notes (:538) say "so it owns it". Rule: no step/fe clause applies as cited; this is the file's own contradiction, in a descriptor census (Spec 126/127). Fix: in :7 replace the sentence "It owns no component of its own, so its owns.components[] is an empty array — a legal answer, written down." with "It owns one component, mobile/src/components/feed/OpportunityRing.tsx."; regenerate the registry docs and run the surface generators' --check. Owner: task-411 touched the file (bf36c2cc2); the line is from the 8753e6186 census, MF-48 family. Size: line (the descriptor edit may restamp registry doc output). Impact: low (documentation).
C4. Same descriptor: errors.classes (:421-450) lists 400, 429, 500 and schema_drift but not 404, though the screen renders 404 as not-found (no_retry has ApiError(404)). limitations[2] (:531-535) says "errors.classes has no 404 value". That is false: surface.schema.json errors.classes enum now includes "404" and "409", and Spec 128:268 ASK-20 says "Added". Fix: add {"class":"404","ui":"Not-found block ..."} to errors.classes and delete limitations[2]. Owner: none (pre-existing; census MF-48 family). Size: line. Impact: low.
C5. fe.44 / MD:241 "the default is imperial". File: scripts/surfaces/_schema/seed-report-v2.mjs:606 and generated report-presentation.json:39 have formats.area_unit.default "m²". The note beside it (":42-45", "today the screen mixes formatSqm and formatServedSqft [parcelId].tsx") is stale, since the old lot screen is deleted. No code reads the default today (toggle unbuilt, field "proposed"). Fix: default "ft²" in the seed, regenerate; the presentation fingerprint then moves about 105 goldens (as in the task-411 fold), so decide whether to do it now or with the units toggle build. Owner: MF-83 / task-411 touched the line; decision on timing. Size: line plus regeneration. Impact: low now, medium when the toggle ships.
C6. Engineering standards 00_engineering_standards.md:14 and fe.57 (:202) on 44x44: src/components/report/ReportView.tsx:126 `<summary className="cursor-pointer text-sm text-gray-600">` has no min height, so the collapsed Details toggle is about 20 px tall. It shows on the admin preview and on any collapsed web or mobile layout. Every other control in the three files has min-h-11/12 (ReportPage 57, 69, 82, 108, 206, 208, 241, 309, 393-396; ReportView 68, 89). Fix: add `flex min-h-11 items-center` to the summary className. Owner: task-384 (STD.REPORT-OWN) output; the file is MF-14. Size: line (may restamp goldens that render the collapsed details; no golden check run). Impact: low (the public page is not live; admin preview only).
C7. Spec 90:14 (iPad/Android must be responsive with `md:`). [lead].tsx has 0 `md:` classes and the app declares supportsTablet. Pre-existing and app-wide (no mobile screen uses `md:`). Fix: needs a layout decision for the hero row and section cards; not line-size. Owner: none. Impact: low (tablet only; app not in use).
C8. Spec 90:89 (Maestro flows MUST include toggleAirplaneMode). lead-detail.yaml has none; no flow in mobile/maestro has one (grep). Fix: one offline flow step plus an offline/empty assertion; needs a decision (per flow or one suite flow). Owner: none. Impact: low (flows are not run in CI).
C9. Spec 98 §3.1 (persistent state needs documented setup). lead-detail.yaml:19 says "saved=true in lead_views"; the flow taps save and asserts save-heart-filled-detail (:65-68), so with saved=true the tap unsaves and the assertion fails. Fix: line 19 "saved=true" to "saved=false (no lead_views row)". Owner: none (flow from 656707803, 2026-05). Size: line. Impact: low (comment error; flow not in CI).
Also real but not a G1 breach (LOW): lead-detail-query.ts:8 header "we do NOT recompute in JS" sits beside :156 `sqm * SQM_TO_SQFT` (five-words-p3#1).

D1 (UNDETERMINED, decision): inc-S-p4#1 / inc-S-p5#1. The built landing demo shows Skip and View report links to /#sample (maxbld-landing.ts:113 reportHref; ReportView.tsx:68 and :89 share the guard `c.paced && c.href`). Inc-S F.3 says "no View report button, nothing navigates" (small-pages-v8 later rulings). Spec 126:993 (operator "Wow this looks great! ...") and web-landing.ui.test.tsx:108-109 pin the links. If F.3 wins, dropping reportHref also removes Skip, so ReportView needs a flag. That is not line-size. The landing is not behind MAXBLD_WEB_LIVE (maxbld-web.ts:13-15 pins only the search and report routes) but is not launched. Settle by: the operator, or the landing mock.

SECTION 4. LOW/NIT (recorded, 60 ids)
LOW: agents-s5-1to3#1,#2; agents-s7-s11#1; five-words-p1#1,#2,#3; five-words-p3#1; five-words-p4#1,#2,#4; five-words-p5#1; inc-S-p1#1,#2,#3,#4; inc-S-p2#3,#4; inc-S-p3#4,#5; inc-S-p4#3; inc-S-p5#3,#4,#5; inc-S-p6#3; mobile-90#6; mobile-98#3,#4; mobile-99-p1#3,#4; ms-S-p1#3,#4; ms-S-p2#2; ms-S-p3#1; ms-S-p3#2; ms-S-p4#1; ms-S-p5#1,#2; orchestrator-doc17#1,#2,#3; plan-protocol-p1#1,#2,#3; plan-protocol-p2#1,#2; plan-protocol-p3#4; plan-protocol-p4#1,#2,#3,#4; plan-protocol-p5#2,#3,#4; queue-137#1,#2; step-132#7; surface-136-p4#6.
NIT: five-words-p2#3; five-words-p4#3; five-words-p4#5.
Mis-rated: none is HIGH-class. ms-S-p3#1 (ReportView.tsx summary under 44 px) is real and is C6; LOW to low-MED is right. plan-protocol-p2#2 repeats the LC-49 point (refuted above). plan-protocol-p1#1 is the same wrong "saved=true" note as C9. five-words-p3#1 is the stale comment noted under C9. surface-136-p4#6 (footer and summary items as `<a href="#...">`) is disclosure by hash and fine under fe.36.

SECTION 5. TOTALS (56 real CRIT/HIGH/MED findings, plus 3 "none raised" rows)
Confirmed 7 ids (inc-S-p3#3, mobile-90#3, mobile-90#4, mobile-98#2, surface-136-p1#1, p1#7, p2#1), giving C1-C9 once step-132#3/#4 and surface-136-p3#1/#5 are folded in. Refuted 18. By-ruling 10. Not-applicable 13. Duplicate 7. Undetermined 1.
Process/planning lists (plan-protocol, step-132, queue-137, agents, orchestrator, five-words): of 14 CRIT/HIGH/MED findings, none was a real breach under its own rule. Two step-132 facts and one surface-136 fact turned out real under other rules (C3, C4, C6).

SECTION 6. UNVERIFIED
- I did not run any test or generator. Inferences: React Query v5 paused-query state (C2), the SaveButton toggle (read, not run), and which goldens render the collapsed summary (C6).
- Step-132 NOT-APPLICABLE rests on my reading of Spec 132's own scope ("how a step is built", 20 categories vs the surface 21). The glob rule-lists.json:86-88 attaches it by path. The operator may want the glob narrowed.
- fe.40 NOT-APPLICABLE (surface-136-p1#6) is my reading that fe.40 governs McTest scenarios.json cases and not the 2026-05 Maestro flows.
- Spec 99 B3 coverage of a cache-only optimistic write (mobile-99-p1#2). I did not read useSaveLead.ts.
- The MD line for "Ball y" and the MF-20 ruling were found via Spec 126:873/:914, not in MORNING-DECISIONS.md. I did not locate the MD:1066 line myself; it is cited from the task-332 card.
- The "yes to all" ruling on task-411 comes from the task-411 card notes; I did not open the MD entry at :1504.
