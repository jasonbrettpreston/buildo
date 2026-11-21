---
id: TASK-419
title: >-
  LAUNCH.GAPS The fold check leaves a record and a one-file review keeps one
  name
status: LATER
assignee: []
created_date: '2026-11-21T14:40:00Z'
updated_date: '2026-11-21T14:40:00Z'
labels:
  - McFix
  - McFix V2
milestone: m-1
dependencies:
  - TASK-418
type: build
ordinal: 119012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-21 by the orchestrator, Spec 137 rule 2, on the operator's order (MORNING-DECISIONS.md:1651, verbatim: "Let's resolve 1 and 2 now."; :1653, verbatim: "ensure the plan is reviewed for the cards before moving forward"). Two gaps found on 2026-11-21 while task-418 and task-412 went through the pre-launch steps. GAP 1, the fold check leaves no record: after the confirmed plan findings are folded into the plan, a separate grounder checks the folded plan and adds the last line "Plan: <id> sha256:<12>" to GROUNDER-PLAN.md; the launch check proves only that line against the plan; the grounder's report of the check is written nowhere by rule, plan-prep neither asks for it nor stores it (on task-412 it was written after the fact, docs/reports/reviews/task-412/FOLD-CHECK.md, and the output review ruled the missing record a CONFIRMED HIGH; on task-418 it is only in a scratch log). GAP 2, the one-file name trap: when a diff fits one review input, lens-input writes it without a part suffix (scripts/analysis/rule-lists.mjs:425), while the close check reads an unsuffixed output as a review of the raw diff and only -pN outputs as tool-made inputs (scripts/hooks/check-lane-close.mjs:487, :509-513), so the tool's own output for a small diff is refused at close until the lane renames it -p1 (met by the task-418 lane). Wanted: the smallest change that (1) makes the fold check a committed record that the pre-launch steps carry and the launch check can see, written by the grounder and never by the script; (2) makes the tool and the close check agree on the name of a one-file review, without breaking outputs already committed. Reuse what exists; no new tool. NOT in scope: the cross-read adversary pass (operator, MORNING-DECISIONS.md:1647: not needed). The plan (to be written read-only and reviewed before any build) names the design and the final Files line. Files: scripts/analysis/rule-lists.mjs, scripts/hooks/check-lane-close.mjs, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/check-lane-close.logic.test.ts
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
Dated note 2026-11-21 (M-246, prior text kept; RR-0351 · task-419 · Backlog; operator, verbatim: "Gap 3 we dont need the cross check.")

Dated note 2026-11-21 (M-246, prior text kept; RR-0352 · task-419 · Backlog; operator, verbatim: "Let's resolve 1 and 2 now.")
<!-- SECTION:NOTES:END -->
