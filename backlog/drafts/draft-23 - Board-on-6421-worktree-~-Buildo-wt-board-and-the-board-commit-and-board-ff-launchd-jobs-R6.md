---
id: DRAFT-23
title: >-
  Board on 6421: worktree ~/Buildo-wt-board and the board-commit and board-ff
  launchd jobs (R6)
status: Draft
assignee: []
created_date: '2026-11-19T05:28:00Z'
labels:
  - follow-up
milestone: m-0
dependencies: []
references:
  - .cursor/active_task.md#L89
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L874
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Step R6 of plan v8.1: the Backlog browser on a repo checkout, plus two launchd jobs (com.maxbld.board-commit commits board edits with a conforming message; com.maxbld.board-ff fast-forwards the checkout to the programme tip). Six-criteria entry MORNING-DECISIONS.md:874.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Worktree ~/Buildo-wt-board on branch wf2/board at the pushed tip with node_modules linked
- [ ] #2 Plist com.maxbld.board-commit commits backlog/ changes every 10 minutes as docs(137_mcqueue): board edits <date> through the real hooks
- [ ] #3 Plist com.maxbld.board-ff fetches and fast-forwards, writing WARN when refused
- [ ] #4 The browser runs on port 6421 and one drag is committed through the hooks; BOARD-STATUS.txt gains one line
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
