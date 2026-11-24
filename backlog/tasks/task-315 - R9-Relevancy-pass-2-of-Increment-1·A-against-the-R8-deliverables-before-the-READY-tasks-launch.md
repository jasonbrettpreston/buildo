---
id: TASK-315
title: >-
  R9 Relevancy pass 2 of Increment 1·A against the R8 deliverables before the
  READY tasks launch
status: DONE
assignee:
  - '@lane-BL-R9'
created_date: '2026-11-19T13:37:00Z'
updated_date: '2026-11-24T14:42:00Z'
labels:
  - follow-up
  - dead
milestone: m-0
dependencies: []
references:
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L910
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L751
  - docs/reports/lanes/2026-11-19/BL-R9/REPORT.md
type: record
project: McIncrement
ordinal: 22012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator 2026-11-19: "and then remaining tasks in incr-1a are still relevant in light of backlog and the updates? Just ensure they are still relevant". Grounded: yes - the morning pass (lane BL-R7b, MORNING-DECISIONS.md:910) ran before R8 landed; R8 added the context pack (overlaps INFRA.1 one-command context), board statuses with backlog-next (overlaps CHK.8 status from evidence), per-lane worktrees from backlog-lane.mjs (overlaps INFRA.5 lane registry), G2 decisions with R8f (overlaps CHK.0). Recommendation: a record-only second pass before the six READY tasks launch, so no lane builds a duplicate; UNVERIFIED until its review round.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each of the eleven open milestone-F tasks (READY: task-2 CHK.0, task-3 CHK.1, task-4 CHK.7, task-5 CHK.8, task-8 INFRA.5, task-11 INFRA.6; waiting: task-63 CHK.2, task-67 CHK.6, task-9 INFRA.1; BUILT: task-64 CHK.3, task-66 CHK.5) is re-marked KEPT, CHANGED (narrowed scope stated in words), MERGED into the R8 task that built it, or DROPPED under :751, against the R8 deliverables (OPERATOR decisions and backlog-next, milestone Documents, lane reports in the repo, the G1 context pack, backlog-lane.mjs) with the cite, as a dated note on the task; status set only for MERGED and DROPPED
- [x] #2 The KEPT and CHANGED tasks that are READY carry a one-line Scope now: note so the launching lane builds the narrowed thing
- [x] #3 Repo review round r1 in review mode on the context file, triaged; the review question is whether any task duplicates an R8 deliverable (re-use ruling :751)
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
1. Read the eleven tasks, the rulings at MORNING-DECISIONS.md:750-751, :910-913, :979, and the R8 deliverables in ~/Buildo-wt-r8e (read only).
2. Write the per-task question table in the G1 context file; one review round in review mode; triage KEEP/REJECT in TRIAGE.md.
3. Record the eleven outcomes as dated notes through the CLI (Scope now: on READY tasks); status only for MERGED/DROPPED.
4. One docs commit with Task: task-315; close AC 1-3. No code, no test (docs only).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-19 taken on the board at lane launch (lane BL-R9, worktree /Users/brettpreston_macmini/Buildo-wt-r9, branch wf2/r9-relevancy2), RR-0240

2026-11-19 AC evidence: AC1 eleven dated notes (CLI) on task-2,3,4,5,8,11,63,67,9,64,66 with cites, status set only on task-9 (MERGED, merged-into task-309); AC2 'Scope now:' on task-2,3,4,5,8,11 (READY by backlog-next, which prints them as LATER); AC3 review r1 in review mode, 29 findings, all triaged in docs/reports/lanes/2026-11-19/BL-R9/TRIAGE.md. Docs only, no test.

2026-11-19 DONE: closing commits on origin/wf1/mb-rulings (push windows 3 and 4: 62de20da0, 7b8381cfd; station PASS); evidence per the task's final summary
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Relevancy pass 2 recorded: CHANGED task-2, task-4, task-5, task-8; KEPT task-3, task-11, task-63, task-67, task-64, task-66; MERGED task-9 into task-309; none DROPPED. One docs commit through the real hooks (sha in commit.out), no code, no test for a docs-only change. Report, triage and review in docs/reports/lanes/2026-11-19/BL-R9.
<!-- SECTION:FINAL_SUMMARY:END -->
