# Verification: wf2/report-schema

- Branch: `wf2/report-schema` @ `326eca17` (worktree `~/Buildo-wt-rschema`; commits `049734ca` decl / presentation / rulings, then `326eca17` report-schema.mjs and generated outputs; parent `208e8a82`)
- Lane: verify-13 (R-EZ, independent, read-only). Date: 2026-10-20.
- The detailed content evidence is in `verify-13/rschema-content.md`. The scripts are `rs-cmp*.mjs`, `rs-lineage.mjs`, `rs-disc.mjs` and `rs-mut.mjs`, each with an `.out` file. Mutation tests ran in the throwaway worktree `verify-13/rs-wt`, which has been removed. No DB was used.

## Verdict: **PASS-WITH-NOTES**

## Checks

| # | Check | Result |
|---|---|---|
| 1 | Full suite at tip | **18,071 passed / 4 skipped / 0 failed**. That is the int12 base of 18,052 plus `report-schema.logic` (19) |
| 2 | `tsc --noEmit` | exit 0 |
| 3 | `step-validate --all --fast` | exit 0 |
| 4 | `spec-split-check --check` | clean (40 moves, 7,328 citations) |
| 5 | `report-schema.mjs --check` | "report-schema current". RS-0…RS-9 PASS. RS-5 is WARN (71 pending rows), which is the intended design |
| 6 | Decl vs proposal and operator export | The provenance hashes match: proposal `6827d126…`, entries `52069fe7…`, 11 decision files `aeed9a02…`. The committed decl, presentation and rulings files are **byte-identical** to the lane's seed output. Q-1…Q-11 show **0 field differences** against `entries.json` and the decision files. **Q-7 = keep** via "chat relay (supersedes page export)", and the page's `discuss` value is kept under `page_export`. `chat_overlay` = [Q-7] only. 228 fields, 15 sections and 9 cards confirmed. Status vs the proposal: 0 differences. All 11 unmatched proposal rows are explained by decided rulings |
| 7 | Lineage | Mechanically checked all 97 `lineage:` references (84 distinct): **0** name, type or unit mismatches against `maxbld-field-lineage.json`. All 92 lineage fields are either declared or listed in `not_in_report` with a reason |
| 8 | RS gate mutations | **28 of 29 caught**, each by the expected gate (RS-0…RS-9 or generated drift). The one survivor is N1 |
| 9 | Sample disclosure text vs Spec 78 P5.12 | 72 templates parsed independently. All 23 sample texts (12 codes) match their template exactly with the slots filled. Importance and mandatory flags agree |
| 10 | Generated outputs | md, schema, types, sample and lineage queue reproduce with no drift |
| 11 | Against wf1/bylaw-fix-1 (which edits `maxbld-field-lineage.json`) | On the merge tree `326eca17 ⊕ bylaw-fix-1`, `report-schema --check` is still current and every gate PASSes |

## Findings

**BLOCKING:** none.

**NOTE**
- **N1. The Q-1/Q-2/Q-3 encoding is self-referential.** RS-7 checks the samples against `presentation.lot_form_rules`, but nothing pins those rules to the decided rulings. Changing `semi_half.show_card_kinds` to include `new_build` passes `--check`. Pin the semi_half values (renovation only, headline null, suite_add_on false, existing_estimates hidden) to Q-1/Q-2/Q-3.
- **N2. Q-7 is applied to 32 `pending:spec100_amendment:Q-7` rows.** These include `exception_number`, `is_irregular`, corner/through flags, `abuts_laneway`, the centroid, `overlays` and `neighbourhood_name`. That is wider than the approved list: "zone label, frontage/depth, map outline, street_view, offers". All the rows are pending, so nothing ships, but the operator should confirm the exact set before the Spec 100 amendment.
- **N3. A stale note.** The `is_headline` note (decl :574, md :122) still says "PROPOSED: exclude/flag rows with requires_attached_half_removed", which Q-1 replaced.
- **N4. Small additions beyond the literal rulings.**
  - Q-9 gained a "per-user cap (usage_events)".
  - Q-10's "a few different photos" became 84 static illustrations (28 keys × 3 views), against the recommendation's ~33.
- **N5. The seed generator lives outside the repo.** It is `scratchpad/rschema/seed.mjs`. Its output is verified identical, but the transfer cannot be re-run from the repo. `report-v2.rulings.json` has no coverage lock tying it to an export in the way `decision-log.mjs` (R-HK, on wf2/layer2-spec) does. At integrate-13, consider expressing Q-1…Q-11 as a decision log so that `decision-log --check` covers them.
- **N6. `existing_source` enum.** It is `["estimated", null]`, while the decl note mentions `user_entered`. That is correct for the pipeline (O-12), but APP-RENO will need its own type.
- **N7. `report-schema.mjs --check` is not in `.husky/pre-commit`.** The `report-fields.mjs --check` precedent is in the R-DJ (1) list. Drift is caught only at pre-push, through `report-schema.logic` ("--check finds no drift"). Wiring it would make the hook 16 arms, after layer2-spec's 15. See the integrate-13 plan.
