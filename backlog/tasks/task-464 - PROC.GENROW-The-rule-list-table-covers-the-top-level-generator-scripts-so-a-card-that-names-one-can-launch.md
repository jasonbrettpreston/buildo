---
id: TASK-464
title: >-
  PROC.GENROW The rule-list table covers the top-level generator scripts, so a
  card that names one can launch
status: WAITS
assignee: []
created_date: '2026-11-25T12:31:00Z'
labels:
  - ProcessImprovement
milestone: m-1
dependencies: []
ordinal: 158210
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-25 by the orchestrator from RR-0475 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2481, operator answer 1: yes). Source: plan grounder Cairn-Ground-P454, operator question 2 (docs/reports/reviews/task-454/QUESTIONS-RULED.md). The launch gate refuses task-454 because its Files line names scripts/generate-logic-variable-groups.mjs and no row of scripts/analysis/rule-lists.json matches a top-level scripts/*.mjs file (rule-lists.mjs:273; the step-pipeline row covers scripts/*.js only). 18 top-level scripts/generate-* files exist, 9 of them .mjs. Smallest change: one existing row gains a glob for the top-level generator .mjs scripts (the planner names the row and the exact glob from the table and the specs that govern those scripts); no new list, no new row unless the plan shows the existing rows cannot hold it. The rule-lists page is regenerated. Not planned yet. Blocks task-454.

Files: scripts/analysis/rule-lists.json, src/tests/backlog/rule-lists.logic.test.ts, docs/reports/generated/rule-lists-by-kind.md
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The launch gate resolves a Files line that names scripts/generate-logic-variable-groups.mjs (task-454's line resolves with no unmatched path), a test locks it and was red first, and the rule-lists page is current
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
