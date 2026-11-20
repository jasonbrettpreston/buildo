---
id: TASK-412
title: >-
  FOLLOWUPS.ROW review_followups.md gets a rule-list row so a deferral has its
  Spec 08 home
status: LATER
assignee: []
created_date: '2026-11-20T23:40:00Z'
labels:
  - McFix
  - McFix V2
milestone: m-1
dependencies:
  - TASK-375
type: build
ordinal: 112012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-20 by the orchestrator from the plan of task-399 (section 9), Spec 137 rule 2. Operator approved the item (RR-0336, item 1 of the list put to him: a table row for review_followups.md, after task-375; until then a deferral goes to a named task). Rule: Spec 08 section 7 rule 6 (DEFER goes to review_followups.md with reasons). Today docs/reports/review_followups.md matches no row of scripts/analysis/rule-lists.json, so a lane cannot write it; the pile: outcome of task-399 (RR-0338) points here once it exists. Scope: one table row and its test. Not started; plan and panel before launch. Files: scripts/analysis/rule-lists.json, src/tests/backlog/rule-lists-table.logic.test.ts
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
