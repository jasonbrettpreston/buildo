---
id: TASK-388
title: >-
  MF.RULES McFrontend register and handbook updated: the page-behaviour rule,
  the report renderer under the checks, the login and terms contradictions
status: RUNNING
assignee:
  - '@lane-BL-MFRULES'
created_date: '2026-11-20T15:08:00Z'
updated_date: '2026-11-24T18:41:00Z'
labels:
  - dead
milestone: m-1
dependencies: []
type: build
ordinal: 88012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator 2026-11-20: "is the McFront-end updated - what does it mean when I say? Enforce McFront-end?". The McFrontend register (Spec 135, rendered into docs/specs/02-web-admin/136_mcfrontend_handbook.md by its generator: 44 rules, 8 OWED) gains, through the generator only: the rule that a mount or binding file holds no fetch, timer, query or cache call (lock: the STD.SCAN test); the rule that every renderer file is owned and listed (lock: STD.REPORT-OWN). Put to the operator, not decided here: Spec 126:920 counts web login as a MaxBLD page while :924 says auth is not converted; terms-accept is a separate hand-built page while section 11b.3 says a checkbox in the sign-up form; the per-page TypeScript builder form (MF-35 a, MF-48 D-2 a) as the standing meaning of schema-driven. Operator 2026-11-20 (verbatim): "1. yes. add the tasks to incr 1b and remove the ones we dont need 2. fold ... d. just add the review enforcement not the others. e. fine". Plan: ~/Buildo-scratch/lanes-20261119/inc1b/enforce/PLAN-3-ONE-PLAN.md; reviewer evidence in ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md entries of 2026-11-20 (plan grounder; page-runner measurement; page-by-page schema check). Each gate or scan: a committed planted-defect test, red first through the real hooks; a separate agent attacks it, results reported as refused or STILL OPEN. Lens set with the rule lists whole and the rulings pasted; grounder launched by the orchestrator, never the lane. Files: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md, docs/specs/02-web-admin/136_mcfrontend_handbook.md, docs/specs/02-web-admin/126_maxbld_surface_standard.md
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
Correction: the register file is docs/specs/02-web-admin/135_mcfrontend_decisions_register.md (the Files line above names it wrongly; the launch brief must use this path).

2026-11-20 taken on the board at lane launch (lane BL-MFRULES, worktree /Users/brettpreston_macmini/Buildo-wt-mfrules, branch wf1/inc1b-mfrules), RR-0240

Operator 2026-11-20, verbatim: "FE-45 - yes we dont want spagetti code - what is the probelm" (MORNING-DECISIONS.md, entry "Operator CONFIRMS the FE-45 wording"): the FE-45 wording is confirmed; the WORDING UNCONFIRMED marks come off in the next fix round; the lock stays owed to task-382.

2026-11-23 RR-0437 (MORNING-DECISIONS.md:2247): left out of the McFixReborn folds. Its new register row took an id the board has since given to another rule, and its wording is unconfirmed; to be finished as its own task with the wording put to the operator. Branch wf1/inc1b-mfrules is untouched.
<!-- SECTION:NOTES:END -->
