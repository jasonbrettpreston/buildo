# Fold check: task-462 plan (PLAN-462-v1 as folded, round 1, with FOLD-462.json)

Checked by: Cairn-Ground-P462

On the board working tree (~/Buildo-wt-board, head dde49d6c9, branch wf2/board), I checked the task-462 card as it now stands. That is the uncommitted working copy, after the 22 pairs of FOLD-462.json and after the post step that added the round block and 5 references. I read GROUNDER-PLAN.md, TRIAGE-PLAN.md and the lens outputs in docs/reports/reviews/task-462/ from the working tree. Read-only. Every check ran in memory with node and the board's own `planHash`, `parseVerdicts`, `seatLines`, `findingsIn` and `outcomeErrors` (scripts/hooks/check-lane-close.mjs, scripts/analysis/rule-lists.mjs). No file was written.

(1) PASS. Every pair landed as written. All 22 new texts are present in the card exactly once, all in the Implementation Plan. Of the 22 old texts, 19 are gone. The other 3 still occur once, each inside its own new text, because the new text is the old text plus an appended ruling sentence:
- "Recommend none: the CLAUDE.md line carries it."
- "(RR-0392 spirit)."
- "Recommend test:ci: the flag names exactly the thing turned off (no coverage), and it matches what CI runs."

No old text stands on its own.

(2) PASS. I rebuilt the expected card by applying the 22 pairs to the committed card at HEAD, then diffed it line by line against the working copy. The only differences are:
- the front-matter updated_date, now '2026-11-24T19:06:00Z';
- the references list: GROUNDER-PLAN.md, TRIAGE-PLAN.md and the three seat files, 5 lines under references;
- the round line, "Plan review round 1: 15 folded, 0 task, 0 ruling, 0 wontfix, 9 pile; grounder docs/reports/reviews/task-462/GROUNDER-PLAN.md; triage docs/reports/reviews/task-462/TRIAGE-PLAN.md";
- the three MED lines: "plan-ux#2 MED folded stops only after the", "rg#1 MED folded task-461 is now fold" and "rg#2 MED folded the station refuses ".

Nothing expected is missing except the old updated_date line, which the post step replaced. Nothing else in the card changed.

(3) PASS. The Description section is byte-identical to HEAD. The Acceptance Criteria section, the four lines #1 to #4, is byte-identical to HEAD. The Files line is unchanged: ".husky/pre-push-checks.sh, src/tests/hooks-composition.infra.test.ts, CLAUDE.md, docs/specs/03-mobile/98_mobile_testing_protocol.md". The Definition of Done is untouched. That includes the shared-template DoD #8 cite of :988, left alone as ruled under rc#5.

(4) PASS. All 15 folded outcomes of TRIAGE-PLAN.md have their quote present in the card text after whitespace squash. The 9 pile lines carry reasons of 30 or more characters. `outcomeErrors` in plan mode over the 34 verdicts of GROUNDER-PLAN.md, the three Seat lines and TRIAGE-PLAN.md returns 0 errors for the 24 CONFIRMED ids. That is 15 folded and 9 pile, matching the round line.

(5) PASS. The round line on the card is "Plan review round 1: 15 folded, 0 task, 0 ruling, 0 wontfix, 9 pile". It equals the 15 folded and 9 pile outcome lines. The three MED lines are the ones I gave: plan-ux#2, rg#1 and rg#2, each MED folded, with the first 20 characters of its quote as the ref.

(6) PASS. The scope of the fold is as ruled. No section marker line is inside any pair. No table key, switch or file is added. The two gate lines, the test edits, the CLAUDE.md line and the Spec 98 note are the texts of QUESTIONS-RULED.md matter (f). The plan states that the operating-model row (:305) is read and left. Operator questions: none.

Verdict: PASS

Plan: task-462 sha256:60703971683d
