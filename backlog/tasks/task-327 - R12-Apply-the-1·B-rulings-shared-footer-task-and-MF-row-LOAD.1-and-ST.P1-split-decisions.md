---
id: TASK-327
title: >-
  R12 Apply the 1·B rulings: shared footer task and MF row, LOAD.1 and ST.P1
  split, decisions
status: RUNNING
assignee:
  - '@lane-BL-R12'
created_date: '2026-11-19T15:37:00Z'
updated_date: '2026-11-19T15:37:00Z'
labels:
  - follow-up
milestone: m-1
dependencies: []
references:
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L1061
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L1065
type: record
project: McIncrement
ordinal: 29012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator 2026-11-19 (MORNING-DECISIONS.md:1061, :1065): "1. once  -approved 2. y" and "this is a shared component - validate this isnt in incr-1c". Grounded: yes - the R11 recommendations on task-324 and task-325 were verified by review r1 of task-326; 1·C (m-2) holds no footer item; the report footer elements are doc-4 G2-G5. Recommendation: one record lane applies the three rulings to the board and the queue; UNVERIFIED until its review round.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 task-324 DONE with decision (RR-0270) through G2; the SRCH.FOOTER shared-footer task created in m-1 with its MF queue row and claimed id; LS.12 depends on it; the shared-component ruling (RR-0273) entered through G2 naming the new task, task-127 and task-324
- [ ] #2 task-325 DONE with decision (RR-0271) through G2; task-266 depends on task-123 only; task-265 depends on task-82, task-259, task-266; scope notes on both; backlog doctor clean
- [ ] #3 Repo review round r1 in review mode, triaged
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
2026-11-19 taken on the board at lane launch (lane BL-R12, worktree /Users/brettpreston_macmini/Buildo-wt-r12, branch wf2/inc1b-r12), RR-0240
<!-- SECTION:NOTES:END -->
