---
id: TASK-267
title: >-
  LOAD.2 Loading screen (MF-62 Checking your lot): the animation keeps its set
  length...
status: WAITS
assignee:
  - '@lane-BL-LOAD2'
created_date: '2026-11-19T04:57:00Z'
updated_date: '2026-11-25T19:30:00Z'
due_date: '2026-11-26'
labels:
  - McFixV2
milestone: m-1
dependencies:
  - TASK-266
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#S/LOAD.2
  - >-
    ~/Buildo-scratch/mcfrontend/MF-62/followup-1111/plan.md#L69
    sha256=483316abe7e1
  - ~/Buildo-scratch/mcfrontend/MF-62/plan.md#L44 sha256=e682e4a9d59c
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/inc-briefs/BRIEFS.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/search-delta/CURRENT-SEARCH.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/holistic-audit/AUDIT.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/readiness/READINESS.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/storage-policy/McSTORAGE-POLICY-v2.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/search-1b-adj/REPORT.md
  - .cursor/MCFRONTEND-QUEUE.md#L467
  - docs/reports/lanes/2026-11-19/BL-LOAD2/REPORT.md
  - docs/reports/lanes/2026-11-19/BL-LOAD2/PLAN.md
  - compliance:surface-136 docs/specs/02-web-admin/136_mcfrontend_handbook.md
  - compliance:mobile-90 docs/specs/03-mobile/90_mobile_engineering_protocol.md
  - compliance:mobile-98 docs/specs/03-mobile/98_mobile_testing_protocol.md
  - compliance:mobile-99 docs/specs/03-mobile/99_mobile_state_architecture.md
  - compliance:eng-all docs/specs/00_engineering_standards.md
  - compliance:plan-protocol docs/specs/00-architecture/plan-protocol.md
  - compliance:inc-S backlog/docs/increments/doc-2 - Increment-S-requirements.md
  - compliance:ms-S backlog/milestones/m-1 - increment-1·b-search-[s].md
  - docs/reports/reviews/task-267/GROUNDER-PLAN.md
  - docs/reports/reviews/task-267/TRIAGE-PLAN.md
  - docs/reports/reviews/task-267/seat-integration-1.md
  - docs/reports/reviews/task-267/seat-reality-check-1.md
  - docs/reports/reviews/task-267/seat-regression-1.md
  - compliance:step-132 docs/specs/01-pipeline/132_step_standard_handbook.md
documentation:
  - backlog/docs/increments/doc-2 - Increment-S-requirements.md
priority: low
type: build
project: McIncrement
ordinal: 2003
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: LOAD.2 Loading screen (MF-62 Checking your lot): the animation keeps its set length (23 s today) and always runs to completion; the button to open the report shows only when the report AND See details are loaded, however long that takes (no 35 s cap)

snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: GUESS (two cards in one lane: one server read, one phone screen with five states, generators and tests; unmeasured)

Plan text at the snapshot: RULED; panel + build pass owed; edge case owed: the screen when a load fails; waits LOAD.1
slicePart: page and binding
planNote: storage-policy: dependsOn LOAD.1,LOAD.3 (the 35 s seed max (LOAD.3); the updating state is the existing lifecycle loading, no new task needed here (seat K))
planNote: storage-policy: title + ; where the numbers are not ready at the maximum the report opens with the "updating" state, never an old number (A-MF62) (screen is not a gate for Skip and re-open edges)
planNote: loading-r2: title Loading screen (MF-62 Checking your lot): the animation keeps its set length (23 s today) and always runs to completion; the button to open the report shows only when the report AND See details are loaded, however long that takes (no 35 s cap) (operator 2026-11-18 MORNING-DECISIONS.md ("so right now the animation takes 23 seconds ... the report and the details should be loaded" + "yes that is correct"))
planNote: loading-r2: status RULED; panel + build pass owed; edge case owed: the screen when a load fails; waits LOAD.1 (operator 2026-11-18 MORNING-DECISIONS.md ("so right now the animation takes 23 seconds ... the report and the details should be loaded" + "yes that is correct"))
who (plan text): McFrontend lane (MF-62 follow-up)

Files: src/lib/parcels/lookup-flow.ts, src/app/api/parcels/lookup/route.ts, src/app/api/parcels/lookup/types.ts, src/lib/parcels/what-we-checked.ts, mobile/src/lib/schemas.ts, mobile/src/hooks/useParcelLookup.ts, mobile/src/components/surfaces/ReportBinding.tsx, mobile/src/components/surfaces/ReportPageHost.tsx, mobile/app/(app)/parcel-tool/[parcelId].tsx, mobile/src/constants/reportPage.ts, mobile/src/lib/persistFilter.ts, scripts/surfaces/parcel_product/F02/surfaces/mobile_parcel_detail.content.json, scripts/surfaces/_schema/census/mobile-product.json, scripts/surfaces/_schema/census/contracts.json, scripts/surfaces/parcel_product/F02/surfaces/mobile_parcel_detail.descriptor.json, scripts/surfaces/parcel_product/F02/contracts/contract_parcels_lookup.descriptor.json, scripts/surfaces/platform_shared/F14/surfaces/binding_mobile_report.descriptor.json, src/lib/surfaces/generated/surface-descriptor.d.ts, src/lib/surfaces/generated/validate-descriptor.mjs, mobile/src/generated/surfaces/mobile_parcel_detail.json, src/tests/fixtures/report-page/props, scripts/surfaces/report-page-capture.ts, docs/reports/generated/127-surface-registry.md, docs/reports/generated/127-surface-review-queue.md, src/tests/parcel-lookup-gate.infra.test.ts, src/tests/fix-tune.logic.test.ts, src/tests/consumer-parcel-lookup.infra.test.ts, src/tests/report-checked-producer.logic.test.ts, src/tests/surfaces/report-mobile.logic.test.ts, src/tests/surfaces/report-failure.logic.test.ts, src/tests/surfaces/nav-by-route.logic.test.ts, mobile/__tests__/reportScreen.mount.behaviour.test.tsx, mobile/__tests__/reportPage.behaviour.test.tsx, mobile/__tests__/reportScreens.golden.test.ts, mobile/__tests__/reportScreen.gateStability.behaviour.test.tsx, mobile/__tests__/useParcelLookup.test.ts, mobile/__tests__/reportChecked.behaviour.test.tsx, mobile/__tests__/offline.test.ts, mobile/__tests__/semiQuestionPage.behaviour.test.tsx, docs/specs/03-mobile/100_mobile_parcel_cost_tool.md, docs/specs/03-mobile/99_mobile_state_architecture.md, docs/specs/02-web-admin/126_maxbld_surface_standard.md, docs/specs/02-web-admin/136_mcfrontend_handbook.md, docs/specs/02-web-admin/128_surface_standard_policy.md, .cursor/MCFRONTEND-QUEUE.md
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Pre-register the expected moves, committed alone — "Pre-register the task's `rules[]` and expected moves" (.cursor/MCBYLAWS-QUEUE.md:109)
- [ ] #2 Failing tests are written into the plan and reviewed at plan altitude — "are written INTO the plan and reviewed at PLAN altitude" (docs/specs/00-architecture/08_agents.md:465)
- [ ] #3 `write_scope` declared in the brief — "The brief file opens with a front-matter block" (docs/specs/00-architecture/08_agents.md:144)
- [ ] #4 PLAN panel run with the lens set, never one generic pass — "NEVER run one generic pass" (docs/specs/00-architecture/08_agents.md:334)
- [ ] #5 Fold validated by a grounder that re-executes every claim — "one grounder re-executes every claim in the fold" (docs/specs/00-architecture/08_agents.md:458)
- [ ] #6 Built red first, then green, on the tip — "Red tests first, then the code, through the real hooks." (docs/specs/00-architecture/08_agents.md:490)
- [ ] #7 OUTPUT panel record committed with the work — "is committed with the work (R-KM)." (.cursor/MCBYLAWS-QUEUE.md:116)
- [ ] #8 McFrontend build only: queue row first — "No McFrontend work starts without its row in" (docs/specs/02-web-admin/126_maxbld_surface_standard.md:72)
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
Planner: Cairn-Plan-267
Plan id: PLAN-267-v2
Head read: 2fd2f6042 (wf2/board). Since v1 (4c22af6e8) only docs and backlog files changed, so every code line cited in v1 still holds. MD = ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md. Mock = ~/Buildo-scratch/lanes-20261125/mcfixv2-267/MOCK-LOADING-ENDINGS-v3.html (sha256 63e79a39a15d: the five screens approved in RR-0491 with the centring change; only its table's two rows were updated after RR-0492), read whole including its table and foot. This version replaces v1 and builds task-317 in the same lane, by RR-0477 (MD:2496) and RR-0488 (MD:2547). ROUND 1 FOLD (plan grounder Cairn-Ground-P267, board head a4a092bad; evidence in docs/reports/reviews/task-267/): RR-0492 (MD:2567), RR-0493 (MD:2570) and RR-0494 (MD:2574) are folded and every lens and seat finding is ruled in GROUNDER-PLAN.md. Where a line below disagrees with a line this round marked FOLD or RULED, the marked line governs. The plan grounder re-read each cited line at that head and writes FOLD-CHECK.md after the last fold (Spec 08 section 11.2, 08_agents.md:489). In this plan the shorthand `checked` means the wire field whatWeChecked (step 2).

## 1. Rules quoted first
- RR-0176, MD:783/786: "the animation takes 23 seconds - this goes to completion - the buttononly appears when the load is done". Ruled: "always runs to completion", "no 35 s cap".
- MD:695: "from the search page". The reading at :696: the calculation "starts when the user picks the address".
- RR-0485, MD:2533:
  - "4. We should not send a report without pricing" (task-343).
  - "5. Always - except for a tracked/stored lot or one that has previously been opened".
- RR-0486, MD:2538: "it may not be the users lot they are checking - just a note to clarify".
- RR-0490, MD:2559:
  - "1 a": keep "Could not load this report. Try again."
  - "3 b - let the animation finish and then say the report failed (same screen as 2a for a failure after 60 seconds)". REVERSED by RR-0492 item 3: RR-0492 reverses RR-0490 item 3 b (the failure shows right away, not after the lines).
  - "4 B - no report screen".
- RR-0491, MD:2563: "Teh mock looks great! 1 Change (1) Still building - Loading the report shuld be centered horizontally as opposed to left justified. Approved".
  - RR-0492, MD:2567, operator verbatim: "2. Keep them for now they are apart of an animation" (the check lines stay on the failure and no-report screens) and "3. If there is a report - the animation needs to complete but if the it fails then the user should know right away". His item 1 ("Is this what the 60 seconds refers to or another situation") is a question, not a ruling.
  - RR-0493, MD:2570, operator verbatim "approved" to the three points put to him as readings: 60 s from the pick IS the failure limit; the label "Checks for this lot" is shown as the mock draws it and RR-0493 replaces Spec 126:869 for this one label.
  - RR-0494, MD:2574, operator verbatim "A": a lot with no report shows the no-report screen at once, in under a second. The earlier reading (a no-report lot plays the lines to the end first) is withdrawn.
- RR-0477, MD:2496 (batching). RR-0482, MD:2518 ("larger tasks and using existing components").
- RR-0278, MD:1082: "I should only be charged a report if I find the address and lot Im looking for and a report is produced".
- MD:1409: "Phone retires yes" (keep the 3 retries).
- MD:699: "Once somebody opens a lot or tracks a lot - we have this lot data saved".
- Spec 126:869: "it doesnt need a title... it should be processing". The coordinator's relay on that line: remove the title "and any section labels".
- Spec 136 fe.35 (:136): no "live-progress word". The lock report-checked.logic.test.ts:279 refuses 'Checking your lot'.
- Spec 136 fe.31 (:124): existing components.
- Spec 128 Rule 3 and the FIX.TUNE precedent (semiQuestion.ts:17, config.continue_wait_ms): a timeframe is surface config backed by a registered logic variable, never a typed number.
- The "already discussed" skip rule: FOUND for opened lots only. MF-62/plan.md:44 says "Re-opened lot (already counted this period, MF-45 D-3 a): screen skipped". That plan was approved with "Mf-62 - yes" (phase1/open-questions.md:963). showsWhatWeChecked (what-we-checked.ts:51) built the rule the other way round: it shows the lines for a counted or unmetered lot and its only skip is already_counted, so showsWhatWeChecked is not used for the skip here; the skip below is a new rule from RR-0485 item 5 and the mock's table, named so in the Spec 100 note. No earlier line says to skip for a tracked or stored lot; the nearest is MD:699. The mock's table row "Lot opened before, or stored: No check lines. The report opens directly" now draws it, approved by RR-0491.

## 2. What exists and is reused
- Server:
  - lookup-flow.ts:79-90 (the stored read at :83, the compute at :87).
  - The meter at route.ts:114-123.
  - openReport (entitlements/index.ts:590-614; already_counted at :606; usageFor is private at :559).
  - readWhatWeChecked (what-we-checked.ts:167), which returns null on any error.
  - The core's checked tree and view: buildChecked (core.ts:130); a loading tree that carries checked (:239-243).
  - The view adds checked with paced=true on collapsed rows. With no href it draws no Skip (:397-403).
- Phone:
  - The persisted ['parcel-lookup', id] cache (useParcelLookup.ts:107-116; _layout.tsx:490; queryClient.ts:41).
  - reportScreenState (ReportBinding.tsx:399-403), lifecycleProps (:369-381), backProps (:383-389), the key lists (:392-394).
  - The host state (ReportPageHost.tsx:40-41) and the wall (useWallState, [parcelId].tsx:26).
  - The Back action (useGoBack).
- The existing 60 s:
  - setting maxbld_page_continue_wait_ms, read as SEMI_CONTINUE_WAIT_MS (semiQuestion.ts:17);
  - the timer boundedWait (:26-35).
- Words that already exist:
  - states.lifecycle.loading "Loading the report…", .error "Could not load this report. Try again.", .miss "No report for this lot yet." (report-presentation.json:87-89);
  - retry.text "Try again" (mobile_parcel_detail.content.json);
  - states.checked.ready / open "View report" / summary (report-presentation.json:139-142).
- The precedent for a request flag: semi=answered (useParcelLookup.ts:40-44; route.ts:81).
- Generators:
  - generate-surface-registry.mjs (--emit-descriptors :1596, default run, --check);
  - emit-mobile-surfaces.mjs --write;
  - report-page-capture.ts (MOBILE_LIFECYCLE_STATES :78).

## 3. What the rulings and the mock settle, and the answers to v1 (a)-(f)
- (a) The hand-off is unchanged from v1. The stored read and the compute run only on the parcelId form; a q hit sends page null and logs not_produced. The usage rows for an open that is finished are identical before and after (an open abandoned during the compute, by Back, a closed app or the give-up, is still counted once: the server finishes and counts, and Try again then reads already_counted; an abandoned open is still counted once, and this is the same as today's q hit counting while the person is still typing):
  - new lot: 1;
  - already counted: 0;
  - tracked lot (a stub today, useTrackedLots.ts:52): same as the two rows above;
  - at-limit new lot: 0, but the 403 wall moves from the search page to the report screen, and the at-limit wall shows after the compute (default, section 8 Q-g; today the q hit computes before it refuses too, so the wait is not new). This changes task-452 AC#2 (the search page no longer gets the limit refusal from a q hit): the Spec 100 note and a note on task-452 say so. While it waits the person sees the lines, then the holding spinner, then the wall.
  - The seam with 343 is route.ts:114-123 and consumer-lookup.ts:66 (343's) against lookup-flow.ts:79-90 (267's). 465 lands first (its card); then whichever of 267, 343 and 465 lands second re-reads route.ts:106-123 on the other's tip and reruns G1 and G3 (no order is assumed). 343's rule that no report is sent without pricing (RR-0485 item 4) makes `page` null for an unpriced lot, which this screen already shows as the no-report screen; 267 changes no meter rule.
- O4 is RULED by RR-0492 item 3 (RR-0492 reverses RR-0490 item 3 b) and RR-0494. With a report the animation still runs to completion (RR-0176). The rule: a failure shows at once, after the ruled retries or at 60 s (the default, ruled A by RR-0497: after the 3 ruled retries or at 60 s): screen 4 comes as soon as the report read has given up, without waiting for the lines. Also the no-report screen shows at once (RR-0494, under a second): screen 5 comes as soon as the report read answers with no page. On both the check lines stay as far as they got (RR-0492 item 2): the reveal stops at the count shown and adds nothing; with no fast read answer there are no lines.
- Give-up is RULED: 60 s from the pick (RR-0491, LD-2 A; on his word in RR-0493). 60 s is a failure bound, not an animation length: measured computes (BL-LOAD1 PLAN.md:31) were min 0.12 s, median 10.9 s, p90 27.2 s, max 33.6 s, so a lot reaches 60 s only on a failing, retrying or queued compute.
  - How it meets RR-0176: RR-0176 removed the 35 s cap on a report that is still arriving. Between 23 and 60 s that still holds: screen 3, and the button appears the moment the page lands.
  - RR-0491 with RR-0493 adds a failure bound at 60 s; that bound is new, not the 35 s cap coming back.
  - Owed: a dated note in Spec 126 §11a.7 and Spec 100 §4 saying that RR-0491 and RR-0493 bound RR-0176's "however long that takes" at 60 s from the pick. Also a card note on 267, whose title says "however long".
  - The pick mark is the report screen's mount, milliseconds after the push. 465's push is the pick.
- O3 Skip: the mock draws none. RR-0176 says the animation "always runs to completion", and the core draws no Skip when it is given no href (core.ts:399-403). Settled: no Skip, and none is passed.
- O2 picture: the mock draws lines only. Settled: no scene, no new component kind.
- O6 bar title: the mock draws the lot's address in the bar, taken from the checked view's address (what-we-checked.ts:45). Settled.
- The label "Checks for this lot" is drawn VISIBLE in the mock. O8 is RULED by RR-0493: it is shown as drawn, and RR-0493 replaces Spec 126:869 for this one label. It also is the clarifying note RR-0486 asked for. Owed: a Spec 126 section 11a.7 dated note and a Spec 136 fe.35 dated note (fe.35 says the checked object is never on a miss or error tree: the check lines on screens 4 and 5 are kept by RR-0492 item 2, drawn from the earlier fast read, not carried on those trees).
- Words per screen:
  - Screen 1: verbs and lines, server-built. The lot line uses the report area rule (display-rules.ts areaSqftM2Dot, sq ft first, then m2; operator 2026-11-14, MD:241: default imperial), so what-we-checked.ts:55 fmtArea changes and the mock's sq ft only is an example.
  - Screen 2: states.checked.ready plus states.checked.open "View report".
  - Screen 3: states.lifecycle.loading, centred (RR-0491's one change).
  - Screen 4: states.lifecycle.error plus retry.text.
  - Screen 5: states.lifecycle.miss plus NEW back_to_search.text "Back to search". The key lives in mobile_parcel_detail.content.json; its action is the existing `back` (useGoBack). It moves: the content file, ReportBinding.tsx:394 SCREEN_CONTENT_KEYS, the generated slice mobile/src/generated/surfaces/mobile_parcel_detail.json, reportPage.behaviour.test.tsx:156, reportScreens.golden.test.ts:285, props/miss.mobile.json, and reportScreen.mount.behaviour.test.tsx.
- (b) When the lines show (RR-0485 item 5 and the mock's table). They are skipped when:
  - the persisted cache holds a page (opened on this phone); or
  - the parcelId answer brings a page with no checked view (a stored lot, or already counted: showsWhatWeChecked); or
  - the checked view is null for an unknown lot or unusable pace (the producer's promise). This third arm is not one of RR-0485 item 5's two ruled cases: the null arm is a fallback, not a ruled skip. A page in with no checked view (a failed or null fast read) opens at once, since there is nothing to animate; lines are never skipped for a lot that has a checked view. The Spec 100 note says so.
  - Tracked lots: tracked lots are not built (useTrackedLots.ts:52 is a stub). A tracked lot is stored (MD:699), so the stored rule covers it once task-269 and task-265 land. No field now.
  - Not built now, and said so in the Spec 100 note: a lot already counted this month but off this phone's cache and with no stored page. Its lines play while it computes. The server-side skip needs an entitlements read on the fast read (usageFor export); that export is cut and is its own later card.
- (d) The wait today: 11-23 s per compute, and M1 computed the same lot twice (21.7 s plus 21.0 s). After this plan: one compute behind the lines; screen 3 from 23 to 60 s; screen 4 on a failure or at 60 s; screen 5 at once. What a tester sees today (the web live switch is off, maxbld-web.ts:19, so the compute answers null before any read): every lot ends on screen 5 within about 0.2 s, showing only the first verb; with the switch on locally a stored lot opens with no lines, a computed lot plays the lines and ends on screen 2, and a lot like 683 Danforth ends on screen 5 at once.
  - Timing: screen 4 comes after the 3 ruled retries (MD:1409; the library delays 1, 2 and 4 s), or at 60 s if that comes first. A compute that fails at about 20 s gives 4 tries by about 87 s, so for a slow failure 60 s wins; retries stop at the give-up (step 4).
  - 683 Danforth (compute null in 108 ms): screen 5 at once (RR-0494), the lines as far as they got.

## 4. The change, file by file, in build order (one lane; 267 then 317 in the same commits)
1. src/lib/parcels/lookup-flow.ts:79-90: `findOnly = parcelId === undefined`. The stored read and the compute are skipped when held or findOnly. The fast read is a second exported function in lookup-flow.ts (it takes the db handle for readWhatWeChecked; the route stays thin, Standard 10.3); the route passes it nothing about the meter. Header note :5-9 (it says the module imports no meter code and writes nothing; that stays true).
2. src/app/api/parcels/lookup/route.ts:
   - comments :13-19, :26-27;
   - O1-A2 (default, ruled A by RR-0497; it was the operator's word Q-e): parse the fast flag like semi (:78-84), in the route's parse list and in ConsumerParcelLookupQuerySchema (types.ts:40-54) with a refine that it belongs to parcelId and not with semi. The flag is fast=1. The fast read adds fast to the log record (route.ts:128-145);
   - on the fast read, return the stored page if present; else, unless held, the checked view: buildTree({lifecycle:'loading', what_we_checked}) then viewOf on target mobile with no href. The fast read does not skip the lines for an already-counted lot (the usageFor export is cut, its own later card). The meter code is unchanged.
   - the wire field is whatWeChecked (X-4 a, operator "x-4 a" 2026-11-11, .cursor/MCFRONTEND-QUEUE.md:367; the plan's `checked`): it carries view.checked only (ViewChecked, core.ts:399-403: the checked tree plus paced and href, href null here), not the whole view, under a strict CheckedViewSchema mirroring the core's checked tree in types.ts (a field of the existing `data` envelope), nullable with default null, with a refine that it is present only with a parcel and a null page. Fast read answers: a stored page when there is one (it goes through the same gate, rate bucket and meter code, so a served page counts as any page does), else whatWeChecked for a lot that is not held, else null. The fast read passes the same gate, rate bucket and meter code as the report read, and the meter code is unchanged: a facts-only answer has no page, so it is not_produced and counts nothing (RR-0278). The usageFor export is cut: src/lib/entitlements/index.ts is not touched.
3. mobile/src/lib/schemas.ts:432-441: whatWeChecked nullable and optional (the core's checked view shape, href nullable). This is the phone's Zod mirror of the strict server schema (Spec 90 section 13); an older server that sends no whatWeChecked parses to undefined, and the screen then shows no lines and today's spinner and Loading the report text.
4. mobile/src/hooks/useParcelLookup.ts:107-116:
   - the fast-read query (key ['parcel-checking', id]; a Spec 99 section 4 B1 row for the key parcel-checking is added in the same commit; the key parcel-checking is added to NOT_PERSISTED in mobile/src/lib/persistFilter.ts:28, with its pin in mobile/__tests__/offline.test.ts). The fast read does not retry (retry false; it is optional, and it shares the parcels-lookup bucket with the report read). The fast read is sent first and the report read only after it settles: the report query is enabled once the fast read has settled with no page (or has failed); a stored page from the fast read is stored under ['parcel-lookup', id] and no report read is sent;
   - retries stop at the give-up: a module-level set of parcel ids that gave up makes shouldRetryParcelLookup return false for them (cleared by Try again), and the attempt in flight is left to land; REPORT_GIVE_UP_MS is exported from this file as the existing SEMI_CONTINUE_WAIT_MS (step 9);
   - O5 is reversed: the registered 60 s stale refetch stays (LOOKUP_STALE_MS, maxbld_page_lookup_stale_ms, :113), because a page up to 24 h old must not be shown as current (RR-0485 item 4, the storage-policy note "never an old number", Spec 90 section 14 "fetch fresh data in the background silently"). A cached page skips the lines and shows at once; the refetch behind it is silent and never brings back lines or a checking state. Search of the record for a ruling that drops the refetch: none (logic_variables.json maxbld_page_lookup_stale_ms, FIX.TUNE).
5. mobile/src/components/surfaces/ReportBinding.tsx:
   - reportScreenState (:399-403) becomes total over (data, checked, isError, elapsedMs, gaveUp, answeredThisVisit) and reportScreenState reads no isFetching (Spec 99 section 6.5 and its 2026-11-24 note: page states come from stable signals; no carve-out is added). A page-null answer counts only when its dataUpdatedAt is at or after the screen mount (answeredThisVisit); a cached miss from an earlier visit is no data yet (finding 23, M1). Outputs: view | checking | ready | holding | error | miss. Only the report read decides the ending: error is the report read's isError after its retries or gaveUp; miss is the report read's answer with no page; the fast read's null or failure never decides an ending. An ending shows at once and the lines stop as far as they got. ready is the page in and the lines done, and the ready sentence draws only once the page is in. The wall first, then the endings: while view is null the wall (useWallState) wins over every lifecycle output, as at [parcelId].tsx:37. The ending choice is derived from server answers; the line reveal is animation (Spec 128 section 2.1 exception 4) and the 60 s is a device timer on a registered setting (exception 1), so no deviations row is added.
   - checkedProps(whatWeChecked, elapsedMs, ending) renders screens 1-5 from existing kinds only (View, Text, Button, ActivityIndicator); screen 3's spinner and words are centred. The host redraws the lines on a timer tick: a line is a node present or absent by its delay_ms against elapsedMs, so SurfaceRenderer is not changed (in#3). The buttons use the existing 44 px classes (reportPage.ts retry and back, min-h-[44px]); the new Back to search button uses the back action with a first-press guard so two taps pop once.
   - backProps gains the address title. The bar title is the checked address, else the answer's match address (lookup-flow.ts:93, the stored display address), so a no-report lot still shows its address (RR-0486 clarity note); with neither there is no title node at all.
   - LifecycleState stays loading | miss | error. The ending is a separate field, so no new states.lifecycle.* key is invented.
   - SCREEN_CONTENT_KEYS gains back_to_search.text and checks.label (the visible label, RR-0493).
6. mobile/src/components/surfaces/ReportPageHost.tsx:64-74:
   - the clock starts at mount, and the pick mark is kept per parcelId outside the component (a remount or a second push for the same lot does not restart it); elapsed is the time since that mark, re-derived when the app returns to the front, with the cache read first, so a page that landed in the background shows and give-up fires only with no page;
   - the give-up timer at 60 s from the pick mark, or never once a page is shown;
   - Reduce Motion: all lines at once, one announcement of summary (the gate is unchanged, below);
   - no auto-open; no Skip.
   - A late page that lands after the give-up stays in the cache. Try again reads the cache first and shows a page at once with no new compute; otherwise it clears the give-up mark, resets the clock, refetches the report read only (not the fast read), keeps the lines drawn in full and shows holding (spinner, Loading the report) until a page, an ending or a fresh 60 s. Reduce Motion keeps the same gate: the lines show at once, and the View report button still waits for the same min_ms (RR-0176).
7. mobile/app/(app)/parcel-tool/[parcelId].tsx:23-37: pass the fast read result, the report read's data and isError (no isFetching to the state), answeredThisVisit and the cache skip. The wall reads the report read's error, or the fast read's error only when it is a 403 refusal (a stored lot at the limit); every other fast error is ignored. The wall stays the first branch when there is no view. The host import list is unchanged: no new import in ReportPageHost.tsx (the 60 s and the clock come in as props from the mount and the hook), so surface-conformance.logic.test.ts:857 and the host list in bindings.json do not move.
8. mobile/src/constants/reportPage.ts: the line, tick, end and centred-hold classes.
9. The 60 s give-up: O7 is RULED as (a): the existing registered 60 000 (maxbld_page_continue_wait_ms), read through REPORT_GIVE_UP_MS exported from useParcelLookup.ts (which already imports SEMI_CONTINUE_WAIT_MS), not a second reader in the host. No seed row, no database step, no description edit (a seed edit is a database step). The semi wait and the report give-up share one value, said in the census why of the semi row (mobile-product.json, the semi surface row that lists semiQuestion.ts as the sole reader) and in a Spec 128 dated note; an own registered row is a later card by RR-0477.
10. Content:
    - mobile_parcel_detail.content.json gains back_to_search.text and checks.label (RR-0493);
    - report-presentation.json is unchanged: the placement of the three states checking, ready and holding is the census row and the state function, not new report-presentation.json rows. They carry no new words (their words are the existing states.lifecycle and states.checked rows), LifecycleState stays loading, miss and error, and the two new words (back_to_search.text, checks.label) sit in the screen's own content file beside retry.text and back.text (ReportBinding.tsx:394). The 2026-11-20 resolution keeps lifecycle rows in report-presentation.json for lifecycle states only.
    - scripts/surfaces/emit-mobile-surfaces.mjs is not edited (O7 (a)); the emit run only rewrites the generated slice.
11. Census first, then emit, then registry. OUTSIDE FILES LINE for each:
    1. scripts/surfaces/_schema/census/mobile-product.json, row mobile_parcel_detail (identity.id mobile_parcel_detail; :6151 at this head): states :299-325 gain checking, ready, holding; dated notes; the evidence cites move (gate route.ts, states [parcelId].tsx); and the semi surface row (about :7398-7405) gains the report give-up as a second reader of the value, in its why.
    2. scripts/surfaces/_schema/census/contracts.json, row contract_parcels_lookup (:22081):
       - metering.why: a q hit sends no page; the fast read counts only a stored page it serves (through the unchanged meter code);
       - the field whitelist gains whatWeChecked and the keys inside it; the count in the field_whitelist_parity check why moves with the list; the request side gains the fast input (not the whitelist, as semi: fix-tune.logic.test.ts:76). The pins that move with the list: fix-tune.logic.test.ts:80-82 (length 80 and slice(-3)) and consumer-parcel-lookup.infra.test.ts:140-152 (pick-by-name count); say where the new keys land in the list or relax the slice(-3) pin. Cite census rows by identity.id, not by line (the rebase over 465 moves lines); evidence cites move.
    3. `node scripts/violations/generate-surface-registry.mjs --emit-descriptors`, which writes:
       - mobile_parcel_detail.descriptor.json;
       - contract_parcels_lookup.descriptor.json;
       - src/lib/surfaces/generated/surface-descriptor.d.ts and validate-descriptor.mjs (expected byte-unchanged; if not, add them).
       Never edit a descriptor by hand (surface-registry.infra.test.ts:277-281).
    4. emit-mobile-surfaces.mjs --write, which writes mobile/src/generated/surfaces/mobile_parcel_detail.json.
    5. report-page-capture.ts: MOBILE_LIFECYCLE_STATES (:78) gains checking, ready, holding, error_lines, miss_lines (the endings carry the lines as far as they got; error_after and miss_after are retired names). The capture builds the props of the new states by calling checkedProps over a fixed fake whatWeChecked and elapsedMs, a second source beside buildTree. It writes src/tests/fixtures/report-page/props/*.mobile.json (5 new; loading, miss and error move). The test title that says 8 goldens in report-mobile.logic.test.ts:31-34 is renamed.
    6. generate-surface-registry.mjs default run, which writes docs/reports/generated/127-surface-registry.md and 127-surface-review-queue.md; its --check must be clean.
- Parity: the report detail is mobile only (identity.platforms ["mobile"]). There is no web/phone parity lock for its lifecycle; parity.golden.test.ts compares reading trees only. The pins that move are report-mobile.logic.test.ts:32 (the golden names), reportPage.behaviour.test.tsx:156 (the slice keys), reportScreens.golden.test.ts:285 (lifecycle refs), fix-tune.logic.test.ts:80-82 and consumer-parcel-lookup.infra.test.ts:152 (the whitelist), and report-checked.logic.test.ts (words; unchanged: the visible label sits in the screen content, not in states.checked).
12. Specs and queue:
    - Spec 100 §3.2 note (the q path sends no page; the fast read and the whatWeChecked field, X-4 a) and §4 note (the endings, 60 s as a failure bound, the skip rule as a new rule, tracked and off-phone lots not built, the at-limit move of task-452 AC#2). Spec 99 §4 B1 row for parcel-checking. Spec 136 fe.35 dated note (the kept lines on screens 4 and 5, RR-0492 item 2). Spec 128 dated note (the shared 60 000).
    - Spec 126 §11a.7 note (the app render; RR-0491 and RR-0493 bound RR-0176; Skip not drawn; RR-0493 replaces Spec 126:869 for the label Checks for this lot; the superseded G.3 auto-open).
    - .cursor/MCFRONTEND-QUEUE.md: one follow-up row to MF-62 for both cards, the next free id at claim (MF-99 at this head, :5, unless 465 took it). Order: claim the MF-62 follow-up row before any build commit (Spec 126:72, queue row first), not as a last step; its status moves in the commit that holds the work.

FILES (both cards): the Description's Files line is one complete Files line, the only list the checker and the brief read (write_scope is that line); it is these lines plus mobile/src/lib/persistFilter.ts, mobile/__tests__/offline.test.ts, src/tests/fix-tune.logic.test.ts, src/tests/consumer-parcel-lookup.infra.test.ts, src/tests/report-checked-producer.logic.test.ts, scripts/surfaces/platform_shared/F14/surfaces/binding_mobile_report.descriptor.json, src/lib/surfaces/generated/surface-descriptor.d.ts, src/lib/surfaces/generated/validate-descriptor.mjs, src/tests/surfaces/nav-by-route.logic.test.ts, mobile/__tests__/semiQuestionPage.behaviour.test.tsx, docs/specs/03-mobile/99_mobile_state_architecture.md, docs/specs/02-web-admin/136_mcfrontend_handbook.md, docs/specs/02-web-admin/128_surface_standard_policy.md:
- src/lib/parcels/lookup-flow.ts, src/app/api/parcels/lookup/route.ts, src/app/api/parcels/lookup/types.ts, src/lib/parcels/what-we-checked.ts (area line) (src/lib/entitlements/index.ts is not touched: the usageFor export is cut)
- mobile/src/lib/schemas.ts, mobile/src/hooks/useParcelLookup.ts, mobile/src/components/surfaces/ReportBinding.tsx, mobile/src/components/surfaces/ReportPageHost.tsx, mobile/app/(app)/parcel-tool/[parcelId].tsx, mobile/src/constants/reportPage.ts
- scripts/surfaces/parcel_product/F02/surfaces/mobile_parcel_detail.content.json, scripts/surfaces/_schema/census/mobile-product.json, scripts/surfaces/_schema/census/contracts.json, scripts/surfaces/parcel_product/F02/surfaces/mobile_parcel_detail.descriptor.json, scripts/surfaces/parcel_product/F02/contracts/contract_parcels_lookup.descriptor.json
- mobile/src/generated/surfaces/mobile_parcel_detail.json, src/tests/fixtures/report-page/props, scripts/surfaces/report-page-capture.ts, scripts/surfaces/emit-mobile-surfaces.mjs (O7), docs/reports/generated/127-surface-registry.md, docs/reports/generated/127-surface-review-queue.md
- src/tests/parcel-lookup-gate.infra.test.ts, src/tests/surfaces/report-mobile.logic.test.ts, src/tests/surfaces/report-failure.logic.test.ts (new)
- mobile/__tests__/reportScreen.mount.behaviour.test.tsx, mobile/__tests__/reportPage.behaviour.test.tsx, mobile/__tests__/reportScreens.golden.test.ts, mobile/__tests__/reportScreen.gateStability.behaviour.test.tsx, mobile/__tests__/useParcelLookup.test.ts, mobile/__tests__/reportChecked.behaviour.test.tsx (new)
- docs/specs/03-mobile/100_mobile_parcel_cost_tool.md, docs/specs/02-web-admin/126_maxbld_surface_standard.md, .cursor/MCFRONTEND-QUEUE.md

## 5. Tests first (red, then green)
Both cards' acceptance lines are the process lines AC1-AC8 (AC1 is commit 0, AC3 is the Files line, AC7 the panel record, AC8 the queue row first; all in this section and step 12). These tests serve AC2 (written into the plan) and AC6 (red first). Each is also tied to a scope item below.

Server, src/tests/parcel-lookup-gate.infra.test.ts:
- G1 "a q hit never runs the stored read or the compute": page null, meter not_produced, no insert (267 hand-off).
- G2 "compute once per opened lot": q then parcelId=P-45 with a stored miss. Expect computeCustomerPageResponse called once and 1 insert.
- G3 "meter counts unchanged" (it.each on parcelId): new lot counted 1; already counted 0; at limit 403 with 0; at limit with a counted lot 200 with 0. Each case's q call before it inserts 0.
- Rewrite the q-path counting tests, with a dated note, so no lock is dropped: :233-244 (a hit writes one row), :245-253 (the same lot via q and via parcelId counts once), :308-312 (the log line carries access and meter) and :369-376 (a report produced counts once). The q call in each now asserts page null, no insert and meter not_produced; the INSERT shape, the no-raw-q lock and the meter log line move to a parcelId call: the INSERT shape, the no-raw-q lock and the meter log line move to a parcelId call (the INSERT text match, [UID,'P-45',NOW], RAW_Q never in txQuery.mock.calls, and meterLog() holding meter counted). :343-350 and :353 stay as the q-call-for-an-unsure-lot read lock.
- G4 "683 Danforth": parcelId=5361889 with the compute mocked null. Expect 200, page null, meter not_produced (317, finding 31).
- G5 (A2): the fast flag returns whatWeChecked and no compute. A stored page is returned and counted. A held lot gets no checked view. The boundary parse accepts the field and refuses a stray key (strict). The sequence fast read then report read for one lot computes once and inserts once. The error paths of the fast read: fast with q is 400, a thrown read gives null (not a 500) and logs, an at-limit stored lot gives 403 with no insert, and the query reads from the parcels-lookup bucket. A route test that the fast flag with no parcel is refused.

src/tests/surfaces/report-failure.logic.test.ts (new; a table over reportScreenState, total, 317 R2). Rows:
- page, then view;
- lines playing with no page, then checking;
- lines done with a page, then ready;
- lines done with no page and under 60 s, then holding;
- an error during the lines, then error at once with the lines as far as they got (RR-0492 item 3), after the retries or at 60 s;
- an isFetching toggle gives the same output for every row (Spec 99 section 8.3), and each table test has a planted-defect row (a reportScreenState that ignores gaveUp, or reads isFetching, is red; fe.56);
- a page in with the lines not done, then checking; a page in and the lines done, then ready, and no ready sentence before the page is in;
- Try again with a late page in the cache, then view; Try again with none, then holding with the lines in full;
- a cached miss from an earlier visit while the report read runs, then checking;
- 60 s passed, then error;
- a miss during the lines, then miss at once (RR-0494), the lines as far as they got;
- no checked view with a miss, then miss at once;
- a cached page, then view with no lines.

src/tests/surfaces/report-mobile.logic.test.ts: the golden names include the new states checking, ready, holding, error_lines and miss_lines; the capture writes them byte for byte (317 R1).

mobile/__tests__/reportChecked.behaviour.test.tsx (new, fake timers):
- C1: verbs at delay_ms, facts at done_ms.
- C2: page at 5 s, no "View report" and no ready sentence until 23000; no auto-open; no Skip.
- C3: no page at 30 s gives the centred spinner and "Loading the report…".
- C4: no page at 60000 ms gives "Could not load this report. Try again." with the lines kept.
- C5: a 500 at 8 s, with the retries spent, gives the failure at once (RR-0492), the lines as far as they got; a failing compute at 20 s gives screen 4 at 60 s and no further retry afterwards. C9: Back during the compute, then the lot opened again, shows the cached page or lines again with no second count (an abandoned open is counted once). C10: the fast read fails, then no lines and today's spinner, and the report read is still sent. C11: a 403 on the report read shows the wall, not screen 4.
- C6: a miss at 0.1 s gives "No report for this lot yet." and "Back to search" at 0.1 s (RR-0494); a press calls back, and a second press does not.
- C7: a late page after the give-up, then Try again shows it with no fetch; with no page, Try again shows holding and a failing second read ends on screen 4 at a fresh 60 s.
- C8: Reduce Motion gives all lines at once and one announcement, and the button still waits for min_ms.

mobile/__tests__/reportScreen.mount.behaviour.test.tsx:
- M1: a cached miss from an earlier visit shows no miss text until this visit's answer (dataUpdatedAt at or after the mount).
- M2: a cached page opens at once with no lines; the refetch behind it is silent and brings back no lines or checking state (O5 reversed).
- M3: the address is the bar title; with no address there is no title node.

reportScreens.golden.test.ts: the miss refs are [states.lifecycle.miss, back_to_search.text]; components only from mapping.mobile.REPORT. reportPage.behaviour.test.tsx:156: the slice keys.

The phone tests run before every push: the mobile-tests step of .husky/pre-push-checks.sh (task-462, Spec 98 section 5 note of 2026-11-24). Red first for a phone test is the same file run alone before the code, its output kept in the lane report.
Commit 0, alone: the pre-registration (rules[] = the RR list of section 1 and the expected moves = the test and golden names of this section; .cursor/MCBYLAWS-QUEUE.md:109). The OUTPUT panel record docs/reports/panels/task-267.json (and task-317's, one lane) is committed with the work (.cursor/MCBYLAWS-QUEUE.md:116).

## 6. Limits, and how failure is caught
- Not done:
  - no change to the search box, index.tsx or lotMap.ts (465);
  - no change to the meter rule (343);
  - no change to the report page content;
  - no migration and no new seed row (see O7);
  - MAXBLD_WEB_LIVE stays false;
  - no web failure page, because the web report render is not built (task-285, task-287);
  - no scene picture.
- Risks, and how the build catches each:
  - A compute that ends after the give-up is still counted on the server. C7 keeps the counted report reachable with no second compute, and G3 shows no double count.
  - The at-limit wall now shows after the compute (G3); no worse than the q hit today, and under the detail rate bucket. A stored lot at the limit gets the wall at once from the fast read.
  - A failing compute runs up to 4 times, per the ruled retries, and no more after the give-up (retries stop at the give-up). The platform request timeout stays UNVERIFIED and is a launch precondition (BL-LOAD1B TRIAGE: no deadline, no singleflight); a cut-off shows as an error, so the screen ends on 4.
  - Census and descriptor drift is caught by --check and surface-registry.infra.test.ts:277.
  - Cite drift is caught by check-cites.
  - Missing paths are caught by the close check.

## 7. Notes owed (backlog CLI only)
- task-267: PLAN-267-v2; the new title (the address replaces "Checking your lot"); the Files line above (one complete Files line, in the Description); a note on "however long" against the 60 s give-up (RR-0493); RR-0492, RR-0493 and RR-0494.
- task-317: built in lane 267 (RR-0477, RR-0488); its Files line is folded into 267's.
- task-343: the seam in section 3 (a).
- task-465: the hand-off removes its O1 risk.
- doc-16 A-MF62 (35 s, "updating"): a dated note through `backlog doc edit` that it is superseded by RR-0176 and RR-0491.
- task-452: a dated note that AC#2 changes (the search page no longer gets the limit refusal from a q hit; the report screen shows the wall after the compute).
- doc-2 G.3 (the report opens by itself) is superseded by RR-0176 and the approved mock (the View report button): a dated note. G.2's lot outline is not drawn (the mock draws lines only; no component exists).
- the HELD note of 2026-11-20 is superseded: the pilot hold (task-390 still RUNNING) is overtaken by the operator's go of 2026-11-25 (RR-0486, RR-0488), and these are lifecycle states of the report screen, not page-table rows (the 2026-11-20 resolution); a dated note on 267 and 317 says so.
- task-317: its LD-3 B (animation finishes, then the failure) is superseded by RR-0492; its Files line is folded into 267's one Files line.
- Spec dated notes and the queue row as in step 12.

## 8. Choices (round 1 fold: O5, O7, O8 are settled; Q-a, Q-e and Q-g are ruled by RR-0497, all A)
- O1, the source of the lines (L2-1, MD:1276):
  - A1: the lines arrive with the page, so the lines start after the compute. This breaks "always to the end" timing and the 23 s overlap.
  - A2: a fast parcelId read with one optional flag, the semi=answered precedent. It returns the stored page or the checked view and runs no compute. The flag and the response field `checked` (X-4 a, ruled) need his word under RR-0392.
  - Default A2. The mock's timeline (lines from 0 s while the report builds) needs it. Q-e: the flag and the field are his under RR-0392 (the field name is ruled, X-4 a); if the operator picks A1, there is no flag and no field, screen 1 shows the verbs only with the spinner during the compute (no lines), and the lines then come with the page.
- O5 is reversed (see step 4): the registered 60 s stale refetch stays; only the lines are skipped for a cached page.
- O7, the 60 s value:
  - (a) Read the existing registered 60 000 (maxbld_page_continue_wait_ms, via the semi slice). No database step; one value serves both waits; dated note.
  - (b) A new seed row and config.give_up_ms. That is a database step, so its own card by RR-0477.
  - (c) A typed number. Breaks Spec 128 Rule 3.
  - RULED (a): read REPORT_GIVE_UP_MS; (b), an own row, is a later card (RR-0477). Q-a, Q-e and Q-g are RULED by RR-0497 (MD:2588, operator verbatim: "As per the 3 questions 2. A - whatever the existing animation does - I assume this is the checklines 3. a 1 a"): the defaults stand: (a) A, after the 3 ruled retries or 60 s; (e) A, the fast flag and field, so the check lines start at the pick; (g) A, the at-limit wall after the compute.
- O8, the "Checks for this lot" label:
  - visible as drawn: a new key checks.label, plus a Spec 126 note that RR-0491 replaces :869 for this one label;
  - or a screen-reader label only (the v8 aria-label, build.mjs:801).
  - RULED (RR-0493): visible as drawn; Spec 126 and Spec 136 dated notes owed.
- Settled since v1: O2, O3, O4, O5 (reversed), O6, O7 (a), O8 (visible), O7-batch (task-317 is now in this lane).

What this plan assumes of 465 (final for round 1; lane BL-MCFIX465 is building now):
- A pick (Enter, a row tap, or a chip tap that submits) pushes /(app)/parcel-tool/<id> through parcelSearchRoute.
- No search code reads `page`.
- The web search mirrors the phone and the web report stays off.
- The four new semi keys in lotMap.ts, and WallBinding, are not touched here.
- On return the box clears (465's focus effect), so "Back to search" lands on an empty box.
- Files both cards touch:
  - census/mobile-product.json (different rows, cite rows by identity.id: mobile_parcel_detail and the semi row for 267, 465's rows for 465);
  - the --emit-descriptors run and the default registry run, with 127-surface-registry.md and 127-surface-review-queue.md;
  - the emit-mobile-surfaces.mjs run (different slices);
  - Spec 100 and Spec 126 (separate dated notes);
  - the queue.
- 267 rebases on 465's tip and reruns every generator: steps 11.3 to 11.6 only after 11.1 and 11.2 are re-merged.

## 9. UNVERIFIED
- Settled by reading: the phone schema (schemas.ts:432-441) is plain, not strict, so it accepts the field, and href null passes (core.ts:403); the server schema is new and strict (step 2).
- Whether report_check_* and the citywide snapshot row exist on the test stack.
- Whether surface-descriptor.d.ts moves on the emit.
- Whether report-checked.logic.test.ts pins the states.checked key list.
- The platform request timeout.
- Nothing was run; this was read only. The grounder re-read the cited lines at a4a092bad and ran no test runner. The platform request timeout stays UNVERIFIED (launch precondition, section 6).

Plan review round 1: 126 folded, 0 task, 0 ruling, 0 wontfix, 7 pile; grounder docs/reports/reviews/task-267/GROUNDER-PLAN.md; triage docs/reports/reviews/task-267/TRIAGE-PLAN.md
plan-compliance-inc-S#1 HIGH folded whichever of 267, 34
plan-compliance-inc-S#2 HIGH folded claim the MF-62 foll
plan-compliance-inc-S#3 HIGH folded Commit 0, alone: the
plan-compliance-inc-S#4 HIGH folded the mobile-tests ste
plan-compliance-inc-S#5 MED folded The plan grounder re
plan-compliance-inc-S#6 MED folded one complete Files l
plan-compliance-inc-S#7 MED folded panel record docs/re
plan-compliance-mobile-90#1 HIGH folded Spec 99 section 4 B1
plan-compliance-mobile-90#2 HIGH folded claim the MF-62 foll
plan-compliance-mobile-90#3 MED folded Commit 0, alone: the
plan-compliance-mobile-90#4 MED folded tracked lots are not
plan-compliance-mobile-90#5 MED folded checked address, els
plan-compliance-mobile-90#6 MED folded phone's Zod mirror o
plan-compliance-mobile-90#7 MED folded is reversed: the reg
plan-compliance-mobile-98#1 HIGH folded the mobile-tests ste
plan-compliance-mobile-98#2 HIGH folded reportScreenState re
plan-compliance-mobile-98#3 HIGH folded Commit 0, alone: the
plan-compliance-mobile-98#4 MED folded the HELD note of 202
plan-compliance-mobile-98#5 MED folded one complete Files l
plan-compliance-mobile-98#6 MED folded the wire field is wh
plan-compliance-mobile-99-p1#1 HIGH folded reportScreenState re
plan-compliance-mobile-99-p1#2 HIGH folded Spec 99 section 4 B1
plan-compliance-mobile-99-p1#3 HIGH folded table test has a pla
plan-compliance-mobile-99-p1#4 HIGH folded RR-0493 replaces Spe
plan-compliance-mobile-99-p2#1 HIGH folded The plan grounder re
plan-compliance-mobile-99-p2#2 MED folded the key parcel-check
plan-compliance-mobile-99-p2#3 MED folded claim the MF-62 foll
plan-compliance-mobile-99-p2#4 MED folded panel record docs/re
plan-compliance-mobile-99-p2#5 MED folded RR-0493 replaces Spe
plan-compliance-mobile-99-p2#6 MED folded the HELD note of 202
plan-compliance-ms-S#1 HIGH folded claim the MF-62 foll
plan-compliance-ms-S#2 HIGH folded the mobile-tests ste
plan-compliance-ms-S#3 HIGH folded RR-0493 replaces Spe
plan-compliance-ms-S#4 MED folded the wire field is wh
plan-compliance-ms-S#5 MED folded REPORT_GIVE_UP_MS ex
plan-compliance-ms-S#6 MED folded The plan grounder re
plan-compliance-ms-S#7 MED folded one complete Files l
plan-compliance-plan-protocol#1 HIGH folded The plan grounder re
plan-compliance-plan-protocol#2 HIGH folded Commit 0, alone: the
plan-compliance-plan-protocol#3 HIGH folded The plan grounder re
plan-compliance-plan-protocol#4 HIGH folded panel record docs/re
plan-compliance-plan-protocol#5 MED folded the HELD note of 202
plan-compliance-plan-protocol#6 MED folded the mobile-tests ste
plan-compliance-plan-protocol#7 MED folded is reversed: the reg
plan-compliance-plan-protocol#8 MED folded Estimate: GUESS (two
plan-compliance-surface-136#1 HIGH folded a Spec 136 fe.35 dat
plan-compliance-surface-136#2 MED folded reportScreenState re
plan-compliance-surface-136#3 MED folded table test has a pla
plan-compliance-surface-136#4 MED folded table test has a pla
plan-engineering-eng-all#1 HIGH folded The error paths of t
plan-engineering-eng-all#2 MED folded The fast read adds f
plan-engineering-eng-all#3 MED folded a strict CheckedView
plan-engineering-eng-all#5 MED folded the existing 44 px c
plan-error-paths#1 HIGH folded stop at the give-up:
plan-error-paths#2 MED folded read decides the end
plan-error-paths#4 MED folded read decides the end
plan-error-paths#5 MED folded again reads the cach
plan-error-paths#6 MED folded is reversed: the reg
plan-plan-review-deepseek#1 MED folded The platform request
plan-plan-review-deepseek#2 HIGH folded passes the same gate
plan-plan-review-deepseek#3 MED folded The wall first, then
plan-plan-review-deepseek#4 MED folded the pick mark is kep
plan-plan-review-deepseek#5 MED folded an abandoned open is
plan-plan-review-deepseek#6 MED folded Motion keeps the sam
plan-plan-review-deepseek#7 MED folded again reads the cach
plan-plan-review-deepseek#8 MED folded the pick mark is kep
plan-plan-review-deepseek#9 MED folded is reversed: the reg
plan-plan-review-deepseek#10 MED folded the key parcel-check
plan-plan-review-deepseek#11 MED folded an older server that
plan-plan-review-deepseek#13 MED folded REPORT_GIVE_UP_MS ex
plan-plan-review-deepseek#14 MED folded usageFor export is c
plan-plan-review-deepseek#15 MED folded checked address, els
plan-security#1 MED folded passes the same gate
plan-security#2 MED folded the at-limit wall sh
plan-security#4 MED folded is reversed: the reg
plan-ux#1 HIGH folded the no-report screen
plan-ux#2 HIGH folded again reads the cach
plan-ux#3 MED folded checked address, els
plan-ux#4 MED folded the at-limit wall sh
plan-ux#5 MED folded RR-0493 replaces Spe
plan-ux#6 MED folded if the operator pick
in#1 HIGH folded fix-tune.logic.test.
in#2 HIGH folded the wire field is wh
in#3 HIGH folded redraws the lines on
in#4 HIGH folded passes the same gate
in#5 MED folded usageFor export is c
in#6 MED folded REPORT_GIVE_UP_MS ex
in#7 MED folded The capture builds t
in#8 MED folded import list is uncha
in#9 MED folded a second exported fu
rc#1 HIGH folded report read only aft
rc#2 HIGH folded stop at the give-up:
rc#3 MED folded What a tester sees t
rc#4 MED folded 60 s is a failure bo
rc#5 MED folded an abandoned open is
rc#6 MED folded the at-limit wall sh
rc#8 MED folded the ready sentence d
rc#9 MED folded showsWhatWeChecked i
rg#1 CRITICAL folded RR-0492 reverses RR-
rg#2 HIGH folded a failure shows at o
rg#3 HIGH folded 60 s is a failure bo
rg#4 HIGH folded REPORT_GIVE_UP_MS ex
rg#5 HIGH folded is reversed: the reg
rg#6 HIGH folded the INSERT shape, th
rg#7 MED folded the at-limit wall sh
rg#8 MED folded RR-0493 replaces Spe
rg#9 MED folded doc-2 G.3 (the repor
plan-compliance-step-132#1 HIGH folded one complete Files l
plan-compliance-step-132#2 HIGH folded Commit 0, alone: the
plan-compliance-step-132#3 HIGH folded The plan grounder re
plan-compliance-step-132#4 MED folded placement of the thr
plan-compliance-step-132#5 MED folded the mobile-tests ste
plan-compliance-step-132#6 MED folded the HELD note of 202
plan-compliance-step-132#7 MED folded the null arm is a fa
plan-compliance-step-132#8 MED folded RR-0493 replaces Spe
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-19 1·B validation (R10, RR-0257, task-316): KEPT (dep task-266; LOAD.3 dropped, label dep-dropped is right): RR-0176 the animation keeps its length and the button waits for report AND See details. Elements G.2 G.3 G.4 (MF-62 row DONE, queue :467; follow-up row to MF-62 claimed by the build lane). The failure screen the plan text owes is task-317 LOAD.4. Panel and build pass owed.

Dated note 2026-11-19 (M-246, prior text kept; RR-0300 · task-267 · Backlog; operator, verbatim: "Those dependencies are not listed as operator tasks with incra 1b")

2026-11-19 (R13, RR-0300, task-339): this task waits on the OPERATOR task task-341 (the LOAD chain and the two 6c tasks); recommendation there, verified by review r1 of task-339. Status and dependencies unchanged.

Dated note 2026-11-19 (M-246, prior text kept; RR-0301 · task-267 · Backlog; operator, verbatim: "task 341 approved")

2026-11-19 (R16, task-347, RR-0300): What-we-checked wiring (gap Q9, D04) is ALREADY RULED, no OPERATOR task: operator verbatim 'x-4 a' (2026-11-11), X-4 (a): readWhatWeChecked is wired into GET /api/parcels/lookup as a nullable whatWeChecked (.cursor/MCFRONTEND-QUEUE.md:363); ONE-5 'y' (MORNING-DECISIONS.md:738) covered the bundle naming gap Q9 (a reading). The BL-W plan proposes this task as its carrier; today the title of this task does not name it and task-123's title keeps it conditional on Q9. Carrier choice goes to the orchestrator by dated note (loose end on task-343). OPERATOR task-348 (D1) also bears on this screen: before launch a phone tester sees the miss page, not the lot loading lines' report. Status unchanged.

2026-11-19 taken on the board at lane launch (lane BL-LOAD2, worktree /Users/brettpreston_macmini/Buildo-wt-load2, branch wf1/inc1b-load2), RR-0240

Dated note 2026-11-19 (lane BL-LOAD2, stage 1; prior text kept): the measured plan and impact map are in docs/reports/lanes/2026-11-19/BL-LOAD2/ (PLAN.md, IMPACT.md, TRIAGE.md, REPORT.md, checks.out, r1-*.txt). LOAD.2 at its smallest: the app shows the ruled sequence (the checked lines, ready line, button) for the set 23 s and shows the button only when the lookup has returned a page. BUILT today: a spinner and "Loading the report…" (mobile/src/components/surfaces/ReportBinding.tsx:369-380); the core, producer and web ReportView for the checked tree (MF-62 DONE). NOT built: the producer is wired to no route (no whatWeChecked in src/app/api/parcels/lookup/route.ts or mobile/src/lib/schemas.ts:429-438), the app has no render of it. It cannot be built whole now: (a) the lines never reach the app, the smallest missing piece is a fast read at the pick (D-1; no task carries it, loose end noted on task-343); (b) the picture behind the lines has no existing component (D-2). Six operator decisions drafted D-1 to D-6 (PLAN.md section 4), none decided. Seam with task-317 (LOAD.4): LOAD.2 owns lifecycle loading and the give-up timer, LOAD.4 renders lifecycle error. Measured: 9 --check scripts all exit 0 on head 2e127dffa. Lens set: compliance, ux, error-paths, code-review, 30 findings, 21 kept, 4 rejected, 3 agreed rejects, 4 duplicates (TRIAGE.md). stage 1 plan done; stage 2 build waits on the orchestrator. Files: src/app/api/parcels/lookup/route.ts, mobile/src/lib/schemas.ts, mobile/src/hooks/useParcelLookup.ts, mobile/src/components/surfaces/ReportBinding.tsx, mobile/src/components/surfaces/ReportPageHost.tsx, mobile/app/(app)/parcel-tool/[parcelId].tsx, mobile/src/generated/surfaces/mobile_parcel_detail.json, scripts/surfaces/_schema/report-presentation.json, scripts/surfaces/_schema/census/contracts.json, mobile/__tests__/reportScreen.mount.behaviour.test.tsx, mobile/__tests__/reportPage.behaviour.test.tsx, mobile/__tests__/reportScreens.golden.test.ts, mobile/__tests__/reportChecked.behaviour.test.tsx, src/tests/fixtures/report-page/props/loading.mobile.json, docs/specs/02-web-admin/126_maxbld_surface_standard.md, docs/specs/03-mobile/100_mobile_parcel_cost_tool.md, .cursor/MCFRONTEND-QUEUE.md

Dated note 2026-11-19 (lane BL-LOAD2; prior text kept): seam answers for LOAD.4 folded into PLAN.md section 1.5a (S1 order, S2 address source before the lookup answers, S3 no still asset in the repo, S4 the host planned for either LD-3 answer, D-5 and LD-2 are one question). Stage 2 file list gains tests T14, T15 and T12a/T12b. stage 1 plan done; stage 2 build waits on the orchestrator.

HELD (operator 2026-11-20 "4. Hold the three unbuilt pages until the pilot result"): build as rows of the page table once the PAGE.TABLE pilot passes.

Operator 2026-11-20, verbatim: "Let the grounder resolve them all as long as the result is compliant" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1476). Resolved by the separate grounder, 2026-11-20 (the lane verifies each cited fact before building): these are lifecycle states of the report screen: rows in the existing report lifecycle data (report-presentation.json) drawn by the existing ReportBinding; no new builder function and no move into the page-table builder (approved item 3 "Leave the reports as components"). Still required for 1·B (RR-0176 MD:785; RR-0179 MD:789). After the pilot folds; 317 after 267 stage 2 and LD-1, 2, 3, 5.

Dated note 2026-11-20 (M-246, prior text kept; RR-0341 · task-267 · Backlog; operator, verbatim: "approved")

McFixV2 addition 2026-11-25 (operator phone walk; rulings RR-0483, RR-0485, RR-0486 in ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2523, :2533, :2538). Not yet planned. (a) Operator: "Task 267 - why does it say Checking Your Lot - it may not be the users lot they are checking - just a note to clarify": the title wording is to be clarified. (b) Operator, on whether the animation always runs: "5. Always - except for a tracked/stored lot or one that has previously been opened - we have already discussed this". (c) From the walk (findings 22, 23, 30 and measured M1): the search box today waits 11 to 23 s because the lookup computes the report before answering, the same lot is computed 2 to 4 times, and a no-report screen shows during the wait. This card takes the hand-off: the search only finds the lot, the calculation starts on the pick and runs once behind the loading screen (task-266 built the start; task-465 is the search box).

2026-11-25: plan PLAN-267-v1 by Cairn-Plan-267 set on the card (hand-back saved at ~/Buildo-scratch/lanes-20261125/mcfixv2-267/PLAN.md). Not yet reviewed; built after task-465 lands.

2026-11-25 (RR-0491, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2563, operator verbatim on that line): the loading endings mock is APPROVED with one change made (the still-building spinner and words centred). Approved mock: ~/Buildo-scratch/lanes-20261125/mcfixv2-267/MOCK-LOADING-ENDINGS-approved.html sha256 f8e9c7da68f9 (https://claude.ai/artifact/575VKBneBnsMszXVvRkTVm version 2). As drawn: lines play to the end; View report button only when the lines are done and the report is in; still building keeps the lines with a centred spinner and Loading the report…; failure (build failed or 60 seconds from the pick) keeps the lines and shows the built sentence with Try again; no report keeps the lines and shows No report for this lot yet. with Back to search (new words). Orchestrator reading: Approved answers the 60 seconds, lines-stay and play-to-the-end points as drawn.

2026-11-25: plan PLAN-267-v2 by Cairn-Plan-267 replaces v1 on the card (saved at ~/Buildo-scratch/lanes-20261125/mcfixv2-267/PLAN-v2.md); it builds task-317 in the same lane (RR-0477, RR-0488, RR-0490, RR-0491). Not yet reviewed. Built after task-465 lands.

2026-11-25 (RR-0492, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2567, operator verbatim on that line): a failure shows RIGHT AWAY, not after the lines finish; this changes RR-0490 item 3 b and PLAN-267-v2 where it says a failure or miss waits for the lines to end. With a report the animation still completes. The check lines stay on the failure and no-report screens for now. Orchestrator reading, put back to him: right away also covers a lot with no report, and means as soon as the failure is known. Mock table updated: ~/Buildo-scratch/lanes-20261125/mcfixv2-267/MOCK-LOADING-ENDINGS-v3.html sha256 63e79a39a15d.

2026-11-25 (RR-0493, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2571, operator verbatim: "approved" to the three points put to him): 60 seconds from the pick is the failure limit; the label Checks for this lot is shown as the mock draws it (replaces Spec 126:869 for that one label); a no-report lot shows the no-report screen at once (approved as read; one A/B put back to him).

2026-11-25 (RR-0494, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2575, operator verbatim "A"): a lot with no report shows the no-report screen at once, not after the lines. Confirms RR-0493.
<!-- SECTION:NOTES:END -->
