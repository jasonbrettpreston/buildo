---
id: TASK-273
title: >-
  L.5a Rehearse the MB-38 record table, the producer ST.P1 and the stamp check
  ST.P2 on...
status: LATER
assignee:
  - '@lane'
created_date: '2026-11-19T04:57:00Z'
due_date: '2026-11-26'
labels:
  - L
  - plan:L.5a
  - evidence:planned
  - unverified
  - comp:PAN
  - comp:FIVE
  - comp:SC
  - comp:STAT
  - comp:RH
  - comp:GO
  - comp:ID
  - comp:STO
  - comp:AV3
  - comp:HS
  - comp:MCP
  - comp:DDV
  - comp:FIT
  - comp:BYL
milestone: m-13
dependencies:
  - TASK-258
  - TASK-259
  - TASK-272
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#L/L.5a
  - docs/specs/00-architecture/08_agents.md#L495 sha256=1732e7f9b5ca
  - .cursor/MCBYLAWS-QUEUE.md#L735 sha256=0c89f51926ba
  - >-
    ~/Buildo-scratch/lanes-20261117/inc-plan/L/BUILD-PASS.md#L1
    sha256=ce9c81f4a49b
documentation:
  - backlog/docs/increments/doc-14 - Increment-L-requirements.md
priority: low
type: build
project: McIncrement
ordinal: 14012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: L.5a Rehearse the MB-38 record table, the producer ST.P1 and the stamp check ST.P2 on the test stack (no all-lot fill): a measured test write of 500 records sized against the final ST-3 line (A-ST3), shadow gates unexplained = 0 and layer3_defect = 0 on the 20,000-lot sample, switch-back flag tested; MB-38 persists the headline record per parcel and option (a Layer 3 write), so it is a DB job (MCINC-7) + also time: cost at open, a stored-record read (the 1 s budget), and an owner-input recompute (no budget: operator 2026-11-18)

snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: GUESS 1 day runner; the figure the rehearsal measures replaces the 54 to 66 day ESTIMATE

Plan text at the snapshot: (table and classifier built; no fill script exists)
landingPush: rehearsal before push 12; not a push
slicePart: (2) stored as ruled (headline)
planNote: storage-policy: title Rehearse the MB-38 record table, the producer ST.P1 and the stamp check ST.P2 on the test stack (no all-lot fill): a measured test write of 500 records sized against the final ST-3 line (A-ST3) (fill rehearsal dropped; shadow gates, switch-back flag and ST-3 measured write stay)
planNote: storage-policy: dependsOn L.5,L.6,10.6,ST.P2 (rehearse the producer and the stamp guard red first)
planNote: storage-policy-r1: title + also time: cost at open, a stored-record read (the 1 s budget), and an owner-input recompute (no budget: operator 2026-11-18) (operator answers 2a, 3)
planNote: holistic: status (table and classifier built; no fill script exists) (no all-lot fill exists after the storage ruling)
planNote: holistic-r1: dependsOn L.5,L.6,ST.P2 (rehearse against the provisional 1,650 MiB line; L.5a still measures the 500-record write and keeps its ST-3 storage-sizing stop; the final ST-3 line (10.6, after the MB-111 write) is re-checked afterwards (guard: the M14 rehearsal stopped on ST-3 storage, so the sizing gate is not dropped) | approved: operator answers 2026-11-18 on the answer page (MORNING-DECISIONS.md, "Operator answers saved on the answer page": Q-H1 a, Q-H2 a, Q-H3 a, Q-H4 a, Q-H5 a, S1 a, S2 a))
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
