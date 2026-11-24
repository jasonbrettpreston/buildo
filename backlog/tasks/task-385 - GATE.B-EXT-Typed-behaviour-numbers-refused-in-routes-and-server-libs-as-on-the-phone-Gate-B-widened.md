---
id: TASK-385
title: >-
  GATE.B-EXT Typed behaviour numbers refused in routes and server libs as on the
  phone (Gate B widened)
status: LATER
assignee: []
created_date: '2026-11-20T15:08:00Z'
updated_date: '2026-11-24T18:41:00Z'
labels:
  - dead
milestone: m-1
dependencies: []
type: build
ordinal: 85012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Plan section C; after task-367 and task-378. Plan grounder: Gate B (scripts/analysis/gates/mobile-literals.mjs:64-68, U1-U4) scans mobile only. Add roots src/app/api, src/lib/parcels, src/lib/report-projection, src/components/surfaces and the by-value conversion-factor class; shrink-only dated baseline only after task-378. State, do not hide: exact zero is allowed (Spec 128); arithmetic forms such as 60 * 1000 are not seen. Rule: Spec 126 P4 (:189), Spec 128 Rule 3 (:30). Operator 2026-11-20 (verbatim): "1. yes. add the tasks to incr 1b and remove the ones we dont need 2. fold ... d. just add the review enforcement not the others. e. fine". Plan: ~/Buildo-scratch/lanes-20261119/inc1b/enforce/PLAN-3-ONE-PLAN.md; reviewer evidence in ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md entries of 2026-11-20 (plan grounder; page-runner measurement; page-by-page schema check). Each gate or scan: a committed planted-defect test, red first through the real hooks; a separate agent attacks it, results reported as refused or STILL OPEN. Lens set with the rule lists whole and the rulings pasted; grounder launched by the orchestrator, never the lane. Files: scripts/analysis/gates/mobile-literals.mjs, src/tests/gate-mobile-compliance.infra.test.ts
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
McFix V2 review 2026-11-20 (orchestrator recommendation, not a ruling; status not changed by hand): Recommend DROPPED: it extends Gate B, and the operator ruled the gates are accident guards with no further hardening (ruling "a", MORNING-DECISIONS.md:1449). Typed behaviour numbers are now caught by the compliance review with Spec 126 P4 and Spec 128 Rule 3 attached.

2026-11-20 operator ruling (M-246, prior text kept), ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1610, verbatim: "approved", to the list he pasted back; the item for this task as put to him: "Record 385, 397, 400 and 404 as dropped, and 371 and 377 as closed superseded. Recommended yes.". The decision record tool holds one record per quote and cite (decision-126, RR-0341, carries the same approval), so this note is the record on this task. No status is moved by hand.

Dated note 2026-11-22 (M-246, prior text kept; RR-0386 · Backlog): the gates of task-367 this card builds on exist only on branch wf1/inc1b-gates and are PARKED (task-443); this card waits on that decision.
<!-- SECTION:NOTES:END -->
