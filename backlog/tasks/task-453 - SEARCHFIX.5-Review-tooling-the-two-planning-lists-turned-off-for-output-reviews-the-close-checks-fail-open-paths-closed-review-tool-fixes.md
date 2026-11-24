---
id: TASK-453
title: >-
  SEARCHFIX.5 Review tooling: the two planning lists turned off for output
  reviews, the close check's fail-open paths closed, review-tool fixes
status: LATER
assignee: []
created_date: '2026-11-24T14:47:00Z'
updated_date: '2026-11-24T14:58:00Z'
labels:
  - SEARCHFIX-PRIORITY
milestone: m-1
dependencies: []
type: fix
ordinal: 150030
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-24 by the orchestrator, Spec 137 rule 2, on the operator's rulings: RR-0444 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290, fold the findings), RR-0447 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2308, add the new tasks with the search-fix labels, dependencies and order) and RR-0448 (the 8 merged cards). Source: the fold plan docs/reports/reviews/mcfixreborn-fold/FOLD-PLAN.md, task 10 (FIX.LISTS-OFF), 11 (FIX.CLOSE-CHECK) and 12 (FIX.REVIEW-TOOLS), merged because 10 and 11 write the same protected files; every finding was ruled by a separate grounder (RR-0387, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1943; records under docs/reports/reviews/mcfixreborn-g1 to -g4). The plan's section 2 lines are this card's acceptance tests, each red first. Nothing is added that the plan or a ruling does not name (RR-0392, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975).

What changes, in plain words: (1) the two planning lists (five-words, plan-protocol) are switched off for output reviews by one data line; plan reviews keep them (RR-0440, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2265; RR-0444, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290; plan section 6: about 15 lines of code and 40 of tests). (2) The close check no longer passes a task with no review when the branch has no rule table or during a merge; seat findings need evidence; the helper file backlog-lib.mjs joins the protected list. (3) Review tools: the proof row for CHK.3 reads not built, the ticket text says two commits, the next round number is the highest plus one, an empty acceptance block warns, README corrected.

Order inside the card: the lists switch first, then the close check, then the review tools.

Orchestrator reading, to be grounded at the plan stage: the lists go off for output reviews only (the plan's recommendation); off for plan reviews too would remove a lock made to fail closed.

Findings folded: G4 S1, S2, S3, S4, S5, S9, T1, T2, T3, T4 (git stack part), T6, T7, T8, T9, T10, T11, T12; ST4, ST5.

PROTECTED FILES this card names (RR-0419, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2150): scripts/analysis/rule-lists.json, scripts/analysis/rule-lists.mjs, scripts/hooks/check-lane-close.mjs.

Dated notes owed: Spec 08 section 7 rule 4 (short; RR-0429 cap); task-448; task-268 (the proof row).

Files: scripts/analysis/rule-lists.json, scripts/analysis/rule-lists.mjs, scripts/hooks/check-lane-close.mjs, scripts/analysis/backlog-lane.mjs, scripts/analysis/backlog-brief.mjs, scripts/lib/review-template.js, scripts/analysis/proof-slice.mjs, scripts/analysis/proof-slices.json, .claude/review-templates/README.md, src/tests/backlog/check-lane-close.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/rule-lists-table.logic.test.ts, src/tests/backlog/backlog-brief.logic.test.ts, src/tests/backlog/review-templates.logic.test.ts, docs/reports/generated/rule-lists-by-kind.md, docs/specs/00-architecture/08_agents.md, migrations/334_precommit_budget_registry_repin.sql
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A build task closes without output reviews for the two planning lists; a fix task with no plan-stage output for them is refused
- [ ] #2 Emptying the output_off line turns the lists back on
- [ ] #3 A branch with no rule table still reads the board; during a merge only merge-only staging is skipped
- [ ] #4 A seat finding needs a quote, a cited line and a reason
- [ ] #5 A lane closing after an edit to backlog-lib.mjs is refused unless its card names the file
- [ ] #6 The CHK.3 proof row reads notbuilt with its reason; the next round number is the highest plus one
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
2026-11-24: scope added by the operator's ruling RR-0450 (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2325, verbatim: "I just dont see how queue rules and orchestrator notes are valuable to anything from a code persepctive."): (a) the queue-137 and orchestrator-doc17 lists come off the lane-tools row of scripts/analysis/rule-lists.json; (b) the step handbook list stays on the compute rows only (orchestrator reading: already so, the plan confirms); (c) the five-principles list is replaced by three focused questions asked at the plan stage: is this the simplest design; are we adding infrastructure and complexity for small gains; is the scope limited (RR-0449, /Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2320). Switches and text changes only. Also on the Files line by this note: docs/specs/00-architecture/plan-protocol.md.
<!-- SECTION:NOTES:END -->
