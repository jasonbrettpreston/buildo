---
id: TASK-324
title: 'Web search page footer (E.2) has no task: where is it built?'
status: OPERATOR
assignee: []
created_date: '2026-11-19T14:56:00Z'
updated_date: '2026-11-19T14:58:00Z'
labels:
  - S
  - gap
  - plan:E.2
  - operator
milestone: m-1
dependencies: []
references:
  - backlog/docs/increments/doc-2 - Increment-S-requirements.md
  - ~/Buildo-scratch/lanes-20261117/search-delta/CURRENT-SEARCH.md
  - .cursor/MCFRONTEND-QUEUE.md#L310
  - .cursor/MCFRONTEND-QUEUE.md#L319
priority: low
type: decision
project: McIncrement
ordinal: 26012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Grounded: doc-2 Elements E.2 'Web footer: legal line, Terms of Service, Privacy Policy, Help and Support, copyright' is AVAILABLE per the 2026-11-17 sweep (MISSED by it) and NOT BUILT on the web search page; its plan deliverers are MF-44 and MF-46, both DONE rows (.cursor/MCFRONTEND-QUEUE.md:310 MF-44 web search pair under the (maxbld) layout; :319 MF-46 web front door with the landing footer); neither row text names the search-page footer (the landing footer F-LANDING is built, doc-2 Built state); search-delta/CURRENT-SEARCH.md E.2 'task: NO TASK', design at ~/Buildo-scratch/lanes-20261117/search-delta/src/search.txt:323 'Terms of Service'. The web search page sends no lookup while MAXBLD_WEB_LIVE is false and the web live switch stays off (RR-0170, ONE-35 b); LS.12 (task-287, m-2) flips it. Recommendation (UNVERIFIED: the E.2 deliverer attribution to MF-44 and MF-46 is the plan's reading and was not opened in the web code): treat E.2 as part of the web search page work behind the live switch, as a gap row on LS.12 (m-2), not an m-1 build task, because nothing on the web search page is user-visible until the switch flips; the operator confirms the placement (front-end, RR-0233) or asks for it in 1·B.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Operator answer recorded verbatim through scripts/analysis/backlog-decision.mjs with its cite
- [ ] #2 E.2 has a home task (m-2 LS.12 or an m-1 task) and its queue row names it
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
2026-11-19 1·B validation (R10, RR-0257, task-316): created by R10: element E.2 web footer has no task (OPERATOR), Grounded and Recommendation in the description.
<!-- SECTION:NOTES:END -->
