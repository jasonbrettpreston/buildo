# Fold check: task-437 plan (PLAN-437-v1 as folded), plan review round 1

Checked by: Cairn-Ground-P437

On the board working tree (~/Buildo-wt-board), uncommitted: the fold, the plan-prep post block and docs/reports/reviews/task-437/ are not yet committed. Read-only; every check ran in memory.

(1) PASS. The pre-fold plan is the Implementation Plan field of the card at git HEAD. Each of the 16 pairs of FOLD-437.json (the file in ~/Buildo-scratch/lanes-20261119/inc1b/final436-437/) has its OLD exactly once in it (0 misses). Applying the 16 pairs to it gives the plan head on the card, whitespace squashed (11,062 characters on both sides; the card field is 11,079 with the round block). Everything after the plan head is the round block that post added. Outside the plan field the card differs from HEAD only by `updated_date` and the 5 new `references` lines (GROUNDER-PLAN.md, TRIAGE-PLAN.md and the three seat reports). The title and description are unchanged.

(2) PASS. Every CONFIRMED CRITICAL, HIGH and MED of TRIAGE-PLAN.md is present as folded text. There are 42 `folded:` lines (1 HIGH, 41 MED) and 0 of their quotes are missing from the task text. The plan changes only through those 16 pairs, so nothing else in the plan changed. The 16 LOW and NIT lines are `pile:` and none was folded, as RR-0385 round 1 asks.

(3) PASS. The card holds one round line: "Plan review round 1: 42 folded, 0 task, 0 ruling, 0 wontfix, 16 pile", with the grounder and triage paths. It matches TRIAGE-PLAN.md (58 outcome lines: 42 folded, 16 pile) and carries one `<id> MED|HIGH folded <quote start>` line per folded id.

(4) PASS. The Files line is unchanged. The card Files line and the plan's own last Files line both equal HEAD. The page `docs/reports/generated/rule-lists-by-kind.md` is added by the lane in its own commit, as the plan's LANDING sentence says.

(5) PASS. I ran the launch check, `planGateErrors`, on the working tree with the card as it is now. It resolves 9 lists and rules 89 findings. The only refusals are the missing last Plan line in GROUNDER-PLAN.md and the missing FOLD-CHECK.md, which this file supplies. The outcome, seat, reference, verdict and round-block checks raise nothing. The hash from the checker's own `planHash` on the card as it stands is 23474c52521a. The Plan line below is the one the gate expects.

Verdict: PASS

Plan: task-437 sha256:23474c52521a
