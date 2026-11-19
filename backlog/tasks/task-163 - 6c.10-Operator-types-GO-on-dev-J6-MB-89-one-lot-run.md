---
id: TASK-163
title: '6c.10 Operator types GO on dev: J6 MB-89 one-lot run'
status: WAITS
assignee:
  - '@operator'
created_date: '2026-11-19T04:57:00Z'
due_date: '2026-11-26'
labels:
  - 6c
  - plan:6c.10
  - plan:X:J6-go
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
  - TASK-100
  - TASK-162
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#6c/X:J6-go
  - docs/specs/00-architecture/08_agents.md#L495 sha256=1732e7f9b5ca
  - >-
    ~/.claude/projects/-Users-brettpreston-macmini/memory/dev-go-typed-by-operator.md#L14
    sha256=a9e6ef484229
documentation:
  - backlog/docs/increments/doc-9 - Increment-6c-requirements.md
priority: high
type: db-go
project: McIncrement
ordinal: 9010
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: UNMEASURED

Plan text at the snapshot: WAITING on 6c.9
planNote: 6: status WAITING on 6c.9 (optimize-6c/decisions-6c-final.json 6c.10)
planNote: integrate: dependsOn ["6c.9","7.22"] (Spec 137 rule 9 (one DB job at a time): J6 GO sits after J1 GO (7.22), before the J7 GO; J6 and J3/J4/J5/J1/J7 were unordered in the plan)
note: Operator-typed GO on dev for J6.
who (plan text): operator
plan source tags: GO:J6 J6:go
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The go is asked only after the rehearsal gates pass — "OPERATOR-GO is asked only after both pass." (docs/specs/00-architecture/08_agents.md:495)
- [ ] #2 One DB job at a time, an operator go, a dump first, disk 10 GiB or more — "with an operator go, a dump first, disk ≥ 10 GiB" (.cursor/MCBYLAWS-QUEUE.md:256)
- [ ] #3 The DB lane runs one job at a time — "The DB lane runs one job at a time, beside the other lanes." (docs/specs/00-architecture/137_mcqueue.md:106)
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
