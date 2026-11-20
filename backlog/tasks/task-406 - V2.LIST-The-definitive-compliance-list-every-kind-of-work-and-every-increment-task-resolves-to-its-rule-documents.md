---
id: TASK-406
title: >-
  V2.LIST The definitive compliance list: every kind of work and every increment
  task resolves to its rule documents
status: RUNNING
assignee:
  - '@lane-BL-V2LIST'
created_date: '2026-11-20T17:12:00Z'
updated_date: '2026-11-20T18:31:00Z'
labels:
  - McFix
  - McFix V2
milestone: m-1
dependencies: []
type: build
ordinal: 106012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator, 2026-11-20, verbatim: "That works. Let;s this - the 10th plan today on the same thing.  Let's review the McFix tasks realted to compliance and either substitue. This is the McFixV2 Plan. Hwo will I know it is actually working on a daily basis and no one has swtiched it off.  I still think you need to create the definitive complianc list McFront-end and all the tasks in the Increments.  Add to the board - review all teh currentMCfix tasks and ensure they are still relevant" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md, entry "Operator APPROVES McFix V2"). McFix V2 step 1. Replaces task-403 and task-404 (their scope is here). Part 1, a read-only coverage review by a separate grounder BEFORE any row is written: the rule-list table (scripts/analysis/rule-lists.json: 41 lists, 16 rows) against the whole spec estate: which McDonald's specs or sections govern code and are attached to nothing; whether the sectioned handbooks (step handbook 132 sections 2, 3, 4, 6; McFrontend handbook 136 section 2; 124a, 122a) leave out the section that states the five principles; where the plan protocol lives; which paths touched in the last 60 commits match no row or miss an obviously governing spec. Part 2, data: rows so that every compliance review receives (i) the five principles as stated in the governing handbook for that kind of work, (ii) the plan protocol, (iii) the milestone objectives and increment requirements, (iv) every spec governing the touched paths; rows for docs/reports/generated/**, scripts/seeds/logic_variables.json, docs/reports/policy/**. Part 3, the list made visible: one generated page (by a generator with --check, in the form of the existing generated docs) that prints, per kind of work (pipeline step, McFrontend web, phone, storage, tooling, spec-only) the documents its compliance review receives; and a check over EVERY open task in EVERY increment on the board: each has a Files line that resolves, or is listed by id as not yet resolvable with the reason. Part 4: the compliance lens command is given the milestone objectives (today they go only into the ticket). Acceptance: the generated page; the all-increments check with its list; a planted task whose Files line resolves to no principles list is refused at launch. Files: scripts/analysis/rule-lists.json, scripts/analysis/rule-lists.mjs, scripts/analysis/backlog-lane.mjs, src/tests/backlog/rule-lists.logic.test.ts
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
PRIORITY, operator 2026-11-20 verbatim: "I also need certainty within the tasks that a rpiority is getting the right information about compliance to the reviewer.  Put extra stree" (MORNING-DECISIONS.md, entry "Operator APPROVES the McFix V2 launch"). So acceptance adds PROOF ON THE REAL INPUTS, not on the table: (1) for each kind of work (pipeline step, McFrontend web, phone, storage, tooling, spec-only) generate the actual compliance lens input files for a real task of that kind and show, by grep with line numbers, that each contains the five principles in the governing handbook's own words, the plan protocol, the milestone objectives, and each governing spec WHOLE (or the named sections, with the reason a section is left out); (2) the close check refuses a task whose compliance outputs do not include the always-attached list (planted-defect test with a passing control); (3) the lens is given the WHOLE change: where a diff is over the size bound it is split into parts and every part is reviewed against every list, never trimmed to core files (lanes trimmed on 2026-11-20): the check refuses a compliance run whose material does not cover every changed path (the material names the paths; compare with the range). (4) the generated page states, per kind of work, the documents AND their sizes and part counts, so a missing or shrunken document is visible in a diff.

2026-11-20 taken on the board at lane launch (lane BL-V2LIST, worktree /Users/brettpreston_macmini/Buildo-wt-v2list, branch wf1/inc1b-v2list), RR-0240

Operator 2026-11-20, verbatim (MORNING-DECISIONS.md:1494): "Correct this - Phone work gets no engineering standards. The mobile row was missed. - Some surface script paths get none either. - Generated reports are attached to the wrong spec. They are governed by Spec 124 Rule 13, which no list carried." All three are in the fix round sent to the lane.
<!-- SECTION:NOTES:END -->
