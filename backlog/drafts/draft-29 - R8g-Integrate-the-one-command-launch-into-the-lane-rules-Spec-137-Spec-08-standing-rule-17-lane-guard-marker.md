---
id: DRAFT-29
title: >-
  R8g Integrate the one-command launch into the lane rules: Spec 137, Spec 08,
  standing rule 17, lane-guard marker
status: Draft
assignee: []
created_date: '2026-11-19T13:09:00Z'
labels:
  - follow-up
milestone: m-0
dependencies: []
references:
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L954
type: record
project: McIncrement
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator 2026-11-19: "should it be intregrated with the other rules when ultizing agents and lanes". Grounded: yes - the launch rule today is spread over Spec 137 (McLane note), Spec 08 section 10.1 and TKT-1, standing-rules 17, and the session hook lane-guard A2 (brief.mjs form only); none names a single launch command because task-310 builds it now. Recommendation: after task-310 lands, one docs commit updates the three notes and the orchestrator adds the marker check to the session hook; UNVERIFIED until the review round of this task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Spec 137 McLane note and Spec 08 section 10.1 note name scripts/analysis/backlog-lane.mjs as the only lane launch (take on the board, worktree, G1 ticket, brief); standing-rules.md rule 17 says the same
- [ ] #2 The orchestrator session hook lane-guard.mjs A2 accepts only a BRIEF-FILE whose brief carries the backlog-lane.mjs marker line (the tool writes it), so a hand-written launch is refused
- [ ] #3 Repo review round in review mode, triaged, before the notes
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
