---
id: TASK-325
title: >-
  LOAD.1 waits for ST.P1, which ships at push 12 with MB-38 (m-13): does 1B
  finish before launch?
status: OPERATOR
assignee: []
created_date: '2026-11-19T14:56:00Z'
updated_date: '2026-11-19T14:58:00Z'
labels:
  - S
  - gap
  - plan:LOAD.1
  - operator
milestone: m-1
dependencies: []
references:
  - ~/Buildo-scratch/lanes-20261117/storage-ondemand/REPORT.md#L8
  - ~/Buildo-scratch/lanes-20261117/storage-policy/McSTORAGE-POLICY-v2.md
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L673
priority: medium
type: decision
project: McIncrement
ordinal: 27012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Grounded: task-266 LOAD.1 depends on task-123 (1.3 W read module, m-3) and task-265 (ST.P1 the store-on-first-open producer, m-13) because 'the compute is the producer ST.P1' (task-266 title; storage-policy planNote 'dependsOn 1.3,ST.P1 (needs the producer)'; RR-0178 builds W now). task-265 text: 'landingPush: push 12 with MB-38 (L.11)', 'run on dev only after L.5b, ships at push 12', and it depends on task-259 L.6 (MB-38 shadow and switch-over) and task-82 (5.11); task-123 waits 6c.8a (push 6). So the loading screen and the proof of 1·B (task-268) cannot complete until the producer ships at push 12, which is the launch group, although RR-0005 puts search before increment 1. Recommendation (UNVERIFIED: whether L.6 is truly needed before ST.P1 was not checked; no cycle was found by backlog doctor): keep the dependency of task-266 on task-265 (the producer is the compute); ask the operator (timeframes and priorities, RR-0233) whether ST.P1 may be built and rehearsed ahead of L.6 and MB-38 so that 1·B can complete earlier, or whether 1·B completes at push 12 as planned.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Operator answer recorded verbatim through scripts/analysis/backlog-decision.mjs with its cite
- [ ] #2 task-265 and task-266 dependencies and landing push updated to the answer (dated note, prior text kept)
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
2026-11-19 1·B validation (R10, RR-0257, task-316): created by R10: LOAD.1 waits for ST.P1 at push 12 (OPERATOR, timeframe), Grounded and Recommendation in the description.
<!-- SECTION:NOTES:END -->
