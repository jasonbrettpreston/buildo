# Fold check: task-432 plan (PLAN-432-v1 as folded), plan review round 1

Checked by: Cairn-Ground-P432

On the board at HEAD 4cc849f5c (board edits only since 202123397: the diff to 202123397 holds 4 backlog files, no script, spec or test); the task file edits of the fold and the plan-prep post are uncommitted backlog edits in the working tree of ~/Buildo-wt-board, 2026-11-22. Read-only; nothing in the repo edited.

(1) PASS. The card's Implementation Plan field is 16,887 characters. The first 16,130 are byte-equal to FOLD-432.json (25 pairs, each OLD found exactly once in PLAN-432-v1.md, applied in order); the rest is the round block that plan-prep post wrote (Plan review round 1: 20 folded, 0 task, 0 ruling, 0 wontfix, 4 pile). All 25 NEW strings are present. No OLD string is left except where the NEW string starts with it: the FINDING 3 pair is additive, and the old sentence is meant to remain as its prefix. All 20 folded quotes of TRIAGE-PLAN.md are present in the task text (0 missing). The 4 pile lines are LOW or NIT. The card holds two Files lines (the Description and the plan field); both are the same five files, unchanged, as ruled.

(2) PASS. The saved GROUNDER-PLAN.md (lines 6-106 of the hand-back, with no Plan line yet), TRIAGE-PLAN.md (the proposed text), QUESTIONS-RULED.md and FOLD-432.json are byte-identical to what I returned (diffed against the hand-back copy). sha256: GROUNDER-PLAN.md ff07aafe690b13ab48d4a1d7ff60e687fe99c8d4dfb3d5bba83263c4f9fe9bf5; TRIAGE-PLAN.md 9a55257eba3c4f7184d4057fffe66e03a086882197544f39a5a8c3f4838187e6; QUESTIONS-RULED.md 382914be75760c85aeb68c94fe544ce5431dcf14e1cdebdcf4a4023f24578749; FOLD-432.json da67233a899c407938ce63cfcf7fa1972d69c2f37f50d233b8c50c7b1c87cd18. The 11 Ruled lines were copied from rule-lists.mjs findings, and the 3 Seat shas were computed from the seat files.

(3) PASS. I read the folded plan whole. The re-run instruction now lives only in the lens line (edit 2); no sentence is added to the brief's stdout; T3 is dropped and the ORDER, ACCEPTANCE items 1 and 4 and the tests agree with that. The :161 launch call is unedited, which keeps the pinned test at backlog-lane.logic.test.ts:115 green. The new lens-line sentence sits after the layout sentence, holds no colon problem for the :266 segment regex and neither "plan review" nor "TRIAGE.md" (tests :216, :223), and uses only variables in scope in lensLine (task, lane, stage, wt, board, defined at :35-43). Buildable at this head: only backlog files changed since the cited board head, so every cited script, spec and test line is as measured. The Files line is right: the same five files, and backlog-lane.mjs is edited only in the lens line.

(4) PASS, with one note that does not block. QUESTIONS-RULED.md matches the plan's three RULED lines (Q1 A, Q2 no, Q3 yes), the stale-cite fixes, the launch order and the backlog-brief.mjs not-protected ruling. NOTE: the plan's Q1 line says "the rules are quoted in QUESTIONS-RULED.md" and names 08_agents.md:360 (a), but QUESTIONS-RULED.md does not quote that line. It quotes the card's words, DoD #8 and check-lane-close.mjs:764 instead. No ruling is affected, and the correction would be one clause in the plan or the file after the commit.

(5) PASS. planHash of the board task file, recomputed in memory with the exported function of scripts/hooks/check-lane-close.mjs, is 0bbce5b04dc0.

Verdict: PASS
Plan: task-432 sha256:0bbce5b04dc0
