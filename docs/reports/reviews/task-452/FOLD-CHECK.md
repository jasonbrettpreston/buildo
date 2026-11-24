# Fold check: task-452 plan (PLAN-452-v2 as folded, round 1, with FOLD-452.json, FOLD-MORE.json and FOLD-RISK5.json), final state

Checked by: Cairn-Ground-P452b

On the board working tree (~/Buildo-wt-board, head 88a817eed, branch wf2/board) I checked the task-452 card as it now stands, uncommitted, after the 46 pairs of FOLD-452.json, the 1 pair of FOLD-MORE.json, the 10 pairs of FOLD-RISK5.json and the post step. I read GROUNDER-PLAN.md, TRIAGE-PLAN.md, QUESTIONS-RULED.md and the lens and seat files in docs/reports/reviews/task-452/ from the working tree. Read-only. Every check ran in memory with node and the board own planHash, parseVerdicts, seatLines, findingsIn, ruledLine, lensKindOf, filesEntries and outcomeErrors (scripts/hooks/check-lane-close.mjs, scripts/analysis/rule-lists.mjs). No file was written.

(1) PASS. The FOLD-RISK5.json pairs landed as written (1 in the Description, 9 in the Implementation Plan). They carry two rulings made when lane BL-SFX4 stopped at plan risk 5 and when the push gate failed fix-tune D15:
- The key fix: a notice carries the title and date, but PageTableBinding.tsx:101 gave every text part of one notice the same React key. The first text part keeps its key, later ones get a counter, so the semi goldens stay byte-identical. All wall lines sit in one neutral notice per state; no schema change and no new kind. PageTableBinding.tsx joins the Files line, and wallScreens.golden.test.ts gains a sibling-key walker (red first on the limit golden).
- The D15 cite correction, carried as the lane's first commit: the three cites of useParcelEntitlement in census/contracts.json go from useParcelLookup.ts:162 to :168 (task-457 moved the line); the emit run rewrites the F02 entitlement descriptor and the registry. The census contracts file and that descriptor join the Files line.
The three old cites made stale by task-457 (semi-question.tsx:77-78, useParcelLookup.ts:162-170 and :165) are corrected in the card to :87-88, :168-176 and :171.

(2) PASS. The Files line has 37 entries (the 34 of the first fold plus PageTableBinding.tsx, scripts/surfaces/_schema/census/contracts.json and scripts/surfaces/parcel_product/F02/contracts/contract_parcels_entitlement.descriptor.json). The resolve run on the 34-entry and the 37-entry Files lines gives the same nine lists (eng-all, inc-S, mobile-90, mobile-98, mobile-99, ms-S, plan-protocol, step-132, surface-136), so no plan lens output needs re-making. The Size line keeps its quote "Size: GUESS 34 Files-line entries" and adds that three entries were added at the lane stop.

(3) PASS. The round line reads "Plan review round 1: 60 folded, 0 task, 0 ruling, 0 wontfix, 6 pile", equal to the outcome lines. The card holds 44 plan lines for the CONFIRMED HIGH and MED ids, none with a trailing space. Every folded quote of TRIAGE-PLAN.md is present in the card after whitespace squash.

(4) PASS. The full checker on the whole of GROUNDER-PLAN.md and TRIAGE-PLAN.md against the card and the tree as they stand:
- 98 of 98 ids have a verdict (79 lens, 19 seat): 66 CONFIRMED and 32 REJECTED, 0 CONFLICT.
- Every quote is on its cited line, is 20 or more characters, has a 20th character that is not a space, holds no asterisk, backtick, double quote or backslash, and is distinct.
- No cited line is used more than 3 times.
- The Ruled lines match the committed lens files, including plan-compliance-mobile-98.txt sha256:0fe1bbafa453 findings:7. The Seat lines match the seat file bytes.
- outcomeErrors in plan mode, with the summary check on, returns 0 errors over the 66 CONFIRMED ids.

(5) PASS. The last line of GROUNDER-PLAN.md is the Plan line and equals the hash of the card as it now stands. No finding id was added by this fold. Operator questions: none that block; the optional heads-up on the grey notice box look was given at the lane stop.

Verdict: PASS

Plan: task-452 sha256:91f2fed7fce1
