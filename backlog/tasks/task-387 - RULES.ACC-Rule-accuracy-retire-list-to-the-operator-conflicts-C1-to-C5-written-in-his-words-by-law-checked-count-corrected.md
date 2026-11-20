---
id: TASK-387
title: >-
  RULES.ACC Rule accuracy: retire list to the operator, conflicts C1 to C5
  written in his words, by-law checked count corrected
status: LATER
assignee: []
created_date: '2026-11-20T15:08:00Z'
updated_date: '2026-11-20T15:18:00Z'
labels: []
milestone: m-1
dependencies: []
type: build
ordinal: 87012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Plan section E2. Retire candidates (grounder-verified stale): Spec 90 :46 and :71, 08_agents :343 and :19/:28: retiring is the operator's ruling. C1 to C5 (docs/reports/lanes/2026-11-20/BL-VERIFYC/VERIFY.md; BL-GROUND/VERDICTS-SUMMARY-2.md) written as dated notes only after his words; Spec 126:810 against Spec 100:123 resolved by his C2 answer. By-law handbook count: report-only is not counted as enforced. Files: docs/specs/03-mobile/90_mobile_engineering_protocol.md, docs/specs/03-mobile/100_mobile_parcel_cost_tool.md, docs/specs/02-web-admin/126_maxbld_surface_standard.md, docs/specs/00-architecture/08_agents.md Operator 2026-11-20 (verbatim): "1. yes. add the tasks to incr 1b and remove the ones we dont need 2. fold ... d. just add the review enforcement not the others. e. fine". Plan: ~/Buildo-scratch/lanes-20261119/inc1b/enforce/PLAN-3-ONE-PLAN.md; reviewer evidence in ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md entries of 2026-11-20 (plan grounder; page-runner measurement; page-by-page schema check). Each gate or scan: a committed planted-defect test, red first through the real hooks; a separate agent attacks it, results reported as refused or STILL OPEN. Lens set with the rule lists whole and the rulings pasted; grounder launched by the orchestrator, never the lane.
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
Operator ruling 2026-11-20, verbatim: "1 a 2 b 3 a 4 a 5 c 6 accept" (the six decisions; ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md entry "Operator RULES on the six decisions"). To write as dated notes citing those words, AFTER task-376 folds (same spec files): C2 (a) error screen with Try again, not counted: correct Spec 126:810, Spec 100:123 stands; C3 (b) legal line at the bottom of the phone search page (the build is its own task); D13 (a) 48 px on the semi page Continue and Try again is now an operator ruling (bindings.json touch_targets note says orchestrator decision: correct it); C5 (a) every paying user at once when the web switch flips: dated note on FE-39 through the register generator (with task-388). Semi page cache write accepted as built. C1 and C4 as verified in BL-VERIFYC. STILL OPEN for the operator: the phone's 3 retries before the error screen.

Operator ruling 2026-11-20, verbatim: "Phone retires yes and web search yes" (MORNING-DECISIONS.md entry "phone retries and the web search legal line"). C2 addition: the phone keeps its 3 retries before the error screen shows (orchestrator reading of 'Phone retires yes': the recommendation put was to keep them).
<!-- SECTION:NOTES:END -->
