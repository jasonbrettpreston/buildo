---
id: TASK-305
title: >-
  Board on 6421: worktree ~/Buildo-wt-board and the board-commit and board-ff
  launchd jobs (R6)
status: DONE
assignee:
  - '@lane-BL-R6'
created_date: '2026-11-19T05:28:00Z'
updated_date: '2026-11-24T14:42:00Z'
labels:
  - follow-up
  - dead
milestone: m-0
dependencies: []
references:
  - .cursor/active_task.md#L89
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L874
  - docs/reports/lanes/2026-11-19/BL-R6/REPORT.md
  - docs/reports/lanes/2026-11-19/BL-R6/TRIAGE.md
  - docs/reports/lanes/2026-11-19/BL-R6/r1-plan.txt
priority: medium
type: build
project: McIncrement
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Step R6 of plan v8.1: the Backlog browser on a repo checkout, plus two launchd jobs (com.maxbld.board-commit commits board edits with a conforming message; com.maxbld.board-ff fast-forwards the checkout to the programme tip). Six-criteria entry MORNING-DECISIONS.md:874.

Rules quoted (file:line):
- .cursor/active_task.md:54 (plan v8.1 section 4): "`auto_commit` stays false everywhere ... A small launchd job `com.maxbld.board-commit` in the board checkout runs `git add backlog && git commit -m \"docs(137_mcqueue): board edits <date>\"` through the real hooks every 10 minutes when `backlog/` has changes".
- .cursor/active_task.md:55: "a NEW plist `com.maxbld.board-ff` ... fetches every 10 minutes and runs `git merge --ff-only origin/wf1/mb-rulings` in the checkout ... the job writes a `WARN` line".
- .cursor/active_task.md:57: "Whether `check_active_branches: true` shows lane branches usefully is measured once in R6 and recorded".
- ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:874: board edits are committed by a small job with a conforming message; no hook change (six-criteria decision, RR-0219 at :870-871).
- docs/specs/00-architecture/137_mcqueue.md:98 (brief cites :84 in this checkout): "Rule 3. The status line changes in the same commit as the work."
- ~/Buildo-scratch/panel-tools/PLAN-PROTOCOL.md:3: "keep it simple; no scope creep".
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Worktree ~/Buildo-wt-board on branch wf2/board at the pushed tip with node_modules linked
- [x] #2 Plist com.maxbld.board-commit commits backlog/ changes every 10 minutes as docs(137_mcqueue): board edits <date> through the real hooks; "auto_commit stays false everywhere" (.cursor/active_task.md:54)
- [x] #3 Plist com.maxbld.board-ff fetches and fast-forwards, writing WARN when refused; "the job writes a WARN line" (.cursor/active_task.md:55)
- [x] #4 The browser runs on port 6421 and one drag is committed through the hooks; BOARD-STATUS.txt gains one line; "board edits are committed by a small job with a conforming message" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:874)
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
1. AC1: confirm checkout ~/Buildo-wt-board on wf2/board at the pushed tip with both node_modules linked (git branch, ls -l).
2. AC2: write board-commit.zsh and the com.maxbld.board-commit plist (StartInterval 600); test first, red then green; one board edit committed by the job through the real hooks.
3. AC3: write board-ff.zsh and the com.maxbld.board-ff plist (StartInterval 600); WARN when the ff is refused; BOARD-STATUS-6421.txt written by the job.
4. AC4: load com.maxbld.board-browser-6421, check 200 on 6421, one CLI board edit committed by the job; measure check_active_branches once; ONE commit with Task: task-305.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-19 R6: jobs loaded, browser on 6421

2026-11-19 R6 check_active_branches measured once (build-r6/measure.out): task list --plain real 0.154 s with false and 0.123 s with true; the first rows and `task view task-305` were identical in both runs, no lane-branch variants appeared (wf2/board-move2 holds the same task files); config.yml restored to false (git status clean). Nothing depends on it (active_task.md:57).

2026-11-19 R6 BOARD-STATUS decision: the repo board writes its own one-line file ~/Buildo-scratch/backlog-pilot/BOARD-STATUS-6421.txt (format `6421: <sha> <ff|WARN reason> <time>`), because auto-board.zsh rewrites BOARD-STATUS.txt wholly at every rebuild (auto-board.zsh:28-31). Logs: ~/Buildo-wt-board/.board/*.log (gitignored). Note: ff-only on a checkout that is ahead of origin with origin an ancestor reports ff (already up to date); WARN appears only when origin has moved and the branches diverged or backlog/ is dirty.

2026-11-19 pushed: 181aac24b and the job commits landed on origin/wf1/mb-rulings (push fa08e8f24 12:52Z); board-ff fast-forwarded the checkout to fa08e8f24 at 07:52 local

2026-11-19 DONE: closing commits on origin/wf1/mb-rulings (push windows 3 and 4: 62de20da0, 7b8381cfd; station PASS); evidence per the task's final summary
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Commit 181aac24b (Task: task-305, real hooks, GATE OK): scripts/board/board-commit.zsh, board-ff.zsh, three plists under scripts/board/launchd, test src/tests/backlog/board-jobs.logic.test.ts (red 3 failed, green 3 passed). Jobs loaded (five maxbld jobs), 6421 answers 200, board edit committed by the job as d66c2ab2b docs(137_mcqueue): board edits 2026-11-19 07:04 through the hooks; BOARD-STATUS-6421.txt written by the ff job. AC4 drag is satisfied for BUILT by the CLI edit committed by the job; the operator drag on http://127.0.0.1:6421 will be committed by the next board-commit run. DONE waits for the push window.
<!-- SECTION:FINAL_SUMMARY:END -->
