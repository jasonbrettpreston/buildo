---
id: TASK-470
title: >-
  McFixV2 tooling: review trim (plan folds critical and high only; round 2
  narrowed or skipped; generic plan review off; security on security items;
  review file form checked at the records commit)
status: LATER
assignee: []
created_date: '2026-11-26T12:32:00Z'
labels:
  - McFixV2
milestone: m-1
dependencies: []
type: fix
ordinal: 164210
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Opened by the operator's rulings RR-0511 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2654, verbatim "Let's do this as you recommended and then turn off the generic plan and if its easy just run security on security based items.  We need more data.  The other thing would it help if fable ran the plan and sonnet wrote. Thoughts or Fable plan and opus writes?"), RR-0512 (:2660, verbatim "Let's add fable as the planner and opus stays as the writer.  Any other suggestions here?") and RR-0513 (:2664, verbatim "Let's add A, B  and C.  Plan approved"). Amends RR-0385 (:1915-1926). Pieces: (1) the plan review folds CRITICAL and HIGH only; MED and below are recorded. (2) Output round 2 reviews only the files the round 1 fix changed. (3) Round 2 is skipped when the round 1 fix is test-only and the station passed on it. (4) The generic DeepSeek plan review (plan-review-deepseek) is off. (5) The security lens runs on security items only (sign-in, money, personal data), not on every API route or library path. (6) The rule text says the planner runs on Fable, the builder on Opus, seats and grounders on Sonnet (the lane guard file is outside the repo and is the operator's own change). (A) The form of the review files (the REVIEW header prompt hash the close check tests) is checked when they are committed, not only at the close. Everything must be easy to turn off again; no other reviewer is turned off ("We need more data"). Data behind the rulings: four cards (task-469, task-465, task-267, task-313): 348 plan findings, 47 critical or high; two of two round 2s fixed nothing; the generic plan review gave 1 high in 57 findings with 22 rejected.
Files: scripts/analysis/rule-lists.mjs, scripts/hooks/check-lane-close.mjs, docs/specs/00-architecture/08_agents.md
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The plan fold check accepts a plan round where every CRITICAL and HIGH is folded and MED and below are recorded
- [ ] #2 The close check accepts round 2 made over only the files the round 1 fix changed, and accepts no round 2 when the round 1 fix is test-only and a station pass exists for it; a fix that touches non-test code still needs round 2
- [ ] #3 The plan lens set no longer holds the generic plan review, and security is called only for sign-in, money and personal data paths
- [ ] #4 A records commit whose review files were not made in the brief's form is refused at that commit with the same message the close gives
- [ ] #5 Each change can be turned off again by one small edit, and the rule text names Fable as planner, Opus as builder, Sonnet for seats and grounders
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
