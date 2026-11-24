---
id: TASK-382
title: >-
  STD.SCAN One scan refuses fetch, timer, query and cache calls in page mount
  and binding files; the phone report page joins the mounts list
status: LATER
assignee: []
created_date: '2026-11-20T15:08:00Z'
updated_date: '2026-11-24T14:42:00Z'
labels:
  - McFix
  - McFix B
  - dead
milestone: m-1
dependencies: []
type: build
ordinal: 82012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Plan section B2; after STD.HOOKS. Form: the nav-by-route lock (src/tests/surfaces/nav-by-route.logic.test.ts): compiler API, planted case per rule with a passing sibling, fail-closed allow-list. Scope: every file in scripts/surfaces/_schema/bindings.json mounts[] and modules[]; add mobile/app/(app)/parcel-tool/[parcelId].tsx to mounts[] (not listed today, so C-2 never scans it). Refuses: fetch, fetchWithAuth, setTimeout, setInterval, useQuery, useMutation, queryClient calls, setQueryData, AbortController. Rule home: Spec 99 B1 (:220), Spec 128 Rule 2 (:29), Spec 126 section 0b item 3 (:74); the new rule line goes into the McFrontend register by its generator (task MF.RULES). Operator 2026-11-20 (verbatim): "1. yes. add the tasks to incr 1b and remove the ones we dont need 2. fold ... d. just add the review enforcement not the others. e. fine". Plan: ~/Buildo-scratch/lanes-20261119/inc1b/enforce/PLAN-3-ONE-PLAN.md; reviewer evidence in ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md entries of 2026-11-20 (plan grounder; page-runner measurement; page-by-page schema check). Each gate or scan: a committed planted-defect test, red first through the real hooks; a separate agent attacks it, results reported as refused or STILL OPEN. Lens set with the rule lists whole and the rulings pasted; grounder launched by the orchestrator, never the lane. Files: src/tests/surfaces/nav-by-route.logic.test.ts, scripts/surfaces/_schema/bindings.json, mobile/app/(app)/parcel-tool/[parcelId].tsx
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
McFix V2 review 2026-11-20 (orchestrator recommendation, not a ruling; status not changed by hand): Still relevant, with a changed basis: keep as one small accident guard (no fetch, timer, query or cache call in a mount or binding file), named as that, only after task-388 writes the rule it enforces; not hardened further.
<!-- SECTION:NOTES:END -->
