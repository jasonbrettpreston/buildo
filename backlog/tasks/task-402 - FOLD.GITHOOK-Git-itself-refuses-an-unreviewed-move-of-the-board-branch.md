---
id: TASK-402
title: FOLD.GITHOOK Git itself refuses an unreviewed move of the board branch
status: DROPPED
assignee: []
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
ordinal: 102012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Validated before writing by a separate read-only grounder (2026-11-20; verdict relayed to the operator; it ran no tests). Operator, 2026-11-20, verbatim: "Add this as Mcfix Z tasks - and show me that it works - ensure to validate it before you build these tasks" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md, entry "Operator ORDERS the McFix Z tasks"). Why: on 2026-11-20 eight lane branches were folded onto the board by a raw fast-forward merge with reviews done as messages and no GROUNDER.md; the close check (scripts/hooks/check-lane-close.mjs) runs only when a task moves to finished, so it never ran. The stop that does not depend on the orchestrator. Scope: .husky/reference-transaction (about 30 lines): exits at once unless the transaction names refs/heads/wf2/board; allows a move to a commit already on origin (the board-ff job) and a single commit touching only backlog/** (the board-commit job); otherwise runs check-fold old new and refuses. Add it to the HOOKS list in scripts/hooks/install-hooks.mjs (near :17) so verify fails closed without it. FIRST prove by a real run, in a throwaway repository, that this git version fires the hook on a fast-forward merge, update-ref, branch -f, push . and fetch . (the validator took this from git documentation, not from a run): if it does not fire on a fast-forward, STOP and report. Separately, a user-level lane-guard rule B7 refusing raw merge, rebase, update-ref, branch -f and hooksPath overrides on the board: that file is outside the repo and is applied by the operator with his typed go (text drafted here, not applied). Known ways past, stated: a hook switched off by configuration, a direct write under .git, a worktree whose checkout lacks the hook, a person at a shell. Acceptance: the four raw routes are refused with the check's own lines and the board tip unchanged; the board-commit and board-ff jobs still work. Files: .husky/reference-transaction, scripts/hooks/install-hooks.mjs, src/tests/backlog/check-fold.logic.test.ts
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
2026-11-20 FORGERY ROUTES owned here (task-410 grounder file ~/Buildo-scratch/lanes-20261119/inc1b/v2whole/GROUNDER.md, sha256 b3425b2c1d6c0b77f90dffc6065954ff0df8394e603c7245e7dadfa2af6a67b; operator entry '2026-11-20 · Operator ORDERS task-410 finished', 'Finsih it!'): task-410's close check is an omission guard and does not stop a lane that sets out to forge: (1) a hand-written output with the right public hashes; (2) an earlier-commit edit of the lane's own working-tree copy of scripts/hooks/check-lane-close.mjs, scripts/analysis/rule-lists.mjs, scripts/analysis/mcbylaws/paths.mjs or the commit-msg hook (it changes what runs at commit time); (3) a board ref moved by a forbidden command. The git-level refusal of an unreviewed move of the board branch (this task) is the place for (2) and (3).

Dated note 2026-11-22 (M-246, prior text kept; RR-0385 · Backlog; operator, verbatim: "I agree with the task chages and removals."; MORNING-DECISIONS.md:1915 entry): withdrawn. Unbuilt gate work; built gates are kept (his words: "Keep those that are built").
<!-- SECTION:NOTES:END -->
