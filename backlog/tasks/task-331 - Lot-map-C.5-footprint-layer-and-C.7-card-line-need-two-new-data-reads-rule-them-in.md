---
id: TASK-331
title: >-
  Lot map C.5 footprint layer and C.7 card line need two new data reads: rule
  them in?
status: OPERATOR
assignee: []
created_date: '2026-11-19T15:43:00Z'
labels:
  - S
  - open-decisions
milestone: m-1
dependencies: []
references:
  - docs/reports/lanes/2026-11-19/BL-GAP13/REPORT.md
  - ~/Buildo-scratch/mcfrontend/small-pages-v8/choose-lot.html#L306
type: decision
project: McIncrement
ordinal: 33012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Grounded: yes - choose-lot.html:306 names the lot-map card fields: building footprint presence (massing join) and primary_frontage_street_name; neither is in the map descriptor field whitelist (14 entries, pinned by search-follow-ups.logic.test.ts) and CONSUMER_MAP_COLS (lot-map.ts:26) is locked both ways by consumer-parcel-lookup.infra.test.ts:208. Recommendation (lane BL-GAP13, UNVERIFIED): rule the data read first with a DATA CHECK on the rehearsal stack; then one build task for C.5, C.7 and the card accessibility label. Storage and design scope (RR-0233).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Operator word through G2: the two data reads (footprint presence from the massing join; primary_frontage_street_name) are ruled into the lot-map consumer columns after a DATA CHECK on the rehearsal stack, then one build task covers C.5, C.7 and the card accessibility label
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
