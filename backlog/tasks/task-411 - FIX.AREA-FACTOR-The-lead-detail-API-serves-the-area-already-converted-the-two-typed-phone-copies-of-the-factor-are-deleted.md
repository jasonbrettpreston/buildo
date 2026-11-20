---
id: TASK-411
title: >-
  FIX.AREA-FACTOR The lead-detail API serves the area already converted; the two
  typed phone copies of the factor are deleted
status: RUNNING
assignee:
  - '@lane-BL-AREAFACTOR'
created_date: '2026-11-20T18:27:00Z'
updated_date: '2026-11-20T19:33:00Z'
labels:
  - McFix
  - McFix A
milestone: m-1
dependencies: []
type: build
ordinal: 111012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator 2026-11-20, verbatim: "Let the grounder resolve them all as long as the result is compliant" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1476). Resolved by the separate grounder of task-395, 2026-11-20 (verify each fact before building): the earlier resolution (the factor reaches the phone as a generated-slice number) is false: neither screen has a slice. Facts: mobile leadDetailFormat.ts:15 types 10.7639 and is used by [lead].tsx via formatSqft on cost.modeled_gfa_sqm from GET /api/leads/detail/:id; parcelCostFormat.ts:11 types it too and is imported only by its own test and the web parity oracle src/tests/admin-report-preview-live.logic.test.ts:129; the pinned setting parcels_sqm_to_sqft is already read at src/lib/parcels/geometry.ts:6 (SQM_TO_SQFT). Build: the lead-detail API serves an optional cost.modeled_gfa_sqft computed from SQM_TO_SQFT; the phone Zod schema takes it and formatSqft only formats; both typed copies deleted; the parity test re-pointed to literal expected strings. No new surface, no slice. Rule: operator ruling MORNING-DECISIONS.md:241 'The conversion factor lives in content/settings, never in code'; Spec 136 fe.44. Also noted by the grounder, not in this task: the permits route serves feet_per_metre (route.ts:267) for client maths, which strains fe.44 the same way. Files: src/app/api/leads/detail/[id]/route.ts, mobile/src/lib/leadDetailFormat.ts, mobile/src/lib/parcelCostFormat.ts, src/tests/admin-report-preview-live.logic.test.ts
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
2026-11-20 taken on the board at lane launch (lane BL-AREAFACTOR, worktree /Users/brettpreston_macmini/Buildo-wt-areafactor, branch wf1/inc1b-areafactor), RR-0240

Operator ruling 2026-11-20 (MORNING-DECISIONS.md entry 'Operator RULES on five open items', item 5; his words: "yes to all"): task-411 is accepted as built: the server sends one converted square-feet figure and the phone only rounds it and appends the unit word; the both-units-and-toggle half of the unit ruling (:241, FE-44) applies to the report only, not to lead detail (Spec 126:1132). The CONFLICT findings on that half are settled by this.
<!-- SECTION:NOTES:END -->
