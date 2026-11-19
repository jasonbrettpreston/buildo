---
id: TASK-311
title: MF-08 Operator rules the REPORT performance numbers
status: OPERATOR
assignee:
  - '@operator'
created_date: '2026-11-19T13:07:00Z'
updated_date: '2026-11-19T14:14:00Z'
labels:
  - queue-row
  - open-decisions
milestone: m-8
dependencies: []
references:
  - .cursor/MCFRONTEND-QUEUE.md#L60 ROW:MF-08
type: decision
project: McFrontend
ordinal: 20012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: MF-08 Operator rules the REPORT performance numbers

queue row: MF-08 (lane R; row status OPERATOR · since 2026-11-09 · expires 2026-11-16 · next: G1 #8 · Operator rules the report performance numbers); the row stays the record (Spec 137 rule 2) and a lane edits the row and this task in the same commit (rule 3). Mirrored by task-306 (R8a, RR-0232) because the row expired 2026-11-16 and waits on the operator's renew, drop or answer word.

Grounded: yes. Row MF-08 'Operator rules the REPORT performance numbers', Status: OPERATOR since 2026-11-09, expires 2026-11-16, next 'G1 #8' (.cursor/MCFRONTEND-QUEUE.md:60-61). Spec 137 rule 7: "Open rows expire in 7 days, unless the operator sets another date" and the row is resurfaced, never closed automatically (docs/specs/00-architecture/137_mcqueue.md:112). Its wait MF-33 is DONE 2026-11-09 (.cursor/MCFRONTEND-QUEUE.md:75-76), so only the operator's number is open. The card lists the options (~/Buildo-scratch/mcfrontend/CARD-MF-08-budgets.md:19-21). Operator scope (RR-0233, plan-gen/rulings-register.json cite MORNING-DECISIONS.md:925): "front-end, design of the app, how much storage, timeframes, priorities". The number is a timeframe and front-end performance call. Milestone m-8 (Increment 6c) is placed by the plan items 6c.24 and 6c.26 (task-110, task-112, milestone m-8) that carry the refresh of these expired rows (~/Buildo-scratch/lanes-20261117/inc-plan/integrate/ONE-SITTING.md:21), not by the row itself: UNVERIFIED as increment ownership. The mirror shows the row as waiting on the operator's renew, drop or answer word (Spec 137 rule 7), not the row's own status word.
Recommendation: option A of the card, renew and rule the formula only: number = measured max gz of the real REPORT response over the 25 lots x 1.2, rounded up to 0.1 KB, written once to the protected tighten-only file (~/Buildo-scratch/mcfrontend/CARD-MF-08-budgets.md:19 "A. Renew WAITS; rule the formula only (recommended)"). UNVERIFIED: review r1 of task-306 (r1-plan.txt) tested the routing of this item, not the answer.
<!-- SECTION:DESCRIPTION:END -->

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
Dated note 2026-11-19 (M-246, prior text kept; RR-0232 · task-311 · Backlog; operator, verbatim: "recommendation approved - however the open decisions need to provide whether it has been grounded (the issue) and the recommendation (verified).")

Dated note 2026-11-19 (M-246, prior text kept; RR-0233 · task-311 · Backlog; operator, verbatim: "I really only have expertise in the front-end, design of the app, how much storage, timeframes, priorities - beyond that my expertise is limited and I need to rely on yo or the panel or the gates to make sure the rules are followed and we are making prudent decisions")
<!-- SECTION:NOTES:END -->
