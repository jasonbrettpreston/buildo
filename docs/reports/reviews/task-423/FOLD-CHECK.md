# Fold check: task-423 plan (PLAN-423-v2 as folded to v3), plan review round 1

Checked by: Cairn-Ground-P423

On the board at HEAD 1dec2bc5a (the plan-prep commit; the task file edits of the fold are in the working tree of ~/Buildo-wt-board as backlog edits), 2026-11-21. Read-only; nothing in the repo edited.

(1) PASS. The board task plan field is 33,053 characters: the first 28,205 are byte-equal to FOLD-423.json applied to the original plan (work/FOLDED-PLAN.txt) and the rest is the round block that plan-prep post wrote (Plan review round 1: 105 folded, 0 task, 0 ruling, 0 wontfix, 8 pile). All 9 NEW sections are present; no OLD section is left (0 of 9). All 105 folded quotes of TRIAGE-PLAN.md are present in the task text (0 missing). The Description holds exactly one Files line and it equals FILES-LINE.txt.

(2) PASS, with one note that does not block. The first dated note equals NOTE.txt (129 findings, 113 CONFIRMED: 16 HIGH, 72 MED, 23 LOW, 2 NIT; 16 REJECTED; 0 CONFLICT; 105 folded by 9 edits; 8 pile; Q1 to Q10). The orchestrator's scope note contradicts nothing that card A builds (the join of the resolved lists, plan findings ruled once). NOTE: the later-cards parts of the folded plan are now stale against RR-0367 (decision-152) and RR-0368 (decision-153): section 6 card B says a MED is recorded and not fixed (RR-0367 amends RR-0364 item 1: important medium findings are fixed at the output), and the scope note says card B follows "as written in section 6"; sections 1, 5 and 7 call the rules sections the operator's option and question 3 (RR-0368 now orders them as new cards), and section 0 and 7 keep the station in scratch as an operator question (RR-0367 item 5: "tools live in the repo is there another option"). None of this is built by card A, and card B and the new cards get their own plan stage, so a note suffices: the scope note should say card B's medium outcome is re-planned under RR-0367, not "as written".

(3) PASS. GROUNDER-PLAN.md, TRIAGE-PLAN.md and QUESTIONS-RULED.md in docs/reports/reviews/task-423/ are byte-identical to my files (GROUNDER-PLAN.md, TRIAGE-PLAN.proposed.md, QUESTIONS-RULED.md). The 11 Ruled lines match the committed outputs and the 3 seat lines match the seat files (the launch gate dry run reported only the missing Plan line, so it read both). Seat sha256 prefixes in the file: integration, reality-check, regression as ruled.

(4) PASS. I read the folded plan whole. The Files line (section 6, card A) equals the Description Files line and resolves the same nine lists as the plan evidence holds (resolveTask at this head: agents-s5-1to3, agents-s7-s11, queue-137, eng-all, orchestrator-doc17, five-words, plan-protocol, inc-S, ms-S). Sections 0 to 3 agree on the join, the two evidence forms and the plan-evidence test; section 4 notes match the code lines they cite. Buildable at this head: git diff 36a2c2d63 HEAD changes only the review evidence and one backlog file, so every cited script, spec and test line is as measured.

(5) PASS. planHash of the board task file, recomputed with the exported function of scripts/hooks/check-lane-close.mjs, is b485973db7df, equal to the gate's expected line.

Verdict: PASS
Plan: task-423 sha256:b485973db7df
