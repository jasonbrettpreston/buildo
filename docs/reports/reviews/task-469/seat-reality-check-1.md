# Seat: reality-check: task-469 plan (PLAN-469-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board head ce004d578 (wf2/board). The plan says it read d5e8bd0bf. The commits since touch only docs and backlog files, and the cited lines still match (rule-lists.json:231 `"exempt"`, rule-lists-table.logic.test.ts:175 `toBe(9)`).
- Files read: the whole task-469 card; rule-lists.mjs:25-31 and :425-440; rule-lists.json exempt; emit-mobile-surfaces.mjs buildOutputs, checkOutputs and main; surface-validate.mjs:20-60; .husky/pre-push-checks.sh; mcfront-proof.infra.test.ts:40-70 and :160-200; the Files lines of tasks 267 and 317.
- Measured in ~/Buildo-wt-mcfix465 with read-only git, wc and du.
- Not run: lens-input, any test, any generator.

## Checked and clean
- **AC3 holds.** The command was `git diff 2fd2f6042 0aa1b011e --name-only` with `git diff ... -- <file> | wc -c` per file.
  - The range has 86 files, 9782 insertions and 6423 deletions.
  - The refused file is 264507 characters, matching the card's 264565. It is the only one over the bound.
  - Every other file is under 97828, the room the tool states. The largest non-exempt remainders are:
    - task-267 card, 44304
    - task-465 card, 35465
    - scripts/surfaces/_schema/bindings.json, 25865
    - mobile/__tests__/parcelSearchScreen.behaviour.test.tsx, 23114
    - scripts/surfaces/_schema/census/mobile-product.json, 18233
    - src/components/surfaces/web/SearchBinding.tsx, 18012
    - the semi_question phone copy, 14100
    - docs/reports/generated/127-surface-registry.md, 14098
  - The other large files are already exempt: context-r2.md at 96683 is under `docs/reports/reviews/**`, and the `.mobile.json` and `.web.json` fixtures such as ambiguous.mobile.json at 69040 match existing globs.
  - mobile/src/generated/surfaces/mobile_parcel_search.json is 12 lines in the diff, and the census and the registry stay under 20 KB. None of them tips the bound. The plan's section 10 "estimate" is true.
- **Line counts match.** `--numstat` shows 2700+2143 = 4843 for the search copy and 31+31 = 62 for semi_question.
- **Four tracked copies.** `git ls-files mobile/__tests__/fixtures/surfaces/*` returns exactly the four the plan names.
- **The proof claim (3) is true.** The path is .husky/pre-push-checks.sh:14 (`step suite ... npm run test`), then mcfront-proof.infra.test.ts.
  - The suite's include is `src/**/*.test.ts`, and the file sits in src/tests/surfaces.
  - The COPY list carries `mobile/__tests__/fixtures/surfaces` and `scripts/surfaces`.
  - The "canary b control" runs `runCli(t, GEN, ['--check'])` and `green(g)` on that copy.
  - GEN is emit-mobile-surfaces, and the gate `--check` also spawns it via surface-validate.mjs GENERATORS (:25).
  - A hand-edited real phone copy is copied into the tree, `checkOutputs` returns GEN-HAND-EDIT or GEN-STALE, the exit is 1, and the control test goes red.
- **No hand-written content is hidden (4).** buildOutputs writes `${GOLDEN_COPY_DIR}/${id}.goldens.json` as `text({ $comment, surface: id, goldens })`.
  - `goldens` is built only from `readdirSync(gdir)` of `*.mobile.json` files under src/tests/fixtures/surfaces/<id>.
  - `$comment` is a constant plus a sha.
  - Those sources are already exempt (`src/tests/fixtures/surfaces/*/*.mobile.json`).
  - Nothing else is mixed in. Those fixture sources stay in the review set; the hand-edited `mobile/__tests__/fixtures/parcelSearch.situations.json` and `mobile/src/generated/surfaces/*.json` are correctly left out.

## rc#1 LOW: the card says 267 and 317 "would meet the same refusal", but the new glob does not touch their changes
Plan: Description line "tasks 267 and 317 would meet the same refusal". Section 6 does not examine this.
Evidence: the Files lines read with `grep -n '^Files:' backlog/tasks/task-267*` and the same for 317.
- Neither line names `mobile/__tests__/fixtures/surfaces/*.goldens.json` or any `mobile_parcel_search`, `semi_question`, `disambiguation_map` or `wall` file.
- They name `mobile/src/generated/surfaces/mobile_parcel_detail.json` (437 bytes) and `src/tests/fixtures/report-page/props`. The props directory holds only `*.mobile.json` files (8), which are already exempt.
- Detail is a report surface with "No goldens copy" (emit-mobile-surfaces.mjs, comment above the `report` loop).
- Task 267's line also lists docs/reports/generated/127-surface-registry.md (1,557,199 bytes), scripts/surfaces/_schema/census/contracts.json (1,656,138) and census/mobile-product.json (665,024), all non-exempt.
- Their diffs in 465 were only 14098 and 18233 characters. A diff of those files stays small unless the generator rewrites most of them. This is UNVERIFIED for 267 and 317.
- The glob neither helps nor hurts them.
Fix: add one sentence to section 6: "267 and 317 change none of the four copies; this card does not unblock them; if their generated pages produce an over-bound diff, that is a separate card."

## rc#2 NIT: section 2 under-states how a hand-edited real copy goes red today
Plan: Section 2, "There is no red proof for a phone copy today", and the `$comment` line "red proof in src/tests/backlog/rule-lists-table.logic.test.ts".
Evidence: mcfront-proof.infra.test.ts control, `green(g)` on `runCli(t, GEN, ['--check'])`, on a tree that copies `mobile/__tests__/fixtures/surfaces`.
- A hand-edited real copy turns that control red today. That is the standing proof on the real files in the push station suite.
- The new T4 proves on a synthetic edit that the checker names GEN-HAND-EDIT, GEN-STALE and GEN-STRAY. It does not prove the real files.
- So "no red proof" is true only for the named per-copy red case. The `$comment` should name both: T4 (the checker goes red on a bad copy) and mcfront-proof canary b control (the real copies are clean in the push suite).
Fix: add the second name to the `$comment` text and the T1 pattern. This costs nothing and states the "already runs" claim in its true place.

## rc#3 NIT: T4's copy is about 10 MB, not 9
Plan: Section 6 risk (a), "about 9 MB (scripts/surfaces 7.6 MB, fixtures 1.2 MB)".
Evidence: `du -sk` on the real trees gives scripts/surfaces 7764 KB, src/tests/fixtures/surfaces 1328 KB, mobile/__tests__/fixtures/surfaces 360 KB, mobile/src/generated/surfaces 20 KB, scripts/seeds/logic_variables.json 564 KB.
- The sum is about 10.0 MB by block count. The plan's two named parts are right and add up to 9.1 MB.
- The mobile and seeds parts add roughly 0.9 MB. The surface-conformance emitCopy list also copies the seeds file. Not material.
Fix: write "about 10 MB".

## rc#4 NIT: head drift
Plan: "Head read: wf2/board d5e8bd0bf".
Evidence: `git log d5e8bd0bf..HEAD` shows 4 docs-only commits to ce004d578. The diff of scripts/analysis and src/tests/backlog is empty.
Fix: none needed; restate the head at fold time.

STATUS: 4 findings (0 CRITICAL, 0 HIGH, 0 MED, 1 LOW, 3 NIT); the plan's numbers and real-world claims are true. After the exclude no non-exempt file in task-465's diff is over the bound (largest 44304 against 97828), so AC3 holds. The only correction needed is the card's claim about 267 and 317.
