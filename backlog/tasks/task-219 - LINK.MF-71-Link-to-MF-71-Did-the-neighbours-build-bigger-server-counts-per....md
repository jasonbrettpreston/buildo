---
id: TASK-219
title: >-
  LINK.MF-71 Link to MF-71 (Did the neighbours build bigger? server counts
  per...
status: LATER
assignee:
  - '@lane-E'
created_date: '2026-11-19T04:57:00Z'
due_date: '2026-11-26'
labels:
  - '1'
  - plan:LINK.MF-71
  - unverified
milestone: m-3
dependencies:
  - TASK-217
  - DRAFT-12
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#1/LINK.MF-71
  - >-
    ~/Buildo-scratch/lanes-20261117/inc-plan/gaps/MFQ.md#L571
    sha256=5addadd0b6ee
documentation:
  - backlog/docs/increments/doc-4 - Increment-1-requirements.md
priority: medium
type: build
project: McIncrement
ordinal: 4018
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: LINK.MF-71 Link to MF-71 (Did the neighbours build bigger? server counts per scenario): the count supplier for B14 and R+20 (wording is GAP.7); waits MB-94 (e) (8.32) and the reach settings (7.2a)

snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: GUESS 0.5 day to land the row (the row's own build is tracked in the queue)

Plan text at the snapshot: PLANNED (approved: S1/S2/Q-H4 a, 2026-11-18)
landingPush: push 9
slicePart: (3) page section and binding (link to a queue row the plan did not carry)
planNote: holistic-r1: status PLANNED (approved: S1/S2/Q-H4 a, 2026-11-18) (operator answers 2026-11-18 on the answer page (MORNING-DECISIONS.md, "Operator answers saved on the answer page": Q-H1 a, Q-H2 a, Q-H3 a, Q-H4 a, Q-H5 a, S1 a, S2 a))
who (plan text): McFrontend lane (E); the queue row stays the home of the work, this item only lets the plan schedule and prove it
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
