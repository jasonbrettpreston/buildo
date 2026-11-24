---
id: TASK-425
title: >-
  RULES.INDEX.2 Rules sections for the engineering standards and the
  orchestrator rules document
status: DROPPED
assignee: []
created_date: '2026-11-21T22:20:00Z'
updated_date: '2026-11-24T18:41:00Z'
labels:
  - dead
milestone: m-1
dependencies:
  - TASK-427
type: build
ordinal: 125012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-21 by the orchestrator, Spec 137 rule 2, on the operator's rulings (the same as RULES.INDEX.1: "ORDERS the rules section done right"; RR-0368; RR-0370). THIS TASK: the "Rules index" sections of docs/specs/00_engineering_standards.md and backlog doc-17, in the form and under the check of RULES.INDEX.1, nothing in a body deleted, moved or rewritten; an engineering standards planted break caught by the single compliance call given only the sections; then the table switch for those lists. After it a tooling or spec-only task is one compliance call at the plan (estimate from ASSESSMENT.md: about 70,000 characters of rules) and one at the output for a diff under about 27,000 characters. Later specs (pipeline, by-law, web, phone, storage) are separate cards opened after this one proves the approach. Its plan is reviewed before launch. Files: docs/specs/00_engineering_standards.md, scripts/analysis/rule-lists.json, src/tests/backlog/rule-lists-table.logic.test.ts
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
Dated note 2026-11-22 (M-246, prior text kept; RR-0376 · task-425 · Backlog; operator, verbatim: "Exactly 1. Leave Spec 137 and Spec 08 as they are, and drop that part of task 427.")

Dated note 2026-11-22 (M-246, prior text kept; RR-0378 · task-425 · Backlog; operator, verbatim: "Plan approved. We are running right now on this? Add the tasks? This is the final changes to McSix step? Provide how this impacts the tasks as a plan and you can remove step 7 right now")
<!-- SECTION:NOTES:END -->
