---
id: TASK-25
title: 6.7 Finish D6 (INC6-NIGHT dev night), release locks
status: DONE
assignee:
  - '@runner'
created_date: '2026-11-19T04:57:00Z'
updated_date: '2026-11-24T18:40:00Z'
labels:
  - dead
milestone: m-7
dependencies: []
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#6/OPTA:d6-finish
  - >-
    ~/Buildo-scratch/mcbylaws/inc6/recap/READY-OPTA-20261117.md#L48
    sha256=17a39425d7ac
  - ~/Buildo-scratch/inc6-guard/RULES.md#L1 sha256=36ceb363efae
  - ~/Buildo-scratch/inc6-guard/RULES.md#L8 sha256=cb54de861a9b
  - >-
    ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L553
    sha256=f619b2202bf3
documentation:
  - backlog/docs/increments/doc-8 - Increment-6-requirements.md
priority: high
type: night
project: McIncrement
ordinal: 8007
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: UNMEASURED

Plan text at the snapshot: DONE: D6 closed 11:54:13, SUITE.lock released (night.log)
planNote: 6: status DONE: D6 closed 11:54:13, SUITE.lock released (night.log) (optimize-6/decisions-6-final.json 6.7)
note: Running now. Everything marked parallel runs while it runs (no test stack, dev DB or suite lock). D6: rehearsal 1 PASS (2 h 33 m MEASURED), dev GO already typed; "rehearsal 2 owed" is carried as written in the DB-job list.
who (plan text): runner
plan source tags: ROW:OPTA:d6-finish D6:rehearsal D6:go
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 At most one Layer 2 night per increment — "At most one Layer 2 night per increment, from the standard checklist." (docs/specs/00-architecture/08_agents.md:491)
- [ ] #2 The night record follows the checklist form — "dry run, prereg, go, C1-C6, the night record" (docs/specs/00-architecture/08_agents.md:491)
- [ ] #3 Reality-Check reads the loaded rows — "Reality-Check on the loaded rows + Guardian" (.cursor/MCBYLAWS-QUEUE.md:244)
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
