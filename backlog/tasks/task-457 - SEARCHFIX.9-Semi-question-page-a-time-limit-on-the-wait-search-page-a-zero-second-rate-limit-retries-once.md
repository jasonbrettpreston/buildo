---
id: TASK-457
title: >-
  SEARCHFIX.9 Semi question page: a time limit on the wait; search page: a
  zero-second rate limit retries once
status: LATER
assignee: []
created_date: '2026-11-24T17:29:00Z'
labels:
  - SEARCHFIX-LATER
milestone: m-1
dependencies: []
type: fix
ordinal: 151210
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-24 by the orchestrator from RR-0456 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2362), operator, verbatim: "Q4 add a limit Q5 retry once auto at zero". (1) The semi question page opened with no connection waits on Searching with no end (task-450 V5, mobile/src/lib/semiQuestion.ts:74): add a time limit, then a could-not-load message with Try again. (2) After a search, a rate limit answer of zero seconds reads Try again in 0s and nothing retries (task-450 L3): retry the search once automatically at zero. Not planned yet; the length of the limit is for the plan grounder to rule from existing settings.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The semi question page stops waiting after the limit and shows a message with Try again
- [ ] #2 A zero-second rate limit retries the search once, and only once
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
