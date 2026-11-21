---
id: TASK-421
title: >-
  SCORE.GO Operator types GO on dev: scorecard refresh (read-only) and the
  generated-files commit
status: LATER
assignee: []
created_date: '2026-11-21T14:53:00Z'
updated_date: '2026-11-21T14:56:00Z'
labels:
  - McFix
milestone: m-1
dependencies:
  - TASK-420
type: db-go
ordinal: 121012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-21 by the orchestrator, Spec 137 rule 2 (RR-0353, RR-0355). After task-420 (the rehearsal) passes: the operator types GO in his own Terminal and the run script of task-420 makes ONE read-only run on dev of `step-validate.mjs --all --fast --write` in the lane worktree; then a lane checks that only generated files changed (the assessment reports under docs/reports/, the count row 315 to 316), commits them through the real hooks as one generated-files commit in the form of bd1f246cc, and the commit is folded; the station suite then runs on that commit. Must be re-run if another migration file lands before the push. Files: docs/reports/
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The operator's typed GO is recorded verbatim on the task
- [ ] #2 One commit of generated files only, through the hooks; step-conformance Rule 13 passes on it
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
Dated note 2026-11-21 (M-246, prior text kept; RR-0357 · task-421 · Backlog; operator, verbatim: "GO for scorecards")

Dated note 2026-11-21 (M-246, prior text kept; RR-0358 · task-421 · Backlog; operator, verbatim: "does the rehearsal provide a benefit here - if not move on")
<!-- SECTION:NOTES:END -->
