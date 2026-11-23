---
id: TASK-323
title: >-
  Semi page placeholder in 1B: what 1B builds of the semi question page
  (SRCH.SEMI scope split)
status: DONE
assignee: []
created_date: '2026-11-19T14:56:00Z'
updated_date: '2026-11-23T16:06:00Z'
labels:
  - S
  - gap
  - plan:SRCH.SEMI
  - operator
  - McFixReborn
milestone: m-1
dependencies: []
references:
  - backlog/docs/increments/doc-2 - Increment-S-requirements.md
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L796
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L801
  - .cursor/MCBYLAWS-QUEUE.md#L94
  - .cursor/MCFRONTEND-QUEUE.md#L597
  - .cursor/MCFRONTEND-QUEUE.md#L649
priority: medium
type: decision
project: McIncrement
ordinal: 25012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Grounded: the semi question page is on the search flow, so the placeholder exists as task-319 SRCH.SEMI (promoted from draft-4 by lane BL-R10): RR-0182 "Maybe the search portion done now with the page." (MORNING-DECISIONS.md:796; the semi question page is done now with the wiring (link) to the report, the semi calculation stays in 7.25); RR-0184 "also need a semi question page similar to a min page" (:801; a v8 mock for approval, then built); doc-2 Elements D.1-D.7 are BUILT on mobile, D.9 and D.10 are NOT-BUILT with deliverer SRCH.SEMI. The sources then place the owner-input store (the wall distance and the semi/detached answer) in three homes: (1) task-319 parts (2) and (3), 'moved from increment 7' (sequence.json S/SRCH.SEMI); (2) task-213 GAP.12 in m-9, 'placed at increment 7 as MB-103 says'; (3) .cursor/MCBYLAWS-QUEUE.md:94 row 6c, 'the store and entry for ... the semi wall distance (INC-7 B1) and the semi/detached answer (INC-7 B2)', operator verbatim there "5, yes they are - can you add to increment?", and .cursor/MCFRONTEND-QUEUE.md:649 MF-89 'a ship precondition of increment 7' (ruling "W-2 y"). RR-0182 names the search portion, the page and the link; it does not name the input or its storage. No ex_wall_distance_m column exists today (SRCH.SEMI status text). Recommendation (UNVERIFIED: the r1 review covered the plan row, not this question): 1·B builds the Daylight mock for approval (RR-0184), the question page wiring and the report link; the D.9 input and the D.8 answer store stay with MF-89, row 6c and GAP.12 as the operator ruled; task-319 parts (2) and (3) are rescoped to that; 7.25 (task-209) now depends on task-319. The operator chooses: (a) page, mock and link only (recommended); (b) also the input and the store in 1·B (moves row 6c work and a database field forward).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Operator answer recorded verbatim through scripts/analysis/backlog-decision.mjs with its cite
- [x] #2 task-319 scope and task-213 text updated to the answer (dated note, prior text kept)
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
2026-11-19 1·B validation (R10, RR-0257, task-316): created by R10: the semi placeholder scope question (OPERATOR), Grounded and Recommendation in the description.

Dated note 2026-11-19 (M-246, prior text kept; RR-0264 · task-323 · Backlog; operator, verbatim: "1 y")
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Operator answer "1 y" (MORNING-DECISIONS.md:1041, RR-0264) entered through G2 as decision-76, naming task-323, task-319 and task-209; dated note on each; task-319 carries the line "Scope now: page, mock and link only in 1·B (RR-0264); the owner-input store stays at its later increment home (GAP.12 task-213)". task-213 text unchanged: the ruling leaves the store at its later home. Closed by lane BL-R11 (task-326).
<!-- SECTION:FINAL_SUMMARY:END -->
