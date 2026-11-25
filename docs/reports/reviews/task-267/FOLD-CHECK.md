# Fold check: task-267 plan (PLAN-267-v2 as folded, round 1, FOLD-267.json and FOLD-267b.json)

Checked by: Cairn-Ground-P267

On the board working tree (~/Buildo-wt-board, head 73bb34ddf). I read the task-267 card as it now stands (77 pairs of FOLD-267.json and 8 pairs of FOLD-267b.json applied through the backlog CLI, round block appended, references added). I also read GROUNDER-PLAN.md, TRIAGE-PLAN.md, QUESTIONS-RULED.md, the three seat files, the 14 lens outputs with their inputs (plan-compliance-step-132 included) and the Files line. Everything was computed in memory with the repo's own functions (planHash, filesEntries, resolveTask, planGateErrors). I ran no test runner and wrote no file.

(1) PASS. All 77 pairs of FOLD-267.json and all 8 pairs of FOLD-267b.json are present once each in the card. None was lost or doubled. The 8 FOLD-267b.json texts are:
- the three-states placement sentence;
- the null-arm sentence;
- the round line at 126 folded;
- the 8 appended block lines;
- the section 8 heading;
- the section 8 bullet with RR-0497;
- the two phrases that mark Q-a and Q-e ruled.

(2) PASS. The card holds one round line, "Plan review round 1: 126 folded, 0 task, 0 ruling, 0 wontfix, 7 pile; grounder docs/reports/reviews/task-267/GROUNDER-PLAN.md; triage docs/reports/reviews/task-267/TRIAGE-PLAN.md". It holds 115 per-id outcome lines for the 115 CRITICAL, HIGH and MED ids. TRIAGE-PLAN.md holds 133 outcome lines (126 folded, 7 pile), equal to the 133 CONFIRMED verdicts. GROUNDER-PLAN.md holds 142 verdict lines: 133 CONFIRMED (1 CRITICAL, 41 HIGH, 73 MED, 16 LOW, 2 NIT) and 9 REJECTED, 0 CONFLICT. Its Counts and Totals lines say the same. All 126 folded quotes are present in the card text (0 missing).

(3) PASS. GROUNDER-PLAN.md holds 14 Ruled lines (the 13 earlier plus plan-compliance-step-132.txt sha256:02d36be2bf67 findings:8), the three Seat lines, and exactly one Plan line, which is the last line of the file. All 142 ids (111 lens, 31 seat) are ruled once. The card's references hold GROUNDER-PLAN.md, TRIAGE-PLAN.md, the three seat files and the added `compliance:step-132`.

(4) PASS. `filesEntries` returns the 45 entries of the Description's Files line. The two entries not on disk are the new files this lane creates (src/tests/surfaces/report-failure.logic.test.ts and mobile/__tests__/reportChecked.behaviour.test.tsx). The Files line resolves 9 lists (surface-136, mobile-90, mobile-98, mobile-99, eng-all, step-132, plan-protocol, inc-S, ms-S). Every one of the 9 has compliance evidence in the folder, and there is no unmatched path.

(5) PASS. RR-0497 (MD:2588) is folded: Q-a, Q-e and Q-g are ruled A in section 8, step 2 and O4, with the operator's verbatim words, and QUESTIONS-RULED.md carries the matching heading.

(6) PASS. The head name a4a092bad inside the fold text names the head at which the cited lines were re-read. It stays true, because after it only backlog and task-465 evidence docs moved. No pair is needed.

(7) PASS. `planGateErrors` on the card as it stands, with this file's text and the Plan line below in the folder, returns 0 errors for 9 lists and 142 findings.

Verdict: PASS

Plan: task-267 sha256:ebfaa33df204
