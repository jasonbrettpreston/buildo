---
id: TASK-347
title: >-
  R16 Increment 1·B: the four 1.3 W decisions as OPERATOR tasks with verified
  recommendations
status: BUILT
assignee:
  - '@lane-BL-R16'
created_date: '2026-11-19T21:03:00Z'
updated_date: '2026-11-23T16:06:00Z'
labels:
  - McFixReborn
milestone: m-1
dependencies: []
references:
  - docs/reports/lanes/2026-11-19/BL-R16/REPORT.md
  - docs/reports/lanes/2026-11-19/BL-R16/TRIAGE.md
type: record
ordinal: 47012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Scope now: record-only. Lane BL-W (task-123 stage 1, docs/reports/lanes/2026-11-19/BL-W/PLAN.md) drafted four operator decisions D1 to D4 with UNVERIFIED recommendations. Ground each, put the recommendations through one review round, and create one OPERATOR task per decision in m-1 (RR-0300, RR-0232). Files: backlog/
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 one OPERATOR task per unruled decision (two: D1, D3) in m-1, each with a plain explanation, Grounded and Recommendation lines stating verified or UNVERIFIED; ruled decisions (D2, D4) recorded with their cite
- [x] #2 task-123, 266, 267 carry a dated note naming the OPERATOR tasks; backlog doctor clean
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
1. AC1: read PLAN.md and IMPACT.md of BL-W, re-ground D1 to D4 against the code and registers, one review round (r1) on the context file, TRIAGE.md, fold. 2. AC1: create OPERATOR tasks in m-1 for the decisions no register rules (D1, D3); record D2 and D4 as already ruled with verbatim words and cites. 3. AC2: dated notes on task-123, 266, 267 (no status change), loose-end lines on task-343, backlog doctor, one docs commit, REPORT.md copied to docs/reports/lanes/2026-11-19/BL-R16/.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-19 taken on the board at lane launch (lane BL-R16, worktree /Users/brettpreston_macmini/Buildo-wt-r16, branch wf2/inc1b-r16), RR-0240
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Two OPERATOR tasks created in m-1 (task-348 D1, task-349 D3), each with plain explanation, Grounded and Recommendation (both UNVERIFIED, reasons stated); D2 and D4 found already ruled (MORNING-DECISIONS.md:704-705; .cursor/MCFRONTEND-QUEUE.md:363) and recorded as notes. AC#1 reads four tasks; the brief orders no task for a ruled decision, so two were made. Notes on task-123, 266, 267, 343; backlog doctor clean. Commit d9fda5735 (hook GATE OK, POLICY CHECKS OK). Review r1 triaged.
<!-- SECTION:FINAL_SUMMARY:END -->
