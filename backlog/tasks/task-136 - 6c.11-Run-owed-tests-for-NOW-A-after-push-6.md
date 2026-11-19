---
id: TASK-136
title: 6c.11 Run owed tests for NOW-A after push 6
status: WAITS
assignee:
  - '@runner'
created_date: '2026-11-19T04:57:00Z'
due_date: '2026-11-26'
labels:
  - 6c
  - plan:6c.11
  - plan:NOWA-LANE
  - comp:PAN
  - comp:FIVE
  - comp:SC
  - comp:STAT
  - comp:BLD
  - comp:HS
milestone: m-8
dependencies:
  - TASK-62
  - TASK-121
  - TASK-99
  - TASK-122
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#6c/NOWA-LANE
  - ~/Buildo-scratch/lanes-20261117/NOW-A/REPORT.md#L29 sha256=cc2a8c2ec74d
  - ~/Buildo-scratch/lanes-20261117/NOW-A/REPORT.md#L39 sha256=aa2a2aa6e5ca
  - >-
    ~/Buildo-scratch/lanes-20261117/owner-inputs/REPORT.md#L8
    sha256=335cecf3b966
  - >-
    ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L577
    sha256=c5ee7c2a2c4f
documentation:
  - backlog/docs/increments/doc-9 - Increment-6c-requirements.md
priority: low
type: check
project: McIncrement
ordinal: 9011
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: UNMEASURED

Plan text at the snapshot: WAITING on 6.43, 6c.8 and 6c.8a
planNote: 6: dependsOn 6.43,6c.5a,6c.8,6c.8a (optimize-6c/decisions-6c-final.json 6c.11)
planNote: 6: status WAITING on 6.43, 6c.8 and 6c.8a (optimize-6c/decisions-6c-final.json 6c.11)
note: Owed tests for NOW-A after push 6. Takes SUITE.lock (serial, never during a night); run in one SUITE.lock slot with NOWC-LANE after push 6 if the code is on the branch (suggested, unverified).
who (plan text): runner
plan source tags: ROW:NOWA-LANE
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
