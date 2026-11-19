---
id: TASK-358
title: >-
  REVIEW.LENSES The repo review runs the Spec 08 DeepSeek lens set (compliance,
  code review, user experience, error paths, security), not one generic round
status: RUNNING
assignee:
  - '@lane-BL-LENSES'
created_date: '2026-11-19T22:07:00Z'
updated_date: '2026-11-19T22:16:00Z'
labels: []
milestone: m-1
dependencies: []
type: build
ordinal: 58012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Scope now: add the missing narrow DeepSeek lens templates to .claude/review-templates/ and make the lane launch brief name the lens set for plan and output review, so every lane runs the lenses in parallel and one Claude grounder adjudicates (Spec 08 08_agents.md section 7 rules 4, 7, 9; front-end panel :292). Cause: the scratch panel was retired 2026-11-18 and the repo tool has one template, so the lens set disappeared; operator, verbatim, 2026-11-19 (MORNING-DECISIONS.md, 'the review protocol'): 'Deepseek is respoonsible for many of these seats - too many tokens to run all claude ones'. No new runner code unless a template cannot be passed by the existing --context flag. Files: .claude/review-templates/, scripts/analysis/backlog-lane.mjs, scripts/deepseek-review.js, src/tests/
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 five lens templates exist, each one narrow question with the strict output format of the existing template, and a README table mapping lens to Spec 08 seat
- [ ] #2 the lane brief written by backlog-lane.mjs names the lens set for plan and for output review and the round-2 adjudication; a test pins it
- [ ] #3 one real run of each lens on a small real diff returns findings in the format (outputs pasted)
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
2026-11-19 taken on the board at lane launch (lane BL-LENSES, worktree /Users/brettpreston_macmini/Buildo-wt-lenses, branch wf1/inc1b-lenses), RR-0240
<!-- SECTION:NOTES:END -->
