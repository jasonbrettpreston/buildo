---
id: TASK-344
title: >-
  R14 Increment 1·B: the task-341 approval entered and its dependency order
  applied; task-342 answered (where the design-elements file comes from,
  measured size, produce now or not)
status: LATER
assignee: []
created_date: '2026-11-19T20:30:00Z'
labels:
  - follow-up
milestone: m-1
dependencies: []
references:
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L1160
type: record
ordinal: 44012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator 2026-11-19, verbatim: "task 341 approved - also create a milestone task called loose ends and to tie up the loose ends with this task in later increments - task-341 - approved and add loose ends to loose ends tasks - task-342 where does the element file ocme from? if it needs to be produced at some point - we should do it now - if it isnt a big job" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1160; RR-0301, RR-0302, RR-0303). Record-only. Grounded: task-341 and task-342 are OPERATOR tasks in m-1 (lane BL-R13, docs/reports/lanes/2026-11-19/BL-R13/REPORT.md); task-67 CHK.6 names a report-design-elements file "filled from the designed report" (GUESS 0.5 d) that no task produces. Recommendation: UNVERIFIED until this task review round.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 RR-0301, RR-0302 and RR-0303 entered as Backlog decisions through G2; task-341 closed with the decision as its final summary
- [ ] #2 task-342 carries the answer: where the design-elements file comes from (source files with file:line), its measured size (element count, what exists already), and a Recommendation: line (produce now or not) with its verification
- [ ] #3 If producing the file now is recommended and small, one build task for it exists in the right milestone (LATER, with Scope now, sources and acceptance criteria) and task-67 depends on it
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
