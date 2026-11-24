---
id: TASK-427
title: >-
  RULES.INDEX.1 The rules-index check and the rules sections for Spec 137 and
  Spec 08
status: DROPPED
assignee: []
created_date: '2026-11-21T22:20:00Z'
updated_date: '2026-11-24T18:41:00Z'
labels:
  - dead
milestone: m-1
dependencies:
  - TASK-423
type: build
ordinal: 127012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-21 by the orchestrator, Spec 137 rule 2, on the operator's rulings (MORNING-DECISIONS.md entry "ORDERS the rules section done right", verbatim: "We do not want to delete anything in the spec we just want to reorfganize it - create the rules section - prioritize it - either list all teh rules with a link an amednment or more details or if you can prioritize them in order of importance if necessary with a cap on the section o we can add need rules. We are not re-writing or deleting anything only reorangizing."; RR-0368 "fine 1"; RR-0370 "add the spec rules section as a later task to the board"). Why: the compliance reviewer is sent whole specs, about a tenth of which is rule text; the objective is one effective compliance review per stage. Evidence and drafts (not reviewed): ~/Buildo-scratch/lanes-20261119/inc1b/rules-sections/ASSESSMENT.md, EXAMPLE-137-rules-section.md, EXAMPLE-08-section7-rules-section.md; planner draft ~/Buildo-scratch/lanes-20261119/inc1b/proto423/PLAN-423-v3.md (cards 1 and 2). THIS TASK: (1) the check that keeps a rules section true (every link resolves; every dated note and rule label is linked from an entry; the section is within its cap; every quote is word for word), run at pre-commit by an existing line; (2) the "Rules index" sections of Spec 137 and Spec 08 (sections 5.1-5.3, 7, 11): one entry per binding rule as it stands today, quoted word for word and joined to its amendment notes by quotation and link, in priority tiers, with a cap; nothing in a spec body deleted, moved or rewritten (each spec diff is additions inside the section only); (3) the operator reads both sections before the fold; (4) the proof before the table is switched: planted breaks (a plain rule, an amended rule only the amendment catches, a Spec 08 section 7 rule, a contradiction of a ruling on the task) caught by the single compliance call given only the sections, 2 of 2 runs, with clean controls; (5) only then the table sends the sections in place of the whole documents. Its plan is reviewed before launch. Files: docs/specs/00-architecture/137_mcqueue.md, docs/specs/00-architecture/08_agents.md, scripts/analysis/rule-lists.mjs, scripts/analysis/rule-lists.json, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/rule-lists-table.logic.test.ts
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Dated note 2026-11-22 (M-246, prior text kept; RR-0372 · task-427 · Backlog; operator, verbatim: "yes let keep this simple - but it cant go on forever")

Dated note 2026-11-22 (M-246, prior text kept; RR-0373 · task-427 · Backlog; operator, verbatim: "Im not approving anything - Im asking a question")

Dated note 2026-11-22 (M-246, prior text kept; RR-0374 · task-427 · Backlog; operator, verbatim: "Apprvoe step 1 and step 2 - when it arrives")

Dated note 2026-11-22 (M-246, prior text kept; RR-0375 · task-427 · Backlog; operator, verbatim: "close it if it is verified")

Dated note 2026-11-22 (M-246, prior text kept; RR-0376 · task-427 · Backlog; operator, verbatim: "Exactly 1. Leave Spec 137 and Spec 08 as they are, and drop that part of task 427.")

Dated note 2026-11-22 (M-246, prior text kept; RR-0377 · task-427 · Backlog; operator, verbatim: "hold on - we are just planning")

Dated note 2026-11-22 (M-246, prior text kept; RR-0378 · task-427 · Backlog; operator, verbatim: "Plan approved. We are running right now on this? Add the tasks? This is the final changes to McSix step? Provide how this impacts the tasks as a plan and you can remove step 7 right now")

Dated note 2026-11-22 (M-246, prior text kept; RR-0381 · task-427 · Backlog; operator, verbatim: "approved. fix it")

Dated note 2026-11-22 (M-246, prior text kept; RR-0385 · task-427 · Backlog; operator, verbatim: "proceed. Are there any more questions - Label all realted tasks McFix Final. Ensure the previously mentioned tasks outside this plan are either updated or deleted or kept")
<!-- SECTION:NOTES:END -->
