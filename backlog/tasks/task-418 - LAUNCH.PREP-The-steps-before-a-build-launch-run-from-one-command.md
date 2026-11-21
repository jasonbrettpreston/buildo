---
id: TASK-418
title: LAUNCH.PREP The steps before a build launch run from one command
status: LATER
assignee: []
created_date: '2026-11-21T00:24:00Z'
labels:
  - McFix
  - McFix V2
milestone: m-1
dependencies:
  - TASK-375
type: build
ordinal: 118012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-20 by the orchestrator, Spec 137 rule 2. Operator ruling RR pending record (MORNING-DECISIONS.md:1598, verbatim: "5 yes.", to the question as put: the pre-launch steps are done by the orchestrator by hand for task-375, and scripting them is the first task after 375, before the other build tasks launch). Why: before a build or fix launch the plan is reviewed (DeepSeek lens set per rule list, Reality-Check and Integration seats), ruled by a separate grounder, folded, the fold checked, and the evidence put on the task and committed (Spec 08 sections 6.4, 5.3, 11.2); for task-399 this was about ten hand commands by the orchestrator. Scope to be planned and reviewed by the plan panel before launch; existing commands first (rule-lists.mjs lens-input and check-tasks, backlog-brief.mjs, backlog-lane.mjs, board-commit.zsh); it scripts the mechanical steps only, never a ruling. Launches after task-375 folds, under its launch check. Files: scripts/analysis/backlog-lane.mjs, scripts/analysis/rule-lists.mjs, src/tests/backlog/backlog-lane.logic.test.ts
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
