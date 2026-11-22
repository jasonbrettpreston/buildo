---
id: TASK-431
title: >-
  INPUTS.3 The review table sends product tasks their handbook plus the relevant
  engineering sections; infrastructure tasks unchanged
status: LATER
assignee: []
created_date: '2026-11-22T16:25:00Z'
updated_date: '2026-11-22T18:02:00Z'
labels:
  - McFix
  - McFix V2
milestone: m-1
dependencies: []
type: build
ordinal: 131012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-22 by the orchestrator, Spec 137 rule 2, on the operator's ruling RR-0378 (MORNING-DECISIONS.md:1852, verbatim: "Plan approved. We are running right now on this? Add the tasks?"). Why: the compliance reviewer is sent about 534,000 characters for a front-end task, of which the handbook is 3 percent; measured, one small document per call finds more than large or joined ones. THIS TASK (steps 3 and 4): in scripts/analysis/rule-lists.json: the engineering standards entry split by section into front-end, back-end and shared lists (sections 1, 8, 10, 12 front end; 3, 9 back end; 2, 4, 5, 6, 7, 13 shared; 11 and 14 placed at plan review); front-end kinds get surface-136 plus front-end and shared; pipeline and by-law kinds get their handbook plus back-end and shared; Specs 126, 127, 128, 135 no longer sent whole to front-end kinds once INPUTS.2 has landed; the lane-tools and other infrastructure rows unchanged (Spec 08, Spec 137); ui-app attaches surface-136 if INPUTS.1 confirms the oversight. Proof before the switch at plan review. Files: scripts/analysis/rule-lists.json, src/tests/backlog/rule-lists.logic.test.ts, docs/reports/generated/rule-lists-by-kind.md
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
Dated note 2026-11-22 (M-246, prior text kept; RR-0379 · task-431 · Backlog; operator, verbatim: "We can run step 1 in parellel - we will add to the rules overtime")

Dated note 2026-11-22 (M-246, prior text kept; RR-0380 · task-431 · Backlog; operator, verbatim: "Pushing 1 transition once the handbook has been updated iwth the critical items and drop the full engineering when arts can be sent  2. y 3 4 N")

Dated note 2026-11-22 (M-246, prior text kept; RR-0383 · task-431 · Backlog; operator, verbatim: "1. what is your recommendation. I approve it")
<!-- SECTION:NOTES:END -->
