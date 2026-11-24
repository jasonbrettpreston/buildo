---
id: TASK-408
title: >-
  V2.PROOF The board shows every day that the fold gate is on, and names any
  fold that went around it
status: DROPPED
assignee: []
created_date: '2026-11-20T17:12:00Z'
updated_date: '2026-11-24T18:41:00Z'
labels:
  - dead
milestone: m-1
dependencies:
  - TASK-398
  - TASK-401
  - TASK-402
type: build
ordinal: 108012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator, 2026-11-20, verbatim: "Hwo will I know it is actually working on a daily basis and no one has swtiched it off." (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md, entry "Operator APPROVES McFix V2"). McFix V2 step 6. Three lines on the existing self-rebuilding board (the launchd job, zero tokens), red when wrong: (1) GATE ON: the hook file .husky/reference-transaction is present in the board worktree, its hash equals the committed one, core.hooksPath is .husky, install-hooks verify passes. (2) CANARY: each rebuild the job attempts a fold of a kept, deliberately incomplete fixture branch (no grounder file) through raw git and through the fold script and records that BOTH were refused, with the time; a canary that is NOT refused prints FOLD GATE OFF in red. (3) AUDIT, independent of the hook: the fold script writes one record per fold (branch, range, task ids, check result, time); the job walks every commit that reached the board branch since the last push and lists any commit covered by NO fold record (a fold that went around the gate), by sha and author. Plus counts for the day: folds passed, folds refused, findings confirmed, confirmed with a fix, a follow-up task or a ruling. Acceptance: the three lines on the board; a demonstration in which the hook is disabled in a scratch clone and the canary line turns red; a planted unrecorded commit appears in the audit line. After tasks 398, 401, 402. Files: scripts/board/fold.mjs, scripts/board/board-commit.zsh, scripts/analysis/backlog-status-check.mjs
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
PRIORITY, operator 2026-11-20 verbatim: "I also need certainty within the tasks that a rpiority is getting the right information about compliance to the reviewer.  Put extra stree" (MORNING-DECISIONS.md, entry "Operator APPROVES the McFix V2 launch"). So the daily board adds a fourth line, REVIEWER INPUTS: each rebuild regenerates the lens input for one fixture task per kind of work and checks the five principles, the plan protocol, the objectives and the governing specs are in it (the same greps as V2.LIST acceptance 1); red with the missing document named when not.

Dated note 2026-11-22 (M-246, prior text kept; RR-0385 · Backlog; operator, verbatim: "I agree with the task chages and removals."; MORNING-DECISIONS.md:1915 entry): withdrawn. Unbuilt gate work; built gates are kept (his words: "Keep those that are built").
<!-- SECTION:NOTES:END -->
