# Fold check: task-470 plan (PLAN-470-v1 as folded, round 1 with FOLD-470.json, round 2 with FOLD-R2-B and the RR-0514 wording pairs)

Checked by: Cairn-Ground-P470

Basis: ~/Buildo-wt-board, branch wf2/board, head 201c56f7e (the task file modified, the folder docs/reports/reviews/task-470 untracked, and one unrelated modified file, src/lib/surfaces/maxbld-web.ts, not on this card). Read-only. Everything ran in memory with node and the board's own functions: planHash, planGateErrors, outcomeErrors and parseVerdicts (scripts/hooks/check-lane-close.mjs:602, :614, :169, :133), readTable, findingsIn, ruledLine.

(1) PASS. The card as it stands.
- Every new text of the three folds is present: the 58 round-1 pairs, the round-2 set B (12 common pairs and 12 B pairs) and the 12 RR-0514 wording pairs. The triage quotes that rest on them were all found.
- None of the replaced old texts is left: narrow: true, "isTest from", oneClose, "348 plan findings".
- The two Files lines (Description and section 8) are identical. There is exactly one plan end marker.
- AC #1 and AC #2 read as the operator's answers say: PLAN_FOLD ships keeping MED folded (RR-0514, :2668), and the narrowed round 2 is deferred to task-414. AC #3 to #5 are unchanged.

(2) PASS. The round block on the card holds one round line and the outcome lines of every CONFIRMED CRITICAL, HIGH and MED id (49 lines): "Plan review round 1: 59 folded, 0 task, 3 ruling, 0 wontfix, 6 pile". outcomeErrors in plan mode with the real plan field and five seat files returns 0 errors for 68 CONFIRMED ids, and the gate sees one round line.

(3) PASS. The evidence folder.
- Files: context-r1.md, context-r2.md, FINDINGS-PLAN.md, the two plan lens outputs, r2-plan-error-paths.txt, five seat files, GROUNDER-PLAN.md, TRIAGE-PLAN.md, QUESTIONS-RULED.md.
- Ruled lines match the committed outputs: plan-error-paths.txt sha256:5b04f8461ef0 findings:6, and plan-plan-review-deepseek.txt sha256:470afa6eb57f findings:13.
- The five Seat lines match the seat files' sha: 46bed0d1dd4d, 58583d14b59a, 3acc59f5b64a, 327959ed930b, c965d95ab378.
- 73 verdict lines, every quote on its cited line at head (0 moved); 59 folded quotes, 0 missing from the card.
- The card's references hold the folder's GROUNDER-PLAN, TRIAGE-PLAN, five seat files and r2-plan-error-paths.txt.

(4) PASS. Type fix takes the lean branch (check-lane-close.mjs:660 needs at least one plan-<lens>.txt with a valid REVIEW header), so no compliance outputs are owed.

(5) PASS. planGateErrors run in memory returns exactly two errors, both the expected ones: no last `Plan:` line in GROUNDER-PLAN.md (expected `Plan: task-470 sha256:d7a658d07599`), and FOLD-CHECK.md missing (this file).

Verdict: PASS

Plan: task-470 sha256:d7a658d07599
