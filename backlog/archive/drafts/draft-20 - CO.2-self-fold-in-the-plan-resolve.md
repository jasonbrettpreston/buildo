---
id: DRAFT-20
title: 'CO.2 self-fold in the plan: resolve'
status: Draft
assignee: []
created_date: '2026-11-19T05:28:00Z'
updated_date: '2026-11-19T12:10:00Z'
labels:
  - follow-up
milestone: m-0
dependencies: []
references:
  - docs/reports/plan-import/2026-11-19-import-report.md#L122
  - .cursor/active_task.md#L90
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The plan item CO.2 is FOLDED into CO.2 (a self-fold). It loaded as LATER with the label unverified (D9). Decide the real merge target or keep CO.2 as its own task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The plan names the real merge target for CO.2, or CO.2 stays a task with that said on the task
- [x] #2 The unverified label is removed from CO.2
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
2026-11-19 (BL-R7b): CO.2 is its own task; 'Replaces SL-COA-LOCK' in sequence.json#CO.2 shows the loader misread the fold direction; label unverified removed from task-188. Archived.
<!-- SECTION:NOTES:END -->
