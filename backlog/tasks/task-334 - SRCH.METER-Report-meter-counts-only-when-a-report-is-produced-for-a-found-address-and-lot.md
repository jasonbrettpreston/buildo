---
id: TASK-334
title: >-
  SRCH.METER Report meter counts only when a report is produced for a found
  address and lot
status: DONE
assignee:
  - '@lane-BL-METER'
created_date: '2026-11-19T15:44:00Z'
updated_date: '2026-11-23T16:06:00Z'
labels:
  - S
  - plan:SRCH.METER
  - McFixReborn
milestone: m-1
dependencies:
  - TASK-318
references:
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L1082
  - src/app/api/parcels/lookup/route.ts#L161
  - docs/reports/lanes/2026-11-19/BL-ROUTE/REPORT.md
  - docs/reports/lanes/2026-11-19/BL-METER/REPORT.md
type: build
project: McIncrement
ordinal: 35012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator 2026-11-19 (RR-0278, MORNING-DECISIONS.md:1082): "it shouldnt count the report unless the report is produced. I should only be charged a report if I find the address and lot Im looking for and a report is produced". Grounded: yes - for a parcel_tool holder the q lookup runs openReport at route.ts:161 before the semi question shows and before any report is produced (lane BL-ROUTE, task-318). Recommendation: move the meter call to the report production point; UNVERIFIED until the lane review round.

Files: src/app/api/parcels/lookup/route.ts, src/tests/parcel-lookup-gate.infra.test.ts, docs/reports/reviews/task-334/, docs/reports/lanes/
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The report meter (openReport) is called only when a report is produced for a found address and lot, not at the lookup; an unsure lot answering the semi question is not counted until its report is produced; one row per lot per month kept
- [x] #2 Red test first on the lookup route and the report route (a lookup that ends in candidates, no-match or the semi question counts nothing); the existing meter tests stay green
- [x] #3 The reports-left line (A.6) reads the same counter; no new field
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. (AC1) In route.ts keep the one openReport call, but gate it on a produced report: body.page !== null for a resolved lot, and not an unsure lot (lotForm.unsure) whose semi question comes first; the not_evaluated rule stays first. Lookup outcomes candidates, no-match, lot map, dangling id and semi question count nothing; one row per lot per month unchanged (openReport untouched).
2. (AC2) Red first: new cases in parcel-lookup-gate.infra.test.ts (page null hit counts nothing, semi question counts nothing, produced page counts once, second report same lot counts nothing more, q path and parcelId path); existing counted cases get a producer fixture so they stay green.
3. (AC3) The reports-left line reads readParcelToolUsage over usage_events, the same rows openReport writes; no new field, no schema change; existing T-usage tests stay green.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Output review r2 (lens double and missed counting): 2 KEPT test gaps (parcelId semi case, lot map case) added in the fix commit; no route defect. Files: src/tests/parcel-lookup-gate.infra.test.ts

2026-11-19 DONE: closing commits on origin/wf1/mb-rulings (push window 5: 78f552fbb at 16:56Z, station PASS 28367 tests)
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Meter call gated on a produced report (page sent) and a lot not awaiting its semi question; commits 7577c4e8b, c97b53448, 669de237d through the real hooks (gate file 50 passed); red 4 failed in red.out; A.6 reads the same usage_events, unchanged. Open: unsure-lot count after the answer (task-319); billing opens with MB-44.
<!-- SECTION:FINAL_SUMMARY:END -->
