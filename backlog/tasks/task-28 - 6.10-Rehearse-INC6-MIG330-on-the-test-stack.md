---
id: TASK-28
title: 6.10 Rehearse INC6-MIG330 on the test stack
status: WAITS
assignee:
  - '@runner'
created_date: '2026-11-19T04:57:00Z'
due_date: '2026-11-26'
labels:
  - '6'
  - plan:6.10
  - plan:MIG330:rehearse
  - comp:PAN
  - comp:FIVE
  - comp:SC
  - comp:STAT
  - comp:RH
  - comp:GO
  - comp:ID
  - comp:STO
  - comp:AV3
  - comp:HS
milestone: m-7
dependencies:
  - TASK-27
  - TASK-21
  - TASK-22
  - TASK-23
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#6/MIG330:rehearse
  - ~/Buildo-scratch/mcbylaws/inc6/mig330/RUN.md#L32 sha256=05b02660ba74
  - >-
    ~/Buildo-scratch/mcbylaws/inc6/recap/READY-OPTA-20261117.md#L50
    sha256=7b35801f4dd9
  - >-
    ~/Buildo-scratch/mcbylaws/inc6/recap/READY-OPTA-20261117.md#L5
    sha256=a67ae1d3249f
  - >-
    ~/Buildo-scratch/mcbylaws/inc6/PARTB-SEQUENCE-20261116.md#L24
    sha256=9c1a039e4ec4
documentation:
  - backlog/docs/increments/doc-8 - Increment-6-requirements.md
priority: high
type: db-rehearsal
project: McIncrement
ordinal: 8010
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: UNMEASURED

Plan text at the snapshot: WAITING on 6.9
planNote: 6: status WAITING on 6.9 (optimize-6/decisions-6-final.json 6.10)
note: Job MIG330. Depends on the open D7-3 decision (row 3 NOT approved as worded) as well as D7-1 and D7-2.
who (plan text): runner
plan source tags: ROW:MIG330:rehearse MIG330:rehearsal
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The job ran end to end on the test stack first — "Rehearse every DB job before the go." (docs/specs/00-architecture/08_agents.md:495)
- [ ] #2 The real commit hooks ran on the rehearsal captures with rc 0 — "Then the real commit hooks run on the rehearsal captures" (docs/specs/00-architecture/08_agents.md:495)
- [ ] #3 The Idempotency lens ran on the job — "Idempotency lens (mandatory)" (.cursor/MCBYLAWS-QUEUE.md:244)
- [ ] #4 The night is sized with the exact G-STOR figure plus a measured test write — "exact G-STOR plus a measured test write" (~/Buildo-scratch/mcbylaws/McSTORAGE-RULINGS.md:75)
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
