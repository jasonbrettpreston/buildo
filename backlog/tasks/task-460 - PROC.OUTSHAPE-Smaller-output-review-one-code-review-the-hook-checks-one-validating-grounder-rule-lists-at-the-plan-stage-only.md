---
id: TASK-460
title: >-
  PROC.OUTSHAPE Smaller output review: one code review, the hook checks, one
  validating grounder; rule lists at the plan stage only
status: LATER
assignee: []
created_date: '2026-11-24T18:04:00Z'
labels:
  - ProcessImprovement
milestone: m-1
dependencies: []
type: fix
ordinal: 154210
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-24 by the orchestrator from RR-0457 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2367), RR-0458 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2372) and RR-0459 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2377). Operator, verbatim: "I agree let's see the plan below"; "the output approach can stay for all front-end back end etc."; "Let's not do it. Create the task and go! Add label to it - ProcessImprovement." (the last: no error-paths review at the output stage).

What changes, for the OUTPUT review of every build or fix task (front end and back end): one code-review lens on the diff; the commit hook's checks as today; one separate read-only grounder that validates (the diff against the plan as folded and each acceptance line, the code-review findings, each changed descriptor against the code it describes, the milestone objectives against the diff, red then green). Every rule list is off at output through the existing output_off line and stays on at the plan stage. The plan stage is unchanged. Switches or text changes only (RR-0450, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2325); no new mechanism (RR-0392, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975).

Source: the read-only grounder check Cairn-Ground-OUTSHAPE, saved word for word at ~/Buildo-scratch/lanes-20261124/outshape/GROUNDER-OUTSHAPE.txt (the change table with file:line, the descriptor duty sentences, the Spec 08 dated note text, the tests that pin the old shape, risks, UNVERIFIED). Morning evidence: output reviews of tasks 449, 450 and 453 raised 453 findings, 63 confirmed, 1 fixed; plan reviews raised 326, 204 confirmed, 200 folded.

Must not: change the plan stage, the close check's grounder rules, the round limits (RR-0385) or the no-fold-before-the-grounder rule (RR-0359); delete a lens template; add a table key or a scoping mechanism. Sequencing: lands after lane BL-SFX3 (task-451) closes; no open lane is merged onto it before its close.

Files: scripts/analysis/rule-lists.json, scripts/analysis/rule-lists.mjs, scripts/analysis/backlog-lane.mjs, .claude/review-templates/README.md, docs/specs/00-architecture/08_agents.md, docs/reports/generated/rule-lists-by-kind.md, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/rule-lists-table.logic.test.ts, src/tests/backlog/check-lane-close.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The table check passes with output_off naming lists that are not every-task lists; an unknown id is still refused
- [ ] #2 The output lens set of a build or fix task is the code review alone for every Files line; the plan lens set is unchanged
- [ ] #3 A build or fix lane closes with the code review output, its records and plan evidence and no compliance, engineering, ux, error-paths or security output files; emptying output_off puts every list back
- [ ] #4 A check or doc task still gets every list at either stage
- [ ] #5 The launch brief names the code review plus the descriptor and milestone-objective duties of the grounder, and names no compliance run at output
- [ ] #6 The Spec 08 dated note and the README lines are present and the dated-note cap tests stay green
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
