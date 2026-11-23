---
id: TASK-421
title: >-
  SCORE.GO Operator types GO on dev: scorecard refresh (read-only) and the
  generated-files commit
status: BUILT
assignee:
  - '@lane-BL-SCORE421'
created_date: '2026-11-21T14:53:00Z'
updated_date: '2026-11-23T16:06:00Z'
labels:
  - McFix
  - McFixReborn
milestone: m-1
dependencies:
  - TASK-420
references:
  - >-
    compliance:policy-124-s2-s5
    docs/specs/01-pipeline/124_step_standard_policy.md
  - compliance:agents-s5-1to3 docs/specs/00-architecture/08_agents.md
  - compliance:agents-s7-s11 docs/specs/00-architecture/08_agents.md
  - compliance:queue-137 docs/specs/00-architecture/137_mcqueue.md
  - compliance:eng-all docs/specs/00_engineering_standards.md
  - >-
    compliance:orchestrator-doc17 backlog/docs/doc-17 -
    Orchestrator-readings-not-rulings.md
  - >-
    compliance:surface-127
    docs/specs/02-web-admin/127_surface_conversion_procedure.md
  - >-
    compliance:surface-128
    docs/specs/02-web-admin/128_surface_standard_policy.md
  - >-
    compliance:surface-126
    docs/specs/02-web-admin/126_maxbld_surface_standard.md
  - compliance:five-words docs/specs/01-pipeline/132_step_standard_handbook.md
  - compliance:plan-protocol docs/specs/00-architecture/plan-protocol.md
  - compliance:inc-S backlog/docs/increments/doc-2 - Increment-S-requirements.md
  - compliance:ms-S backlog/milestones/m-1 - increment-1·b-search-[s].md
  - docs/reports/lanes/2026-11-21/BL-SCORE421/REPORT.md
  - docs/reports/lanes/2026-11-21/BL-SCORE421/GROUNDER.md
  - docs/reports/lanes/2026-11-21/BL-SCORE421/TRIAGE.md
type: db-go
ordinal: 121012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-21 by the orchestrator, Spec 137 rule 2 (RR-0353, RR-0355). After task-420 (the rehearsal) passes: the operator types GO in his own Terminal and the run script of task-420 makes ONE read-only run on dev of `step-validate.mjs --all --fast --write` in the lane worktree; then a lane checks that only generated files changed (the assessment reports under docs/reports/, the count row 315 to 316), commits them through the real hooks as one generated-files commit in the form of bd1f246cc, and the commit is folded; the station suite then runs on that commit. Must be re-run if another migration file lands before the push. Files: docs/reports/
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The operator's typed GO is recorded verbatim on the task
- [x] #2 One commit of generated files only, through the hooks; step-conformance Rule 13 passes on it
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
Dated note 2026-11-21 (M-246, prior text kept; RR-0357 · task-421 · Backlog; operator, verbatim: "GO for scorecards")

Dated note 2026-11-21 (M-246, prior text kept; RR-0358 · task-421 · Backlog; operator, verbatim: "does the rehearsal provide a benefit here - if not move on")

2026-11-21 taken on the board at lane launch (lane BL-SCORE421, worktree /Users/brettpreston_macmini/Buildo-wt-score421, branch wf1/inc1b-score421), RR-0240

Dated note 2026-11-21 (M-246, prior text kept; RR-0357 · task-421 · Backlog; operator, verbatim: "GO for scorecards"). The operator ran go-scorecards.zsh in his own Terminal on 2026-11-21 and typed GO (exactly) at the script's prompt. Run: PGOPTIONS='-c default_transaction_read_only=on' ... step-validate.mjs --all --fast --write on dev, exit code 0; changed paths (tracked) 49; not-assessment paths: none; added lines with 'migrations count=316': 42; untracked: none. Classification of every changed line (95 added, 95 removed): (1) 42 count rows 315 to 316; (2) 49 '(registry)' PRECOMMIT-BUDGET (R-EC) rows, new timings and the 33.2 s pin of migration 334 (the 7 files with no count row carry only this row; the three earlier refreshes show no such row change, the repin is new); (3) 6 lines in the 2026-11-02 batch7-p1-1 assessment report: Score 14/17 to 17/17, G8 0/3 to 3/3 (stage-gated to net-new R-DK), compare ran false to true, a stray double colon removed (improved, none worse). Nothing hand-edited.

2026-11-21 lane BL-SCORE421: generated-files commit 2fd17001d landed through the hooks (hook output in the lane report dir is commit.out in the lane folder); review lenses run (plan and out compliance per rule list, plan-review-deepseek); FINDINGS.md filed in docs/reports/lanes/2026-11-21/BL-SCORE421/; grounder owed (the orchestrator launches a grounder that is not this lane); task left RUNNING.

Dated note 2026-11-21 (M-246, prior text kept; RR-0359 · task-421 · Backlog; operator, verbatim: "That's ridiculous to fold before the grounder review - the focus is on getting it right")

2026-11-21 Rule 13 evidence for AC #2 (lane BL-SCORE421, read from the files, no suite run by the lane): the push station ran the full suite on the folded commit 849770c4c (run folder ~/Buildo-scratch/push-station/runs/849770c4c-20261121-102628; pass file ~/Buildo-scratch/push-station/pass/849770c4c204f463a25aa4df889cbc958e29c502.pass). suite.log line 1500: ' ✓ src/tests/step-conformance.infra.test.ts (735 tests) 197953ms'; suite.json: that file status passed, 735 assertions, 0 failed, numFailedTests 0, success true. Spec 124 Rule 13 test src/tests/step-conformance.infra.test.ts:2435-2455. Grounder Cairn-Ground-O421 ruled 313 findings (GROUNDER.md in the lane report dir): 21 CONFIRMED all LOW; the fold before the grounder ruled is decision-144 (RR-0359).

2026-11-21 status corrected DONE to BUILT on the grounder's fix check (137_mcqueue.md:77-78): built and committed locally, not pushed; the closing commit 6e1daf1ae said 'landed' in error.
<!-- SECTION:NOTES:END -->
