# Fold check: task-452 plan (PLAN-452-v1 as folded, round 1, with FOLD-452.json)

Grounder: Cairn-Ground-P452
Task: task-452 (SEARCHFIX.4)
Checked by: Cairn-Ground-P452

On the board working tree (~/Buildo-wt-board, head 0f8eca7a9 plus auto board-edit commits only, branch wf2/board), the task-452 card as it now stands, after the 31 pairs of FOLD-452.json and `plan-prep post`. GROUNDER-PLAN.md (sha12 05ea6bac0983), TRIAGE-PLAN.md (5520860af482), QUESTIONS-RULED.md (651eeb3b376d), the three seat files and the lens outputs in docs/reports/reviews/task-452/ were read from the working tree. Read-only; every check ran in memory with node and the board's own `parseVerdicts`, `seatLines`, `lensKindOf`, `outcomeErrors` and `planHash` (scripts/hooks/check-lane-close.mjs); no file was written.

(1) PASS. Every pair landed as written. The committed card (HEAD, before the fold) with the 31 pairs applied in memory, each old text found exactly once at its turn (23 in the Implementation Plan, 4 in the Description including the Files line, 4 in the Acceptance Criteria), equals the card as it stands now line for line, except for the lines the post step added: the updated_date, the references key with its five paths (GROUNDER-PLAN.md, TRIAGE-PLAN.md and the three seat reports), the round line and 84 per-id lines (35 HIGH and 49 MED outcomes). No line of the Plan, Description or Acceptance Criteria is missing or changed that was not ruled.

(2) PASS. All 97 folded outcomes of TRIAGE-PLAN.md have their quote present in the card text, each where the ruling put it (the web, spring, state-2, date, code, count, surface, help, Account, navigate, pins, hunk and RR-0454 phrases in the Plan, AC2, AC4, AC5 and AC6 texts). `outcomeErrors` in plan mode over the 124 verdicts of GROUNDER-PLAN.md, the three Seat lines and TRIAGE-PLAN.md returns 0 errors for the 99 CONFIRMED ids (97 folded, 2 pile). The three Seat lines match the file bytes (5c2b005f28a6, dee0e22257c3, 6a7e79149634) and the three seat files hold the 26 seat ids. The quote check was re-run at the current head: 124 of 124 verdict quotes are on their cited line of `git show HEAD:<path>`, all distinct, none shorter than 20 characters or with a space as the 20th, no line cited more than 3 times.

(3) PASS. The round line on the card, "Plan review round 1: 97 folded, 0 task, 0 ruling, 0 wontfix, 2 pile; grounder docs/reports/reviews/task-452/GROUNDER-PLAN.md; triage docs/reports/reviews/task-452/TRIAGE-PLAN.md", equals the 97 folded and 2 pile of TRIAGE-PLAN.md and appears once. There is one Files line and it is byte equal to the Files line of FOLD-452.json (the 37 paths ruled: the wall surface, hook, binding, schema and manifest files, census, registry docs, the new tests and the report-mount tests; the search binding, search content and slice, web client and web page are off it).

(4) PASS. RR-0454 reads as ruled. Item 3: the RR-0454 bullet (once) says at the report limit "Your plan is managed on the web." is enough for now with no top-up or upgrade control until the buying work, on phone or web; AC2 and sections 5, 7 and 8 carry the same words (the phrase occurs 4 times). Item 4: the way to sign up of RR-0312 waits for the buying work (2 occurrences: section 1 and section 5), and the task-357 note owed keeps it open for the operator. Item 5: the spring is marked "NOT ruled, the spring waits on the operator (RR-0454 item 5)" (once in section 1), AC6 is haptic only, step 7 says "No spring: the spring waits on the operator (RR-0454 item 5)", and section 8.6 points to QUESTIONS-RULED.md.

(5) One open item, not a failure: GROUNDER-PLAN.md has no "Plan:" line yet. The hash of the card as it now stands (title plus body, front matter outside) is 47a4ffad7042, so the last line of GROUNDER-PLAN.md and of this file is the one below. Append it to GROUNDER-PLAN.md after the Ruled and Seat lines and verdicts (it must be the last Plan line); the card's hash does not depend on it.

Verdict: PASS

Plan: task-452 sha256:47a4ffad7042
