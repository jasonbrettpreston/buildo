---
id: TASK-267
title: >-
  LOAD.2 Loading screen (MF-62 Checking your lot): the animation keeps its set
  length...
status: WAITS
assignee:
  - '@lane-BL-LOAD2'
created_date: '2026-11-19T04:57:00Z'
updated_date: '2026-11-25T18:36:00Z'
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
Plan id: PLAN-267-v1
Head read: 4c22af6e8 (wf2/board). The fold plan has no 267 or LOAD lines, so this plan works from the card's AC1-AC8 and the McFixV2 note of 2026-11-25. Every file:line below was read at this head. MD = ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md.

## 1. Rules quoted first
- RR-0176, MD:783 and :786: "the animation takes 23 seconds - this goes to completion - the buttononly appears when the load is done". RULED at :786: the animation "always runs to completion", with "no 35 s cap".
- MD:695: "from the search page". The reading at :696 says the calculation "starts when the user picks the address".
- MD:699: "Once somebody opens a lot or tracks a lot - we have this lot data saved for them or others."
- RR-0485, MD:2533: "4. We should not send a report without pricing - the report needs to be complete." (task-343). Also "5. Always - except for a tracked/stored lot or one that has previously been opened - we have already discussed this".
- RR-0486, MD:2538: "it may not be the users lot they are checking - just a note to clarify".
- RR-0483, MD:2525: the operator asked how the loading automation relates to the search thinking state. Asked, not ruled.
- RR-0482, MD:2518: "larger tasks and using existing components". RR-0477, MD:2496: "batch items that touch the same files ... Keep anything with a database step or its own operator question on its own card."
- RR-0278, MD:1082: "I should only be charged a report if I find the address and lot Im looking for and a report is produced".
- Phone retries, MD:1409: "Phone retires yes". The reading at :1410 keeps the 3 retries.
- Spec 126:869 (MF-62 copy): "it doesnt need a title... it should be processing".
- Spec 136 fe.35 (136_mcfrontend_handbook.md:136) bars any "live-progress word". The lock src/tests/surfaces/report-checked.logic.test.ts:279 already refuses summary 'Checking your lot' as a 'live-progress word'.
- Spec 136 fe.31 (:124): reuse existing components.
- Search for the "already discussed" skip rule:
  - FOUND for opened lots. ~/Buildo-scratch/mcfrontend/MF-62/plan.md:44 says "Re-opened lot (already counted this period, MF-45 D-3 a): screen skipped, report opens directly." The operator approved that plan with "Mf-62 - yes" (phase1/open-questions.md:963). The orchestrator reading at MD:694 repeats it ("skipped for a re-opened lot"). It is built as showsWhatWeChecked (src/lib/parcels/what-we-checked.ts:49-51).
  - NOT FOUND for tracked or stored lots. No earlier ruling or spec line says to skip the screen for a tracked or stored lot. The nearest text is MD:699 (that data is saved). Spec 100, Spec 117, the mobile_parcel_detail descriptor and the card say nothing on it.
  - The 2026-11-19 lane recommended F1, "play on every open" (MD:1279). That was never ruled, and RR-0485 item 5 now overrides it.

## 2. What exists and is reused
- The lookup flow, src/lib/parcels/lookup-flow.ts:79-90. Today the stored read (:83) and the compute (:87) run on the q path and the parcelId path alike. That is the cause of M1.
- The meter, route.ts:114-123: not_evaluated, then semi_pending, then not_produced, then openReport.
- openReport (src/lib/entitlements/index.ts:590-614): already_counted at :606, limit_reached at :607. usageFor (:559) is private.
- hasEvaluatedOption, consumer-lookup.ts:66.
- On the phone:
  - The report query key ['parcel-lookup', id] (useParcelLookup.ts:107-116), persisted for 24 h (mobile/app/_layout.tsx:490; queryClient.ts:41; persistFilter.ts:27 excludes only the profile and entitlement queries).
  - reportScreenState (ReportBinding.tsx:399-403) and lifecycleProps (:369-381).
  - The host's screen-local state (ReportPageHost.tsx:40-41) and the wall (useWallState, [parcelId].tsx:26).
- The MF-62 server half:
  - readWhatWeChecked (what-we-checked.ts:167), which returns null on any error.
  - The pace settings report_check_min_ms (23000), skip_after and ready_hold (logic_variables.json:10491-10516).
  - The checked tree and its checks (core.ts:110-216).
  - The words: report-presentation.json:92-142 states.checked (verbs, lines, dates, skip, ready, open, summary).
- The precedent for an optional request flag: semi=answered (useParcelLookup.ts:40-44; route.ts:81).

## 3. Answers (a)-(f)
**(a) Hand-off.**
- Yes, it can be done with no field and no change to the meter code. In lookup-flow.ts the stored read and the compute run only when the request is the parcelId form.
- On the q path, a hit carries match, parcel and lotForm as today, with page null. The meter at route.ts:116 then logs not_produced and counts nothing.
- openReport counts a lot once per period (index.tsx-side tests at parcel-lookup-gate.infra.test.ts:245, :377). So moving the one counted request from q to parcelId leaves the usage rows the same. Only the log label of the q request changes.

Meter behaviour, switch on and a priced option present. Today no lot has a priced option, so every hit logs not_evaluated on both paths, before and after (M3; finding 38).

| Case | Before (q, then parcelId) | After (q, then parcelId) | usage_events rows |
|---|---|---|---|
| New lot | counted (2 computes), then already_counted | not_produced (0 computes), then counted (1 compute) | 1 and 1 |
| Already counted this period | already_counted, then already_counted | not_produced, then already_counted | 0 and 0 |
| Tracked lot | same as the two rows above (openReport has no tracked branch; the phone's Tracked Lots is a fixture stub, useTrackedLots.ts:52-60) | same | same |
| At-limit user, new lot | 403 REPORT_LIMIT_REACHED on the search page after a compute | 200 on search, then a 403 on the report screen after the compute | 0 and 0 |
| At-limit user, counted lot | already_counted, served | served on parcelId | 0 and 0 |

- What moves for the at-limit user is where the wall shows: the report screen instead of the search page. Both walls are already built (task-452).
- Where 267 and 343 meet:
  - 343 owns the meter rule: route.ts:114-116 and hasEvaluatedOption (consumer-lookup.ts:66). It decides "no priced option means no page sent".
  - 267 owns only which request computes (lookup-flow.ts:83-90).
  - If 343 puts its "no page without pricing" test in lookup-flow.ts:91, the two cards edit one function. 267 lands first. 343 then keeps "page is set on the parcelId form only" and must not bring the q-path compute back.
  - 465's O1 risk (the q path counting while the user types) is removed by this hand-off.

**(b) When the animation shows.** It shows by default. It is skipped when the phone knows one of these facts, and no new field is needed for any of them:
- Opened on this phone: the persisted ['parcel-lookup', id] entry holds a page. reportScreenState (:400) already shows it at once.
- Stored lot: readCustomerPageResponse returns a page (report-page.ts:57). The request then answers in milliseconds with page set, and the screen shows the report.
- Opened before this period, on another device or after 24 h: openReport's already_counted (index.ts:606). showsWhatWeChecked (:51) already turns this into a null whatWeChecked, a field ruled under X-4 a (.cursor/MCFRONTEND-QUEUE.md:363, ":367"). The phone skips the lines when whatWeChecked is null.
  - On a fast read with no page the meter does not run, so a read-only "already counted" check is needed. That means exporting usageFor or adding a one-query read. See O1.
  - Until the store (ST.P1, task-265, m-13) is built, such a lot is still computed again (11-23 s). Without the animation the person sees the existing spinner and "Loading the report…" during that wait.
- Tracked lot: tracking does not exist in MaxBLD today (stub, useTrackedLots.ts:52). Per MD:699 a tracked lot's data is stored, so the stored rule covers it once task-269 (LS.4) and ST.P1 land. No field now.

**(c) The title.**
- Nothing on the built screen or in the approved v8 mock says "Checking your lot". It is the card's working name (open-questions.md:939). The ruled name is "What we checked" (:964).
- The screen has no title by ruling (Spec 126:869). The v8 bar title is the lot's address (what-we-checked.html:263 h1.addr). The list label is "Checks for this lot" (small-pages-v8/build.mjs:801).
- Options:
  - (i) Rename the card only, to "Loading screen (MF-62 What we checked)", through the backlog CLI. Nothing changes on screen.
  - (ii) Also draw the address as the bar title, from whatWeChecked.address (what-we-checked.ts:45), as v8 does. No new key.
  - (iii) Change states.checked.summary "Your report is ready." to "The report is ready."
- A visible "Checking …" title is barred by fe.35 and by the :279 lock.
- Rec: (i) plus (ii).

**(d) The wait.**
- Today: M1 was 21.7 s plus 21.0 s, because the same lot was computed twice. Round four measured 11.3, 18.0, 21.1 and 23.2 s. LOAD.1 measured 3.9-15.9 s on the golden 25 (task-343:263).
- After the hand-off: the search answers in resolve time (683 Danforth, which includes a null compute, took 108 ms). The report screen covers one compute, inside the 23 s animation.
- Slow (page not in when the animation ends): hold on the resolved lines with the existing spinner and lifecycle text (L2-6 H1). No cap, per RR-0176.
- Failed (the compute throws, a 500): 3 retries per MD:1409, so up to 4 computes, then lifecycle error, with the existing text and Try again.
- Timed out: there is no client time bound (apiClient has no timeout or signal), and the platform timeout is UNVERIFIED.
- Where 317 begins: everything that lifecycle error or miss draws, including 683 Danforth (finding 31), LD-1/2/3/5 and the give-up figure L2-5/LD-2. 267 only hands the state over.

## 4. The change, file by file, in build order
1. src/lib/parcels/lookup-flow.ts:79-90. Old: stored read and compute on both forms. New: both run only when parcelId is set. Edit: `const findOnly = parcelId === undefined;` and `held || findOnly ? null : …` at :83 and :85. Plus a header note at :5-6. readLotForm stays.
2. src/app/api/parcels/lookup/route.ts. The comments at :13-19 and :26-27 (the q path sends no page). The meter code is unchanged. If O1 is A2: add the whatWeChecked wiring and the fast flag, parsed like semi (:78-84), in src/app/api/parcels/lookup/types.ts (the ruled X-4 a field). OUTSIDE FILES LINE: types.ts, needed only under A2.
3. mobile/src/lib/schemas.ts:432-441 (only under A2): whatWeChecked nullable and optional.
4. mobile/src/hooks/useParcelLookup.ts:107-116:
   - O5: no refetch on mount when the cached entry has a page. A refetchOnMount function, no setting.
   - Under A2, the fast read under its own key.
5. mobile/src/components/surfaces/ReportBinding.tsx:399-403. reportScreenState takes isFetching. Data with no page while a fetch is running is loading, not miss. This fixes the no-report flash (finding 23). Add checkedProps(checked, elapsedMs): lines from states.checked; the button only when page is set and elapsed ≥ min_ms; null returns lifecycleProps. Uses only existing REPORT kinds (View, Text, Button, ActivityIndicator).
6. mobile/src/components/surfaces/ReportPageHost.tsx:64-74. The screen-local clock in the existing useState. The Reduce Motion path (all lines at once, one announcement). No auto-open.
7. mobile/app/(app)/parcel-tool/[parcelId].tsx:23-37. Pass isFetching and the checked data. The skip when a cached page is present.
8. mobile/src/constants/reportPage.ts: the line and tick classes.
9. Words, slice and goldens:
   - report-presentation.json states.checked: no change unless (c)(iii).
   - The mobile_parcel_detail slice gains the states.checked keys. emit-mobile-surfaces.mjs --write regenerates mobile/src/generated/surfaces/mobile_parcel_detail.json.
   - src/tests/fixtures/report-page/props/loading.mobile.json, plus a new checking.mobile.json, through report-page-capture.ts.
10. OUTSIDE FILES LINE, descriptors and mirrors:
    - mobile_parcel_detail.descriptor.json: states :299-325 gain `checking`, the evidence cites move, and a dated note.
    - contract_parcels_lookup.descriptor.json: metering.why :748 ("a q hit sends no page") and the evidence at :729, :750.
    - scripts/surfaces/_schema/census/contracts.json (:22081) and census/mobile-product.json, both mirrors kept by hand.
    - docs/reports/generated/127-surface-registry.md, through generate-surface-registry.mjs, if the state count moves.
11. Specs and queue:
    - Spec 100 §3.2 dated note (the q path carries no page; RR-0485 item 5).
    - Spec 126 §11a.7 dated note (the app render; the skip rule).
    - .cursor/MCFRONTEND-QUEUE.md: the MF-62 follow-up row, next free id MF-99 (:5).

## 5. Tests first (red, then green)
src/tests/parcel-lookup-gate.infra.test.ts:
- G1 "a q hit of a clear lot never runs the stored read or the compute": q=RAW_Q, stored read mocked to a page. Expect both readers called 0 times, page null, meter not_produced, no insert.
- G2 "compute once per opened lot": q then parcelId=P-45, stored miss. Expect computeCustomerPageResponse called exactly once overall and 1 insert.
- G3 "meter counts unchanged" (it.each), on parcelId: new lot gives 1 insert, counted; already counted gives 0, already_counted; at limit gives 403 REPORT_LIMIT_REACHED, 0; at limit with a counted lot gives 200, 0. Each case also asserts that the q call before it inserts nothing.
- Rewrite with a dated note the cases at :234, :245 and :369. They count on the q path today; they move to parcelId, keeping their prior titles in the note.
- Unsure-lot cases :342-:435 unchanged.

mobile/__tests__/reportScreen.mount.behaviour.test.tsx:
- M1 "a cached page with no page (miss) while refetching shows loading, not the miss text".
- M2 "a cached page opens at once, with no lines and no lookup fetch on mount" (O5).

New file mobile/__tests__/reportChecked.behaviour.test.tsx (fake timers):
- C1: verbs at delay_ms, facts at done_ms.
- C2: page in at 5 s gives no button before min_ms 23000; button at 23000; no auto-open.
- C3: no page at 30 s gives the hold state (spinner and "Loading the report…").
- C4: whatWeChecked null with a page gives the report at once (stored or already counted).
- C5: Reduce Motion gives all lines and one announcement of summary.
- C6: an error hands to lifecycle error, per the ruled L2-4/LD-3 mode.

Also: mobile/__tests__/reportScreens.golden.test.ts (the checking golden), reportPage.behaviour.test.tsx, and useParcelLookup.test.ts (the refetchOnMount rule).

These map to AC2 and AC6. The card names no fold section 2 lines.

## 6. Limits, and how failure is caught
- Does NOT: change the search box or index.tsx (465); change the meter rule or route.ts:114-123 (343); change the report page content; add a database step or migration; add a setting; flip MAXBLD_WEB_LIVE (stays false, maxbld-web.ts:19); touch the failure frame (317); port the scene picture (L2-2).
- Risk: the at-limit wall moves to the report screen and shows after the compute. Caught by G3. Noted for 343 and the task-5 wall.
- Risk: a failing compute runs 4 times (the ruled retries).
- Risk: under A2 a stored lot answers on the fast read, and the meter counts there. G2 and G3 cover it.
- Mobile jest is run by no hook (task-343:269). Run it by hand or in Mobile CI and keep the output.
- Cite drift in the descriptors is caught by check-cites. Missing Files-line paths are caught by the close check.

## 7. Notes owed (backlog CLI only)
- task-267: the plan id; the new title per (c); the Files line with every OUTSIDE path in section 4.
- task-343: the meeting point in (a).
- task-317: the hand-off of lifecycle error and miss; the 683 Danforth case.
- task-465: O1(a) is satisfied by this hand-off.
- A Spec 100 note and a Spec 126 note.
- The queue row MF-99.

## 8. Open choices (not decided)
- O1 The source of the lines (L2-1, MD:1276, unruled):
  - A1: the lines arrive with the page, so the animation runs after the compute. That is sequential, against RR-0176's "36 seconds".
  - A2: a fast parcelId read with one optional flag, the semi=answered precedent. It does the stored read, readWhatWeChecked, and an already-counted check (export usageFor). No compute. The flag needs his word under RR-0392 unless X-4 a covers it.
  - Rec A2.
- O2 The picture behind the lines (L2-2): lines only now (B3), or the scene (a new component kind). Rec B3.
- O3 Skip (L2-3): keep or drop. Rec drop (RR-0176 as worded).
- O4 A miss or error arriving during the animation (L2-4 E, LD-3): cut at once or finish. Rec finish. This is shared with 317.
- O5 A cached page does not refetch on mount (one compute per open; the store is the later fix), versus keeping today's 60 s stale refetch. Rec no refetch.
- O6 Title wording (c): rec (i) plus (ii).
- O7 Batch task-317 into this lane under RR-0477. 317 uses the same files (ReportBinding, ReportPageHost, [parcelId].tsx, reportPage.ts, useParcelLookup, the detail content, descriptor and slice, the props fixtures, the report goldens, Spec 126, the queue) and needs no database step. But it has its own unanswered operator questions (LD-1, LD-2, LD-3, LD-5; MD:1267-1270), and RR-0477 keeps such a card on its own. Batch only if those are answered first. Rec: batch after the answers.

What this plan assumes of 465 (PLAN-465-v1, in review):
- A pick (Enter or a tap) still pushes /(app)/parcel-tool/<id> through parcelSearchRoute.
- 465 reads no page from the search answer.
- 465 leaves the report files alone.
- Files both cards touch: census/mobile-product.json, Spec 100, 127-surface-registry.md, and the emit-mobile-surfaces.mjs run (different slices). Neither card touches index.tsx twice: only 465 changes it.

## 9. UNVERIFIED
- Whether report_check_* and the data_quality_snapshots row exist on the local test stack.
- The platform request timeout.
- Whether a stored page always carries See details.
- The descriptor line numbers after 465 lands.
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
<!-- SECTION:NOTES:END -->
