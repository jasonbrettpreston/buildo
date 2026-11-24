---
id: TASK-404
title: >-
  FOLD.OBJECTIVES OPERATOR DECISION FIRST: attach the principles and the plan
  protocol to every compliance review
status: LATER
assignee: []
created_date: '2026-11-20T16:34:00Z'
updated_date: '2026-11-24T14:42:00Z'
labels:
  - McFix
  - McFix Z
  - dead
milestone: m-1
dependencies: []
type: build
ordinal: 104012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Validated before writing by a separate read-only grounder (2026-11-20; verdict relayed to the operator; it ran no tests). Operator, 2026-11-20, verbatim: "Add this as Mcfix Z tasks - and show me that it works - ensure to validate it before you build these tasks" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md, entry "Operator ORDERS the McFix Z tasks"). Why: on 2026-11-20 eight lane branches were folded onto the board by a raw fast-forward merge with reviews done as messages and no GROUNDER.md; the close check (scripts/hooks/check-lane-close.mjs) runs only when a task moves to finished, so it never ran. Finding: the launch script attaches the rule lists resolved from the task Files line and the increment requirements doc; the milestone objectives go into the ticket and the review context file; the five principles and PLAN-PROTOCOL are attached nowhere, and the compliance lens command passes no context file, so it never sees the objectives. Operator, verbatim: 'we have launch script already - this is upposed to include the complaince rules, project objectives etc.' Decision for the operator before any build: add one always-attached list (the five principles, PLAN-PROTOCOL, the milestone objectives) that the compliance lens runs on for every task: yes or no, and which documents. Where the five principles live as a file is NOT established. Scope if yes: resolveTask and one table entry. Acceptance: every brief lists it; the close check requires its compliance output. Files: scripts/analysis/rule-lists.mjs, scripts/analysis/rule-lists.json
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
McFix V2 review 2026-11-20 (orchestrator recommendation, not a ruling; status not changed by hand): SUPERSEDED by V2.LIST (parts 2 and 4). The operator agreed the documents are attached to every task ("Agreed attah to all tasks should you attach the relvant compliance documents"). Recommend DROPPED.

2026-11-20 operator ruling (M-246, prior text kept), ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1610, verbatim: "approved", to the list he pasted back; the item for this task as put to him: "Record 385, 397, 400 and 404 as dropped, and 371 and 377 as closed superseded. Recommended yes.". The decision record tool holds one record per quote and cite (decision-126, RR-0341, carries the same approval), so this note is the record on this task. No status is moved by hand.
<!-- SECTION:NOTES:END -->
