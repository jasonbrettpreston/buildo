# Fold check: task-267 plan (PLAN-267-v2 as folded, round 1, FOLD-267.json, FOLD-267b.json and FOLD-267e.json)

Checked by: Cairn-Ground-P267

On the board working tree (~/Buildo-wt-board, head 88d96104e, the task-465 fold). I read the task-267 card as it now stands, GROUNDER-PLAN.md, TRIAGE-PLAN.md, QUESTIONS-RULED.md, the three seat files and the 14 lens outputs with their inputs, including the re-run plan-compliance-mobile-99-p1 and plan-compliance-step-132. Everything was computed in memory with the repo's own functions (planHash, filesEntries, resolveTask, planGateErrors). I ran no test runner and wrote no file.

(1) PASS. The pairs are present once each.
- FOLD-267.json has 77 pairs. 71 of them are in the card with their original new text exactly once. The other 6 (the O4 line, the step 2 flag line, step 7, the section 8 heading, the section 8 bullet and the doc-16 note) were rewritten by later pairs, FOLD-267b.json (RR-0497, Q-a, Q-e and Q-g ruled A) and FOLD-267e.json. Their later texts are in the card exactly once, and none of the 6 original texts is lost or doubled.
- FOLD-267e.json: all 8 new texts are present once (the :858 sentence, the doc-16 note with its 35 s maximum, the "task-465 has landed" heading, the round line at 129 folded, and the four p1 block lines). The old round line at 126 folded and the old p1#3 block line are gone.

(2) PASS. The card holds one round line: "Plan review round 1: 129 folded, 0 task, 0 ruling, 0 wontfix, 7 pile; grounder docs/reports/reviews/task-267/GROUNDER-PLAN.md; triage docs/reports/reviews/task-267/TRIAGE-PLAN.md". The plan holds 118 per-id outcome lines for CRITICAL, HIGH and MED. They are exactly the 118 CONFIRMED CRITICAL, HIGH and MED verdict ids, the same set with none missing or extra. TRIAGE-PLAN.md holds 136 outcome lines (129 folded, 7 pile), equal to the 136 CONFIRMED verdicts. GROUNDER-PLAN.md holds 146 verdict lines: 136 CONFIRMED (1 CRITICAL, 40 HIGH, 77 MED, 16 LOW, 2 NIT), 10 REJECTED, 0 CONFLICT. All 129 folded quotes are present in the card text (0 missing).

(3) PASS. GROUNDER-PLAN.md holds 14 Ruled lines, and every one is equal to what `rule-lists.mjs findings` prints. That includes the re-run `plan-compliance-mobile-99-p1.txt sha256:c77992838f7d findings:8` and `plan-compliance-step-132.txt sha256:02d36be2bf67 findings:8`. It holds the three Seat lines and every one of the 146 ids ruled once. The card's references hold GROUNDER-PLAN.md, TRIAGE-PLAN.md and the three seat files (5 entries for this folder).

(4) PASS. `filesEntries` returns the 45 entries of the Description's Files line. The Files line resolves 9 lists, including `mobile-99` and `step-132`. The mobile-99 check is clean: the p1 input was re-run on the current Spec 99 and the `planGateErrors` run raises no mobile-99 refusal. The two entries not on disk are the new files this lane creates.

(5) PASS. Every verdict quote is on its cited line at head 88d96104e (the check that found the six cites moved by the 465 fold). The one plan sentence that cited a moved line, `surface-conformance.logic.test.ts:857`, now reads :858.

(6) PASS. `planGateErrors` for lane BL-MCFIX267, with the working-tree folder, the Plan line as the last line of GROUNDER-PLAN.md and this file as FOLD-CHECK.md, returns 0 errors for 9 lists and 146 findings.

Verdict: PASS

Plan: task-267 sha256:76a143c95d8d
