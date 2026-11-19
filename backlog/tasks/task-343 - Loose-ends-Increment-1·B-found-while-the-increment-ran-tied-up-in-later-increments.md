---
id: TASK-343
title: >-
  Loose ends: Increment 1·B (found while the increment ran; tied up in later
  increments)
status: WAITS
assignee:
  - '@lane-BL-LOOSE'
created_date: '2026-11-19T20:30:00Z'
updated_date: '2026-11-19T20:48:00Z'
labels:
  - S
  - loose-ends
milestone: m-1
dependencies: []
references:
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L1160
type: record
ordinal: 43012
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
<!-- SECTION:NOTES:END -->
