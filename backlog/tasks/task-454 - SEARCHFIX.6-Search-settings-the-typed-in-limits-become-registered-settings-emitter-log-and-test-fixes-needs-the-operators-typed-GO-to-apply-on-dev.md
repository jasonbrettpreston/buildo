---
id: TASK-454
title: >-
  SEARCHFIX.6 Search settings: the typed-in limits become registered settings;
  emitter, log and test fixes (needs the operator's typed GO to apply on dev)
status: LATER
assignee: []
created_date: '2026-11-24T14:47:00Z'
labels:
  - SEARCHFIX-LATER
milestone: m-1
dependencies:
  - TASK-449
  - TASK-450
  - TASK-451
  - TASK-452
type: fix
ordinal: 150110
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-24 by the orchestrator, Spec 137 rule 2, on the operator's rulings: RR-0444 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290, fold the findings), RR-0447 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2308, add the new tasks with the search-fix labels, dependencies and order) and RR-0448 (the 8 merged cards). Source: the fold plan docs/reports/reviews/mcfixreborn-fold/FOLD-PLAN.md, task 4 (FIX.SEARCH-SETTINGS); every finding was ruled by a separate grounder (RR-0387, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1943; records under docs/reports/reviews/mcfixreborn-g1 to -g4). The plan's section 2 lines are this card's acceptance tests, each red first. Nothing is added that the plan or a ruling does not name (RR-0392, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975).

What changes, in plain words: the limits typed into the code (60, 30 and 30 a minute; the 500 ms slow-query mark; the cap of 10; 3 recent searches) become registered settings with bounds (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1494 "register them"). The generator emits a setting of 0; the entitlement route logs success; the error tests check that no database text leaks; stale wording corrected. No customer effect today: the limits work as typed.

Findings folded: N1, Q1, L4, L6, L8, X3, G2 D3, G2 K3, seat S2.

DB: no migration file; the seed loader inserts the rows at the next migrate. Rehearsed on the test stack first; running on dev is the operator's own typed GO.

Runs after SEARCHFIX.1 to .4 (shared lookup file, search slice and descriptor). Dated note owed: task-372.

Files: scripts/seeds/logic_variables.json, src/app/api/parcels/lookup/route.ts, src/app/api/parcels/entitlement/route.ts, src/lib/admin/parcel-lookup.ts, mobile/src/constants/parcelSearch.ts, mobile/src/store/recentSearchesStore.ts, scripts/surfaces/emit-mobile-surfaces.mjs, mobile/src/lib/sliceConfig.ts, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.descriptor.json, mobile/src/generated/surfaces/mobile_parcel_search.json, docs/reference/logic-variables-registry.md, src/tests/control-panel.logic.test.ts, src/tests/parcel-lookup-gate.infra.test.ts, src/tests/parcels-entitlement.infra.test.ts, src/tests/surfaces/surface-conformance.logic.test.ts
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The six limits are seed rows with bounds, the code reads them, and a test fails when the code types the number
- [ ] #2 A setting of 0 that the schema allows is emitted
- [ ] #3 The entitlement route logs success with uid and duration
- [ ] #4 The 500 bodies contain no database text
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
