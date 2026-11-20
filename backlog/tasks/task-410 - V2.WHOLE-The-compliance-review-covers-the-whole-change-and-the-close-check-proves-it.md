---
id: TASK-410
title: >-
  V2.WHOLE The compliance review covers the whole change and the close check
  proves it
status: RUNNING
assignee:
  - '@lane-BL-V2WHOLE'
created_date: '2026-11-20T17:52:00Z'
updated_date: '2026-11-20T18:53:00Z'
labels:
  - McFix
  - McFix V2
milestone: m-1
dependencies:
  - TASK-406
  - TASK-407
type: build
ordinal: 110012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator, 2026-11-20, verbatim: "I also need certainty within the tasks that a rpiority is getting the right information about compliance to the reviewer.  Put extra stree" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md, entry 'Operator APPROVES the McFix V2 launch'). Found by a separate grounder 2026-11-20 (verify each fact first): (1) the close check verifies nothing about the review MATERIAL beyond its hash (scripts/hooks/check-lane-close.mjs:100-125): a lane can commit any part of the diff as material and the close passes; lanes did so today (DIFF-core.patch). (2) the review tool refuses a prompt over 120,000 characters (scripts/deepseek-review.js:35, a cost and timeout choice per its comment at :33-34, not a stated model limit) and lens-input refuses a material that leaves no room for the list; task-390's diff (121,482 characters) cannot be reviewed whole at all. (3) four lens templates (code-review, error-paths, ux, security, line 32) still carry the plan placeholder in their prose, so the material is sent twice (lens-compliance.md was fixed). Grounder recommendation, to build: (a) fix the four templates' line 32 as lens-compliance.md was fixed. (b) lens-input gains a material-split mode: the diff is split at FILE boundaries into chunks by the tool (never by hand), each chunk against every list part, the input stamped with chunk i of m and its path list. (c) the close check recomputes the changed paths of the task range (minus the table's exempt paths) and refuses when the union of the chunks' paths is not that list, and compares each chunk's hash to the recomputed diff text for its paths: this is what stops a lane leaving a file out. (d) the brief sentence is updated to match. NOT built without the operator's word: excluding generated files from the material (no rule exempts them); raising the bound; a size limit on a task. Optional, measure first: routing each file only to the lists its own path resolves to. Cost stated plainly: about three times today's review calls for a change of this size (estimate 80 to 120 per phase for task-390; exact number to be measured and reported). Acceptance: planted-defect tests with passing controls (a chunk set missing one changed file is refused; a chunk whose text differs from the diff is refused); task-390's whole diff run through it for real, the call count reported. Protected paths: each check or tool edit in its own commit, no task status move in it. Files: scripts/analysis/rule-lists.mjs, scripts/hooks/check-lane-close.mjs, scripts/analysis/backlog-lane.mjs, .claude/review-templates/lens-code-review.md, .claude/review-templates/lens-error-paths.md, .claude/review-templates/lens-ux.md, .claude/review-templates/lens-security.md, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/check-lane-close.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts
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
2026-11-20 taken on the board at lane launch (lane BL-V2WHOLE, worktree /Users/brettpreston_macmini/Buildo-wt-v2whole, branch wf1/inc1b-v2whole), RR-0240
<!-- SECTION:NOTES:END -->
