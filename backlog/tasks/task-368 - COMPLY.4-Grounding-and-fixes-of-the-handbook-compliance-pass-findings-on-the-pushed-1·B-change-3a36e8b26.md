---
id: TASK-368
title: >-
  COMPLY.4 Grounding and fixes of the handbook compliance pass findings on the
  pushed 1·B change (3a36e8b26)
status: RUNNING
assignee:
  - '@lane-BL-GROUND'
created_date: '2026-11-20T13:04:00Z'
updated_date: '2026-11-23T16:06:00Z'
labels:
  - McFix E
  - McFixReborn
milestone: m-1
dependencies: []
references:
  - docs/reports/lanes/2026-11-20/BL-GROUND/REPORT.md
  - docs/reports/lanes/2026-11-20/BL-GROUND/GROUNDER.md
  - docs/reports/lanes/2026-11-20/BL-GROUND/VERDICTS-SUMMARY.md
  - docs/reports/lanes/2026-11-20/BL-GROUND/GROUNDER-2.md
  - docs/reports/lanes/2026-11-20/BL-GROUND/VERDICTS-SUMMARY-2.md
type: build
ordinal: 68012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator 2026-11-20 (verbatim): "Add the tasks to incr 1b - the infa freeze needs to be lifted again - what is the point of building a mess - wasted effort." Record: ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md, entry "Operator: compliance tooling tasks into 1·B". Scope now: a separate grounder (not lane BL-COMPLY) rules on every finding of task-365 against the files; each CONFIRMED finding becomes a fix task or an OPERATOR draft with Grounded and Recommendation lines; conflicts between rule sets (the storage policy compute-on-first-open against the step standard core.10 and the engineering standards data flow) go to the operator, never decided by a lane. The change was pushed before the pass reported. Waits on: task-365 report.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every task-365 finding has a verdict with file:line from an agent that did not write the code
- [ ] #2 Every CONFIRMED finding has a fix task or an OPERATOR draft
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
1. Extract the 101 CRIT and HIGH findings of FINDINGS.md, dedupe into defect groups (AC1). 2. For each group open the code at the pushed tip 3a36e8b26 and the rule in its source spec; rule CONFIRMED, REJECTED (reason) or CONFLICT with file:line. 3. Answer the scan-scope question by reading each gate's scope and running each gate's own --check read-only. 4. Rule the three orchestrator readings (core.9/10 vs P1, core.8 vs mobile, Spec 90 section 5 vs lucide). 5. Sample 30 of the MED and lower findings across handbooks and report the confirm rate. 6. Write GROUNDER.md and VERDICTS-SUMMARY.md, one docs commit; no code fixed, no task created (AC2 is the orchestrator's: it turns CONFIRMED groups into fix tasks and CONFLICTs into operator decisions).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-20 taken on the board at lane launch (lane BL-GROUND, worktree /Users/brettpreston_macmini/Buildo-wt-ground, branch wf1/inc1b-ground), RR-0240

2026-11-20 BL-GROUND (grounder): 101 CRIT and HIGH ruled in 24 groups: 22 ids CONFIRMED in 12 defects (D1-D12), 7 ids CONFLICT in 4 groups (C1-C4), 72 REJECTED (33 ruling exists, 22 already enforced, 16 rule does not bind or claim not true, 1 empty); MED sample 2 of 30 confirmed. Scan-scope, the three readings and the two review-tool defects answered in GROUNDER.md. No code fixed, no task created: AC2 (fix tasks and operator drafts) is the orchestrator's. Task left RUNNING.

2026-11-20 BL-GROUND second job (BL-COMPLY3, FINDINGS-2): 154 CRIT/HIGH ids: 22 CONFIRMED (14 extend D3, 3 D13, 5 D14), 3 CONFLICT (C4 again x2, new C5 FE-39 vs LOAD.1 gate), 129 REJECTED (59 enforced, 52 not bound or not true, 17 ruling, 1 empty); sample 20 of 431: 5 confirmed (new D15). Corrects the first report on one point: Spec 126 P4 and Spec 128 Rule 3 do bind phone tunables (D14). No code fixed, no task created. Task left RUNNING.
<!-- SECTION:NOTES:END -->
