# Fold check: task-440 plan (PLAN-440-v1 as folded), plan review round 1

Checked by: Cairn-Ground-P440

On the board working tree (~/Buildo-wt-board, head 1397e3cb0), the task-440 card as it stands after FOLD-440.json (47 pairs), FOLD-440b.json (2 pairs) and `plan-prep post`. Read-only; every check ran in memory with node and the board's own parseVerdicts, seatLines and outcomeErrors.

(1) PASS. All 19 `folded:"..."` quotes of TRIAGE-PLAN.md are present in the card text. Each is 20 or more characters, and none has a space as its 20th character. TRIAGE-PLAN.md has 22 outcome lines: 19 folded and 3 pile. outcomeErrors in plan mode raises nothing for the 22 CONFIRMED ids, with the card's own round block as the summary text.

(2) PASS. The two failures of the earlier check are gone.
- Section 0, row E10 now cites `gate-mobile-compliance.infra.test.ts:4 (`, which is where "Report-only: nothing wires them." sits. The old `:3 (` form occurs 0 times.
- Section 3, group 2 status rule now reads "a wired check covers every bullet of the subsection that the lane compared" (1 occurrence). It agrees with the row being the subsection (section 3, section 5, Q3).
- Sections 0, 3, 4, 5, 8, 9 and 12 agree with each other as read in the earlier check, and the two pairs did not change that.

(3) PASS. The card holds two lines that start with `Files: `: line 30 (the description) and line 178 (the last line of the plan, section 8). Their text is identical (docs/reports/reviews/task-440/RULE-CHECKS.md, docs/reports/reviews/task-440/GROUNDER-LOOK.md). The first, in the description, governs. Nothing under Files changed.

(4) PASS. GROUNDER-PLAN.md as saved: 23 verdict lines parse. Every quote sits on its cited line, is 20 or more characters, and has a non-space 20th character. The three Seat lines verify against the committed seat files. The Implementation Plan holds one round block, "Plan review round 1: 19 folded, 0 task, 0 ruling, 0 wontfix, 3 pile", equal to TRIAGE-PLAN.md. The card's references hold GROUNDER-PLAN.md, TRIAGE-PLAN.md and the three seat reports.

(5) No Plan line. The launch gate (planGateInner in scripts/hooks/check-lane-close.mjs) returns no errors for any task whose type is not build or fix, and task-440 is a record task. I still find that true after reading it again, so neither GROUNDER-PLAN.md nor this file carries a `Plan:` line.

Verdict: PASS
