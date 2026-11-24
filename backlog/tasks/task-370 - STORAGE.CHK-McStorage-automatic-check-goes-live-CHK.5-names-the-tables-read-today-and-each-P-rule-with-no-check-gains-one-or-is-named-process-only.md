---
id: TASK-370
title: >-
  STORAGE.CHK McStorage automatic check goes live: CHK.5 names the tables read
  today, and each P rule with no check gains one or is named process-only
status: DROPPED
assignee: []
created_date: '2026-11-20T13:23:00Z'
updated_date: '2026-11-24T14:42:00Z'
labels:
  - McFix E
  - McFix
  - dead
milestone: m-1
dependencies: []
type: build
ordinal: 70012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator 2026-11-20 (verbatim): "yes to McStorage and 1,2,3 yes as recommended". Record: ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md, entry "Operator: McStorage amendments and check into 1·B; second front-end pass". and (same day) 'Why can't there be machine checks for the sotrage and queue'. Scope now, stage 1 a measured plan: CHK.5 (task-66, built) prints WAITS 'chk5_tables is empty' on every commit; the customer read (task-123) and the compute at the pick (task-266) already read and project stored rows. Measure what CHK.5 checks today, name the tables and readers that exist now, and for each of P1 to P12 of the landed policy say: checked by (file:line), checkable now (the check, red first), or process-only (why). Includes the two findings of task-365 if the grounder confirms them: the freshness check compares two of the three stamp parts; a compute failure shows a server error where the policy says a closed not_evaluated reason. Waits on: task-90 (the amendments landed) and task-368 (the grounder).

ruling: Task 370 yes . approved
Ruling record RR-0329 (decision-114), operator words at ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1427. That "Task 370 yes" means drop task-370 from this increment is the ORCHESTRATOR READING at :1428 (the recommendation put), not the operator's words; status moved in the commit of task-387 (RULES.ACC), Spec 137 section 3.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A table P1 to P12: checked by, checkable now, or process-only, each with file:line
- [ ] #2 CHK.5 no longer prints WAITS for tables that exist today, or the reason it must is stated with the rule
- [ ] #3 Each new check is red on a planted defect and green on the tree
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
Operator 2026-11-20, verbatim: "Task 370 yes . approved" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1427; the table put to him is quoted in that entry). DROPPED from this increment by the operator words above (the recommendation put: "Task 370 (storage automatic check): I recommend dropping it from this increment"). Status move owed through the ruling record (task-387); do not launch.

Dated note 2026-11-20 (M-246, prior text kept; RR-0329 · task-370 · Backlog; operator, verbatim: "Task 370 yes")
<!-- SECTION:NOTES:END -->
