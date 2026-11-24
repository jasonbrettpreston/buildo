---
id: TASK-428
title: >-
  MCFIX.CLEANUP The board made to match the operator's rulings on finished and
  dropped McFix tasks; the unused pack files removed
status: LATER
assignee: []
created_date: '2026-11-21T22:41:00Z'
updated_date: '2026-11-24T14:42:00Z'
labels:
  - McFix
  - McFix V2
  - dead
milestone: m-1
dependencies: []
type: record
ordinal: 128012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-21 by the orchestrator, Spec 137 rule 2, on the operator's approval (MORNING-DECISIONS.md entry "APPROVES the worktree removals by the orchestrator and the McFix cleanup", verbatim: "Mcfix cleanup is approved."). The plan: ~/Buildo-scratch/lanes-20261119/inc1b/retro/MCFIX-CLEANUP-PLAN-v1.md (Part 1 task table, Part 3 steps 1 and 4; read-only grounding of 2026-11-21, to be re-checked against the board as it is now). THIS TASK (records, made by a lane, never by the orchestrator's hand): (1) the board status moves the plan lists, each with the ruling quoted by its MORNING-DECISIONS line (tasks 385, 397, 400, 404, 371, 377, 403, 413, 420; task 409 milestone; task 398 reset; task-414 stays open and unchanged, RR-0367 hold); re-verify each against the decisions file and the board before moving it, and leave any that no longer fits, listed with the reason; (2) remove the 45 unused files under .claude/review-templates/packs and the README section that names them, after `git grep` shows nothing reads them (task-426 edits packs/spec08.md: coordinate, do not collide). Not in this task: worktree removal (the operator's hands, lane-guard B4), the 117 older worktrees, the seven tasks that are the operator's. Files: .claude/review-templates/README.md
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
