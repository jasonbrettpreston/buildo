---
id: TASK-90
title: >-
  ST.N1 Land the McStorage policy v2 amendments in one M-246 batch after push 6
  and...
status: WAITS
assignee:
  - '@lane-R'
created_date: '2026-11-19T04:57:00Z'
updated_date: '2026-11-20T13:23:00Z'
due_date: '2026-11-26'
labels:
  - '6'
  - plan:ST.N1
milestone: m-1
dependencies:
  - TASK-62
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#6/ST.N1
  - ~/Buildo-scratch/inc6-guard/RULES.md#L8 sha256=cb54de861a9b
documentation:
  - backlog/docs/increments/doc-8 - Increment-6-requirements.md
priority: low
type: build
project: McIncrement
ordinal: 8052
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: ST.N1 Land the McStorage policy v2 amendments in one M-246 batch after push 6 and after the operator has read the policy: A-ST5, A-ST4, A-ST6, A-ST3, A-FE39, A-MB38, A-MB75, A-MB76, A-S88, A-126, A-MF62, A-LAT; mark each conflicting ruling SUPERSEDED with its prior text kept; refresh McSTORAGE-ALIGNMENT.md:146 "proposed" to "ruled"; ST-3 amendment gets a second seat (if it fails, the others land without it); the A-ST3 ceiling clause, A-S88 cost wording and A-ST5b land only after ST-OP1, ST-OP3 and ST-OP4 are answered, the rest do not wait; A-ST5b (tester 309 rows) is separate and optional; also amends McSTORAGE-ALIGNMENT.md:145, :157, :162 and records MF-51 plan.v2 line 58 as superseded

snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: GUESS 0.5 day

Plan text at the snapshot: WAITING operator reads the policy; push 6
landingPush: after push 6 (6.43)
slicePart: records
who (plan text): McBylaws lane R (rulings text), operator reads first
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Pre-register the expected moves, committed alone — "Pre-register the task's `rules[]` and expected moves" (.cursor/MCBYLAWS-QUEUE.md:109)
- [ ] #2 Failing tests are written into the plan and reviewed at plan altitude — "are written INTO the plan and reviewed at PLAN altitude" (docs/specs/00-architecture/08_agents.md:465)
- [ ] #3 `write_scope` declared in the brief — "The brief file opens with a front-matter block" (docs/specs/00-architecture/08_agents.md:144)
- [ ] #4 PLAN panel run with the lens set, never one generic pass — "NEVER run one generic pass" (docs/specs/00-architecture/08_agents.md:334)
- [ ] #5 Fold validated by a grounder that re-executes every claim — "one grounder re-executes every claim in the fold" (docs/specs/00-architecture/08_agents.md:458)
- [ ] #6 Built red first, then green, on the tip — "Red tests first, then the code, through the real hooks." (docs/specs/00-architecture/08_agents.md:490)
- [ ] #7 OUTPUT panel record committed with the work — "is committed with the work (R-KM)." (.cursor/MCBYLAWS-QUEUE.md:116)
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-20 operator, verbatim: "yes to McStorage and 1,2,3 yes as recommended" (item 3: land the McStorage policy v2 amendments now, in Increment 1·B, so the rule records are not stale). Earlier the same day: "the McStroage policy was recently updated with the new direction - I just want to ensure the rules were updated as well. I dont want to be bound with stale McStorage". The amendments that wait on the open points ST-OP1, ST-OP3 and ST-OP4 still wait on the operator.
<!-- SECTION:NOTES:END -->
