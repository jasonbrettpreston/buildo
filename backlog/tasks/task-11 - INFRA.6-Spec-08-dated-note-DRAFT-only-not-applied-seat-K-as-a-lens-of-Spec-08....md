---
id: TASK-11
title: >-
  INFRA.6 Spec 08 dated note (DRAFT only, not applied): seat K as a lens of Spec
  08...
status: DONE
assignee:
  - '@lane-BL-INFRA6'
created_date: '2026-11-19T04:57:00Z'
updated_date: '2026-11-24T14:42:00Z'
due_date: '2026-11-26'
labels:
  - F
  - plan:INFRA.6
  - unverified
  - dead
milestone: m-0
dependencies: []
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#F/INFRA.6
  - docs/specs/00-architecture/08_agents.md#L379 sha256=81ced38b6b87
  - docs/reports/lanes/2026-11-19/BL-INFRA6/REPORT.md
  - docs/reports/lanes/2026-11-19/BL-INFRA6/TRIAGE.md
documentation:
  - backlog/docs/increments/doc-1 - Increment-F-requirements.md
priority: low
type: build
project: McIncrement
ordinal: 1015
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: INFRA.6 Spec 08 dated note (DRAFT only, not applied): seat K as a lens of Spec 08 section 5.8 Operating-Model Compliance at plan altitude, within the section 9 "Role proliferation" bar; M-246 dated-note form; says seat K was already added to panel.cjs (MORNING-DECISIONS.md:712) and creates no second role; lands after push 6

snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: GUESS 0.25 day (draft done in this lane; landing is part of a later spec commit)

Plan text at the snapshot: NOT COMPLETE: Spec 08 dated note; build pass and integration owed; home check in the Increment 1·A panel
landingPush: after push 6 (~/Buildo-scratch/inc6-guard/RULES.md:8 "origin/wf1/mb-rulings must not move except by push 5 and push 6")
planNote: reuse: status NOT COMPLETE: Spec 08 dated note; build pass and integration owed; home check in the Increment 1·A panel ((operator 2026-11-18, MORNING-DECISIONS.md:744 "Add to the named list.." and :750 "yes to re-use obviosouly, yes drop"; shape decided by the Increment 1·A panel, lanes-20261117/inc1a-review/p1))
who (plan text): LANE-TOOLS lane (scratch tooling only, ~/Buildo-scratch/panel-tools/; no repo change, no DB)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Pre-register the expected moves, committed alone — "Pre-register the task's `rules[]` and expected moves" (.cursor/MCBYLAWS-QUEUE.md:109)
- [x] #2 Failing tests are written into the plan and reviewed at plan altitude — "are written INTO the plan and reviewed at PLAN altitude" (docs/specs/00-architecture/08_agents.md:465)
- [ ] #3 `write_scope` declared in the brief — "The brief file opens with a front-matter block" (docs/specs/00-architecture/08_agents.md:144)
- [ ] #4 PLAN panel run with the lens set, never one generic pass — "NEVER run one generic pass" (docs/specs/00-architecture/08_agents.md:334)
- [x] #5 Fold validated by a grounder that re-executes every claim — "one grounder re-executes every claim in the fold" (docs/specs/00-architecture/08_agents.md:458)
- [ ] #6 Built red first, then green, on the tip — "Red tests first, then the code, through the real hooks." (docs/specs/00-architecture/08_agents.md:490)
- [ ] #7 OUTPUT panel record committed with the work — "is committed with the work (R-KM)." (.cursor/MCBYLAWS-QUEUE.md:116)
- [ ] #8 McFrontend build only: queue row first — "No McFrontend work starts without its row in" (docs/specs/02-web-admin/126_maxbld_surface_standard.md:72)
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Quote the rules: 08_agents.md section 5.8 (:249-254) and section 9 Role proliferation (:380); sources MORNING-DECISIONS.md:712, :744, :750, :941-944; template axes line :3. 2. Draft one DRAFT (not applied) dated note, at most 8 lines, M-246 form, after the 5.8 KFM line; no rule text change, no new role, seat or template. 3. One review round (deepseek-review.js review mode, plan template) on the note text; triage KEEP/REJECT; fold KEPT defects only. 4. Write note; one docs commit via real hooks with Task: task-11 and the task file. 5. Copy REPORT/TRIAGE/review output to docs/reports/lanes/2026-11-19/BL-INFRA6/ in a last docs commit; add-ref; check AC with evidence (tests/panel-run AC not applicable to a note); BUILT.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-19 relevancy pass (R7, RR-0214): KEPT: not replaced by BL.0 (.cursor/active_task.md planNote); Spec 08 dated note, build pass and integration owed.

2026-11-19 relevancy pass 2 (R9, after R8, RR-0219 and RR-0214; review r1 triaged in docs/reports/lanes/2026-11-19/BL-R9/TRIAGE.md): KEPT: not covered by any R8 deliverable (no Spec 08 note on seat K in R8c 1c47f4c79, which added the lane-reports rule at 08_agents.md:344). Lands after push 6 (landingPush in the description). Scope now: one Spec 08 dated note (M-246 form) naming seat K as a lens of section 5.8 at plan altitude, creating no second role.

2026-11-19 taken on the board at lane launch (lane BL-INFRA6, worktree /Users/brettpreston_macmini/Buildo-wt-infra6, branch wf1/inc1a-infra6), RR-0240

2026-11-19 BL-INFRA6: section 5.8 (08_agents.md:249-254) is a WF6 decision-trail audit, so it does not make the note redundant; full DRAFT (not applied) dated note written after :253 (one paragraph, M-246 form, prior text kept, no rule text change, no new role/seat/template). Review r1 (review mode, plan template) triaged in docs/reports/lanes/2026-11-19/BL-INFRA6/TRIAGE.md; 4 KEPT items folded.
Dated note 2026-11-19 (M-246, prior text kept; RR-0248 · task-11 · Backlog; operator, verbatim: "y - this is a major improvement")

2026-11-19 DONE: closing commits on origin/wf1/mb-rulings (push windows 3 and 4: 62de20da0, 7b8381cfd; station PASS); evidence per the task's final summary
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Dated note (DRAFT, not applied) landed on lane branch wf1/inc1a-infra6 in cc37e5c51 through real hooks (GATE OK, POLICY CHECKS OK); review r1 triaged, 4 KEPT folded. AC 1,3,4,6,7,8 not applicable to a docs-only note; AC 2,5 held by the review round and the triage.
<!-- SECTION:FINAL_SUMMARY:END -->
