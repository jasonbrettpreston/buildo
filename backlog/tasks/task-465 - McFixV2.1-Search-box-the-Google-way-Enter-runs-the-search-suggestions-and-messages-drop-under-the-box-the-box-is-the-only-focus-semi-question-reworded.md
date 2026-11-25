---
id: TASK-465
title: >-
  McFixV2.1 Search box the Google way: Enter runs the search, suggestions and
  messages drop under the box, the box is the only focus; semi question reworded
status: LATER
assignee: []
created_date: '2026-11-25T17:05:00Z'
updated_date: '2026-11-25T17:45:00Z'
labels:
  - McFixV2
milestone: m-1
dependencies: []
references:
  - compliance:mobile-90 docs/specs/03-mobile/90_mobile_engineering_protocol.md
  - compliance:mobile-98 docs/specs/03-mobile/98_mobile_testing_protocol.md
  - compliance:mobile-99 docs/specs/03-mobile/99_mobile_state_architecture.md
  - compliance:surface-136 docs/specs/02-web-admin/136_mcfrontend_handbook.md
  - compliance:eng-all docs/specs/00_engineering_standards.md
  - compliance:plan-protocol docs/specs/00-architecture/plan-protocol.md
  - compliance:inc-S backlog/docs/increments/doc-2 - Increment-S-requirements.md
  - compliance:ms-S backlog/milestones/m-1 - increment-1·b-search-[s].md
type: fix
ordinal: 159210
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
McFixV2.1 Search box the Google way (phone search page and semi question page).

Source: the operator phone walk of 2026-11-25 on a real iPhone (findings file ~/Buildo-scratch/lanes-20261125/PHONE-WALK-FINDINGS-20261125.md, items 1-4, 6, 11-15, 17-19, 21, 22, 25, 27-29, 32, 36; sort with file:line in ~/Buildo-scratch/lanes-20261125/PHONE-WALK-SORT-20261125.txt).

Rulings (operator, verbatim, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md):
- RR-0483 (:2523): "With google maps - suggestions appear below as you type - and you can select them - but your typed search does not execute until you press enter or select an address. And if you press enter with an incomplete address - you get the error".
- RR-0485 (:2533): "1 inside" (semi wording and sizes ride in this card); "6. Open that lot - they need to press enter - after filling out the address in the search box."
- RR-0482 (:2518): "larger tasks and using existing components as well."
- Operator on focus (finding 6): "The main focus for the user is the search bubble and nothing else should distract from it."

What changes (each needs the approved mock first; this replaces parts of the approved search design, so the mock is the operator gate):
1. The Enter key runs the search (today no submit action is wired). Nothing opens while typing.
2. While typing, suggestions drop directly under the box, part of the box, under a thin grey line; tapping a row opens that lot. No Select button, no radio cards, no "Ambiguous address query" title for one candidate.
3. Enter on an address that matches one lot opens that lot; Enter on an address that matches nothing shows the not-found line in the same drop-down. "No parcel found for that address." becomes "No lot found".
4. An address outside Toronto shows its message in the same drop-down (not a red banner); the no-comma case is to be decided in the plan.
5. The list clears as soon as the user starts deleting. The box is empty when the user comes back from a report.
6. Only the box draws the eye: recent-search chips, the legal line and the reports-left line are smaller and quieter; the typed text is centred in the box; the searching state is aligned.
7. Semi question page: the question reads "Is this a semi?"; the question is the focus and the answers are not larger than it.

Constraints: no database step. Reuse the existing builders (addressList, notice, chips, reportsLeft in SearchBinding.tsx; PageTableBinding for the semi page) and the existing settings (debounce_ms, min_query_len, candidate_cap); a new component needs a named reason. The hand-off to the loading screen and the one-time report calculation belong to task-267, not here.

Files: mobile/app/(app)/parcel-tool/index.tsx, mobile/src/components/surfaces/SearchBinding.tsx, mobile/src/constants/parcelSearch.ts, mobile/src/lib/parcelSearchMatch.ts, mobile/src/constants/lotMap.ts, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.content.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_semi_question.content.json
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Nothing opens while typing; Enter or a tap on a suggestion opens a lot
- [ ] #2 Suggestions, the not-found line and the outside-Toronto line appear under the box below a thin grey line; no Select button
- [ ] #3 The box is empty on return from a report and the list clears on the first delete
- [ ] #4 The semi question reads: Is this a semi? and the answers are not larger than the question
- [ ] #5 Built to the mock the operator approved for this card
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
2026-11-25: mock APPROVED by the operator (RR-0487, MORNING-DECISIONS.md:2543, verbatim "465 Mock  approved"). Approved mock: ~/Buildo-scratch/lanes-20261125/mcfixv2-465/MOCK-465-approved.html sha256 05b387fa3304 (published https://claude.ai/artifact/NDup2QHQMFKcfLSo9Howk1). Seven states: at rest; typing with suggestions; Enter with more than one match; Enter with no match (No lot found); outside Toronto; Enter with one match (finding the lot); semi question (Is this a semi?). The mock notes that sizes are close, not measured, and that the example street names and districts are illustrations.
<!-- SECTION:NOTES:END -->
