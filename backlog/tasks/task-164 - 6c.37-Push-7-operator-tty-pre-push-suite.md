---
id: TASK-164
title: '6c.37 Push 7: operator tty, pre-push suite'
status: WAITS
assignee:
  - '@operator'
created_date: '2026-11-19T04:57:00Z'
due_date: '2026-11-26'
labels:
  - 6c
  - plan:6c.37
  - plan:X:push7
  - comp:PAN
  - comp:FIVE
  - comp:SC
  - comp:STAT
  - comp:PUSH
  - comp:HS
  - comp:ID
  - comp:MAP
milestone: m-8
dependencies:
  - TASK-62
  - TASK-121
  - TASK-97
  - TASK-98
  - TASK-99
  - TASK-122
  - TASK-100
  - TASK-163
  - TASK-136
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#6c/X:push7
  - docs/specs/00-architecture/08_agents.md#L492 sha256=36714499b353
  - ~/Buildo-scratch/inc6-guard/RULES.md#L7 sha256=65b3fdb86726
  - >-
    ~/Buildo-scratch/mcbylaws/inc6/PARTB-SEQUENCE-20261116.md#L32
    sha256=301a9487162b
documentation:
  - backlog/docs/increments/doc-9 - Increment-6c-requirements.md
priority: high
type: push
project: McIncrement
ordinal: 9037
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: UNMEASURED

Plan text at the snapshot: BLOCKED by 6.43 and the 6c items it lands
planNote: 5: dependsOn add 5.1, 5.3, 5.8 (push 7 carries the A2/A3 bind and the A1a and A4r records)
planNote: 6: dependsOn 6.43,6c.5a,6c.6,6c.7,6c.8,6c.8a,6c.9,6c.10,6c.11 (optimize-6c/decisions-6c-final.json 6c.37)
planNote: 6: status BLOCKED by 6.43 and the 6c items it lands (optimize-6c/decisions-6c-final.json 6c.37)
planNote: 6: note push 7 landing set gains R6-TEXT, R6-CARD, R6-CHECK (and R6-COST if ruled); not push 6 (slice parts (3)(4)(5)(6)(9))
planNote: holistic-r1: absorbs 7.24: Push 8: operator tty, pre-push suite
note: Contents: INC-6c build + MB-42 + NOW-A + FLK/MB-106 + docs commit of closes + BOARD + records.
who (plan text): operator
plan source tags: PUSH:7
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The operator approves at the terminal — "the operator reads the one-screen summary of protected-path changes and approves the push" (.cursor/MCBYLAWS-QUEUE.md:117)
- [ ] #2 One push per landing set — "One push per landing set." (docs/specs/00-architecture/08_agents.md:492)
- [ ] #3 The ID ledger check ran before the push command — "The orchestrator runs the ledger check" (docs/specs/00-architecture/08_agents.md:496)
- [ ] #4 The full suite ran on the tip before ready — "The full suite runs on the current origin tip before" (docs/specs/00-architecture/08_agents.md:490)
- [ ] #5 The gate summary is shown and the push gate passes — "node scripts/analysis/mcbylaws/gate.mjs --push" (.husky/pre-push:41)
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
