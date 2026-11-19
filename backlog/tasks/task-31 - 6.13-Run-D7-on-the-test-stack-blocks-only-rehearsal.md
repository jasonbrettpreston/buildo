---
id: TASK-31
title: 6.13 Run D7 on the test stack (blocks-only rehearsal)
status: WAITS
assignee:
  - '@runner'
created_date: '2026-11-19T04:57:00Z'
due_date: '2026-11-26'
labels:
  - '6'
  - plan:6.13
  - plan:OPTA:d7-rehearsal
  - comp:PAN
  - comp:FIVE
  - comp:SC
  - comp:STAT
  - comp:MCP
  - comp:DDV
  - comp:FIT
  - comp:BLD
  - comp:HS
  - comp:STO
milestone: m-7
dependencies:
  - TASK-30
  - TASK-29
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#6/OPTA:d7-rehearsal
  - >-
    ~/Buildo-scratch/mcbylaws/inc6/recap/READY-OPTA-20261117.md#L52
    sha256=b0fc131718fc
  - >-
    ~/Buildo-scratch/mcbylaws/inc6/recap/READY-OPTA-20261117.md#L5
    sha256=a67ae1d3249f
  - ~/Buildo-scratch/inc6-guard/RULES.md#L8 sha256=cb54de861a9b
  - >-
    ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L553
    sha256=f619b2202bf3
documentation:
  - backlog/docs/increments/doc-8 - Increment-6-requirements.md
priority: high
type: db-rehearsal
project: McIncrement
ordinal: 8013
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: [object Object]

Plan text at the snapshot: WAITING on 6.12
planNote: 6: status WAITING on 6.12 (optimize-6/decisions-6-final.json 6.13)
note: D7 on the test stack, blocks-only part, is THE D7 run (D7-5 ruled; no dev run). Hours are the M14 test-stack analog (~10.5 h), not measured for inc 6.
who (plan text): runner
plan source tags: ROW:OPTA:d7-rehearsal D7run:rehearsal
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
