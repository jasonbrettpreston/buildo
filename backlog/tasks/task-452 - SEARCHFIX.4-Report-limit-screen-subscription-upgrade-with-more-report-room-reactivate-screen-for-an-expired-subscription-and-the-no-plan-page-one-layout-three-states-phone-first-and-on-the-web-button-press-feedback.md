---
id: TASK-452
title: >-
  SEARCHFIX.4 Report-limit screen (subscription upgrade with more report room),
  reactivate screen for an expired subscription, and the no-plan page: one
  layout, three states, phone first and on the web; button press feedback
status: LATER
assignee: []
created_date: '2026-11-24T14:47:00Z'
labels:
  - SEARCHFIX-PRIORITY
milestone: m-1
dependencies:
  - TASK-450
  - TASK-451
type: build
ordinal: 150050
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-24 by the orchestrator, Spec 137 rule 2, on the operator's rulings: RR-0444 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290, fold the findings), RR-0447 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2308, add the new tasks with the search-fix labels, dependencies and order) and RR-0448 (the 8 merged cards). Source: the fold plan docs/reports/reviews/mcfixreborn-fold/FOLD-PLAN.md, task 5 (BUILD.REPORT-LIMIT) and 7 (FIX.PRESS-FEEDBACK) with amendment A2; every finding was ruled by a separate grounder (RR-0387, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1943; records under docs/reports/reviews/mcfixreborn-g1 to -g4). The plan's section 2 lines are this card's acceptance tests, each red first. Nothing is added that the plan or a ruling does not name (RR-0392, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975).

What changes, in plain words: a customer at their report limit sees a screen offering a subscription upgrade with more report room (objective G.6, doc-2:94; RR-0443, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2283; RR-0444, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290). A customer whose subscription has expired sees a reactivate screen (RR-0444). A signed-in customer with no plan sees the no-plan page (task-357, absorbed here by RR-0446, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2302). One wall layout serves the three states, built phone first and also on the web, following how the other pages were built (RR-0445, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2296). Last on the phone, primary buttons on the parcel pages get the spring and haptic feedback the engineering standard asks for.

Findings folded: ST2, 2b, the O1 slot, Q14. Starts from the approved mocks (report-limit.html, small-pages-v8 no-plan.html) and existing components (the existing PaywallScreen is checked first for the reactivate state).

Orchestrator reading, to be grounded at the plan stage: the purchase itself happens on the web; the phone wall carries the line or link, not a checkout.

Must not: build a new plan or checkout flow; call expo-haptics directly; move the report goldens (wall copy lives in the search content).

Runs after SEARCHFIX.2 and SEARCHFIX.3 (shared search binding, match file and content). Corrects the BUILT mark on objective G.6 by a dated note. Dated note owed: task-320.

Files: mobile/src/lib/apiClient.ts, mobile/src/lib/errors.ts, mobile/src/lib/parcelSearchMatch.ts, mobile/src/components/surfaces/SearchBinding.tsx, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.content.json, mobile/src/generated/surfaces/mobile_parcel_search.json, mobile/app/(app)/parcel-tool/[parcelId].tsx, mobile/src/components/surfaces/ReportPageHost.tsx, src/app/(maxbld)/parcel-tool/SearchPageClient.tsx, src/app/(maxbld)/parcel-tool/[parcelId]/page.tsx, mobile/src/components/surfaces/SurfaceRenderer.tsx, mobile/__tests__/apiClient.test.ts, mobile/__tests__/parcelSearchMatch.test.ts, mobile/__tests__/parcelSearchScreen.behaviour.test.tsx, mobile/__tests__/surfaceRenderer.smoke.test.tsx, src/tests/fixtures/surfaces/
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A 403 keeps its code, limit and reset date; limit reached and subscription required are two error classes
- [ ] #2 At the limit, the search page and the report screen show the wall with the count, the reset date and the upgrade line; never the reactivate copy
- [ ] #3 An expired subscription shows the reactivate state
- [ ] #4 A signed-in customer with no plan sees the no-plan page in the app
- [ ] #5 The web shows the same three states
- [ ] #6 Primary buttons spring and critical actions call the existing haptics wrapper
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
