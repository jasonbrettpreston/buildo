---
id: DRAFT-17
title: Relevancy pass of Increment 1A tasks against the Backlog plan (R7)
status: Draft
assignee: []
created_date: '2026-11-19T05:28:00Z'
updated_date: '2026-11-19T16:59:00Z'
labels:
  - follow-up
milestone: m-0
dependencies: []
references:
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L857
  - .cursor/active_task.md#L90
  - docs/reports/plan-import/2026-11-19-import-report.md
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator RR-0214 (MORNING-DECISIONS.md:857): after the move every task on the board is re-checked for relevancy against the plan (kept / merged / changed) before 1B starts. BL.0 overlaps CHK.0, CHK.7 and INFRA.3; CHK.1-6, CHK.8, INFRA.1, 4, 5, 6 and QUEUE.PULL are not replaced. Then milestone by milestone.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each of the 16 milestone-F tasks is marked kept, merged into BL.0 (task-1) or changed, through the panel, with the reason on the task
- [x] #2 BL.0 overlap with CHK.0, CHK.7 and INFRA.3 is resolved task by task (merge or narrow)
- [x] #3 CHK.1-6, CHK.8, INFRA.1, INFRA.4-6 and QUEUE.PULL are confirmed not replaced
- [ ] #4 The same pass is then run milestone by milestone (1B first) and recorded on each task
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
2026-11-19 (BL-R7b): AC 1-3 done for m-0: 16 tasks marked (KEPT 9 incl. INFRA.4 already MERGED, CHANGED CHK.0 and CHK.7, MERGED INFRA.3, DROPPED INFRA.2 and CHK.4), QUEUE.PULL is not a task on the board. AC 4 (milestone by milestone, 1B first) stays open.

2026-11-19: AC 4 progress: the m-1 (1·B) pass was run as task-316 R10 (R10 report docs/reports/lanes/2026-11-19/BL-R10/); next milestone passes m-2 (1·C) onward remain; m-0 pass 2 after R8 was task-315 R9.
<!-- SECTION:NOTES:END -->
