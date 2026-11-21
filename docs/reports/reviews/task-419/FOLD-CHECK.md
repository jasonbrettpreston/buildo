# Fold check: task-419 plan (PLAN-419-v1 as folded), plan review round 1

Checked by: Cairn-Ground-P419

On the board at HEAD 5fe924b84 (the plan-prep commit is 690c12fec), 2026-11-21. Read-only; nothing in the repo edited.

## The five checks

(1) PASS. The board task plan field is 13689 characters: the first 11725 equal FOLD-419.json applied to the original plan (byte-equal to plan-v2.txt) and the rest is the round block that plan-prep post wrote. All 27 NEW sentences are present; no OLD sentence is left (F2's old text is a prefix of its new text, so it still appears inside it). All 62 folded quotes of TRIAGE-PLAN.md are present in the task text (0 missing). The Description holds exactly one Files line and it equals FILES-LINE.txt.

(2) PASS. The dated note on the task is byte-equal to NOTE.txt: 79 findings, 63 CONFIRMED (1 HIGH, 31 MED, 26 LOW, 5 NIT), 16 REJECTED, 62 folded by 27 edits, 1 pile, and Q1 to Q8 as ruled, with the operator items.

(3) PASS. Every file in docs/reports/reviews/task-419/ is byte-identical between the worktree and HEAD. GROUNDER-PLAN.md, TRIAGE-PLAN.md and QUESTIONS-RULED.md equal my files. The 11 Ruled lines match the committed outputs. Seat shas: a490dc746b2b, 94caf06359c2, a870868001d1. Commit 690c12fec names only files under that folder (0 outside).

(4) PASS. I read the folded plan whole. No contradiction: the Files line, section 4e, section 6 and section 9 agree on eight paths; section 3 and section 4a agree on the block's place and the refusal texts; section 5 tests match section 3 (name cut, last line counts, quoted Plan line, both files named); section 6 keeps commit A with the task file and a status move only in commit B. Nothing is unbuildable at this head: the cited scripts and tests are unchanged since c442eec10 for the lines used.

(5) PASS. planHash of the board task file, recomputed with the exported function of scripts/hooks/check-lane-close.mjs, is bcfce6af1573, equal to the gate's expected line.

Verdict: PASS
Plan: task-419 sha256:bcfce6af1573
