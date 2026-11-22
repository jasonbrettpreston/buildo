---
id: TASK-439
title: >-
  FINAL.4 Front-end reviews stop sending the four surface specs once the
  handbook holds their rules (after task-430)
status: LATER
assignee: []
created_date: '2026-11-22T20:24:00Z'
labels:
  - McFix
  - McFix Final
milestone: m-1
dependencies: []
type: build
ordinal: 139012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-22 by the orchestrator, Spec 137 rule 2, on the operator's ruling RR-0385 (MORNING-DECISIONS.md:1915 entry, RR-0385, decision-170). Operator, verbatim (RR-0376): "Just send the handbook rules for the task"; (RR-0380) "once the handbook has been updated iwth the critical items"; (RR-0383) tasks that edit the surface specs keep them attached. THIS TASK: one table edit after task-430 lands: Specs 126, 127, 128 and 135 leave the front-end and phone rows; the specs-web-admin row keeps them. Measured by the task-431 plan grounder: a front-end review goes from about 558,000 to about 83,000 characters. Scope and Files line at its plan review. Every build task of this plan follows the six steps, plan written and built on Opus (his words: "I want this plan for each task and built by opus").
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
