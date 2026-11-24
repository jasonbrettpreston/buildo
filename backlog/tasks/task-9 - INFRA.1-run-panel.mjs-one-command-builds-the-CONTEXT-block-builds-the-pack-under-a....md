---
id: TASK-9
title: >-
  INFRA.1 run-panel.mjs: one command builds the CONTEXT block, builds the pack
  under a...
status: MERGED
assignee:
  - '@lane'
created_date: '2026-11-19T04:57:00Z'
updated_date: '2026-11-24T18:41:00Z'
due_date: '2026-11-26'
labels:
  - dead
milestone: m-0
dependencies:
  - TASK-8
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#F/INFRA.1
  - ~/Buildo-scratch/panel-tools/PROTOCOL.md#L42 sha256=92d373e05df6
  - task-309
documentation:
  - backlog/docs/increments/doc-1 - Increment-F-requirements.md
priority: low
type: build
project: McIncrement
ordinal: 1010
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: INFRA.1 run-panel.mjs: one command builds the CONTEXT block, builds the pack under a machine-wide lock (queue, not failure), assembles the question (split over a size budget), runs seats R,C,I,D,G,O,W,X,K on DeepSeek, detects truncated or empty seat replies and re-runs that seat on a smaller question (failed if still truncated), runs check.mjs, writes SEATS.md (every FIX/finding row with an id); --verify <report> refuses PASS unless the report answers every SEATS.md id and check-cites + check-quotes pass

merged-into: task-309

snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: GUESS 1 day (no measured figure)

Plan text at the snapshot: NOT COMPLETE: re-use the repo DeepSeek Execution Engine (scripts/deepseek-exec.js, SUB-ENG-1) instead of porting run-panel (proposed); in the Increment 1·A panel
landingPush: none (scratch tooling; no push)
planNote: buildpass-tools: status BUILT; build pass found high findings RP-1, RP-3 (buildpass-tools/FIXES.json); fix lane owed (fresh build pass 2026-11-18)
planNote: reuse: status NOT COMPLETE: re-use the repo DeepSeek Execution Engine (scripts/deepseek-exec.js, SUB-ENG-1) instead of porting run-panel (proposed); in the Increment 1·A panel ((operator 2026-11-18, MORNING-DECISIONS.md:744 "Add to the named list.." and :750 "yes to re-use obviosouly, yes drop"; shape decided by the Increment 1·A panel, lanes-20261117/inc1a-review/p1))
who (plan text): LANE-TOOLS lane (scratch tooling only, ~/Buildo-scratch/panel-tools/; no repo change, no DB)
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
Dated note 2026-11-18 (M-246, prior text kept; RR-0152 · task-9 · Backlog; operator, verbatim: "yes to re-use obviosouly, yes drop - run the panel as always")

2026-11-19 relevancy pass (R7, RR-0214): KEPT: not replaced by BL.0 (.cursor/active_task.md planNote); shape per MORNING-DECISIONS.md:751 'INFRA.1 uses scripts/deepseek-exec.js'; the retired scratch run-panel is not ported.

2026-11-19 relevancy pass 2 (R9, after R8, RR-0219 and RR-0214; review r1 triaged in docs/reports/lanes/2026-11-19/BL-R9/TRIAGE.md): MERGED into task-309 (R8d): the context pack (backlog-brief.mjs, c9f7f40fc and 81b43da8a) is the one-command context; the seats and the re-run of truncated replies belong to scripts/deepseek-exec.js (SUB-ENG-1) per MORNING-DECISIONS.md:751 'INFRA.1 uses scripts/deepseek-exec.js'; run-panel.mjs is retired (2026-11-18) and not ported; the report-answers-every-finding rule is carried by TRIAGE.md in the lane reports (R8c 1c47f4c79). Review r1 named no remaining part. (re-use ruling MORNING-DECISIONS.md:750-751, :750 operator words: 'yes to re-use obviosouly, yes drop - run the panel as always').
<!-- SECTION:NOTES:END -->
