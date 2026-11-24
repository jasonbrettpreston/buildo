# Fold check: task-457 plan (PLAN-457-v1 as folded, round 1, with FOLD-457.json), final state

Checked by: Cairn-Ground-P457

On the board working tree (~/Buildo-wt-board, head 72c5969bf, branch wf2/board) I checked the task-457 card as it now stands. That is the uncommitted working copy, after the 11 pairs of FOLD-457.json and the post step (round block, the two MED plan lines and 5 references). I read GROUNDER-PLAN.md, TRIAGE-PLAN.md, QUESTIONS-RULED.md and the lens and seat files in docs/reports/reviews/task-457/ from the working tree. Read-only. Every check ran in memory with node and the board's own `planHash`, `parseVerdicts`, `seatLines`, `seatFindings`, `findingsIn`, `ruledLine`, `lensKindOf` and `outcomeErrors` (scripts/hooks/check-lane-close.mjs, scripts/analysis/rule-lists.mjs). No file was written.

(1) PASS. Every pair landed as written. I read git diff HEAD of the card line by line. All 11 new texts are in the Implementation Plan, each once:
- The rare-case bullet (rc#1), after the "no data with an id" bullet.
- The lot-map Limits bullet (rg#1), after "- Phone only.".
- The choice 1, choice 2 and choice 3 rulings.
- The limit-length ruling after candidate (a).
- The doc comment with the zero-second sentence and "Once is the ruling and not a setting" (rg#2, rg#4).
- The "While online" clause (rg#5).
- The two cite fixes: MD:2358 and the full error-mapping and route paths (in#2, rc#4).
- The search-only wording of choice 2 (a).

The old texts are gone. Where a new text starts with its old text (the three Ruled additions and the candidate (a) ruling), the old text occurs once inside the new text, as intended.

(2) PASS. The diff against HEAD holds only these changes:
- The front-matter updated_date.
- The references list: GROUNDER-PLAN.md, TRIAGE-PLAN.md and the three seat files, 5 lines.
- The 11 plan edits.
- The round line: "Plan review round 1: 7 folded, 0 task, 0 ruling, 0 wontfix, 10 pile; grounder docs/reports/reviews/task-457/GROUNDER-PLAN.md; triage docs/reports/reviews/task-457/TRIAGE-PLAN.md".
- The two MED lines: "rc#1 MED folded This is a rare case," and "rg#1 MED folded useParcelSearch serv". Neither has a trailing space.

(3) PASS. The Description section, the Acceptance Criteria (#1 and #2), the Definition of Done and the Files line show no diff line, so they are byte-identical to HEAD. The Files line is not changed (QUESTIONS-RULED.md: no file outside it is needed).

(4) PASS. I ran the full checker on the final GROUNDER-PLAN.md and TRIAGE-PLAN.md text against the card as it stands:
- 34 of 34 ids have a verdict: 17 CONFIRMED and 17 REJECTED, 0 CONFLICT.
- The 3 Ruled lines match the committed lens files, and the 3 Seat lines match the seat file bytes.
- `outcomeErrors` in plan mode returns 0 errors for the 17 CONFIRMED ids.
- Every quote:
  - is on its cited line at the working tree;
  - is 20 or more characters with a 20th character that is not a space;
  - holds no asterisk, backtick, double quote or backslash;
  - differs from every other quote.
- No cited line is used more than 3 times (the most used is semi-question.tsx:79, 3 times).
- All 7 folded quotes of TRIAGE-PLAN.md are present in the card text after whitespace squash. The 10 pile lines carry reasons of 30 or more characters.
- The earlier full run had flagged two 20th-character-space quotes (plan-error-paths#5 and in#3); both are corrected in the files as they stand.

(5) PASS. The round line equals the 7 folded and 10 pile outcome lines. Both CONFIRMED MED ids have their plan line, rc#1 and rg#1, in the form the gate wants.

(6) PASS. The scope of the fold is as ruled. No section marker line is inside any pair. No setting, content key, descriptor text or file is added. The limit is SEMI_CONTINUE_WAIT_MS (60000), the zero retry covers the one search hook (the search page and the lot-map pick step), and no spec note is added. Operator questions: none.

Verdict: PASS

Plan: task-457 sha256:83394d2beeca
