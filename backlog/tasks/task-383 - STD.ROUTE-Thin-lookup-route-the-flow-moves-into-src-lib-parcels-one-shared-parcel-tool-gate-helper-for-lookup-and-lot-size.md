---
id: TASK-383
title: >-
  STD.ROUTE Thin lookup route: the flow moves into src/lib/parcels; one shared
  parcel-tool gate helper for lookup and lot-size
status: RUNNING
assignee:
  - '@lane-BL-THINROUTE'
created_date: '2026-11-20T15:08:00Z'
updated_date: '2026-11-20T18:37:00Z'
labels:
  - McFix
  - McFix B
milestone: m-1
dependencies: []
type: build
ordinal: 83012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Plan section B3; after the section A fixes settle on these files. Engineering standards 10.3 (docs/specs/00_engineering_standards.md:228-229): API routes must be thin. Measurement: lookup/route.ts carries about 70 lines of flow (resolve, hold, stored read, compute, meter decision); the entitlement gate is written twice (lookup/route.ts:79-83, lot-size/route.ts:56-58). Lines moved, not new behaviour: no response, meter or golden may change. Operator 2026-11-20 (verbatim): "1. yes. add the tasks to incr 1b and remove the ones we dont need 2. fold ... d. just add the review enforcement not the others. e. fine". Plan: ~/Buildo-scratch/lanes-20261119/inc1b/enforce/PLAN-3-ONE-PLAN.md; reviewer evidence in ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md entries of 2026-11-20 (plan grounder; page-runner measurement; page-by-page schema check). Each gate or scan: a committed planted-defect test, red first through the real hooks; a separate agent attacks it, results reported as refused or STILL OPEN. Lens set with the rule lists whole and the rulings pasted; grounder launched by the orchestrator, never the lane. Files: src/app/api/parcels/lookup/route.ts, src/app/api/parcels/lot-size/route.ts, src/lib/parcels/report-compute.ts
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
2026-11-20 taken on the board at lane launch (lane BL-THINROUTE, worktree /Users/brettpreston_macmini/Buildo-wt-thinroute, branch wf1/inc1b-thinroute), RR-0240

Operator 2026-11-20, verbatim: "Let the grounder resolve them all as long as the result is compliant" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1476). Resolved by a separate grounder 2026-11-20 (the lane verifies each fact first): BUILD as carded, narrowed. Rule: engineering standards 10.3 (docs/specs/00_engineering_standards.md:228-229) "API routes must be thin — validate input, call a lib function, return the result. Business logic belongs in `src/lib/`, not in route handlers." 1. Move the lookup flow (resolve through meter and log) into a new src/lib/parcels flow file; auth, query parse and the two rate buckets stay in the route; one gate helper returning parcel_tool, lead_gen_transitional or null: lookup answers 403 before any DB work, lot-size calls it after the settings switch. No response, meter, log or golden changes. 2. Re-point each REAL lock to the flow file in the same commit, same strength, each with a red-then-green plant (Spec 128 section 4.4): sole importer of report-compute (customer-report-compute.logic.test.ts:245-246), sole importer of openReport (parcel-tool-meter.logic.test.ts:215-223, keep the :214 comment), the report-page.ts importer list (customer-report-read.logic.test.ts T10), the meter guard body.page === null (customer-report-read.logic.test.ts:344), the log-hygiene pins (no q, no answer text), the lot-form log pin. 3. The gate-before-DB pin becomes: the route calls the helper before the flow call and the helper holds the status set; add a behavioural lapsed-account test if none exists. Drop only the exact import-line and token-order text pins (parcels-lookup-page.logic.test.ts:187; the readLotForm( token in parcel-lot-form.logic.test.ts) and say so. 4. Engine reach: the flow file is a new transitive caller: add it to ALLOWED_REACHERS in scripts/analysis/gates/compute-reach.mjs with a dated reason if that file is on the base; if it is only on branch wf1/inc1b-gates, state the owed list edit in the report; check scripts/analysis/gates/src-sql-ledger.mjs. The earlier brief sentence "every existing route test stays green unchanged" was orchestrator text, not a rule, and is withdrawn.
<!-- SECTION:NOTES:END -->
