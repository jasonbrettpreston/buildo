---
id: TASK-339
title: >-
  R13 Increment 1·B blockers: the C.12 placeholder-address ruling entered, and
  each dependency that holds a 1·B task raised as an OPERATOR task with a
  verified issue and recommendation
status: RUNNING
assignee:
  - '@lane-BL-R13'
created_date: '2026-11-19T20:07:00Z'
updated_date: '2026-11-19T20:07:00Z'
labels:
  - follow-up
milestone: m-1
dependencies: []
references:
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L1155
type: record
ordinal: 39012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator 2026-11-19, verbatim: "Those dependencies are not listed as operator tasks with incra 1b. C12 - is a fake email address until launch. Plese correct but also provide a breif explanation of each - the recommendation - whether but the issue and the recommendation is verified as per MCDecision/McLane" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1155; RR-0299, RR-0300). Record-only. Grounded (board read 2026-11-19): task-321 SRCH.C12 depends on task-15 (LS.6 support inbox address); task-320 SRCH.A6 depends on task-71 (LS.1 MF-47 checkout: Stripe price ids, DB job 322); task-266 LOAD.1 depends on task-123 (1.3 W, m-3), which depends on task-122 (6c.8a, m-8) and through it task-121 (6c.5a, m-8); task-267 LOAD.2 and task-317 LOAD.4 follow task-266; task-68 PROOF.TOOL depends on task-67 CHK.6, whose notes say the report-design-elements file has no producing task; task-268 PROOF.S depends on 69, 267, 68. None of these is an OPERATOR task in m-1. Recommendation: UNVERIFIED until this task review round.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 RR-0299 entered as a Backlog decision through G2 naming task-321 and task-15; task-321 no longer depends on task-15 and carries a Scope now line (placeholder address until launch)
- [ ] #2 RR-0300 and RR-0298 entered as Backlog decisions through G2
- [ ] #3 Each remaining blocker (A.6 and MF-47; the LOAD chain and the 6c tasks 121 and 122; PROOF.TOOL and CHK.6) is an OPERATOR task in m-1 with Grounded: and Recommendation: lines, each stating verified (the review round) or UNVERIFIED and why
- [ ] #4 Every held 1·B task (320, 266, 267, 317, 68, 268) carries a dated note naming the OPERATOR task it waits on
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
2026-11-19 taken on the board at lane launch (lane BL-R13, worktree /Users/brettpreston_macmini/Buildo-wt-r13, branch wf2/inc1b-r13), RR-0240
<!-- SECTION:NOTES:END -->
