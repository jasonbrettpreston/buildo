---
id: TASK-412
title: >-
  FOLLOWUPS.ROW review_followups.md gets a rule-list row so a deferral has its
  Spec 08 home
status: LATER
assignee: []
created_date: '2026-11-20T23:40:00Z'
updated_date: '2026-11-21T06:39:00Z'
labels:
  - McFix
  - McFix V2
milestone: m-1
dependencies:
  - TASK-375
type: build
ordinal: 112012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-20 by the orchestrator from the plan of task-399 (section 9), Spec 137 rule 2. Operator approved the item (RR-0336, item 1 of the list put to him: a table row for review_followups.md, after task-375; until then a deferral goes to a named task). Rule: Spec 08 section 7 rule 6 (DEFER goes to review_followups.md with reasons). Today docs/reports/review_followups.md matches no row of scripts/analysis/rule-lists.json, so a lane cannot write it; the pile: outcome of task-399 (RR-0338) points here once it exists. Scope: one table row and its test. Not started; plan and panel before launch. Files: scripts/analysis/rule-lists.json, src/tests/backlog/rule-lists-table.logic.test.ts
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
PLAN-412-v1. Task: FOLLOWUPS.ROW, one rule-list row for docs/reports/review_followups.md. Operator standard: "you are probaley rebuilding stuff that already exists you do this all the time". Simple, no scope creep.

Files: scripts/analysis/rule-lists.json, src/tests/backlog/rule-lists-table.logic.test.ts

BASIS. Board wf2/board head 4a70b85ca; all opened at this head.
- The card (RR-0336, item 1; Spec 137 rule 2): "Today docs/reports/review_followups.md matches no row ... Scope: one table row and its test." Depends on task-375 (RUNNING).
- Rule: docs/specs/00-architecture/08_agents.md section 7 rule 6 (:350 region): "Findings triage (WF6): BUG -> WF3 before Green Light; DEFER -> review_followups.md with reasons."
- scripts/analysis/rule-lists.json: 22 rows (line 80 on); validate prints "ok 55 lists, 22 rows". Shape row, panel-records (:187-192): {"id","globs":[...],"lists":["surface-128","surface-126","agents-s7-s11","queue-137"],"why":"V2.LIST (task-406, round 2): ... "}. Validate requires every literal glob to match a tracked path (rule-lists.mjs:129); the file is tracked (git ls-files).
- List agents-s7-s11 exists (rule-lists.json:45: 08_agents.md sections "7. Rules & economics" and "11. Grounded Verification Protocol"); rule 6 is inside section 7. Other rows already attach it (queue-records :150-155, lane-tools, panel-records). every_task (five-words, plan-protocol) plus inc-S and ms-S are added by resolve itself (rule-lists.mjs:251), not by a row.
- Today: `node scripts/analysis/rule-lists.mjs resolve --files docs/reports/review_followups.md --type build --letter S` prints "refused: Files path(s) matched by no row of scripts/analysis/rule-lists.json: docs/reports/review_followups.md ...", exit 3. (Usage line: resolve [--files ... --type --letter].) No existing row globs it (docs/reports/** rows are generated, policy, panels, reference only).
- Test shape: src/tests/backlog/rule-lists-table.logic.test.ts: helper lists(files) (:11-16) runs resolve and returns ids; table() (:17) reads the real table; the task-384 block (:177-204) plants a defect by copying the table to a temp git repo and resolving with --root and --table (resolveIn :181-192).
- rule-lists.json is a protected path: its own protected_paths key lists it (rule-lists.json protected_paths); check-lane-close.mjs:681-682 refuses a commit that changes one and also moves a task to a finished status (self-edit rule). The launch brief generator (backlog-lane.mjs) only names the table in text; no other protection found.

SERVES. Standardized (a deferral has one named home the table knows) and observable (a lane may write the file and the review sees it). Not scalable, accurate or understandable beyond that.

WHAT. ONE new row in scripts/analysis/rule-lists.json: id "review-followups"; globs ["docs/reports/review_followups.md"]; lists ["agents-s7-s11"]; why: names Spec 08 section 7 rule 6 (DEFER goes to review_followups.md with reasons), RR-0336, this task, and that it attaches the list holding that rule. Only agents-s7-s11, because that is the list holding rule 6; no queue-137 (the card names only the Spec 08 rule). Placed after panel-records. No other row, no list added, no resolver change.

TESTS. One case in the existing table test, in a new describe "task-412: review_followups.md has its Spec 08 home":
1. Real tree: lists('docs/reports/review_followups.md') contains 'agents-s7-s11' (and the every_task ids); table().rows has the row id with lists equal to ['agents-s7-s11'].
2. Planted defect (same case): copy the table without the row (resolveIn style, temp git repo, --root and --table); resolve exits 3 and stderr holds "matched by no row"; the real table is the control and exits 0. 
RED: write the test first, commit nothing yet; run it in the lane (the lane runs the runner, not this plan) and see a failing assertion (real table: resolve exit 3, not 0). GREEN: add the row; the test passes through the real commit hooks. Each spawned call asserts exit status first.

ORDER. 1 test; 2 see it red; 3 add the row; 4 test green; 5 `rule-lists.mjs validate` and `page --check` (both ok at head, rows unaffected); 6 commit through the real hooks.

LANDING. Two commits, because the table is a protected path. Commit A: the row and the test, no task move (message docs/feat(08_agents) ..., Task trailer). Commit B (later): the task file and queue row to DONE with the evidence. Never in one commit (check-lane-close.mjs:681-682). Task is judged by its branch table because its own Files line names the table (check-lane-close.mjs:767).

ACCEPTANCE.
(a) `node scripts/analysis/rule-lists.mjs resolve --files docs/reports/review_followups.md --type build --letter S` exits 0 and lists agents-s7-s11, five-words, plan-protocol, inc-S, ms-S (before: exit 3, "matched by no row").
(b) `node scripts/analysis/rule-lists.mjs validate` prints "rule-lists: ok 55 lists, 23 rows".
(c) `node scripts/analysis/rule-lists.mjs page --check` prints "... is current".
(d) The new test case is red before the row (failing assertion, the resolve exit) and green after, through the real hooks (commit A passes husky; none bypassed).
(e) `git show --stat HEAD` for commit A names exactly the two Files paths.

WHAT THIS CANNOT PROVE. That a lane can then write review_followups.md in a commit (the Files check is a separate hook); that the file's content is right; that a deferral is ever written; the task-399 pile outcome.

OUT OF SCOPE. Any other row; any resolver or check change; the pile outcome of task-399 (RR-0338); creating or editing review_followups.md content; adding a list.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-21 (M-246) Plan put on the task by the orchestrator by hand: PLAN-412-v1 (sha256 b41ba4c6cc66), written by a read-only planner against the board at 4a70b85ca from this card only; the build of the six-step tasks is authorized by the operator (RR-0350, MORNING-DECISIONS.md:1638). This task is the first scripted pass through the pre-launch steps (plan-prep of task-418); its plan review evidence is in docs/reports/reviews/task-412/.
<!-- SECTION:NOTES:END -->
