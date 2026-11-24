---
id: TASK-90
title: >-
  ST.N1 Land the McStorage policy v2 amendments in one M-246 batch after push 6
  and...
status: RUNNING
assignee:
  - '@lane-BL-STN1'
created_date: '2026-11-19T04:57:00Z'
updated_date: '2026-11-24T14:42:00Z'
due_date: '2026-11-26'
labels:
  - '6'
  - plan:ST.N1
  - McFixReborn
  - dead
milestone: m-1
dependencies:
  - TASK-62
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#6/ST.N1
  - ~/Buildo-scratch/inc6-guard/RULES.md#L8 sha256=cb54de861a9b
  - docs/reports/lanes/2026-11-20/BL-STN1/REPORT.md
  - docs/reports/lanes/2026-11-20/BL-STN1/FINDINGS.md
  - docs/reports/lanes/2026-11-20/BL-STN1/TRIAGE.md
documentation:
  - backlog/docs/increments/doc-8 - Increment-6-requirements.md
priority: low
type: build
project: McIncrement
ordinal: 8052
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: ST.N1 Land the McStorage policy v2 amendments in one M-246 batch after push 6 and after the operator has read the policy: A-ST5, A-ST4, A-ST6, A-ST3, A-FE39, A-MB38, A-MB75, A-MB76, A-S88, A-126, A-MF62, A-LAT; mark each conflicting ruling SUPERSEDED with its prior text kept; refresh McSTORAGE-ALIGNMENT.md:146 "proposed" to "ruled"; ST-3 amendment gets a second seat (if it fails, the others land without it); the A-ST3 ceiling clause, A-S88 cost wording and A-ST5b land only after ST-OP1, ST-OP3 and ST-OP4 are answered, the rest do not wait; A-ST5b (tester 309 rows) is separate and optional; also amends McSTORAGE-ALIGNMENT.md:145, :157, :162 and records MF-51 plan.v2 line 58 as superseded

snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: GUESS 0.5 day

Plan text at the snapshot: WAITING operator reads the policy; push 6
landingPush: after push 6 (6.43)
slicePart: records
who (plan text): McBylaws lane R (rulings text), operator reads first
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Pre-register the expected moves, committed alone — "Pre-register the task's `rules[]` and expected moves" (.cursor/MCBYLAWS-QUEUE.md:109)
- [ ] #2 Failing tests are written into the plan and reviewed at plan altitude — "are written INTO the plan and reviewed at PLAN altitude" (docs/specs/00-architecture/08_agents.md:465)
- [x] #3 `write_scope` declared in the brief — "The brief file opens with a front-matter block" (docs/specs/00-architecture/08_agents.md:144)
- [ ] #4 PLAN panel run with the lens set, never one generic pass — "NEVER run one generic pass" (docs/specs/00-architecture/08_agents.md:334)
- [ ] #5 Fold validated by a grounder that re-executes every claim — "one grounder re-executes every claim in the fold" (docs/specs/00-architecture/08_agents.md:458)
- [ ] #6 Built red first, then green, on the tip — "Red tests first, then the code, through the real hooks." (docs/specs/00-architecture/08_agents.md:490)
- [ ] #7 OUTPUT panel record committed with the work — "is committed with the work (R-KM)." (.cursor/MCBYLAWS-QUEUE.md:116)
- [ ] #8 McFrontend build only: queue row first — "No McFrontend work starts without its row in" (docs/specs/02-web-admin/126_maxbld_surface_standard.md:72)
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
1. PRE-REGISTRATION (AC1), committed alone: this plan and the G1 context pack. Expected moves of the landing commit: Spec 69a +4 dated-note rows after the ST-3 line note (ST-5 as amended with its first repo home, rules P1 to P12 with Lock, ST-3 without the ceiling clause, ST-6), no M row, no id, no rule-map or table_version move; Spec 78 +2 notes (ST-4, O-6 read for opened lots); Spec 135 FE-39 +1 note (Spec 136 regenerated by scripts/surfaces/generate-surface-handbook.mjs, fe.39 note count +1); Spec 126 11a.3 +1 note (A-126); Spec 137 section 2 +1 dated note (the McStorage home); MCBYLAWS-QUEUE.md +3 notes (MB-38, MB-75, MB-76); MCFRONTEND-QUEUE.md +3 notes (MF-62, MF-80, MF-51); doc-16 header status line only (via backlog doc update); no queue Status line changes; no script, test, code or golden file moves. NOT landed, drafted for the operator in REPORT.md: the A-ST3 ceiling clause (open point 1), the cost wording (rule P9, A-S88, the A-FE39 cost sentence; open point 3), A-ST5b (open point 4). Later rulings applied: MD:719 purge yes and :738 PRG-1 a (90 days) and TRK-1 a, :719 owner input has no 1 s budget, :785 RR-0176 no 35 s cap (A-MF62, P12 corrected). LOAD.1 as built 2026-11-19 (task-266) stated as a fact. Home finding: ST-5 had no repo register row (scratch only); ST-1/2/3/6/7/8 are 69a notes, ST-4 is Spec 78:750.
2. FAILING TESTS (AC2): no new check or test is written (no script changes); the existing --check scripts are the tests, run before (checks-before.txt, all clean) and after; a pin test that moves moves as data with a dated comment. Red-first applies to a new check: none planned (stale-stamp red test is owned by task-272 ST.P2, named in the P4 Lock). Flagged for the grounder.
3. WRITE_SCOPE (AC3): declared in the brief: the lane dir and ~/Buildo-wt-stn1.
4. PLAN LENSES (AC4): compliance lens run once per rule list (doc-16 whole, Spec 137 whole, Spec 08 sections 7 and 11, the M-246 form) on DeepSeek; findings triaged KEEP or REJECT in TRIAGE.md (r1-compliance-*.txt in the lane dir).
5. GROUNDER (AC5): owed to a separate agent; the task stays RUNNING.
6. BUILD (AC6): apply by one script (texts read from doc-16), run the generators and every --check, commit with the real hooks and the explicit paths.
7. OUTPUT RECORD (AC7): the compliance lens on the landing diff; REPORT, FINDINGS, TRIAGE and the review output copied to docs/reports/lanes/2026-11-20/BL-STN1/ and added with --add-ref.
8. AC8: not a McFrontend build, not applicable.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-20 operator, verbatim: "yes to McStorage and 1,2,3 yes as recommended" (item 3: land the McStorage policy v2 amendments now, in Increment 1·B, so the rule records are not stale). Earlier the same day: "the McStroage policy was recently updated with the new direction - I just want to ensure the rules were updated as well. I dont want to be bound with stale McStorage". The amendments that wait on the open points ST-OP1, ST-OP3 and ST-OP4 still wait on the operator.

2026-11-20 taken on the board at lane launch (lane BL-STN1, worktree /Users/brettpreston_macmini/Buildo-wt-stn1, branch wf1/inc1b-stn1), RR-0240

Landing commit 2 (ST.N1): dated M-246 notes at 69a:696-699 (ST-5 first repo home, rules P1-P12 with Lock, ST-3 without ceiling clause, ST-6), Spec 78:752 and :754 (ST-4, O-6), Spec 135 FE-39, Spec 126 11a.3, Spec 137 section 2 McStorage row (in-cell), MCBYLAWS-QUEUE MB-38/MB-75/MB-76/MB-94, MCFRONTEND-QUEUE MF-51/MF-62/MF-80; Spec 133/136 regenerated; doc-16 header status line. Waiting: A-ST3 ceiling clause (open point 1), cost wording (open point 3), A-ST5b (open point 4). Plan round and output round compliance lens run once per rule list; triage in the lane TRIAGE.md. Grounder owed.

AC1 evidence: pre-registration committed alone, 905741d7f. AC3: write_scope declared in the brief (lane dir and ~/Buildo-wt-stn1). Landing 587c98a50. AC2 and AC6 not applicable (no new check or test, no script changed); AC4 partial (compliance lens per rule list only); AC5 owed (separate grounder); AC7 repo copies in docs/reports/lanes/2026-11-20/BL-STN1; AC8 not applicable. Task left RUNNING: grounder owed.

Commit 4: grounder-round fixes (status cells separate operator words from doc-16 policy text; OPEN items moved out of ruling text; doc-16 body lines marked SUPERSEDED in place). Task stays RUNNING.

Correction (2026-11-20): the earlier notes and the doc-16 header named commits by sha (587c98a50, 905741d7f); a rebase renumbered them, so shas are not used. The commits are: 'docs(69a_mcbylaw_register): ST.N1 pre-registration of the expected moves for the McStorage policy v2 landing, committed alone (task-90)' and 'docs(69a_mcbylaw_register): McStorage policy v2 amendments landed, prior text kept (ST.N1)', both 2026-11-20 on wf1/inc1b-stn1.

Operator 2026-11-20, verbatim: "Task 370 yes . approved" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1427; the table put to him is quoted in that entry). Closes after task-387 corrects Spec 126:810 ("failed compute shows a closed reason"), overturned by the operator ruling C2 (a) of 2026-11-20.
<!-- SECTION:NOTES:END -->
