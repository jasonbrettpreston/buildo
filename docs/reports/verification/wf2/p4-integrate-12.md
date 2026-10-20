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
