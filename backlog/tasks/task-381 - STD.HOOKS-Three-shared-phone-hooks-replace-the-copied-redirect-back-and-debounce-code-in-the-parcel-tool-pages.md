---
id: TASK-381
title: >-
  STD.HOOKS Three shared phone hooks replace the copied redirect, back and
  debounce code in the parcel-tool pages
status: RUNNING
assignee:
  - '@lane-BL-HOOKS3'
created_date: '2026-11-20T15:08:00Z'
updated_date: '2026-11-24T14:42:00Z'
labels:
  - McFix
  - McFix B
  - dead
milestone: m-1
dependencies: []
references:
  - docs/reports/lanes/2026-11-20/BL-HOOKS3/REPORT.md
type: build
ordinal: 81012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Plan section B1. Page-runner measurement: redirect-once-on-settled, back-with-canGoBack and retry-to-refetch are each written four times (index.tsx:96-105, disambiguate.tsx:36-40, semi-question.tsx:49-53, [parcelId].tsx:29-33); debounce timer at index.tsx:41-44. Build useSettledRedirect, useGoBack, useDebouncedValue in the form of the nearest existing hook; one test that a background fetch cannot re-fire the redirect; no behaviour change; existing page tests assert unchanged. Phone-test green is proven only by Mobile CI. Operator 2026-11-20 (verbatim): "1. yes. add the tasks to incr 1b and remove the ones we dont need 2. fold ... d. just add the review enforcement not the others. e. fine". Plan: ~/Buildo-scratch/lanes-20261119/inc1b/enforce/PLAN-3-ONE-PLAN.md; reviewer evidence in ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md entries of 2026-11-20 (plan grounder; page-runner measurement; page-by-page schema check). Each gate or scan: a committed planted-defect test, red first through the real hooks; a separate agent attacks it, results reported as refused or STILL OPEN. Lens set with the rule lists whole and the rulings pasted; grounder launched by the orchestrator, never the lane. Files: mobile/src/hooks/useParcelLookup.ts, mobile/app/(app)/parcel-tool/index.tsx, mobile/app/(app)/parcel-tool/disambiguate.tsx, mobile/app/(app)/parcel-tool/semi-question.tsx, mobile/app/(app)/parcel-tool/[parcelId].tsx, docs/specs/03-mobile/100_mobile_parcel_cost_tool.md, mobile/src/hooks/useParcelPageHooks.ts, mobile/__tests__/parcelPageHooks.test.tsx, src/tests/search-routing.logic.test.ts
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Add useSettledRedirect, useGoBack, useDebouncedValue to mobile/src/hooks/useParcelLookup.ts (Files line; mounts may import only @/hooks). Replace the three identical settled-redirect copies (disambiguate, semi-question, [parcelId]), the four identical go-back copies, and the one debounce in index.tsx. index.tsx redirect effect is NOT the same code (route-keyed ref, reset on null, push + addRecent): left as is, reported. One new test file with the real hooks: background refetch cannot re-fire the redirect, plus back and debounce cases; red first via the pre-commit related run. No golden edited. Phone-test green only from Mobile CI. Full plan: docs/reports/reviews/task-381/context-2026-11-20.md (Lane plan section).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-20 taken on the board at lane launch (lane BL-HOOKS3, worktree /Users/brettpreston_macmini/Buildo-wt-hooks3, branch wf1/inc1b-hooks3), RR-0240

Operator ruling 2026-11-20 (same entry, item 1; his words: "yes to all"): the three shared hooks in task 381 are named per-feature code under Spec 126 section 11b.1, and the task-381 board row is their queue row.

2026-11-20 BL-HOOKS3: built in 5614c611b (test) and 5b744d820 (hooks + pages); index.tsx redirect left as code (not the same code); lens outputs and FINDINGS.md in docs/reports/lanes/2026-11-20/BL-HOOKS3/; grounder owed; phone-test green only from Mobile CI.

2026-11-20 BL-HOOKS3 doc fix after grounder: header cites corrected, Spec 100 Target Files lists the two new files (no behaviour change).

2026-11-23 RR-0435: one-line pin fix in src/tests/search-routing.logic.test.ts after the fold (the pin follows the shared hook); path added to the Files line.
<!-- SECTION:NOTES:END -->
