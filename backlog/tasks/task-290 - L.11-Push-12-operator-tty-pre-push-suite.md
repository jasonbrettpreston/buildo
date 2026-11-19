---
id: TASK-290
title: 'L.11 Push 12: operator tty, pre-push suite'
status: WAITS
assignee:
  - '@operator'
created_date: '2026-11-19T04:57:00Z'
due_date: '2026-11-26'
labels:
  - L
  - plan:L.11
  - plan:X:push12
  - comp:PAN
  - comp:FIVE
  - comp:SC
  - comp:STAT
  - comp:PUSH
  - comp:HS
  - comp:ID
  - comp:MAP
  - comp:DN
milestone: m-13
dependencies:
  - TASK-253
  - TASK-254
  - TASK-255
  - TASK-256
  - TASK-257
  - TASK-258
  - TASK-273
  - TASK-274
  - TASK-259
  - TASK-285
  - TASK-260
  - TASK-275
  - TASK-115
  - TASK-264
  - TASK-288
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#L/X:push12
  - docs/specs/00-architecture/08_agents.md#L492 sha256=36714499b353
  - ~/Buildo-scratch/inc6-guard/RULES.md#L7 sha256=65b3fdb86726
  - >-
    ~/Buildo-scratch/mcbylaws/inc6/PARTB-SEQUENCE-20261116.md#L32
    sha256=301a9487162b
documentation:
  - backlog/docs/increments/doc-14 - Increment-L-requirements.md
priority: high
type: push
project: McIncrement
ordinal: 14011
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: GUESS 0.25 day; pre-push suite about 11 min (PARTB-SEQUENCE-20261116.md:32, a plan figure)

Plan text at the snapshot: WAITING every dependency; L.8 and L.9 are dependencies only if lot views are live (L.2, L.3 ruled yes), else struck
planNote: L: dependsOn ["10.8","L.1","L.2","L.3","L.4","L.5","L.5a","L.5b","L.6","L.7","L.8","L.9","L.10"] (optimize-L CONFIRMED: )
planNote: L: estimate GUESS 0.25 day; pre-push suite about 11 min (PARTB-SEQUENCE-20261116.md:32, a plan figure) (PLAN-PROTOCOL 5.5)
planNote: L: status WAITING every dependency; L.8 and L.9 are dependencies only if lot views are live (L.2, L.3 ruled yes), else struck (optimize-L final status)
planNote: integrate: dependsOn ["10.8","L.1","L.2","L.3","L.4","L.5","L.5a","L.5b","L.6","L.7","L.8","L.9","L.10","L.13","L.12"] (push 12 carries L.13; L.12 only if lot views are live (same condition as L.8, L.9))
note: Contents: MB-38 shadow/switch-over with headline table and on-demand detail, MB-44, MB-100 ruling, LAUNCH-DEF record, and MB-109 only if lot views are live and its plan is ruled.
who (plan text): operator
plan source tags: PUSH:12
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
