---
id: TASK-416
title: TOOLING.VARS review-gate literals registered as tooling_ variables
status: DROPPED
assignee: []
created_date: '2026-11-20T23:40:00Z'
updated_date: '2026-11-24T14:42:00Z'
labels:
  - McFix
  - McFix V2
  - McFix Final
  - dead
milestone: m-1
dependencies:
  - TASK-375
type: build
ordinal: 116012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-20 by the orchestrator from the plans of task-399 and task-375, Spec 137 rule 2. Rule: Spec 132 core.8 (no typed literals; registered variables). The review gate's numbers (prompt bound, minimum reason length and the like) are typed in the tools. A grounder ruled the finding CONFIRMED as a deferral (panel record docs/reports/reviews/task-399/). Needs a migration and the operator's typed DB GO; open operator question whether this is one task after task-375. Not started. Files: scripts/hooks/check-lane-close.mjs, scripts/deepseek-review.js, scripts/seeds/logic_variables.json
<!-- SECTION:DESCRIPTION:END -->

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
Dated note 2026-11-22 (M-246, prior text kept; RR-0385 · Backlog; operator, verbatim: "I agree with the task chages and removals."; MORNING-DECISIONS.md:1915 entry): withdrawn. Unbuilt gate work; built gates are kept (his words: "Keep those that are built").
<!-- SECTION:NOTES:END -->
