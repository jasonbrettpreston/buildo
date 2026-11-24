---
id: TASK-316
title: >-
  R10 Increment 1·B validation pass: tasks, semi page placeholder, McFrontend
  fields and pages, dependencies, prior panels linked
status: DONE
assignee:
  - '@lane-BL-R10'
created_date: '2026-11-19T14:44:00Z'
updated_date: '2026-11-24T14:42:00Z'
labels:
  - follow-up
  - validation
  - McFixReborn
  - dead
milestone: m-1
dependencies: []
references:
  - docs/reports/plan-import/raw/2026-11-19/search-brief.json
  - backlog/docs/increments/doc-2 - Increment-S-requirements.md
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L1018
  - docs/reports/lanes/2026-11-19/BL-R10/REPORT.md
  - docs/reports/lanes/2026-11-19/BL-R10/TRIAGE.md
  - docs/reports/lanes/2026-11-19/BL-R10/r1-review.txt
  - docs/reports/reviews/task-316/context-2026-11-19.md
type: record
project: McIncrement
ordinal: 23012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator 2026-11-19: "lets begin work on Incr 1b. Lets ensure all the tasks (including the semis page - for the future semi development is present) and also the McFrontend fields from the artifact and ensure all the gaps are closed. As well this incr requires some of the Mcfrontend tasks to be build - some pages. also ensure the dependencies are correct. Also the build pass had been completed and panels ran on each tasks as well as the incra itself. We want an optimized run. This work has been done - just validation." Grounded: yes - m-1 holds 8 tasks (GAP.13, LOAD.1, LOAD.2, PROOF.TOOL, PROOF.S, 1.4 search parser, LS.11; LOAD.3 dropped); the semi page tasks sit in m-9 (7.25 S6-PAGE, GAP.12); doc-2 has Built state, Scenario, Elements and a Search pages today section; the panel records of 2026-11-17 are in scratch. Recommendation: a record-only validation pass that fixes dependencies and creates gap tasks, with front-end gaps raised to the operator as OPERATOR tasks; UNVERIFIED until its review round.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every task the Increment 1·B brief (doc-2, search-brief.json, elements-by-inc S, storage-by-group S) and the McFrontend queue rows for the search pages call for is on the board in m-1 with correct dependencies, or a gap task is created; the semi-detached page placeholder for future semi development is present or raised as an OPERATOR decision with Grounded and Recommendation lines
- [x] #2 Every McFrontend field of the 1·B elements (artifact: elements-by-inc.json S and the doc-2 Elements section) maps to a task that builds or binds it, or a gap is listed
- [x] #3 The McFrontend page tasks 1·B needs (search pages, loading screen, report start) are on the board with their MF row mirrored and the dependency chain to 1·A and to the report increment verified
- [x] #4 The prior build pass and panels (lanes-20261117/avail-search, inc-plan, inc-briefs, fe-built, buildpass-*) are linked from each m-1 task through references; anything the panels required that is not on a task is listed as a gap
- [x] #5 Repo review round r1 in review mode on the context file, triaged; the lane outcome recorded on each m-1 task as a dated note (KEPT, CHANGED, gap created, dependency fixed)
- [x] #6 The m-1 milestone file carries, in named sections, the project objectives (the five principles and the product objectives the context pack cites), the increment objectives and deliverable, the reference specs with paths, the register rulings of group S, and a Decisions section listing every Backlog decision that names an m-1 task or the group; the same section form is proposed for all milestones as a draft
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. AC1 tasks and dependencies: read the 8 m-1 tasks, the 12 group S plan items (sequence.json S) and the board; five S items are drafts, not tasks (LOAD.4, SRCH.A6, SRCH.C12, SRCH.ROUTE, SRCH.SEMI): promote them into m-1 through backlog draft promote and write their dependencies as task ids; fix task-68 (drop the DROPPED CHK.4 task-65), task-268 (add the promoted content tasks), task-209 (7.25 follows SRCH.SEMI); create SRCH.DAYLIGHT (no task or queue row carries the Daylight restyle of the search pages) as a gap task; semi placeholder = SRCH.SEMI (RR-0182, RR-0184 place the semi question page on the search flow); its scope split (wall-distance input and owner-answer storage vs GAP.12 at inc 7) raised as an OPERATOR task with Grounded and Recommendation lines; web footer E.2 raised as an OPERATOR task. 2. AC2 field map: every doc-2 Elements id to a task or a listed gap. 3. AC3 page tasks: GAP.13, LOAD.1, LOAD.2, LOAD.4, SRCH.* with the MF rows linked by id (RR-0205: queue rows stay, linked not copied); dependency chain to 1.3 (m-3), ST.P1 (m-13), push 6 and group F checks verified. 4. AC4 link the 2026-11-17 panel and build-pass records on each m-1 task with --add-ref; gaps they required listed. 5. AC5 one repo review round r1 (review mode) on the context file, triaged KEEP/REJECT, then a dated note on every m-1 task. 6. AC6 add Problems, Project objectives, Increment objectives, Rulings, Compliance codes in use and Decisions sections to the m-1 milestone file (existing sections kept) and a draft task proposing the Decisions section on all milestones. Docs-only, no test run; one commit with Task: task-316.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-19 taken on the board at lane launch (lane BL-R10, worktree /Users/brettpreston_macmini/Buildo-wt-r10, branch wf2/inc1b-r10), RR-0240

2026-11-19 AC evidence (commit d849925a6): AC1 task-317 to 322 and task-323 (semi placeholder = task-319), deps fixed on task-68, 268, 209 (backlog doctor clean); AC2 field map in REPORT.md section 2 (65 rows, gaps E.2 task-324, B.3 removed by design); AC3 MF rows linked by id, chain 267-266-123/265 and 68-66/67 verified (REPORT section 1 and 3); AC4 records linked per task, RR-0145 gap draft-33; AC5 r1 review 29 findings triaged in TRIAGE.md, dated note on every m-1 task; AC6 m-1 milestone sections added, 0 lines removed, draft-32 for all milestones. Docs-only change: no test run.

2026-11-19 DONE: closing commits on origin/wf1/mb-rulings (push window 5: 78f552fbb at 16:56Z, station PASS 28367 tests)
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Landed in commit d849925a6 (hooks passed, no bypass): five drafts promoted to m-1, one gap task, three OPERATOR tasks, three dependency fixes, three drafts, m-1 milestone sections, reports in docs/reports/lanes/2026-11-19/BL-R10.
<!-- SECTION:FINAL_SUMMARY:END -->
