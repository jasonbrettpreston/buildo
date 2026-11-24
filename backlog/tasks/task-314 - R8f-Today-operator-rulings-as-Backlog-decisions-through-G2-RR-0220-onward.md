---
id: TASK-314
title: R8f Today operator rulings as Backlog decisions through G2 (RR-0220 onward)
status: DONE
assignee:
  - '@lane-BL-R8F'
created_date: '2026-11-19T13:07:00Z'
updated_date: '2026-11-24T18:41:00Z'
labels:
  - dead
milestone: m-0
dependencies: []
references:
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L885
  - scripts/analysis/backlog-decision.mjs#L1
  - docs/reports/lanes/2026-11-19/BL-R8F/REPORT.md
type: record
project: McIncrement
ordinal: 21012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Review r1 of task-308 (build-r8/r8c/r1-review.txt, HIGH): the Decisions in force block of every G1 context file ends at RR-0219 because the loader wrote the decisions once on 2026-11-19 04:57 and the rulings made since (RR-0220 onward, MORNING-DECISIONS.md:885 onward) were registered in scratch only. Grounded: yes - backlog/decisions has 70 files, decision-69 and decision-70 are the only ones written since the load; the register has 242 rows. Recommendation: enter each ruling row through G2 as its own decision (no loader re-run; G2 refuses non-verbatim quotes), one docs commit; UNVERIFIED until the review round of this task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every operator ruling registered today (rulings-register.json rows RR-0220 to RR-0242 and any later row of 2026-11-19 with kind ruling) exists as a Backlog decision written through scripts/analysis/backlog-decision.mjs (G2) with the verbatim quote and the cite; register rows of kind entry are not decisions
- [x] #2 Each new decision names the task ids or plan ids it bears on (the R8 tasks, task-1, the held items), so the context pack (task-309) picks it up
- [x] #3 Repo review round r1 in review mode on the context file, triaged, before the edits
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
Plan (lane BL-R8F): 1 Read the 10 ruling rows RR-0220 onward (none has a decision file: grep RR-02 in backlog/decisions returns none). 2 Five rows have source operator (RR-0232, 0233, 0235, 0242, 0248): write each through G2 with the register quote at its cite, naming tasks per the map. 3 Five rows have source reading, orchestrator words, not the operator's (RR-0223, 0225, 0227, 0238, 0240): G2 would write "Operator, verbatim" and source: operator, which is false (Spec 137 rule 4, RR-0190), so they are not written and the reason is stated. 4 One note on task-2. 5 One docs commit with Task: task-314; reports in a last commit; close.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-19 taken on the board at lane launch (lane BL-R8F, worktree /Users/brettpreston_macmini/Buildo-wt-r8f, branch wf2/r8f-decisions), RR-0240

Dated note 2026-11-19 (M-246, prior text kept; RR-0248 · task-314 · Backlog; operator, verbatim: "y - this is a major improvement")

Plan step 1-4 executed: decisions.out in lane dir shows G2 exit 0 for decision-71..75; register-table.txt shows 10 kind ruling rows, 5 source operator written, 5 source reading not written (orchestrator words, RR-0190).

AC evidence: 5 decisions written (decision-71..75), G2 exit 0 each (decisions.out), tasks named per decision body; review r1 triaged (TRIAGE.md) before the edits; 5 source-reading rows not written, reason in REPORT.md. Commit e80f97485.

2026-11-19 DONE: closing commits on origin/wf1/mb-rulings (push windows 3 and 4: 62de20da0, 7b8381cfd; station PASS); evidence per the task's final summary
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Five operator rulings (RR-0232, 0233, 0235, 0242, 0248) are Backlog decisions 71 to 75 through G2; five source-reading rows held back as non-operator words; task-2 note added.
<!-- SECTION:FINAL_SUMMARY:END -->
