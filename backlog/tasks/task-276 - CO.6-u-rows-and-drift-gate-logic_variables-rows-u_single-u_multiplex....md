---
id: TASK-276
title: 'CO.6 u rows and drift gate: logic_variables rows u_single, u_multiplex,...'
status: WAITS
assignee:
  - '@lane'
created_date: '2026-11-19T04:57:00Z'
due_date: '2026-11-26'
labels:
  - L
  - plan:CO.6
  - evidence:planned
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
  - comp:BYL
  - comp:RDG
  - comp:BLD
  - comp:MCP
  - comp:DDV
  - comp:FIT
milestone: m-13
dependencies:
  - TASK-262
  - TASK-188
  - TASK-274
  - TASK-272
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#L/CO.6
  - >-
    docs/specs/01-pipeline/78_optimal_lot_configuration.md#L527
    sha256=30bff42e59d3
  - >-
    docs/specs/01-pipeline/78_optimal_lot_configuration.md#L1189
    sha256=59a36f233a6d
  - >-
    docs/specs/01-pipeline/78_optimal_lot_configuration.md#L521
    sha256=3cf8456cefc4
  - >-
    ~/Buildo-scratch/lanes-20261117/inc-plan/coa/BUILD-PASS.md#L1
    sha256=d135bbb42913
documentation:
  - backlog/docs/increments/doc-14 - Increment-L-requirements.md
priority: low
type: build
project: McIncrement
ordinal: 14015
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: CO.6 u rows and drift gate: logic_variables rows u_single, u_multiplex, u_single_suite, u_suite (names proposed, confirmed at Q-COAN) with the bound Q-UBOUND sets, settings migration, drift gate (FAIL when a variable differs from its audit or the audit AOR(s) version is stale), values reach users through the settings sha: the settings migration moves it and stored records recompute on next open (no all-lot rerun); a bounded-cohort rerun is kept only if the proof set needs it (UNVERIFIED, checked at the build pass); coa_factor.fit_basis feeds the CoA confidence pill; u_suite has its own cohort (not the M-70 principal-form arm)

snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: GUESS 1 day build; the all-lot DB job is dropped

Plan text at the snapshot: WAITING CO.5, Q-UBOUND
landingPush: the push that carries L.6 (GUESS push 12); rerun after it
slicePart: SLICE (7); SUPPORT S4
planNote: integrate: dependsOn ["CO.5","CO.2","L.5b"] (Spec 137 rule 9: the CO.6 Layer 3 rerun is a DB job; serial after the MB-38 fill. See finding F-RERUN (one recapture): ruling Q-CORERUN folds it into the fill)
planNote: storage-policy: dependsOn CO.5,CO.2,ST.P2 (u is read at request time and a u change moves the settings sha, so stored records recompute on open: no all-lot rerun to wait for)
planNote: storage-policy: title values reach users through the settings sha: the settings migration moves it and stored records recompute on next open (no all-lot rerun); a bounded-cohort rerun is kept only if the proof set needs it (UNVERIFIED, checked at the build pass) (no refill after a stamp move)
planNote: storage-policy: hours GUESS 1 day build; the all-lot DB job is dropped (no all-lot rerun)
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
