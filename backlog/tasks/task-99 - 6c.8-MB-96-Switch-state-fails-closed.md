---
id: TASK-99
title: 6c.8 MB-96 Switch state fails closed
status: LATER
assignee:
  - '@lane'
created_date: '2026-11-19T04:57:00Z'
due_date: '2026-11-24'
labels:
  - 6c
  - plan:6c.8
  - plan:MB-96
  - queue-row
  - comp:PAN
  - comp:FIVE
  - comp:SC
  - comp:STAT
  - comp:BLD
  - comp:HS
  - comp:BYL
  - comp:DN
milestone: m-8
dependencies:
  - TASK-62
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#6c/MB-96
  - .cursor/MCBYLAWS-QUEUE.md#L881 sha256=529d4072b151 ROW:MB-96
  - >-
    ~/Buildo-scratch/queues-20261113/MB-REVIEW-20261117.md#L125
    sha256=b278a4f3dbeb
  - ~/Buildo-scratch/lanes-20261117/NOW-A/REPORT.md#L34 sha256=f0bfa5964029
  - >-
    ~/Buildo-scratch/lanes-20261117/ground-audit/REPORT.md#L58
    sha256=4128f2dc319d
  - ~/Buildo-scratch/lanes-20261117/repanel/REPORT.md#L16 sha256=f64116c78893
documentation:
  - backlog/docs/increments/doc-9 - Increment-6c-requirements.md
priority: low
type: build
project: McBylaws
ordinal: 9008
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: UNMEASURED

Plan text at the snapshot: WAITING on 6.43 (the staged tree is not the ruled option; it is recut in the build pass)
planNote: 6: status WAITING on 6.43 (the staged tree is not the ruled option; it is recut in the build pass) (optimize-6c/decisions-6c-final.json 6c.8)
who (plan text): lane
queue row: MB-96 (row status LATER · since 2026-11-17 · expires 2026-11-24 · next: Build red-first; the wait (inc 5 C2b Layer 3 landing) is met, D-78 landed 2026-11-16); the row stays the record (Spec 137 rule 2) and the lane edits the row and this task in the same commit (rule 3)
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
