---
id: TASK-255
title: 'L.2 Rule: lot views in live layout? (parcel_lot_view step)'
status: WAITS
assignee:
  - '@operator'
created_date: '2026-11-19T04:57:00Z'
due_date: '2026-11-22'
labels:
  - L
  - plan:L.2
  - plan:MB-109
  - queue-row
  - comp:PAN
  - comp:FIVE
  - comp:SC
  - comp:STAT
  - comp:DN
  - comp:REN
milestone: m-13
dependencies:
  - TASK-98
  - TASK-100
  - TASK-254
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#L/MB-109
  - .cursor/MCBYLAWS-QUEUE.md#L999 sha256=2f12e7f5d707 ROW:MB-109
  - >-
    ~/Buildo-scratch/queues-20261113/MB-REVIEW-20261117.md#L126
    sha256=4a6900265822
  - >-
    ~/Buildo-scratch/lanes-20261117/ground-audit/REPORT.md#L58
    sha256=4128f2dc319d
  - >-
    ~/Buildo-scratch/lanes-20261117/dbjobs-review/REPORT.md#L11
    sha256=c78735f724b9
  - ~/Buildo-scratch/lanes-20261117/repanel/REPORT.md#L26 sha256=801d3dab6287
documentation:
  - backlog/docs/increments/doc-14 - Increment-L-requirements.md
priority: high
type: decision
project: McBylaws
ordinal: 14002
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: GUESS one sitting line

Plan text at the snapshot: WAITING L.1
planNote: L: estimate GUESS one sitting line (PLAN-PROTOCOL 5.5)
planNote: L: status WAITING L.1 (optimize-L final status)
note: Asks whether lot views are in the live layout; needs the M-465 (7) amendment or named acceptance first. If not live, strike the MB-109 rehearsal and GO.
who (plan text): operator
queue row: MB-109 (row status WAITS · since 2026-11-15 · expires 2026-11-22 · next: Plan after the M14 dev run frees the test stack: owner spec, manifest and chain slot, the migration, the capture night (waits: M14 dev run; MF-83 group 3 landed) · ruling: "All reco's accepted 1- 4"); the row stays the record (Spec 137 rule 2) and the lane edits the row and this task in the same commit (rule 3)
plan source tags: MB-109:decision
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One decision list to the operator, rule quoted, compliant options only, recommendation — "One decision list. Every ruling the map needs goes to the operator at once." (docs/specs/00-architecture/08_agents.md:489)
- [ ] #2 No rule found means a card with the search shown, not a decision — "If it is not in a handbook or spec, STOP" (.cursor/MCBYLAWS-QUEUE.md:226)
- [ ] #3 Scope grows only by a ruling — "scope may expand only by a ruling" (docs/specs/01-pipeline/124a_step_standard_policy_appendix.md:988)
- [ ] #4 Before it reaches the operator the cited lines are opened and any no-rule claim is grep-checked — "before any recommendation reaches the operator, the orchestrator opens the cited source lines itself" (~/Buildo-scratch/panel-tools/PROTOCOL.md:48)
- [ ] #5 The answer is recorded verbatim — "Operator, 2026-11-14, verbatim" (docs/specs/00-architecture/137_mcqueue.md:18)
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
