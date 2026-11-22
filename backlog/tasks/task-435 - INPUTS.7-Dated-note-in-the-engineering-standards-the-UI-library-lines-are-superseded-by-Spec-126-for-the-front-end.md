---
id: TASK-435
title: >-
  INPUTS.7 Dated note in the engineering standards: the UI library lines are
  superseded by Spec 126 for the front end
status: LATER
assignee: []
created_date: '2026-11-22T18:01:00Z'
updated_date: '2026-11-22T18:01:00Z'
labels:
  - McFix
  - McFix V2
milestone: m-1
dependencies: []
type: build
ordinal: 135012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-22 by the orchestrator, Spec 137 rule 2, on the operator's ruling RR-0382 (MORNING-DECISIONS.md:1889, verbatim: "yes add"; earlier the same day: "I think teh spec 126 is more recent and is just an update of the engineering standards"). Why: docs/specs/00_engineering_standards.md (lines of 2026-06-16) names Shadcn UI, React Hook Form and Sonner; Spec 126 (dated note 2026-11-09, operator "D-0-D-4 approved", 126_maxbld_surface_standard.md:467) says "Shadcn/Tailwind above is superseded ... the web and admin archetype set is Mantine" with @rjsf/mantine and mantine-datatable (section 11b.4); a reviewer sent the engineering standards reads the old standard. THIS TASK: one dated note in the engineering standards beside the library lines (prior text kept, nothing deleted), saying they are superseded for front-end work by Spec 126 section 11b.4, citing the Spec 126 note; the note states as a fact, and rules nothing on it, that Spec 126 does not name a toast library and Sonner is installed and in use. No other edit. Files: docs/specs/00_engineering_standards.md
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
Dated note 2026-11-22 (M-246, prior text kept; RR-0382 · task-435 · Backlog; operator, verbatim: "yes add")
<!-- SECTION:NOTES:END -->
