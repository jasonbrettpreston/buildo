---
id: TASK-389
title: >-
  SRCH.LEGAL The legal line on the phone search page moves to the bottom (C3
  ruled b)
status: RUNNING
assignee:
  - '@lane-BL-LEGAL'
created_date: '2026-11-20T15:16:00Z'
updated_date: '2026-11-20T15:26:00Z'
labels:
  - McFix
milestone: m-1
dependencies: []
type: build
ordinal: 89012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator rulings 2026-11-20, verbatim: "1 a 2 b 3 a 4 a 5 c 6 accept" (C3 b: the legal line on the phone search page goes at the bottom as in the later mock, ~/Buildo-scratch/mcfrontend/small-pages-v8/search.html:267-269; it sits under the search box today) and "Phone retires yes and web search yes" (the web search page legal line also goes at the bottom, the same as the phone, if the web page shows that line: confirm in the plan) and "5. Do the legal-line move (389) now as a small code change". Record: ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md entries of 2026-11-20. Evidence: docs/reports/lanes/2026-11-20/BL-VERIFYC/VERIFY.md (C3). Smallest change in the existing bindings and their goldens; text unchanged (content key); on the web the shared footer builder already carries a legal line: do not show the line twice, say what the web shows before and after. Files: mobile/src/components/surfaces/SearchBinding.tsx, src/components/surfaces/web/SearchBinding.tsx
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Goldens move only for the line position, each move listed
- [ ] #2 Lens set with the rule lists whole; a separate grounder verdict launched by the orchestrator
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
Operator ruling 2026-11-20, verbatim: "Phone retires yes and web search yes" (MORNING-DECISIONS.md entry "phone retries and the web search legal line"). Scope widened by the ruling: the web search page legal line also goes at the bottom, the same as the phone, if the web page shows that line (confirm in the plan). Add to the Files line before launch: src/components/surfaces/web/SearchBinding.tsx

2026-11-20 taken on the board at lane launch (lane BL-LEGAL, worktree /Users/brettpreston_macmini/Buildo-wt-legal, branch wf1/inc1b-legal), RR-0240
<!-- SECTION:NOTES:END -->
