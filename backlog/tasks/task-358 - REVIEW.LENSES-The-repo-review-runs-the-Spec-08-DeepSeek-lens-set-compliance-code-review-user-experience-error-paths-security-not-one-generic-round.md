---
id: TASK-358
title: >-
  REVIEW.LENSES The repo review runs the Spec 08 DeepSeek lens set (compliance,
  code review, user experience, error paths, security), not one generic round
status: BUILT
assignee:
  - '@lane-BL-LENSES'
created_date: '2026-11-19T22:07:00Z'
updated_date: '2026-11-24T14:42:00Z'
labels:
  - McFixReborn
  - dead
milestone: m-1
dependencies: []
references:
  - docs/reports/lanes/2026-11-19/BL-LENSES/REPORT.md
  - .claude/review-templates/README.md
type: build
ordinal: 58012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Scope now: add the missing narrow DeepSeek lens templates to .claude/review-templates/ and make the lane launch brief name the lens set for plan and output review, so every lane runs the lenses in parallel and one Claude grounder adjudicates (Spec 08 08_agents.md section 7 rules 4, 7, 9; front-end panel :292). Cause: the scratch panel was retired 2026-11-18 and the repo tool has one template, so the lens set disappeared; operator, verbatim, 2026-11-19 (MORNING-DECISIONS.md, 'the review protocol'): 'Deepseek is respoonsible for many of these seats - too many tokens to run all claude ones'. No new runner code unless a template cannot be passed by the existing --context flag. Files: .claude/review-templates/, scripts/analysis/backlog-lane.mjs, scripts/deepseek-review.js, src/tests/
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 five lens templates exist, each one narrow question with the strict output format of the existing template, and a README table mapping lens to Spec 08 seat
- [x] #2 the lane brief written by backlog-lane.mjs names the lens set for plan and for output review and the round-2 adjudication; a test pins it
- [x] #3 one real run of each lens on a small real diff returns findings in the format (outputs pasted)
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
1. Review the lane plan (one generic round: the lens set does not exist yet), triage, fold KEPT.
2. AC1: write lens-compliance, lens-code-review, lens-ux, lens-error-paths, lens-security in .claude/review-templates/ in the form and strict output format of plan-review-deepseek.md; README gains the lens to Spec 08 seat table and the standard (parallel DeepSeek lenses, one Claude grounder round 2, verified-by wording rule).
3. AC2: red test first in src/tests/backlog/backlog-lane.logic.test.ts pinning the lens-set review line; then change only the review line (extra) in scripts/analysis/backlog-lane.mjs to name the plan-review and output-review lens sets by task type, parallel, r1-<lens>.txt, round-2 triage. No runner code unless a flag is missing (check deepseek-review.js review --context).
4. AC3: run each lens once for real on git show 9fea46277 -- mobile/app with the approved mock text and RR-0308/RR-0309 lines; paste outputs under lens-run/; list findings in the report, not triaged into tasks.
5. Commit with Task: task-358, copy REPORT/TRIAGE/review output to docs/reports/lanes/2026-11-19/BL-LENSES/, add-ref, check ACs, close BUILT.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-19 taken on the board at lane launch (lane BL-LENSES, worktree /Users/brettpreston_macmini/Buildo-wt-lenses, branch wf1/inc1b-lenses), RR-0240
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Five lens templates and README table (.claude/review-templates/); lane brief names the lens set by task type (backlog-lane.mjs lensLine, 4 pinned cases); review --template runner flag added (the --context form returned 0 strict lines in 5 runs); 5 real lens runs on 9fea46277 pasted under docs/reports/lanes/2026-11-19/BL-LENSES/lens-run/, all in strict format, 64 s and 76,711 tokens per set. Red proven in red.out; commit sha in the landing commit.
<!-- SECTION:FINAL_SUMMARY:END -->
