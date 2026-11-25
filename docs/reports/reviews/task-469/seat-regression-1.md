# Seat: regression: task-469 plan (PLAN-469-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board wf2/board head ce004d578. The plan names d5e8bd0bf, and the head has moved only by board commits. Files read:
- the whole task-469 card
- scripts/analysis/rule-lists.json (:5-22, :231)
- src/tests/backlog/rule-lists-table.logic.test.ts (:140-180)
- src/tests/backlog/rule-lists.logic.test.ts (ATTACK 11, :170)
- src/tests/backlog/check-lane-close.logic.test.ts (exempt cases)
- scripts/hooks/check-lane-close.mjs (:725-790, :836-860)
- Spec 08 :233 dated notes
- scripts/surfaces/emit-mobile-surfaces.mjs (:97-147)
- surface-validate.mjs, mcfront-proof.infra.test.ts, .husky/pre-push-checks.sh
- scripts/board/board-commit.zsh and board-ff.zsh
- git show c8efb23f5, 4b47e5119 and the 464 log
- MD:1520, :1687, :2421, :2613
I ran no test runner, no generator and no hook. I ran `rule-lists.mjs resolve` and a `matchesAny` node one-liner, both read-only.

Checked and clean:
- (1) Leaving the phone copies out in task-406 was not a ruling. Nothing in task-406, task-410, c8efb23f5 or the reviews says why. The item-3 text is only "Exempt generated snapshots from review material" (MD:1520), and 406's own list is "surfaces/*/*.{mobile,web,admin,pdf}.json ... report-page ...". The copy already existed (b51bdead0, 2026-11-10). A grep of the 406 and 410 review dirs and the V2 lane dirs for "mobile/__tests__/fixtures/surfaces" found no discussion at all. It looks like an omission, not a decision, and RR-0502 now rules A.
- (2) Exempting the copies from the review material contradicts neither the V2.WHOLE rule nor RR-0359. V2.WHOLE (task-410) says the whole change goes to the reviewer "minus the exempt paths", so an exempt list was part of it from the start. RR-0359 (MD:1687, "no exception for generated files") is about the order of the fold (grounder first), not about what the material covers. So the copies are the same class as the nine golden globs: generated, and byte-compared by an existing check. That check is an emitter `--check` rather than a golden-set check (see rg#3).
- (3) A name like `evil.goldens.json` in that directory does match the new glob. A node check printed `true` for evil.goldens.json, a.b.goldens.json and `.goldens.json`. It is caught by GEN-STRAY at emit-mobile-surfaces.mjs:141-145, which covers `[GOLDEN_COPY_DIR, '.goldens.json']`. The push suite does run it. surface-validate S-gen spawns the emitter with `--check`. `mcfront-proof.infra.test.ts` (:160 control, tree copy includes `mobile/__tests__/fixtures/surfaces` at :57) runs that check on a copy of the tree. The test config includes `src/**/*.test.ts`, and the `test` script excludes only `*.db.test.ts`. The real dir holds only the 4 expected copies (`git ls-files`). The look-alike cases in rule-lists-table.logic.test.ts:156-162 and ATTACK 11 are about a Files line of only exempt paths for a build task. ATTACK 11 is unaffected, because the new glob still resolves to the `mobile` row (resolve printed mobile-90) and list resolution is unchanged.
- (4) board-commit.zsh runs `git add backlog` only, and board-ff.zsh only fast-forwards from origin/wf1/mb-rulings (a refusal is a WARN line). Neither reacts to rule-lists.json changing on the board.
- (5) git log on the exempt key shows one change, c8efb23f5. Every later commit to the file touched other keys (464 touched a row). The plan undoes nothing there and keeps the 9 golden globs. Its test-count change (9 to 10) is the same pin that 406 added.

## rg#1 HIGH: the plan's order folds onto the board before the grounder has ruled, against RR-0359
Plan: section 7 steps 3 to 5, "Output review on the lane. Fold the work onto the local wf2/board. Close 469". No grounder step appears anywhere in the plan.
Evidence: MD:1687-1688 (2026-11-21 entry, operator verbatim "That's ridiculous to fold before the grounder review"): "nothing is folded onto the board before a separate grounder has ruled its output review, with no exception for generated files or for speed". The task-464 order was work commit 4b47e5119, then records ("grounder owed", bd32b3167), then close e332d3b26 ("grounder round 1 (0 confirmed, 2 rejected), BUILT"), then fold aca7d541d. So 464 folded after the grounder ruled and after close. The plan inverts that to fold, then close. The only reason is the :772 refusal, which compares the branch's `exempt` with the board's (check-lane-close.mjs:772).
Fix: make step 3 read "output review, then a separate output grounder rules and every confirmed finding is fixed or explained". Put the fold after that, and state that the fold-before-close order is forced by :772 and was not an earlier tooling card's order. Better still, add one line to the card asking the operator to confirm the order, since RR-0359 is his standing word.

## rg#2 MED: "precedent" for fold-then-close is not one; no earlier card changed the exempt key through the close check
Plan: section 3, "Folding before close is supported: the F8 test ... covers a lane folded into the base and closed afterwards"; section 7 steps 4-5.
Evidence: `git log -- scripts/analysis/rule-lists.json` shows `exempt` changed only in c8efb23f5 (task-406). The :772 rule is the V2.WHOLE round 4 "H1" rule, and I did not establish which of the two landed first (UNVERIFIED). Task-464 changed a row, not exempt, so it never met :772, and it closed first and folded second. check-lane-close.logic.test.ts:570-575 (F7 f) pins only the refusal when a lane widens exempt. I found no test of the legitimate order, an exempt-changing task folded and then closed (F8 not read in full: UNVERIFIED).
Fix: say in the plan that this is the first close under :772 for an exempt-changing task. Add to step 5 a read-only pre-check, `git show wf2/board:scripts/analysis/rule-lists.json` against the lane's table, before the closing commit. Otherwise a mismatch (for example a later board edit of exempt) shows up only as a refusal at close.

## rg#3 MED: the rule text at rule-lists.json:9 is left saying something the new glob falsifies
Plan: section 4 step 2, "No other key, row or field changes", and one new `$comment` line.
Evidence: rule-lists.json:9 reads "the `exempt` key (bare globs; no new field) also lists the golden snapshot files that one existing check validates ... (a test fails a golden glob with no named check) ... A code file, a script, the manifest states.json or a nested file is not matched". The new glob is a generated copy proved by a generator `--check` (GEN-HAND-EDIT, GEN-STALE, GEN-STRAY), not by "one existing check" (goldenProblems, screenArm, report-page-capture). The `CHECKS` list at rule-lists-table.logic.test.ts:146 gains a third kind of proof. The brief asks whether the plan records the change where the rule text lives, and this plan does not. It adds only a list line and a test line.
Fix: extend the :9 sentence by half a line: "and the generated phone copies of those goldens, proved by the generator's own --check (task-469, RR-0502)". The file is already on the Files line, and it needs no new field, so it is within RR-0392. Also note in the plan that the exempt `$comment` line is the only place the "proved by" claim is recorded; the test regex at :178 checks only the check's name, not that it exists.

## rg#4 MED: every other open lane is refused at close once the board holds the glob, and the plan names only 465
Plan: section 3 (465 must merge wf2/board) and the Blocks line in the description ("tasks 267 and 317 would meet the same refusal").
Evidence: check-lane-close.mjs:772 refuses any lane whose own `exempt` differs from the board's, and `git log --first-parent wf2/board` shows other lanes in flight (task-313 plan review at 5ad9ad9d6, and others). After the fold, every open build or fix lane that is not 465 (313, 267, 317 and any other) closes only after merging the board.
Fix: add one line to the "Card notes" in section 7, saying that after the 469 fold every open lane must merge wf2/board before its close, and put the note on each of those cards' lanes, not only on task-465.

## rg#5 LOW: the red proof for the new glob's stray-file case exists only because the plan adds it (this is good, but it is a new lock)
Plan: section 5 T4 (d), "stray copy ... `zz.goldens.json` added".
Evidence: surface-conformance.logic.test.ts:1162 pins GEN-STRAY for `mobile/src/generated/surfaces/x.json` only, so no existing test pins GEN-STRAY for the goldens-copy directory. The plan states this in section 2 ("There is no red proof for a phone copy today"). Timing: a lane can hand-write `mobile/__tests__/fixtures/surfaces/evil.goldens.json`. It passes the lane close unreviewed (exempt at :842) and is caught only by the push-station suite. The pre-commit and pre-push hooks never call the emitter (.husky/pre-push-checks.sh runs only the npm suite and mobile tests), though the suite includes mcfront-proof. That is the same timing as the nine existing golden globs, so it is not a new weakness. The one thing to confirm is that T4 stays in the suite the station runs (it is a src/tests file, so it does).
Fix: none required; state in section 6 that the stray case is caught at the station and not at the lane close, so nobody reads the exemption as a lane-time proof.

## rg#6 LOW: AC3 rests on an unrun size estimate
Plan: section 3, "Size check after the change (estimate) ... Unverified: I did not run lens-input".
Evidence: the refusal is scripts/analysis/rule-lists.mjs:434, bound :29 (97828). The card's own description says that tasks 267 and 317 "would meet the same refusal", so other large non-exempt files may exist: a `*.goldens.json` is not the only big generated file. The plan section 6 leaves `mobile/src/generated/surfaces/*.json` (11,717 bytes in all) in review, which is fine.
Fix: make step 7 of the order of landing an explicit gate: if lens-input still refuses a different file, stop and return to the operator rather than adding another glob under RR-0502 (which names only the phone picture copies).

## rg#7 NIT: stale head and two stale line numbers in the plan
Plan: "Head read: wf2/board d5e8bd0bf" (board is now ce004d578). Section 1 gives DoD line numbers moved at this head (the plan notes :497/:525 itself). The card's DoD :462/:490 are not touched by this card's two files.
Fix: restate the head read when the plan is folded.

STATUS: 7 findings (1 HIGH, 3 MED, 2 LOW, 1 NIT); the two-file change is the same class as the nine golden globs, but the fold-before-close order is not any earlier card's order and sits against RR-0359 until the grounder step is added.
