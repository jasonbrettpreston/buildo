---
id: TASK-413
title: GOLDEN.EXEMPT generated golden before-images are exempt from review material
status: LATER
assignee: []
created_date: '2026-11-20T23:40:00Z'
updated_date: '2026-11-24T18:41:00Z'
labels:
  - dead
milestone: m-1
dependencies:
  - TASK-410
type: build
ordinal: 113012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-20 by the orchestrator from the plan of task-399 (section 9), Spec 137 rule 2. Operator approved the item (RR-0336, item 2 of the list put to him: exempt the 36 generated golden before-images). Covers the task-410 findings plan-error-paths#6 and plan-plan-review-deepseek#4 (a single file over the review bound; grounder file docs/reports/lanes/2026-11-20/BL-V2WHOLE/GROUNDER.md). Scope: exempt globs in the table, with its test. Not started; plan and panel before launch. Files: scripts/analysis/rule-lists.json, src/tests/backlog/rule-lists-table.logic.test.ts
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
