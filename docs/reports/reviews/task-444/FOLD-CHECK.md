# Fold check: task-444 plan (PLAN-444-v1 as folded), plan review round 1

Checked by: Cairn-Ground-P444

On the board working tree (~/Buildo-wt-board), the task-444 card as it stands after the fold and `plan-prep post`. Read-only; every check ran in memory.

(1) PASS. Every CONFIRMED CRITICAL, HIGH and MED id of TRIAGE-PLAN.md is present as folded text. The 9 folded-quote strings behind the 25 per-id lines were each found in the card text: it is written to fail on (b), task-436 landed 836b5722b, the opening of N1 to N3 equals its words, it gets one dated note in its own status cell, A note would make it no longer verbatim, the manual README command, the operator answers the push prompt, arm Q (queueCheck) before and after, and Each insert moves the later lines. The N3 bullet is present. The old texts are gone: "Answer y at the push prompt", "69a and packs/spec08.md (FACTS)." and the board head 693ef2a8a.

(2) PASS. Nothing else in the plan changed. The folded plan is 10,139 characters, as the coordinator reported. The 11,654 the checker reads includes the round block.

(3) PASS. The round block reads "Plan review round 1: 26 folded, 0 task, 0 ruling, 0 wontfix, 18 pile". That equals the 26 folded and 18 pile outcome lines of TRIAGE-PLAN.md. The 20 per-id lines present are exactly the lines the checker requires. The 5 references (GROUNDER-PLAN.md, TRIAGE-PLAN.md and the three seat reports) are on the card.

(4) PASS. The Files line is as ruled, with 69a added. The description line (the first one, which is the one the checker reads) ends `src/tests/spec-notes-1b.logic.test.ts, docs/specs/01-pipeline/69a_mcbylaw_register.md`. The plan's last line is the same four paths in a different order. Order matters to no check: the entries are split on commas into a set, I compared the two lines as sets and they are equal, and the lists they resolve are the same seven.

(5) PASS. I ran `planGateErrors` on the tree as it is, with the saved GROUNDER-PLAN.md, TRIAGE-PLAN.md and seat reports. It resolves 7 lists and rules 72 findings. It raises only the two refusals expected before this file exists: no last Plan line in GROUNDER-PLAN.md, and FOLD-CHECK.md missing. The outcome, seat, reference, verdict and round-block checks raise nothing. The hash from the checker's own `planHash` on this card is 2d130a6b6229.

Verdict: PASS

Plan: task-444 sha256:2d130a6b6229
