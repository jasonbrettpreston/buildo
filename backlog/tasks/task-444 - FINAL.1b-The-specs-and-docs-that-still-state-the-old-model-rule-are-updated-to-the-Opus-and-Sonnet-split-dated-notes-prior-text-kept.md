---
id: TASK-444
title: >-
  FINAL.1b The specs and docs that still state the old model rule are updated to
  the Opus and Sonnet split (dated notes, prior text kept)
status: LATER
assignee: []
created_date: '2026-11-22T20:57:00Z'
updated_date: '2026-11-22T20:57:00Z'
labels:
  - McFix
  - McFix Final
milestone: m-1
dependencies: []
type: build
ordinal: 144012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-22 by the orchestrator, Spec 137 rule 2, on the operator's ruling RR-0389 (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1954), verbatim: "resolve this conflict by updating the key specs and docs". WHY: RR-0385 item 1 rules that the seat that writes a plan and the seat that builds run on Opus, seats and grounders on Sonnet, reviewers DeepSeek. Task-436 adds the Spec 08 note and names the sentence "Opus only for hard design adjudication" at .cursor/MCBYLAWS-QUEUE.md:247 as superseded without editing that file. THIS TASK: every spec and doc that still states the old rule gets its own dated note (M-246, prior text kept): .cursor/MCBYLAWS-QUEUE.md:247 first; the full list is found by a read of the repo at its plan (Spec 08, the queue documents, CLAUDE.md, .claude/workflows.md, the register copy 69a if a ruling row is the right home, review template packs). After task-436 lands. Scope and Files line at its plan review. Built on Opus through the six steps.
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
Dated note 2026-11-22 (M-246, prior text kept; RR-0389 · task-444 · Backlog; operator, verbatim: "resolve this conflict by updating the key specs and docs")
<!-- SECTION:NOTES:END -->
