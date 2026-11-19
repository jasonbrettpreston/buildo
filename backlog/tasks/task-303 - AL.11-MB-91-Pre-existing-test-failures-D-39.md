---
id: TASK-303
title: AL.11 MB-91 Pre-existing test failures (D-39)
status: OPERATOR
assignee:
  - '@lane'
created_date: '2026-11-19T04:57:00Z'
updated_date: '2026-11-19T14:14:00Z'
due_date: '2026-11-26'
labels:
  - AL
  - plan:AL.11
  - plan:MB-91
  - held-unruled
  - queue-row
  - comp:PAN
  - comp:FIVE
  - comp:SC
  - comp:STAT
  - comp:BLD
  - comp:HS
  - comp:BYL
milestone: m-14
dependencies: []
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#AL/MB-91
  - .cursor/MCBYLAWS-QUEUE.md#L853 sha256=9fd9da987e3b ROW:MB-91
  - >-
    ~/Buildo-scratch/queues-20261113/MB-REVIEW-20261117.md#L132
    sha256=63e171e2306b
  - >-
    ~/Buildo-scratch/queues-20261113/MB-REVIEW-20261117.md#L121
    sha256=9aac4ba52441
documentation:
  - backlog/docs/increments/doc-15 - Increment-AL-requirements.md
priority: low
type: record
project: McBylaws
ordinal: 15011
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: GUESS unscheduled; not on the launch path

Plan text at the snapshot: HELD to freeze lift
planNote: L: estimate GUESS unscheduled; not on the launch path (PLAN-PROTOCOL 5.5)
planNote: L: status HELD to freeze lift (optimize-L final status)
who (plan text): lane
queue row: MB-91 (row status LATER · since 2026-11-17 · expires when the infra freeze lifts · next: Hold; refresh pgTAP/test:db failure count first); the row stays the record (Spec 137 rule 2) and the lane edits the row and this task in the same commit (rule 3)

Grounded: yes. Row MB-91 reads 'LATER ... expires when the infra freeze lifts ... Hold; refresh pgTAP/test:db failure count first' (task-303 description); the review: "yes in principle: 4 pgTAP and 5 test:db cases fail on the tip; count not refreshed", verdict RE-DATE (~/Buildo-scratch/queues-20261113/MB-REVIEW-20261117.md:132). The count refresh needs the test stack, which this lane does not touch: UNVERIFIED today. Operator scope (RR-0233, plan-gen/rulings-register.json cite MORNING-DECISIONS.md:925): "front-end, design of the app, how much storage, timeframes, priorities". The word owed is a priority and timeframe call (when the freeze lifts for this item).
Recommendation: refresh the failure count (first step, owned by a lane with the test stack), then hold under the freeze (MB-REVIEW-20261117.md:132 "Refresh the count; hold under the freeze"). UNVERIFIED: review r1 of task-306 (r1-plan.txt) tested the routing of this item, not the answer.
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-19 (BL-R7b): stays WAITS; operator word owed: the freeze-lift word for this item (plan text 'HELD to freeze lift' / 'HELD under the infra freeze'; no operator words found).

Dated note 2026-11-19 (M-246, prior text kept; RR-0232 · task-303 · Backlog; operator, verbatim: "recommendation approved - however the open decisions need to provide whether it has been grounded (the issue) and the recommendation (verified).")

Dated note 2026-11-19 (M-246, prior text kept; RR-0233 · task-303 · Backlog; operator, verbatim: "I really only have expertise in the front-end, design of the app, how much storage, timeframes, priorities - beyond that my expertise is limited and I need to rely on yo or the panel or the gates to make sure the rules are followed and we are making prudent decisions")
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: plan-to-backlog
created: 2026-11-19T04:58:00Z

---

The plan text reads "HELD to freeze lift"; no ruling is on file, so none is invented. Open question for the operator.

---
<!-- COMMENTS:END -->
