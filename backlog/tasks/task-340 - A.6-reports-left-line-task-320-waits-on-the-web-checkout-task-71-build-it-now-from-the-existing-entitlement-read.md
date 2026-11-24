---
id: TASK-340
title: >-
  A.6 reports-left line (task-320) waits on the web checkout (task-71): build it
  now from the existing entitlement read?
status: DONE
assignee: []
created_date: '2026-11-19T20:13:00Z'
updated_date: '2026-11-24T14:42:00Z'
labels:
  - S
  - gap
  - plan:SRCH.A6
  - operator
  - McFixReborn
  - dead
milestone: m-1
dependencies: []
references:
  - .cursor/MCFRONTEND-QUEUE.md#L335
  - src/lib/entitlements/index.ts
  - docs/reports/lanes/2026-11-19/BL-METER/REPORT.md
priority: low
type: decision
ordinal: 40012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In plain words: the app search page is meant to show a line such as "6 of 10 reports left until 9 Dec 2026". That line (task-320 A.6) is held back waiting for the web checkout (task-71 MF-47: the Stripe price ids only the operator can supply), and the question is whether it can be built now without them.

Grounded: yes. task-320 text: "bound to the entitlement read (current_period_end, usage_events)". The read already exists and is built: GET /api/parcels/entitlement returns reportsLimit, reportsLeft, reportsLimitReached and resetsOn (src/app/api/parcels/entitlement/route.ts:4-7, types.ts:14-17) from readParcelToolUsage (src/lib/entitlements/index.ts:631-665); no page reads it yet (grep readParcelToolUsage|reportsLeft|resetsOn over src, mobile/src, mobile/app, scripts/surfaces: route, types, tests, descriptors, census, host-policy only). The meter lane found A.6 needs no new field (docs/reports/lanes/2026-11-19/BL-METER/REPORT.md:20). The monthly limit (the 10) is the setting parcel_tool_report_limit_plan (Basic; Pro 25, trial) read at src/lib/entitlements/index.ts:432-436 and set by migrations/322_mf47_checkout_plans.sql:50-61; the period end (9 Dec) is resetsOn from current_period_end (index.ts:538-548, :560), already written by the webhook (index.ts:184-192). The limit-reached refusal is 403 REPORT_LIMIT_REACHED (src/app/api/parcels/lookup/route.ts:18, :169; 429 is only rate limiting, :31). v8 draws the line at ~/Buildo-scratch/mcfrontend/small-pages-v8/search.html:267. MF-47 adds the Stripe checkout, the session action, the price-map entry and the CSP (.cursor/MCFRONTEND-QUEUE.md:335); its commits and migration 322 are already on origin and dev (:336); none of it feeds the line.

Recommendation: build A.6 now against the existing entitlement read, and drop task-320's dependency on task-71 once you approve (task-71 and the Stripe price ids stay where they are, LS.1 in m-2). Test it with fixture rows (Basic, Pro, trial). Pulls forward: nothing of MF-47, no price ids, no DB job; one design question for you when it is built: what the line shows for a user with no entitlement row (every field is null, types.ts:11-17), and the reset date falls back to the row's creation date when current_period_end is empty (index.ts:560). Verified by review r1 of task-339 (docs/reports/lanes/2026-11-19/BL-R13/r1-review.txt, TRIAGE.md); UNVERIFIED against the live database: the values 10 and 25 and "migration 322 applied on dev" are read from the migration file and the queue row, not queried (no database access in this lane).
<!-- SECTION:DESCRIPTION:END -->

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
Dated note 2026-11-19 (M-246, prior text kept; RR-0307 · task-340 · Backlog; operator, verbatim: "it appears we will need it so we should build it")
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Answered by the operator 2026-11-19 (RR-0307, decision-92): 'it appears we will need it so we should build it' (MORNING-DECISIONS.md:1182). A.6 (task-320) is built now from the existing entitlement read, compliant and researched first; task-320's dependency on task-71 is dropped; nothing of MF-47 checkout, no price ids, no DB job.
<!-- SECTION:FINAL_SUMMARY:END -->
