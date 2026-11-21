---
id: TASK-423
title: >-
  PROTOCOL.SIMPLE One compliance review on the plan and one on the output,
  against rules sections; no review of paperwork
status: LATER
assignee: []
created_date: '2026-11-21T16:43:00Z'
updated_date: '2026-11-21T16:45:00Z'
labels:
  - McFix
  - McFix V2
milestone: m-1
dependencies:
  - TASK-419
type: build
ordinal: 123012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-21 by the orchestrator, Spec 137 rule 2, on the operator's order (RR-0363, verbatim: "We just need the rules for deepseek.  Teh solution maybe just creating a rules section in the spec which is small.  There shold be the plan reviews - the grounding - the fold (no other reviews) - the build - the review of the output - grounding and then the fold and then we are done.  Unless the output was revealing to have critical or high faults and a second review of the output maybe required.  That's it.  No review of paperwork. ... LEt's correct these issues and get this working right?"; RR-0361 objective, verbatim: "the objective is an effective compliance review on the plan and the output.  It isn't 17"; yesterday, MORNING-DECISIONS.md:1546, verbatim: "Just deliver the priority compliance item or the comprehensive summary that fits - files too large to review even when split. or split smaller"). Why: a 15-line task (task-419) took about five hours: nine compliance review calls on the plan and nine on the output (one call per rule document, because whole documents are sent and one call holds 120,000 characters, scripts/deepseek-review.js:35), each finding ruled singly, and every review made stale by any later commit. The six issues to correct, as he pasted them back: (1) any change after a review makes every review stale; (2) the same finding is ruled many times; (3) the process mostly reviews its own paperwork; (4) rules attach by file path alone (a generated-numbers refresh drew 58 reviews and 313 findings); (5) plan findings are ruled twice (copied into the lane folder and re-ruled by the output grounder); (6) "suite passed" did not mean "push will pass" (the push gate has checks the station suite does not run). Wanted: the tooling and the spec text brought to his shape, by the smallest change, reusing what exists. The plan (written read-only, reviewed before any build) names the design, the slices and the Files line. Files: scripts/analysis/rule-lists.mjs, scripts/analysis/rule-lists.json, scripts/hooks/check-lane-close.mjs, scripts/analysis/backlog-lane.mjs, docs/specs/00-architecture/08_agents.md, docs/specs/00-architecture/137_mcqueue.md
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
Dated note 2026-11-21 (M-246, prior text kept; RR-0364 · task-423 · Backlog; operator, verbatim: "1. yes 2. yes")
<!-- SECTION:NOTES:END -->
