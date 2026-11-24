---
id: TASK-420
title: >-
  SCORE.REHEARSE Rehearse the scorecard refresh after migration 334 on the test
  stack
status: LATER
assignee: []
created_date: '2026-11-21T14:53:00Z'
updated_date: '2026-11-24T18:41:00Z'
labels:
  - dead
milestone: m-1
dependencies:
  - TASK-406
type: db-rehearsal
ordinal: 120012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-21 by the orchestrator, Spec 137 rule 2, on the operator's order (RR-0353, MORNING-DECISIONS.md:1658, verbatim: "let's resolve the scorecard the right way"; RR-0355, verbatim: "Agreed. Let's push as soon as possible! Also recolve the scorecards issue now."). Why: the push suite fails one file, src/tests/step-conformance.infra.test.ts, 29 tests of Rule 13 (the generated scorecard block is not stale). Cause: task-406 added migrations/334_precommit_budget_registry_repin.sql (0e5f82f00), so the row "min_migration=N <= migrations count=315" in each committed block prints 316 on a fresh run (scripts/analysis/step-validate.mjs:1719); the row counts files, not database rows. The repo refreshes these blocks with the tool, never by hand: `step-validate.mjs --all --fast --write` on a read-only database session (commits 156245d9c, 04de035bc, bd1f246cc). The write opens a database connection only for the data checks that run after each file is written (step-validate.mjs:6411, :6416, :5969-5974). Read-only grounding with the evidence: ~/Buildo-scratch/lanes-20261119/inc1b/scorecards406/RUN-GROUNDED.md. THIS TASK (rehearsal only, test stack only, no dev connection): (1) confirm the local test stack is up; (2) in a throwaway `git clone --shared` of the lane worktree, run the refresh against the TEST STACK with the read-only session option, record the exit code and every changed path, and show whether anything other than the count row changed; discard the clone; (3) write the operator's run script for the dev run (it asks for his typed GO, runs the one read-only command in the lane worktree, prints what changed) and RUN.md with the exact words he types; (4) report. The dev run is task-421 and is the operator's own act. Files: docs/reports/
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The refresh ran against the test stack in a throwaway clone with the read-only session option; exit code and the list of changed paths are pasted on the task
- [ ] #2 RUN.md and the operator's run script exist in the lane folder; the script refuses without his typed GO and names its target before it connects
- [ ] #3 No dev connection was made by the lane; the clone is deleted; nothing is committed to the scorecards by this task
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
Dated note 2026-11-21 (M-246, prior text kept; RR-0357 · task-420 · Backlog; operator, verbatim: "GO for scorecards")

Dated note 2026-11-21 (M-246, prior text kept; RR-0358 · task-420 · Backlog; operator, verbatim: "does the rehearsal provide a benefit here - if not move on")
<!-- SECTION:NOTES:END -->
