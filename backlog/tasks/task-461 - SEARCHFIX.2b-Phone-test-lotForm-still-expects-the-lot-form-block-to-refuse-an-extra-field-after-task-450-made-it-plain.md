---
id: TASK-461
title: >-
  SEARCHFIX.2b Phone test lotForm still expects the lot-form block to refuse an
  extra field after task-450 made it plain
status: LATER
assignee: []
created_date: '2026-11-24T18:11:00Z'
labels:
  - SEARCHFIX-PRIORITY
milestone: m-1
dependencies: []
type: fix
ordinal: 155210
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found 2026-11-24 by a local run of the phone tests on the board head 5af0f7be2 (output ~/Buildo-scratch/lanes-20261124/phone-5af0f7be2.out): mobile/__tests__/lotForm.test.ts:71 fails (expected false, received true). Cause by reading: task-450 (ee3634771) made ParcelLotFormSchema plain on purpose (mobile/src/lib/schemas.ts:423-425, dated note: prior text kept, the object ended in .strict()), and this older test line still expects an extra field to be refused. Task-450's lane could not run the phone tests. The fix follows task-450's ruled plan (GROUNDER-B D1): the test line states the plain form; the schema is not changed back. Orchestrator's reading, to be checked by the planner and grounder.

Files: mobile/__tests__/lotForm.test.ts
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The phone test file lotForm passes in a local phone test run and states that an extra field in the lot-form block still parses
- [ ] #2 No other phone test asserts the old strict form of the lot-form block
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
