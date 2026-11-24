---
id: TASK-261
title: L.10 Record the launch definition (users on the live report)
status: MERGED
assignee:
  - '@lane'
created_date: '2026-11-19T04:57:00Z'
updated_date: '2026-11-24T14:42:00Z'
labels:
  - L
  - plan:L.10
  - plan:LAUNCH-DEF
  - comp:PAN
  - comp:FIVE
  - comp:SC
  - comp:STAT
  - comp:DN
  - comp:REN
  - dead
milestone: m-13
dependencies: []
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#L/LAUNCH-DEF
  - >-
    ~/Buildo-scratch/queues-20261113/MB-REVIEW-20261117.md#L355
    sha256=ad765bc88059
  - >-
    ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L568
    sha256=428ba8ffcb05
  - >-
    ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L570
    sha256=9fe9a87d1331
documentation:
  - backlog/docs/increments/doc-14 - Increment-L-requirements.md
priority: low
type: record
project: McIncrement
ordinal: 14010
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
merged-into: task-115
snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: GUESS 0.25 day

Plan text at the snapshot: FOLDED into 6c.30 (holistic-r1: same record: "Land the launch definition (users on live report)" (6c.30 RUL:15) and "Record the launch definition (users on the live report)" (L.10 LAUNCH-DEF); one landing, in the records commit)
planNote: L: estimate GUESS 0.25 day (PLAN-PROTOCOL 5.5)
planNote: L: status READY (optimize-L final status)
note: Launch = real users on the live report (ruled 2026-11-17). Launch gate: the live report does not open before the INC8-RECAP (J9) recapture clears the stale disclosure word (D7-1 record).
who (plan text): lane
plan source tags: ROW:LAUNCH-DEF
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The ruling is copied verbatim with date and row id, prior text kept — "A ruling enters a row as a verbatim dated note." (docs/specs/00-architecture/137_mcqueue.md:109)
- [ ] #2 Entered the same day — "The orchestrator writes each ruling into the row's status line the same day." (docs/specs/00-architecture/137_mcqueue.md:87)
- [ ] #3 Where it is a register row, it cites its log entry and the log check is green — "RED (exit 1) when an approved decision has no citing register row" (scripts/analysis/decision-log.mjs:16)
- [ ] #4 The handbook line is cited, or a new register row is drafted — "every V3-step or by-law decision cites" (docs/specs/01-pipeline/124a_step_standard_policy_appendix.md:988)
- [ ] #5 The status line of the row changes in the same commit — "The status line changes in the same commit as the work." (docs/specs/00-architecture/137_mcqueue.md:84)
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
