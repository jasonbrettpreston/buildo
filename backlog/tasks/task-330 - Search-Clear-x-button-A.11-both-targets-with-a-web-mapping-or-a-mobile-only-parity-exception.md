---
id: TASK-330
title: >-
  Search Clear (x) button A.11: both targets with a web mapping, or a
  mobile-only parity exception?
status: DONE
assignee: []
created_date: '2026-11-19T15:43:00Z'
updated_date: '2026-11-24T14:42:00Z'
labels:
  - S
  - open-decisions
  - McFixReborn
  - dead
milestone: m-1
dependencies: []
references:
  - docs/reports/lanes/2026-11-19/BL-GAP13/REPORT.md
  - ~/Buildo-scratch/mcfrontend/small-pages-v8/search.html#L291
type: decision
project: McIncrement
ordinal: 32012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Grounded: yes - v8 shows the Clear (x) only in the App frames (search.html:291, :304); the web frame at :313 has an empty box; the FE-07 parity lock (search-parity.golden.test.ts:25-47) requires the same refs, actions and testIDs on web and mobile; mapping.web.SEARCH is a closed set (Stack, Group, Title, Text, TextInput, Button, Alert, Loader); the app side needs no new action (set_input exists). Recommendation (lane BL-GAP13, UNVERIFIED): (a) add Mantine CloseButton to mapping.web.SEARCH and ship both targets, or (b) record a mobile-only exception in the parity lock. Design scope (RR-0233).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Operator word through G2: the Clear (x) ships on both targets with a web mapping (Mantine CloseButton added to mapping.web.SEARCH) or as a mobile-only exception recorded in the FE-07 parity lock
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
Dated note 2026-11-19 (M-246, prior text kept; RR-0281 · task-330 · Backlog; operator, verbatim: "Task-330 is not required. We dont need a clear search.")

2026-11-23 McFixReborn record check (RR-0437): AC1 not applicable: decision-82 says the Clear button is not required.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Operator 2026-11-19 (RR-0281): not required; A.11 dropped
<!-- SECTION:FINAL_SUMMARY:END -->
