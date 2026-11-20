---
id: TASK-407
title: >-
  V2.LAYOUT The brief states where review files go and the close check reads
  that place
status: LATER
assignee: []
created_date: '2026-11-20T17:12:00Z'
updated_date: '2026-11-20T17:22:00Z'
labels:
  - McFix
  - McFix V2
milestone: m-1
dependencies: []
type: build
ordinal: 107012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator, 2026-11-20, verbatim: "That works. Let;s this - the 10th plan today on the same thing.  Let's review the McFix tasks realted to compliance and either substitue. This is the McFixV2 Plan. Hwo will I know it is actually working on a daily basis and no one has swtiched it off.  I still think you need to create the definitive complianc list McFront-end and all the tasks in the Increments.  Add to the board - review all teh currentMCfix tasks and ensure they are still relevant" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md, entry "Operator APPROVES McFix V2"). McFix V2 step 2. Found 2026-11-20: the close check reads lens outputs only at one folder depth (docs/reports/lanes/<date>/<lane>/plan-*.txt and out-*.txt with their in- files); lanes BL-PAGETABLE and BL-GATES filed theirs in subfolders (lens-plan/, lens-out/, stage2/), BL-FIXSPECS shows none at that depth, so the check sees no review at all; fix-round outputs named fix-*.txt are never read. Nothing told the lanes. Scope: one sentence in the brief text the launch script writes (the exact folder, the plan-/out-/in- names, a fix round filed as out-<lens>-r2 or the form the check can read: decide the smallest), and a planted-defect test that a lane directory with outputs in a subfolder is refused with a message that names the layout. No change to what the check requires. Acceptance: the brief of the next launched lane carries the sentence (open BRIEF.md and paste it); the test. Files: scripts/analysis/backlog-lane.mjs, scripts/hooks/check-lane-close.mjs, src/tests/backlog/check-lane-close.logic.test.ts
<!-- SECTION:DESCRIPTION:END -->

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
PRIORITY, operator 2026-11-20 verbatim: "I also need certainty within the tasks that a rpiority is getting the right information about compliance to the reviewer.  Put extra stree" (MORNING-DECISIONS.md, entry "Operator APPROVES the McFix V2 launch"). The brief sentence also says: the compliance lens reviews the whole change; a diff over the bound is split, never trimmed.
<!-- SECTION:NOTES:END -->
