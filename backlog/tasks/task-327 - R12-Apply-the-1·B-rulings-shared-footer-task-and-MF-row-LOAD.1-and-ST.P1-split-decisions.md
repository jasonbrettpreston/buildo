---
id: TASK-327
title: >-
  R12 Apply the 1·B rulings: shared footer task and MF row, LOAD.1 and ST.P1
  split, decisions
status: DONE
assignee:
  - '@lane-BL-R12'
created_date: '2026-11-19T15:37:00Z'
updated_date: '2026-11-24T18:41:00Z'
labels:
  - dead
milestone: m-1
dependencies: []
references:
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L1061
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L1066
  - docs/reports/lanes/2026-11-19/BL-R12/REPORT.md
  - docs/reports/lanes/2026-11-19/BL-R12/TRIAGE.md
  - docs/reports/lanes/2026-11-19/BL-R12/r1-review.txt
type: record
project: McIncrement
ordinal: 29012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator 2026-11-19 (MORNING-DECISIONS.md:1061, :1065): "1. once  -approved 2. y" and "this is a shared component - validate this isnt in incr-1c". Grounded: yes - the R11 recommendations on task-324 and task-325 were verified by review r1 of task-326; 1·C (m-2) holds no footer item; the report footer elements are doc-4 G2-G5. Recommendation: one record lane applies the three rulings to the board and the queue; UNVERIFIED until its review round.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 task-324 DONE with decision (RR-0270) through G2; the SRCH.FOOTER shared-footer task created in m-1 with its MF queue row and claimed id; LS.12 depends on it; the shared-component ruling (RR-0273) entered through G2 naming the new task, task-127 and task-324
- [x] #2 task-325 DONE with decision (RR-0271) through G2; task-266 depends on task-123 only; task-265 depends on task-82, task-259, task-266; scope notes on both; backlog doctor clean
- [x] #3 Repo review round r1 in review mode, triaged
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
1. Review round r1 (review mode, plan template) on this plan, the new task text, the MF row text and the dependency edits; triage KEEP/REJECT with the opened line (TRIAGE.md); fold KEPT.
2. Create the SRCH.FOOTER build task in m-1 through the CLI (type build, labels S and plan:SRCH.FOOTER, AC, refs, depends-on task-127); claim MF-91 in the id ledger (mkdir) and add the MF-91 row and the Next free id bump (MF-92) to .cursor/MCFRONTEND-QUEUE.md in the neighbouring row form.
3. G2 decisions through scripts/analysis/backlog-decision.mjs: RR-0270 (task-324, task-287, new task), RR-0273 (new task, task-127, task-324), RR-0271 (task-325, task-266, task-265, task-123); set task-324 and task-325 DONE with the decision as final summary.
4. Dependency edits through the CLI: task-287 add the new task; task-266 to task-123; task-265 to task-82,task-259,task-266; append the scope notes; backlog doctor clean.
5. One docs commit through the real hooks (Task: task-327), then the lane reports in the repo, task-327 closed.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-19 taken on the board at lane launch (lane BL-R12, worktree /Users/brettpreston_macmini/Buildo-wt-r12, branch wf2/inc1b-r12), RR-0240

AC1: decisions 77, 78 (docs/reports/lanes/2026-11-19/BL-R12/REPORT.md); task-332 created; MF-91 claimed (ls ids: MF-90 MF-91). AC2: decision-79; doctor clean. AC3: r1-review.txt and TRIAGE.md. Coordinator addition: decisions 80, 81 written; task-328/329 DONE edits skipped (not in this worktree).

2026-11-19 DONE: closing commits on origin/wf1/mb-rulings (push window 5: 78f552fbb at 16:56Z, station PASS 28367 tests)
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Rulings applied in commit ce19eab1b (hooks: GATE OK, POLICY CHECKS OK): decisions 77-81, task-324 and task-325 DONE, task-332 SRCH.FOOTER with row MF-91, dependency edits on task-287, task-266, task-265; report in docs/reports/lanes/2026-11-19/BL-R12/.
<!-- SECTION:FINAL_SUMMARY:END -->
