---
id: TASK-190
title: >-
  CO.S4 S4 garden suite: suite_coa_gfa_sqm, suite_coa_increment_sqm,
  suite_coa_status =...
status: WAITS
assignee:
  - '@lane'
created_date: '2026-11-19T04:57:00Z'
due_date: '2026-11-26'
labels:
  - '5'
  - plan:CO.S4
  - evidence:planned
  - comp:PAN
  - comp:FIVE
  - comp:SC
  - comp:STAT
  - comp:BLD
  - comp:HS
milestone: m-6
dependencies:
  - TASK-188
  - TASK-80
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#5/CO.S4
  - >-
    docs/specs/01-pipeline/131_lot_configuration_policy.md#L78
    sha256=701807d428f8
  - >-
    docs/specs/01-pipeline/78_optimal_lot_configuration.md#L1193
    sha256=068708f4ef6a
  - >-
    ~/Buildo-scratch/lanes-20261117/inc-plan/coa/BUILD-PASS.md#L1
    sha256=d135bbb42913
documentation:
  - backlog/docs/increments/doc-7 - Increment-5-requirements.md
priority: medium
type: build
project: McIncrement
ordinal: 7011
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: CO.S4 S4 garden suite: suite_coa_gfa_sqm, suite_coa_increment_sqm, suite_coa_status = not_evaluated:coa_factor_unfitted:suite on the garden-suite building types (Q-4, kept by Spec 131:78); not_applicable:no_suite where no suite; the main-building coa_* stay separate; key lines. Spec 78 lines 1229 and 1237 are not authority (stale against Q-4)

snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: GUESS 0.5 day

Plan text at the snapshot: WAITING CO.2, 5.10
landingPush: push 9a
slicePart: SLICE (7); SUPPORT S3
planNote: integrate: dependsOn ["CO.2","5.9"] (CO.S4 is a seed row (catalogue) in push 9a, which precedes J9; 5.10 (engine skip) commits with the J9 recapture in push 9 (5/PUSHES.md); the working-row state it needs is 5.9 (14 rows marked working:true, same 9a commit))
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
