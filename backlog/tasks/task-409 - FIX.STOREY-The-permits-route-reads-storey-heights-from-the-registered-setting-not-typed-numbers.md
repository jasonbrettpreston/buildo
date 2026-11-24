---
id: TASK-409
title: >-
  FIX.STOREY The permits route reads storey heights from the registered setting,
  not typed numbers
status: LATER
assignee: []
created_date: '2026-11-20T17:50:00Z'
updated_date: '2026-11-24T18:41:00Z'
labels:
  - dead
dependencies: []
type: build
ordinal: 109012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the separate grounder of task-396 (2026-11-20), 8 CONFLICT findings, one question. Facts (verify before building): src/lib/massing/geometry.ts:14 STORY_HEIGHT_M = 3.0 and :17 STORY_HEIGHT_BY_USE_TYPE (residential 2.9, commercial 4.0, industrial 4.5, mixed-use 3.5) are typed; read at run time by resolveStories (geometry.ts:185-196) from src/app/api/permits/[id]/route.ts:252. Rule: Spec 126 P4 'All tunables are data; zero thresholds in src/' (docs/specs/02-web-admin/126_maxbld_surface_standard.md:189). A registered setting massing_storey_height_m already feeds scripts/lib/compute/load-massing.js:83, so the same quantity is a setting in the pipeline and a typed number in the route. No milestone set: this is permits code older than Increment 1·B; which increment owns it, and whether the per-use heights are tunables or definitions, is not ruled: ORCHESTRATOR NOTE, not a ruling: to be resolved by a grounder against the rules before launch. Files: src/lib/massing/geometry.ts, src/app/api/permits/[id]/route.ts, src/tests/massing.logic.test.ts
<!-- SECTION:DESCRIPTION:END -->

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
2026-11-20 operator ruling (M-246, prior text kept), ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1610, verbatim: "approved", to the list he pasted back; the item for this task as put to him: "Task 409, storey heights, is in Increment 1·B. Recommended yes.". The decision record tool holds one record per quote and cite (decision-126, RR-0341, carries the same approval), so this note is the record on this task. No status is moved by hand.
<!-- SECTION:NOTES:END -->
