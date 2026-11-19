---
id: TASK-306
title: >-
  R8a Open decisions on the board: OPERATOR status, Grounded and Recommendation
  lines, the three expired McFrontend rows mirrored
status: RUNNING
assignee:
  - '@lane-BL-R8a'
created_date: '2026-11-19T12:52:00Z'
updated_date: '2026-11-19T13:02:00Z'
labels:
  - follow-up
  - open-decisions
milestone: m-0
dependencies: []
references:
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L924
  - ~/Buildo-scratch/lanes-20261119/boardmove-v2/build-r7b/REPORT.md
type: record
project: McIncrement
ordinal: 16012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator 2026-11-19 (RR-0232): "recommendation approved - however the open decisions need to provide whether it has been grounded (the issue) and the recommendation (verified)." Grounded: yes - the six held items sit in WAITS with the label held-unruled (lane BL-R7b notes), the OPERATOR column holds one task (task-89), and the three expired McFrontend rows are not on the board (only tasks 110 and 112 mention them). Recommendation: set those tasks to OPERATOR and mirror the three rows, so the OPERATOR column by milestone is the operator open-decision list; UNVERIFIED until the repo review round of this task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every task that waits on the operator word is status OPERATOR (the six held items task-131, 293, 296, 297, 298, 303 first), with the two lines Grounded: and Recommendation: in its description (RR-0232)
- [ ] #2 MF-08, MF-22 and MF-49 are mirrored as OPERATOR tasks in their milestones (grounded from their queue rows), each with Grounded: and Recommendation:
- [ ] #3 Spec 137 rule 13 gains a dated note: an open decision reaches the operator only with Grounded: and Recommendation: lines; backlog-next.mjs lists OPERATOR tasks that lack them (red test first)
- [ ] #4 Repo review round r1 on the plan of this task, triaged, before any change
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
2026-11-19 taken on the board by the orchestrator at lane launch (lane BL-R8a in ~/Buildo-wt-r8a, branch wf2/r8a-open-decisions)
<!-- SECTION:NOTES:END -->
## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Review round r1 (plan) via scripts/deepseek-review.js, triage KEEP/REJECT, before any change (AC4).
2. Red test src/tests/backlog/backlog-next-operator.logic.test.ts, then backlog-next.mjs OPERATOR section, then Spec 137 rule 13 dated note; commit 1 (AC3).
3. Six held tasks task-131,293,296,297,298,303 to status OPERATOR with Grounded: and Recommendation: lines (AC1).
4. Mirror MF-08, MF-22, MF-49 as OPERATOR queue-row tasks in their milestones with the two lines; commit 2 (AC2).
<!-- SECTION:PLAN:END -->
