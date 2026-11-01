# MB-07 Second-seat check (independent), main checkout ~/Buildo, spot-check ~/Buildo-wt-usescope

Read-only. No DB, no git writes. Predicate built independently, not from the first seat's greps. Verdict at the end.

## Search commands (mine)

```
cd ~/Buildo   # zsh: setopt nonomatch
# 1 numeric-literal lint: a zoning word, then an optional name tail, then = or :, then a number
W='setback|coverage|fsi|height|storey|stories|frontage|lot_area|landscap|density|bylaw|zoning|envelope|max_build|opt_'
grep -rnEi "($W)[a-z_]*[\"']? *[:=] *[0-9]+(\.[0-9]+)?\b" src scripts mobile/app mobile/src \
  --include='*.js' --include='*.ts' --include='*.tsx' --include='*.mjs' --include='*.jsx' \
  | grep -vE "__tests__|\.test\.|\.spec\.|/tests?/|scripts/analysis/|node_modules|generated/|fixtures|scripts/one-time"
#   103 hits; 60 were UI minHeight/style noise; the rest triaged by hand
# 1b literal-times-lot and storeys multipliers
grep -rnEi "(lot|parcel)[a-z_]* *\* *0?\.[0-9]+|0?\.[0-9]+ *\* *(lot|parcel)[a-z_]*|\* *(floors|storeys|stories)\b" src/features src/lib scripts/lib scripts/*.js --include='*.js' --include='*.ts'
# 1c seeded numbers: every zoning-word key in the logic variable seed
grep -nEi "\"[a-z_0-9]*(setback|coverage|fsi|height|storey|stories|frontage|landscap|density|envelope|max_build|garden|laneway|suite|footprint|gfa|story)[a-z_0-9]*\"" scripts/seeds/logic_variables.json
# 2 DB columns: schema.ts pgTable blocks, every column whose name has a zoning word, then per-column "is it in the first seat file" test
awk '/pgTable\(/{match($0,/pgTable\("[a-z_0-9]+"/); t=substr($0,RSTART+9,RLENGTH-9)} /bylaw|max_build|setback|coverage|fsi|height|stor(ey|ies)|envelope|^\s*opt_|garden|laneway|zon(e|ing)|frontage|landscap|density|_units|footprint|gfa/ && !/pgTable/{print t, $1}' src/lib/db/generated/schema.ts
#   camelCase -> snake_case with perl, then: grep -c <col> ~/Buildo-scratch/p2close/MB07-old-consumers.md   (0 = candidate)
# 2b readers and writers of the column family, files not named in the first seat (basename test, fixed strings)
P='bylaw_max_|bylaw_min_|bylaw_pct_|bylaw_standard_setback|max_build_|max_buildable_|max_newbuild|max_garden_suite|max_laneway_suite|max_rear_suite|max_garage|envelope_constrain|market_exceeds_bylaw|garden_suite_fits|opt_aor_|opt_coa_|optimal_config|coa_fsi|realized_fsi|comp_fsi|SETBACK_DEFAULTS|COVERAGE_DEFAULTS|setback_is_bylaw|lookupSetback|lookupCoverage|front_setback|rear_setback|side_setback|flankage'
grep -rlE "$P" src scripts mobile/src mobile/app supabase migrations --include='*.js' --include='*.ts' --include='*.tsx' --include='*.mjs' --include='*.sql' --include='*.json'
# 2c overlay, raw-layer and norm tables
grep -rnE "zoning_bylaw_areas|zoning_height_overlay|zoning_lot_coverage_overlay|zoning_building_setback_overlay|in_building_setback_overlay|neighbourhood_storey_norms" src scripts mobile
# 3 usescope drift: list files matching the family on both trees, diff the two lists
diff <(cd ~/Buildo && grep -rlE "$P" src scripts mobile/src mobile/app ...) <(cd ~/Buildo-wt-usescope && same)
# 4 rows checked against first seat: sed -n on max-build.js:120,186; step/index.js:5435; enrich-parcels.js:609-613;
#   enrich-lead-zoning.js:39; manifest.json:23-24; Spec 58 rows via grep -cE "^\| NF-"
```

Scratch outputs (not product): ~/Buildo-scratch/p2close/_ss_lint.txt, _ss_cols.txt, _ss_Buildo.lst, _ss_Buildo-wt-usescope.lst.

## What agrees (not re-listed)

Setbacks, coverage, height, FSI, parcel/permit/CoA columns, mobile, consumer-lookup, admin lookup, funnel.ts, gates, Spec 58 section 13 count (35 numbered NF lines, `grep -cE "^\| NF-"` = 35), line refs :120 and :186 all checked and correct. Usescope list differs from main only by `scripts/compute-coa-cost-estimates.js` (a wrapper there), as the first seat says. No new old-column consumer exists on usescope.

## MISSING rows

| # | file:line | What it shows or stores | Switch task |
|---|---|---|---|
| M1 | `scripts/seeds/logic_variables.json:82,92,102,112,132-252`; migration `migrations/239_seed_max_build_min_dimension.sql`; read at `scripts/lib/compute/enrich-parcels.js:894-906` | The LIVE values of the max-build numbers are the `logic_variables` rows, not the `max-build.js` constants (those are only JS fallbacks, parity-locked by a test). Rows: `storey_height_m` (3.0 height to storeys), `max_build_lot_min_sqm`, `max_build_lot_max_sqm`, `max_build_min_dimension_m`, `garage_max_gfa_sqm`, `garage_min_lot_sqm`, `garage_min_footprint_sqm`, `accessory_max_coverage_pct`, `car_footprint_sqm`, `laneway_suite_max_gfa_sqm`, `laneway_suite_min_lot_sqm`, `laneway_suite_min_rear_yard_m`, `laneway_suite_storeys`, `garden_suite_max_gfa_sqm`, `garden_suite_min_lot_sqm`, `garden_suite_min_rear_yard_m`, `garden_suite_storeys`, `min_soft_landscaping_pct`. The first seat lists these only as `max-build.js` HC constants (A13, B7, B8, C1, D5) and names only `storey_height_m`, `urban/suburban_coverage_ratio`, `reno_coa_uplift_pct` as logic variables. Retiring the constants (MB-43) leaves the DB rows, the seed file, `_contracts.json` and the admin panel groups (`src/features/admin-controls/generated/logic-variable-groups.json`, `logic-variable-effect.json`) still holding and showing the old numbers to an admin. | storey_height_m: MB-40; lot band and min dimension: MB-38; garage/suite rows: MB-39 and MB-41 (suite/garage rows have no by-law-table replacement yet except the Spec 78 suite fields); delete of the rows: MB-43 |
| M2 | `scripts/compute-storey-norms.js` (whole file; table `neighbourhood_storey_norms`, schema.ts, migration 195); read at `scripts/lib/compute/enrich-parcels.js:581,689-690` | A stored permit-derived storey median (p50/p90, per neighbourhood plus a citywide row) that becomes `max_build_stories` and `opt_*_storeys` through `stories_calc` (first seat C3 names "pocket p50" but not the script or the table). A stored derived store that survives a height switch. | MB-40 (decide: keep as a labelled market estimate, or retire); MB-43 |
| M3 | `src/features/leads/lib/cost-model-shared.js:125,128,219-220`; `src/features/leads/lib/cost-model.ts:164-165,290-294` | `FALLBACK_RESIDENTIAL_FLOORS = 2`, `FALLBACK_COMMERCIAL_FLOORS = 1` multiply lot x coverage ratio in `computeGfa` (first seat B9 lists the 0.7 / 0.4 ratios but not the storey counts, which are half of the same product). Feeds `modeled_gfa_sqm`. | MB-40 (storeys half of B9); no replacement yet, same ruling as B9 |
| M4 | `scripts/surfaces/parcel_product/F02/surfaces/mobile_parcel_detail.descriptor.json:85-91`; `.../F17/surfaces/mobile_tracked_lots.descriptor.json:307`; `.../F02/contracts/contract_parcels_lookup.descriptor.json:243`; `.../F08/contracts/contract_admin_parcels_lookup.descriptor.json:107`; `.../F92/contracts/contract_permits_id.descriptor.json`; `scripts/surfaces/_schema/census/contracts.json` (81 hits), `census/mobile-product.json` (15) | Surface and contract descriptors that DECLARE which old columns each product screen and API response exposes (`max_buildable_gfa_sqm`, `max_build_stories`, `max_build_fsi`, `coa_fsi` ...). They are checked by tests; when the product switches, the descriptors and their witness tests fail until changed. The first seat lists the screens and routes, not these declarations. | MB-38..41 (each switch edits its fields here); MB-43 |
| M5 | `scripts/surfaces/_schema/report-v2.decl.json:483-527` (also 17 hits in total), `report-fields.decl.json` (11 hits), `scripts/surfaces/_schema/seed-report-v2.mjs:409-432`, `docs/reference/maxbld-report-field-inventory.json` (623 hits), `maxbld-report-v2.sample.json` | The planned max-build report v2 declares `parcel.areas.max_buildable_gfa_sqm`, `opt_aor_gfa_sqm`, `max_build_stories`, `max_build_fsi`, `coa_fsi` with `"source": "consumer:parcel.areas.*"`, i.e. the old columns. If the report is built from this declaration it will show old numbers. Seed file has literal sample values (197.5, 340, 205). | MB-41 (GFA/FSI) and MB-40 (storeys); the seed sample is non-product |
| M6 | `src/lib/db/generated/schema.ts` tables `neighbourhood_build_norms` (`realized_coverage_p50/p90`, `storeys_p50/p90`, `realized_fsi_p50/p90`) and `parcels.comp_fsi_p50`, `realized_fsi_p90` | First seat D11 names the build-ratio and realized FSI, not the realized COVERAGE and STOREYS norm columns of the same table. Stored; ratio columns divide by old `max_buildable_gfa_sqm` (per D11). | MB-39 (coverage), MB-40 (storeys), MB-41 (FSI) recapture |
| M7 | `scripts/enrich-permits.js:79`, `scripts/lib/enrich-lead-zoning.js:54`, `scripts/lib/compute/enrich-parcels.js:129-130`, `src/lib/admin/parcel-lookup.ts:69`, `src/lib/parcels/types.ts:49-50` | `in_building_setback_overlay`, `in_parking_zone_overlay` booleans copied from parcels to permits and CoA. Flags, not numbers, but "building setback overlay = a different setback applies" is zoning-limit meaning, and they are stored copies. Low severity: keep, note in the setback task. | MB-38 (note only) |
| M8 | `scripts/lib/assert-parcel-sanity-fields.js:74-89` thresholds `parcel_sanity_lowrise_bylaw_fsi_max` 1.5, `parcel_sanity_bylaw_fsi_max` 8, `parcel_sanity_lowrise_coverage_max_pct` 50, `parcel_sanity_lowrise_bylaw_height_max_m` 15, `parcel_sanity_lowrise_maxbuild_stories_max` 4 | Numeric zoning ceilings that a gate checks the stored values against. Falls under E3 in the first seat as "bounds"; I list it only because E3 does not name these keys and these 1.5 / 50 / 15 / 4 are zone-limit-shaped numbers that need new-field equivalents when the columns go. | MB-43 (low severity; E3 covers the file) |

Also reviewed, judged NOT consumers (so no row): `src/lib/massing/geometry.ts:16-44,226` `STORY_HEIGHT_M` and `building_footprints.estimated_stories` (existing-building height from massing, shown on the permit page, not a zoning limit); `parcels.existing_height_m` / `existing_stories` (retired, written as NULL, `enrich-parcels.js:1017-1018`); `coa_notice_variances.required_value` and `logic_variables coa_notices_req_*` (City-stated limits read from notice PDFs, not shown to a user); `scripts/seed-parcels.js:17-22` (frontage test seeds); `archetype_t1_fsi_min/max` and `enrich_parcels_comp_fsi_*` (plausibility bands on comparable builds); `enrich_parcels_major_street_frontage_m` (an overlay join distance, not a limit); `scripts/lib/storey-extract.js` (reads storeys from permit text).

## WRONG rows

| # | First-seat claim | Evidence |
|---|---|---|
| W1 | Section H item 2 and B5: `scripts/lib/enrich-lead-zoning.js` is a "second, byte-identical copy" of the `enrich-permits.js` snapshot logic. | They are not copies. `enrich-lead-zoning.js` (624 lines) is the ONE shared compute module of the CoA step: `scripts/enrich-coa-zoning.js` (34 lines) requires `./lib/compute/enrich-coa-zoning`, which is one line over `../enrich-lead-zoning` (`enrich-lead-zoning.js:1-12`). `scripts/enrich-permits.js` (836 lines) has 0 references to it and is its own implementation; `scripts/manifest.json:23-24` runs `enrich-permits.js` for permits and `enrich-coa-zoning.js` for CoA. Practical effect: the permits path and the CoA path are two separate code paths; the queue's `enrich-permits.js:24,107,375-399` covers permits (and its own `ENRICH_TARGET=coa` mode only if still used), the CoA chain recapture is in the lib module. Both still need the switch, so the action stands; only the "identical copy" statement is wrong and could mislead the MB-38 work split. |
| W2 | Source label "HC" (hard-coded constant) for A13, B7, B8, C1, D5 (garage/suite/soft-landscaping/storey-height/min-dimension numbers). | The running value comes from `logic_variables` (`enrich-parcels.js:894-906`; seed `scripts/seeds/logic_variables.json`; `max-build.js:100-112` says the constants are "DEFAULTS for the externalized logic_variables", parity-locked by test). Source is DB-tunable config with a JS fallback, which changes the retire step (see M1). |

No wrong line numbers found in the rows I spot-checked (A1/B1 :120/:186, D16 :5435, A3 :609-613, B5 :24 and :39, NF count 35).

## Verdict: INCOMPLETE

8 MISSING (M1 to M8; M1 to M5 matter, M6 to M8 are low), 2 WRONG (W1, W2). The first seat covered every code consumer of the old parcel/permit/CoA columns and the product screens; what it lacks is the config-store layer (logic_variables rows that hold the live numbers), the descriptor/contract declarations and the report-v2 declaration that name old fields as the product's source, one stored norm table feeding max storeys, and the floors half of the cost-model fallback.
