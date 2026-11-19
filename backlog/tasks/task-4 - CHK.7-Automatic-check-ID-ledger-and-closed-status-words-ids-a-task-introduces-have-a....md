---
id: TASK-4
title: >-
  CHK.7 Automatic check: ID ledger and closed status words (ids a task
  introduces have a...
status: RUNNING
assignee:
  - '@lane-BL-CHK7'
created_date: '2026-11-19T04:57:00Z'
updated_date: '2026-11-19T13:58:00Z'
due_date: '2026-11-26'
labels:
  - F
  - plan:CHK.7
  - evidence:ready
  - unverified
milestone: m-0
dependencies: []
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#F/CHK.7
  - ~/Buildo-scratch/lanes-20261117/checks/REPORT.md sha256=11bfda56fd34
  - >-
    ~/Buildo-scratch/lanes-20261117/inc-plan/checks/PANEL.md#L2
    sha256=b30b7f626bca
documentation:
  - backlog/docs/increments/doc-1 - Increment-F-requirements.md
priority: low
type: build
project: McIncrement
ordinal: 1008
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: CHK.7 Automatic check: ID ledger and closed status words (ids a task introduces have a ledger claim or a queue row; no duplicate numbers; queue Status words in the closed nine at Spec 137 :59-70; plan status words ratchet)

snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: MEASURED about 0.5 s; build GUESS 0.25 d

Plan text at the snapshot: NOT COMPLETE: extend mcbylaws-queue-check.mjs, no new tool (proposed); in the Increment 1·A panel
slicePart: measured check
planNote: reuse: status NOT COMPLETE: extend mcbylaws-queue-check.mjs, no new tool (proposed); in the Increment 1·A panel ((operator 2026-11-18, MORNING-DECISIONS.md:744 "Add to the named list.." and :750 "yes to re-use obviosouly, yes drop"; shape decided by the Increment 1·A panel, lanes-20261117/inc1a-review/p1))
who (plan text): lane
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Pre-register the expected moves, committed alone — "Pre-register the task's `rules[]` and expected moves" (.cursor/MCBYLAWS-QUEUE.md:109)
- [ ] #2 Failing tests are written into the plan and reviewed at plan altitude — "are written INTO the plan and reviewed at PLAN altitude" (docs/specs/00-architecture/08_agents.md:465)
- [ ] #3 `write_scope` declared in the brief — "The brief file opens with a front-matter block" (docs/specs/00-architecture/08_agents.md:144)
- [ ] #4 PLAN panel run with the lens set, never one generic pass — "NEVER run one generic pass" (docs/specs/00-architecture/08_agents.md:334)
- [ ] #5 Fold validated by a grounder that re-executes every claim — "one grounder re-executes every claim in the fold" (docs/specs/00-architecture/08_agents.md:458)
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Dated note 2026-11-18 (M-246, prior text kept; RR-0152 · task-4 · Backlog; operator, verbatim: "yes to re-use obviosouly, yes drop - run the panel as always")

2026-11-19 relevancy pass (R7, RR-0214): CHANGED: extends mcbylaws-queue-check.mjs, no new tool (MORNING-DECISIONS.md:751); the closed-status-word half is now carried by the configured Backlog statuses and gate G3 (plan sections 1 and 3; overlap named at .cursor/active_task.md line 90), the ID-ledger half stays. Description unchanged (narrowed scope is the orchestrator's reading, not a quotable plan sentence).

2026-11-19 relevancy pass 2 (R9, after R8, RR-0219 and RR-0214; review r1 triaged in docs/reports/lanes/2026-11-19/BL-R9/TRIAGE.md): CHANGED (R7b note stands): extends scripts/analysis/mcbylaws/mcbylaws-queue-check.mjs, no new tool (re-use ruling MORNING-DECISIONS.md:750-751); the closed-status-word half is the nine configured Backlog statuses (backlog/config.yml:3) plus G3; no R8 deliverable checks ids. Scope now: extend mcbylaws-queue-check.mjs so ids a task introduces have a ledger claim or a queue row and no number repeats; no status-word check.

2026-11-19 taken on the board at lane launch (lane BL-CHK7, worktree /Users/brettpreston_macmini/Buildo-wt-chk7, branch wf1/inc1a-chk7), RR-0240
<!-- SECTION:NOTES:END -->
