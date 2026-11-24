---
id: TASK-329
title: 'Report meter counts an unsure lot before the semi question shows: intended?'
status: DONE
assignee: []
created_date: '2026-11-19T15:38:00Z'
updated_date: '2026-11-24T14:42:00Z'
labels:
  - S
  - open-decisions
  - McFixReborn
  - dead
milestone: m-1
dependencies: []
references:
  - docs/reports/lanes/2026-11-19/BL-ROUTE/REPORT.md
  - src/app/api/parcels/lookup/route.ts#L161
type: decision
project: McIncrement
ordinal: 31012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Grounded: yes - for a parcel_tool holder the q lookup runs openReport at route.ts:161 before the semi question page shows, so an unsure lot is counted on the report meter first; one row per lot per month, so no double count (lane BL-ROUTE, task-318). Recommendation (UNVERIFIED): confirm as intended for 1·B; if the meter must count only after the semi answer, that is a routing change for the semi page task (task-319).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Operator word recorded through G2: the report meter counting before the semi question is confirmed or changed
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
2026-11-19 decision-81 (RR-0278) entered through G2; resolved by task-334

2026-11-23 McFixReborn record check (RR-0437): AC1 met: decision-81 and task-334 exist.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Operator 2026-11-19 (RR-0278, decision-81): the report meter counts only when a report is produced for a found address and lot; build task task-334 SRCH.METER
<!-- SECTION:FINAL_SUMMARY:END -->
