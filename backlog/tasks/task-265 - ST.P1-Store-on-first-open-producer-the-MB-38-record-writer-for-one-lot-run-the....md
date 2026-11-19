---
id: TASK-265
title: >-
  ST.P1 Store-on-first-open producer (the MB-38 record writer): for one lot, run
  the...
status: LATER
assignee:
  - '@lane-R'
created_date: '2026-11-19T04:57:00Z'
due_date: '2026-11-26'
labels:
  - L
  - plan:ST.P1
  - unverified
  - missing-ref
milestone: m-13
dependencies:
  - TASK-259
  - TASK-82
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#L/ST.P1
documentation:
  - backlog/docs/increments/doc-14 - Increment-L-requirements.md
priority: low
type: build
project: McIncrement
ordinal: 14019
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: ST.P1 Store-on-first-open producer (the MB-38 record writer): for one lot, run the pure core for every option in scope (main page values and See details values, metric numbers and codes; the price is ST.C1), write ONE record per (parcel, option) (unique key (parcel, option); the stamp is a column and a recompute replaces the row; metric numbers and codes only, no price) with its stamp (Layer 2 table_version, evaluator_version, settings sha) to the record table; called at the search pick (LOAD.1), on track (LS.4) and on owner input (6c.6 stores the owner rows in the 309 form for that lot until this task lands, then is rewired here); red first: first open writes a record, second open reads it with no compute; the migration id is claimed in the ID ledger (~/Buildo-scratch/ids) at the build pass, not named here

snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: GUESS 2 days (no source figure; L.6 loses the fill script, about 0.5 day, to pay for part of it); proven on the test stack, run on dev only after L.5b, ships at push 12

Plan text at the snapshot: PLANNED
landingPush: push 12 with MB-38 (L.11)
slicePart: producer
who (plan text): lane (MB-38 build, McBylaws lane R / McFrontend producer MB-93)
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
