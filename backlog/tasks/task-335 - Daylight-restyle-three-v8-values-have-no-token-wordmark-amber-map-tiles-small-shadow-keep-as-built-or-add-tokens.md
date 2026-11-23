---
id: TASK-335
title: >-
  Daylight restyle: three v8 values have no token (wordmark amber, map tiles,
  small shadow): keep as built or add tokens?
status: DONE
assignee: []
created_date: '2026-11-19T15:46:00Z'
updated_date: '2026-11-23T16:06:00Z'
labels:
  - S
  - open-decisions
  - McFixReborn
milestone: m-1
dependencies: []
references:
  - docs/reports/lanes/2026-11-19/BL-DAYLIGHT/REPORT.md
  - ~/Buildo-scratch/mcfrontend/small-pages-v8/search.html
type: decision
project: McIncrement
ordinal: 36012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Grounded: yes - the Daylight restyle (task-322, lane BL-DAYLIGHT) used existing report-* tokens only (mobile/tailwind.config.js): v8 page #f4f1eb = report-page, ink #1d1b18 = report-ink, amber #f59e0b = report-amber, line #e9e3d8 = report-line, and so on; three v8 values have no token: (1) #b45309 for the BLD wordmark and the map outline, built as report-amber-ink #9a4a07 (a visible shift); (2) the v8 map tile palette (#ede8de, #e4ded3, #f7f4ee), built as the platform light map with a structure-only style; (3) the v8 small shadow --sh-1, omitted. Recommendation (lane, UNVERIFIED): keep as built for 1·B; adding tokens is a design-system change for the operator. Design scope (RR-0233).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Operator word through G2 on the three substitutions: keep as built, or add the three tokens (a design change, Spec 126 token set)
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
Dated note 2026-11-19 (M-246, prior text kept; RR-0282 · task-335 · Backlog; operator, verbatim: "Task 335 - y keep as built for now")
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Operator 2026-11-19 (RR-0282): keep as built for now
<!-- SECTION:FINAL_SUMMARY:END -->
