---
id: TASK-343
title: >-
  Loose ends: Increment 1·B (found while the increment ran; tied up in later
  increments)
status: WAITS
assignee:
  - '@lane-BL-LOOSE'
created_date: '2026-11-19T20:30:00Z'
updated_date: '2026-11-25T17:03:00Z'
labels:
  - McFixV2
milestone: m-1
dependencies:
  - TASK-268
references:
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L1160
type: record
ordinal: 150210
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator 2026-11-19, verbatim: "create a milestone task called loose ends and to tie up the loose ends with this task in later increments" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1160; RR-0302). Operator 2026-11-19, verbatim: "for the loose end - please add any loose ends from any of the other tasks comleted or built in the task.  The function of the task - is everything that is built is wired in - this is the check" (MORNING-DECISIONS.md:1167; RR-0304).

Function: this task is the check that everything built in Increment 1·B is wired in; each built task below was checked by reading the code on the board head (942f3f4dc), full evidence in docs/reports/lanes/2026-11-19/BL-LOOSE/WIRING.md. One line per loose end: what, where found, severity, tied up by. A line is struck only by the commit that ties it up.

Wiring check (9 built tasks; task-319 stage 1 is records only). Switches today: MAXBLD_WEB_LIVE false (src/lib/surfaces/maxbld-web.ts:19); customer report producer null until MB-44 (src/lib/parcels/report-page.ts:23-26).

| task | what was built | wired | evidence file:line | tied up by |
|---|---|---|---|---|
| task-12 GAP.13 | tagline key, lot-map heading key, golden writer script | WIRED (the script has no caller) | SearchBinding.tsx:62; LotMapBinding.tsx:236; scripts/surfaces/search-golden-capture.ts:11 | NONE (line 19, record only) |
| task-318 SRCH.ROUTE | end-to-end routing test only | WIRED (suite) | src/tests/search-routing.logic.test.ts | none needed (a test; no code to connect) |
| task-322 SRCH.DAYLIGHT | Daylight restyle, A.13 B.8 C.9 removed | WIRED mobile; web page WIRED-BEHIND MAXBLD_WEB_LIVE | mobile/app/(app)/parcel-tool/index.tsx:109; SearchPageClient.tsx:17 | task-287 |
| task-333 SRCH.FUZZY | mis-typed street resolves to candidates | WIRED (mobile consumer route) | route.ts:103 -> parcel-lookup.ts:246 | NONE (line 3) |
| task-334 SRCH.METER | meter counts only when a report is produced | WIRED-BEHIND MB-44 producer (page null); unsure-lot count NOT WIRED; entitlement read NOT WIRED | route.ts:152-170; report-page.ts:23-26; entitlement/route.ts (no reader) | task-285, task-123; unsure-lot count: task-319 stage 2 (line 16); entitlement read: task-320, task-340 (line 9) |
| task-336 + task-338 SRCH.LOTCARD | footprint fill and card line from two reads; contract repair | WIRED mobile | consumer-lookup.ts:232 -> types.ts:111 -> LotMapBinding.tsx:131,170 | NONE for the lock, draft-37 for the outline (line 5) |
| task-69 1.4 parser | direction guard, unit strip | WIRED (both lookup routes) | parcel-lookup.ts:246; route.ts:103; admin route.ts:59 | NONE (line 4) |
| task-332 SRCH.FOOTER | one shared web footer | WIRED static and search pages; report footer WIRED-BEHIND MAXBLD_WEB_LIVE and MB-44 | StaticBinding.tsx:178; SearchBinding.tsx:138; ReportPage.tsx:267; [parcelId]/page.tsx:18 | task-287, task-123, task-127 |
| task-321 SRCH.C12 | Help links on the lot map and notices | WIRED-BEHIND the support inbox setting (empty) | LotMapBinding.tsx:96-111; maxbldHelp.ts:16; maxbld-support.ts:13 | the RR-0299 database job (line 7: no task id, NONE) |

Result: of 9 tasks, 6 WIRED and 3 WIRED-BEHIND (METER: MB-44 producer; FOOTER: report footer behind MAXBLD_WEB_LIVE and MB-44; C12: support inbox setting). Inside them 3 parts are NOT WIRED: the unsure-lot meter count (line 16), GET /api/parcels/entitlement (line 9), the golden writer script (line 19). Paths: route.ts:103 and :167 are src/app/api/parcels/lookup/route.ts; route.ts:59 is src/app/api/admin/parcels/lookup/route.ts; entitlement/route.ts is src/app/api/parcels/entitlement/route.ts.

Loose ends (severity scale: blocks the customer / visible = a customer or operator would see it / hidden = unseen until it bites / record only = a note; draft-N = a backlog draft; tied up by: NONE is allowed by the brief and marks a line no task owns; severity in plain words; Recommendation lines are UNVERIFIED unless marked verified by the review round):
1. task-62 (6.43 Push 6) was closed by hand on evidence; the other Increment 6 rows 6.8 to 6.42 still read WAITS or LATER on the board although push 6 landed: a relevancy pass of milestone m-7 by a lane (task-1 AC 7). Severity: record only. tied up by: task-1 AC 7.
2. Pulling tasks 121, 122 and 123 ahead of Increment 6c (task-341, RR-0301): the size of the recut conflict was not measured; the rest of 6c is untouched. Severity: hidden. tied up by: NONE for the measurement (tasks 121, 122, 123 do the work, none measures the conflict).
3. SRCH.FUZZY (task-333): the matcher SQL has not run on a live database (types, speed, false candidates); the seed variable enrich_heritage_address_levenshtein_threshold (scripts/seeds/logic_variables.json:6656) is not checked present on the database (check: SELECT variable_value FROM logic_variables WHERE variable_key = the variable name). Severity: visible (a mis-typed address could list wrong lots or fail). tied up by: NONE. Recommendation: one read-only run of the matcher on the test stack by the first Increment 2 lane that opens the stack. UNVERIFIED.
4. 1.4 parser (task-69): not checked on a live database that Queen St E and W rows end in the direction token; wider unit forms (Unit No., PH, Bsmt, Rear) are not stripped (parcel-lookup.ts UNIT_TAIL); the mobile screen for the one-lot address list was not checked. Severity: visible. tied up by: NONE. Recommendation: same test-stack run as line 3, and a device check with line 10. UNVERIFIED.
5. SRCH.LOTCARD (task-336, task-338): no lock ties the lot fields in src/app/api/parcels/lookup/types.ts to the contract whitelist (the cause of the suite failure); scripts/surfaces/_schema/census/contracts.json is a hand-kept mirror with no lock; the footprint outline is draft-37 (only a fill colour is drawn, LotMapBinding.tsx:131); the data check covered one address. Severity: hidden. tied up by: NONE for the lock; the outline is draft-37. Recommendation: a root test comparing types.ts keys with the whitelist, in the next surface-lock task. UNVERIFIED.
6. SRCH.FOOTER (task-332): the footer and the report footer were never rendered in a browser; the landing sample report now shows the three footer links; the report schema has no G4 or G5 part (the mobile report keeps its own binding); G2 is GAP.4 (task-127). Severity: visible. tied up by: task-127 for G2; browser render NONE. Recommendation: include the footers in the browser check of task-268 PROOF.S. UNVERIFIED.
7. SRCH.C12 (task-321): the support inbox setting is empty: the placeholder address (RR-0299) is a database job needing the operator GO; small-pages-v8 names the Help topic wrong-lot, which the Help page does not have (the links use the built topics lot_match and address_match: an orchestrator reading, for the operator); no device check. Severity: visible (the Help mail link is empty). tied up by: the RR-0299 database job (operator GO; no task id found: NONE). Recommendation: a one-row database job through the rehearse-then-GO path. UNVERIFIED.
8. SRCH.SEMI (task-319): the mock was never rendered by the lane; stage 2 (the structural restyle and the meter call after the answer, RR-0278) waits on the operator approval and four design answers. Severity: visible. tied up by: task-319 stage 2.
9. SRCH.A6 (task-320, task-340): what the reports-left line shows when the user has no entitlement row; GET /api/parcels/entitlement is built and read by no page (grep of src, mobile/src, mobile/app). Severity: visible (no reports-left line). tied up by: task-320, task-340.
10. The mobile jest suites are not run by the commit hook nor by the station suite: every mobile change of 1·B is unproven on jest until a test-stack run or a device check. Severity: hidden. tied up by: NONE. Recommendation: owner decision on a mobile jest step at the station. UNVERIFIED.
11. The real-tree pin tests (S-sbind count, consumer registry, target files) are not reached by a lane related run unless the test file is staged: three lanes hit this on 2026-11-19; a lane-time check is owed. Severity: hidden. tied up by: NONE.
12. The G1 context pack generator defects (ENOENT document blocks, "undefined" quotes, blank Decisions section; R14 saw Dependencies printed as (none) and doc-2 and doc-16 blocks unreadable): draft-34; reported by every lane today. Severity: hidden. tied up by: draft-34.
13. task-268 PROOF.S: its R10 note says it depends on 317 to 322, its front matter lists only 12, 69, 267, 68. Severity: record only. tied up by: NONE.
14. CHK.6 (task-67) and its design-elements file: source and size owed (task-342, RR-0303); design-fit.mjs untested and 63 of 117 report element design_refs cite the stale brief v4 (R14). Severity: record only. tied up by: task-342, task-345.
15. SRCH.METER (task-334): the meter counts nothing today: openReport (route.ts:167) runs only when the response carries page, and page is null for every lot (report-page.ts:23-26). Severity: hidden until reports ship (no customer is charged). tied up by: task-285 (MB-44 F), task-123 (MB-44 W).
16. SRCH.METER (task-334): an unsure lot is metered semi_pending (route.ts:162) and nothing counts it after the semi answer (useParcelLookup.ts:75-80 sends only parcelId; the answer is a route param). NOT WIRED. Severity: visible once reports ship (the customer is never charged for an unsure lot, or a later fix double-counts). tied up by: task-319 stage 2. Recommendation: the answered lot is metered by the lookup that carries the answer, or the route reads the stored answer (GAP.12 task-213); rule it inside task-319 stage 2. UNVERIFIED.
17. Web twins: the web lot map and candidate list (W5, doc-2 E.3, E.4) are not built, so FUZZY, ROUTE results, LOTCARD and C12 reach mobile only; the web search page renders but is disabled while MAXBLD_WEB_LIVE is false (SearchPageClient.tsx:17). Severity: visible on web only. tied up by: task-287 (LS.12 live switch), task-14 (LS.11 map). RR-0170 (answer ONE-35, MORNING-DECISIONS.md:738) is the ruling cited on task-14 for the LS.11 deferral; that it covers W5 as a whole is UNVERIFIED.
18. Dead styles: S.rail and S.badge (mobile/src/constants/lotMap.ts:18-19) have no reader after GAP.13 retired map.rail and map.badge. Severity: hidden. tied up by: NONE (record only).
19. scripts/surfaces/search-golden-capture.ts (GAP.13) has no caller in a hook, the suite or the station; the ten mobile search goldens are regenerated by hand. Severity: hidden. tied up by: NONE (record only).
20. doc-2 Elements table (backlog/docs/increments/doc-2 - Increment-S-requirements.md:27 onward) still reads NOT BUILT for A.1, A.4, A.5, C.1, C.5, C.7, C.12 although tasks 12, 69, 336, 321 built them. Severity: record only. tied up by: NONE.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every line names the task or increment that ties it up, or is struck by the commit that did
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
1. Read the m-1 built tasks and their commits. 2. Per built thing find the caller/reader chain with grep file:line. 3. Write WIRING.md. 4. One review round (r1), TRIAGE.md. 5. Write the task-343 description (table + merged loose-end list) via CLI; WAITS. 6. One docs commit with Task: task-343.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Dated note 2026-11-19 (M-246, prior text kept; RR-0302 · task-343 · Backlog; operator, verbatim: "create a milestone task called loose ends")

2026-11-19 (R14, task-344) loose end: the generated context pack for task-344 printed Dependencies as (none) and three Document sections as not readable ENOENT (doc-2, doc-16) while citing their lines; fix in the generator (context file docs/reports/reviews/task-344/context-2026-11-19.md).

2026-11-19 (R14, task-344) loose end: design-fit.mjs (RS-12 draft) is untested, and 63 of 117 report element design_refs cite the stale REPORT-LAYOUT-BRIEF-v4.md: tied up by task-345.

2026-11-19 taken on the board at lane launch (lane BL-LOOSE, worktree /Users/brettpreston_macmini/Buildo-wt-loose, branch wf2/inc1b-loose), RR-0240

2026-11-19 BL-LOOSE: wiring check written into the description (WIRING.md, TRIAGE.md in docs/reports/lanes/2026-11-19/BL-LOOSE/); WAITS: open until every line is tied up.

CHK.6 design-fit check and its elements file (task-67, task-345): not built; operator: a large build, a missing field is seen on the page (RR-0305, RR-0306). Severity: hidden. tied up by: task-345 when the operator schedules it.

2026-11-19 (R16, task-347) loose ends from the 1.3 W decisions, one line each, tied up by: (1) the web report mount (replace the deliberate failure at src/app/(maxbld)/parcel-tool/[parcelId]/page.tsx:19-20 with the real page over W's output) has no owner in any task text (doc-2:82 lists 'LS.12 1.3 MB-44' as deliverers; none of them builds it), severity medium, tied up by task-285 L.7 if the operator answers A on task-349, else task-123. (2) Spec 126 R-2 (:809) still says 'until MB-38 fills all lots', which MORNING-DECISIONS.md:704-705 removed; the dated note is owed, severity low, tied up by task-123 stage 2 doc commit. (3) The carrier of the What-we-checked wiring (ruled, X-4 a, .cursor/MCFRONTEND-QUEUE.md:363) is open between task-123 (its title) and task-267, severity low, tied up by the orchestrator's dated note before task-123 stage 2 closes. (4) LOAD.1 compute must sit behind the same gate as W (the web live switch) or the tester gate, severity medium, tied up by task-266 after the operator answers task-348. (5) The G1 context-pack generator reads no file whose name has spaces (ENOENT on doc-2, doc-4, doc-16 in docs/reports/reviews/task-347/context-2026-11-19.md) and prints Dependencies and References as none, severity low, tied up by NONE (infra freeze: a gap only if it blocks a project commit; record only).

2026-11-19 (R17, task-350) UNOWNED COUNT: after the lines below, 18 lines of this task read tied up by NONE (10 before this note and 8 in it; counted with the exact words, the legend sentence excluded; the colon is omitted in this header so it is not itself counted). R16's line 5 (infra freeze) reads tied up by NONE without the colon and is not in the 18. BL-R16 and BL-W add nothing else: R16's five lines are already above; BL-W's D1 and D3 became task-348 and task-349 and D2 and D4 are ruled.
2026-11-19 (R17, task-350) loose end, from BL-A6 (docs/reports/lanes/2026-11-19/BL-A6/REPORT.md, Findings): the report-limit wall screen is not built and every 403, REPORT_LIMIT_REACHED included, shows the subscription notice (mobile/src/lib/parcelSearchMatch.ts:295-300; the same notice shows at the semi Continue per BL-SEMI2 REPORT.md UNVERIFIED); v8 draws the wall (small-pages-v8/report-limit.html:286-310). Severity: visible (a customer at the limit is told the wrong thing). tied up by: NONE (grep of backlog/tasks for report-limit finds no wall task). Recommendation: a McFrontend task for the wall, with the Toronto-time label of task-351 on its date. UNVERIFIED.
2026-11-19 (R17, task-350) loose end, from BL-A6: the search descriptor's metering sentence ("Nothing here is counted") is stale since SRCH.METER (task-334). Severity: hidden (wrong text in a descriptor, not shown to a customer). tied up by: NONE.
2026-11-19 (R17, task-350) loose end, from BL-A6 (src/lib/entitlements/index.ts:483-505, :640-646): the reports-left line is absent for everyone if any one of the three allowance settings (plan, trial, pro) is missing or out of bounds; the meter fails closed by ruling and the read degrades to null counts with a WARN. Live presence of the three settings is UNVERIFIED (no database in the lane). Severity: hidden (a silent missing line). tied up by: NONE. Recommendation: one read-only SELECT of the three keys on the test stack by the first Increment 2 lane that opens it (same run as lines 3 and 4). UNVERIFIED.
2026-11-19 (R17, task-350) loose end, sorted out of BL-A6's eight questions (no decision needed): the web twin of the reports-left line is built for the parity lock (FE-07) but inert, the web page is disabled by the live switch (src/lib/surfaces/maxbld-web.ts:19; SearchPageClient.tsx:17) and no web file reads GET /api/parcels/entitlement, so the web line is absent for everyone even after the flip unless a reader is added; nothing ties the flip to that reader. Severity: visible on web only. tied up by: task-287 (LS.12 live switch).
2026-11-19 (R17, task-350) loose end, sorted out of BL-A6's eight questions: the reset date shows the UTC calendar day, a day late for a Toronto customer whose period end is 19:00-24:00 Toronto standard time (20:00-24:00 daylight); the operator ruled a server-formatted Toronto label (RR-0310, MORNING-DECISIONS.md:1207) and the derived name reset_date (unratified, question 4) is removed by the same build. Severity: visible. tied up by: task-351.
2026-11-19 (R17, task-350) loose end, from BL-SEMI2 and BL-A6 (docs/reports/lanes/2026-11-19/BL-SEMI2/REPORT.md UNVERIFIED; BL-A6 REPORT.md UNVERIFIED): the mobile jest cases written or edited in 1·B (semiQuestionPage.behaviour, semiQuestionScreens.golden, useParcelLookup, daylightSearchPages, parcelScreens golden, parcelSearchMatch, offline filter) were not run by any hook, station step or lane (the lane rule refuses the runner call). Severity: hidden. tied up by: NONE (same owner question as line 10).
2026-11-19 (R17, task-350) loose end, from BL-SEMI2: the semi page's top bar was moved out of the scroll column and its safe-area behaviour was never checked on a device or simulator; the heading-width cause (text-wrap: balance, v8 CSS) was read, not rendered. Severity: visible (a notched phone could overlap the bar). tied up by: NONE (the device check can ride with line 10 and task-268 PROOF.S).
2026-11-19 (R17, task-350) loose end, from BL-SEMI2 (REPORT.md "Ledger"): prereg rounds 194 (MF-92) and 195 (MF-91) have no id-ledger claim in ~/Buildo-scratch/ids and the MF-92 ledger directory has no owner file, so the ids check prints `FAIL no-ledger-dir round-195` for later lanes (BL-PROOF2 saw it in its ids.out, 78f552fbb..67dd69222). Severity: hidden (a check fails for other lanes). tied up by: NONE.
2026-11-19 (R17, task-350) loose end, from BL-SEMI2: semi question 3 (curly apostrophes in the semi page text) is NOT answered; no string changed (RR-0308, RR-0309 leave it open). Severity: visible (copy only). tied up by: task-319 (the operator's answer is owed).
2026-11-19 (R17, task-350) loose end, from BL-PROOF2 (REPORT.md "Stages 3-5"; BL-PROOF/REPORT.md:8): the proof tool's later stages, screenshots and element check, answer-key compare, and storage probes, have no task of their own. Severity: record only. tied up by: NONE.
2026-11-19 (R17, task-350) loose end, from BL-PROOF2 (REPORT.md item 3): the proof runner (scripts/analysis/proof-slice.mjs) is called only by hand from PROOF.S; no hook, station step or CI job calls it. Severity: hidden. tied up by: task-268 (PROOF.S runs it as its acceptance command).
2026-11-19 (R17, task-350) loose end, from BL-PROOF2 (BL-PROOF/PLAN.md:66, :107): no key file for the 25 lots' report numbers was found (.cursor/MCBYLAWS-QUEUE.md:87 names the cases); the answer-key compare is blocked on it. Severity: hidden. tied up by: NONE (task-123 unblocks the compare, none owns the key file). UNVERIFIED location of the inc-1 key.
2026-11-19 (R17, task-350) loose end, from BL-W (docs/reports/lanes/2026-11-19/BL-W/REPORT.md UNVERIFIED): the MB-44 status line "WAITS MB-38 ... expires 2026-11-19" (.cursor/MCBYLAWS-QUEUE.md:777, BL-W PLAN.md:75) has no known renewer; the cohort rows against CURRENT_SEED_SHAS, the stamp table contents and the lot_gate value list are unchecked; the gate-accepted MF id and prereg-MB-44-k are owed. Severity: hidden. tied up by: task-123 (stage 2 live checks and gate records).

2026-11-19 (R18, task-355) loose end, from the no-plan research (task-357): the web search page shows a no-plan user the same one-line notice and a disabled box, with no path to the plans page (src/lib/surfaces/maxbld-web.ts:32-35; page.tsx:13-14). Severity: visible once the live switch flips. tied up by: MF-86 (the plans page, .cursor/MCFRONTEND-QUEUE.md:630-631) for the page; the wiring from the notice to the plans page: NONE.

2026-11-19 (R18, task-355) loose end, from the search box wording (task-356): the scratch design source small-pages-v8 still draws placeholder "Enter lot address" (search.html:265, :278, :318; content.json:97; build.mjs source) and will disagree with the built box after task-356. Severity: record only. tied up by: NONE (the mock is outside the repo; whoever regenerates small-pages-v8 changes the one word).

2026-11-19 (R18, task-355) loose end, from review r1 of task-355: the context pack generator prints the literal "undefined" after the cite of four Storage set-up lines and joins nine ruling ids to one title (docs/reports/reviews/task-355/context-2026-11-19.md:20-30, :172-175). Severity: hidden (a lane reading the pack may cite the wrong ruling). tied up by: NONE (the generator is scripts/analysis/backlog-brief.mjs).

2026-11-19 (R18, task-355) loose end, from the no-plan research (task-357): the app cannot tell the two 403 refusals of the lookup apart, SUBSCRIPTION_REQUIRED and REPORT_LIMIT_REACHED, because ApiError holds a status and a message only (mobile/src/lib/errors.ts:14-21; mobile/src/lib/parcelSearchMatch.ts:295-300), so a person who used every report reads the subscription notice. Severity: visible. tied up by: the limit wall loose end above (NONE); task-357 builds a read-based rule for its own trigger only.

task-351 (BL-RESET): built but unowned/unproven: (1) the limit wall resetsOn (src/features/leads/api/error-mapping.ts:34-38) is still a raw instant, its screen must use a server label; (2) formatDateDmy still prints Sept on the lot-size page (operator item in docs/reports/lanes/2026-11-19/BL-RESET/REPORT.md); (3) mobile jest and device look of the reports-left line not run (CI after push).

2026-11-19 loose ends from task-356 (BL-BOX): the v8 mock (~/Buildo-scratch/mcfrontend/small-pages-v8/content.json:97 and search.html:265, :278, :318) still draws 'Enter lot address'; backlog/docs/increments/doc-2 - Increment-S-requirements.md:31 and :100 (A.2) still say 'Enter lot address'.

2026-11-19 (PANEL.TRIAGE-1, task-359; verdicts docs/reports/lanes/2026-11-19/BL-TRIAGE/VERDICTS.md) loose end, RC-1: the meter's second gate has no owner: route.ts:163 skips the count when hasEvaluatedOption(body.parcel) is false and consumer-lookup.ts:161 always sends costMenu.menu null, so even after W serves a page nothing counts, the reports-left line never moves and the limit wall cannot fire; the pin parcels-lookup-page.logic.test.ts:165-182 names 'MB-94 c / MB-44' as owner but task-121 (MB-94 c recut), task-123 and task-285 carry no meter text (git grep of backlog/tasks, backlog/docs and .cursor for hasEvaluatedOption, evaluated option and costMenu finds only .cursor/MCBYLAWS-QUEUE.md). Line 15 above covers the null page only. Severity: hidden until reports ship, then blocks billing (G.6). tied up by: NONE. Recommendation: one build task that reads the evaluated option from the served page (or the stored rows) instead of the legacy menu, with the pin flipped; before task-287 flips the live switch. UNVERIFIED.

2026-11-19 (task-359) loose end, UX-1 verified TRUE on the board head (error-mapping.ts:37, parcelSearchMatch.ts:295-300, ReportBinding.tsx:373-377): the limit wall and the 403 split are still unowned (see R17 and R18 lines above). Severity: visible once RC-1's gate is fixed (cannot fire today because nothing counts). tied up by: NONE; must have an owner before task-287 flips the live switch.

2026-11-19 (task-359) loose ends, record only: (a) GR-2: the MF-48 queue note (.cursor/MCFRONTEND-QUEUE.md:371) files task-123 under MF-48 without saying it is an orchestrator reading (the MF-85 note :622 and task-121 :102 do say so); tied up by: NONE (a queue note for the orchestrator). (b) CR-3 mobile ParcelToolEntitlementSchema status is z.string() (schemas.ts:446) and reportsUsed and reportsLimitReached are unread; tied up by: NONE. (c) CR-5 web SearchBinding.tsx:144 casts footerNode(...) as WebNode; tied up by: NONE. (d) CR-6 read-stored.ts:48-53 four sequential reads with no snapshot; a torn read can only give out_of_date (a miss); tied up by: task-272. (e) The five 1·B fix tasks from the panel triage: task-360, task-361, task-362, task-363, task-364.

2026-11-19 (orchestrator, relayed from lane BL-PROOF3, task-363, which could not write while this file's header was broken): three leftovers of the proof runner, tied up by: NONE: (1) an --out folder that exists but is read-only still exits 1 via writeFile (scripts/analysis/proof-slice.mjs); (2) timeoutMs on non-argv rows is not rejected; (3) an oversized timeoutMs is not capped. Also: the front matter of task-266 and task-343 was broken by a hand conflict resolution (lane BL-TRIAGE) and repaired in d0d930d65; backlog doctor did not detect it; task-307 and task-308 carry a duplicated updated_date key (not repaired).

BL-SEMI3 (task-361) loose ends 2026-11-19: (1) abort/cancel of the abandoned answered lookup is not built; (2) no log line on a Continue timeout, failed Continue or empty-id return; (3) answer changed while Continue runs still opens the report for the pressed answer; (4) after a timeout the built error copy says check your connection, carry into the D-1 ruling.

BL-LOTMAP2 (task-362) leftovers: (1) operator item: a Help sheet that fails to open shows nothing (design silent, RR-0233); (2) operator item: the Help row moves up one line when the pick hint goes after a pick; (3) mobile jest cases for task-362 (lotMapPage.behaviour, parcelSearchScreen.behaviour, maxbldHelp, lotMapScreens.golden) not run locally, CI owed; (4) mobile tsc fails here on missing modules in shared mobile/node_modules (environment).

Dated note 2026-11-19 (M-246; loose ends from LOAD.1 stage 2, lane BL-LOAD1B, task-266; launch preconditions, NOT fixed in LOAD.1): (1) the core requires the 7.4 MB docs/reference/bylaw-layer2-input.json and ESM .mjs files; the Cloud Run image copies only public, standalone, static, migrations and scripts (Dockerfile:29-33) on node:20-alpine (Dockerfile:15): not proven to load there, to be proven before the web live switch flips (LS.12). (2) The compute is synchronous: it blocks one instance for 3.9 to 15.9 s per lot here (golden 25, no SQL; 33.6 s measured by the STORAGE lane) as built; no deadline, no single-flight. (3) The app retries a failed lookup three more times (mobile/src/hooks/useParcelLookup.ts:52-59), so one failing compute can run four times. (4) The platform request timeout is unknown (cloudbuild.yaml sets no --timeout). (5) Suggested, not built: a reason code logged for each null return of computeCustomerPageResponse, and the entry added to the growth-locked src SQL ledger interpolated set (30th file, scripts/analysis/src-sql-ledger.mjs) needs the operator's review.

task-360 (BL-METER2) loose ends: (1) race UNVERIFIED: a no-flag lookup in flight from the semi question page resolving after Continue could overwrite the answered cache entry with page null (useParcelLookup key excludes semi); (2) RC-1 evaluated-option gate still has no owner; (3) mobile jest of useParcelLookup.test.ts and reportScreen.mount.behaviour.test.tsx not run locally: CI/device; (4) S-sbind pin reads 426, brief said 425.

2026-11-19 (SRCH.HYGIENE-1, task-364, lane BL-HYG) cite correction by note, text above kept: on head 19f44c421 the customer producer's switch (null for every lot while MAXBLD_WEB_LIVE is false) is src/lib/parcels/report-page.ts:57 (readCustomerPageResponse), not :23-26; the lookup meter branch is src/app/api/parcels/lookup/route.ts:181-193 (the not_produced label :183, openReport :186), not :45, :152-170, :161 or :167. The BL-METER report (docs/reports/lanes/2026-11-19/BL-METER/REPORT.md) names the old :23-26 and :161 and is a dated lane record, left unchanged.

2026-11-20 (task-354, BL-MOBILECI): the mobile jest tests are run by no hook and no station; only the manual GitHub Mobile CI job runs them, so cases written in a lane stay unrun until a push (run 44741125636: 18 of 786 failing).

Operator 2026-11-20, verbatim: "Task 370 yes . approved" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1427; the table put to him is quoted in that entry). Leftovers added from McFix (2026-11-20): (1) the proof runner typed timeout DEFAULT_TIMEOUT_MS = 120000 (scripts/analysis/proof-slice.mjs) needs a registered setting: migration number from the ID ledger, operator typed GO (task-375 partial); (2) the security lens terms for admin and personal data at scripts/analysis/rule-lists.mjs:128 (task-375 D11b); (3) the entitlement contract cite useParcelLookup.ts:96 should be :134, locked by search-reports-left.logic.test.ts:132 (D15; with task-378); (4) no rule-list row for docs/reports/generated/** (a lane that regenerates one cannot resolve it); (5) no regression lens template exists in .claude/review-templates; (6) the DB mirror migration for the two lot-size settings from task-372.

2026-11-24: ordered last in the search milestone, after TASK-268 (RR-0447, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2308).
<!-- SECTION:NOTES:END -->
