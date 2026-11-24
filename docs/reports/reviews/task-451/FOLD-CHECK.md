# Fold check: task-451 plan (PLAN-451-v1 as folded, round 1, with FOLD-451.json)

Checked by: Cairn-Ground-P451

On the board working tree (~/Buildo-wt-board, head ddad097a8, branch wf2/board), the task-451 card as it now stands, after the 51 pairs of FOLD-451.json and `plan-prep post`. GROUNDER-PLAN.md, TRIAGE-PLAN.md, QUESTIONS-RULED.md, the three seat files and the lens outputs in docs/reports/reviews/task-451/ were read from the working tree. Read-only; every check ran in memory with node and the board's own `planHash`, `parseVerdicts`, `seatLines` and `outcomeErrors` (scripts/hooks/check-lane-close.mjs), and no file was written.

(1) PASS. Every pair landed as written. The committed card (HEAD ddad097a8, before the fold) with the 51 pairs applied in memory, each old text found exactly once at its turn (50 in the Implementation Plan, 1 in the Description, none in the Acceptance Criteria), equals the card as it stands now line for line, except for the lines the post step added: the updated_date, the five references (GROUNDER-PLAN.md, TRIAGE-PLAN.md and the three seat reports), the round line and 12 per-id lines (the MED outcomes). Nothing else in the plan changed that was not ruled.

(2) PASS. All 23 folded outcomes of TRIAGE-PLAN.md have their quote present in the card text, including the quote of plan-plan-review-deepseek#9 and of rg#5 that were lengthened after the first draft. `outcomeErrors` in plan mode over the 49 verdicts of GROUNDER-PLAN.md, the three Seat lines and TRIAGE-PLAN.md returns 0 errors for the 23 CONFIRMED ids. GROUNDER-PLAN.md holds 49 verdict lines, 23 of them CONFIRMED, equal to the 23 outcome lines. The quote of plan-plan-review-deepseek#13 (changed after my last run) is on its cited line and passes the checker's form rules.

(3) PASS. The round line on the card, "Plan review round 1: 23 folded, 0 task, 0 ruling, 0 wontfix, 0 pile; grounder docs/reports/reviews/task-451/GROUNDER-PLAN.md; triage docs/reports/reviews/task-451/TRIAGE-PLAN.md", equals the 23 folded and 0 pile of TRIAGE-PLAN.md. There is one Files line, and it holds the 13 paths added by FOLD-451.json.

(4) PASS. The claims of the fold hold at this head: the census, the two generated registry files, the four web content files, the three pinning tests, the mobile goldens fixture and .cursor/MCFRONTEND-QUEUE.md are on the Files line; descriptor :57 is this card's unconditionally; the string pin ends at 436; no OUTSIDE FILES LINE text remains.

Verdict: PASS

Plan: task-451 sha256:e5b3362ef4f0
