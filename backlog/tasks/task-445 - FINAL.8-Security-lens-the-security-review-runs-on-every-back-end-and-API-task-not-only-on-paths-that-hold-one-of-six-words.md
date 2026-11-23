---
id: TASK-445
title: >-
  FINAL.8 Security lens: the security review runs on every back-end and API
  task, not only on paths that hold one of six words
status: LATER
assignee: []
created_date: '2026-11-23T01:50:00Z'
updated_date: '2026-11-23T01:50:00Z'
labels:
  - McFix
  - McFix Final
milestone: m-1
dependencies: []
type: build
ordinal: 145012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-22 by the orchestrator, Spec 137 rule 2, on the operator's ruling RR-0391 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1969). Operator, verbatim: "add it." and, on what he saw of today's reviews, "Teh missing one is security" (same entry, :1968). THE GAP, read at the board head bb3a94efa: a security lens exists (.claude/review-templates/lens-security.md) but lensSet attaches it only when the task's Files text matches /entitlement|auth|stripe|metered|admin|pii/i (scripts/analysis/rule-lists.mjs:186), so an API route whose path holds none of those words (example src/app/api/parcels/search/route.ts) gets no security review at the plan or at the output; it gets only section 4 of the engineering standards through the engineering seat. THIS TASK: the smallest change so the security lens runs on every back-end and API task (the paths the rule table's api-lib and step-pipeline rows govern), keeping the six words as they are; tests first, both directions. NOT in this task: a new lens, a new gate, a change to the lens template, front-end rows (unless the plan review rules them in with a named reason). McFix Final process (RR-0385): Opus plan, three Sonnet seats, compliance and engineering lenses, separate grounder, Opus build, output review, two rounds at most. Scope and Files line at its plan review (the lensSet line is in scripts/analysis/rule-lists.mjs, a protected path).
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
Dated note 2026-11-22 (M-246, prior text kept; RR-0391 · task-445 · Backlog; operator, verbatim: "add it. Then once these close move on to the Mcfix plan for the closed and built tasks with the new approach.")
<!-- SECTION:NOTES:END -->
