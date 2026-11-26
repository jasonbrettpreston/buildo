# Fold check: task-313 plan (PLAN-313-v1 as folded, round 1, after the 2026-11-26 re-grounding: cites re-read at board head 31d001c2c, Spec 99 compliance outputs re-made at 1999cc0d6)

Checked by: Cairn-Ground-P313b

On the board (~/Buildo-wt-board, head 1999cc0d6, branch wf2/board), the task-313 card as it stands after the re-grounding pass: the 13 cite pairs (route, hook, persist filter, search page, nav lock, surface-conformance and admin-media line numbers; one reason sentence on the useParcelLookup.ts comment), the 4 mobile-99 outcome lines that replace the former 11, and the round line, all applied. Basis: tasks 465, 469 and 267 landed after the first grounding and moved cited lines; the card's design, its Files line and its named functions were not changed by them (REPORT_GIVE_UP_MS is exported at useParcelLookup.ts:129; 105 goldens and 442 strings are the head counts T9 already states). GROUNDER-PLAN.md, TRIAGE-PLAN.md, QUESTIONS-RULED.md, the three seat files and the lens inputs and outputs in docs/reports/reviews/task-313/ were read at the board head, with GROUNDER-PLAN.md and TRIAGE-PLAN.md as re-written in memory.

(1) PASS. Every folded quote of TRIAGE-PLAN.md is present in the card text (the gate checks each one). TRIAGE-PLAN.md has 83 outcome lines: 73 folded and 10 pile. GROUNDER-PLAN.md holds 125 verdict lines, 83 of them CONFIRMED (0 CRITICAL, 6 HIGH, 55 MED, 21 LOW, 1 NIT) and 42 REJECTED, no CONFLICT; the 83 CONFIRMED equal the 83 outcome lines. The 12 new Spec 99 ids (p1#1 to #5, p2#1 to #7) are each ruled once; 4 are CONFIRMED MED (HIGH overstated on three), none CRITICAL or HIGH, 8 REJECTED.

(2) PASS. Each of the 13 cite pairs, the block of 11 old mobile-99 outcome lines (replaced by 4) and the round line occurs exactly once in the card's Implementation Plan and was applied once; the old text of the pairs is gone. The only differences from the committed card are those pairs.

(3) PASS. planHash covers the title and the body (check-lane-close.mjs:602-605), so the hash moved from 6b1f19ade2c2 to the Plan line below. The 13 cite pairs change line numbers and one reason sentence only; no scope, step, test name or Files entry changed.

(4) PASS. The card holds one round line, "Plan review round 1: 73 folded, 0 task, 0 ruling, 0 wontfix, 10 pile; grounder docs/reports/reviews/task-313/GROUNDER-PLAN.md; triage docs/reports/reviews/task-313/TRIAGE-PLAN.md", equal to the one the gate computes from TRIAGE-PLAN.md, with the 61 outcome lines (62 required lines with the round line, none missing).

(5) PASS. `filesText` reads the card's first `Files:` line. `filesEntries` returns 63 entries: 49 tracked paths and 14 new files the build creates, as before. The Files line attaches 9 lists, each with its plan output and in- input: surface-136, mobile-90, mobile-98, mobile-99 (p1 and p2, re-made on the current Spec 99: the committed inputs carry the whole list), eng-all, step-132, plan-protocol, inc-1-2 and ms-1-2.

(6) PASS. `planGateErrors` for lane BL-MCAPP313 on the card as it stands, with the committed folder, the re-written GROUNDER-PLAN.md and TRIAGE-PLAN.md, this file and the Plan line below put in memory, resolves 9 lists, rules 125 findings and returns 0 errors. Run with the board's check-lane-close.mjs; the same call with task-470's check-lane-close.mjs (tip abec24a96, not folded) gives the same result.

Verdict: PASS

Plan: task-313 sha256:033a86f05613
