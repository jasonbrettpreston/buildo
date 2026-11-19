---
id: TASK-266
title: >-
  LOAD.1 Start the one-lot report calculation the moment the user picks an
  address on...
status: LATER
assignee:
  - '@lane'
created_date: '2026-11-19T04:57:00Z'
updated_date: '2026-11-19T21:13:00Z'
due_date: '2026-11-26'
labels:
  - S
  - plan:LOAD.1
  - unverified
milestone: m-1
dependencies:
  - TASK-123
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#S/LOAD.1
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md sha256=0f3d8ba74a49
  - >-
    ~/Buildo-scratch/lanes-20261117/storage-ondemand/REPORT.md#L8
    sha256=b253e641293a
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/inc-briefs/BRIEFS.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/search-delta/CURRENT-SEARCH.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/holistic-audit/AUDIT.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/readiness/READINESS.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/storage-policy/McSTORAGE-POLICY-v2.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/storage-policy/REVIEW.md
documentation:
  - backlog/docs/increments/doc-2 - Increment-S-requirements.md
priority: low
type: build
project: McIncrement
ordinal: 2002
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: LOAD.1 Start the one-lot report calculation the moment the user picks an address on the search page (lookup hit), so the loading screen covers it + ; the compute is the producer ST.P1 (stores the record); a lot with a current record is read, not recomputed

snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: UNMEASURED

Plan text at the snapshot: PLANNED (panel review owed)
slicePart: public route
planNote: storage-policy: title + ; the compute is the producer ST.P1 (stores the record); a lot with a current record is read, not recomputed (the compute is now a store-on-first-open)
planNote: storage-policy: dependsOn 1.3,ST.P1 (needs the producer)
who (plan text): lane
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
2026-11-19 1·B validation (R10, RR-0257, task-316): KEPT (deps task-123 1.3 m-3, task-265 ST.P1 m-13): plan storage-policy dependsOn 1.3,ST.P1; RR-0178 builds W now. Chain: 123 -> 122 (6c.8a) -> 62 (push 6); 265 -> 259 (L.6), 82 (5.11). task-265 lands at push 12 (its landingPush), so 1·B completes only then unless ST.P1 is built earlier: raised as OPERATOR task-325 (timeframe), dependency not changed. Page element: supporting function of G.2 processing screen. Panel and build pass owed.

Dated note 2026-11-19 (M-246, prior text kept; RR-0271 · task-266 · Backlog; operator, verbatim: "2. y")

2026-11-19 R12 (task-327, RR-0271, decision-79; operator, verbatim: "2. y", MORNING-DECISIONS.md:1061; prior text kept): scope of LOAD.1 after the ST.P1 split (task-325 Option A, verified by review r1 of task-326): LOAD.1 carries the compute half for the app search page: on the pick, the lookup route runs the one-lot pure core and feeds the page response; no write, no read first; numbers show only inside the tester and admin gate until MB-38 shadow passes (.cursor/MCBYLAWS-QUEUE.md:785). Dependencies now: task-123 only (task-265 dropped). U1 (who owns the rows-to-page-response adapter), U2 (inline one-lot compute against the route time limit) and U3 (MB-94 part f, the tester gate, has not landed, .cursor/MCBYLAWS-QUEUE.md:685) stay UNVERIFIED, carried from R11 (docs/reports/lanes/2026-11-19/BL-R11/REPORT.md section 3).

Dated note 2026-11-19 (M-246, prior text kept; RR-0300 · task-266 · Backlog; operator, verbatim: "Those dependencies are not listed as operator tasks with incra 1b")

2026-11-19 (R13, RR-0300, task-339): this task waits on the OPERATOR task task-341 (the LOAD chain and the two 6c tasks); recommendation there, verified by review r1 of task-339. Status and dependencies unchanged.

Dated note 2026-11-19 (M-246, prior text kept; RR-0301 · task-266 · Backlog; operator, verbatim: "task 341 approved")

2026-11-19 (R16, task-347, RR-0300): OPERATOR task-348 (D1) decides who sees real numbers before launch; LOAD.1's compute must sit behind the same gate as W (the web live switch) or the tester gate, or numbers computed here would show at the flip before MB-38. D2 is ruled: a lot with no current stored result is a miss in W and LOAD.1 computes at the pick (MORNING-DECISIONS.md:704-705, :1057, :1061). Status and dependencies unchanged.
<!-- SECTION:NOTES:END -->
