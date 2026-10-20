# Verification: wf2/report-schema fix 6e97f7c1 (verify-13 notes)

- Branch: `wf2/report-schema` @ `6e97f7c1` (parent 326eca17). Lane: verify-13b (R-EZ, read-only), 2026-10-20.
- Detail: `b/rs-detail.md`; mutation runs `b/rs-mut-b.mjs` / `.out`; lineage queue comparison `b/rs-lq.cjs`; merge check `b/rs-merge-check.out`. Throwaway worktrees were removed cleanly.

## Verdict: **PASS-WITH-NOTES**. The branch is green on its own. **On a merge with bylaw-fix-1 it is RED until an integration fix commit lands (F2).**

| # | Check | Result |
|---|---|---|
| 1 | Full suite at tip (`b/log-rs`) | **18,077 passed / 4 skipped / 0 failed** |
| 2 | tsc / step-validate / all 14 hook arms / `report-schema --check` | all exit 0 |
| 3 | Q-7 split | **22 / 10, correct against the approved list at commit time.** The 22 stay on `pending:spec100_amendment:Q-7`: zone_label, frontage_m, depth_m and outline_geojson, plus 8 street_view rows and 10 offers[] rows. The 10 moved to `pending:operator_confirm:Q-7-scope`: zone_class_label, exception_number, is_irregular, the corner / through flags, abuts_laneway, the centroid lat / lng, overlays and neighbourhood_name |
| 4 | RS-11 pins the semi_half rules | **Every pinned value caught (exit 1, RS-11 FAIL):** show_card_kinds += new_build (the old survivor), headline non-null or deleted, suite_add_on true, existing_estimates "shown", renovation_cards, correction.value, Q-1 pins removed, Q-1 marked open with pins. A coordinated edit to presentation and pin passes `report-schema --check` but is caught by `seed --check` (exit 1), which `report-schema.logic` runs. The prior mutation set catches 26 of 26 applicable |
| 5 | Seed in the repo | `scripts/surfaces/_schema/seed-report-v2.mjs --write\|--check` (no flag → exit 2). Its inputs are committed (`report-v2-seed/` plus the lineage), and they match the scratchpad originals byte for byte. `--check` exits 0. `--write` in a throwaway worktree reproduces decl, presentation and rulings **sha256-identically**, and `git status` stays clean |
| 6 | R-RS cite / N3 / N6 | The R-RS cite quotes CHAT-4 exactly. N3 is fixed. N6 resolves at the merge (`existing_source` gains `user_entered`) |

## Findings
- **F1 (decision received after the commit).** CHAT-11 in `chat-decisions/2026-10-20-batch-b.json` (written 15:45, after the 15:15 commit) approves all 10 `Q-7-scope` rows. Those rows must move to `spec100_amendment:Q-7` through the seed's chat overlay, then `seed --write`. RS-5 cannot detect a decided scope confirmation. Lane work: import CHAT-11 by generator; do not hand-copy.
- **F2 (integration). Merged with bylaw-fix-1 (f5f82087 lineage), `report-schema --check` exits 1:**
  - RS-5 FAIL ×17 ("lineage now has X — switch the source to lineage:");
  - RS-9 FAIL ×15;
  - md, schema, types and sample drift;
  - `seed --check` exits 1.

  A plain `seed --write` is not enough: it lists the 15 fields as UNREVIEWED under not_in_report, which RS-9 rejects. A fix commit must edit the seed rules (the 15 queue fields and cards RE / RF → `lineage:<field>`), then run `seed --write` and `report-schema --write`. f5f82087's message anticipates this.
  - Also check the regenerated sample's `suite_coa_status` = "precedent_estimate" against Q-4 ("not_evaluated:coa_factor_unfitted:suite until calibrated").
- **N.** `report-schema --write` exits 0 even when a gate fails. N4 (the Q-9 per-user cap, the 84 Q-10 assets) is still without a disposition. At integration, R-RS becomes **R-HM** (layer2 124:266); that row says "RS-0…RS-9" and should say RS-0…RS-11, and it should cite the committed record, not the scratchpad path.
