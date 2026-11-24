---
id: TASK-398
title: FOLD.CHECK The close check runs on a branch range before a fold
status: DROPPED
assignee:
  - '@lane-BL-FOLDCHECK'
created_date: '2026-11-20T16:34:00Z'
updated_date: '2026-11-24T14:42:00Z'
labels:
  - McFix
  - McFix Z
  - McFix V2
  - McFix Final
  - dead
milestone: m-1
dependencies: []
type: build
ordinal: 98012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Validated before writing by a separate read-only grounder (2026-11-20; verdict relayed to the operator; it ran no tests). Operator, 2026-11-20, verbatim: "Add this as Mcfix Z tasks - and show me that it works - ensure to validate it before you build these tasks" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md, entry "Operator ORDERS the McFix Z tasks"). Why: on 2026-11-20 eight lane branches were folded onto the board by a raw fast-forward merge with reviews done as messages and no GROUNDER.md; the close check (scripts/hooks/check-lane-close.mjs) runs only when a task moves to finished, so it never ran. Scope: a new scripts/hooks/check-fold.mjs (about 120 lines) that loads tasks, lane files and the changed paths from a git range (old..new) and not from the index, then calls the EXISTING exported closeErrors: a fold is judged by the same rules as a close, no second rule set. Acceptance, as planted-defect tests each with a passing control: refused with (a) no GROUNDER.md, (b) one finding with no verdict, (c) a changed path outside the task Files line, (d) a code range with no lane TASK file; one complete fixture passes. Files: scripts/hooks/check-fold.mjs, src/tests/backlog/check-fold.logic.test.ts
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
2026-11-20 taken on the board at lane launch (lane BL-FOLDCHECK, worktree /Users/brettpreston_macmini/Buildo-wt-foldcheck, branch wf1/inc1b-foldcheck), RR-0240

Dated note 2026-11-22 (M-246, prior text kept; RR-0385 · Backlog; operator, verbatim: "I agree with the task chages and removals."; MORNING-DECISIONS.md:1915 entry): to be withdrawn after a read-only look at what the lane branch holds (unbuilt gate work). Status not changed yet.

Dated note 2026-11-22 (M-246, prior text kept; RR-0385 · Backlog; operator, verbatim: "I agree with the task chages and removals."): withdrawn after the read-only look of 2026-11-22: branch wf1/inc1b-foldcheck (2808793b7) is an ancestor of the board, 0 unlanded commits, no check-fold code was ever written. Nothing is lost. The lane worktree and branch are left as they are (worktrees are removed only through the operator).
<!-- SECTION:NOTES:END -->
