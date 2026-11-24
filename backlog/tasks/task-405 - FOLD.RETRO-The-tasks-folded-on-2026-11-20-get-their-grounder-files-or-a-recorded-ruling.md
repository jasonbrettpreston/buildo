---
id: TASK-405
title: >-
  FOLD.RETRO The tasks folded on 2026-11-20 get their grounder files or a
  recorded ruling
status: LATER
assignee: []
created_date: '2026-11-20T16:34:00Z'
updated_date: '2026-11-24T18:41:00Z'
labels:
  - dead
milestone: m-1
dependencies: []
type: build
ordinal: 105012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Validated before writing by a separate read-only grounder (2026-11-20; verdict relayed to the operator; it ran no tests). Operator, 2026-11-20, verbatim: "Add this as Mcfix Z tasks - and show me that it works - ensure to validate it before you build these tasks" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md, entry "Operator ORDERS the McFix Z tasks"). Why: on 2026-11-20 eight lane branches were folded onto the board by a raw fast-forward merge with reviews done as messages and no GROUNDER.md; the close check (scripts/hooks/check-lane-close.mjs) runs only when a task moves to finished, so it never ran. Folded without a GROUNDER.md: task-374, 375, 376, 378, 384, 389 (and 366, 354, 372, 373, 90 from earlier, which hold only a triage file or none). Scope, after FOLD.CHECK and FOLD.ADOPT: run check-fold over each historical fold range as a report; each task then gets a separate grounder and a GROUNDER.md in a later docs commit, OR the operator accepts a named task as it is with a recorded ruling. No status moves by hand. Also unaddressed and listed here for the operator: a decision task can be moved to DONE or DROPPED in a docs-only commit without any review record (lane BL-RULESACC did this for task-348 and task-370 after the check refused the same move in a code commit); DROPPED is not a checked status. NOT BUILT, by the validator's verdict: a push-range arm (it would reverse the operator ruling RR-0317 'd. just add the review enforcement not the others', and is redundant once the git hook exists). Files: docs/reports/lanes/2026-11-20/BL-LEGAL/GROUNDER.md
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
Operator, 2026-11-20, verbatim: "I dont want to rule on every single fold." So: grounder files for every task named here; no per-task acceptance is asked of him.
<!-- SECTION:NOTES:END -->
