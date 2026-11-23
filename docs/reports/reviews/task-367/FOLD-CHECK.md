# Fold check: task-367 plan (PLAN-367-v1 as folded, round 1)

Checked by: Cairn-Check-P367

On the board working tree (~/Buildo-wt-board, head 985544697), the task-367 card after FOLD-367.json (33 pairs), `plan-prep post`, and FOLD-367-r1b.json (8 pairs, written from this checker's first run). Read-only; every check ran in memory with node, the board's own `planHash`, `filesEntries`, `resolveTask` and `planGateErrors`. GROUNDER-PLAN.md, TRIAGE-PLAN.md, QUESTIONS-RULED.md, context-r1.md and the three seat files in docs/reports/reviews/task-367/ are untracked at this head, so they were read from the working tree. My first run failed on four stale line cites and three small gaps; the 8 pairs of FOLD-367-r1b.json fix them, and this is the re-check.

(1) PASS. The 33 pairs of FOLD-367.json applied in order to the pre-fold plan (1da9f842d) give the committed plan up to the round block, character for character. Each `old` was found once; where `old` is a substring of `new` (pairs 1, 2, 24, 28, 33) the `new` text is present once. The only changes outside the plan section were updated_date and the 5 added references.

(2) PASS. GROUNDER-PLAN.md has 224 verdict lines (211 lens, 13 seat; 112 MED, 26 LOW, 3 NIT; no CRITICAL or HIGH after the grounder's re-rating of five CRIT findings to MED). Every CONFIRMED MED has a TRIAGE-PLAN.md outcome: 73 folded, 46 ruling, 22 pile. All 73 folded quotes are in the plan now. The 46 rulings are RR-0413 and each is an acceptance #1 or #3 finding that "yes to both" answers on questions A and B (MORNING-DECISIONS.md:2108-2111, decision-198 exists). All 22 piles are LOW or NIT.

(3) PASS. The two Files lines are identical (12 entries; the task file and docs/reports/reviews/ are always allowed). The Files line resolves 16 lists, exempt [], unmatched []. The MF id is MF-98 and the round is round-203; BL-FEDB442 holds MF-97 and round-202. FE rows owned text, the Spec 135 dated-note wording and both Q-D branches (counts 19 and 20, floor 18 and 19) are written. Acceptance items are commands with expected outputs. No step asks a lane to push, run the full suite, use the DB or check out.

(4) PASS. No unanswered operator ruling is assumed (FE-51 waits on Q-D). The scope stays tests for handbook rules plus the MF row, prereg and panel the arms require. wf1/inc1b-gates is untouched (a59c93ac4). No tool, hook or card is added.

(5) PASS. `planGateErrors` against the working-tree folder, with a Plan line and a FOLD-CHECK.md added in memory, resolves 16 lists, rules 224 findings and returns 0 errors. The stamped material of the lens inputs is compared with the committed context-r1.md, so the fold does not disturb it. The round block reads "Plan review round 1: 73 folded, 0 task, 46 ruling, 0 wontfix, 22 pile; grounder docs/reports/reviews/task-367/GROUNDER-PLAN.md; triage docs/reports/reviews/task-367/TRIAGE-PLAN.md" and equals TRIAGE-PLAN.md.

(6) PASS. About 70 cited lines were sampled at head. The corrected cites hold: register-locks-resolve.infra.test.ts :19, :30, :45-79 (check at :76), :21-29, and 137_mcqueue.md:98. Unchanged cites hold: 126:82, 136:178, :184, :193, 135:71, :73, :76, :80, the handbook-rule-map lines and the queue rows.

(7) Re-check of the 8 pairs of FOLD-367-r1b.json. The plan diff between 3ccf3bea3 and 985544697 is exactly those 8 pairs and nothing else; the gate returns 0 errors; the round block still matches TRIAGE-PLAN.md.

Not checked: cites beyond the sample; whether handbook-rule-map after line 290 stays green after the flip; whether another hook demands an Operator-Ruling trailer on commit 1.

Verdict: PASS

Plan: task-367 sha256:482f0a66212a
