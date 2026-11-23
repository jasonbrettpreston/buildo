# Fold check: task-446 plan (PLAN-446-v1 as folded), plan review round 1

Checked by: Cairn-Ground-P446

On the board working tree (~/Buildo-wt-board, head c066b5de9), the task-446 card after FOLD-446.json, FOLD-446b.json, `plan-prep post` and the card edit on RR-0396. Read-only; every check ran in memory with node. I used the board's own `planHash` and the dry run `node scripts/analysis/backlog-lane.mjs --task task-446 --lane BL-HB446 --board ~/Buildo-wt-board --dry-run`.

(1) PASS. All 109 folded quotes of TRIAGE-PLAN.md are present in the card text. Each is 20 or more characters and none has a space as its 20th character. None holds a backtick, an asterisk or a double quote. TRIAGE-PLAN.md has 116 outcome lines: 109 folded and 7 pile. Every CONFIRMED MED has a folded outcome (there is no CONFIRMED CRITICAL or HIGH). My first message's count line (105 folded, 11 pile) was wrong. The right figures are 109 and 7, as the round block reads. That sentence is a prose summary the gate does not read.

(2) PASS. GROUNDER-PLAN.md has 152 verdict lines. All parse with the board's pattern. No cited path has a space and none is under docs/reports/lanes/. The 152 quotes are all distinct. It has 27 Ruled lines, equal to FINDINGS-PLAN.md, and 3 Seat lines whose sha256 match the seat files (b6841f701639, 0cb9996fec24, 1c3e04fe0132).

(3) PASS. The round block reads "Plan review round 1: 109 folded, 0 task, 0 ruling, 0 wontfix, 7 pile; grounder docs/reports/reviews/task-446/GROUNDER-PLAN.md; triage docs/reports/reviews/task-446/TRIAGE-PLAN.md", equal to TRIAGE-PLAN.md. The 5 references are on the card.

(4) PASS. The card's Files line at line 30 and the plan's last Files line at line 198 begin identically, and no Files entry changed.

(5) PASS. On the card as it now stands, the launch-gate dry run for BL-HB446 raises only two refusals. One is the missing last Plan line in GROUNDER-PLAN.md (it expects `Plan: task-446 sha256:2de92c24f71a`). The other is the missing FOLD-CHECK.md, which this file satisfies. The outcome, seat, reference, verdict, round-block and list checks raise nothing. The board's `planHash` on the card is 2de92c24f71a.

(6) PASS. The plan is internally consistent on one rule: one row and one line for R-22, with R-03 and R-04 as the existing fe.49 and fe.52. The launch gate is met and stated as met: "GATE MET (2026-11-23)" is in section 0, and RR-0396 appears 5 times in the card. The operator's reply (decision-181, MORNING-DECISIONS.md:1999 and :2002, "Question1 yes. push complete" and "Question2 No") is recorded in the card Description. The lane writes it as the first dated note on the task, and appends it verbatim to the R-22 row's Full text cell in commit 1, which is not made before it exists. Acceptance item 12 says the same.

Verdict: PASS

Plan: task-446 sha256:2de92c24f71a
