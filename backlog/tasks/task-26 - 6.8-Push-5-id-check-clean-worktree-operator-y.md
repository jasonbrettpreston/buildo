---
id: TASK-26
title: '6.8 Push 5: id check, clean worktree, operator y'
status: LATER
assignee:
  - '@operator'
created_date: '2026-11-19T04:57:00Z'
due_date: '2026-11-26'
labels:
  - '6'
  - plan:6.8
  - plan:OPTA:push5
  - unverified
  - comp:PAN
  - comp:FIVE
  - comp:SC
  - comp:STAT
  - comp:PUSH
  - comp:HS
  - comp:ID
  - comp:MAP
  - comp:DN
milestone: m-7
dependencies:
  - TASK-19
  - TASK-25
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#6/OPTA:push5
  - >-
    ~/Buildo-scratch/mcbylaws/inc6/recap/READY-OPTA-20261117.md#L9
    sha256=dd5b0989b8f7
  - >-
    ~/Buildo-scratch/mcbylaws/inc6/PARTB-SEQUENCE-20261116.md#L32
    sha256=301a9487162b
  - ~/Buildo-scratch/inc6-guard/RULES.md#L8 sha256=cb54de861a9b
  - >-
    ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L553
    sha256=f619b2202bf3
documentation:
  - backlog/docs/increments/doc-8 - Increment-6-requirements.md
priority: high
type: push
project: McIncrement
ordinal: 8008
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: UNMEASURED

Plan text at the snapshot: READY
planNote: 6: status READY (optimize-6/decisions-6-final.json 6.8)
note: Contents: door note 3eee4881d + prereg-62 154e7b13f only (D7-4); the three CoA map commits are held until O-15 (e).
who (plan text): operator
plan source tags: ROW:OPTA:push5 PUSH:5
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
