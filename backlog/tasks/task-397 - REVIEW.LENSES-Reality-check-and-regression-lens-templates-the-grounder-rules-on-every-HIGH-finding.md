---
id: TASK-397
title: >-
  REVIEW.LENSES Reality-check and regression lens templates; the grounder rules
  on every HIGH finding
status: DROPPED
assignee: []
created_date: '2026-11-20T15:59:00Z'
updated_date: '2026-11-24T18:41:00Z'
labels:
  - dead
milestone: m-1
dependencies: []
type: build
ordinal: 97012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Gap found 2026-11-20: .claude/review-templates holds five lens templates (compliance, code-review, error-paths, security, ux); there is no reality-check, integration or regression lens, so no McFix lane ran one (lanes did the regression read themselves or borrowed plan-review-deepseek.md); and grounders ruled on every HIGH only in clusters with some unopened (11 of 42 on task-376). Put to the operator: 'add a reality-check lens and a regression lens as two template files, and have the grounder rule on every HIGH with no sampling. That is one small task.' Operator, 2026-11-20, verbatim: 'yes approved' (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1444; that this answers the lenses question as well as the builder file is the orchestrator reading). Scope: two template files in the form of the existing lens templates (read the README and the memory rule on the walk panel: reality check and integration); a line in the lane brief text the launch script writes that names the lens set (compliance per rule list, code-review, error-paths, regression, reality) and says the plan lens runs BEFORE code; the grounder brief form: every HIGH or CRITICAL ruled one by one, none left unopened. No new tool, no new gate. Files: .claude/review-templates/lens-regression.md, .claude/review-templates/lens-reality.md, .claude/review-templates/README.md, scripts/analysis/backlog-lane.mjs
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
Operator 2026-11-20, verbatim: "Let the grounder resolve them all as long as the result is compliant" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1476). Resolved by the separate grounder, 2026-11-20 (the lane verifies each cited fact before building): DROP: not authorised by operator words (MD:1440, :1445 mark it a reading), not required by a written rule; Spec 08:171-172 gives regression and reality-check to tool-having Claude seats (regression-guardian, pipeline-reality-check exist), and a DeepSeek template for them is the tool-less facade Spec 08:387 records. Status not changed by hand: the move to DROPPED goes by the ruling record.

2026-11-20 operator ruling (M-246, prior text kept), ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1610, verbatim: "approved", to the list he pasted back; the item for this task as put to him: "Record 385, 397, 400 and 404 as dropped, and 371 and 377 as closed superseded. Recommended yes. (HELD for this task: the orchestrator later recommended keeping 397 because Reality-Check and Regression seats were ruled in at :1593; asked once more.)". The decision record tool holds one record per quote and cite (decision-126, RR-0341, carries the same approval), so this note is the record on this task. No status is moved by hand.

Dated note 2026-11-20 (M-246, prior text kept; RR-0342 · task-397 · Backlog; operator, verbatim: "regression only required when code is changed and reality check is only required when a figure is changed or you can figure something else independently")

Dated note 2026-11-22 (M-246, prior text kept; RR-0385 · Backlog; operator, verbatim: "I agree with the task chages and removals."; MORNING-DECISIONS.md:1915 entry): withdrawn. His words: "397 - we have the seats already and they work".
<!-- SECTION:NOTES:END -->
