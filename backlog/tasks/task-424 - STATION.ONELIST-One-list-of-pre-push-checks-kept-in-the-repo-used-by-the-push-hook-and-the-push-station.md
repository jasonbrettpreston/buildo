---
id: TASK-424
title: >-
  STATION.ONELIST One list of pre-push checks kept in the repo, used by the push
  hook and the push station
status: LATER
assignee: []
created_date: '2026-11-21T22:20:00Z'
labels:
  - McFix
  - McFix V2
milestone: m-1
dependencies: []
type: build
ordinal: 124012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-21 by the orchestrator, Spec 137 rule 2, on the operator's ruling (RR-0370, verbatim: "The station: option C (one list of push checks kept in the repo, used by both the hook and the station), plus the one line today."; his rule "tools live in the repo"). Why: the push of 0f6ba8225 was refused by the pre-push gate after the station suite had passed, because the list of checks exists twice and the copies differed: .husky/pre-push:41 runs the McBylaws gate first, ~/Buildo-scratch/push-station/station.sh (suite branch) did not. THIS TASK: one list of the non-interactive pre-push checks lives in the repo (the smallest form: decided by the plan; reuse what exists); the push hook and the station both run it, so they cannot differ; the station outside the repo keeps only its plumbing (lock, pass file, tip check); the interactive parts of the gate (held patches, worktrees, the operator's y) stay in the hook. The plan measures the size and names the Files line; .husky/pre-push is a protected path. Proof: a replay of 0f6ba8225 stops at the gate step with id-no-row; 21adfde8a passes. Files: .husky/pre-push
<!-- SECTION:DESCRIPTION:END -->

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
