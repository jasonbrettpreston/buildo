---
id: TASK-374
title: >-
  FIX.FOOTER Web report footer links use the router and meet the 44 px target
  (D7, D8)
status: RUNNING
assignee:
  - '@lane-BL-FIXFOOT'
created_date: '2026-11-20T13:33:00Z'
updated_date: '2026-11-20T15:32:00Z'
labels:
  - McFix
milestone: m-1
dependencies: []
type: build
ordinal: 74012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Source: grounder verdicts docs/reports/lanes/2026-11-20/BL-GROUND/VERDICTS-SUMMARY.md and GROUNDER.md (task-368), on the handbook pass of the pushed 1·B change. Operator 2026-11-20 (verbatim): "essential we have a non compliance build again - the entire reason for this approach". Scope now: D7 src/components/report/ReportPage.tsx:251 the footer links are plain anchors (Spec 136 fe.36 navigation is a route: web Link): render through next/link. D8 :240 the links are under 44 px (engineering standards 1.1): add min-h and padding, UNLESS the approved v8 design draws them small: check the mock first; if it does, stop on D8 and bring it as an operator draft. Files: src/components/report/ReportPage.tsx
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each defect is confirmed on the head before fixing, with file:line
- [ ] #2 Tests red first, then green through the real hooks
- [ ] #3 Compliance lens run once per governing rule list with the list whole; a separate grounder verdict on file
- [ ] #4 The shared footer builder and its three users stay in parity (the existing parity tests pass)
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
2026-11-20 taken on the board at lane launch (lane BL-FIXFOOT, worktree /Users/brettpreston_macmini/Buildo-wt-fixfoot, branch wf1/inc1b-fixfoot), RR-0240

Grounder verdict 2026-11-20 (separate read-only agent, launched by the orchestrator): FOLD AFTER the width fix; D7 fixed; D8 report link fixed in height and, after commit 205f67424, width (min-w-11); the static footer part of D8 was not a defect (Mantine Button lg, 50 px). Folded onto wf2/board. Open note for the operator: committed under McFrontend row MF-91 using that row earlier prereg and panel records (defensible, disclosed). The lane report copy describes the height-only state: superseded by this note.
<!-- SECTION:NOTES:END -->
