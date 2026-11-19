---
id: TASK-30
title: 6.12 Read-only dev-vs-test comparison before D7 c1
status: WAITS
assignee:
  - '@runner'
created_date: '2026-11-19T04:57:00Z'
due_date: '2026-11-26'
labels:
  - '6'
  - plan:6.12
  - plan:X:D7-compare
  - comp:PAN
  - comp:FIVE
  - comp:SC
  - comp:STAT
  - comp:BLD
  - comp:HS
  - comp:STO
milestone: m-7
dependencies:
  - TASK-29
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#6/X:D7-compare
  - ~/Buildo-scratch/lanes-20261117/d7-once/REPORT.md#L11 sha256=dd4f5c1b3c2c
  - >-
    ~/Buildo-scratch/queues-20261113/decisions/DECISIONS-20261117-D7.md#L8
    sha256=cf4bf04d3ec4
documentation:
  - backlog/docs/increments/doc-8 - Increment-6-requirements.md
priority: high
type: check
project: McIncrement
ordinal: 8012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: UNMEASURED

Plan text at the snapshot: WAITING on 6.11
planNote: 6: status WAITING on 6.11 (optimize-6/decisions-6-final.json 6.12)
note: Ruled condition (D7-5): one read-only dev-vs-test comparison (c1 fingerprints and counts of the eight read tables) before D7 c1, when the dev dblock is empty (after D6 and MIG330 land); read-only, no writes.
who (plan text): runner
plan source tags: NEW:D7-compare
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No claim that could be executed is left unexecuted — "A plan or fold may not contain a claim that COULD be executed but wasn't" (docs/specs/00-architecture/08_agents.md:454)
- [ ] #2 The result is a checker or test output, not a person's word — "the checker updates the status line, never a person" (.cursor/MCBYLAWS-QUEUE.md:235)
- [ ] #3 Each status line is compared with what landed — "For each row it checks the `Status:` line against what landed." (docs/specs/00-architecture/137_mcqueue.md:125)
- [ ] #4 The named test passes — "Never declare a task done until" (CLAUDE.md:32)
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
