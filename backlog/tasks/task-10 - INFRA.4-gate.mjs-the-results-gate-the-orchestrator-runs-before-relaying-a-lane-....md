---
id: TASK-10
title: >-
  INFRA.4 gate.mjs: the results gate the orchestrator runs before relaying a
  lane:...
status: MERGED
assignee:
  - '@lane'
created_date: '2026-11-19T04:57:00Z'
updated_date: '2026-11-24T14:42:00Z'
labels:
  - F
  - plan:INFRA.4
  - dead
milestone: m-0
dependencies:
  - TASK-8
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#F/INFRA.4
  - ~/Buildo-scratch/lanes-20261117/rda-d7/REPORT.md#L22 sha256=6d55bff32131
documentation:
  - backlog/docs/increments/doc-1 - Increment-F-requirements.md
priority: low
type: build
project: McIncrement
ordinal: 1013
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: INFRA.4 gate.mjs: the results gate the orchestrator runs before relaying a lane: declared outputs exist; declared PASS lines re-run (check.mjs, check-quotes, check-cites) and match; nothing outside the lane write scope changed since the start snapshot (changes by another registered lane attributed, others fail); any installed/copied step whose evidence says UNVERIFIED is flagged

merged-into: task-3
snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: GUESS 0.5 day

Plan text at the snapshot: MERGE proposed into CHK.1 (it passed a lane that skipped its panel); in the Increment 1·A panel
landingPush: none (scratch tooling; no push)
planNote: buildpass-tools: status BUILT; build pass found high findings GT-1, GT-3, GT-4 (buildpass-tools/FIXES.json); fix lane owed (fresh build pass 2026-11-18)
planNote: reuse: status MERGE proposed into CHK.1 (it passed a lane that skipped its panel); in the Increment 1·A panel ((operator 2026-11-18, MORNING-DECISIONS.md:744 "Add to the named list.." and :750 "yes to re-use obviosouly, yes drop"; shape decided by the Increment 1·A panel, lanes-20261117/inc1a-review/p1))
who (plan text): LANE-TOOLS lane (scratch tooling only, ~/Buildo-scratch/panel-tools/; no repo change, no DB)
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
2026-11-19 relevancy pass (R7, RR-0214): KEPT as MERGED (already merged into CHK.1, task-3; .cursor/active_task.md planNote lists INFRA.4 as not replaced by BL.0).
<!-- SECTION:NOTES:END -->
