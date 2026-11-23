---
id: TASK-350
title: >-
  R17 Increment 1·B: the semi mock approvals entered; the A.6 questions as one
  OPERATOR task; loose ends added
status: BUILT
assignee:
  - '@lane-BL-R17'
created_date: '2026-11-19T21:24:00Z'
updated_date: '2026-11-23T16:06:00Z'
labels:
  - McFixReborn
milestone: m-1
dependencies: []
references:
  - docs/reports/lanes/2026-11-19/BL-R17/REPORT.md
  - docs/reports/lanes/2026-11-19/BL-R17/TRIAGE.md
  - docs/reports/lanes/2026-11-19/BL-R17/r1-review.txt
type: record
ordinal: 50012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Scope now: record-only. (1) Enter through G2 the operator's two semi mock approvals (RR-0308 and the 'Mock approved. Looks good!' ruling) naming task-319. (2) Lane BL-A6 (task-320) brought back eight questions (docs/reports/lanes/2026-11-19/BL-A6/REPORT.md): ground them, review the recommendations once, and put the real operator decisions on the board as ONE OPERATOR task in m-1 (RR-0300, RR-0232). (3) Append to the Loose ends task-343 the loose ends found by lanes BL-A6, BL-SEMI2, BL-PROOF2 and BL-W. Files: backlog/
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 the two approvals entered through backlog-decision.mjs with verbatim quotes and cites
- [x] #2 one OPERATOR task in m-1 for the A.6 questions with a plain explanation, Grounded and Recommendation lines per question stating verified or UNVERIFIED
- [x] #3 loose-end lines appended to task-343; backlog doctor clean
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
1. AC1: enter RR-0308 (decision-93) and RR-0309 (decision-94) through backlog-decision.mjs naming task-319; dated note on task-319 (done). 2. Coordinator change: enter RR-0310 (decision-95, naming task-320 and task-351) and create task-351 (build, LATER, m-1) holding the reset-date grounding; sort the eight A.6 questions; ground the three real unruled ones; one review round r1, TRIAGE.md, fold KEPT; create ONE OPERATOR task for them (AC2). 3. AC3: append the loose-end lines to task-343 with --append-notes, count the tied up by: NONE lines; backlog doctor; one docs commit with Task: task-350; REPORT.md and gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-19 taken on the board at lane launch (lane BL-R17, worktree /Users/brettpreston_macmini/Buildo-wt-r17, branch wf2/inc1b-r17), RR-0240
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Landed in a02ba26ba (hooks: GATE OK, POLICY CHECKS OK): decision-93 (RR-0308), decision-94 (RR-0309), decision-95 (RR-0310); task-351 (build, LATER) for the Toronto-time reset label; OPERATOR task-352 with three design questions; 13 loose-end lines plus header on task-343 (18 unowned); backlog doctor clean; review r1 triaged.
<!-- SECTION:FINAL_SUMMARY:END -->
