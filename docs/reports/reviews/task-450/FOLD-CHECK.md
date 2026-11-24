# Fold check: task-450 plan (PLAN-450-v1 as folded, round 1, with FOLD-450b.json)

Checked by: Cairn-Ground-P450

On the board working tree (~/Buildo-wt-board, head f18bbb4c8, branch wf2/board), the task-450 card as it now stands, after the 36 pairs of FOLD-450.json, the 13 pairs of FOLD-450b.json and `plan-prep post`. GROUNDER-PLAN.md, TRIAGE-PLAN.md, QUESTIONS-RULED.md, the three seat files and the lens outputs in docs/reports/reviews/task-450/ were read from the working tree. Read-only; every check ran in memory with node and the board's own `planHash`, `parseVerdicts` and `outcomeErrors` (scripts/hooks/check-lane-close.mjs), and no file was written.

(1) PASS. Every pair landed as written. The card before the first fold (the oldest committed version, 773e4abc3) with the 36 pairs and then the 13 pairs applied in memory, each old text found exactly once at its turn, equals the card as it stands now line for line, except for the lines the post step added: the updated_date, the five references (GROUNDER-PLAN.md, TRIAGE-PLAN.md and the three seat reports), the round line and 22 per-id lines (the MED and higher outcomes). Nothing else in the plan changed that was not ruled. Five pairs of FOLD-450.json (indexes 3, 10, 19, 27 and 35: the hasHouseNumber sentence, risk 7, the search-web-binding :79 line, step 13 and the web golden UNVERIFIED line) do not appear verbatim any more because the matching FOLD-450b.json pair (1, 7, 12, 8 and 9) rewrote part of their new text; for each, the 450 new text with the 450b replacement applied is present in the card exactly once. No old text remains in the card.

(2) PASS. All 29 folded or pile outcomes of TRIAGE-PLAN.md (28 folded, 1 pile) have their quote present in the card text (the quote of plan-ux#6 was corrected after the 450b fold). `outcomeErrors` in plan mode over the 49 verdicts of GROUNDER-PLAN.md, the three Seat lines and TRIAGE-PLAN.md returns 0 errors for the 29 CONFIRMED ids. GROUNDER-PLAN.md holds 49 verdict lines, 29 of them CONFIRMED, equal to the 29 outcome lines.

(3) PASS. The round line on the card, "Plan review round 1: 28 folded, 0 task, 0 ruling, 0 wontfix, 1 pile; grounder docs/reports/reviews/task-450/GROUNDER-PLAN.md; triage docs/reports/reviews/task-450/TRIAGE-PLAN.md", equals the 28 folded and 1 pile of TRIAGE-PLAN.md. There is one Files line, and it holds the 13 paths added by FOLD-450.json.

(4) PASS. The claims of the fold hold at this head: the oracle test, the two mobile goldens copies and the other added files are on the Files line; the plan keeps the semi projection at none, rules 8.1 as B and the refine line reworded, and names the backlog ids 451, 454 and 456 for the later cards.

Verdict: PASS

Plan: task-450 sha256:e7587a0bb08a
