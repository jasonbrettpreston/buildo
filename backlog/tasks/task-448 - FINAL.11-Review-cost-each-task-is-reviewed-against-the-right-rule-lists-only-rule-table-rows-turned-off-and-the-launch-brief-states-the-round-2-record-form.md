---
id: TASK-448
title: >-
  FINAL.11 Review cost: each task is reviewed against the right rule lists only
  (rule table rows turned off), and the launch brief states the round-2 record
  form
status: LATER
assignee: []
created_date: '2026-11-23T20:11:00Z'
labels:
  - McFix
  - McFix Final
milestone: m-1
dependencies: []
type: build
ordinal: 148012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-23 by the orchestrator, Spec 137 rule 2, on the operator's rulings. RR-0418 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2140 and :2144, verbatim: "IT was these"): a front-end task is reviewed against the front-end handbook (Spec 136), the engineering standard, the four lenses and the four every-task lists; the back end the same with its own handbook; the queue, agent, policy and orchestrator-note lists and the old source specs are turned off in the existing table; nothing new is built. RR-0419 (:2149, verbatim: "Approved. Are there any other surprises in teh reviews that sonnet or anybody else does?"): one task. RR-0420 (:2155): the other review-cost problems join it. RR-0421 (:2161, verbatim: "1-4 recommendations approved"): 1 a old source specs 126, 127, 128, 135 off on every row (reverses RR-0383); 2 a phone rows keep mobile-90, mobile-98, mobile-99 and lose mobile-100, mobile-96; 3 a the four Airtight lists and storage-doc16 off; 4 a the lane-tools row keeps its process lists, every other row loses them. RR-0422 (:2166, verbatim: "Minimum and 1a. Let's add these small fixes to the cost review task."): the Minimum package; scripts/hooks/check-lane-close.mjs is NOT edited. RR-0423 (:2171, verbatim: "add teh first two.  Plan approved.  Move forward with the task"). WHY, measured: task-367's output review resolved 16 lists (961,597 characters, 78 DeepSeek calls, 285 findings to rule); with the table edit it resolves 6 lists (113,259 characters). THIS TASK, all of it turning things off or correcting text: (1) scripts/analysis/rule-lists.json: the row edits of PLAN-418-v1 section D as restated with RR-0421 in PLAN-418-part2-v2 (16 rows with a lists change; a not on the bylaw and lane-tools rows for prereg-MF files; the panel-records glob gains prereg-MF-*.json), and the why text of each changed row made true again (for example :152 and :140); (2) the tests that pin the table, edited first and seen red: src/tests/backlog/rule-lists.logic.test.ts, rule-lists-table.logic.test.ts, backlog-lane.logic.test.ts (including :552, named by the plan grounder); (3) the regenerated page docs/reports/generated/rule-lists-by-kind.md in the same commit; (4) scripts/analysis/backlog-lane.mjs:188, one sentence: a fix round re-makes every review file under the same names and round 1 is named by a history line (task-446, d04026fe5), with one test line; (5) dated notes in docs/specs/00-architecture/08_agents.md and 137_mcqueue.md for the rulings, including that the plan grounder writes the fold check itself, once, after the last fold (only if the plan grounder rules Spec 08 section 11.2 and the gate allow it). NOT in this task: any edit to check-lane-close.mjs or rule-lists.mjs, any new tool, hook, key or role. Inputs (outside the repo, saved verbatim): ~/Buildo-scratch/lanes-20261119/inc1b/lists418/PLAN-418-v1.md, GROUNDER-PLAN-418-v1.md (PASS WITH CORRECTIONS, nine corrections), PLAN-418-part2-v2.md. Known limit, told to the operator: tasks already launched are judged by the table at their own base; this helps every task launched after it lands. Principles served: simple, standardized, understandable.
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
