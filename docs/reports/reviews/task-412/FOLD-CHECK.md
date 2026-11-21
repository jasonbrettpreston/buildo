# Fold check: task-412 plan (PLAN-412-v1 as folded), plan review round 1

Checked by: Cairn-Ground-P412, the separate plan grounder (not the lane BL-F412, not the orchestrator), on the board as it was after the script's first commit (9fee1df4d), 2026-11-21.
Recorded by: the orchestrator, after the fact. The report below was delivered to the orchestrator as an agent hand-back and is pasted verbatim; it was not written to the repo at the time (finding out-compliance-agents-s7-s11#1 of the output review, CONFIRMED HIGH by the output grounder Cairn-Ground-O412 as a missing record).
Cross-read adversary pass (Spec 08 section 11.2): NONE RAN for this task's plan. This file does not claim one.

## The grounder's report, verbatim

All five checks pass. I added the Plan line to GROUNDER-PLAN.md.

(1) PASS
- The board's task-412 plan field equals FOLD-412.json applied to the original plus the block post wrote, whitespace squashed. It is 8,293 characters against 7,309 for the fold alone.
- The 984 extra characters are the block, and that block equals ROUND-BLOCK.txt.
- All 13 NEW sentences are present and no OLD sentence is left.
- All 42 `folded:"..."` quotes of TRIAGE-PLAN.md are present in the task text (0 missing).

(2) PASS. The dated note states Q1 to Q3 as I ruled them:
- Q1: the row lets a lane write the file and does not make a file write an outcome; the 08_agents.md:351 note is not edited by this task; whether the file replaces the TRIAGE.md pile line is the operator's to rule.
- Q2: both lists, agents-s7-s11 and queue-137, as the eight other rows carrying agents-s7-s11 do.
- Q3: "after task-375" read as satisfied by task-375's tooling being folded while it is still RUNNING (the operator may rule it means DONE); the other table editors land one at a time.
- The counts are right: 53 findings, 42 CONFIRMED (1 HIGH, 13 MED, 23 LOW, 5 NIT), 11 REJECTED, 40 folded, 2 pile.

(3) PASS
- Every file in the folder at HEAD (9fee1df4d) is byte-identical to the worktree copy and to what I ruled.
- GROUNDER-PLAN.md is 1903674d1930 and TRIAGE-PLAN.md is a742b3111e5d, matching my files.
- Seats: f0c8a3055f08, 9f7ddb67c9dc, 54964ed0f5ff.
- The Ruled lines equal the 11 Ruled lines of the committed FINDINGS-PLAN.md, so the 11 plan outputs are unchanged.
- The commit names only files under docs/reports/reviews/task-412/.

(4) PASS. I read the folded plan whole and found no contradiction:
- No stale "no queue-137", "queue row", "23 rows" or "equal to" remains.
- Acceptance (e) now names the two Files paths plus this task file.
- Scope is still one row and one test.
- Nothing in the plan is unbuildable at this head; rule-lists.json and the test file are unchanged since 4a70b85ca.

(5) PASS. I recomputed planHash on the board's task file with check-lane-close.mjs and it is 73d02e7e8f80, which matches the expected line.

PLAN LINE: ADDED.
- GROUNDER-PLAN.md is the committed file plus the last line `Plan: task-412 sha256:73d02e7e8f80`. The diff against the committed file is that one line.
- sha256: d583c64323d6104b7124f6340ea79bfc9d70d86b048ae8bd23e3c86fff9d6ac6

## What this record does not prove

It is the checker's own report, relayed. Nothing in the repo at the time witnessed the check; the launch check cannot prove such a step. The Plan line itself (commit f16f100d3) is the only artifact made at the time.
