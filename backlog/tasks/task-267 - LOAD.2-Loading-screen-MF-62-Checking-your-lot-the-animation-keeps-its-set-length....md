---
id: TASK-267
title: >-
  LOAD.2 Loading screen (MF-62 Checking your lot): the animation keeps its set
  length...
status: WAITS
assignee:
  - '@lane-BL-LOAD2'
created_date: '2026-11-19T04:57:00Z'
updated_date: '2026-11-25T18:56:00Z'
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
Estimate: UNMEASURED

Plan text at the snapshot: RULED; panel + build pass owed; edge case owed: the screen when a load fails; waits LOAD.1
slicePart: page and binding
planNote: storage-policy: dependsOn LOAD.1,LOAD.3 (the 35 s seed max (LOAD.3); the updating state is the existing lifecycle loading, no new task needed here (seat K))
planNote: storage-policy: title + ; where the numbers are not ready at the maximum the report opens with the "updating" state, never an old number (A-MF62) (screen is not a gate for Skip and re-open edges)
planNote: loading-r2: title Loading screen (MF-62 Checking your lot): the animation keeps its set length (23 s today) and always runs to completion; the button to open the report shows only when the report AND See details are loaded, however long that takes (no 35 s cap) (operator 2026-11-18 MORNING-DECISIONS.md ("so right now the animation takes 23 seconds ... the report and the details should be loaded" + "yes that is correct"))
planNote: loading-r2: status RULED; panel + build pass owed; edge case owed: the screen when a load fails; waits LOAD.1 (operator 2026-11-18 MORNING-DECISIONS.md ("so right now the animation takes 23 seconds ... the report and the details should be loaded" + "yes that is correct"))
who (plan text): McFrontend lane (MF-62 follow-up)
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
Head read: 2fd2f6042 (wf2/board). Since v1 (4c22af6e8) only docs and backlog files changed, so every code line cited in v1 still holds. MD = ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md. Mock = ~/Buildo-scratch/lanes-20261125/mcfixv2-267/MOCK-LOADING-ENDINGS-approved.html, read whole including its table and foot. This version replaces v1 and builds task-317 in the same lane, by RR-0477 (MD:2496) and RR-0488 (MD:2547).

## 1. Rules quoted first
- RR-0176, MD:783/786: "the animation takes 23 seconds - this goes to completion - the buttononly appears when the load is done". Ruled: "always runs to completion", "no 35 s cap".
- MD:695: "from the search page". The reading at :696: the calculation "starts when the user picks the address".
- RR-0485, MD:2533:
  - "4. We should not send a report without pricing" (task-343).
  - "5. Always - except for a tracked/stored lot or one that has previously been opened".
- RR-0486, MD:2538: "it may not be the users lot they are checking - just a note to clarify".
- RR-0490, MD:2559:
  - "1 a": keep "Could not load this report. Try again."
  - "3 b - let the animation finish and then say the report failed (same screen as 2a for a failure after 60 seconds)".
  - "4 B - no report screen".
- RR-0491, MD:2563: "Teh mock looks great! 1 Change (1) Still building - Loading the report shuld be centered horizontally as opposed to left justified. Approved".
  - The orchestrator's reading at :2564-2565: the give-up is 60 s from the pick; the lines stay on the failure and no-report screens; a no-report lot plays the lines to the end first.
- RR-0477, MD:2496 (batching). RR-0482, MD:2518 ("larger tasks and using existing components").
- RR-0278, MD:1082: "I should only be charged a report if I find the address and lot Im looking for and a report is produced".
- MD:1409: "Phone retires yes" (keep the 3 retries).
- MD:699: "Once somebody opens a lot or tracks a lot - we have this lot data saved".
- Spec 126:869: "it doesnt need a title... it should be processing". The coordinator's relay on that line: remove the title "and any section labels".
- Spec 136 fe.35 (:136): no "live-progress word". The lock report-checked.logic.test.ts:279 refuses 'Checking your lot'.
- Spec 136 fe.31 (:124): existing components.
- Spec 128 Rule 3 and the FIX.TUNE precedent (semiQuestion.ts:17, config.continue_wait_ms): a timeframe is surface config backed by a registered logic variable, never a typed number.
- The "already discussed" skip rule: FOUND for opened lots only. MF-62/plan.md:44 says "Re-opened lot (already counted this period, MF-45 D-3 a): screen skipped". That plan was approved with "Mf-62 - yes" (phase1/open-questions.md:963) and is built as showsWhatWeChecked (what-we-checked.ts:49-51). No earlier line says to skip for a tracked or stored lot; the nearest is MD:699. The mock's table row "Lot opened before, or stored: No check lines. The report opens directly" now draws it, approved by RR-0491.

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
- (a) The hand-off is unchanged from v1. The stored read and the compute run only on the parcelId form; a q hit sends page null and logs not_produced. The usage rows are identical before and after:
  - new lot: 1;
  - already counted: 0;
  - tracked lot (a stub today, useTrackedLots.ts:52): same as the two rows above;
  - at-limit new lot: 0, but the 403 wall moves from the search page to the report screen.
  - The seam with 343 is route.ts:114-116 and consumer-lookup.ts:66 (343's) against lookup-flow.ts:83-90 (267's). 267 lands first.
- O4 is now RULED (RR-0490 3 b). A failure or a miss that arrives while the lines play waits until they end. Then comes screen 4 (failure) or screen 5 (no report).
- Give-up is RULED: 60 s from the pick (RR-0491, LD-2 A).
  - How it meets RR-0176: RR-0176 removed the 35 s cap on a report that is still arriving. Between 23 and 60 s that still holds: screen 3, and the button appears the moment the page lands.
  - RR-0491 adds a failure bound at 60 s; that bound is new, not the 35 s cap coming back.
  - Owed: a dated note in Spec 126 §11a.7 and Spec 100 §4 saying that RR-0491 bounds RR-0176's "however long that takes" at 60 s from the pick. Also a card note on 267, whose title says "however long".
  - The pick mark is the report screen's mount, milliseconds after the push. 465's push is the pick.
- O3 Skip: the mock draws none. RR-0176 says the animation "always runs to completion", and the core draws no Skip when it is given no href (core.ts:399-403). Settled: no Skip, and none is passed.
- O2 picture: the mock draws lines only. Settled: no scene, no new component kind.
- O6 bar title: the mock draws the lot's address in the bar, taken from the checked view's address (what-we-checked.ts:45). Settled.
- The label "Checks for this lot" is drawn VISIBLE in the mock. It conflicts with Spec 126:869 ("any section labels"). Left open as O8.
- Words per screen:
  - Screen 1: verbs and lines, server-built.
  - Screen 2: states.checked.ready plus states.checked.open "View report".
  - Screen 3: states.lifecycle.loading, centred (RR-0491's one change).
  - Screen 4: states.lifecycle.error plus retry.text.
  - Screen 5: states.lifecycle.miss plus NEW back_to_search.text "Back to search". The key lives in mobile_parcel_detail.content.json; its action is the existing `back` (useGoBack). It moves: the content file, ReportBinding.tsx:394 SCREEN_CONTENT_KEYS, the generated slice mobile/src/generated/surfaces/mobile_parcel_detail.json, reportPage.behaviour.test.tsx:156, reportScreens.golden.test.ts:285, props/miss.mobile.json, and reportScreen.mount.behaviour.test.tsx.
- (b) When the lines show (RR-0485 item 5 and the mock's table). They are skipped when:
  - the persisted cache holds a page (opened on this phone); or
  - the parcelId answer brings a page with no checked view (a stored lot, or already counted: showsWhatWeChecked); or
  - the checked view is null for an unknown lot or unusable pace (the producer's promise).
  - Tracked lots: tracking is not built. A tracked lot is stored (MD:699), so the stored rule covers it once task-269 and task-265 land. No field now.
- (d) The wait today: 11-23 s per compute, and M1 computed the same lot twice (21.7 s plus 21.0 s). After this plan: one compute behind the lines; screen 3 from 23 to 60 s; screen 4 at 60 s or on a failure.
  - Timing: screen 4 comes after the 3 retries (MD:1409), or at 60 s if that comes first.
  - 683 Danforth (compute null in 108 ms): lines to 23 s, then screen 5.

## 4. The change, file by file, in build order (one lane; 267 then 317 in the same commits)
1. src/lib/parcels/lookup-flow.ts:79-90: `findOnly = parcelId === undefined`. The stored read and the compute are skipped when held or findOnly. Header note :5-6.
2. src/app/api/parcels/lookup/route.ts:
   - comments :13-19, :26-27;
   - O1-A2: parse the fast flag like semi (:78-84);
   - on the fast read, return the stored page if present; else, unless held, the checked view: buildTree({lifecycle:'loading', what_we_checked}) then viewOf on target mobile with no href. If O1-A2 is ruled, the fast read also skips the lines for an already-counted lot (a usageFor export, one read). The meter code is unchanged.
   - OUTSIDE FILES LINE: src/app/api/parcels/lookup/types.ts (the response field `checked`, the X-4 a field, and the flag) and src/lib/entitlements/index.ts:559 (export usageFor), both needed only under A2.
3. mobile/src/lib/schemas.ts:432-441: `checked` nullable and optional (the core's checked view shape).
4. mobile/src/hooks/useParcelLookup.ts:107-116:
   - the fast-read query (key ['parcel-checking', id], under A2);
   - O5: no refetch on mount when the cache holds a page.
5. mobile/src/components/surfaces/ReportBinding.tsx:
   - reportScreenState (:399-403) becomes total over (data, checked, isFetching, isError, elapsedMs, gaveUp). Its outputs: view | checking | ready | holding | error | miss. Data with no page while a fetch is running is checking or loading, never miss (finding 23).
   - checkedProps renders screens 1-5 from existing kinds only (View, Text, Button, ActivityIndicator); screen 3's spinner and words are centred.
   - backProps gains the address title. With no address there is no title node at all.
   - LifecycleState stays loading | miss | error. The ending is a separate field, so no new states.lifecycle.* key is invented.
   - SCREEN_CONTENT_KEYS gains back_to_search.text (and checks.label if O8 is visible).
6. mobile/src/components/surfaces/ReportPageHost.tsx:64-74:
   - the clock starts at mount;
   - the give-up timer at 60 s from mount, or never once a page is shown;
   - Reduce Motion: all lines at once, one announcement of summary;
   - no auto-open; no Skip.
   - A late page that lands after the give-up stays in the cache. Try again shows it at once without a new compute, otherwise it refetches.
7. mobile/app/(app)/parcel-tool/[parcelId].tsx:23-37: pass the fast read, isFetching, error and the cache skip. The wall stays the first branch when there is no view.
8. mobile/src/constants/reportPage.ts: the line, tick, end and centred-hold classes.
9. The 60 s give-up: per O7, either config.give_up_ms or a direct read of the existing slice value.
10. Content:
    - mobile_parcel_detail.content.json gains back_to_search.text (and checks.label per O8);
    - report-presentation.json is unchanged.
    - OUTSIDE FILES LINE: scripts/surfaces/emit-mobile-surfaces.mjs:120-127, only if O7 picks config.give_up_ms (the report slice writes config {} today).
11. Census first, then emit, then registry. OUTSIDE FILES LINE for each:
    1. scripts/surfaces/_schema/census/mobile-product.json, row mobile_parcel_detail (:6151): states :299-325 gain checking, ready, holding; dated notes; the evidence cites move (gate route.ts, states [parcelId].tsx).
    2. scripts/surfaces/_schema/census/contracts.json, row contract_parcels_lookup (:22081):
       - metering.why: a q hit sends no page; under A2 the fast read counts only a stored page it serves;
       - the field whitelist gains `checked`; evidence cites move.
    3. `node scripts/violations/generate-surface-registry.mjs --emit-descriptors`, which writes:
       - mobile_parcel_detail.descriptor.json;
       - contract_parcels_lookup.descriptor.json;
       - src/lib/surfaces/generated/surface-descriptor.d.ts and validate-descriptor.mjs (expected byte-unchanged; if not, add them).
       Never edit a descriptor by hand (surface-registry.infra.test.ts:277-281).
    4. emit-mobile-surfaces.mjs --write, which writes mobile/src/generated/surfaces/mobile_parcel_detail.json.
    5. report-page-capture.ts: MOBILE_LIFECYCLE_STATES (:78) gains checking, ready, holding, error_after, miss_after. It writes src/tests/fixtures/report-page/props/*.mobile.json (5 new; loading, miss and error move).
    6. generate-surface-registry.mjs default run, which writes docs/reports/generated/127-surface-registry.md and 127-surface-review-queue.md; its --check must be clean.
- Parity: the report detail is mobile only (identity.platforms ["mobile"]). There is no web/phone parity lock for its lifecycle; parity.golden.test.ts compares reading trees only. The pins that move are report-mobile.logic.test.ts:32 (the golden names), reportPage.behaviour.test.tsx:156 (the slice keys), reportScreens.golden.test.ts:285 (lifecycle refs) and report-checked.logic.test.ts (words; unchanged unless O8).
12. Specs and queue:
    - Spec 100 §3.2 note (the q path sends no page) and §4 note (the endings, 60 s, the skip rule).
    - Spec 126 §11a.7 note (the app render; RR-0491 bounds RR-0176; Skip not drawn; O8 if visible).
    - .cursor/MCFRONTEND-QUEUE.md: one follow-up row to MF-62 for both cards, the next free id at claim (MF-99 at this head, :5, unless 465 took it).

FILES (both cards):
- src/lib/parcels/lookup-flow.ts, src/app/api/parcels/lookup/route.ts, src/app/api/parcels/lookup/types.ts, src/lib/entitlements/index.ts
- mobile/src/lib/schemas.ts, mobile/src/hooks/useParcelLookup.ts, mobile/src/components/surfaces/ReportBinding.tsx, mobile/src/components/surfaces/ReportPageHost.tsx, mobile/app/(app)/parcel-tool/[parcelId].tsx, mobile/src/constants/reportPage.ts
- scripts/surfaces/parcel_product/F02/surfaces/mobile_parcel_detail.content.json, scripts/surfaces/_schema/census/mobile-product.json, scripts/surfaces/_schema/census/contracts.json, scripts/surfaces/parcel_product/F02/surfaces/mobile_parcel_detail.descriptor.json, scripts/surfaces/parcel_product/F02/contracts/contract_parcels_lookup.descriptor.json
- mobile/src/generated/surfaces/mobile_parcel_detail.json, src/tests/fixtures/report-page/props, scripts/surfaces/report-page-capture.ts, scripts/surfaces/emit-mobile-surfaces.mjs (O7), docs/reports/generated/127-surface-registry.md, docs/reports/generated/127-surface-review-queue.md
- src/tests/parcel-lookup-gate.infra.test.ts, src/tests/surfaces/report-mobile.logic.test.ts, src/tests/surfaces/report-failure.logic.test.ts (new)
- mobile/__tests__/reportScreen.mount.behaviour.test.tsx, mobile/__tests__/reportPage.behaviour.test.tsx, mobile/__tests__/reportScreens.golden.test.ts, mobile/__tests__/reportScreen.gateStability.behaviour.test.tsx, mobile/__tests__/useParcelLookup.test.ts, mobile/__tests__/reportChecked.behaviour.test.tsx (new)
- docs/specs/03-mobile/100_mobile_parcel_cost_tool.md, docs/specs/02-web-admin/126_maxbld_surface_standard.md, .cursor/MCFRONTEND-QUEUE.md

## 5. Tests first (red, then green)
Both cards' acceptance lines are the process lines AC1-AC8. These tests serve AC2 (written into the plan) and AC6 (red first). Each is also tied to a scope item below.

Server, src/tests/parcel-lookup-gate.infra.test.ts:
- G1 "a q hit never runs the stored read or the compute": page null, meter not_produced, no insert (267 hand-off).
- G2 "compute once per opened lot": q then parcelId=P-45 with a stored miss. Expect computeCustomerPageResponse called once and 1 insert.
- G3 "meter counts unchanged" (it.each on parcelId): new lot counted 1; already counted 0; at limit 403 with 0; at limit with a counted lot 200 with 0. Each case's q call before it inserts 0.
- Rewrite :234, :245 and :369 (q-path counting) with a dated note that keeps their titles.
- G4 "683 Danforth": parcelId=5361889 with the compute mocked null. Expect 200, page null, meter not_produced (317, finding 31).
- G5 (A2): the fast flag returns the checked view and no compute. A stored page is returned and counted. A held lot gets no checked view. An already-counted lot gets checked null.

src/tests/surfaces/report-failure.logic.test.ts (new; a table over reportScreenState, total, 317 R2). Rows:
- page, then view;
- lines playing with no page, then checking;
- lines done with a page, then ready;
- lines done with no page and under 60 s, then holding;
- an error during the lines, then checking until the end, then error (RR-0490 3 b);
- 60 s passed, then error;
- a miss during the lines, then miss at the end;
- no checked view with a miss, then miss at once;
- a cached page, then view with no lines.

src/tests/surfaces/report-mobile.logic.test.ts: the golden names include the 5 new endings; the capture writes them byte for byte (317 R1).

mobile/__tests__/reportChecked.behaviour.test.tsx (new, fake timers):
- C1: verbs at delay_ms, facts at done_ms.
- C2: page at 5 s, no "View report" until 23000; no auto-open; no Skip.
- C3: no page at 30 s gives the centred spinner and "Loading the report…".
- C4: no page at 60000 ms gives "Could not load this report. Try again." with the lines kept.
- C5: a 500 at 8 s gives the failure only at 23000.
- C6: a miss at 0.1 s gives "No report for this lot yet." and "Back to search" at 23000; a press calls back.
- C7: a late page after the give-up, then Try again shows it with no fetch.
- C8: Reduce Motion gives all lines and one announcement.

mobile/__tests__/reportScreen.mount.behaviour.test.tsx:
- M1: a cached miss while refetching shows no miss text.
- M2: a cached page opens at once with no lines and no fetch (O5).
- M3: the address is the bar title; with no address there is no title node.

reportScreens.golden.test.ts: the miss refs are [states.lifecycle.miss, back_to_search.text]; components only from mapping.mobile.REPORT. reportPage.behaviour.test.tsx:156: the slice keys.

The mobile jest files are run by no hook. Run them by hand or in Mobile CI and keep the output.

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
  - The at-limit wall now shows after the compute (G3).
  - A failing compute runs up to 4 times, per the ruled retries.
  - Census and descriptor drift is caught by --check and surface-registry.infra.test.ts:277.
  - Cite drift is caught by check-cites.
  - Missing paths are caught by the close check.

## 7. Notes owed (backlog CLI only)
- task-267: PLAN-267-v2; the new title (the address replaces "Checking your lot"); the Files line above; a note on "however long" against the 60 s give-up.
- task-317: built in lane 267 (RR-0477, RR-0488); its Files line is folded into 267's.
- task-343: the seam in section 3 (a).
- task-465: the hand-off removes its O1 risk.
- doc-16 A-MF62 (35 s, "updating"): a dated note through `backlog doc edit` that it is superseded by RR-0176 and RR-0491.
- Spec dated notes and the queue row as in step 12.

## 8. Open choices (not decided)
- O1, the source of the lines (L2-1, MD:1276):
  - A1: the lines arrive with the page, so the lines start after the compute. This breaks "always to the end" timing and the 23 s overlap.
  - A2: a fast parcelId read with one optional flag, the semi=answered precedent. It returns the stored page or the checked view and runs no compute. The flag and the response field `checked` (X-4 a, ruled) need his word under RR-0392.
  - Rec A2. The mock's timeline (lines from 0 s while the report builds) needs it.
- O5: no refetch-on-mount for a cached page (one compute per open), versus today's 60 s stale refetch. Rec no refetch.
- O7, the 60 s value:
  - (a) Read the existing registered 60 000 (maxbld_page_continue_wait_ms, via the semi slice). No database step; one value serves both waits; dated note.
  - (b) A new seed row and config.give_up_ms. That is a database step, so its own card by RR-0477.
  - (c) A typed number. Breaks Spec 128 Rule 3.
  - Rec (a), with (b) as a later card if he wants the two waits apart.
- O8, the "Checks for this lot" label:
  - visible as drawn: a new key checks.label, plus a Spec 126 note that RR-0491 replaces :869 for this one label;
  - or a screen-reader label only (the v8 aria-label, build.mjs:801).
  - Rec visible as drawn, flagged to him with the :869 conflict named.
- Settled since v1: O2, O3, O4, O6, O7-batch (task-317 is now in this lane).

What this plan assumes of 465 (final for round 1; lane BL-MCFIX465 is building now):
- A pick (Enter, a row tap, or a chip tap that submits) pushes /(app)/parcel-tool/<id> through parcelSearchRoute.
- No search code reads `page`.
- The web search mirrors the phone and the web report stays off.
- The four new semi keys in lotMap.ts, and WallBinding, are not touched here.
- On return the box clears (465's focus effect), so "Back to search" lands on an empty box.
- Files both cards touch:
  - census/mobile-product.json (different rows: 465 has :7154 and :7578, 267 has :6151);
  - the --emit-descriptors run and the default registry run, with 127-surface-registry.md and 127-surface-review-queue.md;
  - the emit-mobile-surfaces.mjs run (different slices);
  - Spec 100 and Spec 126 (separate dated notes);
  - the queue.
- 267 rebases on 465's tip and reruns every generator.

## 9. UNVERIFIED
- Whether the checked view (viewOf with no href) passes the mobile Zod schema without a core change.
- Whether report_check_* and the citywide snapshot row exist on the test stack.
- Whether surface-descriptor.d.ts moves on the emit.
- Whether report-checked.logic.test.ts pins the states.checked key list.
- The platform request timeout.
- Nothing was run; this was read only.
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
<!-- SECTION:NOTES:END -->
