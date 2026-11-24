---
id: TASK-401
title: FOLD.SCRIPT Folds go through one script that confirms what it did
status: LATER
assignee: []
created_date: '2026-11-20T16:34:00Z'
updated_date: '2026-11-24T18:41:00Z'
labels:
  - dead
milestone: m-1
dependencies: []
type: build
ordinal: 101012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Validated before writing by a separate read-only grounder (2026-11-20; verdict relayed to the operator; it ran no tests). Operator, 2026-11-20, verbatim: "Add this as Mcfix Z tasks - and show me that it works - ensure to validate it before you build these tasks" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md, entry "Operator ORDERS the McFix Z tasks"). Why: on 2026-11-20 eight lane branches were folded onto the board by a raw fast-forward merge with reviews done as messages and no GROUNDER.md; the close check (scripts/hooks/check-lane-close.mjs) runs only when a task moves to finished, so it never ran. Scope: scripts/board/fold.mjs (about 80 lines): confirms the board worktree is on wf2/board with a clean tree; the lane branch contains the board tip; runs the board-commit job; runs check-fold on tip..branch; fast-forward merge with the exit status read directly (never piped: three false FOLD-OK reports on 2026-11-20 came from a pipe hiding the status); prints FOLD-OK <sha> only after merge-base --is-ancestor AND rev-parse equality both hold. A --check-only mode for demonstrations. Acceptance: on every refusal path the board tip is unchanged (test). Files: scripts/board/fold.mjs, src/tests/backlog/check-fold.logic.test.ts
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
2026-11-20 FORGERY ROUTES owned here (task-410 grounder file ~/Buildo-scratch/lanes-20261119/inc1b/v2whole/GROUNDER.md, sha256 b3425b2c1d6c0b77f90dffc6065954ff0df8394e603c7245e7dadfa2af6a67b; operator entry '2026-11-20 · Operator ORDERS task-410 finished', 'Finsih it!'): task-410's close check is an omission guard (it refuses a skipped review, rule list, changed file, stale input or a close without a separate grounder's file). It does not stop a lane that sets out to forge: (1) a hand-written output with the right public hashes; (2) an earlier-commit edit of the lane's own working-tree copy of scripts/hooks/check-lane-close.mjs, scripts/analysis/rule-lists.mjs, scripts/analysis/mcbylaws/paths.mjs or the commit-msg hook; (3) a board ref moved by a forbidden command. Fold-time enforcement of (2) and (3) belongs to the fold script of this task.
<!-- SECTION:NOTES:END -->
