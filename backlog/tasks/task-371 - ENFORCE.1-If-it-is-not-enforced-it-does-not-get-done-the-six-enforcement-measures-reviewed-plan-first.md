---
id: TASK-371
title: >-
  ENFORCE.1 If it is not enforced it does not get done: the six enforcement
  measures, reviewed plan first
status: DROPPED
assignee:
  - '@lane-BL-ENFORCE'
created_date: '2026-11-20T13:31:00Z'
updated_date: '2026-11-24T14:42:00Z'
labels:
  - McFix
  - McFix E
  - McFix Final
  - dead
milestone: m-1
dependencies: []
references:
  - docs/reports/lanes/2026-11-20/BL-ENFORCE/PLAN.md
  - docs/reports/lanes/2026-11-20/BL-ENFORCE/FINDINGS.md
  - docs/reports/lanes/2026-11-20/BL-ENFORCE/REPORT.md
  - docs/reports/lanes/2026-11-20/BL-ENFORCE/PLAN-2-MERGED.md
  - docs/reports/lanes/2026-11-20/BL-ENFORCE/FACTS-2.md
  - docs/reports/lanes/2026-11-20/BL-ENFORCE/FINDINGS-2.md
type: build
ordinal: 71012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator 2026-11-20 (verbatim): "Essentially if its not enforced it doesnt get done is my view. ... We spend so much time making rules and recording decisions but we dont follow them.  Same lesson over ans over" and "Review them first 1. y 2. y 3. y 4. y 5. where does this rule set go on the board yes 6. yes". Record: ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md, entry "Operator: the six enforcement recommendations approved, reviewed first". Scope now, STAGE 1 a reviewed plan (lens set and a separate grounder BEFORE any build): (1) every rule set records per rule: check, owed with a task, or advice; the unchecked count pinned, shrink-only; (2) the push station refuses a push unless the handbook pass on that commit has a grounder verdict; a task close needs one (with task-366); (3) the push station runs the phone tests and refuses a push until they pass on that commit; (4) a ruling and its check are recorded in one step by generator; (5) one number on the board per rule set (in force, machine-checked, owed): where on the board; (6) the list of stale or uncheckable rules as retirement candidates for the operator. Files: docs/reports/lanes/2026-11-20/BL-ENFORCE/PLAN.md
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each of the six has: the existing mechanism it extends (file:line), the smallest build, its test red first, its cost, and what it refuses
- [ ] #2 The plan is reviewed by the lens set with the governing rule lists whole and ruled on by a separate grounder before any build
- [ ] #3 Item 5 names the exact place on the board with a mock of the row
- [ ] #4 Item 6 lists candidates only; nothing retired
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
1. Per measure 1 to 6: rule quoted file:line, existing mechanism file:line, smallest build with red-first test, refusal message, cost (measured or GUESS), what it cannot do, bypass (AC1). 2. Run the DeepSeek lens set on the plan with each governing rule list whole (Spec 08 s5/7/11, Spec 137, eng s5/9/14, Spec 132 s4/6) plus code-review, error-paths, security; list findings by id; a separate grounder rules (AC2, grounder owed). 3. Measure 5: board place and text mock (AC3). 4. Measure 6: retirement candidates only (AC4). 5. Build order and operator decision drafts. Plan: docs/reports/lanes/2026-11-20/BL-ENFORCE/PLAN.md
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-20 taken on the board at lane launch (lane BL-ENFORCE, worktree /Users/brettpreston_macmini/Buildo-wt-enforce, branch wf1/inc1b-enforce), RR-0240

2026-11-20 stage 1 plan and lens round 1 done (94 findings, untriaged, FINDINGS.md); task stays RUNNING: grounder owed.

2026-11-20 grounder verdict on the stage-1 plan (separate read-only agent, on 84259e14f): 37 HIGH/CRIT lens findings: 27 CONFIRMED, 9 REJECTED, 1 CONFLICT (R-BA 132:505 against a new 'advice' state). The plan is NOT buildable as written. MINIMUM SET that gives 'no close and no push without rule lists and a separate grounder': (a) task-366 close check landed and hardened; (b) one push-range arm on the existing scripts/analysis/mcbylaws/gate.mjs --push (pre-push:41) calling the same functions, also refusing a code commit with no Task trailer; (c) a minimal in-place edit of the user-level lane-guard hook for the rule-list block, operator typed go; NOT a repo copy (a lane-writable import, fails open). FACADE RISKS named: measure 1 ('check' means a file exists; 'advice' is lane-gameable; ceilings are today's count; 30 partial rules counted as checked: true fully checked step count is 334 not 364), measure 4 (any existing file passes), measure 5 (displays counts, refuses nothing; the board status line it would write never runs on the WARN branch; board checkout is stuck WARN uncommitted backlog changes), measure 3 real but the tip is already red (18 phone tests) and the custom cache is unproven: use the existing scripts. Park measures 1, 4, 5. Prune candidates verified true: R1, R2, R5, R8, R9; drop R7; R10 three of six. D-3 already ruled by RR-0149/0150; D-4 recommendation not supported. Nothing built; stage 2 waits on the operator.

2026-11-20 operator RULED (verbatim: 'yes. you are making a mess. What a diaster?  Show me you can fix this without just creating a fasade?'; MORNING-DECISIONS.md entry 'cut the enforcement work to the three refusals'): scope cut to the push-range arm on the existing push gate (after task-366 lands) and the lane-guard rule-list refusal (operator typed go). Measures 1, 4, 5 and the lane-guard repo copy are PARKED; no build. Each refusal is accepted only after a separate agent's bypass attempts are shown refused.

2026-11-20 second job: merged plan (PLAN-2-MERGED.md, orchestrator draft, copied unchanged), FACTS-2.md, lens round on it (96 findings, FINDINGS-2.md, untriaged); task stays RUNNING: grounder owed.

2026-11-20 operator ruling (M-246, prior text kept), ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1610, verbatim: "approved", to the list he pasted back; the item for this task as put to him: "Record 385, 397, 400 and 404 as dropped, and 371 and 377 as closed superseded. Recommended yes.". The decision record tool holds one record per quote and cite (decision-126, RR-0341, carries the same approval), so this note is the record on this task. No status is moved by hand.

Dated note 2026-11-22 (M-246, prior text kept; RR-0385 · Backlog; operator, verbatim: "I agree with the task chages and removals."; MORNING-DECISIONS.md:1915 entry): to be withdrawn after a read-only look at what the lane branch holds (unbuilt gate work). Status not changed yet.

Dated note 2026-11-22 (M-246, prior text kept; RR-0385 · Backlog; operator, verbatim: "I agree with the task chages and removals."): withdrawn after the read-only look of 2026-11-22: branch wf1/inc1b-enforce (8448e0db5) holds 0 commits the board lacks; only plan records were made and they are on the board (docs/reports/lanes/2026-11-20/BL-ENFORCE/); nothing was built. Kept: the scratch file ~/Buildo-scratch/lanes-20261119/inc1b/enforce/PLAN-3-ONE-PLAN.md, which tasks 379 to 388 and 405 cite.
<!-- SECTION:NOTES:END -->
