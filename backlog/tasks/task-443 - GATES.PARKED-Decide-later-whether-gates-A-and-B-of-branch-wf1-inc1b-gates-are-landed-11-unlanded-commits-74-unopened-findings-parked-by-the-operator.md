---
id: TASK-443
title: >-
  GATES.PARKED Decide later whether gates A and B of branch wf1/inc1b-gates are
  landed (11 unlanded commits, 74 unopened findings); parked by the operator
status: LATER
assignee: []
created_date: '2026-11-22T20:31:00Z'
updated_date: '2026-11-24T14:42:00Z'
labels:
  - McFix
  - McFix Final
  - dead
milestone: m-1
dependencies: []
type: build
ordinal: 143012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-22 by the orchestrator, Spec 137 rule 2, on RR-0386 (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1930): the operator chose option A, "a". PARKED: nothing is built or landed on this card until the operator says. FACTS (one read-only look, 2026-11-22, not grounded): branch wf1/inc1b-gates tip a59c93ac4, worktree ~/Buildo-wt-gates, 11 commits the board lacks (76fab5e70 to a59c93ac4): gate A (compute-reach: app code reaching the engine outside the approved list), gate B (mobile-literals: unit factors typed in phone code), both wired to block at pre-commit, three test files with planted red cases; gate C deleted. OWED if ever landed: a grounder on stages 2 and 3, 74 unopened findings, the branch is 290 commits behind the board, migration 333 is still on the branch though an earlier resolution said to drop it. Tasks 379 and 385 say they build on these gates. The branch and worktree are kept untouched.
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
Dated note 2026-11-22 (M-246, prior text kept; RR-0386 · task-443 · Backlog; operator, verbatim: "a")
<!-- SECTION:NOTES:END -->
