---
id: DRAFT-35
title: >-
  Backlog CLI cannot find task-307 and task-308 by id (title characters);
  re-title and guard the title rule
status: Draft
assignee: []
created_date: '2026-11-19T15:26:00Z'
labels:
  - follow-up
milestone: m-0
dependencies: []
references:
  - backlog/tasks
type: fix
project: McIncrement
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Measured 2026-11-19 on the board checkout at aa1371eb5: `backlog task view task-307 --plain` and task-308 answer "Task task-307 not found. Task lookups read only the local working copy" although `ls backlog/tasks | grep task-307` lists the file and origin carries it; every other id reads. Both titles carry the characters < > (R8c: docs/reports/lanes/<date>/<lane>/) or a colon after a path; the status edits to DONE could not be applied through the CLI. Grounded: yes. Recommendation: re-title both through G2-free means (backlog task edit is refused; the loader/CLI title rule should strip < > and keep titles plain); UNVERIFIED until its review round.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 backlog task view/edit task-307 and task-308 find their files (both exist under backlog/tasks and on origin); the cause (title characters such as < > / or the file name form) is named and either the titles are re-written through the CLI or the loader title rule avoids the characters; red test on a fixture
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
