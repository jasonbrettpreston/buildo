---
id: TASK-383
title: >-
  STD.ROUTE Thin lookup route: the flow moves into src/lib/parcels; one shared
  parcel-tool gate helper for lookup and lot-size
status: RUNNING
assignee:
  - '@lane-BL-THINROUTE'
created_date: '2026-11-20T15:08:00Z'
updated_date: '2026-11-20T19:10:00Z'
labels:
  - McFix
  - McFix B
milestone: m-1
dependencies: []
references:
  - docs/reports/lanes/2026-11-20/BL-THINROUTE/REPORT.md
type: build
ordinal: 83012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Plan section B3; after the section A fixes settle on these files. Engineering standards 10.3 (docs/specs/00_engineering_standards.md:228-229): API routes must be thin. Measurement: lookup/route.ts carries about 70 lines of flow (resolve, hold, stored read, compute, meter decision); the entitlement gate is written twice (lookup/route.ts:79-83, lot-size/route.ts:56-58). Lines moved, not new behaviour: no response, meter or golden may change. Operator 2026-11-20 (verbatim): "1. yes. add the tasks to incr 1b and remove the ones we dont need 2. fold ... d. just add the review enforcement not the others. e. fine". Plan: ~/Buildo-scratch/lanes-20261119/inc1b/enforce/PLAN-3-ONE-PLAN.md; reviewer evidence in ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md entries of 2026-11-20 (plan grounder; page-runner measurement; page-by-page schema check). Each gate or scan: a committed planted-defect test, red first through the real hooks; a separate agent attacks it, results reported as refused or STILL OPEN. Lens set with the rule lists whole and the rulings pasted; grounder launched by the orchestrator, never the lane. Files: src/app/api/parcels/lookup/route.ts, src/app/api/parcels/lot-size/route.ts, src/lib/parcels/report-compute.ts, src/lib/parcels/lookup-flow.ts, src/lib/parcels/tool-gate.ts, src/tests/consumer-parcel-lookup.infra.test.ts, src/tests/customer-report-compute.logic.test.ts, src/tests/customer-report-read.logic.test.ts, src/tests/parcels-lookup-page.logic.test.ts, src/tests/parcel-lot-form.logic.test.ts, src/tests/parcel-tool-gate.logic.test.ts, src/tests/parcel-lookup-gate.infra.test.ts, scripts/surfaces/parcel_product/F02/contracts/contract_parcels_lookup.descriptor.json, scripts/surfaces/_schema/census/contracts.json, src/lib/parcels/lookup-flow.ts, src/lib/parcels/tool-gate.ts, src/tests/consumer-parcel-lookup.infra.test.ts, src/tests/customer-report-compute.logic.test.ts, src/tests/customer-report-read.logic.test.ts, src/tests/parcels-lookup-page.logic.test.ts, src/tests/parcel-lot-form.logic.test.ts, src/tests/parcel-tool-gate.logic.test.ts
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Rule: engineering standards 10.3 (docs/specs/00_engineering_standards.md:229) "API routes must be thin — validate input, call a lib function, return the result. Business logic belongs in `src/lib/`, not in route handlers."
Grounder resolution on the task (verified): build as carded, narrowed. Operator 2026-11-20 (MORNING-DECISIONS.md:1476) "Let the grounder resolve them all as long as the result is compliant".
Facts opened and found true: eng standards 10.3 at :228-229; lookup route holds the whole flow; the gate is written twice (lookup route, lot-size route); the six locks named by the grounder read route.ts as text (consumer-parcel-lookup.infra:36-41,66-90; customer-report-read.logic:344,397; customer-report-compute.logic:245-246; parcel-tool-meter.logic:215-223; parcels-lookup-page.logic:187; parcel-lot-form.logic:165-166); a lapsed-account behavioural test exists (parcel-lookup-gate.infra.test.ts:153). compute-reach.mjs has no ALLOWED_REACHERS on this base (it is only on branch wf1/inc1b-gates); src-sql-ledger.mjs is at scripts/analysis/.
Build:
1. src/lib/parcels/tool-gate.ts: parcelToolAccess(pool, ctx) returns 'parcel_tool' | 'lead_gen_transitional' | null; it holds the ACTIVE_SUBSCRIPTION_STATUSES test. Lookup route calls it right after auth and answers forbiddenSubscription() on null before any DB work; lot-size route calls it after the settings switch (same order as today) and answers forbiddenSubscription() on null.
2. src/lib/parcels/lookup-flow.ts: runLookupFlow({q, parcelId, semi}) holds resolve, map, the lot row, the lot form, the held/stored/computed page, the response and the boundary parse, and returns {response, body, parcelRef, pageSource, computeMs}. The meter decision, the openReport call, the refusal mapping (reportLimitReached / forbiddenSubscription), the log line, auth, the query parse, the two rate buckets and the catch to internalError STAY in route.ts: RR-0331 (decision-116), operator verbatim 2026-11-20 "2. y" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1432) to "leaving it where it is" (the lookup route). The earlier resolution words "resolve through meter and log" are superseded on that point. What remains in the route is a declared deviation from engineering standards 10.3 (descriptor deviations of contract_parcels_lookup).
3. No response, meter, log key or golden changes.
4. Tests: re-pointed to the flow file with a plant through the real walk/filter: sole importer of report-compute, report-page importer list, dangling-id miss pin, resolver import pin (route imports no resolver), readLotForm( once-in-flow, gate-before-flow; new locks: the flow imports no logger, entitlement or meter code, the flow holds no non-null assertion; a route test for a thrown gate read (500, nothing metered); a new test file for the helper. NOT re-pointed because they still hold on the route: openReport sole importer, body.page === null guard, log hygiene, lot_form_unsure. parcels-lookup-page:187 import-line pin re-pointed to the flow file; the readLotForm( route token pin replaced by the once-in-flow pin.
5. Engine reach: compute-reach.mjs exists only on branch wf1/inc1b-gates. Owed to ALLOWED_REACHERS when both branches are on the board (the gates branch file, not edited here): file src/lib/parcels/lookup-flow.ts, since 2026-11-20, reason "STD.ROUTE (task-383): the lookup flow calls report-compute.ts (one hop)"; the src/app/api/parcels/lookup/route.ts entry reworded to two hops (route -> lookup-flow -> report-compute). Whichever branch lands second carries it.
Principles: standardized, understandable, simple. Nothing added that the card did not name.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-20 taken on the board at lane launch (lane BL-THINROUTE, worktree /Users/brettpreston_macmini/Buildo-wt-thinroute, branch wf1/inc1b-thinroute), RR-0240

Operator 2026-11-20, verbatim: "Let the grounder resolve them all as long as the result is compliant" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1476). Resolved by a separate grounder 2026-11-20 (the lane verifies each fact first): BUILD as carded, narrowed. Rule: engineering standards 10.3 (docs/specs/00_engineering_standards.md:228-229) "API routes must be thin — validate input, call a lib function, return the result. Business logic belongs in `src/lib/`, not in route handlers." 1. Move the lookup flow (resolve through meter and log) into a new src/lib/parcels flow file; auth, query parse and the two rate buckets stay in the route; one gate helper returning parcel_tool, lead_gen_transitional or null: lookup answers 403 before any DB work, lot-size calls it after the settings switch. No response, meter, log or golden changes. 2. Re-point each REAL lock to the flow file in the same commit, same strength, each with a red-then-green plant (Spec 128 section 4.4): sole importer of report-compute (customer-report-compute.logic.test.ts:245-246), sole importer of openReport (parcel-tool-meter.logic.test.ts:215-223, keep the :214 comment), the report-page.ts importer list (customer-report-read.logic.test.ts T10), the meter guard body.page === null (customer-report-read.logic.test.ts:344), the log-hygiene pins (no q, no answer text), the lot-form log pin. 3. The gate-before-DB pin becomes: the route calls the helper before the flow call and the helper holds the status set; add a behavioural lapsed-account test if none exists. Drop only the exact import-line and token-order text pins (parcels-lookup-page.logic.test.ts:187; the readLotForm( token in parcel-lot-form.logic.test.ts) and say so. 4. Engine reach: the flow file is a new transitive caller: add it to ALLOWED_REACHERS in scripts/analysis/gates/compute-reach.mjs with a dated reason if that file is on the base; if it is only on branch wf1/inc1b-gates, state the owed list edit in the report; check scripts/analysis/gates/src-sql-ledger.mjs. The earlier brief sentence "every existing route test stays green unchanged" was orchestrator text, not a rule, and is withdrawn.

2026-11-20 lane BL-THINROUTE: plan lens round raised RR-0331 (decision-116, operator "2. y", MORNING-DECISIONS.md:1432: the report meter stays in the lookup route). Build narrowed to keep it: the meter decision, openReport call, refusal mapping and log line stay in route.ts; the flow file holds resolve through the boundary parse; the gate helper is shared. This departs from the resolution's words "resolve through meter and log"; grounder to rule. Locks on the route (openReport importer, body.page === null guard, log pins) are not re-pointed because they still hold. parcels-lookup-page:187 import-line pin re-pointed to the flow file (not dropped); readLotForm( route token pin replaced by a once-in-flow pin. Files line extended for the two new lib files and the test files.

2026-11-20 fix round 1 (grounder GROUNDER.md): engine reach owed, written exactly. When wf1/inc1b-gates and wf1/inc1b-thinroute are both on the board, scripts/analysis/gates/compute-reach.mjs ALLOWED_REACHERS must carry: file src/lib/parcels/lookup-flow.ts, since 2026-11-20, reason "STD.ROUTE (task-383): the lookup flow calls report-compute.ts (one hop)"; and the src/app/api/parcels/lookup/route.ts entry reworded to two hops (route -> lookup-flow -> report-compute). Not edited here (the file is on the gates branch only). Declared deviation from engineering standards 10.3 for what remains in the route recorded in the descriptor deviations of contract_parcels_lookup (adjudicated_by the operator "2. y", RR-0331, MORNING-DECISIONS.md:1432).
<!-- SECTION:NOTES:END -->
