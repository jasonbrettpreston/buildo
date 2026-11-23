# Fold check: task-439 plan (PLAN-439-v1 as folded), plan review round 1, re-checked after task-446 landed on the board

Checked by: Cairn-Ground-P439 (second instance, RR-0385 item 1)

On the board working tree (~/Buildo-wt-board, head 531db4a42), the task-439 card as it stands after the four pairs of FOLD-439-r2.json and the orchestrator's dated note of 2026-11-23. Read-only; every check ran in memory with node, the board's own `planHash` and `planGateErrors`.

(1) PASS. All 59 folded-quote strings of TRIAGE-PLAN.md are present in the card text, each 20 or more characters, none with a space as its 20th character. TRIAGE-PLAN.md is unchanged: 64 outcome lines, 59 folded and 5 pile. Every CONFIRMED MED has a folded outcome (no CONFIRMED CRITICAL or HIGH). The four pairs touch no folded quote.

(2) PASS. The card text is PLAN-439-v1 as folded (previous hash 96f4809e90ac) plus the orchestrator's dated note (hash 2c3e7714d950) plus the four pairs of FOLD-439-r2.json, each old text present exactly once. Each pair makes a statement true at the board head after task-446 (2fe7fa150) and task-445 (729e2f023) landed: the 136:28 quote is dated, the task-390 R-22 loss is struck (fe.58 holds R-22), and the check-tasks counts are not pinned. No plan figure with a date label was touched. The round block and the Files lines are unchanged.

(3) PASS. The round block reads "Plan review round 1: 59 folded, 0 task, 0 ruling, 0 wontfix, 5 pile", equal to TRIAGE-PLAN.md, with its 27 block lines and the 5 references on the card.

(4) PASS. The Files lines are unchanged, and the gate still resolves 10 lists. The table edit the plan makes still validates in memory: surfaces and mobile lose the four surface specs, and the web kind page reads 11 lists and 226,854 characters, the phone kind page 12 lists and 307,917, since Spec 136 section 2 is now 29,076 characters (the plan's 226,468 and 307,531 are dated at abaee3190 and are not pins).

(5) PASS. The two grounder lines whose cite moved were corrected one for one: plan-compliance-agents-s7-s11#3 (08_agents.md :366 became :368 when task-445 added its note) and plan-plan-review-deepseek#7 (136:28 now reads 58 in force, 22 OWED). I ran `planGateErrors` on the card with the pairs applied, with laneName BL-SURF439, with the two corrected lines and the new Plan line in GROUNDER-PLAN.md and in this file: 0 errors, 10 lists, 86 findings. The hash from the checker's own `planHash` is 00e81f707afc.

Verdict: PASS

Plan: task-439 sha256:00e81f707afc
