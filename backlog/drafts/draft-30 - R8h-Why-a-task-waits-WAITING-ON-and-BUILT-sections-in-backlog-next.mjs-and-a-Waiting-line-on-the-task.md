---
id: DRAFT-30
title: >-
  R8h Why a task waits: WAITING ON and BUILT sections in backlog-next.mjs and a
  Waiting: line on the task
status: Draft
assignee: []
created_date: '2026-11-19T13:22:00Z'
labels:
  - follow-up
milestone: m-0
dependencies: []
references:
  - scripts/analysis/backlog-next.mjs#L1
type: build
project: McIncrement
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator 2026-11-19: "If I take task 2 for example (waiting) how do I know its dependency, if any. I would like to what is running but also why and if the waiting tasks are not running (is it a push etc). How does backlog solve this problem?" Grounded: yes - Backlog shows dependencies only in the task detail (front matter dependencies, task view Dependency Graph); the kanban card shows none; backlog-next.mjs lists READY, DUE, OVERDUE and OPERATOR but gives no reason for WAITS or BUILT tasks. Recommendation: two sections in the next-task tool plus a Waiting: line on the task; no new tool; UNVERIFIED until the review round of this task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 backlog-next.mjs prints a WAITING ON section: every WAITS task with the exact reason (each dependency not DONE with its status, the when: ids not DONE, the held-unruled label, or the OPERATOR item it waits on) and a BUILT section: every BUILT task with its lane branch and the note that it waits on the push window; red tests first
- [ ] #2 The same two reasons are written as a one-line Waiting: note on each WAITS and BUILT task through the CLI when a lane sets that status (brief text), so the board detail panel shows it
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
