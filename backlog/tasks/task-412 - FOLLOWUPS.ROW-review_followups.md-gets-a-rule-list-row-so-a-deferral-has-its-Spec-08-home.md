---
id: TASK-412
title: >-
  FOLLOWUPS.ROW review_followups.md gets a rule-list row so a deferral has its
  Spec 08 home
status: BUILT
assignee:
  - '@lane-BL-F412'
created_date: '2026-11-20T23:40:00Z'
updated_date: '2026-11-24T18:41:00Z'
labels:
  - dead
milestone: m-1
dependencies:
  - TASK-375
references:
  - docs/reports/reviews/task-412/GROUNDER-PLAN.md
  - docs/reports/reviews/task-412/TRIAGE-PLAN.md
  - docs/reports/reviews/task-412/seat-integration-1.md
  - docs/reports/reviews/task-412/seat-reality-check-1.md
  - docs/reports/reviews/task-412/seat-regression-1.md
  - compliance:agents-s5-1to3 docs/specs/00-architecture/08_agents.md
  - compliance:agents-s7-s11 docs/specs/00-architecture/08_agents.md
  - compliance:queue-137 docs/specs/00-architecture/137_mcqueue.md
  - compliance:eng-all docs/specs/00_engineering_standards.md
  - >-
    compliance:orchestrator-doc17 backlog/docs/doc-17 -
    Orchestrator-readings-not-rulings.md
  - compliance:five-words docs/specs/01-pipeline/132_step_standard_handbook.md
  - compliance:plan-protocol docs/specs/00-architecture/plan-protocol.md
  - compliance:inc-S backlog/docs/increments/doc-2 - Increment-S-requirements.md
  - compliance:ms-S backlog/milestones/m-1 - increment-1·b-search-[s].md
  - docs/reports/lanes/2026-11-21/BL-F412/REPORT.md
  - docs/reports/reviews/task-412/FOLD-CHECK.md
  - docs/reports/lanes/2026-11-21/BL-F412/GROUNDER.md
  - docs/reports/lanes/2026-11-21/BL-F412/TRIAGE.md
  - docs/reports/lanes/2026-11-21/BL-F412/FINDINGS.md
type: build
ordinal: 112012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-20 by the orchestrator from the plan of task-399 (section 9), Spec 137 rule 2. Operator approved the item (RR-0336, item 1 of the list put to him: a table row for review_followups.md, after task-375; until then a deferral goes to a named task). Rule: Spec 08 section 7 rule 6 (DEFER goes to review_followups.md with reasons). Today docs/reports/review_followups.md matches no row of scripts/analysis/rule-lists.json, so a lane cannot write it; the pile: outcome of task-399 (RR-0338) points here once it exists. Scope: one table row and its test. Not started; plan and panel before launch. Files: scripts/analysis/rule-lists.json, src/tests/backlog/rule-lists-table.logic.test.ts
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 (a) resolve --files docs/reports/review_followups.md --type build --letter S exits 0 and lists agents-s7-s11, queue-137, five-words, plan-protocol, inc-S, ms-S
- [x] #2 (b) validate prints rule-lists: ok 55 lists, N+1 rows, N the row count of the table the branch started from
- [x] #3 (c) page --check prints ... is current
- [x] #4 (d) the new test case is red before the row (failing assertion, the resolve exit) and green after, through the real hooks
- [x] #5 (e) git show --stat for commit A names exactly the two Files paths and this task file
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
PLAN-412-v1. Task: FOLLOWUPS.ROW, one rule-list row for docs/reports/review_followups.md. Operator standard: "you are probaley rebuilding stuff that already exists you do this all the time". Simple, no scope creep. ESTIMATE: GUESS 0.1 lane day, not timed.

Files: scripts/analysis/rule-lists.json, src/tests/backlog/rule-lists-table.logic.test.ts

BASIS. Board wf2/board head 4a70b85ca; all opened at this head.
- The card (RR-0336, item 1; Spec 137 rule 2): "Today docs/reports/review_followups.md matches no row ... Scope: one table row and its test." Depends on task-375 (RUNNING).
- Rule: docs/specs/00-architecture/08_agents.md section 7 rule 6 (:350 at 4a70b85ca): "Findings triage (WF6): BUG -> WF3 before Green Light; DEFER -> review_followups.md with reasons."
- scripts/analysis/rule-lists.json: 22 rows (line 80 on); validate prints "ok 55 lists, 22 rows". Shape row, panel-records (:188-193): {"id","globs":[...],"lists":["surface-128","surface-126","agents-s7-s11","queue-137"],"why":"V2.LIST (task-406, round 2): ... "}. Validate requires every literal glob to match a tracked path (rule-lists.mjs:129); the file is tracked (git ls-files lists it at 4a70b85ca; 4348 lines).
- List agents-s7-s11 exists (rule-lists.json:45: 08_agents.md sections "7. Rules & economics" and "11. Grounded Verification Protocol"); rule 6 is inside section 7. Other rows already attach it (queue-records :150-155, lane-tools, panel-records). every_task (five-words, plan-protocol) plus inc-S and ms-S are added by resolve itself (rule-lists.mjs:251), not by a row.
- Today: `node scripts/analysis/rule-lists.mjs resolve --files docs/reports/review_followups.md --type build --letter S` prints "refused: Files path(s) matched by no row of scripts/analysis/rule-lists.json: docs/reports/review_followups.md ...", exit 3. (Usage line: resolve [--files ... --type --letter].) No existing row globs it (docs/reports/** rows are generated, policy, panels, reference only).
- Test shape: src/tests/backlog/rule-lists-table.logic.test.ts: helper lists(files) (:11-16) runs resolve and returns ids; table() (:17) reads the real table; the task-384 block (:177-212, planted case :198-204) plants a defect by copying the table to a temp git repo and resolving with --root and --table (resolveIn :181-192).
- rule-lists.json is a protected path: its own protected_paths key lists it (rule-lists.json protected_paths); check-lane-close.mjs:681-682 refuses a commit that changes one and also moves a task to a finished status (self-edit rule). The launch brief generator (backlog-lane.mjs) only names the table in text; no other protection found.

SERVES. Standardized (a deferral has one named home the table knows) and observable (a lane may write the file and the review sees it). Not scalable, accurate or understandable beyond that.

WHAT. ONE new row in scripts/analysis/rule-lists.json: id "review-followups"; globs ["docs/reports/review_followups.md"]; lists ["agents-s7-s11", "queue-137"] (all 8 rows that attach agents-s7-s11 also attach queue-137, and the card names Spec 137 rule 2; ruled Q2 by the plan grounder under RR-0350); why: names Spec 08 section 7 rule 6 (DEFER goes to review_followups.md with reasons), RR-0336, RR-0338, this task, and that it attaches the list holding that rule. Placed after panel-records. No other row, no list added, no resolver change.

TESTS. One case in the existing table test, in a new describe "task-412: review_followups.md has its Spec 08 home":
1. Real tree: lists('docs/reports/review_followups.md') contains 'agents-s7-s11' and 'queue-137' (and the every_task ids); table().rows holds exactly one row with that id, its lists containing both (not equal: a later list addition is no drift); the describe comment cites 08_agents.md section 7 rule 6.
2. Planted defect (same case): copy the table without the row (resolveIn style, temp git repo, --root and --table); resolve exits 3 and stderr holds "matched by no row"; the real table is the control and exits 0. 
RED: write the test first, commit nothing yet; run it in the lane (the lane runs the runner, not this plan) and see a failing assertion (real table: resolve exit 3, not 0). GREEN: add the row; the test passes through the real commit hooks. Each spawned call asserts exit status first.

RELEASE. RR-0336 says "after task-375": task-375's Files names no rule-lists.json and its tooling is folded at head, and the plan order the orchestrator logged under RR-0350 (399, 375, 418, then the proof on this task) releases it (Q3). Other open tasks name the table or its test (366, 406, 413, 404, 403): land one at a time, rebase on the board head before commit A, locate panel-records by id, insert the row directly after it, append the describe at the end of the test file.

ORDER. 0 the Pre-Review Self-Checklist (00_engineering_standards.md:287); 1 test; 2 see it red; 3 add the row; 4 test green; 5 `rule-lists.mjs validate` and `page --check` (both ok at head, rows unaffected); 6 commit through the real hooks.

LANDING. Two commits, because the table is a protected path. Commit A: the row, the test and this task file (a note line, status unchanged: a code commit carries its task file, check-backlog-task.mjs), git add by name (message docs/feat(08_agents) ..., Task trailer). Commit B (later): the lane's records only as its brief lists them (its report directory with the per-list compliance outputs re-made at that head and GROUNDER.md from a separate grounder, the review context directory, this task file to DONE with the Final Summary round line); a plan task has no queue row (Spec 137 rule 2); a lane build task, rule 3 as amended 2026-11-20. Never in one commit (check-lane-close.mjs:681-682). Task is judged by its branch table because its own Files line names the table (check-lane-close.mjs:767).

ACCEPTANCE.
(a) `node scripts/analysis/rule-lists.mjs resolve --files docs/reports/review_followups.md --type build --letter S` exits 0 and lists agents-s7-s11, queue-137, five-words, plan-protocol, inc-S, ms-S (before: exit 3, "matched by no row").
(b) `node scripts/analysis/rule-lists.mjs validate` prints "rule-lists: ok 55 lists, N+1 rows", N the row count of the table the branch started from (22 at 4a70b85ca).
(c) `node scripts/analysis/rule-lists.mjs page --check` prints "... is current".
(d) The new test case is red before the row (failing assertion, the resolve exit) and green after, through the real hooks (commit A passes husky; none bypassed).
(e) `git show --stat HEAD` for commit A names exactly the two Files paths and this task file.

WHAT THIS CANNOT PROVE. That a lane can then write review_followups.md in a commit (the Files check is a separate hook); that the file's content is right; that a deferral is ever written; the task-399 pile outcome. The row lets a lane write the file; it does not make a file write an outcome: pile: and the other forms are judged as check-lane-close.mjs judges them today, and the dated note at 08_agents.md:351 (TRIAGE.md is the pile until the row exists) is not edited here (outside the Files line); whether the file replaces that pile line is the operator's open question (Q1).

OUT OF SCOPE. Any other row; any resolver or check change; the pile outcome of task-399 (RR-0338); creating or editing review_followups.md content; adding a list.

Plan review round 1: 40 folded, 0 task, 0 ruling, 0 wontfix, 2 pile; grounder docs/reports/reviews/task-412/GROUNDER-PLAN.md; triage docs/reports/reviews/task-412/TRIAGE-PLAN.md
plan-compliance-agents-s5-1to3#1 MED folded RELEASE. RR-0336 say
plan-compliance-agents-s5-1to3#2 MED folded ruled Q2 by the plan
plan-compliance-eng-all#1 MED folded RELEASE. RR-0336 say
plan-compliance-five-words#1 MED folded RELEASE. RR-0336 say
plan-compliance-inc-S#1 MED folded RELEASE. RR-0336 say
plan-compliance-inc-S#2 MED folded ruled Q2 by the plan
plan-compliance-ms-S#1 MED folded RELEASE. RR-0336 say
plan-compliance-orchestrator-doc17#1 MED folded N the row count of t
plan-compliance-plan-protocol#1 MED folded RELEASE. RR-0336 say
plan-compliance-queue-137#1 HIGH folded a code commit carrie
plan-compliance-queue-137#4 MED folded a plan task has no q
plan-plan-review-deepseek#4 MED folded N the row count of t
int#1 MED folded locate panel-records
rg#1 MED folded it does not make a f
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-21 (M-246) Plan put on the task by the orchestrator by hand: PLAN-412-v1 (sha256 b41ba4c6cc66), written by a read-only planner against the board at 4a70b85ca from this card only; the build of the six-step tasks is authorized by the operator (RR-0350, MORNING-DECISIONS.md:1638). This task is the first scripted pass through the pre-launch steps (plan-prep of task-418); its plan review evidence is in docs/reports/reviews/task-412/.

2026-11-21 (M-246) Plan review round 1 of this task, the first made with plan-prep (task-418): 11 plan review outputs written by plan-prep review (83 s), the Integration, Reality-Check and Regression seats on the plan, ruled by the separate grounder Cairn-Ground-P412: 53 findings, 42 CONFIRMED (1 HIGH, 13 MED, 23 LOW, 5 NIT), 11 REJECTED; 40 folded into the plan by 13 sentence edits (FOLD-412.json as the grounder wrote it, applied mechanically), 2 to the review pile; block and references added by plan-prep post. Three open questions were ruled by the grounder with grounds (docs/reports/reviews/task-412/QUESTIONS-RULED.md) and are taken as approved on the operator's authorization (RR-0350, MORNING-DECISIONS.md:1638), reported to him: Q1 the row lets a lane write the file and does not make a file write an outcome; the note at 08_agents.md:351 is not edited by this task; whether the file replaces the TRIAGE.md pile line is the operator's to rule; Q2 the row attaches agents-s7-s11 and queue-137, as the eight other rows carrying agents-s7-s11 do; Q3 'after task-375' is read as satisfied by task-375's tooling being folded while it is still RUNNING (the operator may rule it means DONE); the other table-editing tasks land one at a time.

2026-11-21 taken on the board at lane launch (lane BL-F412, worktree /Users/brettpreston_macmini/Buildo-wt-f412, branch wf1/inc1b-f412), RR-0240

2026-11-21 (lane BL-F412) red test written first: src/tests/backlog/rule-lists-table.logic.test.ts describe 'task-412: review_followups.md has its Spec 08 home' (two cases); the row follows. Note: gitFreeEnv() is not a name in the repo; the test spawns through helpers run()/script(), which strip every GIT_* variable (helpers.ts cleanEnv).

2026-11-21 (lane BL-F412) commit A: row review-followups added after panel-records (lists agents-s7-s11, queue-137); the test went red at failing assertions first (red.out: resolve exit 3 not 0), now green through the hooks.

2026-11-21 ACCEPTANCE (lane BL-F412, commit 52a49566e): (a) resolve --files docs/reports/review_followups.md --type build --letter S exit 0, lists: agents-s7-s11 queue-137 five-words plan-protocol inc-S ms-S. (b) validate: rule-lists: ok 55 lists, 23 rows (branch start had 22 rows, so N+1). (c) page --check: rule-lists: docs/reports/generated/rule-lists-by-kind.md is current. (d) red: red.out, both new cases failed at assertions (resolve refused, 'matched by no row', exit 3 not 0); green: commit.out, 21 passed, commit through real hooks, none bypassed. (e) git show --stat HEAD:  ...-list-row-so-a-deferral-has-its-Spec-08-home.md |  6 ++++-; scripts/analysis/rule-lists.json                   |  6 +++++; src/tests/backlog/rule-lists-table.logic.test.ts   | 30 ++++++++++++++++++++++;

2026-11-21 CORRECTION (lane BL-F412, fix round 1): my earlier note that gitFreeEnv() 'does not exist in the repo' is false: scripts/analysis/rule-lists.mjs:53 exports it. The test's helper cleanEnv (src/tests/backlog/helpers.ts:30) strips the same GIT_* keys and is equivalent for the test (the output grounder's ruling).

Dated note 2026-11-21 (M-246, prior text kept; RR-0351 · task-412 · Backlog; operator, verbatim: "Gap 3 we dont need the cross check.")
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The review-followups row and its test are built; acceptance (a) to (e) met; output review and a separate grounder done; the fold check was recorded after the fact and no cross-read adversary pass ran; the closing commit is records only because rule-lists.json is protected.

Review round 1: 13 fixed, 0 task, 8 ruling, 0 wontfix, 1 pile; grounder docs/reports/lanes/2026-11-21/BL-F412/GROUNDER.md; triage docs/reports/lanes/2026-11-21/BL-F412/TRIAGE.md
plan-compliance-agents-s5-1to3#1 MED ruling decision-135
plan-compliance-agents-s5-1to3#2 MED fixed 52a4956
plan-compliance-eng-all#1 MED ruling decision-135
plan-compliance-five-words#1 MED ruling decision-135
plan-compliance-inc-S#1 MED ruling decision-135
plan-compliance-inc-S#2 MED fixed 52a4956
plan-compliance-ms-S#1 MED ruling decision-135
plan-compliance-orchestrator-doc17#1 MED ruling decision-135
plan-compliance-plan-protocol#1 MED ruling decision-135
plan-compliance-queue-137#1 HIGH fixed 52a4956
out-compliance-agents-s7-s11#1 HIGH fixed 90eebe6
out-compliance-agents-s7-s11#2 MED fixed 90eebe6
<!-- SECTION:FINAL_SUMMARY:END -->
