---
id: TASK-308
title: >-
  R8c Lane reports in the repo: docs/reports/lanes/<date>/<lane>/REPORT.md at
  the lane close step
status: RUNNING
assignee:
  - '@lane-BL-R8c'
created_date: '2026-11-19T12:52:00Z'
updated_date: '2026-11-19T13:02:00Z'
status: BUILT
assignee:
  - '@lane-BL-R8c'
created_date: '2026-11-19T12:52:00Z'
updated_date: '2026-11-19T12:59:00Z'
labels:
  - follow-up
milestone: m-0
dependencies: []
references:
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L924
  - docs/specs/00-architecture/08_agents.md#L341
type: record
project: McIncrement
ordinal: 18012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator 2026-11-19 (RR-0232), proposal (c) approved. Grounded: yes - 162 task references point at lane REPORT.md files under ~/Buildo-scratch (not in the repo), while the review records already live in docs/reports/reviews/<task>/ (Spec 08 section 7 rule 10 (a)). Recommendation: the lane close step copies the report into the repo so every reference resolves from the board; UNVERIFIED until the repo review round of this task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Spec 08 section 7 rule 10 (a) gains a dated note and standing-rules.md a line: a lane close step copies its REPORT.md to docs/reports/lanes/<date>/<lane>/REPORT.md in its last commit
- [x] #2 The 2026-11-19 lane reports (build-r6, build-r7a, build-r7b) are copied there and the references of tasks 305, 64, 66 and 1 point at the repo copies
- [x] #3 Repo review round r1 on the plan of this task, triaged, before any change
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-19 taken on the board by the orchestrator at lane launch (lane BL-R8c in ~/Buildo-wt-r8c, branch wf2/r8c-lane-reports; the lane has since reported BUILT on its branch, commit 69a9d24cf)
<!-- SECTION:NOTES:END -->
## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Review round r1 of this plan, triage.
2. Dated note on Spec 08 s7 rule 10 (a).
3. Copy 2026-11-19 reports with cmp.
4. --add-ref on tasks 305, 64, 66, 1.
5. One docs commit, Task: task-308.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
AC1: dated note added at 08_agents.md:344 (after the rule 10 notes of 2026-11-06); the standing-rules.md line is proposed in the lane REPORT.md (file outside write scope, orchestrator applies). AC2: 7 files byte-copied, cmp ok each, under docs/reports/lanes/2026-11-19/{BL-R6,BL-R7a,BL-R7b}; --add-ref (adds, keeps old entries) on tasks 305, 64, 66, 1. AC3: r1 plan review run, 0 KEPT (the tool read .cursor/active_task.md, off-target); TRIAGE in lane dir. Docs-only change: no test.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Lane reports in the repo: Spec 08 rule 10 (a) dated note, 2026-11-19 reports of BL-R6, BL-R7a, BL-R7b copied with cmp, references of tasks 305, 64, 66, 1 point at the repo copies. standing-rules.md rule 19 proposed in the lane report.
<!-- SECTION:FINAL_SUMMARY:END -->
