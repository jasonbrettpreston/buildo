---
id: TASK-307
title: >-
  R8b Milestone Documents sections: requirements doc, McStorage section,
  McFrontend elements per increment
status: RUNNING
assignee:
  - '@lane-BL-R8b'
created_date: '2026-11-19T12:52:00Z'
updated_date: '2026-11-19T13:02:00Z'
labels:
  - follow-up
milestone: m-0
dependencies: []
references:
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L924
type: record
project: McIncrement
ordinal: 17012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator 2026-11-19 (RR-0232), proposal (b) approved. Grounded: yes - no milestone file links a doc (grep doc- backlog/milestones = 0 files); the docs exist (15 increment requirement docs with Built state, Scenario, Elements; doc-16 McStorage policy v2 with a per-increment section 5). Recommendation: one Documents section per milestone, docs-only commit, no code; UNVERIFIED until the repo review round of this task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every milestone description (m-0 to m-14) ends with a Documents section linking its requirements doc (doc-N), the McStorage policy section for the increment (doc-16 section 5) and its McFrontend elements (the Elements section of the requirements doc); milestone files are edited directly because the CLI has no milestone edit command (the loader wrote them the same way)
- [ ] #2 Repo review round r1 on the plan of this task, triaged, before any change
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
2026-11-19 taken on the board by the orchestrator at lane launch (lane BL-R8b in ~/Buildo-wt-r8b, branch wf2/r8b-milestone-docs; the lane has since reported BUILT on its branch, commit 819a739b2)
<!-- SECTION:NOTES:END -->
