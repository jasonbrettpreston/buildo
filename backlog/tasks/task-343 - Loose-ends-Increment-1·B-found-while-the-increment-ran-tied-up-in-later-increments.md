---
id: TASK-343
title: >-
  Loose ends: Increment 1·B (found while the increment ran; tied up in later
  increments)
status: RUNNING
assignee:
  - '@lane-BL-LOOSE'
created_date: '2026-11-19T20:30:00Z'
updated_date: '2026-11-19T20:38:00Z'
labels:
  - S
  - loose-ends
milestone: m-1
dependencies: []
references:
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L1160
type: record
ordinal: 43012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator 2026-11-19, verbatim: "create a milestone task called loose ends and to tie up the loose ends with this task in later increments" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1160; RR-0302). One line per loose end: what, where it was found, and the increment or task that ties it up (blank until placed). Lanes and the record lanes add lines; a line is struck only by the commit that ties it up.

Loose ends found on 2026-11-19 (source: the lane reports under docs/reports/lanes/2026-11-19/):
1. task-62 (6.43 Push 6) was closed by hand on evidence; the other Increment 6 rows 6.8 to 6.42 still read WAITS or LATER on the board although push 6 landed: a relevancy pass of milestone m-7 by a lane (task-1 AC 7).
2. Pulling tasks 121, 122 and 123 ahead of Increment 6c (task-341, RR-0301): the size of the recut conflict was not measured; the rest of 6c is untouched.
3. SRCH.FUZZY (task-333): the matcher SQL has not run on a live database (types, speed, false candidates).
4. 1.4 parser (task-69): not checked on a live database that Queen St E and W rows end in the direction token; wider unit forms (Unit No., PH, Bsmt, Rear) are not stripped; the mobile screen for the one-lot address list was not checked.
5. SRCH.LOTCARD (task-336, task-338): no lock ties the lot fields in src/app/api/parcels/lookup/types.ts to the contract whitelist (the cause of the suite failure); scripts/surfaces/_schema/census/contracts.json is a hand-kept mirror with no lock; the footprint outline is draft-37; the data check covered one address.
6. SRCH.FOOTER (task-332): the footer and the report footer were never rendered in a browser; the landing sample report now shows the three footer links; the report schema has no G4 or G5 part (the mobile report keeps its own binding); G2 is GAP.4 (task-127).
7. SRCH.C12 (task-321): the support inbox setting is empty: the placeholder address (RR-0299) is a database job needing the operator GO; small-pages-v8 names the Help topic wrong-lot, which the Help page does not have (the links use the built topics lot_match and address_match: an orchestrator reading, for the operator); no device check.
8. SRCH.SEMI (task-319): the mock was never rendered by the lane; stage 2 (the structural restyle and the meter call after the answer, RR-0278) waits on the operator approval and four design answers.
9. SRCH.A6 (task-320, task-340): what the reports-left line shows when the user has no entitlement row.
10. The mobile jest suites are not run by the commit hook nor by the station suite: every mobile change of 1·B is unproven on jest until a test-stack run or a device check.
11. The real-tree pin tests (S-sbind count, consumer registry, target files) are not reached by a lane related run unless the test file is staged: three lanes hit this on 2026-11-19; a lane-time check is owed.
12. The G1 context pack generator defects (ENOENT document blocks, "undefined" quotes, blank Decisions section): draft-34; reported by every lane today.
13. task-268 PROOF.S: its R10 note says it depends on 317 to 322, its front matter lists only 12, 69, 267, 68.
14. CHK.6 (task-67) and its design-elements file: source and size owed (task-342, RR-0303).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every line names the task or increment that ties it up, or is struck by the commit that did
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
Dated note 2026-11-19 (M-246, prior text kept; RR-0302 · task-343 · Backlog; operator, verbatim: "create a milestone task called loose ends")

2026-11-19 (R14, task-344) loose end: the generated context pack for task-344 printed Dependencies as (none) and three Document sections as not readable ENOENT (doc-2, doc-16) while citing their lines; fix in the generator (context file docs/reports/reviews/task-344/context-2026-11-19.md).

2026-11-19 (R14, task-344) loose end: design-fit.mjs (RS-12 draft) is untested, and 63 of 117 report element design_refs cite the stale REPORT-LAYOUT-BRIEF-v4.md: tied up by task-345.

2026-11-19 taken on the board at lane launch (lane BL-LOOSE, worktree /Users/brettpreston_macmini/Buildo-wt-loose, branch wf2/inc1b-loose), RR-0240
<!-- SECTION:NOTES:END -->
