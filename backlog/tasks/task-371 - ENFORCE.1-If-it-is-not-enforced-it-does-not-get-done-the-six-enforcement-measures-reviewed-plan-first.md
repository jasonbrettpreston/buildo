---
id: TASK-371
title: >-
  ENFORCE.1 If it is not enforced it does not get done: the six enforcement
  measures, reviewed plan first
status: RUNNING
assignee:
  - '@lane-BL-ENFORCE'
created_date: '2026-11-20T13:31:00Z'
updated_date: '2026-11-20T13:43:00Z'
labels: []
milestone: m-1
dependencies: []
references:
  - docs/reports/lanes/2026-11-20/BL-ENFORCE/PLAN.md
  - docs/reports/lanes/2026-11-20/BL-ENFORCE/FINDINGS.md
  - docs/reports/lanes/2026-11-20/BL-ENFORCE/REPORT.md
type: build
ordinal: 71012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator 2026-11-20 (verbatim): "Essentially if its not enforced it doesnt get done is my view. ... We spend so much time making rules and recording decisions but we dont follow them.  Same lesson over ans over" and "Review them first 1. y 2. y 3. y 4. y 5. where does this rule set go on the board yes 6. yes". Record: ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md, entry "Operator: the six enforcement recommendations approved, reviewed first". Scope now, STAGE 1 a reviewed plan (lens set and a separate grounder BEFORE any build): (1) every rule set records per rule: check, owed with a task, or advice; the unchecked count pinned, shrink-only; (2) the push station refuses a push unless the handbook pass on that commit has a grounder verdict; a task close needs one (with task-366); (3) the push station runs the phone tests and refuses a push until they pass on that commit; (4) a ruling and its check are recorded in one step by generator; (5) one number on the board per rule set (in force, machine-checked, owed): where on the board; (6) the list of stale or uncheckable rules as retirement candidates for the operator. Files: docs/reports/lanes/2026-11-20/BL-ENFORCE/PLAN.md
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each of the six has: the existing mechanism it extends (file:line), the smallest build, its test red first, its cost, and what it refuses
- [ ] #2 The plan is reviewed by the lens set with the governing rule lists whole and ruled on by a separate grounder before any build
- [ ] #3 Item 5 names the exact place on the board with a mock of the row
- [ ] #4 Item 6 lists candidates only; nothing retired
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Per measure 1 to 6: rule quoted file:line, existing mechanism file:line, smallest build with red-first test, refusal message, cost (measured or GUESS), what it cannot do, bypass (AC1). 2. Run the DeepSeek lens set on the plan with each governing rule list whole (Spec 08 s5/7/11, Spec 137, eng s5/9/14, Spec 132 s4/6) plus code-review, error-paths, security; list findings by id; a separate grounder rules (AC2, grounder owed). 3. Measure 5: board place and text mock (AC3). 4. Measure 6: retirement candidates only (AC4). 5. Build order and operator decision drafts. Plan: docs/reports/lanes/2026-11-20/BL-ENFORCE/PLAN.md
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-20 taken on the board at lane launch (lane BL-ENFORCE, worktree /Users/brettpreston_macmini/Buildo-wt-enforce, branch wf1/inc1b-enforce), RR-0240

2026-11-20 stage 1 plan and lens round 1 done (94 findings, untriaged, FINDINGS.md); task stays RUNNING: grounder owed.
<!-- SECTION:NOTES:END -->
