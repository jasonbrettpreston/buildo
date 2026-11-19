---
id: TASK-309
title: >-
  R8d McLane context pack: milestone text, documents, decisions, reviews and
  dependency summaries in the G1 context file
status: RUNNING
assignee:
  - '@lane-BL-R8d'
created_date: '2026-11-19T12:52:00Z'
updated_date: '2026-11-19T13:02:00Z'
labels:
  - follow-up
milestone: m-0
dependencies: []
references:
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L931
  - scripts/analysis/backlog-brief.mjs#L20
type: build
project: McIncrement
ordinal: 19012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator 2026-11-19 (RR-0235): "We need them linked with all the relevant data - beyond just the data references". Grounded: yes - backlog-brief.mjs:20-66 writes the task, document names, decision titles and only the quotes of decisions the task names; no milestone text, no document content, no prior reviews, no dependency summaries. Recommendation: extend the context file as the acceptance criteria say, keeping the brief itself short (the file is what the lane and the review read); UNVERIFIED until the repo review round of this task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The G1 context file (docs/reports/reviews/<task>/context-<date>.md) carries the milestone description (objectives, deliverable, specs, register rulings, Documents section)
- [ ] #2 It carries the linked documents relevant sections, size-capped, with the path to read the rest
- [ ] #3 It carries every decision whose body names the task id or its plan id, with the operator quote and cite, not only the RR ids the task body names
- [ ] #4 It carries the prior review records and repo lane reports for the task and its dependencies, and the dependencies final summaries
- [ ] #5 Red tests first on fixtures (src/tests/backlog/), green, through the real hooks; repo review round r1 on the plan, triaged, before code
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
2026-11-19 taken on the board by the orchestrator at lane launch (lane BL-R8d in ~/Buildo-wt-r8d, branch wf2/r8d-context-pack)
<!-- SECTION:NOTES:END -->
