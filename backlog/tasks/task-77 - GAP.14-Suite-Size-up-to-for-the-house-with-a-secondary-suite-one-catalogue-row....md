---
id: TASK-77
title: >-
  GAP.14 Suite Size (up to) for the house with a secondary suite: one catalogue
  row...
status: LATER
assignee:
  - '@lane'
created_date: '2026-11-19T04:57:00Z'
due_date: '2026-11-26'
labels:
  - '4'
  - plan:GAP.14
  - unverified
milestone: m-5
dependencies:
  - TASK-62
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#4/GAP.14
  - >-
    ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L688
    sha256=52acdb6d63da
documentation:
  - backlog/docs/increments/doc-6 - Increment-4-requirements.md
priority: low
type: build
project: McIncrement
ordinal: 6004
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: GAP.14 Suite Size (up to) for the house with a secondary suite: one catalogue row suite_interior_sqm (+ host_interior_sqm) on house_with_secondary_suite = s x min(footprint_fit_m2 ; 45% x (gfa_flat_m2 + footprint_fit_m2)), s = the ruled interior share 0.85 (setting compute_maxbld_scenarios_suite_interior_gfa_share), 45 = Layer 2 target suite_interior_share_pct; basement of the fitted house, inside the walls, no stairs deduction (no source); formula as catalogue data (M-61); catalogue increment "6" (D-3 lock); status not_evaluated with a named reason when the fitted rows have no value or the class is not permitted; See details discloses the 45 percent limit, which of basement or limit sets the figure, the stricter main-unit-only figure (M-199) and the 150.10.40.40(2) whole-basement allowance; Estimate pill; derived at read (one headline field only if the storage-on-demand run keeps a headline store); red first on the 25 golden lots (McProof key) then the row; dated note on Spec 78 P5.10 + See details disclosure (operator 2026-11-18): "Basement suite, inside the walls. Toronto limits a secondary suite to 45% of the house's interior floor area: {X} m² on this lot."

snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: GUESS 1 day (catalogue row + display-text entry + McProof rows; no source figure; size at the build pass)

Plan text at the snapshot: PLANNED
landingPush: the catalogue push after inc-6 push 6 / Part B (migration 330); report side with 4.1 (push 7)
slicePart: (1) engine row + (3) page section and binding + (4) display text
planNote: suite-r1: title + See details disclosure (operator 2026-11-18): "Basement suite, inside the walls. Toronto limits a secondary suite to 45% of the house's interior floor area: {X} m² on this lot." (operator 1y 2y)
who (plan text): lane (catalogue row + answer key + registry text); amends nothing already DONE; Spec 78 P5.10 dated note
element ids delivered: SUITE
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
