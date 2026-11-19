---
id: TASK-297
title: AL.5 MB-74 Rule map out of the Layer 2 version
status: WAITS
assignee:
  - '@lane'
created_date: '2026-11-19T04:57:00Z'
updated_date: '2026-11-19T12:10:00Z'
due_date: '2026-11-26'
labels:
  - AL
  - plan:AL.5
  - plan:MB-74
  - held-unruled
  - queue-row
  - comp:PAN
  - comp:FIVE
  - comp:SC
  - comp:STAT
  - comp:AV3
  - comp:BYL
  - comp:RDG
  - comp:ID
  - comp:BLD
  - comp:HS
  - comp:DN
milestone: m-14
dependencies:
  - TASK-179
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#AL/MB-74
  - .cursor/MCBYLAWS-QUEUE.md#L1045 sha256=1d7438c7d362 ROW:MB-74
  - .cursor/MCBYLAWS-QUEUE.md#L1010 sha256=e3b0c44298fc
  - >-
    ~/Buildo-scratch/queues-20261113/MB-REVIEW-20261117.md#L120
    sha256=22c9be088f44
  - >-
    ~/Buildo-scratch/queues-20261113/MB-REVIEW-20261117.md#L121
    sha256=9aac4ba52441
documentation:
  - backlog/docs/increments/doc-15 - Increment-AL-requirements.md
priority: low
type: build
project: McBylaws
ordinal: 15005
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: GUESS unscheduled; not on the launch path

Plan text at the snapshot: HELD under the infra freeze
planNote: L: estimate GUESS unscheduled; not on the launch path (PLAN-PROTOCOL 5.5)
planNote: L: status HELD under the infra freeze (optimize-L final status)
note: Waits MB-18 items a, c, d, e, h, i and k (queue).
who (plan text): lane
queue row: MB-74 (row status WAITS (unverified 2026-11-14) · since 2026-11-01 · expires when INC5-NIGHT is done · next: Operator: build now (freeze exception) or hold with new date); the row stays the record (Spec 137 rule 2) and the lane edits the row and this task in the same commit (rule 3)
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
2026-11-19 (BL-R7b): stays WAITS; operator word owed: the freeze-lift word for this item (plan text 'HELD to freeze lift' / 'HELD under the infra freeze'; no operator words found).
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: plan-to-backlog
created: 2026-11-19T04:58:00Z

---

The plan text reads "HELD under the infra freeze"; no ruling is on file, so none is invented. Open question for the operator.

---
<!-- COMMENTS:END -->
