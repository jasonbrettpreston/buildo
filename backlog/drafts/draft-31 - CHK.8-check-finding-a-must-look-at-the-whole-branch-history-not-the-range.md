---
id: DRAFT-31
title: 'CHK.8 check: finding (a) must look at the whole branch history, not the range'
status: Draft
assignee: []
created_date: '2026-11-19T14:11:00Z'
labels:
  - follow-up
milestone: m-0
dependencies: []
references:
  - scripts/analysis/backlog-status-check.mjs#L1
type: fix
project: McIncrement
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Lane BL-CHK8 run on its own branch (inc1a/chk8/branch-run.txt): FAIL a task-309 and task-310, both BUILT by commits that are on origin/wf1/mb-rulings (62de20da0) but outside the checked range 62de20da0..HEAD. Grounded: yes. Recommendation: finding (a) reads git log over all of HEAD; UNVERIFIED until its review round.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Finding (a) of backlog-status-check.mjs searches the whole HEAD history for the Task: trailer (a task closed by a commit already on origin is not a failure); the range limits finding (b) only; red test first
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
