---
id: TASK-275
title: 'L.9 Operator types GO on dev: MB-109 (only if lot views live)'
status: WAITS
assignee:
  - '@operator'
created_date: '2026-11-19T04:57:00Z'
labels:
  - L
  - plan:L.9
  - plan:X:MB109-go
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
milestone: m-13
dependencies:
  - TASK-260
  - TASK-274
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#L/X:MB109-go
  - docs/specs/00-architecture/08_agents.md#L495 sha256=1732e7f9b5ca
  - >-
    ~/.claude/projects/-Users-brettpreston-macmini/memory/dev-go-typed-by-operator.md#L14
    sha256=a9e6ef484229
documentation:
  - backlog/docs/increments/doc-14 - Increment-L-requirements.md
priority: high
type: db-go
project: McIncrement
ordinal: 14009
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
when: L.8 DONE
snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: GUESS 0.25 day

Plan text at the snapshot: CONDITIONAL as L.8
planNote: L: estimate GUESS 0.25 day (PLAN-PROTOCOL 5.5)
planNote: L: status CONDITIONAL as L.8 (optimize-L final status)
planNote: integrate: dependsOn ["L.8","L.5b"] (Spec 137 rule 9: the conditional MB-109 GO after the MB-38 fill GO (L.5b))
note: MB-109 typed GO. CONDITIONAL as the rehearsal.
who (plan text): operator
plan source tags: MB-109:go
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
