---
id: TASK-5
title: >-
  CHK.8 Task status from evidence: PLANNED / READY / BUILT / VERIFIED /
  REHEARSED /...
status: DONE
assignee:
  - '@lane-BL-CHK8'
created_date: '2026-11-19T04:57:00Z'
updated_date: '2026-11-24T18:41:00Z'
due_date: '2026-11-26'
labels:
  - dead
milestone: m-0
dependencies: []
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#F/CHK.8
  - ~/Buildo-scratch/lanes-20261117/checks/REPORT.md sha256=11bfda56fd34
  - >-
    ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L725
    sha256=a12f15596694
  - >-
    ~/Buildo-scratch/lanes-20261117/inc-plan/checks/PANEL.md#L2
    sha256=b30b7f626bca
  - docs/reports/lanes/2026-11-19/BL-CHK8/REPORT.md
documentation:
  - backlog/docs/increments/doc-1 - Increment-F-requirements.md
priority: low
type: build
project: McIncrement
ordinal: 1009
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: CHK.8 Task status from evidence: PLANNED / READY / BUILT / VERIFIED / REHEARSED / LANDED / DONE computed by status-evidence.mjs from commits, task-bound pass files and section 10; no-evidence tasks and queue rows that disagree are flagged (Spec 137 rule 3, on origin/wf1/mb-rulings)

snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: MEASURED 1.9 s over 313 tasks; build GUESS 0.5 d

Plan text at the snapshot: NOT COMPLETE: OPEN: the plan lives in scratch beside the repo queues; proposal: the repo queues (Spec 137) are the plan and the board is generated from them; in the Increment 1·A panel
slicePart: measured check
planNote: reuse: status NOT COMPLETE: OPEN: the plan lives in scratch beside the repo queues; proposal: the repo queues (Spec 137) are the plan and the board is generated from them; in the Increment 1·A panel ((operator 2026-11-18, MORNING-DECISIONS.md:744 "Add to the named list.." and :750 "yes to re-use obviosouly, yes drop"; shape decided by the Increment 1·A panel, lanes-20261117/inc1a-review/p1))
who (plan text): lane
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Pre-register the expected moves, committed alone — "Pre-register the task's `rules[]` and expected moves" (.cursor/MCBYLAWS-QUEUE.md:109)
- [x] #2 Failing tests are written into the plan and reviewed at plan altitude — "are written INTO the plan and reviewed at PLAN altitude" (docs/specs/00-architecture/08_agents.md:465)
- [ ] #3 `write_scope` declared in the brief — "The brief file opens with a front-matter block" (docs/specs/00-architecture/08_agents.md:144)
- [ ] #4 PLAN panel run with the lens set, never one generic pass — "NEVER run one generic pass" (docs/specs/00-architecture/08_agents.md:334)
- [ ] #5 Fold validated by a grounder that re-executes every claim — "one grounder re-executes every claim in the fold" (docs/specs/00-architecture/08_agents.md:458)
- [x] #6 Built red first, then green, on the tip — "Red tests first, then the code, through the real hooks." (docs/specs/00-architecture/08_agents.md:490)
- [x] #7 OUTPUT panel record committed with the work — "is committed with the work (R-KM)." (.cursor/MCBYLAWS-QUEUE.md:116)
- [ ] #8 McFrontend build only: queue row first — "No McFrontend work starts without its row in" (docs/specs/02-web-admin/126_maxbld_surface_standard.md:72)
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 The rule the task rests on is quoted with file:line in the task, or the task is a card for the missing rule — "Quote the rule first" (.cursor/MCBYLAWS-QUEUE.md:107)
- [x] #2 The tests were written first and proven red, then green — "Every lock is proven in BOTH directions" (docs/specs/00-architecture/08_agents.md:462)
- [x] #3 The work is committed through the real hooks, none bypassed — "Red tests first, then the code, through the real hooks." (docs/specs/00-architecture/08_agents.md:490)
- [x] #4 The named test is green before the task is called done — "Never declare a task done until" (CLAUDE.md:32)
- [ ] #5 Any operator ruling the task needed is recorded verbatim as a dated note or a decision-log row — "A ruling enters a row as a verbatim dated note." (docs/specs/00-architecture/137_mcqueue.md:109)
- [x] #6 The task file and its queue row are updated in the same commit as the work — "The status line changes in the same commit as the work." (docs/specs/00-architecture/137_mcqueue.md:84)
- [ ] #7 DONE carries its evidence (commit sha, test, hook result) — "The work landed and the evidence exists" (docs/specs/00-architecture/137_mcqueue.md:63)
- [x] #8 Nothing was added that the card or ruling did not name — "no change adds a tool, field or rule its card or ruling did not name" (docs/specs/01-pipeline/124a_step_standard_policy_appendix.md:988)
- [ ] #9 The principles the task serves are named — "Each task names the ones it serves." (.cursor/MCBYLAWS-QUEUE.md:104)
- [ ] #10 The close-out reply ends with one STATUS line and at most one question — "Every reply ends with one line" (docs/specs/00-architecture/08_agents.md:505)
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Red test first (temp repos; commit attempt = red.out). 2. Script reads task files (backlog-lib readItems) and git log trailers over HEAD and the range. 3. Finding a: BUILT/DONE with no Task: commit; docs-only close = WARN. 4. Finding b: trailer names a task not RUNNING at that commit (BUILT/DONE ok only on its closing commit). 5. One line per finding, summary, exit 1/0, header says not a hook. 6. Green commit through hooks, typecheck, output review, run on branch, reports into repo.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-19 relevancy pass (R7, RR-0214): KEPT: not replaced by BL.0 (.cursor/active_task.md planNote); status from evidence stays its own check (BL.0 loads status, it does not compute it).

2026-11-19 relevancy pass 2 (R9, after R8, RR-0219 and RR-0214; review r1 triaged in docs/reports/lanes/2026-11-19/BL-R9/TRIAGE.md): CHANGED, narrowed (R7b said KEPT): status words are the Backlog statuses (backlog/config.yml:3), backlog-next.mjs (BL.0 3002ef51c, R8a 40aecea1c) lists what to take, and ~/Buildo-scratch/queues-20261113/status-evidence.mjs does not exist (never built). G3 (check-backlog-task.mjs:25-33) never reads a task status, which is the remaining gap. Scope now: one read-only repo check that flags a task at BUILT or DONE with no commit carrying its Task: trailer, and a Task: trailer naming a task that is not RUNNING; no seven-word computed status, no queue-row comparison (the plan lives in Backlog, RR-0205).

2026-11-19 taken on the board at lane launch (lane BL-CHK8, worktree /Users/brettpreston_macmini/Buildo-wt-chk8, branch wf1/inc1a-chk8), RR-0240

2026-11-19 lane BL-CHK8: check built at scripts/analysis/backlog-status-check.mjs (test src/tests/backlog/backlog-status-check.logic.test.ts). Review r1 (plan) and r2 (output, lens git range edge cases and exit codes) triaged in docs/reports/lanes/2026-11-19/BL-CHK8/TRIAGE.md; KEPT fixes: exit 2 on a non-repo root or a range outside HEAD, annotated trailers, empty diff not docs-only.
Dated note 2026-11-19 (M-246, prior text kept; RR-0248 · task-5 · Backlog; operator, verbatim: "y - this is a major improvement")

2026-11-19 DONE: closing commits on origin/wf1/mb-rulings (push windows 3 and 4: 62de20da0, 7b8381cfd; station PASS); evidence per the task's final summary
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
backlog-status-check.mjs landed in bb4a1e164 and 5659d682d; 12 tests green through pre-commit; red in red.out; run on branch: 2 findings, 21 warnings
<!-- SECTION:FINAL_SUMMARY:END -->
