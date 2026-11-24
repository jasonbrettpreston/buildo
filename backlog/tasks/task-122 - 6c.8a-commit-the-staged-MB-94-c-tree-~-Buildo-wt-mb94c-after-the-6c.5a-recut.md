---
id: TASK-122
title: >-
  6c.8a commit the staged MB-94 (c) tree (~/Buildo-wt-mb94c) after the 6c.5a
  recut
status: BUILT
assignee:
  - '@lane-BL-T122'
created_date: '2026-11-19T04:57:00Z'
updated_date: '2026-11-24T18:40:00Z'
due_date: '2026-11-26'
labels:
  - dead
milestone: m-8
dependencies:
  - TASK-62
  - TASK-121
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#6c/6c.8a
  - .husky/pre-commit#L55 sha256=85f33f61e912
  - >-
    ~/Buildo-scratch/lanes-20261117/inc-plan/6/BUILD-PASS.md#L1
    sha256=1f885a4c8126
  - docs/reports/lanes/2026-11-19/BL-T122/REPORT.md
documentation:
  - backlog/docs/increments/doc-9 - Increment-6c-requirements.md
priority: high
type: build
project: McIncrement
ordinal: 9039
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: [object Object]

Plan text at the snapshot: BLOCKED by 6c.5a (R-B) and WAITING on 6.43
landingPush: push 7
slicePart: (3)/(5) producer, no-row state (MB-94 c)
who (plan text): lane

Files: .cursor/MCBYLAWS-QUEUE.md, backlog/tasks/task-122 (this task file), docs/reports/lanes/2026-11-19/BL-T122/REPORT.md
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
1. Verify the feat commit 40cbd77b1 holds the five recut files and goldens by reading; rerun the five --check generators. 2. Compare the old staged tree (~/Buildo-wt-mb94c, read-only) with the commit; name any file or hunk absent here. 3. One dated M-246 note on the MB-94 row of .cursor/MCBYLAWS-QUEUE.md (status line unchanged). 4. Add Files: line to the task description. 5. One docs commit with Task: task-122 through the hooks; commit.out. 6. Copy REPORT.md to docs/reports/lanes/2026-11-19/BL-T122/, add-ref. 7. Close: check ACs with evidence or not-applicable notes, final summary, -s BUILT.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Dated note 2026-11-19 (M-246, prior text kept; RR-0301 · task-122 · Backlog; operator, verbatim: "task 341 approved")

2026-11-19 taken on the board at lane launch (lane BL-T122, worktree /Users/brettpreston_macmini/Buildo-wt-t122, branch wf2/inc1b-t122), RR-0240

AC evidence (record-only task): AC 1,2,4,5,6,7,8 are imported generic criteria that do not apply: no code, no new red/green, no new panel or prereg; the content (recut, red.out, review, output record) landed under task-121 (commit 40cbd77b1; reports docs/reports/lanes/2026-11-19/BL-MB94C/). AC 3: write scope declared in BRIEF.md (~/Buildo-scratch/lanes-20261119/inc1b/t122/BRIEF.md, Write scope section). Real work evidence: docs/reports/lanes/2026-11-19/BL-T122/REPORT.md (five --check generators rerun clean, old staged tree compared, MB-94 row note).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Record-only. Part (c) verified committed as 40cbd77b1 (task-121, BL-MB94C): five recut files plus 105 regenerated goldens; five --check generators rerun clean; old staged tree ~/Buildo-wt-mb94c holds nothing the recut lacks except the superseded stamp/gate narrowing and the period in the sentence. One dated M-246 note added on the MB-94 row of .cursor/MCBYLAWS-QUEUE.md (status line unchanged). Not pushed. Commit sha in the lane final message. Report: docs/reports/lanes/2026-11-19/BL-T122/REPORT.md
<!-- SECTION:FINAL_SUMMARY:END -->
