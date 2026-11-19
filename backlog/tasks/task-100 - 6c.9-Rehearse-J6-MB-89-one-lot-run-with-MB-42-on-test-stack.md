---
id: TASK-100
title: '6c.9 Rehearse J6: MB-89 one-lot run with MB-42 on test stack'
status: WAITS
assignee:
  - '@runner'
created_date: '2026-11-19T04:57:00Z'
updated_date: '2026-11-19T04:58:00Z'
due_date: '2026-11-26'
labels:
  - 6c
  - plan:6c.9
  - plan:J6
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
  - comp:BYL
milestone: m-8
dependencies:
  - TASK-62
  - TASK-97
  - TASK-98
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#6c/J6
  - >-
    ~/Buildo-scratch/lanes-20261117/dbjobs-review/REPORT.md#L7
    sha256=c5dfcdbc403c
  - >-
    ~/Buildo-scratch/lanes-20261117/owner-inputs/REPORT.md#L8
    sha256=335cecf3b966
  - >-
    ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L577
    sha256=c5ee7c2a2c4f
  - >-
    ~/Buildo-scratch/lanes-20261117/owner-inputs/REPORT.md#L12
    sha256=cf7705944f99
documentation:
  - backlog/docs/increments/doc-9 - Increment-6c-requirements.md
priority: high
type: db-rehearsal
project: McIncrement
ordinal: 9009
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: UNMEASURED

Plan text at the snapshot: WAITING on 6.43, 6c.6 and 6c.7
planNote: 6: dependsOn 6.43,6c.6,6c.7 (optimize-6c/decisions-6c-final.json 6c.9)
planNote: 6: status WAITING on 6.43, 6c.6 and 6c.7 (optimize-6c/decisions-6c-final.json 6c.9)
note: J6 (MB-89 one-lot run with MB-42). After push 6 (re-read per D7-5), not after the inc-6 recapture, unless its one-lot run needs current rows (then after J9). Migration number claimed by mkdir at build (next free mig-333); mig-331 and mig-332 are claimed (MB-90, MB-95). Needs the INC-6c R1/R2/R4 ruling first.
who (plan text): runner
plan source tags: ROW:J6 J6:rehearsal
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Dated note 2026-11-18 (M-246, prior text kept; RR-0162 · task-100 · Backlog; operator, verbatim: "ONE-1 "y"")
<!-- SECTION:NOTES:END -->
