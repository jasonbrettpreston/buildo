---
id: TASK-296
title: AL.4 + ; a streamed pass or a sample, findings only (A-MB76)
status: OPERATOR
assignee:
  - '@lane'
created_date: '2026-11-19T04:57:00Z'
updated_date: '2026-11-19T13:07:00Z'
due_date: '2026-11-26'
labels:
  - AL
  - plan:AL.4
  - plan:MB-76
  - held-unruled
  - queue-row
  - comp:PAN
  - comp:FIVE
  - comp:SC
  - comp:STAT
  - comp:BLD
  - comp:HS
  - comp:BYL
milestone: m-14
dependencies:
  - TASK-258
  - TASK-259
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#AL/MB-76
  - .cursor/MCBYLAWS-QUEUE.md#L369 sha256=fcdcd9ed2579 ROW:MB-76
  - >-
    ~/Buildo-scratch/queues-20261113/MB-REVIEW-20261117.md#L119
    sha256=bbf2e45cc007
  - >-
    ~/Buildo-scratch/queues-20261113/MB-REVIEW-20261117.md#L121
    sha256=9aac4ba52441
  - >-
    ~/Buildo-scratch/queues-20261113/MB-REVIEW-20261117.md#L118
    sha256=bddc571f77eb
documentation:
  - backlog/docs/increments/doc-15 - Increment-AL-requirements.md
priority: low
type: build
project: McBylaws
ordinal: 15004
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: GUESS unscheduled; not on the launch path

Plan text at the snapshot: HELD to freeze lift
planNote: L: estimate GUESS unscheduled; not on the launch path (PLAN-PROTOCOL 5.5)
planNote: L: status HELD to freeze lift (optimize-L final status)
planNote: storage-policy: title + ; a streamed pass or a sample, findings only (A-MB76) (no stored all-lot table)
who (plan text): lane
queue row: MB-76 (row status WAITS · since 2026-11-12 · expires when MB-38 is done · next: Hold until MB-38 (waits: MB-38 headline records)); the row stays the record (Spec 137 rule 2) and the lane edits the row and this task in the same commit (rule 3)

Grounded: yes. Row MB-76 (.cursor/MCBYLAWS-QUEUE.md:174) reads WAITS MB-31 first run; the plan task's row text reads 'expires when MB-38 is done ... Hold until MB-38 (waits: MB-38 headline records)'; the review keeps it held and says the overlap with MF-80 (McTest L3b lot sweep) is unproven (~/Buildo-scratch/queues-20261113/MB-REVIEW-20261117.md:119 "Do not merge into MF-80 yet: all four seats say overlap is unproven"). Plan text 'HELD to freeze lift' (task-296). No operator word on file for the freeze lift. Operator scope (RR-0233, plan-gen/rulings-register.json cite MORNING-DECISIONS.md:925): "front-end, design of the app, how much storage, timeframes, priorities". The word owed is a priority and timeframe call (when the freeze lifts for this item).
Recommendation: hold until MB-38 headline records are done, then compare the MF-80 L3b scope first and merge only if it covers all lots (MB-REVIEW-20261117.md:119); no freeze lift needed for it now. UNVERIFIED: review r1 of task-306 (r1-plan.txt) tested the routing of this item, not the answer.
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
2026-11-19 (BL-R7b): stays WAITS; operator word owed: the freeze-lift word for this item (plan text 'HELD to freeze lift' / 'HELD under the infra freeze'; no operator words found).
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: plan-to-backlog
created: 2026-11-19T04:58:00Z

---

The plan text reads "HELD to freeze lift"; no ruling is on file, so none is invented. Open question for the operator.

---
<!-- COMMENTS:END -->
