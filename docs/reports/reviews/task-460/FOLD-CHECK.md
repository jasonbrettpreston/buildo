# Fold check: task-460 plan (PLAN-460-v1 as folded, round 1, with FOLD-460.json)

Checked by: Cairn-Ground-P460

On the board working tree (~/Buildo-wt-board, head f5b3e1ff4, branch wf2/board), the task-460 card as it now stands, checked after the 38 pairs of FOLD-460.json and again after `plan-prep post` ("block and 5 reference(s) added"). GROUNDER-PLAN.md, TRIAGE-PLAN.md, QUESTIONS-RULED.md, the three seat files and the lens outputs in docs/reports/reviews/task-460/ were read from the working tree. Read-only; every check ran in memory with node and the board's own `planHash`, `parseVerdicts`, `seatLines`, `findingsIn` and `outcomeErrors` (scripts/hooks/check-lane-close.mjs, scripts/analysis/rule-lists.mjs), and no file was written.

(1) PASS. Every pair landed as written. All 38 new texts are present in the card (34 in the Implementation Plan, 1 in the Description, 3 in the Acceptance Criteria). Each old text was found exactly once in the card at the head before the fold. None of the 38 old texts is left in the card.

(2) PASS. No stale citation is left in the card: ":654", ":657-661", ":569-571", "pre-commit:21" and "pre-commit:55" each occur 0 times. They are replaced by :661, :658-662, :579-580, :19 and :56.

(3) PASS. The card holds exactly one definition of Q7, "- Q7 (OPERATOR QUESTION, the only one)", in section 8 (Open choices), after Q6. The Description, AC #2, AC #3, section 4 step 1, the Q7 paragraph before "Red proof" and section 6 refer to it and do not define it again. Q1 is marked RULED, with Ruled A. Q2 to Q6 carry their RULED text. The Q4 UNVERIFIED line reads "Settled by reading".

(4) PASS. All 24 folded outcomes of TRIAGE-PLAN.md have their quote present in the card text, including the lengthened in#4 and rc#4 quote and the rg#3 quote "are lists of docs/specs/00_engineering_standards.md in the table", which replaced the first draft because the checker strips asterisks. The 2 pile lines (plan-plan-review-deepseek#9, rg#6) carry reasons of 30 or more characters. `outcomeErrors` in plan mode over the 34 verdicts of GROUNDER-PLAN.md, the three Seat lines and TRIAGE-PLAN.md returns 0 errors for the 26 CONFIRMED ids. GROUNDER-PLAN.md holds 34 verdict lines, 26 of them CONFIRMED, equal to the 26 outcome lines. The Ruled lines (plan-error-paths.txt sha256:b83304bf12b9 findings:7; plan-plan-review-deepseek.txt sha256:8984d077b2d2 findings:10) and the three Seat lines (sha256:070528334f98, add1d8633812, f38a83335295) match the committed files.

(5) PASS. The round line on the card, "Plan review round 1: 24 folded, 0 task, 0 ruling, 0 wontfix, 2 pile; grounder docs/reports/reviews/task-460/GROUNDER-PLAN.md; triage docs/reports/reviews/task-460/TRIAGE-PLAN.md", equals the 24 folded and 2 pile lines of TRIAGE-PLAN.md.

(6) PASS. The claims of the fold hold at this head. rule-lists.mjs:188 decides code by task type alone, :194 is the out line, :661 is the plan-prep line and :306 is outputLists. check-lane-close.mjs:468, :521, :525, :531, :579-580 and :855 are as the card now cites them. .husky/pre-commit:19 is the by-law gate and :56 is the related-tests line. The Files line is unchanged. The card is not edited outside the plan, the Description sentence and AC #2, #3 and #6.

(7) PASS. The scope of the fold is as ruled. The plan stage, the close check, the round limits and the no-fold-before-the-grounder rule are unchanged. No table key or mechanism is added. The one open operator question (Q7, security at output) is stated with its three options and what the build waits on, and nothing in the plan is built for it before the answer.

Verdict: PASS

Plan: task-460 sha256:b1e33753b815
