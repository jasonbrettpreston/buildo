---
id: TASK-339
title: >-
  R13 Increment 1·B blockers: the C.12 placeholder-address ruling entered, and
  each dependency that holds a 1·B task raised as an OPERATOR task with a
  verified issue and recommendation
status: BUILT
assignee:
  - '@lane-BL-R13'
created_date: '2026-11-19T20:07:00Z'
updated_date: '2026-11-24T18:41:00Z'
labels:
  - dead
milestone: m-1
dependencies: []
references:
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L1155
  - docs/reports/lanes/2026-11-19/BL-R13/REPORT.md
  - docs/reports/reviews/task-339/context-2026-11-19.md
type: record
ordinal: 39012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator 2026-11-19, verbatim: "Those dependencies are not listed as operator tasks with incra 1b. C12 - is a fake email address until launch. Plese correct but also provide a breif explanation of each - the recommendation - whether but the issue and the recommendation is verified as per MCDecision/McLane" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1155; RR-0299, RR-0300). Record-only. Grounded (board read 2026-11-19): task-321 SRCH.C12 depends on task-15 (LS.6 support inbox address); task-320 SRCH.A6 depends on task-71 (LS.1 MF-47 checkout: Stripe price ids, DB job 322); task-266 LOAD.1 depends on task-123 (1.3 W, m-3), which depends on task-122 (6c.8a, m-8) and through it task-121 (6c.5a, m-8); task-267 LOAD.2 and task-317 LOAD.4 follow task-266; task-68 PROOF.TOOL depends on task-67 CHK.6, whose notes say the report-design-elements file has no producing task; task-268 PROOF.S depends on 69, 267, 68. None of these is an OPERATOR task in m-1. Recommendation: UNVERIFIED until this task review round.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 RR-0299 entered as a Backlog decision through G2 naming task-321 and task-15; task-321 no longer depends on task-15 and carries a Scope now line (placeholder address until launch)
- [x] #2 RR-0300 and RR-0298 entered as Backlog decisions through G2
- [x] #3 Each remaining blocker (A.6 and MF-47; the LOAD chain and the 6c tasks 121 and 122; PROOF.TOOL and CHK.6) is an OPERATOR task in m-1 with Grounded: and Recommendation: lines, each stating verified (the review round) or UNVERIFIED and why
- [x] #4 Every held 1·B task (320, 266, 267, 317, 68, 268) carries a dated note naming the OPERATOR task it waits on
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
1. RR-0299, RR-0300, RR-0298 through backlog-decision.mjs (decisions 85-87), then task-321: clear the dependency on task-15, append the Scope now line (AC 1, 2).
2. Ground the three blockers (A.6/MF-47, LOAD chain 121/122/123, PROOF.TOOL/CHK.6) with file:line; write the candidate recommendations into the review context file; one review round r1; TRIAGE.md; fold KEPT.
3. Create three OPERATOR tasks in m-1 (type decision) with the plain explanation, Grounded and Recommendation (verified by review r1 or UNVERIFIED) (AC 3).
4. Dated note on tasks 320, 266, 267, 317, 68, 268 naming the OPERATOR task each waits on (AC 4).
5. backlog doctor, one docs commit with trailer Task: task-339, reports into docs/reports/lanes/2026-11-19/BL-R13/, close task-339 BUILT.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-19 taken on the board at lane launch (lane BL-R13, worktree /Users/brettpreston_macmini/Buildo-wt-r13, branch wf2/inc1b-r13), RR-0240

Dated note 2026-11-19 (M-246, prior text kept; RR-0300 · task-339 · Backlog; operator, verbatim: "Those dependencies are not listed as operator tasks with incra 1b")

Dated note 2026-11-19 (M-246, prior text kept; RR-0298 · task-339 · Backlog; operator, verbatim: "you need to run the launch script - do not change the status manually")
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
RR-0299/0300/0298 entered (decisions 85-87); task-321 dependency on task-15 cleared with the Scope now note (status LATER unchanged); OPERATOR tasks 340 (A.6), 341 (LOAD chain), 342 (PROOF.TOOL) in m-1 with Grounded and Recommendation (verified by review r1 of task-339, UNVERIFIED items stated); dated notes on 320, 266, 267, 317, 68, 268. Docs commit carries Task: task-339; sha in docs/reports/lanes/2026-11-19/BL-R13/REPORT.md hand-back. backlog doctor clean.
<!-- SECTION:FINAL_SUMMARY:END -->
