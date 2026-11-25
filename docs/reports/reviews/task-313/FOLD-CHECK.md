# Fold check: task-313 plan (PLAN-313-v1 as folded, round 1, with FOLD-313.json, the RR-0505 replacements, FOLD-313c.json, the rg#7 round-block line and the RR-0510 retitle)

Checked by: Cairn-Ground-P313

On the board working tree (~/Buildo-wt-board, head 6840aeb8f), the task-313 card as it stands: the 38 pairs of FOLD-313.json (applied), the two RR-0505 replacements (FP28 and FP31), the 9 pairs of FOLD-313c.json (RR-0506) and the line `rg#7 MED folded an existing leaf mod`, all applied, and the title now "MF-49 MaxBLD mobile app: the front door, inside the one Expo project (McApp card 1)" (RR-0510, decision-292, "yes, stale"). Basis also: RR-0509 (MORNING-DECISIONS.md:2646, "go back to just the icon with out the name."), under which the icon is the House Mark alone, so RR-0507 and RR-0508 do not apply and M9 and T10 stand as written; no plan text changed. GROUNDER-PLAN.md, TRIAGE-PLAN.md, QUESTIONS-RULED.md, the three seat files and the lens inputs and outputs in docs/reports/reviews/task-313/ were read in the working tree.

(1) PASS. Every folded quote of TRIAGE-PLAN.md is present in the card text (the gate checks each one). TRIAGE-PLAN.md has 90 outcome lines: 80 folded and 10 pile. GROUNDER-PLAN.md holds 129 verdict lines, 90 of them CONFIRMED (0 CRITICAL, 8 HIGH, 60 MED, 21 LOW, 1 NIT) and 39 REJECTED, no CONFLICT; the 90 CONFIRMED equal the 90 outcome lines.

(2) PASS. Each pair of FOLD-313.json, the two RR-0505 replacements and the 9 pairs of FOLD-313c.json are present once in the card, as the previous FOLD-CHECK recorded. The body text of the card is identical to the committed card (compared in memory); only the title and updated_date differ.

(3) PASS. The title change is the only difference. planHash covers the title and the body (check-lane-close.mjs:602-605), so the hash moved from 9b04500143c4 to 6b1f19ade2c2. The Description's line 44 ("Full title: ... a separate Expo project in a monorepo") and line 48 (the queue row as quoted) are historical text; line 44 is flagged to the orchestrator as an optional pair and is not a gate matter.

(4) PASS. The card holds one round line, "Plan review round 1: 80 folded, 0 task, 0 ruling, 0 wontfix, 10 pile; grounder docs/reports/reviews/task-313/GROUNDER-PLAN.md; triage docs/reports/reviews/task-313/TRIAGE-PLAN.md", equal to TRIAGE-PLAN.md, with the 68 outcome lines (the rg#7 line is present once).

(5) PASS. `filesText` reads the card's first `Files:` line, which is the plan's line. `filesEntries` returns 63 entries: 49 tracked paths and 14 new files the build creates. The Files line attaches 9 lists, with the compliance outputs in the folder: surface-136, mobile-90, mobile-98, mobile-99 (p1 and p2), eng-all, step-132, plan-protocol, inc-1-2 and ms-1-2. Each has its plan output and in- input, and no gap is named.

(6) PASS. `planGateErrors` for lane BL-MCAPP313 on the card as it stands, with the working-tree folder, this file and the Plan line below added in memory, resolves 9 lists, rules 129 findings and returns 0 errors.

Verdict: PASS

Plan: task-313 sha256:6b1f19ade2c2
