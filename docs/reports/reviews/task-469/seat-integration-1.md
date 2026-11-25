# Seat: integration: task-469 plan (PLAN-469-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: wf2/board head ce004d578. The plan says it read d5e8bd0bf; 4 board commits since then are records only. Files read: the task-469 card, FINDINGS-PLAN.md, rule-lists.json, rule-lists-table.logic.test.ts:140-185, emit-mobile-surfaces.mjs:95-175, surface-validate.mjs:22-42, check-lane-close.mjs (:125-131, :655-664, :725-790, :838-858), backlog-lane.mjs (:74-80, :191-196), mcfront-proof.infra.test.ts:52-60 and :165-185, rule-lists.mjs (:140-183), rule-lists.logic.test.ts:700-712. I also ran read-only git (merge-tree, diff, ls-files, show --stat) and greps. Nothing was written and no test runner was run.

## Checked and clean
- rule-lists.json:9-18 and :231 are as the plan says. Line 9 is the task-406 rule and lines 10-18 are the `$comment` lines for the golden globs. :231 is the exempt array, which has 11 entries: 2 `docs/reports/` globs and 9 golden globs. The last golden glob is `src/tests/fixtures/report-page/props/*.mobile.json`.
- rule-lists-table.logic.test.ts:145-180 matches. :146 is `CHECKS = ['goldenProblems', 'screenArm', 'report-page-capture.ts --check']`, :174 filters out `docs/reports/`, and :175 is `expect(golden.length).toBe(9)`. :178 builds the regex `esc(g) + '[^\n]*proved by[^\n]*' + esc(c)` against the joined `$comment` text.
- The proposed `$comment` line is `exempt <glob>: proved by emit-mobile-surfaces.mjs --check (...) (task-469, ...)`. The glob comes first, `proved by` follows on the same line, and the check name follows after it, so the regex matches. The trailing parenthesis does not matter because nothing is anchored at the end of the line. The line does not contain any other exempt glob as literal text; it only has the `<id>` placeholder form.
- `git ls-files 'mobile/__tests__/fixtures/surfaces/*.goldens.json'` returns exactly 4 files (disambiguation_map, search, semi_question, wall). Everything tracked under `mobile/__tests__/fixtures/surfaces/` is those 4 and nothing is nested, so the glob matches the four and nothing else.
- emit-mobile-surfaces.mjs matches the plan:
  - `buildOutputs` is :97-125, and :115 writes `${GOLDEN_COPY_DIR}/${id}.goldens.json`.
  - `checkOutputs` is :133-147, with GEN-HAND-EDIT and GEN-STALE chosen by input_sha and GEN-STRAY on the files that no surface owns.
  - main is :160-172 and sets exitCode 1 at :171.
- surface-validate.mjs:27 lists the generator in GENERATORS, and :28-36 spawns `--check` for each. S-gen is the first of the arms at :39.
- mcfront-proof.infra.test.ts: the COPY list at :55-58 includes `mobile/__tests__/fixtures/surfaces`. The canary b control at :169-174 and the hand-edit red at :178-183 are as the plan says.
- check-lane-close.mjs cites are exact: :129 BOARD_REFS, :729-731 board table read, :765-766 protected-path refusal, :772 the four-key compare, :787 exempt, :842 expectedPaths, :853-855 ownsTable, pin and judge.
- No other test pins the exempt list, its length or the `$comment` lines. The only exempt assertions are rule-lists.logic.test.ts:166 and :708-709, check-lane-close.logic.test.ts:579, which pushes its own glob into a planted table, and the table test itself. hooks-composition.infra.test.ts:343 only checks that the generated page is current. No docs or generated page list exempt globs, and README.md:154 and spec 08 only describe the key in general. The Files line is complete for the two-file change. Precedent c8efb23f5 touched the same two files plus the task file.
- rule-lists.json being protected only blocks a closing commit. check-lane-close.mjs:765-766 fires only when `moves` is non-empty, that is, when the commit moves a task to a finished status. The work commit is not refused for staging rule-lists.json.
- Launch gate and plan evidence:
  - `filesText` is `/(?:^|\s)Files:[ \t]*(.*)$/m` over the whole body (rule-lists.mjs:183). The Files line sitting in the plan section is found, and the Description has no `Files:` token.
  - The card is type fix, so check-lane-close.mjs:659-662 takes the lean branch. It needs at least one `plan-*.txt` with a valid REVIEW header, and compliance outputs are required only for `type === 'build'` at :638.
  - The review folder holds plan-error-paths.txt and plan-plan-review-deepseek.txt, so 2 lens outputs and 0 compliance outputs is right for a fix card.
- The landing order is accepted:
  - Between the work commit and the fold, the closing commit would fail only at :772, as the plan says.
  - The coverage range runs from the launch commit L (:838-842), not from the merge-base, so a lane already folded into the board still closes.
  - The close's pin forces exempt from the board, so the lane's own edit never applies to itself. Folding first is therefore required.
- The 19 board commits since 1aee693d6 touch no path outside `docs/reports`, `backlog/` and one task-343 card. The plan's risk (b), board paths joining 465's coverage range, is empty.
- Lane 465 (0aa1b011e) changed `docs/reports/generated/rule-lists-by-kind.md` and two `.goldens.json` copies, but not `rule-lists.json` or the table test. The merge adds no conflict on the exempt array.

## in#1 HIGH: the merge of wf2/board into wf2/mcfix465 is not clean, and the plan says nothing about it
Plan: section 7 step 6 and the section 3 risk list, "wf2/mcfix465 must merge wf2/board after 469 is folded". The risk list names only coverage paths.
Evidence: `git merge-tree --write-tree wf2/mcfix465 wf2/board` printed `CONFLICT (content): Merge conflict in backlog/tasks/task-465 - McFixV2.1-Search-box-the-Google-way-...md` (the only conflict). Both sides changed the card since the shared base 1aee693d6.
- The board side is 96556fb03, "third addendum (web rows are links)". It rewrote the `Files:` line, the web SearchBinding plan bullet and the tests bullet.
- The lane side is 0aa1b011e. Its diff adds the lane's own Files-line additions: src/tests/surfaces/admin-media.golden.test.ts, site-footer.logic.test.ts, contract-binding, parcel-legacy-oracle, search-reports-left, surface-conformance, surface-validate and nav-by-route.logic.test.ts, plus the three generated docs pages. It also adds a Build note.
The Files line is on one long line that both sides edited, so git cannot union it.
Fix: add to section 7 step 6 that the merge conflicts on the 465 card. The lane must resolve it by keeping the board's plan text and the union of both Files lines. A dropped lane entry would put a path outside the Files line, and the close check also unions the launch copy with the staged one (:864 `unionFiles`). The card is edited through the backlog CLI only. Name this as the one expected conflict so the lane does not abort or take either side whole.

## in#2 MED: the merge also depends on the lane being clean, and the plan gives no check or order
Plan: section 3, "465's lane must merge wf2/board after the 469 fold", then section 7 steps 6-7.
Evidence: check-lane-close.mjs:772 compares the branch table's `exempt` JSON with the board's byte for byte. The lane's exempt matches the old board's, so after the merge the merge result takes the board's new array. A conflict resolved wrongly on `rule-lists.json` would re-trigger :772. The lane did not touch rule-lists.json (`git diff --name-only 1aee693d6 wf2/mcfix465` shows only the generated rule-lists-by-kind.md), so this is safe today.
Fix: in step 6 add the check after the merge: `git diff wf2/board -- scripts/analysis/rule-lists.json` must be empty on the lane. Also say that the lane's regenerated rule-lists-by-kind.md must still match `page --check` (the page does not read exempt or `$comment`, so it is expected to stay green).

## in#3 LOW: stale sentence left in the Description
Plan: section 7 and section 1; the Files line sits in the plan section.
Evidence: the card Description still ends "Not planned yet: no plan, no Files line." The launch resolves from the whole body (backlog-lane.mjs:78 `resolveTask({... body: t.body ...})`), so the launch is not blocked. The sentence is now false.
Fix: one backlog-CLI note or Description line, "planned: PLAN-469-v1, Files line in the plan", at the launch commit, so the card does not contradict itself.

## in#4 LOW: loose cite for the exclude and for the stale-board remark
Plan: section 3, "backlog-lane.mjs:78, :193 `':(exclude,glob)<g>'` per exempt glob".
Evidence: :78 is the `readTable`/`resolveTask` line. The `:(exclude,glob)` string is only at :193, built from `ruleTable?.exempt`, the table of the checkout the launch runs in. The brief's command is made at launch from the lane's table, not from the board's.
Fix: cite :193 only for the exclude. State that the 465 brief shows the new exclude only if the launch table already holds the glob. Otherwise the lane builds the material from the exclude list by hand, as step 7 already says.

## in#5 NIT: the plan's head, and one cited number
Plan: "Head read: wf2/board d5e8bd0bf".
Evidence: the board is now ce004d578, 4 record commits later. The line cites still match at this head.
Fix: none needed. Update the head line when the orchestrator re-locks.

STATUS: 5 findings (0 CRITICAL, 1 HIGH, 1 MED, 2 LOW, 1 NIT); the two-file change is sound, and the one real gap is the card-file merge conflict when lane 465 merges the board after the fold.
