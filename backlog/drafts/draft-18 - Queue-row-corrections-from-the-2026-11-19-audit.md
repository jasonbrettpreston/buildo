---
id: DRAFT-18
title: Queue-row corrections from the 2026-11-19 audit
status: Draft
assignee: []
created_date: '2026-11-19T05:28:00Z'
updated_date: '2026-11-19T12:12:00Z'
labels:
  - follow-up
milestone: m-0
dependencies: []
references:
  - .cursor/active_task.md#L90
  - .cursor/MCFRONTEND-QUEUE.md#L61
  - .cursor/MCFRONTEND-QUEUE.md#L203
  - .cursor/MCFRONTEND-QUEUE.md#L348
  - docs/reports/plan-import/raw/2026-11-19/out/status.json
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Three McFrontend rows are past expires 2026-11-16 and ten rows are LANDED but not DONE (status.json queueFlags). Correct each on its own row under Spec 137 rule 3, not on the Backlog task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 MCFRONTEND-QUEUE.md rows at lines 61, 203 and 348: expiry renewed, or row dropped or answered, by the operator word
- [x] #2 The 10 LANDED-not-DONE flags in status.json queueFlags: each row set to DONE with its MB-nn@sha or MF-nn@sha stamp, or a reason it is not
- [ ] #3 The mirrored Backlog task of each corrected row is edited in the same commit (Spec 137 rule 3)
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
2026-11-19 (BL-R7b): part 1 not touched: MF rows MCFRONTEND-QUEUE.md:61 (MF-08), :203 (MF-22), :348 (MF-49) need the operator word (renew or drop); part 2 recorded in the second R7 docs commit.

2026-11-19 (BL-R7b): part 2 result: none of the ten rows set DONE: no grounded landing commit (rows.out in lane BL-R7b records each row's Status line, commits, on-origin yes/no); a reason note is on each mirrored task (task-147, 175, 179, 187, 215, 217, 236, 240, 285, 298). AC 1 stays open (operator word on MF-08, MF-22, MF-49). AC 3 not applicable: no row corrected.
<!-- SECTION:NOTES:END -->
