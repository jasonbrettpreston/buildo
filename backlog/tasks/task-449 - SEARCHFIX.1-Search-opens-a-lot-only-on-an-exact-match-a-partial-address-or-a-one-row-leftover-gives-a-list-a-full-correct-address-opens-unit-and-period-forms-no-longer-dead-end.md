---
id: TASK-449
title: >-
  SEARCHFIX.1 Search opens a lot only on an exact match: a partial address or a
  one-row leftover gives a list; a full correct address opens; unit and period
  forms no longer dead-end
status: LATER
assignee: []
created_date: '2026-11-24T14:47:00Z'
labels:
  - SEARCHFIX-PRIORITY
milestone: m-1
dependencies: []
type: fix
ordinal: 150010
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-24 by the orchestrator, Spec 137 rule 2, on the operator's rulings: RR-0444 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290, fold the findings), RR-0447 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2308, add the new tasks with the search-fix labels, dependencies and order) and RR-0448 (the 8 merged cards). Source: the fold plan docs/reports/reviews/mcfixreborn-fold/FOLD-PLAN.md, task 1 (FIX.SEARCH-EXACT) with amendment A1; every finding was ruled by a separate grounder (RR-0387, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1943; records under docs/reports/reviews/mcfixreborn-g1 to -g4). The plan's section 2 lines are this card's acceptance tests, each red first. Nothing is added that the plan or a ruling does not name (RR-0392, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975).

What changes, in plain words: the address search opens a lot only when the typed address matches exactly (RR-0442, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2276; RR-0443, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2283). A partial address ("2760 Yon") or a search that happens to leave one row gives a list to pick from. A full correct address whose number is shared by another street type ("32 Fulham Dr") opens. "Unit 4, 123 Yonge St", "2760-4 Yonge St" and "St." no longer end in no match. The wildcard characters % and _ typed by a customer are escaped.

Findings folded: ST1, 2a (server side), G2 D1, G2 D6, G3 R1; typed-address seat differences 1 to 6 (docs/reports/reviews/mcfixreborn-g3/SEAT-typed-addresses.md), whose 29 typed-address cases with real addresses are this card's tests.

Must not: add a new resolution value, or touch the report meter in the lookup route.

Dated notes owed: Spec 100 (:103, :144); objectives G.1 and A.3 of doc-2 through the backlog CLI; task-69.

Files: src/lib/admin/parcel-lookup.ts, src/tests/search-parser-guard.logic.test.ts, src/tests/consumer-parcel-lookup.infra.test.ts, scripts/surfaces/parcel_product/F02/contracts/contract_parcels_lookup.descriptor.json, scripts/surfaces/_schema/census/contracts.json, docs/specs/03-mobile/100_mobile_parcel_cost_tool.md
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A typeahead that leaves exactly one row returns a list (text_candidates), never unique; only the exact path returns unique
- [ ] #2 "Gerrard St W" with a full 10-row window returns a list, not the one W row
- [ ] #3 A full correct address with its street type opens the lot when the number is shared by another street type
- [ ] #4 Unit-first, dash-unit, letter-suffix and period forms reach the lot or the close-address list, never a dead end
- [ ] #5 A typed % or _ is escaped and returns no unrelated lots
- [ ] #6 The 29 typed-address cases of the seat record pass as tests
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
