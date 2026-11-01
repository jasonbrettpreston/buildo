# MB-07 Old consumers of zoning numbers (read-only audit, main checkout ~/Buildo, branch wf2/deep-scrapes-restore-l0)

Scope: every place the product shows or stores a zoning number that does not come from the by-law table / Layer 2. Checked also on ~/Buildo-wt-usescope (wf1/l2-use-scope, 267472c9). Line numbers are main unless stated; "same" = file byte-identical on usescope (cmp). No DB used.

## How to read

- Old source codes: HC = hard-coded constant in code; CITY = raw City zoning layer copied into `parcels.bylaw_*` by enrich_parcels (not Layer 2); DER = derived from HC and/or CITY columns; COPY = stored copy of a parcel column on another table.
- New field = `parcel_maxbld_scenarios` column (Spec 78 P5.10, usescope `docs/specs/01-pipeline/78_optimal_lot_configuration.md:1044+`; lineage registry `docs/reference/maxbld-field-lineage.json`) or Layer 2 table (`bylaw_resolution_lots` / view `bylaw_resolution_results`, migration 282).
- Recapture = lc.50 replay-all: a stored copy that goes stale when the source value changes (queue MB-38 text: `enrich-permits.js:24,107,375-399`, `compute-parcel-cost-estimates.js:174`, any other stored copy).
- Task column: MB-38 setbacks, MB-39 coverage, MB-40 height/storeys, MB-41 FSI/GFA, MB-43 retire (quality gates, columns, constants kept only as comparison copy until then). "38-41" = stored copy that must be recaptured at each switch.

## A. Setbacks (MB-38)

| # | file:line | Shows / stores | Old source | New field replacing it | Task | Recapture |
|---|---|---|---|---|---|---|
| A1 | scripts/lib/max-build.js:120-136 (queue says :121) `SETBACK_DEFAULTS` | front/side/rear/flankage per zone prefix + `side_count` (party walls) | HC | `main_front_setback_m` (+`main_front_setback_basis`), `main_side_setbacks_m`, `main_rear_setback_m`; side_count from `main_side_setbacks_m` party-wall 0 | MB-38 | no (code) |
| A2 | scripts/lib/max-build.js:138-178, exports :333 `lookupSetback`, `buildSetbackCase`, `lookupSideCount`, `buildSideCountCase` | SQL CASE / JS mirror generated from A1 | HC | same as A1 | MB-38 | no |
| A3 | scripts/lib/compute/enrich-parcels.js:609-613 (`front_setback`, `side_setback`, `rear_setback`, `flankage_setback`, `side_count`, `setback_is_bylaw`) | per-parcel setbacks feeding the envelope | HC + CITY `bylaw_standard_setback_m` (front only) | `main_front_setback_m`, `main_side_setbacks_m`, `main_rear_setback_m` | MB-38 | no (intermediate) |
| A4 | scripts/lib/compute/enrich-parcels.js:734 `rear_yard_depth = depth - front_setback - rear_setback` | gate for garden/laneway/garage fit | DER (A3) | `suite_type`, `suite_rear_setback_m`, `suite_separation_m` | MB-38 | yes via A15 |
| A5 | enrich-parcels.js:767 `max_build_setback_basis` (parcels, propagated) | text 'bylaw'/'zone_default' | DER (A3) | `main_front_setback_basis` (`averaged_two`/`averaged_one`/`zone_default`/`needs_survey`) | MB-38 | yes |
| A6 | enrich-parcels.js:771-772 `max_build_width_m`, `max_build_length_m` | envelope width/length from setback box | DER (A3, flat 0.9 m side) | `main_depth_cap_m`, `main_length_cap_m`, `main_footprint_sqm` | MB-38 | yes |
| A7 | enrich-parcels.js:814-834 `envelope_constrained`, `envelope_constraint_reason` | ordered CASE on the setback consumption | DER (A3) | `scenario_status`, `gate_flags`, `binding_constraint` | MB-38 | yes |
| A8 | enrich-parcels.js:812 `max_build_confidence` and compute-parcel-cost-estimates.js:174 (read); parcel-cost.js:227,304 | confidence 'high/medium/low' from `setback_is_bylaw` (front only, EF-9) | DER (A3) | `row_trust_level`, `trust_checks` | MB-38 | yes (queue-named) |
| A9 | parcels.bylaw_standard_setback_m: migration 165:50; precedence scripts/lib/zoning-precedence.js:56 ('dominant'); schema src/lib/db/generated/schema.ts (parcels); src/lib/parcels/types.ts:36; src/lib/admin/parcel-lookup.ts:66 | City STAND_SET (CR zone typology), shown in admin lookup | CITY | `main_front_setback_m` (Layer 2 `front_setback_m` target) | MB-38 | no (parcels column kept hidden as comparison until MB-43) |
| A10 | src/lib/admin/parcel-lookup.ts:88 (`max_build_setback_basis`, `max_build_width_m`, `max_build_length_m`), :90 `envelope_constrained`, `envelope_constraint_reason` | admin parcel lookup display | DER | as A5-A7 | MB-38 | no (live read) |
| A11 | src/lib/parcels/consumer-lookup.ts:40 `envelope_constrained`, `envelope_constraint_reason`; mobile/app/(app)/parcel-tool/[parcelId].tsx:135-137 ("Envelope constrained: ...") | consumer-facing + mobile text | DER | `scenario_status` / `gate_flags` | MB-38 | no |
| A12 | scripts/lib/max-build.js:81 `RAVINE_SETBACK_M = 10.0` (used enrich-parcels ravine sub-floor) | 10 m ravine setback | HC | `gate_flags` has `ravine_protection` but no numeric distance field | MB-38 | **no replacement yet** (numeric distance) |
| A13 | scripts/lib/optimal-config.js:38-81 `BYLAW` setback/separation constants (`REAR_SETBACK_MIN_M` 1.5, `SIDE_SETBACK_*`, `DEEP_LOT_DEPTH_M` 45, `GARDEN_SEP_*`, `GARDEN_HEIGHT_*`) | garden/laneway suite fit, stored as `opt_*` and `optimal_config` JSONB | HC | `suite_rear_setback_m`, `suite_side_setbacks_m`, `suite_separation_m`, `suite_height_m`, `suite_setback_basis` | MB-38 | yes (opt_* and JSONB) |
| A14 | scripts/enrich-permits.js:46-48,211,380,451,536 `mb.LOT_MAXBUILD_COLS` (max_build_* inputs + outputs) copied from dominant parcel to `permits` and `coa_applications` | stored COPY of A5-A8 and F-rows | COPY | recapture, then `parcel_maxbld_scenarios` columns | MB-38 (and 39,40,41) | **yes** |
| A15 | scripts/enrich-permits.js:62-68,382-384,453-456 `SCENARIO_COLS`, `OPT_COMP_PROP_COLS`, `COST_PROP_COLS` copies | stored COPY of opt_*, scenario, cost scalars (all derived from the max-build envelope) | COPY | recapture | MB-38 (and 39,40,41) | **yes** |
| A16 | scripts/lib/compute/link-parcel-abutments.js:265 `front_setback_est_m` | neighbour front-setback estimate (input for averaging) | measured geometry, not a by-law number | feeds `main_front_setback_basis`; keep | MB-38 | no (confirm only) |

## B. Coverage (MB-39)

| # | file:line | Shows / stores | Old source | New field | Task | Recapture |
|---|---|---|---|---|---|---|
| B1 | scripts/lib/max-build.js:186-191 `COVERAGE_DEFAULTS` | zone-prefix % (RD 33, RM 30, R 35, C 75, DEFAULT 50) | HC | `coverage_status` (`applies:<v>`/`not_applicable`/`not_evaluated`), `main_footprint_sqm`, `binding_constraint`; Layer 2 target `lot_coverage_pct` | MB-39 | no (code) |
| B2 | scripts/lib/max-build.js:193-209 `lookupCoverage`, `buildCoverageCase`, exports :334 | CASE generated from B1 | HC | same | MB-39 | no |
| B3 | enrich-parcels.js:683-684 `coverage_cap = lot * COALESCE(bylaw_max_coverage_pct, buildCoverageCase)/100`, `coverage_defaulted` | footprint cap; the HC default is used for ~37 % of parcels | CITY + HC | `main_footprint_sqm`, `coverage_status` | MB-39 | yes via `max_buildable_footprint_sqm` (F-rows) |
| B4 | enrich-parcels.js:127 `OVERLAY_MIN_COLS`, :340-341 (City lot-coverage overlay `cov_override` else `base_coverage_max_pct`) writes `parcels.bylaw_max_coverage_pct`; precedence zoning-precedence.js:57 ('overlay_min'); migration 165:43; schema.ts:763-764? (parcels bylaw cols 763-768) | stored parcel coverage % | CITY | `coverage_status` / Layer 2 `lot_coverage_pct` | MB-39 | no (kept hidden to MB-43) |
| B5 | scripts/enrich-permits.js:24,107-108,375-376,398-399 (also scripts/lib/enrich-lead-zoning.js:39,88-89,137-138,160-161, identical copy) `bylaw_max_coverage_pct` copy to `permits`/`coa_applications` + `variance_context.base` JSONB; migration 166:31,45 | stored COPY (and JSONB snapshot) | COPY of CITY | `coverage_status` | MB-39 | **yes** (queue-named) |
| B6 | src/lib/permits/types.ts:94; src/lib/parcels/types.ts:29; src/lib/admin/parcel-lookup.ts:64 | type + admin display of coverage % | CITY | `coverage_status` | MB-39 | no |
| B7 | scripts/lib/max-build.js:102,107 `ACCESSORY_MAX_COVERAGE_PCT` 0.30, `MIN_SOFT_LANDSCAPING_PCT` 0.30; enrich-parcels.js:553,558,759 | garage / suite coverage + soft-landscape rules | HC | `suite_coverage_option`, `suite_soft_landscaping_sqm`, `suite_footprint_sqm` | MB-39 | yes (garage/suite cols) |
| B8 | scripts/lib/optimal-config.js:22-35,52,57-59,114,164,240 `ANCILLARY_COVERAGE_MAX_FRAC` 0.2, `GARDEN_FOOTPRINT_REAR_FRAC` 0.4, `SOFT_LANDSCAPE_WIDE/NARROW_FRAC` 0.5/0.25 | opt_* suite footprint | HC | `suite_coverage_option`, `suite_footprint_sqm`, `suite_soft_landscaping_sqm` | MB-39 | yes |
| B9 | src/features/leads/lib/cost-model-shared.js:215-216 `urban 0.7 / suburban 0.4` coverage ratio fallback (lot x ratio x floors) in `computeGfa` | `modeled_gfa_sqm` stored in cost_estimates / coa | HC (logic_variables `urban_coverage_ratio`, `suburban_coverage_ratio`) | none: a market-style fallback, not a by-law claim; needs a ruling | MB-39 | **no replacement yet** (decide: keep as labelled estimate or switch) |

## C. Height and storeys (MB-40)

| # | file:line | Shows / stores | Old source | New field | Task | Recapture |
|---|---|---|---|---|---|---|
| C1 | scripts/lib/max-build.js:33-35, :48 `STOREY_HEIGHT_M` 3.0, `RESIDENTIAL_STOREY_HEIGHT_M` 3.0, `NONRES_STOREY_HEIGHT_M` 4.0, `buildStoreyHeightCase`, exports :341 | height / 3.0 storey guess | HC | `main_storeys`, `storeys_flat`, `storeys_pitched` (logic var `storey_height_m`) | MB-40 | no |
| C2 | enrich-parcels.js:326-338 writes `parcels.bylaw_max_height_m`, `bylaw_max_stories` from City height layer; :127 `OVERLAY_MIN_COLS`; precedence zoning-precedence.js:58-59; migration 165:44-45 | stored parcel height / storeys | CITY | `main_height_m`, `height_status`, `main_storeys`, `storeys_status` (Layer 2 `height_m`, `height_storeys`) | MB-40 | no (kept hidden to MB-43) |
| C3 | enrich-parcels.js:686-687,717-726 `height_implied`, stories_calc | storeys = LEAST(pocket p50, height / 3.0) | DER | `main_storeys` | MB-40 | yes via C4 |
| C4 | enrich-parcels.js:774-786 `max_build_height_m`, `max_build_stories`, `max_build_stories_basis`, `max_build_stories_aggressive`, `market_exceeds_bylaw` | stored on parcels, propagated to permits and CoA (A14) | DER | `main_height_m`, `main_storeys`, `storeys_status`, `height_status` | MB-40 | **yes** |
| C5 | scripts/enrich-permits.js:24,107-108,375-376,398-399 (+ enrich-lead-zoning.js copy) `bylaw_max_height_m` copy; migration 166:33,47; src/lib/permits/types.ts:96 | stored COPY | COPY of CITY | `height_status` / `main_height_m` | MB-40 | **yes** (queue-named) |
| C6 | src/lib/parcels/consumer-lookup.ts:38 `max_build_stories`; mobile/app/(app)/parcel-tool/[parcelId].tsx:131 ("Max build storeys") | consumer + mobile display | DER | `main_storeys` | MB-40 | no (live read) |
| C7 | src/lib/admin/parcel-lookup.ts:64 (`bylaw_max_height_m`, `bylaw_max_stories`), :88-91 (`max_build_height_m`, `max_build_stories`, `_basis`, `_aggressive`, `market_exceeds_bylaw`); src/lib/parcels/types.ts:30-31 | admin display + types | CITY / DER | as C2, C4 | MB-40 | no |

## D. FSI and GFA (MB-41)

| # | file:line | Shows / stores | Old source | New field | Task | Recapture |
|---|---|---|---|---|---|---|
| D1 | enrich-parcels.js:116 (fsi_max map), :369, :726 `fsi_cap` -> writes `parcels.bylaw_max_fsi`; precedence zoning-precedence.js:45 ('dominant'); migration 165:42 | stored parcel FSI | CITY | `fsi_status`, Layer 2 `fsi` | MB-41 | no (hidden to MB-43) |
| D2 | enrich-parcels.js:798-805 `max_buildable_gfa_sqm`, `max_buildable_gfa_basis`; :770 `max_buildable_footprint_sqm` | headline max GFA / footprint, propagated everywhere | DER (A3, B3, C3, D1) | `main_gfa_sqm`, `total_gfa_sqm`, `main_footprint_sqm`, `is_headline`, `binding_constraint` | MB-41 | **yes** |
| D3 | enrich-parcels.js:1034-1035 `max_newbuild_coa_gfa_sqm` = max GFA x (1 + `reno_coa_uplift_pct`); 5% default max-build.js | CoA-tier max build (consumer + mobile "Max CoA Build") | DER | `coa_gfa_sqm`, `coa_status` | MB-41 | **yes** |
| D4 | enrich-parcels.js:1380,1411,1461-1462 feeds `bylaw_max_fsi`, `bylaw_max_coverage_pct`, `max_build_stories` into optimal-config; writes `opt_aor_*`, `opt_coa_*`, `optimal_config` JSONB | as-of-right and CoA optimal config | DER | `main_gfa_sqm`, `main_storeys`, `coa_gfa_sqm` | MB-41 (coverage part MB-39) | **yes** |
| D5 | scripts/lib/max-build.js:92-109 (`GARDEN_SUITE_MAX_GFA_SQM` 60, `LANEWAY_SUITE_MAX_GFA_SQM` 120, `GARAGE_MAX_GFA_SQM` 60, min lots 270/230/230, min rear yard 5.0, storeys 1/2) used enrich-parcels.js:547-560, 759-761, 850 -> `max_garden_suite_gfa_sqm`, `max_laneway_suite_gfa_sqm`, `max_garage_gfa_sqm`, `max_rear_suite_gfa_sqm`, `garden_suite_fits`, `garage_*` | accessory GFA caps and fit | HC | `suite_gfa_sqm`, `suite_footprint_sqm`, `suite_type`, `suite_height_m` (garage: **no replacement yet**, Spec 78 has no garage scenario) | MB-41 | **yes** |
| D6 | scripts/lib/parcel-cost.js:97-108,373-377; scripts/lib/parcel-cost-cols.js:33-35 `max_build_fsi`, `coa_fsi`, `realized_fsi_p90` | FSI scalars = max GFA / lot, stored on parcels and propagated (COST_PROP_COLS) | DER (D2) | `main_gfa_sqm` / lot; `fsi_status` | MB-41 | **yes** |
| D7 | scripts/lib/compute/compute-parcel-cost-estimates.js:158-170,178,401 | cost estimate priced off max GFA / suite / footprint (sources chain) | DER (D2, D5) | `main_gfa_sqm`, `suite_gfa_sqm`, `main_footprint_sqm` | MB-41 | **yes** (queue-named :174) |
| D8 | scripts/compute-cost-estimates.js:147-152,867-868 (permits chain, same on usescope) | cost estimate; reads `max_*` copies on permits | COPY | as D7 | MB-41 | **yes** |
| D9 | scripts/compute-coa-cost-estimates.js:477-482,865-866 (main, 921 lines) and scripts/lib/compute/compute-coa-cost-estimates.js:56-61 (both trees); scripts/lib/coa-cost-model.js:223-228 | CoA chain cost; reads `max_*` copies on coa_applications | COPY | as D7 | MB-41 | **yes**. Usescope differs: scripts/compute-coa-cost-estimates.js is a 33-line wrapper (0 hits); live reader is the lib/compute file |
| D10 | src/features/leads/lib/cost-model.ts:89-94,557-562; src/features/leads/lib/archetype-cost-map.js:41-46; src/lib/classification/archetypes.ts:63-73; scripts/lib/archetypes.js:227-237 | cost brain reads `max_buildable_gfa_sqm`, `max_rear_suite_gfa_sqm`, `max_garage_gfa_sqm`, footprint | DER | `main_gfa_sqm`, `suite_gfa_sqm`, `main_footprint_sqm` | MB-41 | no (live read), but the cost totals they write are in D7-D9 |
| D11 | scripts/compute-build-norms.js:74-76,219 (`pa.max_buildable_gfa_sqm` as denominator) | stored `neighbourhood_build_norms` ratios (`build_ratio`, realized FSI p50/p90) | DER (D2) | `main_gfa_sqm` | MB-41 | **yes** (stored norms) |
| D12 | src/lib/parcels/consumer-lookup.ts:35-40 `CONSUMER_HEADLINE_COLS` (`max_buildable_gfa_sqm`, `max_buildable_footprint_sqm`, `max_build_stories`, `max_build_fsi`, `coa_fsi`, `max_newbuild_coa_gfa_sqm`) | consumer API headline; MB-37 hides/labels until switch | DER | `total_gfa_sqm`, `main_footprint_sqm`, `main_storeys`, `coa_gfa_sqm` | MB-41 | no |
| D13 | mobile/app/(app)/parcel-tool/[parcelId].tsx:129-133 ("Max buildable GFA", "Max build FSI", "CoA FSI"); mobile/src/lib/trackedLots.ts:13-28; mobile/src/components/parcel/TrackedLotRow.tsx:8-9,65 ("Max Build"); mobile/src/lib/parcelCostFormat.ts:58-69; mobile/src/hooks/useTrackedLots.ts:36,60-78 | mobile shows max build / FSI | DER | as D12 | MB-41 | no |
| D14 | src/lib/admin/parcel-lookup.ts:43-44,64-65 (`bylaw_max_fsi`, `bylaw_max_units`, `bylaw_max_density`, `bylaw_min_frontage_m`, `bylaw_min_area_sqm`, `bylaw_pct_*`), :88-105; src/lib/parcels/types.ts:28,32-35 | admin display of FSI, units, density, minimum lot (queue-named :64-65, :87-91) | CITY / DER | FSI: `fsi_status`; units: `dwelling_units` (Layer 2 `dwelling_units_max`); density, min frontage, min area, `bylaw_pct_*`: **no replacement yet** | MB-41 | no |
| D15 | scripts/enrich-permits.js:24,107-108,375-376,398-399 (+ enrich-lead-zoning.js) `bylaw_max_fsi` copy; migration 166:32,46; src/lib/permits/types.ts:95; enrich-parcels `bylaw_max_units`/`bylaw_max_density` writers :117-118, precedence :47-48 | stored COPY of FSI; parcels units/density | COPY of CITY | `fsi_status`; `dwelling_units` | MB-41 | **yes** (queue-named) |
| D16 | scripts/lib/step/index.js:5435 `WHERE e.max_buildable_footprint_sqm IS NOT NULL` (scope insert for a later pass) | selects parcels by max-build presence | DER | confirm only (scope rule, no number shown) | MB-41 | no |

## E. Retire (MB-43): quality gates, logic variables, columns, specs

| # | file:line | What | Task | Recapture |
|---|---|---|---|---|
| E1 | scripts/enrich-permits.js:558-559,572-574,653-655 and scripts/lib/enrich-lead-zoning.js:366-368,452-454,519; migration 273 (4 logic variables `*_bylaw_max_fsi/coverage_null_warn_pct`); scripts/generate-logic-variable-groups.mjs:434-441 | null-rate audits on `bylaw_max_fsi/coverage_pct/height_m` | MB-43 | no |
| E2 | scripts/lib/compute/assert-global-coverage.js:143-168 and scripts/lib/assert-global-coverage-fields.js (7 hits) | coverage populations of bylaw_max_* and max_build_* | MB-43 | no |
| E3 | scripts/lib/assert-parcel-sanity-fields.js:74-89 (bounds on `bylaw_max_fsi/coverage/height`, `max_build_*`); scripts/generate-assert-parcel-sanity-descriptor.js:66; scripts/lib/compute/assert-global-coverage.js | sanity bounds that keep old columns alive | MB-43 | no |
| E4 | scripts/lib/assert-data-bounds-fields.js:165,222 `coa_gfa_over_lot_multiple`, `coa_maxbuild_gfa_gt3lot` | CoA max GFA bound | MB-43 | no |
| E5 | migrations 165 (parcels), 166 (permits, coa_applications), 185, 189; src/lib/db/generated/schema.ts (coa_applications 104-106; parcels 763-768, 807-816; permits 2176-2178, 2199-2208; usescope has 96 matching lines vs 69) | the columns themselves | MB-43 | n/a |
| E6 | scripts/analysis/parcel-field-dump.js:18; wf3-sample-full-dump.js:46,69; wf3-cost-coherence-sanity.js; wf1-bylaw-heuristic-validation.js:10; scripts/analysis/bylaw-validation/coa-scorecard.mjs:276-277 (`legacy:` comparison block); scripts/analysis/report-fields*.mjs | analysis tools; the scorecard legacy block is the comparison copy | MB-43 (keep as comparison until then) | no |
| E7 | scratchpad_coaup.js (repo root, 2 hits) and `.cursor/mcbylaw/legacy-generators/*`, `.cursor/mcbylaw/zoning-validation/*` | scratch / legacy generators, not product | MB-43 (delete or ignore) | no |

## F. Spec 58 section 13 (docs/specs/01-pipeline/58_source_zoning_bylaw.md:711-870)

Section 13 is marked "PLANNED, NOT IMPLEMENTED" (line 713); it still states enrich_parcels uses the flat `SETBACK_DEFAULTS`/`COVERAGE_DEFAULTS`. Count: 32 table rows `NF-1`..`NF-32` (lines 721-753; plus 1 unnumbered formula-constant row at 735) + 3 clarification rows `NF-12/13/14` (lines 816-818) = **35 NF lines**; plus 22 `EF-1`..`EF-22` rows (837-858) and 3 narrative provision rows (864-867). Retirement path: Spec 69a M-20 / v0.5 note (69a:60-61): S13 deletes the Spec 58 section 13 mirror (NF/EF tables, L1-L28 ledger, additional provisions) and leaves a pointer; Spec 67 mirrors section 13 byte-identically (generator assert, 58:449) and Spec 78 uses legacy ids; legacy ids (C/L/G/A/H) rewritten from `docs/reports/mcbylaw-legacy-id-map.json`. NF/EF ids are NOT in that map (it covers C/L/G/A/H only) and appear in `src/tests/bylaw-s12-legacy.logic.test.ts`, `scripts/seeds/bylaw/legacy-decisions.json`, `scripts/seeds/bylaw/eval-vectors.json`, Specs 67/78/69a and several `.cursor` plans. None is read by runtime code.

| NF | Planned field | Replacement | Task | Recapture |
|---|---|---|---|---|
| NF-1 | bylaw_min_front_setback_m | `main_front_setback_m` | MB-38 | n/a (never built) |
| NF-2 | bylaw_min_rear_setback_m | `main_rear_setback_m` | MB-38 | n/a |
| NF-3 | bylaw_min_side_setback_m | `main_side_setbacks_m` | MB-38 | n/a |
| NF-4 | bylaw_min_flankage_setback_m | `main_side_setbacks_m.street_side` | MB-38 | n/a |
| NF-5 | bylaw_setback_averaging_applied | `main_front_setback_basis` | MB-38 | n/a |
| NF-6 | existing_front_setback_m | `parcel_abutments.front_setback_est_m` (input), `main_front_setback_basis` | MB-38 | n/a |
| NF-7 | bylaw_max_height_basis | `height_status` | MB-40 | n/a |
| NF-8 | bylaw_max_coverage_basis | `coverage_status` | MB-39 | n/a |
| NF-9 | bylaw_max_fsi_basis | `fsi_status` | MB-41 | n/a |
| NF-10 | bylaw_max_building_length_m | `main_length_cap_m` | MB-38 | n/a |
| NF-11 | bylaw_max_building_depth_m | `main_depth_cap_m` | MB-38 | n/a |
| NF-12 | bylaw_min_front_landscaping_pct | **no replacement yet** (Spec 78 has soft landscaping for suites only) | MB-43 | n/a |
| NF-13 | bylaw_min_rear_soft_landscaping_pct | **no replacement yet** (suite: `suite_soft_landscaping_sqm`) | MB-43 | n/a |
| NF-14 | bylaw_min_corner_side_landscaping_pct | **no replacement yet** | MB-43 | n/a |
| NF-15 | building_type | user input (`existing_*` / `lot_form_detected`; MB-42) | MB-42 | n/a |
| NF-16 | current_stories | user input `existing_storeys` (MB-42) | MB-42 | n/a |
| NF-17 | max_footprint_setback_sqm | `main_footprint_sqm`, `binding_constraint` | MB-38 | n/a |
| NF-18 | max_footprint_coverage_sqm | `coverage_status` + `main_footprint_sqm` | MB-39 | n/a |
| NF-19 | max_footprint_binding | `binding_constraint` | MB-38 | n/a |
| NF-20 | bylaw_min_front_soft_landscaping_pct | **no replacement yet** | MB-43 | n/a |
| NF-21 | bylaw_max_front_hard_landscaping_pct | **no replacement yet** | MB-43 | n/a |
| NF-22 | bylaw_front_landscaping_basis | **no replacement yet** | MB-43 | n/a |
| NF-23 | bylaw_max_front_driveway_width_m | **no replacement yet** | MB-43 | n/a |
| NF-24 | bylaw_min_soft_garden_suite_pct | `suite_soft_landscaping_sqm` | MB-39 | n/a |
| NF-25 | bylaw_min_soft_laneway_suite_pct | `suite_soft_landscaping_sqm` | MB-39 | n/a |
| NF-26 | existing_driveway_type | user input (MB-42) | MB-42 | n/a |
| NF-27 | existing_driveway_width_m | user input (MB-42) | MB-42 | n/a |
| NF-28 | existing_front_parking_pad | user input (MB-42) | MB-42 | n/a |
| NF-29 | has_secondary_suite | user input; scenario `house_with_secondary_suite` (MB-42) | MB-42 | n/a |
| NF-30 | max_buildable_footprint_suite_sqm | `suite_coverage_option`, `suite_footprint_sqm` | MB-39 | n/a |
| NF-31 | max_buildable_gfa_suite_sqm | `main_gfa_with_suite_sqm`, `total_gfa_sqm` | MB-41 | n/a |
| NF-32 | max_buildable_suite_binding | `suite_binding` | MB-41 | n/a |
| NF-12 note (:816) | clarification of NF-12 | with NF-12 | MB-43 | n/a |
| NF-13 note (:817) | clarification of NF-13 | with NF-13 | MB-43 | n/a |
| NF-14 note (:818) | clarification of NF-14 | with NF-14 | MB-43 | n/a |

EF-1..EF-22 (58:837-858) describe how existing enrich_parcels columns would change (A5-A8, B3, C4, D2-D8 above); they map to the rows already listed and retire with the section 13 mirror (MB-43). EF-22 names `cost_fb_total`, `cost_coa_total`, `cost_solar_total`, `cost_garden_suite_total`, `cost_garage_total` (stored costs priced off the max-build areas; recapture under D7-D9).

## G. Differences on ~/Buildo-wt-usescope

- funnel.ts:686 is NOT on main. On usescope it is only a pipeline-catalog summary string for step `resolve_bylaws` ("Layer 2"). It reads no data. No src/, mobile/ or scripts/lib file reads `bylaw_resolution_lots` / `bylaw_resolution_results` / `parcel_maxbld_scenarios` at runtime on either tree; only generated `schema.ts` types exist (usescope). So today there is zero product reader of Layer 2, and every row above is on the old path.
- Same files on both trees (cmp): max-build.js, enrich-parcels.js, enrich-permits.js, enrich-lead-zoning.js, zoning-precedence.js, parcel-lookup.ts, consumer-lookup.ts, parcel-cost.js, compute-parcel-cost-estimates.js, optimal-config.js, cost-model.ts, parcels/types.ts, permits/types.ts, compute-cost-estimates.js, compute-build-norms.js, assert-global-coverage.js, mobile/src.
- Differs: scripts/compute-coa-cost-estimates.js (usescope 33-line wrapper; reader moved to the lib/compute file, which is identical), src/lib/db/generated/schema.ts (more lines), src/lib/admin/funnel.ts (adds the catalog line), scripts/lib/step/index.js (same 9 hits), renovation-shared.js (comments plus new code, no column consumer).
- New on usescope (not old consumers, listed so a second seat can skip them): scripts/lib/maxbld-*.js, scripts/lib/compute/resolve-bylaws.js, scripts/lib/bylaw-materialize.js.

## H. Surprises

1. Mobile app is a consumer: `mobile/app/(app)/parcel-tool/[parcelId].tsx:129-137`, `mobile/src/lib/trackedLots.ts`, `TrackedLotRow.tsx`, `parcelCostFormat.ts`, `useTrackedLots.ts` show Max Build, Max Build FSI, CoA FSI, storeys and "Envelope constrained".
2. scripts/lib/enrich-lead-zoning.js is a second, byte-identical copy of the enrich-permits snapshot/null-audit logic (lines 39, 88-89, 137-138, 160-161, 366-368); it must be switched with enrich-permits.js.
3. On main, the CoA cost estimator exists twice (scripts/compute-coa-cost-estimates.js 921 lines and scripts/lib/compute/compute-coa-cost-estimates.js).
4. `compute-build-norms.js` stores neighbourhood build ratios divided by `max_buildable_gfa_sqm`, a derived store the queue did not name (D11). Also unnamed in the queue: `parcel-cost-cols.js` FSI scalars (D6), `optimal-config.js` BYLAW constants (A13, B8), `RAVINE_SETBACK_M` (A12), accessory caps (D5), `cost-model-shared.js` coverage fallback (B9), generated `schema.ts` and `permits/types.ts`.
5. Queue says max-build.js:121 for SETBACK_DEFAULTS; actual line is 120 (COVERAGE_DEFAULTS :186 correct).
6. "35 NF rows" reconciles as 32 numbered rows + 3 clarification rows (NF-12/13/14 at 816-818).
7. No replacement field exists in Spec 78 for: main-house landscaping and driveway rules (NF-12/13/14/20-23), garage scenario (D5), numeric ravine distance (A12), density / minimum frontage / minimum area / `bylaw_pct_*` (D14), and the coverage-ratio fallback decision (B9).

## Search commands (re-run independently from ~/Buildo; zsh needs quotes around globs)

```
cd ~/Buildo
# 1 old columns and constants, all code and SQL, tests excluded
grep -rnE "bylaw_max_|bylawMax|SETBACK_DEFAULTS|COVERAGE_DEFAULTS" --include='*.js' --include='*.ts' --include='*.tsx' --include='*.mjs' --include='*.sql' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next . | grep -vE "__tests__|\.test\.|\.spec\.|/tests?/"
# 2 derived max-build columns, product code only
P='max_build_|max_buildable_|max_garden_suite|max_laneway|max_rear_suite|max_garage|max_newbuild|garden_suite_fits|envelope_constrain|market_exceeds_bylaw|bylaw_standard_setback|bylaw_min_|bylaw_max|lookupSetback|lookupCoverage|lookupSideCount|buildSetbackCase|buildCoverageCase|zone_default|STOREY_HEIGHT_M|RAVINE_SETBACK_M|max_build_fsi|coa_fsi|realized_fsi'
grep -rnE "$P" src mobile/app mobile/src --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' | grep -vE "__tests__|\.test\.|\.spec\.|src/tests/"
grep -rnE "$P" scripts --include='*.js' --include='*.mjs' | grep -vE "scripts/analysis/|test"
# 3 files list (all), to catch unlisted
grep -rEln 'max_build_|max_buildable_|bylaw_|setback|lot_coverage' --include='*.js' --include='*.ts' --include='*.tsx' --include='*.mjs' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next src mobile scripts | grep -vE "__tests__|\.test\.|\.spec\."
# 4 stored copies: propagation sets and snapshots
grep -nE "LOT_MAXBUILD_COLS|SCENARIO_COLS|OPT_COMP_PROP_COLS|COST_PROP_COLS|variance_context" scripts/enrich-permits.js scripts/lib/enrich-lead-zoning.js
# 5 hard-coded numeric zoning literals (lint substitute): constants and CASE tables
grep -nE "^const [A-Z_]+ *= *[0-9.]+" scripts/lib/max-build.js scripts/lib/optimal-config.js
grep -nE "(coverage|setback|storey|height|fsi).*[=:] *[0-9]+(\.[0-9]+)?[;,]" src/features/leads/lib/cost-model-shared.js
# 6 mobile and consumer displays
grep -rniE "\bfsi\b|max build|coverage|setback|storeys|envelope" mobile/app mobile/src --include='*.ts' --include='*.tsx' | grep -v __tests__
# 7 Spec 58 section 13
grep -nE "^\| (NF|EF)-" docs/specs/01-pipeline/58_source_zoning_bylaw.md | wc -l      # 57 = 32 + 3 + 22
sed -n 711,717p docs/specs/01-pipeline/58_source_zoning_bylaw.md
grep -rlE "\bNF-[0-9]+|\bEF-[0-9]+" docs src scripts mobile/src mobile/app .cursor --include='*.md' --include='*.js' --include='*.mjs' --include='*.ts' --include='*.json'
sed -n 60,61p docs/specs/01-pipeline/69a_mcbylaw_register.md
# 8 usescope comparison
for f in <file>; do cmp -s ~/Buildo/$f ~/Buildo-wt-usescope/$f && echo SAME $f || echo DIFF $f; done
grep -rnE "bylaw_resolution_|parcel_maxbld_scenarios" ~/Buildo-wt-usescope/src ~/Buildo-wt-usescope/mobile/src ~/Buildo-wt-usescope/mobile/app ~/Buildo-wt-usescope/scripts/lib ~/Buildo-wt-usescope/scripts/*.js --include='*.ts' --include='*.tsx' --include='*.js' | grep -vE "test|migrations"
# 9 new-field list
sed -n 1044,1200p ~/Buildo-wt-usescope/docs/specs/01-pipeline/78_optimal_lot_configuration.md | grep -oE '^\| `[a-z_0-9]+`'
```

Not done (for the second seat, per MB-07 done-when): a numeric-literal lint over the whole tree and a re-search by column name were run only as the greps above; scripts/analysis/bylaw/* (the Layer 2 pipeline itself) and tests were deliberately excluded.
