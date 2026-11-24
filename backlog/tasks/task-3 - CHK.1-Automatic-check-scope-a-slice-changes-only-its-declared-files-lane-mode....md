---
id: TASK-3
title: >-
  CHK.1 Automatic check: scope (a slice changes only its declared files): lane
  mode...
status: DONE
assignee:
  - '@lane-BL-CHK1'
created_date: '2026-11-19T04:57:00Z'
updated_date: '2026-11-24T14:42:00Z'
due_date: '2026-11-26'
labels:
  - F
  - plan:CHK.1
  - evidence:ready
  - unverified
  - dead
milestone: m-0
dependencies: []
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#F/CHK.1
  - ~/Buildo-scratch/lanes-20261117/checks/REPORT.md sha256=11bfda56fd34
  - >-
    ~/Buildo-scratch/lanes-20261117/inc-plan/checks/PANEL.md#L2
    sha256=b30b7f626bca
  - docs/reports/lanes/2026-11-19/BL-CHK1/REPORT.md
documentation:
  - backlog/docs/increments/doc-1 - Increment-F-requirements.md
priority: low
type: build
project: McIncrement
ordinal: 1002
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: CHK.1 Automatic check: scope (a slice changes only its declared files): lane mode delegates to panel-tools/gate.mjs write-scope step; git mode compares a commit range with the globs the slice declares (Slice-Files trailer or --declared)

snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: MEASURED: under 0.1 s per range; build GUESS 0.25 d

Plan text at the snapshot: NOT COMPLETE: moves into the repo (git mode only), absorbs INFRA.4 results gate (proposed); OPEN: where a slice declares its files; in the Increment 1·A panel
slicePart: measured check
planNote: reuse: status NOT COMPLETE: moves into the repo (git mode only), absorbs INFRA.4 results gate (proposed); OPEN: where a slice declares its files; in the Increment 1·A panel ((operator 2026-11-18, MORNING-DECISIONS.md:744 "Add to the named list.." and :750 "yes to re-use obviosouly, yes drop"; shape decided by the Increment 1·A panel, lanes-20261117/inc1a-review/p1))
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
1. Read G3 (check-backlog-task.mjs), its tests, .husky/commit-msg, rulings MORNING-DECISIONS.md:744,750-751,871,980-983 (AC #6 grounding).
2. Plan review r1 in review mode on the context file (plan altitude, AC #2 #4), TRIAGE.md KEEP/REJECT, fold KEPT only (AC #5).
3. Red first: src/tests/backlog/check-task-files.logic.test.ts on a temp repo (cases: pass inside declaration, fail outside naming file and Files: line, WARN with no Files: line, exemptions docs-only and backlog-only and always-allowed paths, glob and prefix forms, no trailer passes); commit attempt with test + task file + context file only; hook refuses -> red.out (AC #6).
4. Green: scripts/hooks/check-task-files.mjs (git mode, staged diff, own glob-to-regex, no new dependency) + one line in .husky/commit-msg after G3; real commit through hooks -> commit.out; typecheck.
5. Files: line on task-3 itself (first use) naming these paths.
6. One output review, one lens (error paths, path matching edges), triaged; fix commit only for KEPT defects.
7. Reports (REPORT.md, TRIAGE.md, review outputs) copied to docs/reports/lanes/2026-11-19/BL-CHK1/ in last docs commit (AC #7, rule 19); --add-ref; close -s BUILT.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-19 relevancy pass (R7, RR-0214): KEPT: not replaced by BL.0 (.cursor/active_task.md task-1 planNote 'CHK.1-6, CHK.8, INFRA.1, 4, 5, 6 and QUEUE.PULL are not replaced'); absorbs INFRA.4 (task-10).

2026-11-19 relevancy pass 2 (R9, after R8, RR-0219 and RR-0214; review r1 triaged in docs/reports/lanes/2026-11-19/BL-R9/TRIAGE.md): KEPT, narrowed to git mode: G3 scripts/hooks/check-backlog-task.mjs:25-33 checks that a code commit names its task and the file is in the diff, but never which files the task declares, so nothing covers this. Lane mode is dropped: backlog-lane.mjs (R8e 4e8c498a4) gives each lane its own worktree and gate.mjs write-scope is scratch (re-use ruling MORNING-DECISIONS.md:750-751, build-in-repo MORNING-DECISIONS.md:744). Absorbs INFRA.4 (task-10). Scope now: a repo hook script that reads the commit range and fails when a changed file is outside the Files: line of the task named by the Task: trailer (declaration home recommended under the six criteria: a Files: line in the task description; the launching lane logs it as a card).

2026-11-19 taken on the board at lane launch (lane BL-CHK1, worktree /Users/brettpreston_macmini/Buildo-wt-chk1, branch wf1/inc1a-chk1), RR-0240

Files: scripts/hooks/check-task-files.mjs, src/tests/backlog/check-task-files.logic.test.ts, .husky/commit-msg, backlog/tasks/, docs/reports/reviews/task-3/, docs/reports/lanes/

2026-11-19 lane BL-CHK1: output review r2 (one lens) triaged; KEPT: renamed and deleted task file handling (fixed, test-first).

2026-11-19 BL-CHK1: AC #1, #3, #4, #5, #8 not applicable after the R9 narrowing (brief/panel/pre-registration parts dropped; no work invented). #2, #6, #7 checked with evidence in docs/reports/lanes/2026-11-19/BL-CHK1/REPORT.md.
Dated note 2026-11-19 (M-246, prior text kept; RR-0248 · task-3 · Backlog; operator, verbatim: "y - this is a major improvement")

2026-11-19 DONE: closing commits on origin/wf1/mb-rulings (push windows 3 and 4: 62de20da0, 7b8381cfd; station PASS); evidence per the task's final summary
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
CHK.1 git-mode scope check landed: scripts/hooks/check-task-files.mjs wired after G3 in .husky/commit-msg; commits 978e64e1c (feat, 15 tests green through hooks) and fb21775c6 (fix after review r2, 16 green). Report: docs/reports/lanes/2026-11-19/BL-CHK1/REPORT.md
<!-- SECTION:FINAL_SUMMARY:END -->
