---
id: TASK-451
title: >-
  SEARCHFIX.3 Lot card: "Not available" for an implausible lot size, "at the
  back", "or report it", screen-reader labels, plain-page header links
status: LATER
assignee: []
created_date: '2026-11-24T14:47:00Z'
labels:
  - SEARCHFIX-PRIORITY
milestone: m-1
dependencies:
  - TASK-450
type: fix
ordinal: 150040
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-24 by the orchestrator, Spec 137 rule 2, on the operator's rulings: RR-0444 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290, fold the findings), RR-0447 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2308, add the new tasks with the search-fix labels, dependencies and order) and RR-0448 (the 8 merged cards). Source: the fold plan docs/reports/reviews/mcfixreborn-fold/FOLD-PLAN.md, task 3 (FIX.LOT-CARD) with amendment A3; every finding was ruled by a separate grounder (RR-0387, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1943; records under docs/reports/reviews/mcfixreborn-g1 to -g4). The plan's section 2 lines are this card's acceptance tests, each red first. Nothing is added that the plan or a ruling does not name (RR-0392, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975).

What changes, in plain words: the lot card shows "Not available" when the stored lot size is outside the plausible range (RR-0444, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290), reads "at the back" for a lot with no fronting street, ends the no-lot line with "or report it", and its screen-reader label says what the card shows. The plain pages (help, terms) get their header links. The several-lots map stays as built: no neighbour lots (RR-0446, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2302), and objective C.3's text is corrected by a dated note through the backlog CLI.

Findings folded: ST3/2c, V1, V2, V3 (with C.9), L2, L7, R3, X1, X6 (static-page half), R5, B.7 (map links), H Q2, H Q4; the wrong doc-2 status marks for C.7 and C.12 get dated notes.

Must not: draw neighbour lots, or add a new size setting (reuse LOT_SIZE_PLAUSIBLE_M2, src/lib/report-projection/project.ts:79).

Runs after SEARCHFIX.2 (both write scripts/surfaces/_schema/static-page.json). Dated note owed: task-336.

Files: src/lib/parcels/consumer-lookup.ts, mobile/src/components/surfaces/LotMapBinding.tsx, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_disambiguation_map.content.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_disambiguation_map.descriptor.json, mobile/src/generated/surfaces/mobile_parcel_disambiguation_map.json, scripts/surfaces/_schema/static-page.json, src/components/surfaces/web/StaticBinding.tsx, src/tests/surfaces/static-page.logic.test.ts, src/tests/surfaces/static-web-binding.ui.test.tsx, src/tests/surfaces/lot-map-help-link.logic.test.ts, src/tests/consumer-parcel-lookup.infra.test.ts, mobile/__tests__/lotMapPage.behaviour.test.tsx, mobile/__tests__/lotMapScreens.golden.test.ts, scripts/analysis/lot-map-data-check.mjs, src/tests/fixtures/surfaces/
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A lot size outside the plausible range reads "Not available" on the card and in its screen-reader label
- [ ] #2 A lot with no fronting street reads "at the back"
- [ ] #3 The no-lot line ends "or report it" and links to the wrong-lot help topic
- [ ] #4 The screen-reader label contains the visible card text
- [ ] #5 The lot-map smoke test renders the four error states as errors
- [ ] #6 Objective C.3 carries a dated note: no neighbour lots
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
