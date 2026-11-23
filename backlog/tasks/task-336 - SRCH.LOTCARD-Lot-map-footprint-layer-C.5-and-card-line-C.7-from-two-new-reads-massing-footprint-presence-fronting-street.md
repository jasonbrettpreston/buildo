---
id: TASK-336
title: >-
  SRCH.LOTCARD Lot map: footprint layer C.5 and card line C.7 from two new reads
  (massing footprint presence, fronting street)
status: BUILT
assignee:
  - '@lane-BL-LOTCARD'
created_date: '2026-11-19T15:57:00Z'
updated_date: '2026-11-23T16:06:00Z'
labels:
  - S
  - plan:SRCH.LOTCARD
  - McFixReborn
milestone: m-1
dependencies:
  - TASK-12
references:
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L1099
  - ~/Buildo-scratch/mcfrontend/small-pages-v8/choose-lot.html#L306
  - docs/reports/lanes/2026-11-19/BL-GAP13/REPORT.md
  - src/lib/lot-map.ts#L26
  - docs/reports/lanes/2026-11-19/BL-LOTCARD/REPORT.md
type: build
project: McIncrement
ordinal: 37012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator 2026-11-19 (RR-0284, decision-84): "if it a small change lets do it - we have the data - why not". Grounded: yes - choose-lot.html:306 names the two card fields; neither is in the 14-entry map descriptor whitelist (search-follow-ups.logic.test.ts) nor in CONSUMER_MAP_COLS (lot-map.ts:26, locked by consumer-parcel-lookup.infra.test.ts:208); the data exists (massing join; primary_frontage_street_name). Recommendation: one build task after the data check; UNVERIFIED until its review round.

RR-0289 (MORNING-DECISIONS.md:1117): massing is reliable for presence only; a footprint reads 'has the house', none reads 'no building'.
Files: src/lib/parcels/lot-map.ts, src/lib/parcels/consumer-lookup.ts, src/app/api/parcels/lookup/types.ts, mobile/src/lib/schemas.ts, mobile/src/components/surfaces/LotMapBinding.tsx, mobile/src/constants/lotMap.ts, mobile/src/generated/surfaces/, mobile/__tests__/fixtures/, scripts/surfaces/parcel_product/F01/surfaces/, scripts/surfaces/_schema/census/mobile-product.json, scripts/steps/_schema/src-sql-ledger.json, scripts/analysis/lot-map-data-check.mjs, src/tests/, docs/reports/, .cursor/MCFRONTEND-QUEUE.md, backlog/
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 DATA CHECK on the rehearsal stack first: for the SAMPLES.md multi-lot addresses, the massing join returns footprint presence and primary_frontage_street_name is populated; counts pasted
- [x] #2 CONSUMER_MAP_COLS (lot-map.ts:26) and the map descriptor field whitelist gain the two fields, with their both-way lock tests updated (red first)
- [x] #3 C.5: the building footprint drawn on each matched lot when massing returns one; C.7: the card line says which street the lot faces always and "has the house" only when a footprint is present; nothing about the house where massing is missing; goldens by the repo scripts
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
Per context-2026-11-19.md 'Plan steps under review (lane BL-LOTCARD)': red tests (lock both ways, whitelist, content, goldens, data-check script), then two reads in the one lot SELECT, schemas, binding, content, goldens by scripts, data-check script; C.5 as footprint presence fill tier (geometry is a follow-up); C.7 lead without house wording where massing is missing.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-19 taken on the board at lane launch (lane BL-LOTCARD, worktree /Users/brettpreston_macmini/Buildo-wt-lotcard, branch wf1/inc1b-lotcard), RR-0240

RR-0289 (MORNING-DECISIONS.md:1117) supersedes plan step 4: footprint -> 'has the house', none -> 'no building', presence only. Cite carried into the context file, the MF-53 dated note and the content keys.

AC1: data check script written (scripts/analysis/lot-map-data-check.mjs); orchestrator runs it on the rehearsal stack. AC2/3 evidence: commits d03adc2b7, 6140a6867; goldens 'lotmap goldens ok (11)'.

2026-11-19 DATA CHECK run by the orchestrator on the rehearsal stack (127.0.0.1:55322, read-only, dblock-teststack empty): node scripts/analysis/lot-map-data-check.mjs on the SAMPLES.md multi-lot address 26 Kenneth Ave: 5112332 footprint=true primary=true street="Kenneth Ave"; 5427844 footprint=true primary=true street="Kenneth Ave"; {"lots":2,"with_footprint":2,"no_building":0,"with_primary_footprint":2,"with_street":2}. One address only (the sample set has one multi-lot case); a wider sample is a follow-up when more multi-lot addresses are listed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Built on wf1/inc1b-lotcard (d03adc2b7, 6140a6867, unpushed): two reads in the one lot SELECT, CONSUMER_MAP_COLS and whitelist 14 to 16 with both-way locks, C.5 footprint-presence fill tier (geometry is a follow-up), C.7 lead per RR-0284/RR-0289, data-check script. AC1 open for the orchestrator.
<!-- SECTION:FINAL_SUMMARY:END -->
