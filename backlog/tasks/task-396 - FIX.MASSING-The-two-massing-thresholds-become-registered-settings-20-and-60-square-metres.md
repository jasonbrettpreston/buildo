---
id: TASK-396
title: >-
  FIX.MASSING The two massing thresholds become registered settings (20 and 60
  square metres)
status: LATER
assignee: []
created_date: '2026-11-20T15:54:00Z'
labels:
  - McFix
  - McFix A
milestone: m-1
dependencies:
  - TASK-378
type: fix
ordinal: 96012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the lens set and confirmed by the separate grounder on task-378 (2026-11-20): src/lib/massing/geometry.ts:27 SHED_THRESHOLD_SQM = 20 and :30 GARAGE_MAX_SQM = 60 are typed in code (used at :64-65) against Spec 126 P4 (:189 'All tunables are data; zero thresholds in src/'). Operator, 2026-11-20, verbatim: 'you need to resolve these?' (orchestrator reading: resolve both). This code predates Increment 1·B. Scope: the two values become registered pinned settings read the way task-372 registered the lot-size window (src/lib/report-projection/pinned-settings.ts), values unchanged; the existing locks src/tests/massing.logic.test.ts:88-89 and src/tests/link-massing.infra.test.ts:84-85 are updated only to follow the new source, never weakened; the settings file must NOT reach a browser bundle (src/components/permits/BuildingMassing.tsx is a client component: follow whatever task-378 lands for the length factor). Owed with it: the DB mirror migration for the new settings (number from the ID ledger; the operator's typed GO), together with the one owed from task-372. The settings seed file has no rule-list row today: the lane reports that, it does not skip the list. After task-378 folds. Files: src/lib/massing/geometry.ts, src/tests/massing.logic.test.ts, src/tests/link-massing.infra.test.ts
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
