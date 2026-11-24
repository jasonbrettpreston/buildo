---
id: TASK-377
title: >-
  VERIFY.C Verify the four conflict recommendations C1 to C4 before the operator
  decides
status: RUNNING
assignee:
  - '@lane-BL-VERIFYC'
created_date: '2026-11-20T13:38:00Z'
updated_date: '2026-11-24T18:41:00Z'
labels:
  - dead
milestone: m-1
dependencies: []
references:
  - docs/reports/lanes/2026-11-20/BL-VERIFYC/VERIFY.md
  - docs/reports/lanes/2026-11-20/BL-VERIFYC/FINDINGS.md
  - docs/reports/lanes/2026-11-20/BL-VERIFYC/REPORT.md
type: build
ordinal: 77012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator 2026-11-20 (verbatim): "Please verify" on the orchestrator recommendations for conflicts C1 to C4 (docs/reports/lanes/2026-11-20/BL-GROUND/VERDICTS-SUMMARY.md, CONFLICT list). Record: ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md, entry "Operator: doubts the enforcement approach". Scope now: test each recommendation against the rule lists whole, the operator rulings, the code and the approved designs; the lens set, then a separate grounder. Nothing built, no spec note written. Files: docs/reports/lanes/2026-11-20/BL-VERIFYC/VERIFY.md
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each of C1 to C4: every source that bears on it quoted verbatim with file:line, including whether the operator ever approved the design page cited
- [ ] #2 Each recommendation gets the lens outputs for and against, and the alternatives it did not consider
- [ ] #3 A separate grounder verdict per recommendation: HOLDS, FAILS or NEEDS OPERATOR WORDS
- [ ] #4 No verdict by the authoring lane; nothing built
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
1. AC1: per conflict C1-C4 gather sources verbatim file:line (rule lists, register, MORNING-DECISIONS, increments docs, task texts, code); check assumed facts (operator approval of v8 page; later rulings; who wrote Spec 100:123; what phone shows; C1 field-by-field ctx list). 2. AC2: run lens set (compliance per rule list, ux, error-paths, code-review as templates exist) with rule lists whole and rulings pasted; findings by id. 3. AC3: no verdict by lane; grounder owed. 4. AC4: docs commit only, nothing built.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-20 taken on the board at lane launch (lane BL-VERIFYC, worktree /Users/brettpreston_macmini/Buildo-wt-verifyc, branch wf1/inc1b-verifyc), RR-0240

2026-11-20 lane BL-VERIFYC: evidence delivered, no verdict. VERIFY.md (C1 to C4 sources, assumed facts checked, alternatives, experience), FINDINGS.md (F-001 to F-102 by lens, untriaged), REPORT.md (four plain lines, C1 field list, UNVERIFIED). Task left RUNNING: grounder owed (AC3 not met by this lane; AC1 and AC2 evidence is in the files, to be checked by the grounder).

2026-11-20 operator ruling (M-246, prior text kept), ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1610, verbatim: "approved", to the list he pasted back; the item for this task as put to him: "Record 385, 397, 400 and 404 as dropped, and 371 and 377 as closed superseded. Recommended yes.". The decision record tool holds one record per quote and cite (decision-126, RR-0341, carries the same approval), so this note is the record on this task. No status is moved by hand.
<!-- SECTION:NOTES:END -->
