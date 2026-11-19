---
id: DRAFT-33
title: >-
  TRK.1 Tracked lots refreshed in the background when the stamp moves (RR-0145 /
  TRK-1 a): no owning task
status: Draft
assignee: []
created_date: '2026-11-19T14:57:00Z'
labels:
  - gap
  - plan:TRK.1
milestone: m-13
dependencies: []
references:
  - backlog/decisions/decision-21 - RR-0145-Answer-TRK-1-tracked-lots-refresh.md
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L738
priority: low
type: build
project: McIncrement
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Grounded: RR-0145 'Tracked lots are refreshed in the background when the stamp moves (operator answer TRK-1 a)' (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738 "TRK-1 a (background refresh of tracked lots when the stamp moves)"; backlog/decisions/decision-21). Searches that found no owning task: grep -i -E 'background|stamp moves|TRK-1' over backlog/tasks/*.md (no hit); grep 'purge|90 days' finds task-291 ST.P4 (m-13), the owner of RR-0144 only. task-269 LS.4 shows a stale tracked row as 'updating' (ST.P3) but does not refresh it. Found by lane BL-R10 (task-316, AC4: a ruling listed under the m-1 register rulings with no task). Recommendation (UNVERIFIED: not covered by the r1 review, owner increment not confirmed): one build task in the launch group next to LS.4 and ST.P4, a job that recomputes tracked lots when the Layer 2 stamp moves, through the producer ST.P1; the orchestrator confirms the owning increment.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Owner increment confirmed and the task given dependencies on ST.P1 (task-265) and LS.4 (task-269)
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
