---
id: TASK-456
title: >-
  SEARCHFIX.8 Tests: the missing search tests and a real-database test for
  migration 309
status: LATER
assignee: []
created_date: '2026-11-24T14:47:00Z'
labels:
  - SEARCHFIX-LATER
milestone: m-1
dependencies:
  - TASK-452
type: fix
ordinal: 150130
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-24 by the orchestrator, Spec 137 rule 2, on the operator's rulings: RR-0444 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290, fold the findings), RR-0447 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2308, add the new tasks with the search-fix labels, dependencies and order) and RR-0448 (the 8 merged cards). Source: the fold plan docs/reports/reviews/mcfixreborn-fold/FOLD-PLAN.md, task 8 (FIX.SEARCH-TESTS) and 9 (FIX.MIG309-DBTEST); every finding was ruled by a separate grounder (RR-0387, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1943; records under docs/reports/reviews/mcfixreborn-g1 to -g4). The plan's section 2 lines are this card's acceptance tests, each red first. Nothing is added that the plan or a ruling does not name (RR-0392, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975).

What changes, in plain words: tests only. The "reports left" state is rendered in a test; property tests for the massing numbers and the slice-number reader; a security test file for the parcel routes; typed test builders; the ledger tool fails on a missing folder; both constraints of migration 309 are refused in a real database.

Findings folded: X2, X4, X5, X6 (nav half), N3, R5, G2 D2, G2 D4, G2 D5.

Must not: edit migration 309. The database test runs on the local test stack only; whether that needs a GO is UNVERIFIED and is settled at the plan stage.

Runs after SEARCHFIX.4 (shared phone smoke test).

Files: mobile/__tests__/surfaceRenderer.smoke.test.tsx, mobile/__tests__/reportScreen.gateStability.behaviour.test.tsx, src/tests/surfaces/nav-by-route.logic.test.ts, src/tests/surfaces/search-follow-ups.logic.test.ts, src/tests/property/massing.property.test.ts, src/tests/property/slice-number.property.test.ts, src/tests/parcel-routes.security.test.ts, src/tests/customer-report-read.logic.test.ts, src/tests/src-sql-ledger.logic.test.ts, src/tests/factories.ts, scripts/analysis/src-sql-ledger.mjs, src/tests/db/migration-309-parcel-maxbld-scenarios.db.test.ts
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The reports-left state renders in a test
- [ ] #2 Property tests hold coverage at or under 100 and the slice number in bounds
- [ ] #3 The parcel routes answer 401 with no session and ignore a uid parameter
- [ ] #4 Both CHECK constraints of migration 309 are refused in a real database
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
