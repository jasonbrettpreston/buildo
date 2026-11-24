---
id: TASK-359
title: >-
  PANEL.TRIAGE-1 Triage of the Increment 1·B output panel findings: each checked
  against the files and the loose-ends list, then owned
status: BUILT
assignee:
  - '@lane-BL-TRIAGE'
created_date: '2026-11-19T22:07:00Z'
updated_date: '2026-11-24T14:42:00Z'
labels:
  - McFixReborn
  - dead
milestone: m-1
dependencies: []
references:
  - docs/reports/lanes/2026-11-19/BL-TRIAGE/REPORT.md
  - docs/reports/lanes/2026-11-19/BL-TRIAGE/VERDICTS.md
  - docs/reports/lanes/2026-11-19/BL-TRIAGE/TRIAGE.md
type: record
ordinal: 59012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Scope now: record-only. The findings of the eight seats run 2026-11-19 on the unpushed 1·B work (~/Buildo-scratch/lanes-20261119/inc1b/panel1/FINDINGS.md) are unadjudicated. For each: true or false against the files; already known (task-343 Loose ends, an OPERATOR task, a ruling) or new; then owned: a fix task, an operator item, a loose-end line, or rejected with the reason. Files: backlog/
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 every finding id in FINDINGS.md has a verdict with file:line and an owner or a rejection reason
- [x] #2 confirmed defects in built 1·B work are build tasks in m-1 with runnable acceptance criteria; design questions are OPERATOR drafts with Grounded and Recommendation lines; backlog doctor clean
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
1. (AC1) Copy FINDINGS.md into docs/reports/lanes/2026-11-19/BL-TRIAGE/; open every cited file:line on this head, write VERDICTS.md (true/false/partly with the quoted line, known or new with the cite, kind, owner) for all finding ids, with extra care on RC-1 and RC-3. 2. (AC1,AC2) One repo review round (single generic round; lens set is task-358) on the verdict table and proposed task texts, appended to the context file; triage KEEP/REJECT in TRIAGE.md. 3. (AC2) Create the fix tasks (LATER, build, m-1) one per fix site through the CLI; dated notes on owning tasks (272, 209, 317, 266); one line per ownerless loose end on task-343 by --append-notes; doctor clean. 4. One docs commit with Task: task-359 and explicit paths; REPORT.md; close BUILT.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-19 taken on the board at lane launch (lane BL-TRIAGE, worktree /Users/brettpreston_macmini/Buildo-wt-triage, branch wf2/inc1b-triage), RR-0240
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Round 2 of the 1·B output panel: 42 seat ids and 16 lens rows opened on head f65b64674; five fix tasks (task-360 to task-364); notes on tasks 272, 209, 317, 266, 287; loose-end lines on task-343; drafts D-1 to D-4 in REPORT.md for the orchestrator to relay. Single generic repo review round (r1), lens set is task-358. Commit sha in the hand-back; no push, no DB.
<!-- SECTION:FINAL_SUMMARY:END -->
