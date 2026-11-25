# Fold check: task-465 (PLAN-465-v1), round 1 plus the O8 and refine addendum
Checked by: Cairn-Ground-P465
Lane: BL-MCFIX465
Read: the card in the working tree of ~/Buildo-wt-board and docs/reports/reviews/task-465/.

Round 1 fold (kept from the first check; re-verified)
- All 93 pairs of FOLD-465.json are present exactly once; no `old` text is left, and none is doubled or lost. The Files pair is in the Description, and `Files:` occurs once.
- The card holds one round line, `Plan review round 1: 41 folded, 0 task, 0 ruling, 0 wontfix, 1 pile; grounder docs/reports/reviews/task-465/GROUNDER-PLAN.md; triage docs/reports/reviews/task-465/TRIAGE-PLAN.md`, followed by 28 HIGH/MED outcome lines. The counts match GROUNDER-PLAN.md and TRIAGE-PLAN.md (42 CONFIRMED: 3 HIGH, 25 MED, 13 LOW, 1 NIT; 13 REJECTED; 55 ids).
- The Files line has 35 entries. It resolves with no unmatched path, and the lists are mobile-90, mobile-98, mobile-99, surface-136, eng-all, step-132, plan-protocol, inc-S and ms-S. The addendum adds no Files path.
- `rule-lists.mjs findings` prints the three Ruled lines (sha256:fddcef965c28 findings:7, sha256:2362a3dc0a1d findings:12, sha256:08d8b9b287e8 findings:8), as GROUNDER-PLAN.md holds them. `rule-lists.mjs check-tasks` prints nothing for task-465.

Addendum (the lane's state-name and refine question)
- The four plan pairs are each present once in the card. They cover the step 9 state bullet (`partial` with golden `suggest`), the O8 line (no new state name), the 3(b) refine sentence (it shows while typing, `list.hint` after Enter only), and T12 (the same rows with refine while typing).
- No `old` text of those four remains. The old O8 line "suggest only" is gone from the card.
- The pair for QUESTIONS-RULED.md is applied: the O8 entry now reads "RULED: no new state name"; "RULED: suggest only" no longer occurs.
- No finding id changed, so GROUNDER-PLAN.md, TRIAGE-PLAN.md and the round block need no new lines. The round line and its 28 outcome lines are unchanged.
- `planHash` of the card as it stands is sha256:e55d31dbf803. The last `Plan:` line of GROUNDER-PLAN.md and of this file is the same, and equals the orchestrator's value.
- The earlier statements about task-267 and RR-0490/RR-0491 still hold.

Verdict: PASS

Plan: task-465 sha256:e55d31dbf803
