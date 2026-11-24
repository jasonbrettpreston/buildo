---
id: TASK-364
title: SRCH.HYGIENE-1 stale comments and cites left in built 1·B files
status: BUILT
assignee:
  - '@lane-BL-HYG'
created_date: '2026-11-19T22:30:00Z'
updated_date: '2026-11-24T14:42:00Z'
labels:
  - S
  - plan:SRCH.HYGIENE
  - McFixReborn
  - dead
milestone: m-1
dependencies:
  - TASK-320
references:
  - docs/reports/lanes/2026-11-19/BL-TRIAGE/VERDICTS.md
  - docs/reports/lanes/2026-11-19/BL-HYG/REPORT.md
type: build
project: McIncrement
ordinal: 64012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Scope now: small wrong statements left in built 1·B files: a stale comment on the entitlement route, a stale comment in lotForm.ts, the semi page header, and stale line cites on records. Findings RC-4, IN-2 (comment half), LX-C5 of docs/reports/lanes/2026-11-19/BL-TRIAGE/VERDICTS.md.

In plain words: a code comment says the line reads "N of 20 reports left" (the seeded allowances are 10, 10 and 25), another says the report applies the person's semi answer (nothing reads it yet), and the semi page header says Continue makes no extra request.

Cause (opened on head f65b64674): src/app/api/parcels/entitlement/route.ts:6 `Read by the search page line "N of 20 reports left"`; mobile/src/lib/lotForm.ts:9 "it travels as a route param to the report, which applies it through `lotFormEffective` (P5.7)" while git grep OVERRIDE_PARAM, lotFormOverride, lotFormEffective over mobile/app and mobile/src finds no reader outside lotForm.ts (the effect is task-209, 7.25).
Rule: no rule on comment accuracy was found (searched CLAUDE.md and docs/specs/00-architecture for "stale comment": not run, UNVERIFIED); this is a plain-correctness fix. RR-0273 (the shared footer carries the copyright) is the reason the part is skipped, so the shared copyright needs its own assertion.

Files: src/app/api/parcels/entitlement/route.ts, mobile/src/lib/lotForm.ts, mobile/app/(app)/parcel-tool/semi-question.tsx, docs/reports/lanes/

Added after the lens run: mobile/app/(app)/parcel-tool/semi-question.tsx header line 9 "so it makes no extra request" is true of the page's read but Continue now issues one answered lookup (LX-C5, NIT); reword to name that one call. Files gains that file.

Also (review r1 LOW, KEPT): correct the stale cites on records by dated note, not rewrite: task-343 line 15, task-348 :32 and the BL-METER report name report-page.ts:23-26 and route.ts:45/:161; on this head the switch is report-page.ts:54 and the meter branch is route.ts:163-171.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 git grep -n "of 20 reports" src/app/api/parcels/entitlement/route.ts prints nothing; git grep -n "[0-9]" on the header comment lines 5-7 of that file prints no allowance number (the seeded defaults are owned by the settings seed, not the comment)
- [x] #2 mobile/src/lib/lotForm.ts header says the answer travels as a route param and the report does not apply it yet (7.25, task-209)
- [x] #3 npm run typecheck is clean; no behaviour change
- [x] #4 mobile/app/(app)/parcel-tool/semi-question.tsx header reworded to name the one answered lookup (git grep -n "no extra request" prints nothing)
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
1. AC1: reword src/app/api/parcels/entitlement/route.ts header line 6 (comment only): the reports-left line of the app search page reads it; no allowance number. 2. AC2: reword mobile/src/lib/lotForm.ts header lines 8-9: the answer travels as a route param (OVERRIDE_PARAM) and the report does not apply it yet (7.25, task-209); no reader of lotFormEffective outside lotForm.ts. 3. AC4: reword mobile/app/(app)/parcel-tool/semi-question.tsx header line 9: opening reads the report's own cache entry (no extra request); Continue issues the one answered lookup. 4. Records cites: dated note by CLI on task-343 and task-348 (and a lane-report cite note) giving the cites on this head; no rewrite. 5. AC3: git diff filtered to comment lines only; npm run typecheck; checks before/after; plan and output compliance lens, adjudicated in TRIAGE.md. Red-first does not apply (comment-only).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-19 taken on the board at lane launch (lane BL-HYG, worktree /Users/brettpreston_macmini/Buildo-wt-hyg, branch wf1/inc1b-hyg), RR-0240

Comment lines changed in entitlement/route.ts:6, lotForm.ts:8-9, semi-question.tsx:9; diff proof: only // lines in source files; typecheck clean. Red-first not applicable (comment only).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Three header comments corrected (33a23f319); cites noted on task-343 and task-348; typecheck clean; hooks green.
<!-- SECTION:FINAL_SUMMARY:END -->
