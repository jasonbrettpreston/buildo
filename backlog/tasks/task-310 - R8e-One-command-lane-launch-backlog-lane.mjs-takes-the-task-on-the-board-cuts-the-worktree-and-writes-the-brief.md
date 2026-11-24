---
id: TASK-310
title: >-
  R8e One-command lane launch: backlog-lane.mjs takes the task on the board,
  cuts the worktree and writes the brief
status: DONE
assignee:
  - '@lane-BL-R8e'
created_date: '2026-11-19T13:05:00Z'
updated_date: '2026-11-24T18:41:00Z'
labels:
  - dead
milestone: m-0
dependencies: []
references:
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L950
  - scripts/analysis/backlog-brief.mjs#L6
  - docs/reports/lanes/2026-11-19/BL-R8e/REPORT.md
  - docs/reports/lanes/2026-11-19/BL-R8e/TRIAGE.md
type: build
project: McIncrement
ordinal: 20012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator 2026-11-19: "you now need to manually change the board or add a task - every single time - that seems like alot of work and inefficient - wasnt the point of this to avoid just that". Grounded: yes - the launch of each of the seven lanes today took eight manual steps (board take, job kickstart, worktree add, two node_modules links, plan copy, G1 ticket, brief.mjs) recorded in MORNING-DECISIONS.md:935 and :950; the close side is already automatic (push + board-ff). Recommendation: one launch command in the repo that performs the eight steps from the task file and prints the BRIEF-FILE line; the agent call stays the orchestrator one action (Spec 08 rule 9); UNVERIFIED until the review round of this task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 scripts/analysis/backlog-lane.mjs --task task-N --lane <name> [--board <dir>] [--worktree <dir>] [--branch <name>] does the launch in one run: takes the task on the board checkout (RUNNING, assignee @lane-<name>, note with worktree and branch), kickstarts com.maxbld.board-commit and waits for the commit, creates the lane worktree from that head with both node_modules links and the plan copy, writes the G1 ticket (backlog-brief.mjs) and the lane brief (panel-tools/brief.mjs from a task.json the tool writes from the task), and prints the BRIEF-FILE line with its sha256
- [x] #2 Refuses when the task is not LATER or WAITS, when the worktree exists, or when the board checkout is dirty outside backlog/ (observable refusal text)
- [x] #3 Red tests first on a temp project in src/tests/backlog/ (the launchd and worktree steps mocked behind a --dry-run that prints the commands), green through the real hooks; repo review round r1 on the plan in review mode before code
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
1. Red first: src/tests/backlog/backlog-lane.logic.test.ts on a temp Backlog project (helpers.ts) cloned as a temp board git repo; cases: refusals (status RUNNING/BUILT/DONE, missing worktree parent, existing worktree dir, existing branch, dirty file outside backlog/, missing backlog binary, each exit 3 with one line); --dry-run prints take, launchctl kickstart, git worktree add, two ln, cp, backlog-brief, brief.mjs commands and a BRIEF-FILE placeholder and writes nothing; generated task.json fields and writeScope with no file entry; real take through BACKLOG_LANE_NO_LAUNCHD=1 (runs the board-commit job script instead of launchctl) with a fake panel-tools dir; a failing board hook gives the 4-minute-wait refusal (BACKLOG_LANE_WAIT_MS short). Red proven by a commit attempt with only test, task-310 file and context file staged (red.out).
2. Build scripts/analysis/backlog-lane.mjs: one ordered list of steps (argv + cwd) used for both the dry-run print (shell-quoted) and the real run; reuses backlog-lib.mjs (args, readItems, parseFM, asList, descriptionOf, sha256, today); shells out to backlog, launchctl, git, ln, cp, backlog-brief.mjs and panel-tools/brief.mjs; no new dependency, no config key.
3. Preflight refusals before any write (exit 3): backlog binary, task status LATER/WAITS, worktree parent, worktree exists, branch exists, board dirty outside backlog/.
4. Take, kickstart, wait (backlog/ clean and HEAD advanced, 4 minute timeout), worktree add from the board HEAD, links, active_task copy, G1 ticket, task.json (or --spec), brief.mjs, print BRIEF-FILE line with sha256.
5. Green: real commit through the hooks with Task: task-310 (commit.out); typecheck; one output review on the diff with one lens (refusals, dry-run completeness, quoting); triage; fix commit for KEPT defects only; dry-run proofs against the real board (dryrun.out); close AC 1-3 with evidence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-19 taken on the board by the orchestrator at lane launch (lane BL-R8e in ~/Buildo-wt-r8e, branch wf2/r8e-lane-launch), RR-0240

2026-11-19 BL-R8e: script and 16 tests landed in 67032d6a6 (red.out: 16 failed, no module; commit.out: 16 passed, hooks green); r1 plan review and r2 output review triaged in docs/reports/lanes/2026-11-19/BL-R8e/TRIAGE.md; fixes folded in the second commit; dry-run proof in the lane dir dryrun.out (task-310 refused as RUNNING, task-14 LATER printed all commands).

Dated note 2026-11-19 (M-246, prior text kept; RR-0242 · task-310 · Backlog; operator, verbatim: "wasnt the point of this to avoid just that")

2026-11-19 DONE: closing commits on origin/wf1/mb-rulings (push windows 3 and 4: 62de20da0, 7b8381cfd; station PASS); evidence per the task's final summary
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
backlog-lane.mjs launches a lane in one command (take, kickstart and wait, worktree, links, plan copy, G1 ticket, task.json, brief.mjs, BRIEF-FILE line); refusals exit 3; 16 tests red then green through the hooks (67032d6a6); dry-run proven on the real board; real launchctl run UNVERIFIED.
<!-- SECTION:FINAL_SUMMARY:END -->
