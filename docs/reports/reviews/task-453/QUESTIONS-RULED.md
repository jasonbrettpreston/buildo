# task-453 plan panel, round 1: questions ruled by the plan grounder (Cairn-Ground-P453)

Authority (MD = ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md):
- RR-0440 (:2265): "Which reviewers caught the most issues? Let's plan to drop the planning and process lists".
- RR-0444 (:2290-2291): "we also want to turn off the lists - please determine the size?"; "(2d) The close-check helper line is added."
- RR-0448 (:2314): "8".
- RR-0449 (:2320): a question, not yet a ruling.
- RR-0450 (:2325-2326): "I dont see how queue rules and orchestrator notes are valuable to anything from a code persepctive. The step handbook is only valuable froma compute perspective"; "Are these minor changes? We just want to turn off or change the text etc?" Ruled: "The changes are to be switches or text changes only."
- RR-0451 (:2332): reversed by RR-0452.
- RR-0452 (:2336-2338): "Plan approved with one change - do not add the addiitonal 3 questions"; "five principles off - confirm the plan below". The put-to text (:2335) reads "step handbook unchanged".
- RR-0419 (:2149-2150): "Approved. Are there any other surprises ...".
- RR-0429 (:2202-2203): "Keep notes short"; "The cap is not raised."
- RR-0392 (:1975-1976): no new mechanism.

Basis: board head 9a10561ef. Everything was read with sed, grep, git ls-files and node run in memory on the repo's own functions (readTable, resolveTask, filesText, validateTable). No test runner was run and no file was written. The in-memory runs were:
- the card's Files line resolved under the old table and under the table as the plan and these rulings change it;
- FILES_423 resolved under both tables;
- the 413 committed seat verdicts counted.

## Size: is the card too large for one lane? No. Keep one card.
- RR-0448 (:2314) was his word "8" for the merged tooling card. The plan's section 4 offers (i) step 4 as its own card and (ii) T10, T9 and T12 waiting. Neither is needed.
- The size is small. FOLD-PLAN.md sizes tasks 10, 11 and 12 as S, M and S-M. The plan counts about 11 plus 25 plus 6 lines of code, about 150 test lines and five data lines.
- A split does not cut review cost. Every step-4 file sits under the lane-tools row (scripts/analysis/**, scripts/lib/review-template.js, .claude/**), so a second card pays the same lane-tools lists again. In memory, the card's Files line resolves to eng-all plus the lane-tools lists for every file but one, so a split doubles the shared lists and removes none.
- Steps 1 and 2 must stay together (the plan's own reason: they write the same protected files). The card's PROTECTED FILES line names rule-lists.json, rule-lists.mjs and check-lane-close.mjs (RR-0419).
- The operator approved the plan's content (RR-0452), not a card count, so no split is made.

## Switch-or-text audit (RR-0450 "switches or text changes only"; "a switch or a text change where one is possible")
- Item 2 (five-words off): data only, already the smallest form (every_task becomes ["plan-protocol"]; no code).
- Item 3 (queue-137 and orchestrator-doc17 off lane-tools): data only.
- Item 1 (plan-protocol off for output reviews only): code is needed; no data-only form exists.
  - every_task is attached stage-blind at rule-lists.mjs:270 and verified stage-blind at :293-294. Dropping plan-protocol from every_task would turn it off at the plan stage as well, which RR-0450 (plan protocol off for output reviews "agreed") and the put-to text of RR-0452 did not approve.
  - AC #2 names the output_off line, so a reader is required. The smallest reader is the plan's outputLists filter plus one validate line, about 11 lines.
  - The fix-task plan-gate part exists only because AC #1 says "a fix task with no plan-stage output for them is refused". Without it a fix card would never review plan-protocol at all. It is kept for plan-protocol alone, because five-words is off at both stages (AC #1 is reworded in the fold).
- Item 5 (S1, S2, S3, S4, S5, S9, T10): logic bugs in the close check and the tool, grounded earlier and folded by RR-0444. No data form exists. They are one-line edits each except S1, S2, S3.
- Item 5 data or text: ST4, T2 (data); T9, T12 (message text).
- Item 6: T1, T3, T6 (text); ST5 (data); T7, T8, T4 (one line each).
- Item 4 (step handbook): see Q5 below.
- Nothing in the plan is larger than a switch or a text change where a smaller form was possible. Two corrections are folded: the migration 334 edit comes off the card (Q4) and the plan's "no change" claim for step-132 was false in one spot (Q5).

## The plan's open choices (section 8)
- **Q1 (five-words: A drop from every_task, or B output_off only).** A, settled by RR-0452. MD:2338 "five principles off - confirm the plan below", MD:2337 "The five-principles list is turned off and nothing replaces it." B would keep the list for plan reviews, which contradicts the operator's words. A is data only. Not an operator question.
- **Q2 (S2: judge by the board table, or refuse "merge the board first").** The board table. The card's AC #3 says "A branch with no rule table still reads the board". FOLD-PLAN.md:111 says "(S2) A branch with no rule table still reads the board (:720-725)". The refusal is left to the existing :748-749 lines when the board copy is unreadable (finding plan-error-paths#1, folded). Not an operator question.
- **Q3 (pin output_off under F10, check-lane-close.mjs:842).** Yes. The F10 comment at :839 says every field "that decides what is reviewed (exempt, base_ref, finished_statuses, protected_paths, every_task) still the range base's". output_off decides what is reviewed, so it joins that pin. Without the pin, a task that owns the table could empty or fill output_off in its own branch. The consequence the plan already states stands: this card's own output review still needs five-words and plan-protocol, because its range base has neither switch.
- **Q4 (migration 334 note: card or runbook).** Neither. The note leaves the card and migrations/334 leaves the Files line.
  - scripts/migrate.js stores "SHA-256 of the file contents at apply time (detects in-place edits to already-applied files)" (migrate.js:11-12), and "--verify exit non-zero if any checksum differs" (:19). A comment-only edit changes the checksum.
  - The D9 grounder wrote "a migration is already pushed, so it needs the operator's word to edit" (docs/reports/reviews/mcfixreborn-g4/GROUNDER-D.md:117), and no ruling names it.
  - FOLD-PLAN.md:129 has a fallback for a refused edit. The edit would be accepted by the hooks, because check-migration-down-comments.sh only refuses uncommented DDL under DOWN, so the fallback would not trigger. The real risk is the checksum.
  - Dropping the file removes eng-back and eng-shared from this card's review (checked in memory). The plan's claim that step-132 goes with it was false; see Q5.
  - The finding (eng-back#2, D9) is recorded as a dated note on task-406 (its owner per GROUNDER-D.md:117). No new file is added. Not an operator question.
- **Q5 (step-pipeline row scope for step-132).** Left as it is. The put-to text of RR-0452 (:2335, which he approved) says "step handbook unchanged". RR-0450 :2326 says "The step handbook is reviewed for compute only", and the orchestrator reading says the two compute rows already attach it.
  - **One leak is found and folded.** For a Files entry that is one file, the resolver also tries "<file>/x" (rule-lists.mjs:212). The step-pipeline row's `not` names scripts/lib/review-template.js by exact path (rule-lists.json:87), and "scripts/lib/review-template.js/x" matches scripts/lib/** and not that entry. So review-template.js, a lane tool the row's own why text says is excepted, resolves to step-132, eng-back and eng-shared (resolved in memory).
  - The card's Files line names that file (T7).
  - The fix is one data string in that row's `not` list: scripts/lib/review-template.js/**. In memory the file then resolves to the lane-tools lists only, validate stays clean, and deepseek-review.js and the compute entries are unchanged.
  - This is within RR-0450 ("compute only") and is a switch, not new work. A test line pins it.
- **Q6 (SPEC LINK D6 on deepseek-review.js and check-task-files.mjs).** Out. scripts/deepseek-review.js is a protected path (rule-lists.json:22). The card's PROTECTED FILES line names only rule-lists.json, rule-lists.mjs and check-lane-close.mjs, and RR-0419 lets a protected file into a lane only when the card names it. check-task-files.mjs is not on the Files line. The plan's own line (review-template.js:14 only) stands. Not an operator question.

## The plan's UNVERIFIED items (section 9)
- **U1 (MERGE_HEAD scenario).** Settled by reading: buildable. check-lane-close.mjs:720-721 finds the file through git rev-parse --git-path MERGE_HEAD and fs.existsSync. The scenario builder (check-lane-close.logic.test.ts:85-128) makes its repo with git, runs the hook with cwd at that repo and already has `laneDelete`, `staged` and `noBoard` options. One `mergeHead` option writing .git/MERGE_HEAD with a commit sha is enough. The failed-show case is named in the fold (plan-error-paths#7). Not run (read only).
- **U2 (the migration hooks).** The two hooks exist at scripts/hooks/validate-migrations.sh and scripts/hooks/check-migration-down-comments.sh, called at .husky/pre-commit:51-52. A comment-only edit would pass them; the checksum risk of Q4 is the reason the edit is dropped.
- **U3 (review-templates.logic.test.ts drives contextRound).** It does not. The file imports only vitest, fs, path and ./helpers, and reads the templates folder (review-templates.logic.test.ts:3-8). Nothing under src/tests names contextRound. The cases go in that file through createRequire of scripts/lib/review-template.js (the file is already on the Files line, no new file). The existing test that touches the round is backlog-brief-context.logic.test.ts:185, which stays green under highest-plus-one. The fold adds an empty-folder case and a gap case. The task-448 folder holds context-r1.md and context-r3.md, so today's count-plus-one would name r3 again.
- **U4 (the README line contents).** Partly settled. The lines the plan cites (27, 28, 87, 109-111, 122, 127, 135, 151, 158, 159, 165) exist in the 165-line file and carry the topics the grounders name (the WF2/WF3 table, the --template flag, the round list, the plan route, the lane-list text). The replacement text is the builder's from the D1, B3 and C1-C3 records, which I did not re-read in full. Still UNVERIFIED in that part.
- **U5 (page counts after regeneration).** The generator was not run, because it writes a file. The page is regenerated by the builder and no test pins its counts except the rule-lists.logic.test.ts:465 pattern, which the plan already moves to plan-protocol.
- **U6 (no tests run).** True, and none were run here either.

## Corrections found by reading (not printed findings), all in FOLD-453.json
- **Counts the table change moves.** rule-lists.logic.test.ts:935 `toHaveLength(9)` and the `(9 lists:` pattern at :945 pin the tooling Files line FILES_423. After items 2 and 3 it resolves to 6 lists (agents-s5-1to3, agents-s7-s11, eng-all, plan-protocol, inc-S, ms-S; checked in memory), so both break and the plan's test list missed them.
- **The Description and AC #1 were false after RR-0452.** "(1) ... switched off for output reviews by one data line; plan reviews keep them" and the "Orchestrator reading ... output reviews only" sentence both treat five-words and plan-protocol alike. Under RR-0452 five-words is off at both stages. AC #1's "fix task with no plan-stage output for them" now holds for plan-protocol alone. Reworded.
- **MD cites.** The plan's RR-0440 and RR-0452 cites were each one line late (the operator's verbatim is on :2265, :2336 and :2338). T9's cite of :109 is the fail function at :113. S9's id-versus-number cite :791 is :784.
- **ST5 test.** src/tests/proof-slice.logic.test.ts:228 asserts `expect` on the chk3-nothing-new row, so the CHK.3 edit turns it red. It is needed and joins the Files line. In memory the card's lists are unchanged by adding it (src/** gives eng-all, already attached).
- **T4 test.** proof-slice.mjs:156 already exits 2 on an empty head. The test needs no stub spawn: run the tool with git off the PATH. It goes in the same test file.
- **Files line (Description).** Old line minus migrations/334_precommit_budget_registry_repin.sql plus src/tests/proof-slice.logic.test.ts. plan-protocol.md is not on the line and stays off. Under the folded table the card resolves to agents-s5-1to3, agents-s7-s11, eng-all, plan-protocol, five-words, inc-1 and ms-1 for its own review: five-words and plan-protocol stay because its range base has them (Q3), queue-137 and orchestrator-doc17 are off through its own branch table, and step-132, eng-back and eng-shared no longer attach.

## RR-0429 (dated notes kept short)
The plan owes one short dated note, under Spec 08 section 7 rule 4. The tooling kind loses queue-137, orchestrator-doc17 and five-words (9 lists become 6 for FILES_423), so the 3-files-at-most pins in rule-lists.logic.test.ts:980-990 have more room than before, and the cap is not at risk. No dated note is owed in Spec 137.

## For the operator
No question. Every open choice and every UNVERIFIED item was settled by the rules and the repo.
