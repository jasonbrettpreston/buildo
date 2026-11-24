---
id: TASK-2
title: >-
  CHK.0 Rulings register (plan-gen/rulings-register.json: every operator ruling
  a row...
status: MERGED
assignee:
  - '@lane'
created_date: '2026-11-19T04:57:00Z'
updated_date: '2026-11-24T18:40:00Z'
due_date: '2026-11-26'
labels:
  - dead
milestone: m-0
dependencies: []
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#F/CHK.0
  - ~/Buildo-scratch/lanes-20261117/checks/REPORT.md sha256=11bfda56fd34
  - >-
    ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L725
    sha256=a12f15596694
  - >-
    ~/Buildo-scratch/lanes-20261117/inc-plan/checks/PANEL.md#L2
    sha256=b30b7f626bca
  - task-314
documentation:
  - backlog/docs/increments/doc-1 - Increment-F-requirements.md
priority: low
type: build
project: McIncrement
ordinal: 1001
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: CHK.0 Rulings register (plan-gen/rulings-register.json: every operator ruling a row with topic, groups, supersedes, cite and quote; finalplan.mjs and context-pack.mjs take ruling text only from it) + rebuild gate (ruling-gate.mjs G1 decisions-log entry newer than the register, G2 superseded wording in force, G3 context self-test, G4 row consistency; wired into rebuild-board.sh) + add-ruling.mjs (verbatim quote or refuse)

snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: MEASURED: gate adds 0.3 s to the 3.6 s rebuild; build effort GUESS 0.5 d (not timed)

Plan text at the snapshot: NOT COMPLETE: re-use the repo decision log (scripts/analysis/decision-log.mjs, R-HK); the scratch register retires once the rulings move; in the Increment 1·A panel
slicePart: measured check
planNote: reuse: status NOT COMPLETE: re-use the repo decision log (scripts/analysis/decision-log.mjs, R-HK); the scratch register retires once the rulings move; in the Increment 1·A panel ((operator 2026-11-18, MORNING-DECISIONS.md:744 "Add to the named list.." and :750 "yes to re-use obviosouly, yes drop"; shape decided by the Increment 1·A panel, lanes-20261117/inc1a-review/p1))
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
Dated note 2026-11-18 (M-246, prior text kept; RR-0152 · task-2 · Backlog; operator, verbatim: "yes to re-use obviosouly, yes drop - run the panel as always")

2026-11-19 relevancy pass (R7, RR-0214): CHANGED: goes through the repo decision log (decision-log.mjs, R-HK) and G2 backlog-decision.mjs; BL.0's loader already loaded the rulings as 68 Backlog decisions; the scratch register and add-ruling.mjs are not built as new tools. Overlaps BL.0 (plan line 90: 'Overlaps CHK.0, CHK.7 and INFRA.3'; MORNING-DECISIONS.md:751 'CHK.0 goes through decision-log.mjs'). Description unchanged (no quotable narrowed scope beyond the ruling).

2026-11-19 relevancy pass 2 (R9, after R8, RR-0219 and RR-0214; review r1 triaged in docs/reports/lanes/2026-11-19/BL-R9/TRIAGE.md): CHANGED: no scratch register, add-ruling or ruling-gate is built; BL.0 G2 scripts/analysis/backlog-decision.mjs (quote at a resolving cite, 3002ef51c era) and scripts/analysis/decision-log.mjs (R-HK) are the pair, 68 rulings already loaded (R7b note). Rulings after RR-0219 enter through task-314 (R8f, LATER, not built; MORNING-DECISIONS.md:960). (re-use ruling MORNING-DECISIONS.md:750-751). Scope now: build nothing new; confirm task-314 covers the rulings from RR-0220 on, then close this task as covered (MERGED into task-314 once task-314 is DONE).

2026-11-19 (R8f, task-314): the remaining scope of this task (rulings after RR-0219 enter the Backlog decisions) is covered once the task-314 commit lands: five operator rulings RR-0232, RR-0233, RR-0235, RR-0242, RR-0248 written through G2 as decision-71 to decision-75; five reading rows (RR-0223, 0225, 0227, 0238, 0240) held back as orchestrator words. Task-2 can close MERGED into task-314 once task-314 is DONE.

2026-11-19 MERGED into task-314 (R8f landed in push 7b8381cfd): the rulings register and gate live as decision-log + G2; nothing left to build (pass 2 note)
<!-- SECTION:NOTES:END -->
