# Fold check: task-442 plan (PLAN-442-v1 as folded, rounds 1 and 2, lens evidence refreshed under RR-0414)

Checked by: Cairn-Check-P442

On the board working tree (~/Buildo-wt-board, head 84dd9fe06), the task-442 card as it stands after the 58 pairs of FOLD-442.json, the 7 pairs of FOLD-442-r2.json, the five dated notes RR-0401 to RR-0405, `plan-prep post` and the round 2 block. GROUNDER-PLAN.md, TRIAGE-PLAN.md and the three re-made lens inputs and outputs in docs/reports/reviews/task-442/ are modified and uncommitted at this head, so they were read from the working tree. Read-only; every check ran in memory with node, the board's own `planHash`, `filesEntries`, `findingsIn`, `parseVerdicts`, `outcomeErrors` and `planGateErrors`. The baseline plan is the card at e44dac9aa.

(1) PASS. All 44 folded-quote strings of TRIAGE-PLAN.md are present in the card text. TRIAGE-PLAN.md has 92 outcome lines: 44 folded, 20 ruling (RR-0385) and 28 pile. Every CONFIRMED id (92) has an outcome line.

(2) PASS. Applied in order to the plan at e44dac9aa, the 65 pairs reproduce the card's plan field with no line missing, each old text present once (the Files line of pair 36 is in the Description and the plan, and the card holds the new line in both). Round 1 pairs 26, 38, 42 and 49 were rewritten by round 2 pairs 64, 61, 60 and 62. The only other plan lines are the two round lines and 54 outcome lines. Outside the plan only updated_date, the 5 references and the five dated notes differ. The plan holds no git checkout, switch or restore, no direct call of the test runner and no test runner name on a Files line. The text "the basement, not shared stairs and halls" is on the card (RR-0405).

(3) PASS. The 51 path:line cites of the plan resolve to a tracked file with that many lines. The plan cites operator rulings RR-0385, RR-0388, RR-0392, RR-0359 and RR-0401 to RR-0405 only, each as given.

(4) PASS. The card holds "Plan review round 1: 47 folded, 0 task, 18 ruling, 0 wontfix, 27 pile" and "Plan review round 2: 44 folded, 0 task, 20 ruling, 0 wontfix, 28 pile", the second equal to TRIAGE-PLAN.md. The 5 references are on the card. `filesEntries` returns the 12 entries, and the Description and plan Files lines are equal.

(5) PASS. For BL-FEDB442, `planGateErrors` with the working-tree folder, this file and the Plan line added in memory returns 0 errors, 13 lists and 179 findings. The 13 resolved lists each have an in-plan input whose material equals the plan sections of context-r2.md, a valid stamp, and an output with the REVIEW header and a VERDICT line. Each of the 179 ids has exactly one verdict line in GROUNDER-PLAN.md, and the Ruled lines match the files.

Verdict: PASS

Plan: task-442 sha256:54ab97aaa57b
