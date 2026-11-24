---
id: TASK-14
title: >-
  LS.11 Search: MF-60 intersection searches stays LATER (waits MF-53; not on the
  launch...
status: LATER
assignee:
  - '@lane'
created_date: '2026-11-19T04:57:00Z'
updated_date: '2026-11-24T16:39:00Z'
due_date: '2026-11-26'
labels:
  - S
  - plan:LS.11
  - evidence:ready
  - unverified
  - dep-dropped
milestone: m-14
dependencies: []
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#S/LS.11
  - .cursor/MCFRONTEND-QUEUE.md#L451 sha256=f0be2ce2aa5f
  - >-
    ~/Buildo-scratch/lanes-20261117/gap-register/REGISTER.md#L52
    sha256=6a5f08cbdb73
  - >-
    ~/Buildo-scratch/lanes-20261117/inc-plan/1-2/BUILD-PASS.md#L1
    sha256=f820d870862f
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/inc-briefs/BRIEFS.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/search-delta/CURRENT-SEARCH.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/holistic-audit/AUDIT.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/readiness/READINESS.md
  - .cursor/MCFRONTEND-QUEUE.md#L453
  - .cursor/MCFRONTEND-QUEUE.md#L310
  - .cursor/MCFRONTEND-QUEUE.md#L394
documentation:
  - backlog/docs/increments/doc-2 - Increment-S-requirements.md
priority: low
type: build
project: McIncrement
ordinal: 2008
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: LS.11 Search: MF-60 intersection searches stays LATER (waits MF-53; not on the launch list); house-number ranges and place names (S03, S14) deferred after launch per the register; W5 on the web (S07) pending gap Q2 (Q-GAP-5 withdrawn: the web follows the designed choose-lot pages, MORNING-DECISIONS.md:682); also the recent-search chips on web and phone (E.6, Q-GAP-8 ruled MORNING-DECISIONS.md:682); closes E.4 and search 4.03 only after it

snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: GUESS 2 days for MF-60

Plan text at the snapshot: DEFERRED: W5 on the web (ONE-35 b) and the web recent-search chips E.6 (RR-0180)
landingPush: launch (see PUSHES.md)
slicePart: (8) search
planNote: integrate: status queue heading LATER, queue status WAITS (LS-F: origin:.cursor/MCFRONTEND-QUEUE.md:452 "Status: WAITS")
planNote: gaps: title + the ruling Q-GAP-5 (web keeps the inline address list and an honest message, or gets a web map); closes E.4 and search 4.03 only after it (E.4 needs a ruling, not a new task)
planNote: gaps-r1: status web follows the designed choose-lot pages and the three choose-lot states (intersection, no lot linked, many lots); recent-search chips on web and phone (Q-GAP-5 withdrawn, Q-GAP-8)
planNote: review-fix: title Search: MF-60 intersection searches stays LATER (waits MF-53; not on the launch list); house-number ranges and place names (S03, S14) deferred after launch per the register; W5 on the web (S07) pending gap Q2 (Q-GAP-5 withdrawn: the web follows the designed choose-lot pages, MORNING-DECISIONS.md:682); also the recent-search chips on web and phone (E.6, Q-GAP-8 ruled MORNING-DECISIONS.md:682); closes E.4 and search 4.03 only after it (findings S-3: chips task)
planNote: order: moved from 1-2 to S (operator 2026-11-18: search pages before increment 1)
planNote: answers-738: status RULED ONE-35 b: W5 on the web deferred, web live switch stays off; MF-53 is DONE on origin (since 2026-11-12), so that wait is closed; web recent chips (E.6, Q-GAP-8) to be re-homed (ONE-35 b (operator answer page, MORNING-DECISIONS.md:738))
planNote: search-r3: status DEFERRED: W5 on the web (ONE-35 b) and the web recent-search chips E.6 (RR-0180) (MORNING-DECISIONS.md:789 (operator 2026-11-18) "3. This can stay defferred for now")
who (plan text): lane
element ids delivered: B.10, E.4, E.6
dependency not a plan task, dropped: MF-53
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Pre-register the expected moves, committed alone — "Pre-register the task's `rules[]` and expected moves" (.cursor/MCBYLAWS-QUEUE.md:109)
- [ ] #2 Failing tests are written into the plan and reviewed at plan altitude — "are written INTO the plan and reviewed at PLAN altitude" (docs/specs/00-architecture/08_agents.md:465)
- [ ] #3 `write_scope` declared in the brief — "The brief file opens with a front-matter block" (docs/specs/00-architecture/08_agents.md:144)
- [ ] #4 PLAN panel run with the lens set, never one generic pass — "NEVER run one generic pass" (docs/specs/00-architecture/08_agents.md:334)
- [ ] #5 Fold validated by a grounder that re-executes every claim — "one grounder re-executes every claim in the fold" (docs/specs/00-architecture/08_agents.md:458)
- [ ] #6 Built red first, then green, on the tip — "Red tests first, then the code, through the real hooks." (docs/specs/00-architecture/08_agents.md:490)
- [ ] #7 OUTPUT panel record committed with the work — "is committed with the work (R-KM)." (.cursor/MCBYLAWS-QUEUE.md:116)
- [ ] #8 McFrontend build only: queue row first — "No McFrontend work starts without its row in" (docs/specs/02-web-admin/126_maxbld_surface_standard.md:72)
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
2026-11-19 1·B validation (R10, RR-0257, task-316): KEPT (LATER, deps none): MF-53 is DONE (queue :394) so the wait named on MF-60 is closed (queue :453 'MF-53 now landed'); the reference #L451 was the MF-60 row before later edits, the row is at #L453 (added). Deferred by operator words: W5 on the web RR-0170 'ONE-35 b', recent-search chips E.6 RR-0180 '3. This can stay defferred for now'. Elements B.10 (marked REMOVED by the design) E.4 E.6. No panel ran on this task (readiness: panel, build pass, open item); owed when it is un-deferred.

Operator 2026-11-20, verbatim: "Task 370 yes . approved" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1427; the table put to him is quoted in that entry). When built: rows of the page table (McFix G form), not builder code.

2026-11-24 RR-0454 (MORNING-DECISIONS.md:2352): operator, verbatim: "2 yes". Moved from the search increment to after launch.
<!-- SECTION:NOTES:END -->
