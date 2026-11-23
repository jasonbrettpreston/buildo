# Fold check: task-431 plan (PLAN-431-v4 as folded), plan review round 1

Checked by: Cairn-Ground-P431

On the board working tree (~/Buildo-wt-board, head 79f79322f), the task-431 card as it stands after the fold, the description Files edit and `plan-prep post`. Read-only; every check ran in memory with node, the board's own `planHash` and `planGateErrors`.

(1) PASS. All 49 folded-quote strings of TRIAGE-PLAN.md are present in the card text, each 20 or more characters, none with a space as its 20th character. TRIAGE-PLAN.md has 60 outcome lines: 49 folded and 11 pile. Every CONFIRMED CRITICAL, HIGH and MED has a folded outcome.

(2) PASS. The plan text is the plan of PLAN-431-v4 with the 54 pairs of FOLD-431.json applied and the round block appended; nothing else is altered. The hash of the card equals the hash of the grounder's own in-memory simulation of that fold, so the folded body is the ruled text.

(3) PASS. The round block reads "Plan review round 1: 49 folded, 0 task, 0 ruling, 0 wontfix, 11 pile", equal to TRIAGE-PLAN.md. It holds 36 block lines (2 HIGH, 34 MED), each with a reference of exactly 20 characters and none ending in a space; the line `rg#2 MED folded the lock is the plan` carries no apostrophe. The 5 references (GROUNDER-PLAN.md, TRIAGE-PLAN.md and the three seat reports) are on the card.

(4) PASS. The Files lines are as ruled: the description's first Files line equals the plan's last Files line, and both carry src/tests/backlog/backlog-lane.logic.test.ts after rule-lists.logic.test.ts. The gate resolves 10 lists, the same as before, so no second plan round is owed.

(5) PASS. I ran `planGateErrors` on the tree as it is, with laneName BL-TBL431. It resolves 10 lists and rules 90 findings. The outcome, seat, reference, verdict and round-block checks raise nothing. With the Plan line appended it raises only FOLD-CHECK.md missing; without it, also the missing last Plan line in GROUNDER-PLAN.md. The hash from the checker's own `planHash` on this card is e4eead8762ff.

Verdict: PASS

Plan: task-431 sha256:e4eead8762ff
