# Fold check: task-452 plan (PLAN-452-v2 as folded, round 1, with FOLD-452, FOLD-MORE, FOLD-RISK5 and FOLD-COPY), final state

Checked by: Cairn-Ground-P452b

On the board working tree (~/Buildo-wt-board, head 387c77009, branch wf2/board) I checked the task-452 card as it now stands, uncommitted, after the 46 pairs of FOLD-452.json, the 1 pair of FOLD-MORE.json, the 10 pairs of FOLD-RISK5.json, the 14 pairs of FOLD-COPY.json and the post step. I read GROUNDER-PLAN.md, TRIAGE-PLAN.md, QUESTIONS-RULED.md and the lens and seat files in docs/reports/reviews/task-452/ from the working tree. Read-only. Every check ran in memory with node and the board own planHash, parseVerdicts, seatLines, findingsIn, ruledLine, lensKindOf, filesEntries and outcomeErrors (scripts/hooks/check-lane-close.mjs, scripts/analysis/rule-lists.mjs). No file was written.

(1) PASS. The FOLD-COPY.json pairs landed as written (13 in the Implementation Plan, 1 in the Description). They carry the operator's ruling RR-0466 (MORNING-DECISIONS.md:2410-2413) on the limit screen look and wording:
- The box: the lines stay in one neutral notice per state.
- The two notice roles: the notice text part role grows from text to text, title, small (one static-page.schema.json edit with a dated note); the used-all line takes title, the reset line beneath it takes small, drawn by the same AlertDescription node; PageTableBinding.tsx picks the class by role; the wall style table in WallBinding supplies the classes; the semi styles leave them unset so every semi golden stays byte-identical. A T1 planted defect and a class assertion in the wallScreens golden cover it.
- The reworded strings: wall.limit.stay "Your Tracked Lots remain."; wall.plan "Your plan is managed on the web for changes."; wall.limit.opened is replaced, with the old text kept as a "was" note. The six-literal pin now says three of the six are pinned by the ruling and not by the mock.
- The three statements the schema edit made false (no schema edit in step 4, no new schema value in Limits, no schema change in risk 5) now read as the one schema edit.

(2) PASS WITH ONE OPEN POINT. Line three, wall.limit.opened "Lot reports you’ve opened this month stay available.", awaits the operator's confirmation. It is the grounder's wording A and is logged in MORNING-DECISIONS.md:2416-2418 as an orchestrator decision, not a ruling. The metering rule (usageFor counts only the current billing window) makes "All your lot reports stay available" false for lots opened in earlier months at the limit, so A is the true wording. The card says the operator confirms it. If he picks the other line, one string changes in two plan places and the Plan hash changes again.

(3) PASS. The Files line has 38 entries (the 37 of the last check plus scripts/surfaces/_schema/static-page.schema.json). The resolve run on the 38-entry Files line gives the same nine lists, so no plan lens output needs re-making. The Size line keeps its quote "Size: GUESS 34 Files-line entries".

(4) PASS. The round line reads "Plan review round 1: 60 folded, 0 task, 0 ruling, 0 wontfix, 6 pile". The card holds 44 plan lines for the CONFIRMED HIGH and MED ids, none with a trailing space. Every folded quote of TRIAGE-PLAN.md is present in the card after whitespace squash.

(5) PASS. The full checker on the whole of GROUNDER-PLAN.md and TRIAGE-PLAN.md against the card and the tree as they stand:
- 98 of 98 ids have a verdict (79 lens, 19 seat): 66 CONFIRMED and 32 REJECTED, 0 CONFLICT.
- Every quote is on its cited line, is 20 or more characters, has a 20th character that is not a space, holds no asterisk, backtick, double quote or backslash, and is distinct.
- No cited line is used more than 3 times.
- The Ruled lines match the committed lens files. The Seat lines match the seat file bytes.
- outcomeErrors in plan mode, with the summary check on, returns 0 errors over the 66 CONFIRMED ids.

(6) PASS. The last line of GROUNDER-PLAN.md is the Plan line and equals the hash of the card as it now stands. No finding id was added by this fold. Operator questions: one open, line three above, not blocking the build; the lane holds that one string.

Verdict: PASS

Plan: task-452 sha256:7a8c2de9fe27
