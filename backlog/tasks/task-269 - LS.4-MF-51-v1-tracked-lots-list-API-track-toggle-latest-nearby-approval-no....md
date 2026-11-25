---
id: TASK-269
title: >-
  LS.4 MF-51 v1 tracked lots: list, API, track toggle, latest nearby approval
  (no...
status: WAITS
assignee:
  - '@lane'
created_date: '2026-11-19T04:57:00Z'
updated_date: '2026-11-25T19:49:00Z'
due_date: '2026-11-26'
labels:
  - 1-2
  - plan:LS.4
  - evidence:planned
  - comp:PAN
  - comp:FIVE
  - comp:SC
  - comp:STAT
  - comp:BLD
  - comp:HS
  - comp:BYL
  - comp:STO
  - McApp
milestone: m-2
dependencies:
  - TASK-258
  - TASK-265
  - TASK-140
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#1-2/LS.4
  - .cursor/MCFRONTEND-QUEUE.md#L372 sha256=7a473dfb4a19
  - >-
    ~/Buildo-scratch/lanes-20261117/gap-register/REGISTER.md#L34
    sha256=2b6b9215306a
  - >-
    ~/Buildo-scratch/lanes-20261117/inc-plan/1-2/BUILD-PASS.md#L1
    sha256=f820d870862f
documentation:
  - backlog/docs/increments/doc-3 - Increment-1-2-requirements.md
priority: low
type: build
project: McIncrement
ordinal: 3004
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: LS.4 MF-51 v1 tracked lots: list, API, track toggle, latest nearby approval (no alerts); plus the rebind of the tracked-lots contract to the Layer 3 headline (gap T01), which waits MB-38 and the ST-6 classification + ; the two Tracked Lots values are stored when the lot is tracked (ST.P1, trigger 2); the list route and TrackedLotRow bind the record, replacing the legacy columns at TrackedLotRow.tsx:8 (MF-51 plan.v2 line 58 superseded); a stale row shows "updating" (ST.P3), never a legacy column

snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: GUESS 2 days

Plan text at the snapshot: WAITS (queue)
landingPush: launch (see PUSHES.md)
slicePart: launch: tracked lots
planNote: storage-policy: title + ; the two Tracked Lots values are stored when the lot is tracked (ST.P1, trigger 2); the list route and TrackedLotRow bind the record, replacing the legacy columns at TrackedLotRow.tsx:8 (MF-51 plan.v2 line 58 superseded); a stale row shows "updating" (ST.P3), never a legacy column (Tracked Lots has no screen (REPORT.md table 1 C5))
planNote: storage-policy: dependsOn L.5,ST.P1,ST.P3 (needs the producer and the updating state; no migration of its own (the record table comes with L.5b, shipped at push 12))
who (plan text): lane
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-25 (RR-0497, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2588, operator: 'Saving the lot is the same functionality (Mcapp)'; RR-0498 :2593 'Obviously, users will need to save lots'): saving a lot or report is this card. Open with the operator: whether saved lots can use the existing parcel_user_inputs table (his question, RR-0499 :2598) and whether it builds now or waits for the launch-gate storage.

2026-11-25 (RR-0500, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2603, operator '2. build now'): saving a lot builds now with McApp, not at the launch gate.

2026-11-25 (RR-0501, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2608): McApp card 3 of 4 (saving a lot); own card because it has a database step (RR-0477).
<!-- SECTION:NOTES:END -->
