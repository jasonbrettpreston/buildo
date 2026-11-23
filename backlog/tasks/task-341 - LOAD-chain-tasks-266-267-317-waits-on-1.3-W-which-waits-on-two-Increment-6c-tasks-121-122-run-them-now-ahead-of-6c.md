---
id: TASK-341
title: >-
  LOAD chain (tasks 266, 267, 317) waits on 1.3 W, which waits on two Increment
  6c tasks (121, 122): run them now, ahead of 6c?
status: DONE
assignee: []
created_date: '2026-11-19T20:13:00Z'
updated_date: '2026-11-23T16:06:00Z'
labels:
  - S
  - gap
  - plan:LOAD.1
  - operator
  - McFixReborn
milestone: m-1
dependencies: []
references:
  - .cursor/MCBYLAWS-QUEUE.md#L94
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L1063
priority: medium
type: decision
ordinal: 41012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In plain words: the loading screen when a user picks an address, its failure page and the first proof (tasks 266 LOAD.1, 267 LOAD.2, 317 LOAD.4) all need the customer read module (task-123, 1.3 W), and that module waits for two small tasks that sit in a later increment (task-121 6c.5a and task-122 6c.8a, Increment 6c). The decision is priority and order: do 121, then 122, then 123 run now, ahead of the rest of 6c, so that Increment 1·B can finish?

Grounded: yes. The chain is in the task files: task-266 depends on 123; 123 on 122; 122 on 62 and 121; 121 on 62; 267 on 266; 317 on 267. task-62 (push 6) is DONE (MORNING-DECISIONS.md:1150-1151), so 121 and 122 wait only for their place in 6c; task-121 plan text "READY to author after push 6 (hook runs the suite); no ruling needed". 121 and 122 recut and commit the staged MB-94 (c) tree so every lot with no stored Layer 3 rows shows not_in_engine_population ("Not yet evaluated"): Spec 126:809, .cursor/MCBYLAWS-QUEUE.md:693, ~/Buildo-scratch/lanes-20261117/inc-plan/6/BUILD-PASS.md:15. The staged tree is 5 files, +79 -4 (git -C ~/Buildo-wt-mb94c diff --cached --stat) on branch wf1/mb94c-1117, shown [behind 108] origin/wf1/mb-rulings by git status -sb. task-123 keeps 6c.8a because W returns a miss when no record exists (its planNote holistic-r1, approved by your answers of 2026-11-18); its earlier dependencies 8.28 and L.5 were removed in that note. RR-0178 (MORNING-DECISIONS.md:789) builds W now; RR-0271 (:1063) says 1·B completes after 1.3 W. Increment 6c is otherwise "Owner inputs and the one-lot run" (.cursor/MCBYLAWS-QUEUE.md:94, :1235-1237; about 37 tasks, backlog/docs/increments/doc-9). Landing dates in the tasks: 121 and 122 push 7, 123 push 9.

Recommendation: run 121, then 122, then 123 now, in that order, ahead of 6c; the rest of 6c stays in its increment. Pulls forward: two small 6c tasks (one commit each through the hooks and the station suite, recut on the current tip in a lane worktree because the staged tree is 108 commits behind) and the build of 1.3 W (the plan's GUESS is 2 days). Does not pull forward: owner inputs (6c.6, 6c.7), the one-lot run (MB-89), DB job J6, MB-38, the L.5 recapture, ST.P1 (push 12). Important: authoring earlier does not finish 1·B earlier unless the three also land at the next push station instead of push 7 and push 9; that timeframe is your call. Rollback: revert the two commits. Verified by review r1 of task-339 for the direction and the scope; UNVERIFIED: the conflict surface of the recut (not measured here), and U1-U3 on task-266 (adapter owner, inline compute against the route time limit, MB-94 part f tester gate not landed, .cursor/MCBYLAWS-QUEUE.md:685), which belong to the LOAD.1 build lane.
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
Dated note 2026-11-19 (M-246, prior text kept; RR-0301 · task-341 · Backlog; operator, verbatim: "task 341 approved")
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Approved by the operator 2026-11-19 (RR-0301, decision-88, MORNING-DECISIONS.md:1160: "task 341 approved"). Tasks 121, 122, 123 run now ahead of the rest of 6c, then LOAD.1 task-266, LOAD.2 task-267, LOAD.4 task-317. Recorded by lane BL-R14 (task-344).
<!-- SECTION:FINAL_SUMMARY:END -->
