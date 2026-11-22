# Fold check: task-435 plan (PLAN-435-v1 as folded), plan review round 1

Checked by: Cairn-Ground-P435

On the board at HEAD 6c3f450c9; the fold edits and the plan-prep post are uncommitted backlog changes, and docs/reports/reviews/task-435/ is not yet committed. Read-only; every check below ran in memory.

(1) PASS. The original plan is the HEAD copy of the task file, with no round block. FOLD-435.json holds 25 pairs; each OLD occurs exactly once in the original (0 bad). The card's Implementation Plan field is the fold applied to the original (the head of the field equals it, apart from one trailing whitespace character) followed by the round block that plan-prep post wrote ("Plan review round 1: 72 folded, 0 task, 0 ruling, 0 wontfix, 0 pile", with the grounder and triage paths and one line per MED outcome). Every NEW is present and no OLD remains. All 72 folded:"..." quotes of TRIAGE-PLAN.md are in the task text (0 missing).

(2) PASS, with one limit. I cannot diff against my hand-back message in memory, so I checked the saved files structurally. GROUNDER-PLAN.md has Grounder: Cairn-Ground-P435 and Lane: BL-NOTE435, 104 parsed verdicts (72 CONFIRMED), and 3 Seat lines. TRIAGE-PLAN.md has 72 folded lines, one per CONFIRMED id. The 12 Ruled lines equal the first 12 lines of FINDINGS-PLAN.md. GROUNDER-PLAN.md has no Plan line yet. The sha256 of each file as saved:
- GROUNDER-PLAN.md: bf1759568d8aaf9840c64627b2ea882ed67defc27e0f4f17b9fb3f9d583fbc7d
- TRIAGE-PLAN.md: 3f91081340f50442e25257c3ab752a936f2cdef1e81cb8a9671cee11129e0abc
- QUESTIONS-RULED.md: 5a7b9d2181ecd0f94ac9da64bcaecc4bd1a26a6e0ed7586cb0c2ac54d3a42dd3
- FOLD-435.json: 58af29ae766429d3961a22cb14fd1cbcd99c69e904c1afbc8103554b933e5365

(3) PASS. I read the folded plan whole. The EXACT NOTE TEXT is the 81-word note and the Dated note 2026-11-22 line occurs once. No "OPEN" question text or "seven lists" claim remains. FACTS 7, FACTS 8, TESTS, ORDER 4, ACCEPTANCE and the ruled block agree: ten lists, the page check both ways, the status move in the closing commit, and 435 lands before task-431 with the second lander regenerating the page. There is a single Files line, unchanged: "Files: docs/specs/00_engineering_standards.md, docs/reports/generated/rule-lists-by-kind.md".

(4) PASS. `planHash` from scripts/hooks/check-lane-close.mjs on the board's task file is 3dfbbd08d304.

Verdict: PASS
