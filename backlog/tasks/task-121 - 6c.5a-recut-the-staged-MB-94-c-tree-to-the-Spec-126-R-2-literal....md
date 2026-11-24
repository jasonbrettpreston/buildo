---
id: TASK-121
title: 6c.5a recut the staged MB-94 (c) tree to the Spec 126 R-2 literal...
status: BUILT
assignee:
  - '@lane-BL-MB94C'
created_date: '2026-11-19T04:57:00Z'
updated_date: '2026-11-24T18:40:00Z'
due_date: '2026-11-26'
labels:
  - dead
milestone: m-8
dependencies:
  - TASK-62
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#6c/6c.5a
  - >-
    docs/specs/02-web-admin/126_maxbld_surface_standard.md#L809
    sha256=1450c465e13b
  - >-
    ~/Buildo-scratch/lanes-20261117/inc-plan/6/BUILD-PASS.md#L1
    sha256=1f885a4c8126
  - docs/reports/lanes/2026-11-19/BL-MB94C/REPORT.md
documentation:
  - backlog/docs/increments/doc-9 - Increment-6c-requirements.md
priority: high
type: build
project: McIncrement
ordinal: 9038
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: 6c.5a recut the staged MB-94 (c) tree to the Spec 126 R-2 literal (not_in_engine_population on every no-row lot)

snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: [object Object]

Plan text at the snapshot: READY to author after push 6 (hook runs the suite); no ruling needed
landingPush: push 7
slicePart: (3)/(5) producer, no-row state (MB-94 c)
who (plan text): lane
Files: src/lib/admin/report-preview-live/project.ts, scripts/surfaces/_schema/seed-report-v2.mjs, scripts/surfaces/_schema/report-presentation.json, src/tests/admin-report-preview-live.logic.test.ts, src/tests/surfaces/engine-inputs-bind.logic.test.ts, src/tests/fixtures/surfaces/report/, src/tests/fixtures/report-page/, scripts/surfaces/parcel_product/F06/surfaces/web_landing.sample.json, .cursor/MCFRONTEND-QUEUE.md, docs/reports/reviews/task-121/, docs/reports/lanes/
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Pre-register the expected moves, committed alone — "Pre-register the task's `rules[]` and expected moves" (.cursor/MCBYLAWS-QUEUE.md:109)
- [x] #2 Failing tests are written into the plan and reviewed at plan altitude — "are written INTO the plan and reviewed at PLAN altitude" (docs/specs/00-architecture/08_agents.md:465)
- [x] #3 `write_scope` declared in the brief — "The brief file opens with a front-matter block" (docs/specs/00-architecture/08_agents.md:144)
- [x] #4 PLAN panel run with the lens set, never one generic pass — "NEVER run one generic pass" (docs/specs/00-architecture/08_agents.md:334)
- [x] #5 Fold validated by a grounder that re-executes every claim — "one grounder re-executes every claim in the fold" (docs/specs/00-architecture/08_agents.md:458)
- [x] #6 Built red first, then green, on the tip — "Red tests first, then the code, through the real hooks." (docs/specs/00-architecture/08_agents.md:490)
- [x] #7 OUTPUT panel record committed with the work — "is committed with the work (R-KM)." (.cursor/MCBYLAWS-QUEUE.md:116)
- [x] #8 McFrontend build only: queue row first — "No McFrontend work starts without its row in" (docs/specs/02-web-admin/126_maxbld_surface_standard.md:72)
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
1. Tests red first (R-2 cases both directions incl. unstamped and gated no-row lots; new engine-inputs-bind lock); red.out via commit attempt. 2. Re-apply project.ts, seed-report-v2.mjs and its json by hand to the literal: reason on every option of a lot with stored.length===0. 3. Regenerate by script, run all generator checks. 4. Green commit with Task trailer. 5. Output review one lens, triage. 6. Reports to docs/reports/lanes. 7. Close with --check-ac evidence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-19 taken on the board at lane launch (lane BL-MB94C, worktree /Users/brettpreston_macmini/Buildo-wt-mb94c2, branch wf1/inc1b-mb94c), RR-0240

Dated note 2026-11-19 (M-246, prior text kept; RR-0301 · task-121 · Backlog; operator, verbatim: "task 341 approved")
BLOCKED at the commit gate (lane BL-MB94C 2026-11-19): recut is built and green on the related run (3 files, 102 tests) but the commit is refused by the McBylaws frontend arm: FAIL:C:no-mf-task (needs a 'McFrontend-Task: MF-nn' trailer; scripts/analysis/mcbylaws/cite-arms.mjs:150) and FAIL:P:no-record (panel.mjs:82-84, a prereg record for that MF task). No MF id was given in the brief; lane stopped per BRIEF.md:10. Tree is staged and uncommitted in ~/Buildo-wt-mb94c2; patch at ~/Buildo-scratch/lanes-20261119/inc1b/mb94c/recut-staged.patch.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Recut landed in 56945a128 (code, tests, regenerated json and goldens, MF-85 queue note), reports in 91d742029. Hook: related run 102 tests passed, POLICY CHECKS OK. Departure fixed: staged tree required a stamp and no gate; literal is stored.length===0. All --check generators clean. Filed under MF-85 by orchestrator reading (not an operator ruling). AC 1,5,8 imported generic: not applicable to this recut (no new prereg or panel record by order; MF-85 records exist).
<!-- SECTION:FINAL_SUMMARY:END -->
