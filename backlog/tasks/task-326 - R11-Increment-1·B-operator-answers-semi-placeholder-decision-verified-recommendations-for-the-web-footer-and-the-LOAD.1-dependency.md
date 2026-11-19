---
id: TASK-326
title: >-
  R11 Increment 1·B operator answers: semi placeholder decision, verified
  recommendations for the web footer and the LOAD.1 dependency
status: RUNNING
assignee:
  - '@lane-BL-R11'
created_date: '2026-11-19T15:20:00Z'
updated_date: '2026-11-19T15:20:00Z'
labels:
  - follow-up
milestone: m-1
dependencies: []
references:
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L1041
type: record
project: McIncrement
ordinal: 28012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator 2026-11-19 (MORNING-DECISIONS.md:1041): "1 y 2 provide a recommendation 3. recommendation - we do want the search page to function now to drive the report which we need to validate in the next increments - provide a recommendation." Grounded: yes - the three OPERATOR items came from the 1·B validation pass (task-316) with UNVERIFIED recommendations. Recommendation: one record lane enters the decision through G2 and brings the two recommendations back verified by the repo review round (RR-0232); UNVERIFIED until that round.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 task-323 closed DONE with the operator decision (RR-0264) entered through G2, naming task-323, task-319 and task-209; task-319 carries the Scope now line (page, mock and link only in 1·B)
- [ ] #2 task-324 carries a Recommendation line verified by the review round (where the E.2 web footer is built), status OPERATOR
- [ ] #3 task-325 carries a Recommendation line verified by the review round (how LOAD.1 lets the search page drive the report now, what is deferred to ST.P1), status OPERATOR
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
2026-11-19 taken on the board at lane launch (lane BL-R11, worktree /Users/brettpreston_macmini/Buildo-wt-r11, branch wf2/inc1b-r11), RR-0240
<!-- SECTION:NOTES:END -->
