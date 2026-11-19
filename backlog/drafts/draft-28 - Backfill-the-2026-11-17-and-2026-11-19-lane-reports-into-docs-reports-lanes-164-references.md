---
id: DRAFT-28
title: >-
  Backfill the 2026-11-17 and 2026-11-19 lane reports into docs/reports/lanes/
  (164 references)
status: Draft
assignee: []
created_date: '2026-11-19T13:07:00Z'
labels:
  - follow-up
milestone: m-0
dependencies: []
references:
  - docs/reports/lanes/2026-11-19/BL-R7b/REPORT.md
type: record
project: McIncrement
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Review r1 of task-308 (HIGH): 164 task references name lane REPORT.md files under scratch; R8c copied the three 2026-11-19 reports only. Backfill the rest so every reference resolves from the board. Size to measure first (number of files, bytes). Operator priority (storage, timeframe).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The lane reports under ~/Buildo-scratch/lanes-20261117/ and lanes-20261119/ that task references name are copied to docs/reports/lanes/<date>/<lane>/ and the references gain the repo path (--add-ref)
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
