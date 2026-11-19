---
id: TASK-37
title: '6.20 Record D7-once ruling: dated note, R-LR carve-out, db_target 55322'
status: LATER
assignee:
  - '@lane'
created_date: '2026-11-19T04:57:00Z'
due_date: '2026-11-26'
labels:
  - '6'
  - plan:6.20
  - plan:X:D7-5-note
  - unverified
  - comp:PAN
  - comp:FIVE
  - comp:SC
  - comp:STAT
  - comp:DN
  - comp:REN
milestone: m-7
dependencies: []
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#6/X:D7-5-note
  - >-
    ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L601
    sha256=028a5af16344
  - >-
    ~/Buildo-scratch/queues-20261113/decisions/DECISIONS-20261117-D7.md#L8
    sha256=cf4bf04d3ec4
documentation:
  - backlog/docs/increments/doc-8 - Increment-6-requirements.md
priority: low
type: record
project: McIncrement
ordinal: 8020
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: UNMEASURED

Plan text at the snapshot: READY
planNote: 6: status READY (optimize-6/decisions-6-final.json 6.20)
note: RULED by the operator 2026-11-17 ~11:20 ("y add it to the plan."): D7 runs ONCE on the test stack (MCINC-7), the Part B commit is made from that run, there is no D7 dev run and no typed GO for it; R-LR (Spec 124a:1032) carve-out: a commit from a test-stack capture under M-514 is allowed and the commit message names db_target 127.0.0.1:55322; dev Layer 3 stays at increment-5 content (stale word) until INC8-RECAP (J9), the one dev refresh; MIG330 still on dev. Dated note lands in the push-6 records batch. Saves about 9.5-11 h machine time and one typed GO; inc 6 closes about 12.5 h earlier (lanes-20261117/d7-once/REPORT.md).
who (plan text): lane
plan source tags: D7:5 D7dev:superseded
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The ruling is copied verbatim with date and row id, prior text kept — "A ruling enters a row as a verbatim dated note." (docs/specs/00-architecture/137_mcqueue.md:109)
- [ ] #2 Entered the same day — "The orchestrator writes each ruling into the row's status line the same day." (docs/specs/00-architecture/137_mcqueue.md:87)
- [ ] #3 Where it is a register row, it cites its log entry and the log check is green — "RED (exit 1) when an approved decision has no citing register row" (scripts/analysis/decision-log.mjs:16)
- [ ] #4 The handbook line is cited, or a new register row is drafted — "every V3-step or by-law decision cites" (docs/specs/01-pipeline/124a_step_standard_policy_appendix.md:988)
- [ ] #5 The status line of the row changes in the same commit — "The status line changes in the same commit as the work." (docs/specs/00-architecture/137_mcqueue.md:84)
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
