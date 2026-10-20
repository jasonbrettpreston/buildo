# Verification index — wf2/p4-integrate-12

R-EZ (Spec 124 §5 register; verification before integration, operator y 2026-10-20). Every branch merged by
`wf2/p4-integrate-12` was verified by a lane that did not write it (verify-12a … verify-12h), read-only. The
per-branch reports are copied verbatim from the verify lanes' scratchpad into this directory's parent
(`docs/reports/verification/`).

- **Integrate base:** `5f1cc5ba` (= `origin/wf2/deep-scrapes-restore-l0` = integrate-11 tip)
- **Collision plan:** verify-12g's integrate-12 plan (section numbering, rule-id allocation, ledger merge, M35).

## Merged branches (in merge order)

| # | Branch @ tip | Verdict | Reports |
|---|---|---|---|
| 1 | `wf2/handbook-1` @ `316c8f38` | **PASS-WITH-NOTES** (b36b7ccb BLOCK → a864e66c BLOCK (narrow, E28) → 316c8f38 PASS-WITH-NOTES) | [`../wf2-handbook-1.md`](../wf2-handbook-1.md), [`../wf2-handbook-1-fix.md`](../wf2-handbook-1-fix.md), [`../wf2-handbook-1-fix2.md`](../wf2-handbook-1-fix2.md) |
| 2 | `wf2/v3-backfill-9` @ `b0ce5ba4` | **PASS-WITH-NOTES** (a906623f BLOCK (g1-21 / R-FL) → b0ce5ba4 PASS-WITH-NOTES) | [`../wf2-v3-backfill-9.md`](../wf2-v3-backfill-9.md), [`../wf2-v3-backfill-9-fix.md`](../wf2-v3-backfill-9-fix.md) |
| 3 | `wf2/tooling-fix-1` @ `3d2e1e08` | **PASS-WITH-NOTES** (47de0640 → ca807582 → 3d2e1e08, each PASS-WITH-NOTES) | [`../wf2-tooling-fix-1.md`](../wf2-tooling-fix-1.md), [`../wf2-tooling-fix-1-followon.md`](../wf2-tooling-fix-1-followon.md), [`../wf2-tooling-fix-1-fix2.md`](../wf2-tooling-fix-1-fix2.md) |
| 4 | `wf1/answers-batch-5` @ `1309de7b` (brought in by 5) | **PASS-WITH-NOTES** | [`../wf1-answers-batch-5.md`](../wf1-answers-batch-5.md) |
| 5 | `wf1/answers-batch-6` @ `db911e8d` (contains 4) | **PASS-WITH-NOTES** (a444e245 BLOCK (B1 unauthorized pins) → db911e8d fixed by option (a)) | [`../wf1-answers-batch-6.md`](../wf1-answers-batch-6.md), [`../wf1-answers-batch-6-fix.md`](../wf1-answers-batch-6-fix.md) |

## Commit order note

Three per-branch reports cite register rows that do not exist at the integrate base (`Spec 124` + an id
after R-FB), which `spec-split-check --check` arm (iii) would reject as dangling at pre-commit. As in
integrate-11, they are committed verbatim immediately after the merge that introduces the id:

- `wf2-v3-backfill-9.md`, `wf2-v3-backfill-9-fix.md` (cite R-FL) — after the `wf2/v3-backfill-9` merge;
- `wf2-tooling-fix-1-fix2.md` (cites R-GS) — after the `wf2/tooling-fix-1` merge.

All other reports land in the first integrate commit with this index.

## Integration actions taken on the verify findings

- **124a numbering (final):** §B17–§B20 unchanged (base); backfill-9 §B20 → **§B21** (register rows R-FC…R-GO, M34), its §B21 → **§B22**; tooling-fix-1 §B20 → **§B23**; new **§B24** = M35 (register rows R-DU, R-DV, R-DX…R-EP). Every citation re-anchored (M34 `to_anchor`, the Spec 124 M34 stub, Spec 124 R-GP…R-GT, the citations JSON `$comment`). Bundled RE-FREEZE night items renumbered: (5) integrate-11 N-D22, (6) backfill-9 condition-9 citations (was (5)), (7) tooling-fix-1 last_measured resync + R-GT re-citations (was (5)).
- **Rule ids:** R-FC…R-GO (backfill-9), R-GP…R-GT (tooling-fix-1), no collisions; allocation line "through R-GT, next free R-GU".
- **M35 (spec-split-check `--refresh`):** the union was 384/380 lines, 130,429/126,959 B. 21 rows moved to 124a §B24; Spec 124 lands at 367 lines / 101,205 B before the R-GR integration note (final size in the follow-up commit message). `spec124-register-locks` and `spec-split.infra` cover M34/M35.
- **Defect ledger:** tooling-fix-1's status cells (R-GR form) + backfill-9's source cells. **LC-D12 → `CLOSED · declared deviation (R-FV)`**: the operator-authorized load_centreline plan (2026-09-24) declares the single-call validation as deviation LC-D12 (`docs/reports/2026-09-24-plan-batch2-p3-2-load-centreline.md`:59, :101) and R-FV names "validation batching"; the operator's 2026-10-20 "close LC-D12 if covered" allows it. **N-D1 stays `OPEN · **PIN** RULING-OWED`**: its plan lists NB-D1 under "Rulings resolved without the operator" (`docs/reports/2026-09-25-plan-batch2-p3-8-neighbourhoods.md`:123-124, Fold CF-4 by a review seat), and the operator ruled N-D1 owed on 2026-10-20 (queue snapshot :1659). backfill-9's R-FY citation was removed from the N-D1 row and citations entry g3-45 reclassified (c), as verify-12c did for g1-21. LC-D7, LC-D11, M-D10, N-D5 keep tooling-fix-1's single specific rule.
- **rule-map.json:** +44 entries (R-FC…R-GO, R-GP…R-GT); W4A-R1…R6 superseded by R-FC…R-FH; `meta.pending_integration` and `meta.register_rows_owed` emptied; `unenforced[]` stays 67 (ceiling 67). New locks name each id: a condition-9 record block in `v3-label-enforcement.logic` (R-FI…R-GO, except R-GF, historical), an R-GT block in `ledger-status-form.logic`, rule-map comments for R-FC/R-FE/R-FG/R-FH/R-GS on existing assertions.
- **Pre-commit:** 14 chain-era generator arms; `hooks-composition.infra` says 14; `precommit-budget.json` re-measured.
- **Generated files** regenerated by their generators (scorecards via `step-validate --all --write --fast` under the DB lock; handbook; system map; answer tracker). `measured-validate.json` was left unchanged by the `--write` (R-GP).
- **Follow-up commit:** verify-12h A N1 (scope pin id and ruling in the same 69a entry), verify-12h B N1 (p2c4 C1–C3 run against a temp copy), verify-12d N5/N6/N7 (link.4 averaging, Intent Ledger vocabulary, "P0"), and three operator confirmations recorded in Spec 69a.
- **V3 labels on the merged tree: 4, not 2.** geocode_permits and link_parcel_abutments as before, plus compute_centroids and assert_engine_health. At the base both read 17/17 and failed only R-EY (9) (`grandfathered:compute_centroids` and `spec_version:not_executed`, no rule id); backfill-9's applied citations (R-FO; R-BH) now resolve them. They were V2 at backfill-9's own tip only because that tip lacked integrate-11's scorecard work. The E1 high-water mark (`v3-label-high-water-mark.json`, grows only) still lists 2: ratcheting it is left to the operator (PIN V3-RATCHET-INT12).
