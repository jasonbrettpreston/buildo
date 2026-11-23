---
id: TASK-396
title: >-
  FIX.MASSING The two massing thresholds become registered settings (20 and 60
  square metres)
status: RUNNING
assignee:
  - '@lane-BL-MASSING'
created_date: '2026-11-20T15:54:00Z'
updated_date: '2026-11-23T16:06:00Z'
labels:
  - McFix
  - McFix A
  - McFixReborn
milestone: m-1
dependencies:
  - TASK-378
references:
  - docs/reports/lanes/2026-11-20/BL-MASSING/REPORT.md
type: fix
ordinal: 96012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the lens set and confirmed by the separate grounder on task-378 (2026-11-20): src/lib/massing/geometry.ts:27 SHED_THRESHOLD_SQM = 20 and :30 GARAGE_MAX_SQM = 60 are typed in code (used at :64-65) against Spec 126 P4 (:189 'All tunables are data; zero thresholds in src/'). Operator, 2026-11-20, verbatim: 'you need to resolve these?' (orchestrator reading: resolve both). This code predates Increment 1·B. Scope: the two values become registered pinned settings read the way task-372 registered the lot-size window (src/lib/report-projection/pinned-settings.ts), values unchanged; the existing locks src/tests/massing.logic.test.ts:88-89 and src/tests/link-massing.infra.test.ts:84-85 are updated only to follow the new source, never weakened; the settings file must NOT reach a browser bundle (src/components/permits/BuildingMassing.tsx is a client component: follow whatever task-378 lands for the length factor). Owed with it: the DB mirror migration for the new settings (number from the ID ledger; the operator's typed GO), together with the one owed from task-372. The settings seed file has no rule-list row today: the lane reports that, it does not skip the list. After task-378 folds. Files: src/lib/massing/geometry.ts, src/tests/massing.logic.test.ts, src/tests/link-massing.infra.test.ts
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
1. Prove by git grep over src, mobile, scripts that nothing at run time calls or imports classifyStructure, SHED_THRESHOLD_SQM, GARAGE_MAX_SQM from src/lib/massing/geometry.ts (only src/tests/massing.logic.test.ts does; the scripts/lib/compute/link-massing.js classifyStructure is a separate function taking thresholds as arguments from the registered seed rows). 2. Red test first: in src/tests/link-massing.infra.test.ts add one test that src/lib/massing/geometry.ts holds none of the three names (fails today). Red = commit attempt with only that test and the task file staged (red.out). 3. Green: delete the three names and the now-unused StructureType import from geometry.ts, delete the classifyStructure describe block and its three imports from src/tests/massing.logic.test.ts. 4. Retain the existing compute lock at link-massing.infra.test.ts:84-85 unchanged (it guards the registered source); add the new src lock beside it. Storey heights (STORY_HEIGHT_M, STORY_HEIGHT_BY_USE_TYPE) left alone, listed only. No registration, no migration, milestone left alone. 5. Lens set at plan and output, FINDINGS.md untriaged, grounder owed, task left RUNNING.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Operator 2026-11-20, verbatim: "Let the grounder resolve them all as long as the result is compliant" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1476). Resolved by the separate grounder's recommendation of 2026-11-20: do NOT register anything: the registered source exists (seed rows massing_shed_threshold_sqm and massing_garage_max_sqm, read by scripts/lib/compute/link-massing.js); the src copy (classifyStructure, SHED_THRESHOLD_SQM, GARAGE_MAX_SQM in src/lib/massing/geometry.ts) has no caller outside tests: delete it and its test block (src/tests/massing.logic.test.ts near :63-90); keep the lock in src/tests/link-massing.infra.test.ts or state what replaces it. The lane first proves by grep that nothing at run time calls it. The grounder recommends moving this card out of Increment 1·B (permits code older than the increment): the milestone move goes by the ruling record. Also found, not in this task: typed storey heights in the same file that the live permits route uses.

2026-11-20 taken on the board at lane launch (lane BL-MASSING, worktree /Users/brettpreston_macmini/Buildo-wt-massing, branch wf1/inc1b-massing), RR-0240

2026-11-20 BL-MASSING: grep over src, mobile, scripts found no run-time caller or importer of the src classifyStructure, SHED_THRESHOLD_SQM or GARAGE_MAX_SQM (only src/tests/massing.logic.test.ts); scripts/lib/compute/link-massing.js has its own classifyStructure taking the registered seed values as arguments. Deleted them and the test block; the compute lock (link-massing.infra.test.ts:84-85) is retained and a src lock added beside it. Storey heights (STORY_HEIGHT_M, STORY_HEIGHT_BY_USE_TYPE) left alone. Lens outputs in docs/reports/lanes/2026-11-20/BL-MASSING/, findings untriaged, grounder owed.

2026-11-20 follow-up: the settings seed scripts/seeds/logic_variables.json has no rule-list row; owner task-406 (V2.LIST, which replaced task-403). B13 in src/tests/massing.logic.test.ts gained three value assertions on the compute classifyStructure (10,[10] primary; 80,[150,80] other; 100,[100,100] primary). The description's quote 'you need to resolve these?' was not found by grep in MORNING-DECISIONS.md.

Step 4 audit by a separate grounder 2026-11-20 (file ~/Buildo-scratch/lanes-20261119/inc1b/retro/STEP4-LEDGER.md, sha256 d88e7548d70f…): of this task CONFIRMED and CONFLICT findings, 11: 2 fixed, 9 owned elsewhere (8 storey-height CONFLICTs by task-409, unbuilt; the seed rule-list row by task-406), 0 unaddressed.
<!-- SECTION:NOTES:END -->
