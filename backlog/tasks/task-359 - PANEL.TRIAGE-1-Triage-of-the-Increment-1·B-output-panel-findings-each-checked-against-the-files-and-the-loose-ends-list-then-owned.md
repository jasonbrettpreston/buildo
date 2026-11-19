---
id: TASK-359
title: >-
  PANEL.TRIAGE-1 Triage of the Increment 1·B output panel findings: each checked
  against the files and the loose-ends list, then owned
status: LATER
assignee: []
created_date: '2026-11-19T22:07:00Z'
labels: []
milestone: m-1
dependencies: []
type: record
ordinal: 59012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Scope now: record-only. The findings of the eight seats run 2026-11-19 on the unpushed 1·B work (~/Buildo-scratch/lanes-20261119/inc1b/panel1/FINDINGS.md) are unadjudicated. For each: true or false against the files; already known (task-343 Loose ends, an OPERATOR task, a ruling) or new; then owned: a fix task, an operator item, a loose-end line, or rejected with the reason. Files: backlog/
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 every finding id in FINDINGS.md has a verdict with file:line and an owner or a rejection reason
- [ ] #2 confirmed defects in built 1·B work are build tasks in m-1 with runnable acceptance criteria; design questions are OPERATOR drafts with Grounded and Recommendation lines; backlog doctor clean
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
