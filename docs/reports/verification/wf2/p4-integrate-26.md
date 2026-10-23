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
- The same 10 rows move on both sets, all from excr5c's pre-NAMED-1c commits (0287394d..c77b1791: EXC-R5 rounds, R5-5 Johnston DATA flag M-308; not bisected to one commit): A0255/26NY #1-#4 and
  A0263/21NY #1-#6 leave NO ANSWER (6 MATCH, 3 DATA, 1 OWED). On the merged tree origin's C-3 by-law-changed rule (CHAT-63.C3) then moves
  2 of them, A0263/21NY #4 (10.20.40.10(6)) and #6 (10.20.40.20), from MATCH to BY-LAW CHANGED; A0573/24NY #6 was already BY-LAW CHANGED on origin.
- Floors (`--floors floors-172.json`): FLOORS OK. Measured overall accuracy 93.0 (floor 92), answered 75.6 (floor 71); 900.3.10 accuracy 86.4
  (floor 86), answered 88.0 (floor 81); 9 article floors + pooled pass.
