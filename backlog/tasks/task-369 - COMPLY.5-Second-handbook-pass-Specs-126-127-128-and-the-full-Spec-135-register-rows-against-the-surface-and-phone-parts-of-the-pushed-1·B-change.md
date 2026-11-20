---
id: TASK-369
title: >-
  COMPLY.5 Second handbook pass: Specs 126, 127, 128 and the full Spec 135
  register rows against the surface and phone parts of the pushed 1·B change
status: RUNNING
assignee:
  - '@lane-BL-COMPLY3'
created_date: '2026-11-20T13:23:00Z'
updated_date: '2026-11-20T13:25:00Z'
labels: []
milestone: m-1
dependencies: []
type: build
ordinal: 69012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator 2026-11-20 (verbatim): "yes to McStorage and 1,2,3 yes as recommended". Record: ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md, entry "Operator: McStorage amendments and check into 1·B; second front-end pass". Scope now: the first pass (task-365) sent the 44 one-line McFrontend rules, the mobile specs and the engineering standards, but NOT the body of the front-end standard. Pack whole and verbatim: Spec 126 (the surface contract), Spec 127 (the conversion procedure), Spec 128 (the policy: its rules, budget rules B1 to B6 and its register of rulings), and the full Spec 135 rows with their dated notes. Run the compliance lens per pack part against the surface, content, schema, binding and mobile parts of git diff 9f04d9074..3a36e8b26. Findings untriaged, ids continuing from F-491, for the separate grounder. No product code changed. Files: .claude/review-templates/packs/fe-126-p1.md, .claude/review-templates/packs/fe-127.md, .claude/review-templates/packs/fe-128.md, .claude/review-templates/packs/fe-135.md, .claude/review-templates/README.md
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each pack is the source text whole and verbatim, split only by its own headings
- [ ] #2 One lens output per pack part and diff part committed
- [ ] #3 FINDINGS-2.md lists every finding untriaged with ids continuing from F-491 and a coverage table
- [ ] #4 No file under src, mobile or scripts changed
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
2026-11-20 taken on the board at lane launch (lane BL-COMPLY3, worktree /Users/brettpreston_macmini/Buildo-wt-comply3, branch wf1/inc1b-comply3), RR-0240
<!-- SECTION:NOTES:END -->
