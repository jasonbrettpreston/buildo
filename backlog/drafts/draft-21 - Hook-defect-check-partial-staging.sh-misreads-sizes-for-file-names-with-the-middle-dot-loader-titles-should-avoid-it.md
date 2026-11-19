---
id: DRAFT-21
title: >-
  Hook defect: check-partial-staging.sh misreads sizes for file names with the
  middle dot; loader titles should avoid it
status: Draft
assignee: []
created_date: '2026-11-19T05:28:00Z'
labels:
  - follow-up
milestone: m-0
dependencies: []
references:
  - ~/Buildo-scratch/lanes-20261119/boardmove-v2/build-r3b/REPORT.md
  - scripts/hooks/check-partial-staging.sh
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
build-r3b found that check-partial-staging.sh misreads sizes for names with the middle dot, worked around with git -c core.quotepath=false. The loaded decision files carry the middle dot in their names (backlog/decisions/decision-1). Fix the script to read names with core.quotepath=false (or -z), with a red test, or rename the files.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A red test reproduces the misread size for a staged file name with the middle dot
- [ ] #2 scripts/hooks/check-partial-staging.sh reads names safely and the test is green
- [ ] #3 No workaround flag is needed for a commit that stages the Backlog decision files
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
