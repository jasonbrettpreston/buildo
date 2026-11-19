---
id: TASK-345
title: >-
  CHK.6a Fill report-design-elements.json from elements-by-inc.json and land
  RS-12 (one lane, 117 elements)
status: LATER
assignee: []
created_date: '2026-11-19T20:36:00Z'
updated_date: '2026-11-19T20:48:00Z'
labels:
  - F
  - plan:CHK.6
  - gap
milestone: m-0
dependencies:
  - TASK-62
references:
  - docs/reports/plan-import/raw/2026-11-19/elements-by-inc.json
  - scripts/surfaces/_schema/report-v2.decl.json
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L1160
priority: low
type: build
project: McIncrement
ordinal: 45012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Scope now: produce the design-elements file CHK.6 (task-67) needs, and land RS-12 with it, in one lane. Operator 2026-11-19 (RR-0303): produce it now if it is not a big job. Measured size (task-344, r1 triaged): report-side elements in elements-by-inc.json keys 1,3,4,5,6,7,8,6c = 192 rows, 117 unique ids, all with a src path:line; the declaration report-v2.decl.json has 199 fields (198 rendered) to map; 12 elements flagged nofield (supporting-function candidates). Draft shell and RS-12 function: ~/Buildo-scratch/lanes-20261117/checks/repo-drafts/scripts/surfaces/_schema/{report-design-elements.json,design-fit.mjs} (shell has 0 elements; design-fit.mjs untested; UNVERIFIED until run). Part A (not blocked): committed generator writes the 117 rows (id, name, design_ref from src, support from nofield, source_fields_text kept beside) and is rerun as regenerate-and-diff, never merged by hand (RR-0203). Part B (operator-owed, RR-0233 design is the operator's): the 74 elements whose fields text names no declaration field get their declaration paths confirmed, and the 63 design_refs that cite REPORT-LAYOUT-BRIEF-v4.md are re-pointed to the approved report (Daylight B mock) or confirmed: UNVERIFIED until the operator says. RS-12 lands in scripts/analysis/report-schema.mjs only in the same commit as a complete file so the pre-commit report-schema --check stays green (revert = git revert of that commit). Files: scripts/surfaces/_schema/report-design-elements.json, scripts/surfaces/_schema/design-fit.mjs, scripts/surfaces/_schema/gen-design-elements.mjs, scripts/analysis/report-schema.mjs, tests/report-design-fit.test.mjs. GUESS 0.5 to 1 day.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 node scripts/surfaces/_schema/gen-design-elements.mjs --check exits 0 (regenerate-and-diff)
- [ ] #2 report-design-elements.json holds 117 elements and none has a design_ref citing REPORT-LAYOUT-BRIEF-v4.md; every design_ref resolves to an existing file:line
- [ ] #3 node scripts/analysis/report-schema.mjs --check prints RS-12 PASS and exit 0 on the tip
- [ ] #4 tests/report-design-fit.test.mjs has a red case and a green case for each of D1, D2, D3, D4, D5 (red first)
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
2026-11-19 taken on the board at lane launch (lane BL-CHK6A, worktree /Users/brettpreston_macmini/Buildo-wt-chk6a, branch wf1/inc1b-chk6a), RR-0240

2026-11-19 HELD: launched by the script, not built. Operator: "That's a large build." The RR-0303 condition ("if it isnt a big job") is not met in the operator's words; waits for the operator's decision on task-342.

Dated note 2026-11-19 (M-246, prior text kept; RR-0306 · task-345 · Backlog; operator, verbatim: "I would agree")

2026-11-19 (R15, task-346): stays LATER by RR-0305 and RR-0306 (decision-91); not needed by task-68; tied up from the Loose ends task (task-343).
<!-- SECTION:NOTES:END -->
