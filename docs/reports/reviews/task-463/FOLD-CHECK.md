# Fold check: task-463 plan (PLAN-463-v1 as folded, round 1, with FOLD-463.json), final state

Checked by: Cairn-Ground-P463

On the board working tree (~/Buildo-wt-board, head 9de5c2129, branch wf2/board) I checked the task-463 card as it now stands: the uncommitted working copy, after pairs 1 to 13 of FOLD-463.json (applied by the fold tool) and the round block (pair 14, appended through append-plan because its marker line lies outside the plan field). I read GROUNDER-PLAN.md, TRIAGE-PLAN.md, QUESTIONS-RULED.md and the lens outputs and seat reports in docs/reports/reviews/task-463/ from the working tree. Read-only. Every check ran in memory with node and the board's own planHash, parseVerdicts, seatLines, seatFindings, findingsIn, outcomeErrors, resolveTask and planGateErrors (scripts/hooks/check-lane-close.mjs, scripts/analysis/rule-lists.mjs). No file was written.

(1) PASS. Every pair landed as written. The new texts of pairs 1 to 13 are each present exactly once, all in the Implementation Plan. None of the old texts remains: "Spec 98:120 |", the backticked npm run lint in the assertion and in the note, "(an estimate)", "today all three assertions", "I did not trace it", "paths I grepped", "did not confirm the file exists" and "The exact count delta" all count 0.

(2) PASS. The Description, the Acceptance Criteria and the Definition of Done are byte-identical to HEAD. The Files line of four entries is unchanged. The body grew from 122 to 133 lines, which is the pile bullet (1), the note sentence in step 3 (1), and the round block (9 lines with its blank line). The front matter holds only the id, title, status, labels, milestone m-1 and type fix.

(3) PASS. The round block sits at the end of the plan field, directly before the end marker, with one blank line before the round line. The checker only needs the round line to start a line ("Plan review round N:" at column 0) and the six outcome lines to be anywhere in the plan field; both hold. Text after the end marker is one newline.

(4) PASS. planHash of the task as it stands is 98673c9928c3, equal to the last line of GROUNDER-PLAN.md ("Plan: task-463 sha256:98673c9928c3").

(5) PASS. grounderErrors on the saved GROUNDER-PLAN.md gives 0 errors on 15 lens ids and 6 seat ids, with the 3 Seat lines, the 3 Ruled lines and the lane name BL-PLINT. outcomeErrors in plan mode on the saved TRIAGE-PLAN.md and the folded task gives 0 errors on 15 CONFIRMED ids. The round line it requires, "Review round 1: 11 folded, 0 task, 0 ruling, 0 wontfix, 4 pile; grounder ...; triage ...", and the 3 HIGH and 3 MED lines are all present in the plan field.

(6) PASS. The plan gate (planGateErrors, fix path) run on the folded task and the review folder gives 1 refusal: FOLD-CHECK.md missing, which this file ends. Its other checks hold. The plan-*.txt headers pass. The Files line resolves to mobile-90, mobile-98, mobile-99, surface-136, eng-all, plan-protocol, inc-S and ms-S. The Seat lines include the regression seat the Files line requires.

Verdict: PASS

Plan: task-463 sha256:98673c9928c3
