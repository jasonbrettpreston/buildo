---
id: TASK-379
title: >-
  ENGINE.ENTRY One sanctioned engine entry: app code that calls the engine comes
  under the existing step and Airtight gates (plan item B4)
status: LATER
assignee: []
created_date: '2026-11-20T14:28:00Z'
updated_date: '2026-11-24T14:42:00Z'
labels:
  - McFix
  - McFix C
  - dead
milestone: m-1
dependencies: []
type: build
ordinal: 79012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator 2026-11-20 (verbatim): "I agree." to the recommendation "2. Rule that engine compute has one sanctioned entry. Code that calls the engine comes under the existing step and Airtight gates by widening their scan. That closes the largest hole with a change to existing gates." and "Where is this task?". Record: ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md, entry "Operator: agrees with the recommendation; merge the plans plus modularization"; plan docs/reports/lanes/2026-11-20/BL-ENFORCE/PLAN-2-MERGED.md item B4. Why: Increment 1·B moved engine compute into a web route (src/lib/parcels/report-compute.ts, called by src/app/api/parcels/lookup/route.ts); the compute gates bind by folder (Spec 122 :804 "the directory IS the scope") and do not scan it (grounder, docs/reports/lanes/2026-11-20/BL-GROUND/REPORT.md scan-scope answer: scanned only by the silent-catch rule and the SQL ledger; not by compute-shape.yml, check-step-shape.mjs, compute-literals.mjs, compute-closure.mjs, compute-purity, estate-literals.mjs). Scope now: (1) a closed, dated list of files outside scripts/lib/compute allowed to reach the engine (Gate A of task-367 holds it); (2) each existing compute gate widens its scan to every file on that list, reusing its own rules, no new gate; findings on the two files allowed today are fixed or baselined with a dated reason; (3) the lock from the C1 verdict (docs/reports/lanes/2026-11-20/BL-VERIFYC): a test that the engine core closure never reads the runner-only context keys run_at, descriptor, clock; (4) a dated note on Spec 122 and Spec 132 stating the widened scope, citing the operator words above. Waits on: the plan review of PLAN-2-MERGED.md (lens set and a separate grounder), task-367 (Gate A), and conflict C1. Files: scripts/analysis/gates/compute-literals.mjs, scripts/analysis/gates/compute-closure.mjs, scripts/hooks/check-step-shape.mjs, scripts/ast-grep-rules/compute-shape.yml, scripts/analysis/gates/estate-literals.mjs, src/lib/parcels/report-compute.ts, docs/specs/01-pipeline/122_pipeline_step_optimization.md
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each widened gate is red first on a planted defect in a file on the reach list, then green, through the real hooks
- [ ] #2 A separate agent attacks the widened gates (a second entry file, an indirect import, a renamed file) and every attempt is refused, refusal lines pasted
- [ ] #3 The C1 lock fails if the core starts reading run_at, descriptor or clock
- [ ] #4 Lens set with the rule lists whole and rulings pasted; a separate grounder verdict on file
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
REWRITE OWED BEFORE LAUNCH (2026-11-20, plan grounder round 2, task-371; recorded in ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md "Grounder verdict on the merged plan"): scope items (2) and (4) above (widening the five compute gates; the spec note on widened scope) are REJECTED as not realistic: compute-closure.mjs:56 has no .ts suffix, compute-literals.mjs:289 filters to .js, compute-shape.yml globs are .js only, purity G1-G8 read a step descriptor. Scope that stands: (1) Gate A wired with a closed reach list (task-367); (new) the one-importer lock src/tests/customer-report-compute.logic.test.ts:243 uses Gate A reach forms so a dynamic import is seen; (3) the C1 lock. Known bypasses to state, not close: computed specifier, a hop through another scripts/ file, child process. Plan: ~/Buildo-scratch/lanes-20261119/inc1b/enforce/PLAN-3-ONE-PLAN.md section C.

McFix V2 review 2026-11-20 (orchestrator recommendation, not a ruling; status not changed by hand): Recommend REDUCED: Gate A (task-367) now holds the one-importer lock, including the hop through scripts/. What remains is only the C1 lock (the engine core closure never reads run_at, descriptor or the clock): one test. The stale Files line must be rewritten before launch.

Dated note 2026-11-22 (M-246, prior text kept; RR-0386 · Backlog): the gates of task-367 this card builds on exist only on branch wf1/inc1b-gates and are PARKED (task-443); this card waits on that decision.
<!-- SECTION:NOTES:END -->
