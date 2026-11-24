---
id: TASK-463
title: >-
  PROC.PHONELINT The dead phone lint script is removed and the testing spec
  stops promising a phone lint step
status: LATER
assignee: []
created_date: '2026-11-24T18:43:00Z'
labels:
  - ProcessImprovement
milestone: m-1
dependencies: []
type: fix
ordinal: 157210
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-24 by the orchestrator from RR-0462 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2392), step 5 of the approved plan. Source: Cairn-Ground-PHONECHK proposal D (~/Buildo-scratch/lanes-20261124/phonechecks/GROUNDER-PHONECHK.txt). mobile/package.json:13 holds a lint script though the phone app has no lint tool installed; the phone testing spec section 5 says CI runs it and the workflow never does. Text only: delete the script line and correct the spec line with a dated note. Not planned yet; after PROC.PHONEGATE.

Files: mobile/package.json, docs/specs/03-mobile/98_mobile_testing_protocol.md
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 mobile/package.json has no lint script and the phone testing spec section 5 says there is no phone lint step, with a dated note
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
