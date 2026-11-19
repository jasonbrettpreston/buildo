---
id: TASK-61
title: 6.42 Part B full suite on the tip (about 11 min)
status: WAITS
assignee:
  - '@runner'
created_date: '2026-11-19T04:57:00Z'
due_date: '2026-11-26'
labels:
  - '6'
  - plan:6.42
  - plan:PARTB:suite
  - comp:PAN
  - comp:FIVE
  - comp:SC
  - comp:STAT
  - comp:BLD
  - comp:HS
milestone: m-7
dependencies:
  - TASK-34
  - TASK-60
  - TASK-36
  - TASK-59
  - TASK-39
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#6/PARTB:suite
  - >-
    ~/Buildo-scratch/mcbylaws/inc6/PARTB-SEQUENCE-20261116.md#L37
    sha256=5acd5856cba9
  - ~/Buildo-scratch/inc6-guard/RULES.md#L8 sha256=cb54de861a9b
  - >-
    ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L553
    sha256=f619b2202bf3
  - ~/Buildo-scratch/inc6-guard/RULES.md#L7 sha256=65b3fdb86726
documentation:
  - backlog/docs/increments/doc-8 - Increment-6-requirements.md
priority: high
type: check
project: McIncrement
ordinal: 8042
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: UNMEASURED

Plan text at the snapshot: WAITING on 6.15
planNote: 6: dependsOn 6.15,6.18,6.19,6.7a,6.22 (optimize-6/decisions-6-final.json 6.42)
planNote: 6: status WAITING on 6.15 (optimize-6/decisions-6-final.json 6.42)
who (plan text): runner
plan source tags: ROW:PARTB:suite
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
