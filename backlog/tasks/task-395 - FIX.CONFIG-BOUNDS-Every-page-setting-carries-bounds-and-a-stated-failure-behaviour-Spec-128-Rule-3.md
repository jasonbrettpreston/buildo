---
id: TASK-395
title: >-
  FIX.CONFIG-BOUNDS Every page setting carries bounds and a stated failure
  behaviour (Spec 128 Rule 3)
status: LATER
assignee: []
created_date: '2026-11-20T15:54:00Z'
updated_date: '2026-11-20T16:06:00Z'
labels:
  - McFix
  - McFix A
milestone: m-1
dependencies:
  - TASK-378
type: fix
ordinal: 95012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the separate grounder on task-378 (2026-11-20): Spec 128 Rule 3 (docs/specs/02-web-admin/128_surface_standard_policy.md:30) says every debounce, page size, stale time and rate limit is a registered logic variable with bounds and an on_invalid posture. No surface config key meets it today: debounce_ms and min_query_len (the older ones) and the keys task-378 adds have at most a minimum of 0, no maximum and no on_invalid. Operator, 2026-11-20, verbatim, on this item and the massing thresholds: 'you need to resolve these?' (orchestrator reading: resolve both). Scope: for EVERY key in the surface config, bounds and the failure behaviour declared in the existing surface schema and descriptors and refused by the existing validate check when absent; a planted-defect test (a key with no bounds is refused). How the rule's words 'registered logic variable' are met (bounds in the surface schema, or a row in the settings seed) is NOT decided: the lane brings the options with the rule text and the lens findings; the operator rules. Values do not change. Also remove or bind the typed SEARCH_DEBOUNCE_MS = 400 in mobile/src/constants/parcelSearch.ts that sits beside the slice value. After task-378 folds. Files: scripts/surfaces/_schema/surface.schema.json, scripts/surfaces/emit-mobile-surfaces.mjs, scripts/surfaces/surface-validate.mjs, scripts/surfaces/census/mobile-product.json, mobile/src/constants/parcelSearch.ts, src/tests/surfaces/surface-conformance.logic.test.ts
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
Added 2026-11-20 after task-378 folded (second grounder): also in this task: the phone area-factor copies mobile/src/lib/leadDetailFormat.ts:15 and mobile/src/lib/parcelCostFormat.ts:11 (10.7639 typed): the surface config schema accepts integers only (surface.schema.json), so a number-typed key is part of the bounds decision the operator rules; and SEARCH_DEBOUNCE_MS = 400 in mobile/src/constants/parcelSearch.ts is a dead second copy imported only by two phone tests.
<!-- SECTION:NOTES:END -->
