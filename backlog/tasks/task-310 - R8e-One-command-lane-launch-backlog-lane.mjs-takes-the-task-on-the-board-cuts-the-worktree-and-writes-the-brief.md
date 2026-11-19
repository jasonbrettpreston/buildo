---
id: TASK-310
title: >-
  R8e One-command lane launch: backlog-lane.mjs takes the task on the board,
  cuts the worktree and writes the brief
status: RUNNING
assignee:
  - '@lane-BL-R8e'
created_date: '2026-11-19T13:05:00Z'
updated_date: '2026-11-19T13:05:00Z'
labels:
  - follow-up
milestone: m-0
dependencies: []
references:
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L950
  - scripts/analysis/backlog-brief.mjs#L6
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
- [ ] #1 scripts/analysis/backlog-lane.mjs --task task-N --lane <name> [--board <dir>] [--worktree <dir>] [--branch <name>] does the launch in one run: takes the task on the board checkout (RUNNING, assignee @lane-<name>, note with worktree and branch), kickstarts com.maxbld.board-commit and waits for the commit, creates the lane worktree from that head with both node_modules links and the plan copy, writes the G1 ticket (backlog-brief.mjs) and the lane brief (panel-tools/brief.mjs from a task.json the tool writes from the task), and prints the BRIEF-FILE line with its sha256
- [ ] #2 Refuses when the task is not LATER or WAITS, when the worktree exists, or when the board checkout is dirty outside backlog/ (observable refusal text)
- [ ] #3 Red tests first on a temp project in src/tests/backlog/ (the launchd and worktree steps mocked behind a --dry-run that prints the commands), green through the real hooks; repo review round r1 on the plan in review mode before code
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-19 taken on the board by the orchestrator at lane launch (lane BL-R8e in ~/Buildo-wt-r8e, branch wf2/r8e-lane-launch), RR-0240
<!-- SECTION:NOTES:END -->
