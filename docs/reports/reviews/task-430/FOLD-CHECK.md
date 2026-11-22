# Fold check: task-430

Checked by: Cairn-Ground-P430
Verdict: PASS

Method, run in memory on the card as it stands in the working tree, nothing written:
- Round 1: all 34 pairs of FOLD-430.json. Each NEW is present exactly once in the card's plan, except the section 16/17 pair. That one cannot match as a whole, because round 2 rewrote two sentences inside it (the Full cell template in 17.2 and the 17.1 bullet).
- Round 2: both pairs of FOLD-430-R2.json. Each NEW is present exactly once.
- Whole-plan reversal: I replaced every NEW by its OLD, round 2 first and then round 1, in reverse order. All 36 pairs reversed. The result equals PLAN-430-v1-card.md line for line (167 lines), followed only by the appended round block.
- Round block: after the reversal, the extra text is the one line "Plan review round 1: 134 folded, 0 task, 7 ruling, 0 wontfix, 10 pile; ..." and 92 outcome lines (80 round-1 MED/HIGH, 12 round-2 MED/HIGH, 0 CRITICAL). The earlier round block was removed and re-posted without losing any plan text.
- Launch check: planGateErrors run in memory on the working tree (16 lists, 196 findings) names only the missing "Plan:" line in GROUNDER-PLAN.md and the missing FOLD-CHECK.md; both are supplied by this file and by the Plan line below.
- Hand-added verdict plan-compliance-policy-124-s2-s5-p3#4 raises no form error: the quote is on its cited line and unique, and the reason is over 30 characters.
- Outcomes: outcomeErrors in plan mode returned 0 errors on 151 ids in the earlier run, before the round block was re-posted; the in-memory gate just now showed no outcome error.
- No change is needed. Appending this file and the Plan line to GROUNDER-PLAN.md does not change the Plan hash, which covers only the task title and body.

Plan: task-430 sha256:e09a2898de25
