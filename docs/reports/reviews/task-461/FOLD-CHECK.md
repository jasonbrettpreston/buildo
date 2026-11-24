# Fold check: task-461 plan (PLAN-461-v1 as folded, round 1, with FOLD-461.json and FOLD-461b.json)

Checked by: Cairn-Ground-P461

On the board working tree (~/Buildo-wt-board, head 4ab892407, branch wf2/board), the task-461 card as it now stands, after the 15 pairs of FOLD-461.json, the 2 pairs of FOLD-461b.json and `plan-prep post`. GROUNDER-PLAN.md, TRIAGE-PLAN.md, QUESTIONS-RULED.md, the three seat files and the lens outputs in docs/reports/reviews/task-461/ were read from the working tree. Read-only; every check ran in memory with node and the board's own check-lane-close.mjs functions, with no redirect and no test runner.

(1) PASS. Every pair landed as written. The card before the fold (committed 2c902a184) with the 15 pairs of FOLD-461.json applied in memory, each old text found exactly once at its turn (all 15 in the Implementation Plan, none in the Description or the Acceptance Criteria), then the 2 pairs of FOLD-461b.json (each old found once, both in the Implementation Plan), equals the card as it stands now line for line. The only differences are the lines the post step added: the updated_date, the five references (GROUNDER-PLAN.md, TRIAGE-PLAN.md and the three seat files) and the round line with its folded block. No old 08_agents.md:462 cite remains in the plan.

(2) PASS. All 9 folded outcomes of TRIAGE-PLAN.md have their quote present in the card text, including "That green is the runnable part only" and "after the edit it should be 0 failed, 866 tests", and the one pile line (plan-error-paths#2) has its reason. `outcomeErrors` in plan mode over the 16 verdicts of GROUNDER-PLAN.md, the three Seat lines and TRIAGE-PLAN.md returns 0 errors for the 10 CONFIRMED ids. The seat sha12 values (integration 3b3f6fe7ca51, reality-check d5cecfeb7c3c, regression c67995acc1e9) match the file bytes. The seat finding ids read are in#1, rc#1, rc#2 and rg#1. Every verdict quote is on its cited line, is 20 or more characters, has a non-space 20th character and holds no backtick, double quote, backslash or asterisk. The quotes are distinct, every reason is 30 or more characters, and no cited line is used more than once.

(3) PASS. The round line on the card, "Plan review round 1: 9 folded, 0 task, 0 ruling, 0 wontfix, 1 pile; grounder docs/reports/reviews/task-461/GROUNDER-PLAN.md; triage docs/reports/reviews/task-461/TRIAGE-PLAN.md", equals the 9 folded and 1 pile of TRIAGE-PLAN.md. There is one Files line, `Files: mobile/__tests__/lotForm.test.ts`, and the fold did not change it.

(4) PASS. The claims of the fold hold at this head:
- `git diff --stat 492ef72c7 HEAD -- mobile` is empty.
- The plan's cites into docs/ now read 08_agents.md:496 and 137_mcqueue.md:98, which are the rules' lines.
- The three open choices are ruled in the card (8.1 A, 8.2 B, 8.3 no card).
- The command is pinned to --ci --coverage=false.
- The section 5 search names ConsumerParcelLookupResultSchema.
- The section 4 full-run figures follow phone-full-0ab1aed72.out (1 failed suite, 57 passed, 866 tests, then 0 failed after the edit).

Verdict: PASS

Plan: task-461 sha256:682c32cc4de5
