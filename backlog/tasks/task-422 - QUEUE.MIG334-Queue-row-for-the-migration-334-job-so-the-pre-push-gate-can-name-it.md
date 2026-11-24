---
id: TASK-422
title: >-
  QUEUE.MIG334 Queue row for the migration 334 job so the pre-push gate can name
  it
status: BUILT
assignee:
  - '@lane-BL-MIG334'
created_date: '2026-11-21T16:28:00Z'
updated_date: '2026-11-24T18:41:00Z'
labels:
  - dead
milestone: m-1
dependencies:
  - TASK-406
references:
  - compliance:queue-137 docs/specs/00-architecture/137_mcqueue.md
  - compliance:agents-s7-s11 docs/specs/00-architecture/08_agents.md
  - compliance:five-words docs/specs/01-pipeline/132_step_standard_handbook.md
  - compliance:plan-protocol docs/specs/00-architecture/plan-protocol.md
  - compliance:inc-S backlog/docs/increments/doc-2 - Increment-S-requirements.md
  - compliance:ms-S backlog/milestones/m-1 - increment-1·b-search-[s].md
  - docs/reports/lanes/2026-11-21/BL-MIG334/REPORT.md
  - docs/reports/lanes/2026-11-21/BL-MIG334/GROUNDER.md
  - docs/reports/lanes/2026-11-21/BL-MIG334/TRIAGE.md
type: record
ordinal: 122012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-21 by the orchestrator, Spec 137 rule 2, on the operator's GO (RR-0362). Why: the push of 0f6ba8225 was refused by the pre-push gate with "FAIL:Q:id-no-row:mig-334:migrations/334_precommit_budget_registry_repin.sql" (scripts/analysis/mcbylaws/mcbylaws-queue-check.mjs:321-323: an added migration file must be named by a line in .cursor/MCBYLAWS-QUEUE.md or .cursor/MCFRONTEND-QUEUE.md). Migration 334 was written by task-406 (BL-V2LIST round 3: re-pin of tooling_precommit_budget_registry_s; its header says written, not applied, rehearsed on the test stack first, MCINC-7; id claimed at ~/Buildo-scratch/ids/mig-334) and no queue line names it. THIS TASK (records only): add ONE queue row for the migration 334 job in the form of the existing row for migration 330 (.cursor/MCBYLAWS-QUEUE.md:1289, "Row INC6-MIG330 · Migration 330 job"), stating the truth: what the migration does, that it is written and NOT applied, that it is a DB job owed a test-stack rehearsal and the operator's typed GO, its owner task-406, with a Spec 137 rule 3 status line. No code, test, spec or migration file is edited. Also report (read-only) whether the pre-push gate's checks can be run on a commit range without pushing, and how. Files: .cursor/MCBYLAWS-QUEUE.md
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One queue row names migration 334 in the form of the migration 330 row, with a rule 3 status line; nothing else in the queue file changes
- [ ] #2 The id-ledger check of mcbylaws-queue-check.mjs, run on the push range without pushing, no longer prints id-no-row for mig-334 (output pasted), or the lane states exactly why it could not be run
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
1. Read task, 330 row (.cursor/MCBYLAWS-QUEUE.md:1289-1291), migration 334 header, the id ledger check (mcbylaws-queue-check.mjs:285-325). 2. Add ONE row INC1B-MIG334 (bullet row form of INC6-MIG330: row line, Status line, dated Record line) after the 330 row; the row names migration 334 by the lowercase words 'migration 334' and the path migrations/334_precommit_budget_registry_repin.sql so the named regex at :321 matches. 3. Commit through the hooks. 4. Run gate.mjs --ci --base origin/wf1/mb-rulings (read-only, no push, no tty) and paste output. 5. Lens reviews, FINDINGS.md, grounder owed.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-21 taken on the board at lane launch (lane BL-MIG334, worktree /Users/brettpreston_macmini/Buildo-wt-mig334, branch wf1/inc1b-mig334), RR-0240

2026-11-21 BL-MIG334: row INC1B-MIG334 added to .cursor/MCBYLAWS-QUEUE.md after the INC6-MIG330 row (3 lines: row, Status WAITS, Record citing RR-0362 decision-147 verbatim y). Placement and form: ID_QUEUES check (mcbylaws-queue-check.mjs:260-325) counts only **MB-/MF- headings (this is a bullet row, so no heading count, no next-free-id and no status-word check applies); the migration check is the named regex at :321, matched here by 'migration 334' and the path migrations/334_precommit_budget_registry_repin.sql. Written, NOT applied to any database; DB job owed a test-stack rehearsal (MCINC-7) and the operator's typed GO; owner task-406. No code, test, spec or migration file edited.

2026-11-21 BL-MIG334 gate check (read-only, no push): gate.mjs --ci --base origin/wf1/mb-rulings at 4b32de544 = GATE OK, no id-no-row for mig-334; falsifier: idLedgerErrors at HEAD~1 = FAIL:Q:id-no-row:mig-334:migrations/334_precommit_budget_registry_repin.sql, at HEAD = []. Output in docs/reports/lanes/2026-11-21/BL-MIG334/gate-check.out. Review: plan and out lens outputs filed, findings untriaged (FINDINGS.md). Grounder owed (RR-0359); task left RUNNING.

2026-11-21 BL-MIG334 grounder Cairn-Ground-O422 ruled 67 findings: 66 REJECTED, 1 CONFIRMED LOW (out-compliance-queue-137#5, next field holds more than one step; same as the 330 row), outcome wontfix per RR-0364 (decision-149); queue row not edited. Evidence: row commit 4b32de544 (hook output docs/reports/lanes/2026-11-21/BL-MIG334/commit.out), gate check docs/reports/lanes/2026-11-21/BL-MIG334/gate-check.out (gate.mjs --ci GATE OK, no id-no-row). check-lane-close --outcomes: checked 1 ids, no refusal.

2026-11-23 McFixReborn record check (RR-0437): AC1 met, .cursor/MCBYLAWS-QUEUE.md:1293-1295 (row INC1B-MIG334, commit 4b32de544). AC2 met, docs/reports/lanes/2026-11-21/BL-MIG334/gate-check.out. The earlier note 'task left RUNNING' is superseded by BUILT.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Queue row INC1B-MIG334 added to .cursor/MCBYLAWS-QUEUE.md (4b32de544); the gate's CI mode passes with no id-no-row for mig-334.

Review round 1: 0 fixed, 0 task, 0 ruling, 1 wontfix, 0 pile; grounder docs/reports/lanes/2026-11-21/BL-MIG334/GROUNDER.md; triage docs/reports/lanes/2026-11-21/BL-MIG334/TRIAGE.md
<!-- SECTION:FINAL_SUMMARY:END -->
