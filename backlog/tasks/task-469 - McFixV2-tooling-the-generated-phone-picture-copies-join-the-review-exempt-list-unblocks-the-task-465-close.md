---
id: TASK-469
title: >-
  McFixV2 tooling: the generated phone picture copies join the review exempt
  list (unblocks the task-465 close)
status: WAITS
assignee: []
created_date: '2026-11-25T20:33:00Z'
updated_date: '2026-11-25T20:33:00Z'
labels:
  - McFixV2
milestone: m-1
dependencies: []
type: fix
ordinal: 163210
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Opened by the operator's ruling RR-0502 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2613, verbatim '465 a'). The output review of task-465 cannot start: rule-lists.mjs lens-input refuses mobile/__tests__/fixtures/surfaces/mobile_parcel_search.goldens.json ('is 264565 characters of diff and cannot be split inside a file: at most 97828 fit one input', scripts/analysis/rule-lists.mjs:434, bound :29), and the close check requires every changed path outside the exempt list to be in the review chunks (scripts/hooks/check-lane-close.mjs:842). That file is the generated phone copy of the search page pictures, written by scripts/surfaces/emit-mobile-surfaces.mjs from src/tests/fixtures/surfaces/*/*.mobile.json, which are already exempt (scripts/analysis/rule-lists.json exempt list; precedent task-406: each exempt glob names the check that proves it). Change: add the phone generated picture copies (mobile/__tests__/fixtures/surfaces/*.goldens.json) to the exempt list, naming the existing check that proves a copy equals its sources. The exempt key is read from the board ref (check-lane-close.mjs:729, :787), so the change must land on the board before task-465 closes. Blocks: task-465 close; tasks 267 and 317 would meet the same refusal. Not planned yet: no plan, no Files line.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The exempt list holds the phone generated picture copies, with the check that proves them named as the table requires
- [ ] #2 A test shows a diff of only such a file resolves as exempt, and that the proving check goes red on a copy that does not match its sources
- [ ] #3 task-465's output review input builds without the size refusal
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
