---
id: TASK-462
title: PROC.PHONEGATE Phone typecheck and phone tests join the push gate list
status: LATER
assignee: []
created_date: '2026-11-24T18:43:00Z'
labels:
  - ProcessImprovement
milestone: m-1
dependencies: []
type: fix
ordinal: 156210
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-24 by the orchestrator from RR-0462 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2392; operator, verbatim: "Let's just move forward with the basic quick plan. Approved.") and RR-0460 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2382, phone tests run locally before a push). Step 4, 4a and 4b of the approved plan. Source: the read-only grounder check Cairn-Ground-PHONECHK, ~/Buildo-scratch/lanes-20261124/phonechecks/GROUNDER-PHONECHK.txt (proposal A, with its changes), and the explorer report beside it.

What changes: two plain step lines join the one pre-push list (.husky/pre-push-checks.sh), after the typecheck step and before the web suite: the phone typecheck, and the phone unit tests run with a command that writes nothing (no coverage folder: the station refuses a worktree that changed during the run). The test that pins the list (src/tests/hooks-composition.infra.test.ts, LIST_LINES and STEP_NAMES) is updated in the same commit. One dated line in CLAUDE.md (the pre-push line) and one in the phone testing spec section 5 name the new steps. Off means removing the two lines (orchestrator's reading of the plan text, not the operator's words); no switch file, no environment setting.

Facts at opening: steps 2 and 3 of the plan are done (the shared phone packages folder now holds every declared package at its declared version; a full phone run from a linked lane worktree with task-461's fix gave 58 of 58 suites and 866 of 866 tests in about 9 seconds, ~/Buildo-scratch/lanes-20261124/phone-linked-sfx6-18c760bb5.out; the phone typecheck exits 0). Lands after task-461 is folded. This replaces 'no station change' of 2026-11-19 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1212) for the gate list (RR-0462). No station.sh edit (it is outside the repo).

Files: .husky/pre-push-checks.sh, src/tests/hooks-composition.infra.test.ts, CLAUDE.md, docs/specs/03-mobile/98_mobile_testing_protocol.md
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A push station run shows the two new steps and then PASS, and the worktree is clean afterwards (no coverage folder)
- [ ] #2 The gate-list test names the two new lines and step names and passes; it fails on the old six-step list
- [ ] #3 A phone test made to fail stops the run before the web suite starts
- [ ] #4 CLAUDE.md and the phone testing spec section 5 each carry one dated line naming the new steps
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
