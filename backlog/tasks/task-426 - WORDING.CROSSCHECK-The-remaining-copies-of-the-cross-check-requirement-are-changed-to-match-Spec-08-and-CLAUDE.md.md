---
id: TASK-426
title: >-
  WORDING.CROSSCHECK The remaining copies of the cross-check requirement are
  changed to match Spec 08 and CLAUDE.md
status: LATER
assignee: []
created_date: '2026-11-21T22:20:00Z'
updated_date: '2026-11-24T18:41:00Z'
labels:
  - dead
milestone: m-1
dependencies:
  - TASK-419
type: build
ordinal: 126012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-21 by the orchestrator, Spec 137 rule 2, on the operator's ruling (MORNING-DECISIONS.md entry "RULES: change the other copies of the cross-check wording", verbatim: "Yes change the working - obviously."; RR-0351 "Gap 3 we dont need the cross check"; RR-0360 CLAUDE.md). Why: task-419 changed the Spec 08 section 11.2 note and CLAUDE.md; the task-419 output grounder (GROUNDER.md, round 2, MED eng-all-r2#2, ms-S-r2#2, LOW orchestrator-doc17-r2#3) found the requirement still written in .claude/workflows.md (:57, :106, :146), .claude/review-templates/packs/spec08.md (:35, :46) and Spec 119 (location UNVERIFIED by the grounder: find it by reading). THIS TASK: change those copies to the wording task-419 landed (the cross-read adversary pass is not required; the agent stays available on request), with dated notes where the file keeps dated notes, prior text kept. No code. Files: .claude/workflows.md, .claude/review-templates/packs/spec08.md
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
2026-11-21 (M-246) This card takes over these findings of the task-419 output review, deferred here by the task-419 grounder (Cairn-Ground-O419, GROUNDER round 3) on the operator's ruling that the other copies are changed: out-compliance-eng-all-r1#2, out-compliance-orchestrator-doc17-r1#2, out-compliance-plan-protocol-r1#3, out-compliance-eng-all-r2#2, out-compliance-ms-S-r2#2, out-compliance-orchestrator-doc17-r2#3. Spec 119: the grounder could not locate the copy; this task finds it by reading and adds its path to the Files line at its plan.
<!-- SECTION:NOTES:END -->
