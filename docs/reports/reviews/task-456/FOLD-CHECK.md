# Fold check: task-456 plan (PLAN-456-v1 as folded, round 1, with FOLD-456.json), final state

Checked by: Cairn-Ground-P456

On the board working tree (~/Buildo-wt-board, head a6a3fcb6d, branch wf2/board) I checked the task-456 card as it now stands: the uncommitted working copy, after the 27 pairs of FOLD-456.json (applied by the fold tool) and the round block (appended through append-plan). I read GROUNDER-PLAN.md, TRIAGE-PLAN.md, QUESTIONS-RULED.md, the lens outputs and the seat reports in docs/reports/reviews/task-456/ from the working tree. Read-only. Every check ran in memory with node and the board's own planHash, parseVerdicts, seatLines, seatFindings, findingsIn, ruledLine, outcomeErrors and resolveTask (scripts/hooks/check-lane-close.mjs, scripts/analysis/rule-lists.mjs). No file was written.

(1) PASS. Twelve distinctive new fragments, spread over the pairs, were each counted in the task. Eleven occur once. The twelfth, "parcel-tool/[parcelId].tsx:34", occurs twice because two pairs (the facts row and the step 2 red) carry it. Thirteen old texts, including "smoke :68", "Check disk space first" and "Also a typed `StoredParcelRow` builder", count 0. The fold tool applied each pair once, all in the Implementation Plan.

(2) PASS. The Description and the Acceptance Criteria are byte-identical to HEAD, and so is the Files line (12 entries). The front matter now has `dependencies:` TASK-452 and TASK-454, as intended and outside the plan hash.

(3) PASS. The round block ends the plan field. The field holds exactly one line starting "Plan review round 1:" (26 folded, 0 task, 0 ruling, 0 wontfix, 1 pile), followed by the 17 outcome lines for the 2 HIGH and 15 MED ids, directly before the end marker.

(4) PASS. planHash of the task as it stands is fdbb4cffcabf, equal to the last line of GROUNDER-PLAN.md ("Plan: task-456 sha256:fdbb4cffcabf").

(5) PASS. My replica of the grounder-file checks (grounderErrors is not exported) on the saved GROUNDER-PLAN.md gives 0 errors on 45 ids (28 lens ids and 17 seat ids). This covers the 3 Ruled lines, the 3 Seat lines (all three files read), quote length and 20th character, quote on the cited line, distinct quotes, and reasons of 30 or more characters. outcomeErrors in plan mode on the saved TRIAGE-PLAN.md and the folded task gives 0 errors on 27 CONFIRMED ids. The round line it requires ("Review round 1: ...") and the 17 HIGH and MED lines are present in the plan field.

(6) PASS apart from the three items named for later. resolveTask on the folded task refused with "the task has no milestone". I ran it without the launch gate's milestone-letter argument, as in the 463 check, so it is not a defect of the card (front matter has milestone m-1). The plan-*.txt files are the three lens outputs, and the three seats (integration, reality-check, regression) are present. Left for later: FOLD-CHECK.md, the five references added by plan-prep, and the commit.

Verdict: PASS

Plan: task-456 sha256:fdbb4cffcabf
