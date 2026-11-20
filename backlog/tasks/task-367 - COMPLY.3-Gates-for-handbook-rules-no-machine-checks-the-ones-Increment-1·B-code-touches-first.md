---
id: TASK-367
title: >-
  COMPLY.3 Gates for handbook rules no machine checks, the ones Increment 1·B
  code touches first
status: RUNNING
assignee:
  - '@lane-BL-GATES'
created_date: '2026-11-20T13:04:00Z'
updated_date: '2026-11-20T13:13:00Z'
labels: []
milestone: m-1
dependencies: []
type: build
ordinal: 67012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator 2026-11-20 (verbatim): "Add the tasks to incr 1b - the infa freeze needs to be lifted again - what is the point of building a mess - wasted effort." Record: ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md, entry "Operator: compliance tooling tasks into 1·B". Scope now: from the task-365 coverage table and the grounded findings, one gate per rule that has no mechanical check and that 1·B code touches; candidates named by the orchestrator, UNVERIFIED until task-365 is grounded: (a) the Airtight purity and literal gates scan only scripts/lib/compute: route-side code that calls the engine core (src/lib/parcels/report-compute.ts) is scanned by none; (b) numbers written in mobile code (the 60 s wait) against EXTERNALIZED (Spec 132 core.8); (c) the Spec 90 section 5 never-do list has no check on mobile/; (d) the 8 McFrontend rules whose lock is OWED (Spec 136), those 1·B touches. Each gate: red first on a planted defect, both directions. Waits on: task-365 grounded; the operator confirms the gate list before the build.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The gate list is confirmed by the operator before any gate is built
- [ ] #2 Each gate is shown red on a planted defect and green on the clean tree
- [ ] #3 The handbook no-check lists shrink by the rules gated, by their generators
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
2026-11-20 operator, verbatim: "I also what you to test the new gates as part of the Task 367 - small test and show me it works and what is catches.  ie the review you are running now will catch items - try the file with the gates and see the result.  Only do this if it doesnt take too much time. I want to know they work especially on the key items". Stage 1 is therefore a small report-only proof of three gates on the real pushed files; blocking wiring waits for the operator to confirm the gate list (stage 2).

2026-11-20 taken on the board at lane launch (lane BL-GATES, worktree /Users/brettpreston_macmini/Buildo-wt-gates, branch wf1/inc1b-gates), RR-0240
<!-- SECTION:NOTES:END -->
