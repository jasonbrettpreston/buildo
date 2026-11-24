---
id: TASK-62
title: '6.43 Push 6: the Part B commit, operator tty'
status: DONE
assignee:
  - '@operator'
created_date: '2026-11-19T04:57:00Z'
updated_date: '2026-11-24T14:42:00Z'
due_date: '2026-11-26'
labels:
  - '6'
  - plan:6.43
  - plan:OPTA:push6
  - comp:PAN
  - comp:FIVE
  - comp:SC
  - comp:STAT
  - comp:PUSH
  - comp:HS
  - comp:ID
  - comp:MAP
  - dead
milestone: m-7
dependencies:
  - TASK-61
  - TASK-60
  - TASK-36
  - TASK-33
  - TASK-35
  - TASK-19
  - TASK-20
  - TASK-21
  - TASK-22
  - TASK-23
  - TASK-24
  - TASK-25
  - TASK-26
  - TASK-27
  - TASK-28
  - TASK-29
  - TASK-30
  - TASK-31
  - TASK-32
  - TASK-34
  - TASK-37
  - TASK-38
  - TASK-39
  - TASK-40
  - TASK-41
  - TASK-42
  - TASK-43
  - TASK-44
  - TASK-45
  - TASK-46
  - TASK-47
  - TASK-48
  - TASK-49
  - TASK-50
  - TASK-51
  - TASK-52
  - TASK-53
  - TASK-54
  - TASK-55
  - TASK-56
  - TASK-57
  - TASK-58
  - TASK-59
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#6/OPTA:push6
  - >-
    ~/Buildo-scratch/mcbylaws/inc6/recap/READY-OPTA-20261117.md#L13
    sha256=7552faf5b288
  - ~/Buildo-scratch/inc6-guard/RULES.md#L1 sha256=36ceb363efae
  - ~/Buildo-scratch/inc6-guard/RULES.md#L8 sha256=cb54de861a9b
  - >-
    ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L553
    sha256=f619b2202bf3
documentation:
  - backlog/docs/increments/doc-8 - Increment-6-requirements.md
priority: high
type: push
project: McIncrement
ordinal: 8043
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: UNMEASURED

Plan text at the snapshot: WAITING on 6.42
planNote: 6: dependsOn 6.42,6.18,6.19,6.16,6.17,6.1,6.2,6.3,6.4,6.5,6.6,6.7,6.8,6.9,6.10,6.11,6.12,6.13,6.14,6.15,6.20,6.21,6.22,6.23,6.24,6.25,6.26,6.27,6.28,6.29,6.30,6.31,6.32,6.33,6.34,6.35,6.36,6.37,6.38,6.39,6.40,6.41,6.7a (optimize-6/decisions-6-final.json 6.43)
planNote: 6: status WAITING on 6.42 (optimize-6/decisions-6-final.json 6.43)
note: Contents: Part B commit + D7 record + scorecards + loop record + the inc-6 records batch (all records items in this increment, riding this push, no push of their own).
who (plan text): operator
plan source tags: ROW:OPTA:push6 PUSH:6
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-19 closed on evidence: push 6 landed 2026-11-18T22:22:54Z (~/Buildo-scratch/push-station/push.log "push e9bd70288 -> wf1/mb-rulings rc=0"); the Part B commit 517df6c22, the records a8ce7ad79 and the scorecard refresh bd1f246cc are ancestors of origin/wf1/mb-rulings (git log --grep "Part B"); recorded at MORNING-DECISIONS.md:983. The board still showed WAITS from the import snapshot. Its still-open dependency rows (6.8 to 6.42) keep their own status until the m-7 relevancy pass (task-1 AC 7).
<!-- SECTION:NOTES:END -->
