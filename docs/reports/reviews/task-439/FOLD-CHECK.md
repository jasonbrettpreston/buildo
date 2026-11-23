# Fold check: task-439 plan (PLAN-439-v1 as folded), plan review round 1

Checked by: Cairn-Ground-P439

On the board working tree (~/Buildo-wt-board, head 4e15ed777), the task-439 card as it stands after the fold and `plan-prep post`. Read-only; every check ran in memory with node, the board's own `planHash` and `planGateErrors`.

(1) PASS. All 59 folded-quote strings of TRIAGE-PLAN.md are present in the card text, each 20 or more characters, none with a space as its 20th character. TRIAGE-PLAN.md has 64 outcome lines: 59 folded and 5 pile. Every CONFIRMED MED has a folded outcome (there is no CONFIRMED CRITICAL or HIGH).

(2) PASS. The plan text is the plan of PLAN-439-v1 (card at abaee3190, 15,434 characters) with the 24 pairs of FOLD-439.json applied and the round block appended. I could not replay the pairs here, because FOLD-439.json is not saved in the review folder. I proved it by the hash instead. The card's `planHash` is the one I computed in memory before the fold was applied (96f4809e90ac, which covers the title and the whole body including the round block), so the body is byte-identical to the grounder's folded text. The plan minus the round block is 18,918 characters. The diff against the abaee3190 card shows only the plan field, updated_date and the 5 added references.

(3) PASS. The round block reads "Plan review round 1: 59 folded, 0 task, 0 ruling, 0 wontfix, 5 pile", equal to TRIAGE-PLAN.md. It holds 27 block lines (all MED), each with a reference of exactly 20 characters and none ending in a space. The 5 references (GROUNDER-PLAN.md, TRIAGE-PLAN.md and the three seat reports) are on the card.

(4) PASS. The Files lines are as ruled: the description's first Files line equals the plan's last Files line, and no Files entry changed. The gate resolves 10 lists, the same as before, so no second plan round is owed.

(5) PASS. I ran `planGateErrors` on the tree as it is, with laneName BL-SURF439. It resolves 10 lists and rules 86 findings. The outcome, seat, reference, verdict and round-block checks raise nothing. With the Plan line appended it raises only FOLD-CHECK.md missing; without it, also the missing last Plan line in GROUNDER-PLAN.md. The hash from the checker's own `planHash` on this card is 96f4809e90ac.

Verdict: PASS

Plan: task-439 sha256:96f4809e90ac
