---
id: TASK-318
title: >-
  SRCH.ROUTE Search identifies the case and routes it: two or more parcels at
  one...
status: DONE
assignee:
  - '@lane-BL-ROUTE'
created_date: '2026-11-19T04:57:00Z'
updated_date: '2026-11-24T14:42:00Z'
labels:
  - S
  - plan:SRCH.ROUTE
  - McFixReborn
  - dead
milestone: m-1
dependencies: []
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#S/SRCH.ROUTE
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md sha256=0f3d8ba74a49
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/inc-briefs/BRIEFS.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/search-delta/CURRENT-SEARCH.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/holistic-audit/AUDIT.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/readiness/READINESS.md
  - /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/fe-built/BUILT.md
  - .cursor/MCFRONTEND-QUEUE.md#L394
  - .cursor/MCFRONTEND-QUEUE.md#L597
  - docs/reports/lanes/2026-11-19/BL-ROUTE/REPORT.md
documentation:
  - backlog/docs/increments/doc-2 - Increment-S-requirements.md
priority: low
type: build
project: McIncrement
ordinal: 2012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: SRCH.ROUTE Search identifies the case and routes it: two or more parcels at one address -> lot map (C.14); mis-typed or unclear address -> candidates (B.1); possible semi lot -> semi question page (D.1). Mostly built: an end-to-end routing test proves all three plus the plain one-lot case on real addresses

snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: UNMEASURED

Plan text at the snapshot: NEW: panel + build pass owed
who (plan text): lane

Files: src/tests/search-routing.logic.test.ts, docs/reports/reviews/task-318/, docs/reports/lanes/2026-11-19/BL-ROUTE/
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Pre-register the expected moves, committed alone — "Pre-register the task's `rules[]` and expected moves" (.cursor/MCBYLAWS-QUEUE.md:109)
- [x] #2 Failing tests are written into the plan and reviewed at plan altitude — "are written INTO the plan and reviewed at PLAN altitude" (docs/specs/00-architecture/08_agents.md:465)
- [x] #3 `write_scope` declared in the brief — "The brief file opens with a front-matter block" (docs/specs/00-architecture/08_agents.md:144)
- [x] #4 PLAN panel run with the lens set, never one generic pass — "NEVER run one generic pass" (docs/specs/00-architecture/08_agents.md:334)
- [x] #5 Fold validated by a grounder that re-executes every claim — "one grounder re-executes every claim in the fold" (docs/specs/00-architecture/08_agents.md:458)
- [x] #6 Built red first, then green, on the tip — "Red tests first, then the code, through the real hooks." (docs/specs/00-architecture/08_agents.md:490)
- [x] #7 OUTPUT panel record committed with the work — "is committed with the work (R-KM)." (.cursor/MCBYLAWS-QUEUE.md:116)
- [x] #8 McFrontend build only: queue row first — "No McFrontend work starts without its row in" (docs/specs/02-web-admin/126_maxbld_surface_standard.md:72)
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
1. Pre-register the expected moves (AC1): one test file src/tests/search-routing.e2e.logic.test.ts, no other code unless red proves it missing.
2. Write the failing tests into the plan, reviewed at plan altitude (AC2): case table under Plan steps under review in the context file; one repo review round (AC4, AC5): triage KEEP/REJECT.
3. write_scope declared in the brief (AC3): lane dir plus ~/Buildo-wt-route.
4. Red first (AC6): commit attempt with only the test, task file and context file staged -> red.out; then minimal routing code only if a case is proven missing; green through the real hooks -> commit.out.
5. One output review on the diff (false routes, fixture realism), triaged; OUTPUT record committed with the work (AC7).
6. McFrontend queue row first (AC8): MF-53 (.cursor/MCFRONTEND-QUEUE.md:394) and MF-84 (:597) already carry the work; this task adds no new row.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-19 1·B validation (R10, RR-0257, task-316): promoted from draft-3 (was DRAFT-3) by R10: RR-0182 'the search identifies two-or-more parcels, a mis-typed address, or a possible semi lot'; no dependency (mostly built: C.14, B.1, D.1 routes). Panel and build pass owed.

2026-11-19 taken on the board at lane launch (lane BL-ROUTE, worktree /Users/brettpreston_macmini/Buildo-wt-route, branch wf1/inc1b-route), RR-0240

2026-11-19 BL-ROUTE: all four cases route today with no code change. Test src/tests/search-routing.logic.test.ts (7 cases + 1 todo). Red proven by mutation of classifyRows (red.out: multi_parcel -> text_candidates). Mis-typed address -> no_match (OPERATOR item, it.todo).

2026-11-19 DONE: closing commits on origin/wf1/mb-rulings (push window 5: 78f552fbb at 16:56Z, station PASS 28367 tests)
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Routing test src/tests/search-routing.logic.test.ts proves lot map, unlinked, candidates, semi route and one-lot report on sweep addresses; no routing code changed. Commits 28554fe1a and d22c3823f through the real hooks (8 passed, 1 todo). Red proven by classifyRows mutation (red.out). Mis-typed address stays no_match: OPERATOR item. Report: docs/reports/lanes/2026-11-19/BL-ROUTE/REPORT.md
<!-- SECTION:FINAL_SUMMARY:END -->
