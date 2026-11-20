---
id: TASK-366
title: >-
  COMPLY.2 Launch script attaches the governing rule lists by touched path; the
  close gate refuses a task without the compliance lens output per list and a
  separate grounder verdict
status: RUNNING
assignee:
  - '@lane-BL-COMPLY2'
created_date: '2026-11-20T13:04:00Z'
updated_date: '2026-11-20T13:10:00Z'
labels: []
milestone: m-1
dependencies: []
type: build
ordinal: 66012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator 2026-11-20 (verbatim): "Add the tasks to incr 1b - the infa freeze needs to be lifted again - what is the point of building a mess - wasted effort." Record: ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md, entry "Operator: compliance tooling tasks into 1·B". Scope now: (1) a data table mapping path globs to rule lists, used whole: pipeline steps, compute and migrations -> Spec 132 handbook, the Airtight V1 to V3 sources, Spec 133 for by-law rows, engineering standards; src/app/api and src/lib -> engineering standards sections 2, 4, 10, 11, McStorage policy when a report is computed or stored, fe.38 and fe.39 on the lookup; scripts/surfaces, content, bindings -> Spec 136 (all 44 rules) and Spec 128; mobile/ -> Specs 90, 98, 99, 100, 96 and Spec 136; queue and records -> Spec 137 and Spec 08. (2) scripts/analysis/backlog-lane.mjs reads the task Files line, attaches the lists to the brief and the lens line; (3) the close refuses BUILT unless a compliance lens output exists per attached list and a grounder verdict file written by an agent that is not the lane; (4) reuse the existing rule maps where they already map file to rule (task-365 reports which do). No hand-picked clauses anywhere. Waits on: task-365 report.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The path to rule-list table is data, with a test that every listed rule file exists
- [ ] #2 A brief for a task touching mobile/ and src/app/api names every list in the table for those paths (test, red first)
- [ ] #3 Close is refused without one lens output per attached list (test, red first)
- [ ] #4 Close is refused without a grounder verdict file from a different agent (test, red first)
- [ ] #5 Spec 08 and Spec 137 carry the dated note with the operator words
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
2026-11-20 taken on the board at lane launch (lane BL-COMPLY2, worktree /Users/brettpreston_macmini/Buildo-wt-comply2, branch wf1/inc1b-comply2), RR-0240
<!-- SECTION:NOTES:END -->
