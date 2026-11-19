---
id: TASK-208
title: >-
  R6-COST Renovation cost line: HELD pending a ruling. Rule today: a cost line
  is...
status: WAITS
assignee:
  - '@lane'
created_date: '2026-11-19T04:57:00Z'
due_date: '2026-11-26'
labels:
  - 6c
  - plan:R6-COST
  - evidence:planned
  - comp:PAN
  - comp:FIVE
  - comp:SC
  - comp:STAT
  - comp:AV3
  - comp:BYL
  - comp:RDG
  - comp:ID
  - comp:BLD
  - comp:HS
  - comp:STO
  - comp:DN
milestone: m-8
dependencies:
  - TASK-207
  - TASK-97
  - TASK-138
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#6c/R6-COST
  - .cursor/MCBYLAWS-QUEUE.md#L778 sha256=2ec7e6c19ebd
  - ~/Buildo-scratch/mcbylaws/inc6/BUILD-PLAN.md#L177 sha256=a0eb695eed00
  - >-
    ~/Buildo-scratch/lanes-20261117/inc-plan/6/BUILD-PASS.md#L1
    sha256=1f885a4c8126
documentation:
  - backlog/docs/increments/doc-9 - Increment-6c-requirements.md
priority: low
type: build
project: McIncrement
ordinal: 9043
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: R6-COST Renovation cost line: HELD pending a ruling. Rule today: a cost line is written only where stored Layer 3 rows exist (Spec 88:119) and renovation has none without owner entry (ST-4); + ; policy v2 P9 reading: the price is computed at open by ST.C1 from the stored owner rows and is not stored (option a shape); the choice among a, b, c stays with the operator (replan q-6c.md:16). Six ids named on MB-86

snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: [object Object]

Plan text at the snapshot: WAITING 6c.9 and ST.C1; ruled shape: cost at open from the stored owner rows, not stored (the choice among a, b, c is still the operator's: confirm at the sitting)
landingPush: with 1.3 (W): push 9 (8.33) if RES-R10/R11 are approved, else push 12 (L.11)
slicePart: (6) cost line
planNote: integrate: landingPush with 1.3 (W): push 9 (8.33) if RES-R10/R11 are approved, else push 12 (L.11) (R6-COST depends on 1.3, which is after J9 (8.28); the lane placement (push 7 or 8) precedes J9)
planNote: storage-policy: title + ; policy v2 P9 reading: the price is computed at open by ST.C1 from the stored owner rows and is not stored (option a shape); the choice among a, b, c stays with the operator (cost is computed for the opened lot)
planNote: holistic: status WAITING 6c.9 and ST.C1; ruled shape: cost at open from the stored owner rows, not stored (the choice among a, b, c is still the operator's: confirm at the sitting) (cost at open is ruled by the storage ruling and policy v2 P9; only the a/b/c shape stays open)
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
