---
id: DRAFT-37
title: >-
  Lot map C.5: draw the building footprint outline (second outline per lot)
  after the presence tier
status: Draft
assignee: []
created_date: '2026-11-19T16:21:00Z'
labels:
  - S
  - follow-up
milestone: m-1
dependencies: []
references:
  - docs/reports/lanes/2026-11-19/BL-LOTCARD/REPORT.md
type: build
project: McIncrement
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Lane BL-LOTCARD (task-336): C.5 landed as presence only (a fill tier for lots with a footprint); drawing the footprint outline needs a second outline per lot, a new payload shape beyond the two ruled fields. Grounded: yes (REPORT.md, the v8 page draws the footprint). Recommendation: a follow-up once the lot card is in use; design and storage scope for the payload shape (RR-0233); UNVERIFIED until its review round.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The choose-your-lot map draws the building footprint outline on each lot that has one (a second outline per lot in the map payload), from the building_footprints geometry the permits route already reads; the presence fill tier of task-336 stays as the fallback
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
