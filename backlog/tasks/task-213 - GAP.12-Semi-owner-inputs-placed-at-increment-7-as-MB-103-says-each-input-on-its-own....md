---
id: TASK-213
title: >-
  GAP.12 Semi owner inputs, placed at increment 7 as MB-103 says (each input on
  its own...
status: LATER
assignee:
  - '@lane'
created_date: '2026-11-19T04:57:00Z'
due_date: '2026-11-26'
labels:
  - '7'
  - plan:GAP.12
  - evidence:planned
  - unverified
milestone: m-9
dependencies:
  - TASK-97
  - TASK-98
  - TASK-209
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#7/GAP.12
  - ~/Buildo-scratch/mcbylaws/inc-semi/BUILD-PLAN.md#L125 sha256=e7085c22befd
  - ~/Buildo-scratch/lanes-20261117/inc-plan/gaps/MBQ.md#L89 sha256=231be0ea41ef
documentation:
  - backlog/docs/increments/doc-10 - Increment-7-requirements.md
priority: medium
type: build
project: McIncrement
ordinal: 10030
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: GAP.12 Semi owner inputs, placed at increment 7 as MB-103 says (each input on its own increment): store the owner's lot-form answer so a reopened lot does not ask again, and the distance from the wall to the shared line (ex_wall_distance_m: schema field, unit, bounds, assumed default 0), in the app owner-entry store (the pipeline never reads or stores lot_form_user_override, O-12); the page input and override control stay MF-89; MB-103 / APP-RENO own the key list and are cited, not redone

snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: GUESS 0.5 day plus one DB job window

Plan text at the snapshot: PLANNED
landingPush: push 8 (inc 7) with 7.25; one DB job only if a column is needed (rehearse, operator GO, id by mkdir)
slicePart: (3) binding (owner entry)
who (plan text): lane (owner-entry schema; DB job rehearsed, operator GO)
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
