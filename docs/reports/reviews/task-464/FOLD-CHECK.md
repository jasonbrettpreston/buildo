# Fold check: task-464 plan (PLAN-464-v1 as folded, round 1, with FOLD-464.json), final state

Checked by: Cairn-Ground-P464

On the board working tree (~/Buildo-wt-board, head 62dc1206e, branch wf2/board) I checked the task-464 card as it now stands: the uncommitted working copy, after the 24 pairs of FOLD-464.json and the round block of ROUND-BLOCK.txt. I read GROUNDER-PLAN.md, TRIAGE-PLAN.md, QUESTIONS-RULED.md, the two plan lens outputs and the three seat reports from docs/reports/reviews/task-464/. Read-only. Every check ran in memory with node and the board's own planHash and planGateErrors (scripts/hooks/check-lane-close.mjs) and readTable (scripts/analysis/rule-lists.mjs). No file was written.

(1) PASS. All 16 folded quotes of TRIAGE-PLAN.md are present in the task text (0 missing).

(2) PASS. The Acceptance Criteria are byte-identical to HEAD. The Description differs from HEAD in exactly one line (the census sentence, 9 to 11 of them .mjs, as folded). The Files line is identical to HEAD (three entries). The front matter differs only in updated_date.

(3) PASS. The plan field holds exactly one line starting "Plan review round 1:" (16 folded, 0 task, 0 ruling, 0 wontfix, 0 pile). The round block is 6 lines: the round line plus 5 outcome lines for the 5 MED ids (error-paths#1, deepseek#1, in#1, rc#1, rg#1). It ends the plan field, directly before the end marker.

(4) PASS. planHash of the task as it stands is f2043b74501b, equal to the last Plan line of GROUNDER-PLAN.md.

(5) PASS. planGateErrors on the working-tree task text, the saved GROUNDER-PLAN.md and TRIAGE-PLAN.md, the lens outputs, the seat files and a stand-in FOLD-CHECK.md (on the table with the glob added) gives 22 findings, 6 lists, and no grounder, Ruled, Seat, quote, reason or outcome error. The Ruled lines match `rule-lists.mjs findings --dir` (63d24ee107b6 findings:3 and 6fd143588325 findings:8). The Seat sha values match the seat files.

(6) PASS apart from the items named for later. The only errors planGateErrors still returns are the five missing references (GROUNDER-PLAN.md, TRIAGE-PLAN.md and the three seat files). The folder holds the two plan lens outputs, context-r1.md, FINDINGS-PLAN.md, the three seat reports, GROUNDER-PLAN.md, TRIAGE-PLAN.md and QUESTIONS-RULED.md. Left for later: FOLD-CHECK.md in the repo (this text), the five references, and the commit.

Verdict: PASS

Plan: task-464 sha256:f2043b74501b
