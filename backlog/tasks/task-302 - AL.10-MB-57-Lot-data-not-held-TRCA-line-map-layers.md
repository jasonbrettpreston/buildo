---
id: TASK-302
title: 'AL.10 MB-57 Lot data not held: TRCA line, map layers'
status: WAITS
assignee:
  - '@lane'
created_date: '2026-11-19T04:57:00Z'
updated_date: '2026-11-19T04:57:00Z'
due_date: '2026-11-26'
labels:
  - AL
  - plan:AL.10
  - plan:MB-57
  - queue-row
  - comp:PAN
  - comp:FIVE
  - comp:SC
  - comp:STAT
  - comp:BLD
  - comp:HS
  - comp:BYL
milestone: m-14
dependencies: []
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#AL/MB-57
  - .cursor/MCBYLAWS-QUEUE.md#L797 sha256=7d346be029a2 ROW:MB-57
  - >-
    ~/Buildo-scratch/queues-20261113/MB-REVIEW-20261117.md#L129
    sha256=6a87eb088ee7
  - >-
    ~/Buildo-scratch/queues-20261113/MB-MERGE-PLAN-20261117.md#L58
    sha256=4d3cdc516f92
  - >-
    ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L591
    sha256=6799fe49f693
  - >-
    ~/Buildo-scratch/queues-20261113/MB-MERGE-PLAN-20261117.md#L39
    sha256=90575f1fe75a
documentation:
  - backlog/docs/increments/doc-15 - Increment-AL-requirements.md
priority: low
type: record
project: McBylaws
ordinal: 15010
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: GUESS unscheduled; not on the launch path

Plan text at the snapshot: OPERATOR (O-5); narrowed to TRCA line and map layers; laneway half merges into MB-107
planNote: L: estimate GUESS unscheduled; not on the launch path (PLAN-PROTOCOL 5.5)
planNote: L: status OPERATOR (O-5); narrowed to TRCA line and map layers; laneway half merges into MB-107 (optimize-L final status)
who (plan text): lane
queue row: MB-57 (row status WAITS · since 2026-11-17 · expires when MB-27 raises a loop finding that rests on the TRCA line, a map layer or M-224 · next: none · ruling: "approved if complaint"); the row stays the record (Spec 137 rule 2) and the lane edits the row and this task in the same commit (rule 3)
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Dated note 2026-11-15 (M-246, prior text kept; RR-0060 · task-302 · Backlog; operator, verbatim: "I think we hold on the laneway suite")
<!-- SECTION:NOTES:END -->
