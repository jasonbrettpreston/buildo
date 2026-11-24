---
id: TASK-458
title: >-
  BTN.HAPTIC Haptic feedback on primary buttons drawn by the shared phone
  renderer
status: LATER
assignee: []
created_date: '2026-11-24T17:29:00Z'
updated_date: '2026-11-24T20:20:00Z'
labels:
  - SEARCHFIX-LATER
milestone: m-2
dependencies: []
type: fix
ordinal: 152210
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-24 by the orchestrator from RR-0455 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2357), operator, verbatim: "1 y 2 y 3 y 4 I dont understand this question 5. is this after a search - provide context" (item 2: task 452 is split and the haptic change is its own card). Source: task-452 acceptance line 6 and step 7 as folded (docs/reports/reviews/task-452/QUESTIONS-RULED.md). Standard: docs/specs/00_engineering_standards.md:24. Not planned yet. Milestone is the orchestrator's reading, not a ruling.
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
2026-11-24: moved to Increment 1C by the operator (RR-0463, /Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2397, verbatim: "Move 458").

2026-11-24: scope is the renderer press only (lightImpact once per press on Buttons with variant default or none, parcel pages only) plus the Std 1.3 dated note, so the Files line must list docs/specs/00_engineering_standards.md (452 never listed it). The settle haptics go with task-357 (452 round 1, O2). No dependency on 452. SurfaceRenderer.tsx is shared with 357 in other hunks. The cite of QUESTIONS-RULED.md is docs/reports/reviews/task-452/v1/QUESTIONS-RULED.md.
<!-- SECTION:NOTES:END -->
