---
id: TASK-355
title: >-
  R18 Increment 1·B: the three A.6 answers entered (task-352); build tasks for
  the no-plan page and the search box wording, researched
status: BUILT
assignee:
  - '@lane-BL-R18'
created_date: '2026-11-19T21:44:00Z'
updated_date: '2026-11-23T16:06:00Z'
labels:
  - McFixReborn
milestone: m-1
dependencies: []
references:
  - docs/reports/lanes/2026-11-19/BL-R18/REPORT.md
type: record
ordinal: 55012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Scope now: record-only. Enter RR-0311, RR-0312, RR-0313 through G2; close task-352 with the decisions; research and create the build tasks the two changing answers need (the no-plan error page with a way to sign up; the search box reading Enter a Toronto address). Files: backlog/
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 the three decisions entered through backlog-decision.mjs with verbatim quotes and cites; task-352 DONE
- [x] #2 one researched build task per changing answer in m-1 with Scope now, declaration sites with file:line, the design source, runnable acceptance criteria, a Files line and the owning McFrontend row; backlog doctor clean
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
1. Enter RR-0311..RR-0314 through backlog-decision.mjs (naming task-352, task-320); close task-352 DONE (AC1). 2. Research the no-plan page (b) and the search box wording (c) with file:line. 3. One review round on the two task texts, TRIAGE.md, fold KEPT. 4. Create the two build tasks in m-1 (LATER, build), loose ends on task-343, doctor, one docs commit (AC2).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-19 taken on the board at lane launch (lane BL-R18, worktree /Users/brettpreston_macmini/Buildo-wt-r18, branch wf2/inc1b-r18), RR-0240

2026-11-19 taken on the board at lane launch (lane BL-R18, worktree /Users/brettpreston_macmini/Buildo-wt-r18, branch wf2/inc1b-r18), RR-0240
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Entered RR-0311 to RR-0314 (decision-96 to decision-99), task-352 DONE; researched build tasks task-356 (search box wording) and task-357 (no-plan page, waits stated) created LATER in m-1; four loose-end lines on task-343; one review round triaged (TRIAGE.md). Commit 9bfb85f43, hooks GATE OK, POLICY CHECKS OK (commit.out). The 'way to sign up' is NOT delivered: it waits on MF-86, the Stripe price ids and MF-70/MF-49.
<!-- SECTION:FINAL_SUMMARY:END -->
