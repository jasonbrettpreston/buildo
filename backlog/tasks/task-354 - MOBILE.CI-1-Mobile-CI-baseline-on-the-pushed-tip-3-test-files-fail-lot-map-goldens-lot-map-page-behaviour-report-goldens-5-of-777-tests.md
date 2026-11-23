---
id: TASK-354
title: >-
  MOBILE.CI-1 Mobile CI baseline on the pushed tip: 3 test files fail (lot map
  goldens, lot map page behaviour, report goldens), 5 of 777 tests
status: RUNNING
assignee:
  - '@lane-BL-MOBILECI'
created_date: '2026-11-19T21:37:00Z'
updated_date: '2026-11-23T16:06:00Z'
labels:
  - McFixReborn
milestone: m-1
dependencies: []
references:
  - docs/reports/lanes/2026-11-20/BL-MOBILECI/REPORT.md
  - docs/reports/lanes/2026-11-20/BL-MOBILECI/TRIAGE.md
  - docs/reports/lanes/2026-11-20/BL-MOBILECI/causes.md
type: build
ordinal: 54012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Scope now: find the cause of each failure and fix it. GitHub Mobile CI run 44619210752 on wf1/mb-rulings at 78f552fbb (log saved: ~/Buildo-scratch/lanes-20261119/inc1b/mobileci/run-44619210752.log): __tests__/lotMapScreens.golden.test.ts (TypeError reading 'children'), __tests__/lotMapPage.behaviour.test.tsx (Continue reads Choose a lot and is disabled; map props; unlinked message), __tests__/reportScreens.golden.test.ts (MF-48 mobile REPORT props goldens T1 expected 18 received 65; T3). The mobile tests are not run by the commit hook nor the push station; the operator ruled they run by the GitHub job's manual trigger. Files: mobile/__tests__/, mobile/src/, scripts/surfaces/
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 each of the 5 failing tests has a stated cause with file:line and the commit that introduced it
- [ ] #2 the fix is committed; Mobile CI green on the pushed branch is the proof (run id recorded)
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
1. Cause per failing case with file:line and commit (causes.md; 18 cases, none a code defect). 2. Fix the stale pins and wrong tests without weakening a check; regenerate the five report golden props members with the binding's own output; dated comments. 3. Review round r1 (plan and diff), TRIAGE.md. 4. Commit; checks before and after; grounder owed; AC2 waits for the Mobile CI run after the next push.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-19 taken on the board at lane launch (lane BL-MOBILECI, worktree /Users/brettpreston_macmini/Buildo-wt-mobileci, branch wf1/inc1b-mobileci), RR-0240

2026-11-20 taken on the board at lane launch (lane BL-MOBILECI, worktree /Users/brettpreston_macmini/Buildo-wt-mobileci, branch wf1/inc1b-mobileci), RR-0240

2026-11-20 lane BL-MOBILECI: Mobile CI run 44741125636 (3a36e8b26): 6 files, 18 of 786 tests. Every case classified, cause with file:line and commit in docs/reports/lanes/2026-11-20/BL-MOBILECI/causes.md; none is a code defect (stale pins and wrong tests; 5 report golden props members regenerated with the binding's own output). No test deleted, skipped or loosened. AC2 waits for the Mobile CI run after the next push. Grounder owed.
<!-- SECTION:NOTES:END -->
