---
id: TASK-372
title: >-
  FIX.PROJ Report projection: freshness compares the whole stamp; the sq ft
  factor and the lot-size window are settings; a property test on rounding (D1,
  D2, D9, D6)
status: RUNNING
assignee:
  - '@lane-BL-FIXPROJ'
created_date: '2026-11-20T13:33:00Z'
updated_date: '2026-11-25T13:57:00Z'
labels:
  - dead
milestone: m-1
dependencies: []
references:
  - docs/reports/lanes/2026-11-20/BL-FIXPROJ/REPORT.md
  - docs/reports/lanes/2026-11-20/BL-FIXPROJ/FINDINGS.md
  - docs/reports/lanes/2026-11-20/BL-FIXPROJ/D1-OPERATOR-DRAFT.md
type: build
ordinal: 72012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Source: grounder verdicts docs/reports/lanes/2026-11-20/BL-GROUND/VERDICTS-SUMMARY.md and GROUNDER.md (task-368), on the handbook pass of the pushed 1·B change. Operator 2026-11-20 (verbatim): "essential we have a non compliance build again - the entire reason for this approach". Scope now: D1 src/lib/report-projection/project.ts:180-182 compares table_version, catalogue_sha, switchboard_sha only; settings_sha is stored (:38) and never compared; the evaluator version is not compared (McStorage P3; ruling MORNING-DECISIONS.md:704): add both to the freshness compare with a red-first test that injects an older-stamp record; where the CURRENT settings sha and evaluator version come from is a design point: if no existing source is found, stop on D1 and bring it as an operator draft. D2 src/lib/report-projection/format.ts:14 SQFT_PER_M2 = 10.7639 typed in code against the operator ruling MORNING-DECISIONS.md:241 and Spec 136 fe.44: register the factor as a pinned setting and read it. D9 project.ts:76 the lot-size window 50 and 5000 typed (Spec 132 core.8): two registered variables. D6 format.ts:35 rounding has only example tests (engineering standards 12.12): one property test. Files: src/lib/report-projection/project.ts, src/lib/report-projection/format.ts, scripts/seeds/logic_variables.json
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each defect is confirmed on the head before fixing, with file:line
- [ ] #2 Tests red first, then green through the real hooks
- [ ] #3 Compliance lens run once per governing rule list with the list whole; a separate grounder verdict on file
- [ ] #4 No stored value changes for any golden lot (the goldens do not move, or each move is explained)
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
1. (AC1) Confirm D1, D2, D6, D9 on the head with file:line (done in the lane notes). 2. (AC2) Tests first, red through the pre-commit related run: D2 formatter reads the registered pinned variable parcels_sqm_to_sqft (no typed 10.7639); D9 window read from two registered pinned variables; D6 one fast-check property test on the sq ft rounding. D1 stopped: no stored-record evaluator_version column and no current-settings source readable in the pure compare; operator decision draft written. 3. Fixes green through the real hooks; the variables registry, estate literals, consumer registry and rule-map checks before and after. 4. (AC3) Lens set at plan and output with each rule list whole plus the pasted rulings; findings by id for a separate grounder. 5. (AC4) No golden or stored value moves: the factor and window values are unchanged.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-20 taken on the board at lane launch (lane BL-FIXPROJ, worktree /Users/brettpreston_macmini/Buildo-wt-fixproj, branch wf1/inc1b-fixproj), RR-0240

2026-11-20 fold round after the grounder ruling: lock restored, formatter imports nothing (factor passed in), geometry.ts SQM_TO_SQFT reads the same registered variable, pinnedWindow pair check tested. Owed: migration, number to be claimed by the orchestrator.

Operator 2026-11-20, verbatim: "Let the grounder resolve them all as long as the result is compliant" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1476). Resolved by the separate grounder's recommendation of 2026-11-20: no DB mirror migration is owed for maxbld_report_lot_size_implausible_min_sqm and _max_sqm: the seed loader inserts them at the next npm run migrate. The two seed descriptions that say a migration is owed are corrected under task-367's fix round or task-343.

Retro review by a separate grounder 2026-11-20 (task-405; file ~/Buildo-scratch/lanes-20261119/inc1b/retro/BL-FIXPROJ/RETRO-372-373.md), code as on the board: DEFECTS before a push: (1) D1 is NOT fixed: src/lib/report-projection/project.ts:185-187 compares table_version, catalogue_sha, switchboard_sha only; a record with an older settings or evaluator stamp reads current (owner: task-380 FIX.FRESH). (2) scripts/seeds/logic_variables.json:8197 and :8207 still say a migration is owed (none is: resolution on task-367); the same text in the generated registry doc and src/tests/control-panel.logic.test.ts:268. (3) the same seed lines and src/tests/report-projection-settings.logic.test.ts:3 cite MORNING-DECISIONS.md:738 for the 50 / 5,000 words; that line holds only 'ONE-13 a': cite backlog/decisions decision-37 (RR-0167). (4) twelve changed paths are outside the Files line. (5) src/components/admin/lead-inspector/CoaClassificationPanel.tsx:280 still types 10.764 (not listed anywhere). No lens output of this lane carries a REVIEW header: the whole lens set is owed through the review tool. D2, D9 hold; no golden moved.

Dated note 2026-11-25 (task-454 SEARCHFIX.6, work commit 42b4b7932; findings G2 D3 and K3, docs/reports/reviews/mcfixreborn-g2/GROUNDER-B.md D3 and GROUNDER-A.md K3; prior text kept): the two seed rows maxbld_report_lot_size_implausible_min_sqm and _max_sqm no longer say a DB mirror migration is owed (now: 'No DB mirror row is owed: the seed loader inserts the key at the next npm run migrate (task-372, MD:1476)'), and their cite reads 'ONE-13 a (MORNING-DECISIONS.md:738); the 50 and 5,000 words: backlog/decisions/decision-37 (RR-0167)'; the same cite fix is in src/tests/report-projection-settings.logic.test.ts and the 'owed' text is gone from src/tests/control-panel.logic.test.ts. The correction this card's notes said task-367 or task-343 would make is done here.
<!-- SECTION:NOTES:END -->
