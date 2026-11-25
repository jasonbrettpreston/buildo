---
id: TASK-317
title: >-
  LOAD.4 Load-failure page: what the customer sees when a lot's report or See
  details...
status: WAITS
assignee:
  - '@lane-BL-LOAD4'
created_date: '2026-11-19T04:57:00Z'
updated_date: '2026-11-25T17:05:00Z'
labels:
  - McFixV2
milestone: m-1
dependencies:
  - TASK-267
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#S/LOAD.4
  - >-
    ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L789
    sha256=98f1268f4fbe
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/inc-briefs/BRIEFS.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/search-delta/CURRENT-SEARCH.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/holistic-audit/AUDIT.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/readiness/READINESS.md
  - /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/fe-built/BUILT.md
  - .cursor/MCFRONTEND-QUEUE.md#L467
  - docs/reports/lanes/2026-11-19/BL-LOAD4/REPORT.md
  - docs/reports/lanes/2026-11-19/BL-LOAD4/PLAN.md
  - docs/reports/lanes/2026-11-19/BL-LOAD4/IMPACT.md
  - docs/reports/lanes/2026-11-19/BL-LOAD4/TRIAGE.md
documentation:
  - backlog/docs/increments/doc-2 - Increment-S-requirements.md
priority: low
type: build
project: McIncrement
ordinal: 2009
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: LOAD.4 Load-failure page: what the customer sees when a lot's report or See details fails to load after the animation, built from the other small pages (small-pages-v8: the no-lot-linked and many-lots pages) as its template; McFrontend follow-up row to MF-62

snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: UNMEASURED

Plan text at the snapshot: NEW (RR-0179): panel + build pass owed
who (plan text): lane

Stage 1 plan (2026-11-19, lane BL-LOAD4): docs/reports/lanes/2026-11-19/BL-LOAD4/PLAN.md and IMPACT.md. Smallest now: the report screen draws the small-page failure frame (address in the bar, one line, Try again only where it can help, a way back) for a failed, timed-out or refused lookup and for a miss; mobile only; the web report render is not built. Waits on task-267 stage 2 (address source) and operator answers LD-1, LD-2, LD-3, LD-5.

Files: mobile/src/components/surfaces/ReportBinding.tsx, mobile/src/components/surfaces/ReportPageHost.tsx, mobile/app/(app)/parcel-tool/[parcelId].tsx, mobile/src/constants/reportPage.ts, mobile/src/hooks/useParcelLookup.ts, scripts/surfaces/parcel_product/F02/surfaces/mobile_parcel_detail.content.json, scripts/surfaces/parcel_product/F02/surfaces/mobile_parcel_detail.descriptor.json, mobile/src/generated/surfaces/mobile_parcel_detail.json, scripts/surfaces/report-page-capture.ts, src/tests/fixtures/report-page/props, src/tests/surfaces/report-mobile.logic.test.ts, src/tests/surfaces/report-failure.logic.test.ts, mobile/__tests__/reportScreens.golden.test.ts, mobile/__tests__/reportPage.behaviour.test.tsx, mobile/__tests__/reportScreen.mount.behaviour.test.tsx, docs/specs/02-web-admin/126_maxbld_surface_standard.md, .cursor/MCFRONTEND-QUEUE.md
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
1. Pre-register the expected moves alone (docs commit: MF-94 queue row claimed by mkdir in ~/Buildo-scratch/ids, prereg-MF-94-1.json), after task-267 stage 2 lands and LD-1, LD-2, LD-3, LD-5 are answered. 2. Failing tests written into the plan and reviewed at plan altitude: R1 report-mobile.logic (hook-run golden capture), R2 report-failure.logic (total state table), R3 content pin, R4 descriptor lock, R5 mobile jest (not hook-run); lens set r1 compliance, ux, error-paths, code-review done in stage 1 (TRIAGE.md). 3. write_scope declared in the brief (lane dir and ~/Buildo-wt-load4); stage 2 brief declares the Files line. 4. PLAN panel with the lens set, not one generic pass: done in stage 1, 31 lines adjudicated. 5. Grounder re-executes every claim: this lane opened each cited line (TRIAGE.md). 6. Build red first (R1 gives a hook-provable red), then green in one code commit, through the real hooks, on the tip after task-267. 7. OUTPUT panel record committed with the work (docs/reports/lanes/<date>/BL-LOAD4/). 8. McFrontend queue row first (MF-94, follow-up to MF-62), no work before it.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-19 1·B validation (R10, RR-0257, task-316): promoted from draft-16 (was DRAFT-16) by R10: RR-0179 '2. Add it as a task using the othr mini pages as a template'; dependency task-267 kept (LOAD.2 first). No element id in doc-2 for this page (design: other small pages as template, small-pages-v8); the follow-up row to MF-62 is claimed by the build lane. Panel and build pass owed.

Dated note 2026-11-19 (M-246, prior text kept; RR-0300 · task-317 · Backlog; operator, verbatim: "Those dependencies are not listed as operator tasks with incra 1b")

2026-11-19 (R13, RR-0300, task-339): this task waits on the OPERATOR task task-341 (the LOAD chain and the two 6c tasks); recommendation there, verified by review r1 of task-339. Status and dependencies unchanged.

Dated note 2026-11-19 (M-246, prior text kept; RR-0301 · task-317 · Backlog; operator, verbatim: "task 341 approved")

2026-11-19 (task-359, UX-2) built state to replace: after a lot pick the report screen shows 'No report for this lot yet.' with Back only, no address and no reason (mobile/app/(app)/parcel-tool/[parcelId].tsx:34; ReportBinding.tsx:400-401; report-presentation.json:88-89). Until MB-44 W is live every lot shows it (task-348). The failure page must say which lot and why, built from the small pages.

2026-11-19 taken on the board at lane launch (lane BL-LOAD4, worktree /Users/brettpreston_macmini/Buildo-wt-load4, branch wf1/inc1b-load4), RR-0240

2026-11-19 (BL-LOAD4, stage 1, McIncrement 08_agents.md 11.8): stage 1 plan done; stage 2 build waits on the orchestrator. Measured on head 0bc76d829: today a failed or timed-out report shows a centred line with an outline Try again (ReportBinding.tsx:369-379), no address, no time bound, no refusal split; a miss shows the bare line and Back; the design draws one failure frame (small-pages-v8 build.mjs:803, 814-817). Delta list, contract, impact and decision drafts LD-1 (words), LD-2 (time-out figure), LD-3 (early failure vs animation), LD-5 (the miss), LD-6 (conditional still) in docs/reports/lanes/2026-11-19/BL-LOAD4/PLAN.md; D-1 and D-4 named, unruled, not decided. Smallest missing piece: task-267 stage 2 (the address source and the animation seam). Web: not buildable until the web report render (task-285 and task-287 chain).

HELD (operator 2026-11-20 "4. Hold the three unbuilt pages until the pilot result"): build as rows of the page table once the PAGE.TABLE pilot passes, not by extending lifecycleProps.

Operator 2026-11-20, verbatim: "Let the grounder resolve them all as long as the result is compliant" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1476). Resolved by the separate grounder, 2026-11-20 (the lane verifies each cited fact before building): these are lifecycle states of the report screen: rows in the existing report lifecycle data (report-presentation.json) drawn by the existing ReportBinding; no new builder function and no move into the page-table builder (approved item 3 "Leave the reports as components"). Still required for 1·B (RR-0176 MD:785; RR-0179 MD:789). After the pilot folds; 317 after 267 stage 2 and LD-1, 2, 3, 5.

McFixV2 addition 2026-11-25 (operator phone walk; rulings RR-0483, RR-0485, RR-0486 in ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2523, :2533, :2538). Not yet planned. From the walk (finding 31): 683 Danforth Ave answered no page in 108 ms and the phone showed the plain no-report text; this card owns what the customer sees for a lot that cannot have a report.
<!-- SECTION:NOTES:END -->
