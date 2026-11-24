---
id: TASK-369
title: >-
  COMPLY.5 Second handbook pass: Specs 126, 127, 128 and the full Spec 135
  register rows against the surface and phone parts of the pushed 1·B change
status: BUILT
assignee:
  - '@lane-BL-COMPLY3'
created_date: '2026-11-20T13:23:00Z'
updated_date: '2026-11-24T18:41:00Z'
labels:
  - dead
milestone: m-1
dependencies: []
references:
  - docs/reports/lanes/2026-11-20/BL-COMPLY3/REPORT.md
  - docs/reports/lanes/2026-11-20/BL-COMPLY3/FINDINGS-2.md
type: build
ordinal: 69012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator 2026-11-20 (verbatim): "yes to McStorage and 1,2,3 yes as recommended". Record: ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md, entry "Operator: McStorage amendments and check into 1·B; second front-end pass". Scope now: the first pass (task-365) sent the 44 one-line McFrontend rules, the mobile specs and the engineering standards, but NOT the body of the front-end standard. Pack whole and verbatim: Spec 126 (the surface contract), Spec 127 (the conversion procedure), Spec 128 (the policy: its rules, budget rules B1 to B6 and its register of rulings), and the full Spec 135 rows with their dated notes. Run the compliance lens per pack part against the surface, content, schema, binding and mobile parts of git diff 9f04d9074..3a36e8b26. Findings untriaged, ids continuing from F-491, for the separate grounder. No product code changed. Files: .claude/review-templates/packs/fe-126-p1.md, .claude/review-templates/packs/fe-127.md, .claude/review-templates/packs/fe-128.md, .claude/review-templates/packs/fe-135.md, .claude/review-templates/README.md
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each pack is the source text whole and verbatim, split only by its own headings
- [x] #2 One lens output per pack part and diff part committed
- [x] #3 FINDINGS-2.md lists every finding untriaged with ids continuing from F-491 and a coverage table
- [x] #4 No file under src, mobile or scripts changed
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Copy BL-COMPLY pack builder idea; build packs fe-126-pN, fe-127-pN, fe-128-pN, fe-135-pN by script from source lines, split only at the source's own headings, header with source, sha at head, rule-bearing line count; verify every pack line verbatim (AC1). 2. Cut diff parts (surface, mobile, route; list exclusions); run the compliance lens per pack part and diff part in parallel with the $ and placeholder escapes; commit outputs (AC2). 3. FINDINGS-2.md untriaged, ids from F-492, coverage table, likely duplicates by id (AC3). 4. README Handbook clause packs section; one docs commit with Task: task-369; no file under src, mobile or scripts changed (AC4); doctor clean; REPORT.md; gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-20 taken on the board at lane launch (lane BL-COMPLY3, worktree /Users/brettpreston_macmini/Buildo-wt-comply3, branch wf1/inc1b-comply3), RR-0240
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Four sources packed whole and verbatim (21 parts, verify-packs.mjs: 1238+364+310+88 lines, 0 mismatches); 105 lens runs (21 pack parts x 5 production diff parts), 585 findings untriaged F-492..F-1076 in docs/reports/lanes/2026-11-20/BL-COMPLY3/FINDINGS-2.md for task-368; README Handbook clause packs updated; no file under src, mobile or scripts changed; commit sha and hook tail in the lane commit.out and the closing report.
<!-- SECTION:FINAL_SUMMARY:END -->
