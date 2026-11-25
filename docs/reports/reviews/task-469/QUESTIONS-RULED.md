# task-469 plan panel, round 1: questions ruled by the plan grounder (Cairn-Ground-P469)

Authority and bounds (MD = ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md), each read at its line.
- RR-0502, MD:2613, operator verbatim: "465 a". Put to him at MD:2614: "A: add the phone generated picture copies to the skip list (one line in one table; own small card and review, because it changes what the review tool covers). B: leave the tool alone (card 465 and later cards that change the pictures this much cannot close)." Read as: A (MD:2615). The card is that one line in one table plus its test. RR-0502 names the phone picture copies only, so no other glob is added.
- RR-0392, MD:1975, operator verbatim: "I  don't think we need any other infastrcuture beyond this.." No new field, option, check or tool: the card adds one glob, one `$comment` line and tests, and names an existing check (emit-mobile-surfaces.mjs --check). A test of the close check was therefore REJECTED (plan-error-paths#3).
- RR-0359, MD:1687, operator verbatim: "That's ridiculous to fold before the grounder review - the focus is on getting it right - thats the reason we run the reviews Alos how does the speed things up because then you need to reground - doesnt that actually take longer. Don't do that". Read (MD:1688): nothing is folded onto the board before a separate grounder has ruled its output review, with no exception for generated files or for speed.
- RR-0467, MD:2424, operator verbatim: "1 What is a lot service - doesnt make sense 2. a 3 what is this? 4 yes"; ruled at MD:2425: the station suite runs on the lane's fix commit before the output review (4 is yes).
- RR-0423, MD:2171, operator verbatim: "add teh first two.  Plan approved.  Move forward with the task": the plan grounder itself writes FOLD-CHECK.md, once, after the last fold; so I am resumed once with the hash.
- RR-0429, MD:2202-2203, operator verbatim: "Keep notes short. ..."; ruled: dated notes are kept short. This card adds no dated note in a spec; its card notes are two short ones (task-469 and task-465).
- RR-0477, MD:2496, operator verbatim: "batch items that touch the same files or the same kind of file and need no database step. Keep anything with a database step or its own operator question on its own card." The card holds two files, no database step; the work for tasks 267 and 317 is not batched in (they name none of the copies).
- RR-0385, MD:1915-1926: round 1 folds CRITICAL, HIGH and MED; the operator is asked only for what the rules do not settle.
- The task-406 rule, scripts/analysis/rule-lists.json:9: "the `exempt` key (bare globs; no new field) also lists the golden snapshot files that one existing check validates, and each such glob names that check in the line below it (a test fails a golden glob with no named check)". Half a line is added there (rg#3).
- Spec 08, docs/specs/00-architecture/08_agents.md:233: "a lane whose own table differs from the board's in any of those four keys is refused ... (a task that changes them is refused too: those changes land on the board first)"; section 11.2 (:488) fold validation is a step, RR-0423 puts it with this grounder.

Not read because the card changes no product behaviour: the objectives document under backlog/docs/increments, Spec 100, FOLD-PLAN.md of mcfixreborn-fold and the mcfixreborn-g1 to g4 records.

## Point 1: the landing order (rg#1, rg#2)
The order that the rules allow, now folded into the plan (section 7 steps 1 to 10):
1. launch; 2. T1 to T4 red, then the table edit, then green, work commit through the real hooks; 3. station suite on the work commit (RR-0467); 4. the one output lens (code-review for a fix card); 5. the separate output grounder rules it (RR-0359), every confirmed finding is fixed on the lane, review records committed on the lane; 6. fold the lane onto the local wf2/board (a merge commit, as task-464 at aca7d541d: its parents are 68f1718da and the lane tip e332d3b26); 7. the lane merges wf2/board (a fast-forward onto the fold) and `git diff wf2/board -- scripts/analysis/rule-lists.json` prints nothing; 8. the closing commit, records only; 9. wf2/mcfix465 merges wf2/board; 10. 465's material is rebuilt and lens-input is the gate.
- RR-0359: satisfied literally. The fold (step 6) comes after the grounder has ruled (step 5). Not an operator decision: nothing in the order breaks a ruling, so rg#1's sub-ask (put the order to the operator) is not taken.
- :772 (check-lane-close.mjs:772): it refuses a lane whose own `exempt` differs from the board's; the board key is read from the local ref first (:129, :729-731, :787). Until the board holds the glob, the lane's table differs and the close is refused; after the fold the lane's table equals the board's. So the close must come after the fold, and the fold is forced before the close. Both rules hold in this order.
- Does the close check accept a close made after the fold: yes, from reading, with one gap. F8 in src/tests/backlog/check-lane-close.logic.test.ts:512 (read in full with its scenario at :100-115): `folded: true` runs `git branch -f wf2/board HEAD` (:113), one fix commit follows (:115), the close exits 0, and a chunk set missing the pre-fold file src/a.ts is refused: coverage runs from the launch commit L (:838-842), never from the merge-base. Our close also keeps a non-empty range (rangeEmpty is counted at :841 over the Files-covered paths before the exempt filter at :842, and the range holds rule-lists.json and the test); the staged part is records only (:765-766 fires only when rule-lists.json is staged). The gap: no test closes an exempt-changing task. F7 (:570) pins only the refusal. By topology c8efb23f5 (exempt, task-406) is an ancestor of 98c9f9a8e (the :772 rule), so this is the first such close; the mechanism rests on :772, :787 and :841-842, and the plan now carries a read-only pre-check before the closing commit.
- A fix made after the grounder touches the two files, so the lens input is rebuilt by lens-input (the close recomputes the diff, :112 of the check's header); the plan says so.

## Point 2: the conflict and the post-merge check (in#1, in#2)
Read with the read-only `git merge-tree 1aee693d6 wf2/board wf2/mcfix465`: "changed in both" on the task-465 card only, two conflict hunks; the lane changed neither rule-lists.json nor the table test (git diff --name-only 1aee693d6 0aa1b011e). Folded: take the board's side of the card with git, re-add the lane's own Files-line paths (union of both Files lines) and its Build note with the backlog CLI; never a hand edit of the markdown; after the merge `git diff wf2/board -- scripts/analysis/rule-lists.json` prints nothing on the lane. page --check stays green: rule-lists.mjs reads exempt only at :153 and :271.

## Point 3: rg#3
Folded as half a line at rule-lists.json:9 and at the test comment :144 (the wording is in the plan step 4). No test pins either text (git grep). Inside RR-0392: no new field.

## Point 4: other open lanes (rg#4)
Today only BL-MCFIX465 has a live lane worktree (~/Buildo-wt-mcfix465, wf2/mcfix465, not merged into the board). Tasks 267 (WAITS) and 317 (WAITS) are not launched and task-313 is LATER; every wf2 lane branch with a worktree other than 465 is already merged into the board (genrow, plint, sfx6b, sfx8). About thirty older cards still read RUNNING with an @lane assignee and no worktree (tasks 1, 179 to 236, 307 to 411 and others); they predate this card and a close of any of them meets the same :772 and the same remedy (merge the board). The note goes on task-469 and on task-465 only.

## Point 5: rc#1, the exact Description pair
Old: "Blocks: task-465 close; tasks 267 and 317 would meet the same refusal. Not planned yet: no plan, no Files line." The Files lines of 267 and 317 name none of the four copies (grep count 0 on each); task-313's Files line names a new copy, mobile/__tests__/fixtures/surfaces/mobile_parcel_opening.goldens.json, which the same glob will cover. Pair 1 of the fold gives the new text, which also settles in#3 and puts the Files line in the Description.

## Point 6: rc#2
The $comment line names both proofs: the standing proof on the real copies (src/tests/surfaces/mcfront-proof.infra.test.ts canary b control, in the push suite) and the red proof on a bad copy (the new T4). CHECKS keeps one new entry only (emit-mobile-surfaces.mjs --check): adding the second name to CHECKS would let a glob pass on the weaker name.

## Point 7: rg#6
Step 10 and the size paragraph of section 3 carry the gate: if lens-input refuses any other file, stop and return to the operator; no other glob is added under RR-0502. AC3 is measured, not estimated: git diff 2fd2f6042 to wf2/mcfix465 per file, minus the exempt globs and the new one: largest remaining 44,304 (the task-267 card), 35,465 (the task-465 card), 25,865 (bindings.json), 23,114 (parcelSearchScreen.behaviour.test.tsx), against 97,828; the refused file (264,507) is the only one over.

## Point 8: in#3
The stale sentence is replaced in the Description (pair 1).

## Point 9: the Files line, rule lists and the launch gate
- The Files line sits in the Description (pair 1) and, identical, in the plan (as tasks 448, 456 and 464 do). `filesText` reads the first `Files:` in the whole body (rule-lists.mjs:183), so both agree; the new card text holds exactly two `Files:` tokens.
- `rule-lists.mjs resolve` on that line (type fix, letter S) printed: agents-s5-1to3, agents-s7-s11, eng-all, plan-protocol, inc-S, ms-S; exempt 0, unmatched 0. The lane-tools row (rule-lists.json:163-167) attaches the first three for rule-lists.json; the tests row (:225) attaches eng-all.
- Launch gate: check-lane-close.mjs:638 builds the per-list compliance set for type build only; for a fix task :659-662 need at least one plan-<lens>.txt with a valid REVIEW header. The folder holds plan-error-paths.txt and plan-plan-review-deepseek.txt, both with REVIEW headers and VERDICT lines. No compliance output is needed. The three seat reports are listed (the Files line names a tracked path, so the regression seat is required).

## The plan's open choices
- Q-A where T4 lives: A, rule-lists-table.logic.test.ts. B would put the red proof in surface-conformance.logic.test.ts, which attaches surface-136 (resolve on that path prints surface-136, eng-all, plan-protocol, inc-S, ms-S) and is a file lane 465 also edits (it is in 465's diff). RR-0392 (nothing beyond what is needed) and the precedent c8efb23f5 (table test only) settle it. Not an operator question.
- Q-B push of the board before 465's review: not needed. BOARD_REFS (:129) reads the local wf2/board first; the push is the operator's own y turn (MD:1975, ruled (1)). No extra push.

## The plan's UNVERIFIED items
- AC3 estimate: settled by measurement (Point 7).
- Whether `--check` is green today: checkOutputs run in memory on the board tree at 05026ae0a returned no problem.
- First state file for case (c): ambiguous.mobile.json (first of the sorted directory); any value of a source reaches the copy (emit-mobile-surfaces.mjs:112-115).
- The simple-word quote did not grep in MD: it is not found; the plan does not rest on it (line reworded).
- The worktree shares refs: git worktree list shows one bare repo and git for-each-ref from the board worktree lists wf2/mcfix465.
- T4's added suite time: not settleable by reading; the copy is about 10 MB, the same trees emitCopy copies (surface-conformance.logic.test.ts:1020-1026).

## Files the plan marks outside the Files line
None. The Files line (rule-lists.json and the table test) is complete; rule-lists-by-kind.md does not change (page reads kinds and lists only).

## OPERATOR QUESTIONS
None.
