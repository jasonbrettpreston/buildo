# Fold check: task-445 plan (PLAN-445-v1 as folded), plan review round 1

Checked by: Cairn-Ground-P445

On the board working tree (~/Buildo-wt-board, head 3d9dcf81a), the task-445 card as it stands after the fold and `plan-prep post`. Read-only; every check ran in memory with node, the board's own `planHash` and `planGateErrors`.

(1) PASS. All 46 folded-quote strings of TRIAGE-PLAN.md are present in the card text, each 20 or more characters, none with a space as its 20th character. TRIAGE-PLAN.md has 52 outcome lines: 46 folded and 6 pile. Every CONFIRMED CRITICAL, HIGH and MED has a folded outcome.

(2) PASS. The plan text is the plan of PLAN-445-v1 (card at 6b3fc4ddf) with the 38 pairs of FOLD-445.json applied and the round block appended; nothing else is altered (plan minus round block equals original plus fold, 18,406 characters; the rest of the card equals the 6b3fc4ddf card apart from the references, updated_date and the round block).

(3) PASS. The round block reads "Plan review round 1: 46 folded, 0 task, 0 ruling, 0 wontfix, 6 pile", equal to TRIAGE-PLAN.md. It holds 23 block lines (11 HIGH, 12 MED), each with a reference of exactly 20 characters and none ending in a space. The 5 references (GROUNDER-PLAN.md, TRIAGE-PLAN.md and the three seat reports) are on the card.

(4) PASS. The Files lines are as ruled: the description's first Files line equals the plan's last Files line, and no Files entry changed. The gate resolves 9 lists, the same as before, so no second plan round is owed.

(5) PASS. I ran `planGateErrors` on the tree as it is, with laneName BL-SEC445. It resolves 9 lists and rules 69 findings. The outcome, seat, reference, verdict and round-block checks raise nothing. With the Plan line appended it raises only FOLD-CHECK.md missing; without it, also the missing last Plan line in GROUNDER-PLAN.md. The hash from the checker's own `planHash` on this card is efef2cb5a1dc.

Verdict: PASS

Plan: task-445 sha256:efef2cb5a1dc
