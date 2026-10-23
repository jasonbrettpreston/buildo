# Verification index — wf2/p4-integrate-26

R-EZ says: *"Findings block the integration until fixed or ruled. The verification report is saved under
`docs/reports/verification/<branch>.md` and the integrate commit cites it."*

Independent verifiers read the branches only: verify-45 (`~/Buildo-scratch/verify-45.md`) for p3plan @ 3765edd5, abs73 @ c748b78f and the
trial merge (item C); verify-45b (`~/Buildo-scratch/verify-45b.md`) for p3plan @ 91c12d81 (the verify-45 A3 BLOCK fix, PASS-WITH-NOTES).

- **Integrate base:** `9fd4ca4f` (= origin `wf2/deep-scrapes-restore-l0`, integrate-25)

## Merged branches (in order)

| # | Branch @ tip | Verdict |
|---|---|---|
| 1 | `wf1/rulings-rec3` @ `d4d96b79` (contains rulings-rec2 `4a271c0b`; CHAT-88/89 rows, CHAT-90 R-JG note) | register/decision-log rows; regenerate-checks below |
| 2 | `wf1/excr5c` @ `4611d881` (CHAT-87.NAMED-1c + twin sweep) | trial-merged by verify-45 C |
| 3 | `wf1/p3plan` @ `91c12d81` | verify-45 BLOCK (A3) fixed; verify-45b PASS-WITH-NOTES |
| 4 | `wf1/abs73` @ `c748b78f` | verify-45 PASS (B1-B4) |

Not merged: `wf2/fleet-night-2210`, `wf2/coa-cost-emits`, the V3-COA lanes, anything staged in ~/Buildo-wt-rulrec2.

## Conflicts and resolution

Every conflict was in a generated or pinned file and was resolved only by its generator (no hand merge):

| File | Where | Resolution |
|---|---|---|
| docs/reference/bylaw-layer2-input.json | excr5c, abs73 | `generate-bylaw-layer2-input.mjs --write` (table_version 0c43a728 after excr5c, dce1674c after abs73) |
| docs/reference/maxbld-report-field-inventory.{md,json} | excr5c, abs73 | `report-fields.mjs --write` (vocab.json / input sha pins only) |
| docs/reference/logic-variables-registry.md | p3plan | `generate-logic-vars-docs.mjs --write` (840 vars, 37 migration-only, houseplex_min_units from migration 286) |
| scripts/analysis/bylaw-validation/coa-expected/expected-{172,4d}.json | abs73 | `coa-scorecard.mjs --pin` on the merged tree (CHAT-65.repin) |

Semantic (no textual conflict): docs/reference/maxbld-amendment-index.json embeds `layer2_table_version`; regenerated with
`scripts/analysis/phase3/generate-amendment-index.mjs --write` after p3plan and again after abs73 (amendment-index.logic 4/4).

## CoA re-pin (CHAT-65.repin; floors CHAT-63.C5)

Same values-only data (~/Buildo-scratch/coa-data, unchanged since 2026-10-21; base 9fd4ca4f still CHECK OK on its own pin).

| Set | Base 9fd4ca4f pin | Merged tree |
|---|---|---|
| 172 | MATCH 383, DIFFER 29, NO ANSWER 56, OWED 87, DATA 21, NOT SCORABLE 25, NOT MODELLED 96, BY-LAW CHANGED 1 | MATCH 387, DIFFER 29, NO ANSWER 46, OWED 88, DATA 24, NOT SCORABLE 25, NOT MODELLED 96, BY-LAW CHANGED 3 |
| 4D | MATCH 273, DIFFER 23, NO ANSWER 43, OWED 55, DATA 19, NOT SCORABLE 12, NOT MODELLED 70, BY-LAW CHANGED 1 | MATCH 277, DIFFER 23, NO ANSWER 33, OWED 56, DATA 22, NOT SCORABLE 12, NOT MODELLED 70, BY-LAW CHANGED 3 |

Row-level attribution (scored per commit, rows keyed notice#n + clause):
- NAMED-1c (c77b1791 -> 4611d881): 0 of 698 and 0 of 496 rows move, as the lane reported.
- abs73 (merge-base 0287394d -> c748b78f, and efc662e5 -> merged tree): 0 rows move on either set; totals identical.
- p3plan, rulings-rec3: 0 rows move.
- The same 10 rows move on both sets, all from excr5c's pre-NAMED-1c commits (0287394d..c77b1791). verify-46 bisected them:
  **77c05a26** (EXC-R5 round, keys exception 559 in shard w2-s31; the 559 literal correction is one of the six EVE.R5-4 approved) takes all 10
  out of NO ANSWER (`exception_not_authored:900.3.10(559)`): 6 MATCH, 1 OWED, 3 DIFFER. **82575521** (R5-5, EVE.R5-5 = M-337) moves those 3 DIFFER
  (A0255/26NY #2, A0263/21NY #1, #2) to DATA. So A0263/21NY #4 and #6 became scorable through 77c05a26 / EVE.R5-4, not R5-5 (verify-46 N1; the
  63cd7c10 message says "R5-5 rows", which is wrong in the same way, and a commit message cannot be changed). On the merged tree origin's C-3 rule
  (CHAT-63.C3) then moves A0263/21NY #4 (10.20.40.10(6)) and #6 (10.20.40.20) from MATCH to BY-LAW CHANGED. A0573/24NY #6 was already BY-LAW
  CHANGED on origin.
- Floors (`--floors floors-172.json`): FLOORS OK. Measured overall accuracy 93.0 (floor 92), answered 75.6 (floor 71); 900.3.10 accuracy 86.4
  (floor 86), answered 88.0 (floor 81); 9 article floors + pooled pass.

## Commits on wf2/p4-integrate-26

| sha | what |
|---|---|
| `6419d086` | merge 1, rulings-rec3 @ d4d96b79, clean |
| `87e2b403` | merge 2, excr5c @ 4611d881; layer2 input + report-field inventory regenerated |
| `efc662e5` | merge 3, p3plan @ 91c12d81; logic-variables-registry + amendment index regenerated |
| `e91012e2` | merge 4, abs73 @ c748b78f; layer2 input, inventory and amendment index regenerated, CoA 172 / 4D re-pinned |
| `d4234906` | M-251 dated note: CHAT-84.TWIN-1 supersedes M-251 / CHAT-29.F-SC-7 for 900.3.10(70)(B) (Spec 133 §m.350 (M-350) note); chat-rulings-register lock (red first) |
| `63cd7c10` | coa-round C-3 lock BY-LAW CHANGED 1 -> 3 (semantic merge break, see the CoA re-pin section) |

## Checks (targeted only; no DB, no full suite)

- decision-log --check: 66 logs, 298 decisions, 197 register rows, 388 citations, clean. spec-split-check --check: clean. Step and by-law handbooks
  --check: up to date (Spec 133 386 rules). golden-lots-cases --check: rc 0 (verify-45 A7). Every pre-commit generator --check: rc 0. system-map regenerated, no diff.
- Vitest (bylaw-*, coa-*, steps/compute_maxbld_scenarios, steps/resolve_bylaws, chat-rulings-register, decision-log, seed-p5*, golden*): 149 files,
  4320 passed, 936 todo, 0 failed (after 63cd7c10). Migration/registry infra tests (16 files): 237 passed.
- `tsc --noEmit`: clean. `step-validate --all --fast`: exit 0, 0 HARD STOP lines.

## Owed (not done here)

- 29 step scorecard blocks in docs/reports/*-assessment.md are stale by one line each: `migrations count=275` is now 276, because p3plan adds migration 286.
  `step-conformance.infra` "the generated scorecard block is not stale" fails 29 of 29 until they are regenerated. The regenerator is
  `step-validate --all --write`. Its `--write` path opens a DB pool for descriptors that declare invariants (step-validate.mjs:5967-6022), so it was
  not run in this no-DB lane. Run it when the DB and the full-suite slot are free, before the full `npm run test` / `test:db` of this integrate.
  This is the same regeneration integrate-25 did in 895e326d.
- Full `npm run test` and `npm run test:db`: not run (fleet-night slot).

## Follow-up after verify-46 (PASS-WITH-NOTES, ~/Buildo-scratch/verify-46.md)

| sha | what |
|---|---|
| `16def4b3` | merge 5, `wf1/rulings-rec3` @ `18aa1f7c` (CHAT-91 B-1..B-5 dated notes). 375f928f (CHAT-92) is **not** taken; it is being re-ruled. Conflict: bylaw-layer2-input.json, regenerated with --write (`bylaw-rule-map.json` is a Layer 1 input, table_version f2ffa064). The amendment index was regenerated. The CoA pins were re-pinned because the inputs moved. 0 of 698 and 0 of 496 rows move. |
| `a735a534` | merge 6, `wf1/excr5c` @ `8eaa1872` (CHAT-91 B-2: 9 units; B-3: 6 rows). Conflicts: the layer2 input and the report-field inventory .json/.md, both regenerated (table_version bade4a18). The amendment index was regenerated. CoA was re-scored: **0 of 698 and 0 of 496 rows move**, and both sets give CHECK OK on totals. They were re-pinned because the inputs moved. Floors OK. |
| `0249ebf0` | verify-46 notes N1, N2, N5, N6 (this section) |

- **N1** (attribution): the coa-round.logic.test.ts:139-141 comment and the CoA section above now name 77c05a26 / EVE.R5-4 as the commit and ruling that made the rows scorable.
- **N2** (stale ruling text): the source of truth is `scripts/seeds/bylaw/vocab.json` `explained_differences` 10.5.40.50(2) and 900.3.10(559)(A), at :1151-1152 and :1163-1164. Both entries now have `ruling` M-337, and their `reading` text drops "NEW RULING NEEDED (HELD on R5-5 … M-308 …)". It now cites `2026-10-22-page-eve#EVE.R5-5` (M-337) and M-355 (`2026-10-23-batch-b#CHAT-81.CITE-1`: "the 63 Johnston Ave DATA flag rests on M-337 (not M-308)"). Two related text changes:
  - The scorer prefix at coa-scorecard.mjs:404 changes from "R5-5 HELD" to "R5-5".
  - In the coa-explained.mjs:24-25 and :41 messages and comments, "HELD" becomes M-337.
  
  The locks coa-scorecard-r5-5 and coa-explained-r5-5 now expect `explained_by` = M-337 and the ruled wording. They were red first: 2 of 4 failed (~/Buildo-scratch/int26/red-n2.txt). The regenerated outputs are the layer2 input (table_version 5f45ea01), the report-field inventory and the amendment index. The CoA pins were re-pinned. 0 rows move, the totals are unchanged and the floors are OK.
- **N3/N4**: cosmetic, so they were left alone. The pins are now re-taken at each merge, so each merge commit passes --check on its own pins.
- **N5 (verify-45b carry-overs)**: these are still open.
  - src/tests/fixtures/l2-option4-columns.json is a hand copy of the **uncommitted** ~/Buildo-wt-l2slices2/migrations/282_resolve_bylaws.sql (sha256 1bf4b72072e4016e575e7f0195111941c0d5801e102ead239228986ac4cc078c). Replace it with a read of the committed 282, or diff it against 282, at the integrate that lands 282.
  - The P3-7 draft ~/Buildo-wt-p3plan/migrations/287_compute_maxbld_scenarios.sql is **uncommitted**. Its header (:4) says "The logic variables are migration 283", and it should say 283 + 286. Fix that when the draft becomes step commit 1.
- **N6 (finding for the seed owner; seed data not changed here)**: scripts/seeds/bylaw/amendments.json:3303-3312 gives 474-2023 `enacted_on` 2023-05-15 but `in_force_on` 2023-05-12, three days before it was enacted (basis "S0.5 spike §2.6", verified 2026-10-07). The C-3 result does not change, because either date is after the 2021-11-04 hearing of A0263/21NY. The seed owner should re-verify the date against the primary source.

## Hook warnings investigated (non-blocking; pre-existing at 9fd4ca4f; no merged branch causes them)

- **"ACCURATE: FAIL" / "UNDERSTANDABLE: FAIL"** are printed by `generate-bylaw-provisions.mjs --check` (scripts/analysis/bylaw/validate.mjs:169-176 `wordVerdicts`). A word reads PASS only when every one of its pre-commit gates is `pass`. `--validate` at the tip shows that every gate of both words passes except one each, and those are `not_run`, not failing:
  - ACCURATE: G-CODE (validate.mjs:439-444) has arm `linkage_i` not_run, because "0 authored rows carry code_refs".
  - UNDERSTANDABLE: G-READ (validate.mjs:415-421) has arm `explanations` declared `unbuilt` (validate.mjs:158), so "not built, 1686 input(s) unchecked".
  - The base 9fd4ca4f prints the same two FAIL lines. Only the complete/pending counts differ (1335 there, 1612 at the tip, because of the keying that landed).
  - These are unbuilt gates, not defects in the merged work, and building them is out of scope.
- **"gates FAIL (report-only): RF-2, RF-5, RF-6, RF-8, RF-10"** are printed by `scripts/analysis/report-fields.mjs` (:611 "gates (closed answers, report-only)"; :615, :631, :632, :653, :674). The rows in docs/reference/maxbld-report-field-inventory.md:19-27 are byte-identical to the base's:
  - RF-2 and RF-6: S-072 `lots[].newNearbyCoaRuling` is unproduced and has no kind.
  - RF-5: `parcel.areas.realized_fsi_p90` reads its own prior value.
  - RF-8: the S-001 field_whitelist misses three area columns.
  - RF-10: S-001 area fields reach the banned STAND_SET input `parcels.bylaw_standard_setback_m`.
  
  All five are pre-existing report-only surface findings (Spec 69 M-69 inventory) and are not touched by any merged branch.

## Checks after the follow-up (tip before this index commit: 0249ebf0)

- All pre-commit generator --checks, plus schema-to-vocab and generated-docs: rc 0.
- decision-log --check: clean (67 logs, 303 decisions, 197 register rows, 393 citations).
- spec-split-check --check: clean. Step and by-law handbooks (386 rules): up to date.
- golden-lots-cases --check: rc 0. system-map: no diff.
- Targeted vitest (the same 149 files): 4325 passed, 936 todo, 0 failed.
- Migration/registry infra (16 files): 237 passed.
- tsc: clean.
- step-validate --all --fast: exit 0, 0 HARD STOP lines.
- Still owed: the 29 stale scorecard blocks (`migrations count=275` should be 276) and the full test / test:db runs. verify-46 item 6 gives the operator order.

## P3-HOLD-1 (operator 2026-10-23, option A; held pending CHAT-94 import; Spec 132 §core.1 (Rule-1), §x-stages.2 (R-EQ))

The operator full run (2758dc63) failed step-conformance §5.5 "the compute corpus is not empty". `scripts/lib/compute/compute-maxbld-scenarios.js`, the p3plan ② compute, has no manifest step file, because P3-7 step commit ① is held.

The fix follows the lane V3-COA-G precedent: the module and its test `src/tests/steps/compute_maxbld_scenarios/compute-module.logic.test.ts` (40 tests) now sit outside the tree, in ~/Buildo-scratch/p3build/held/. They are byte-exact copies, recorded with blob ids and sha256 in APPLY.txt, and are restored in the same commit as P3-7 step ①.
- The PHASE3_MODULES entry at phase3-code-link.mjs:21 is dropped.
- The renovation-shared.js:10 comment points at the held copy.
- The pure `scripts/lib/maxbld-*.js` modules and their tests stay in the tree.
- The wf1/l2-option4-land staged edit of the same test (verify-45b N2: read the committed migration 282) belongs to the held test. It is kept in the held folder as the lane's full file plus a patch. At the l2-option4-land merge, the modify/delete conflict on that file resolves to the deletion.

After the hold: step-conformance.infra plus steps/compute_maxbld_scenarios give 11 files and 893 passed (§5.5 green). Every generator --check gives rc 0. The orphaned fixture `src/tests/fixtures/l2-option4-columns.json` stays in the tree, and the l2land lane deletes it.

## Merge 7: wf1/excr5c @ beb769f3 (CHAT-91.B-2 correction 760440a4, CHAT-93.E-1 / E-2)

- **The defect it fixes:** 8eaa1872, merged at a735a534, set the disclosure to none on 4 units that do **not** compute: 303 (D), 852 (C)(i), 852 (E)(i) and 713 (C)(i). That would have hidden real limits.
- **What the merge changes:**
  - 760440a4 restores those 4 disclosures.
  - beb769f3 (CHAT-93.E-2) corrects the gaps text on 323 (C), 900.4.10(70) (A)(i) and 714 (C)(i).
- **Net result:** int26 carries **CHAT-91 B-2 = 5 units**, not 9: 323 (C), 1032 (C)(i), 900.4.10(70) (A)(i), 714 (C)(i) and (D)(i).
- **Conflict:** only bylaw-layer2-input.json. It was regenerated with --write (table_version 786fbe40), then the amendment index with --write.
- **CoA:** re-scored, and 0 of 698 and 0 of 496 rows move. Both sets CHECK OK on totals. Both were re-pinned because the inputs moved. Floors OK.

## Operator DB run 2 (tip 24bc14ee; lock held by the operator, no migrations; logs ~/Buildo-scratch/int26/db-run2/)

The first operator run (2758dc63) applied migration 286 (--only). It failed 2 files:
- admin-lead-schemas.contract failed on a worktree environment gap: mobile/node_modules was missing. It now has an APFS clone of ~/Buildo/mobile/node_modules, as the night tree has. No code changed.
- step-conformance §5.5 failed; fixed by P3-HOLD-1.

Run 2 results:
- `step-validate --all --write`: OK. 29/43 V3, E1 PASS, no HARD STOP. It rewrote all 43 assessment blocks (29 converted + 14 pending steps). Each block's Test suite now reads `suite success=true`, "failing: none". The 5 previously held pending blocks (permits, assert_entity_tracing, assert_network_health, assert_staleness, assert_lifecycle_phase_distribution) are settled: Rule 2 is enforced-green, with no enforced-red row and no hard stop in any block. Committed as generator output.
- `npm run test`: 889 files, 20,190 passed, 0 failed.
- `npm run test:db`: 893 passed, 0 failed.
