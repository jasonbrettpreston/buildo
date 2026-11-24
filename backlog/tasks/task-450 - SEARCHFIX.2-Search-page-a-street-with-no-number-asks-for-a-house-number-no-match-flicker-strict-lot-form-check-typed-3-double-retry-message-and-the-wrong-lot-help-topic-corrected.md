---
id: TASK-450
title: >-
  SEARCHFIX.2 Search page: a street with no number asks for a house number;
  no-match flicker, strict lot-form check, typed "3", double retry message and
  the wrong-lot help topic corrected
status: LATER
assignee: []
created_date: '2026-11-24T14:47:00Z'
labels:
  - SEARCHFIX-PRIORITY
milestone: m-1
dependencies: []
type: fix
ordinal: 150020
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-24 by the orchestrator, Spec 137 rule 2, on the operator's rulings: RR-0444 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290, fold the findings), RR-0447 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2308, add the new tasks with the search-fix labels, dependencies and order) and RR-0448 (the 8 merged cards). Source: the fold plan docs/reports/reviews/mcfixreborn-fold/FOLD-PLAN.md, task 2 (FIX.SEARCH-PAGE); every finding was ruled by a separate grounder (RR-0387, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1943; records under docs/reports/reviews/mcfixreborn-g1 to -g4). The plan's section 2 lines are this card's acceptance tests, each red first. Nothing is added that the plan or a ruling does not name (RR-0392, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975).

What changes, in plain words: on the phone and web search pages, a street typed with no house number shows the existing "add a house number" line. The "no match" line no longer flickers on a re-fetch; one extra field in a lot no longer fails the form; the minimum length comes from the setting, not a typed 3; a retry-after of zero shows one message; the semi page opened cold and offline does not redirect early; the help page gains the topic "Wrong address or lot" and both search links point at it.

Findings folded: 2a (phone side), V4, V5, L1, L3, L5, N4, R2, R4, R5 (golden header), B.7 (topic and the two search-page links), Q4, Q8, Q19 (the shim).

OPEN, to be grounded at the plan stage before it reaches the operator (RR-0443 b): with no house number, the line alone (recommended, the 2026-09-16 rule at mobile/src/lib/parcelSearchMatch.ts:12-13) or the line plus the close-address list.

Dated notes owed: Spec 99 (the redirect-once pattern); task-319.

Files: mobile/src/lib/parcelSearchMatch.ts, mobile/src/lib/semiQuestion.ts, mobile/src/lib/schemas.ts, mobile/src/components/surfaces/SearchBinding.tsx, src/components/surfaces/web/SearchBinding.tsx, scripts/surfaces/_schema/static-page.json, scripts/surfaces/_schema/static-page.schema.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.content.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.descriptor.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_semi_question.content.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_semi_question.descriptor.json, mobile/src/generated/surfaces/mobile_parcel_search.json, mobile/src/generated/surfaces/mobile_parcel_semi_question.json, mobile/__tests__/parcelSearchMatch.test.ts, mobile/__tests__/parcelSearchScreen.behaviour.test.tsx, mobile/__tests__/semiQuestionPage.behaviour.test.tsx, mobile/__tests__/schemas.test.ts, mobile/__tests__/daylightSearchPages.golden.test.ts, src/tests/surfaces/search-web-binding.ui.test.tsx, docs/specs/03-mobile/99_mobile_state_architecture.md, src/tests/fixtures/surfaces/
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A query with no house number shows the existing refine line
- [ ] #2 A settled miss fetched again keeps the no-match line
- [ ] #3 A lot form with one extra field parses; the closed enum lists stay
- [ ] #4 The minimum-length copy is filled from the setting, not a typed 3
- [ ] #5 The semi page opened cold and offline does not redirect before the lookup settles
- [ ] #6 The help page has the topic wrong-lot and both search links go to it
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
