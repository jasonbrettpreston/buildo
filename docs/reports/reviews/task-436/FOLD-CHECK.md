# Fold check: task-436 plan (PLAN-436-v1 as folded), plan review round 1

Checked by: Cairn-Ground-P436

On the board working tree, uncommitted: the fold, the plan-prep block and docs/reports/reviews/task-436/ are not yet committed. Read-only; every check ran in memory.

(1) PASS. The pre-fold plan is ~/Buildo-scratch/lanes-20261119/inc1b/final436-437/PLAN-436-v1.md. Each of the 9 pairs of FOLD-436.json has its OLD exactly once in it (0 misses). Applying the 9 pairs to it gives the Implementation Plan field head of the card, whitespace squashed (8262 characters on both sides). Reversing the 9 NEW texts in the card head gives the pre-fold plan again (equal). Every NEW is present in the card. Eight OLD texts are gone. The OLD of pair 2 is still present only because it is the first half of its NEW text, which extends it. The FOLD-436.json file is not on disk, so I rebuilt the 9 pairs from my own report.

(2) PASS. The card holds one round line: "Plan review round 1: 12 folded, 0 task, 0 ruling, 0 wontfix, 12 pile", with the grounder and triage paths. This matches TRIAGE-PLAN.md (12 folded, 12 pile). The Files line is unchanged.

(3) PASS. I ran the launch check, `planGateErrors`, on the working tree with the card as it is now. It resolves 9 lists and rules 80 findings. The only refusals are the missing last Plan line in GROUNDER-PLAN.md and the missing FOLD-CHECK.md, which this file supplies. The outcome, seat, reference and verdict checks raise nothing.

Verdict: PASS

Plan: task-436 sha256:4b12856c3bf9
