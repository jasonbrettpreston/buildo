# Fold check: task-462 plan (PLAN-462-v1 as folded, round 1, with FOLD-462.json), final state

Checked by: Cairn-Ground-P462

On the board working tree (~/Buildo-wt-board, head dde49d6c9, branch wf2/board), I checked the task-462 card as it now stands. That is the uncommitted working copy, after the 22 pairs of FOLD-462.json, the post step (round block and 5 references), and the one replaced triage line with its one extra plan line. I read GROUNDER-PLAN.md, TRIAGE-PLAN.md and the lens outputs in docs/reports/reviews/task-462/ from the working tree. Read-only. Every check ran in memory with node and the board's own `planHash`, `parseVerdicts`, `seatLines`, `findingsIn` and `outcomeErrors` (scripts/hooks/check-lane-close.mjs, scripts/analysis/rule-lists.mjs). No file was written.

(1) PASS. Every pair landed as written. All 22 new texts are present in the card exactly once, all in the Implementation Plan. Of the 22 old texts, 19 are gone. The other 3 still occur once, each inside its own new text, because the new text is the old text plus an appended ruling sentence: "Recommend none: the CLAUDE.md line carries it.", "(RR-0392 spirit)." and "Recommend test:ci: the flag names exactly the thing turned off (no coverage), and it matches what CI runs." No old text stands on its own.

(2) PASS. I diffed the working card line by line against the committed card at HEAD with the 22 pairs applied. The only differences are:
- the front-matter updated_date;
- the references list: GROUNDER-PLAN.md, TRIAGE-PLAN.md and the three seat files, 5 lines under references;
- the round line, "Plan review round 1: 15 folded, 0 task, 0 ruling, 0 wontfix, 9 pile; grounder docs/reports/reviews/task-462/GROUNDER-PLAN.md; triage docs/reports/reviews/task-462/TRIAGE-PLAN.md";
- the MED lines: "plan-ux#2 MED folded stops only after the", "rg#1 MED folded task-461 is now fold", the old trimmed "rg#2 MED folded the station refuses" (kept, harmless), and the new extra plan line "rg#2 MED folded (the station refuses".

In TRIAGE-PLAN.md the one replaced line is now `rg#2 folded:"(the station refuses earlier, at :32)"`. Its quote is 37 characters, its 20th character is "s", and it is present in the card. Nothing else in the card changed.

(3) PASS. The Description section is byte-identical to HEAD. The Acceptance Criteria section, the four lines #1 to #4, is byte-identical to HEAD. The Files line is unchanged. The Definition of Done is untouched, including the shared-template DoD #8 cite of :988, left alone as ruled under rc#5.

(4) PASS. All 15 folded quotes of TRIAGE-PLAN.md are present in the card text after whitespace squash. The 9 pile lines carry reasons of 30 or more characters. `outcomeErrors` in plan mode over the 34 verdicts of GROUNDER-PLAN.md, the three Seat lines and the working TRIAGE-PLAN.md returns 0 errors for the 24 CONFIRMED ids. GROUNDER-PLAN.md holds 34 verdict lines, 24 CONFIRMED and 10 REJECTED.

(5) PASS. The round line equals the 15 folded and 9 pile outcome lines. All three MED ids have their line in the plan field: plan-ux#2, rg#1 and rg#2. The rg#2 line is stored in the form the gate wants, "rg#2 MED folded (the station refuses", with no trailing space.

(6) PASS. The scope of the fold is as ruled. No section marker line is inside any pair. No table key, switch or file is added. The two gate lines, the test edits, the CLAUDE.md line and the Spec 98 note are the texts of QUESTIONS-RULED.md matter (f). The plan states that the operating-model row (:305) is read and left. Operator questions: none.

Verdict: PASS

Plan: task-462 sha256:5579206d8168
