---
id: TASK-328
title: >-
  Mis-typed address routes to no-match, not candidates: keep B.9 for 1·B or add
  a typeahead-retry task?
status: DONE
assignee: []
created_date: '2026-11-19T15:38:00Z'
updated_date: '2026-11-24T18:41:00Z'
labels:
  - dead
milestone: m-1
dependencies: []
references:
  - docs/reports/lanes/2026-11-19/BL-ROUTE/REPORT.md
  - src/lib/parcel-lookup.ts#L286
type: decision
project: McIncrement
ordinal: 30012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Grounded: yes - the task-318 title and RR-0182 send a mis-typed address to the candidates page, but a mis-typed street (41 Derwin Road, SAMPLES.md row 7) resolves to no_match: exact 0, typeahead on DERWIN% 0, unlinked 0, and no fuzzy matching rule exists (parcel-lookup.ts:286); the routing test pins it as it.todo (search-routing.logic.test.ts). Recommendation (lane BL-ROUTE, UNVERIFIED): keep the B.9 no-match message for 1·B and make a typeahead-retry on a miss its own task with designed copy (design scope, RR-0233).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Operator word recorded through G2; the mis-typed-address behaviour for 1·B is set (keep the B.9 no-match message, or a typeahead-retry task with designed copy)
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
2026-11-19 decision-80 (RR-0277) entered through G2; resolved by task-333

2026-11-23 McFixReborn record check (RR-0437): AC1 met: decision-80 and task-333 exist.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Operator 2026-11-19 (RR-0277, decision-80): the search miss uses the permit pipeline address-spec matcher, the same module; build task task-333 SRCH.FUZZY
<!-- SECTION:FINAL_SUMMARY:END -->
