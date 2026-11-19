---
id: DRAFT-19
title: held-unruled items need the operator quoted ruling (11)
status: Draft
assignee: []
created_date: '2026-11-19T05:28:00Z'
updated_date: '2026-11-19T12:10:00Z'
labels:
  - follow-up
milestone: m-0
dependencies: []
references:
  - docs/reports/plan-import/2026-11-19-import-report.md#L124
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L852
  - docs/specs/00-architecture/137_mcqueue.md#L68
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Eleven plan items loaded as WAITS with the label held-unruled and no invented ruling text (D8): INFRA.2, CHK.4, 3.2, J5, X:J5-go, NOWB-LANE, INFRA-hooks-citation-gate, MB-76, MB-74, MB-79, MB-91. Each needs the operator quoted words entered through backlog-decision.mjs, then its status set to DROPPED, FROZEN or LATER.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each of the 11 items has the operator verbatim ruling recorded as a Backlog decision (G2) or is left open with a dated reason
- [x] #2 INFRA.2 and CHK.4 (DROP proposed) are resolved with the CHK.7 and INFRA.3 relevancy pass
- [x] #3 J5, X:J5-go and NOWB-LANE (dropped on Q-H2 a) get the quoted Q-H2 words or are re-opened
- [ ] #4 The label held-unruled is removed from each resolved task
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
2026-11-19 (BL-R7b): resolved: INFRA.2 and CHK.4 DROPPED (decision-69, MORNING-DECISIONS.md:750-751); J5 7.8, 7.9, 7.23 DROPPED on Q-H2 a (decision-70, MORNING-DECISIONS.md:738, question decisions.json:247-260); label removed on those five. Open: task-131, task-293, task-296, task-297, task-298, task-303 stay WAITS, operator word owed (dated note on each). AC 1 and 4 stay open.
<!-- SECTION:NOTES:END -->
