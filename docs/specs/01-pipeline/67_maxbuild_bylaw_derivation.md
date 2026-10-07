# MaxBuild derivation from Zoning By-law 569-2013 — **v0.1**

**Version:** 0.1 — authored 2026-09-29 (doc-only). Derivation methodology + scenario catalogue for the max-build envelope. **No code is specified here that is not already built or already queued.**

> **Status — two tiers, never mixed.**
> * **AS-BUILT** — what `enrich_parcels` computes today: `scripts/lib/compute/enrich-parcels.js#buildMaxBuildSql` (max-build pass) reading the zoning feed written by `scripts/lib/compute/enrich-parcels.js#buildEnrichmentSql` (zoning pass), with the constants in `scripts/lib/max-build.js` (`SETBACK_DEFAULTS`, `COVERAGE_DEFAULTS`, `buildSetbackCase`, `buildCoverageCase`, `buildSideCountCase`, `MAX_BUILD_COLS`). The owning behavioural contract is **Spec 65 §4** (MB-1..MB-8); this spec explains and derives it and does not amend it.
> * **PLANNED** — the QUEUED, **not authorized, not implemented** WF2 `.cursor/wf2_bylaw_formula_fixes_active_task.md` (NF-1..NF-28, EF-1..EF-22, V1–V25), whose tables are mirrored verbatim in **Spec 58 §13**. Nothing marked planned exists in the database or code.
> * Every field / formula row carries a **Status** ∈ `as-built` · `planned` · `user-input` · `research-required`. **McBylaw Phase 3 (RATIFIED 2026-10-07, Spec 69 M-61..M-72; not yet built):** the constants in §3.3 and the NF/EF formulas move out of code — law values to the McBylaw table (Spec 68), report formulas to the Layer 3 formula registry, every non-law number to an admin logic variable (Spec 78 §6); this spec's constant tables then describe the as-built code only.
>
> **Generated content.** Every table below marked *(generated)* was produced by `spec67-gen/gen.js` (session scratchpad, not in the repo), which: fetched the City's by-law pages with curl; ported the NF/EF/ledger/provision tables byte-for-byte from the plan and asserted byte-equality with Spec 58 §13; enumerated the existing columns from `MAX_BUILD_COLS`, `ALL_WRITE_COLS`, the SQL the two builders generate, the generated drizzle schema (`src/lib/db/generated/schema.ts`) and Spec 58 §2; verified every quoted by-law claim against the fetched pages; and self-checked its worked-example calculator against the plan's vectors. Run summary: existing columns: 50 (MAX_BUILD_COLS 29 + zoning-pass 21); NF rows: 32 (+1 formula-constant row); EF rows: 22; claims: 76 (60 verified, 12 UNVERIFIED, 4 absence phrases); ledger L1–L28 re-verified: 28/28; G-anchors: 23/23; vectors matched: 24/24 (1 skipped). Generated 2026-09-29T14:50:29.041Z.

## 0. Ownership boundary

| Spec | Owns | Does not own |
|---|---|---|
| **Spec 58** (`58_source_zoning_bylaw.md`) | Zoning **source ingestion** (`zoning_bylaw_areas` + 9 overlay tables incl. `zoning_height_overlay`, `zoning_lot_coverage_overlay`, `zoning_policy_road_overlay`; `STAND_SET`, `FRONTAGE`, exceptions) and the **provisions reference** (§13: planned NF/EF tables, coverage-vs-setback note, landscaping ledger). | Any parcel-level computation. |
| **Spec 65** (`65_enrich_parcels.md`) | The **as-built computation**: zoning precedence onto `parcels.bylaw_*` (§2–§3) and the max-build envelope (§4 MB-1..MB-8), accessory fit (§7), storey norms (§8). | Legal interpretation beyond what §4 states. |
| **Spec 67** (this spec) | The **derivation methodology** (how each MaxBuild figure follows from by-law inputs), the **scenario catalogue** with worked numbers, the verified **by-law claim ledger**, and the as-built ↔ planned field map. | Behaviour. If this spec and Spec 65 disagree about what the code does, **Spec 65 + the code win** and this spec is stale. |
| **Spec 78** (`78_optimal_lot_configuration.md`) | A **consumer**: the optimal-config engine reads `max_buildable_footprint_sqm` / `max_build_stories` / `bylaw_*`. | The envelope itself. |

## 1. Goal & User Story

A buyer-facing lot report shows "the most you can build here as of right". Every number in that answer must be traceable: *by-law provision → Spec 58 source column → Spec 65 formula → field*. This spec is that trace. It (a) documents precisely how today's envelope is computed and where it departs from the by-law, (b) records the queued by-law-exact formulas without implying they exist, and (c) walks every lot scenario with numbers so a reviewer can see which term binds.

## 2. Source-of-record consistency *(generated)*

The plan and Spec 58 §13 must never diverge. The generator compares each shared section line-for-line:

| Plan section | Plan lines | Spec 58 §13 lines | Byte-identical |
| --- | --- | --- | --- |
| New fields to add — FULL TABLE, ported verbatim from the source report (not summarized) | 38 | 38 | yes |
| Coverage vs setback — the report shows both (operator 2026-09-29) — MORE RESEARCH REQUIRED | 11 | 11 | yes |
| Landscaping — soft vs hard, driveways — provision ledger (generator-verified 2026-09-29) | 61 | 61 | yes |
| Existing fields changed — FULL TABLE, ported verbatim | 27 | 27 | yes |
| Additional by-law provisions in scope (ported verbatim) | 12 | 12 | yes |

**Report vs plan (informational).** The plan's tables say "ported verbatim from the source report", but the plan was later corrected in place (reality-check folds) and the report was not re-synced. The plan (= Spec 58 §13) is the source of record; the report's rows differ as follows:

- NF-1: report cells Formula / source differ
- NF-3: report cells By-law claim (exact citation), Formula / source, Constraints differ
- NF-4: report cells By-law claim (exact citation), Formula / source, Constraints, Basis companion differ
- NF-5: report cells By-law claim (exact citation), Constraints differ
- NF-6: report cells By-law claim (exact citation), Formula / source, Constraints, Basis companion differ
- NF-7: report cells Formula / source, Constraints differ
- NF-10: report cells By-law claim (exact citation), Formula / source, Constraints differ
- NF-11: report cells By-law claim (exact citation), Constraints differ
- NF-12: report cells Formula / source, Constraints differ
- NF-14: report cells Constraints differ
- —: report cells Formula / source differ
- NF-15: report cells By-law claim (exact citation), Formula / source, Constraints differ
- NF-16: report cells By-law claim (exact citation), Constraints differ
- EF-2: report cells Formula / source, Constraints, Basis companion differ
- EF-3: report cells Formula / source differ
- EF-4: report cells Constraints, Basis companion differ
- EF-6: report cells Type differ
- EF-7: report cells Type differ
- EF-8: report cells Constraints differ
- EF-9: report cells Type differ
- EF-13: report cells Constraints differ
- EF-18: report cells Field differ
- EF-22: report cells Field differ

## 3. Field table

### 3.1 Existing columns — AS-BUILT *(generated)*

Enumerated mechanically: the 29 `MAX_BUILD_COLS` (formula = the expression `buildMaxBuildSql` generates for that output alias, rendered with the JS-fallback defaults — live values of tunables come from `logic_variables`, §3.3), plus every `bylaw_*` column in `ALL_WRITE_COLS` and the zoning columns the envelope or the planned formulas read. *Source columns* is the transitive closure of the expression over the generated CTEs; *Source (Spec 58)* traces each zoning input to its Spec 58 §2 table/column and CKAN field.

| Field | Type (generated schema) | Status | Writer in `scripts/lib/compute/enrich-parcels.js` | As-built formula (generated SQL, JS-fallback defaults) | Source columns (transitive; `LOT` = `lot_size_sqm`, `frontage_m`, `depth_m`, `geom`) | Source (Spec 58) |
| --- | --- | --- | --- | --- | --- | --- |
| `lot_size_confidence` | text | as-built | `buildMaxBuildSql` (CTE `tier`) | `CASE WHEN best_area IS NULL THEN NULL WHEN best_area < 50 OR best_area > 2000 THEN 'low' WHEN pair_lg AND pair_lf AND pair_gf THEN 'high' WHEN pair_lg OR pair_lf OR pair_gf THEN 'medium' ELSE 'low' END` | LOT | — (no Spec 58 input) |
| `lot_size_basis` | text | as-built | `buildMaxBuildSql` (CTE `tier`) | `CASE WHEN best_area IS NULL THEN NULL WHEN best_area < 50 OR best_area > 2000 THEN 'oob' WHEN pair_lg AND pair_lf AND pair_gf THEN '3way' WHEN pair_lg OR pair_lf OR pair_gf THEN 'pair' ELSE 'single' END` | LOT | — (no Spec 58 input) |
| `max_build_setback_basis` | text | as-built | `buildMaxBuildSql` (final SELECT) | `CASE WHEN emit THEN (CASE WHEN setback_is_bylaw THEN 'bylaw' ELSE 'zone_default' END) END` | LOT, `bylaw_standard_setback_m` | `bylaw_standard_setback_m` (origins: zoning rows below) |
| `max_buildable_footprint_sqm` | numeric { precision: 12, scale: 2 } | as-built | `buildMaxBuildSql` (final SELECT) | `CASE WHEN NOT emit OR heritage_no_massing THEN NULL WHEN heritage THEN existing_footprint_sqm ELSE footprint_calc END` | LOT, `bylaw_max_coverage_pct`, `bylaw_standard_setback_m`, `existing_footprint_sqm`, `is_corner_lot`, `is_heritage_designated`, `is_in_ravine_protection_area`, `is_through_lot`, `zoning_class` | `bylaw_max_coverage_pct`, `bylaw_standard_setback_m`, `zoning_class` (origins: zoning rows below) |
| `max_build_width_m` | numeric { precision: 8, scale: 2 } | as-built | `buildMaxBuildSql` (final SELECT) | `CASE WHEN emit AND NOT heritage AND NOT ravine_sub_floor THEN width_m END` | LOT, `bylaw_standard_setback_m`, `is_corner_lot`, `is_heritage_designated`, `is_in_ravine_protection_area`, `is_through_lot`, `zoning_class` | `bylaw_standard_setback_m`, `zoning_class` (origins: zoning rows below) |
| `max_build_length_m` | numeric { precision: 8, scale: 2 } | as-built | `buildMaxBuildSql` (final SELECT) | `CASE WHEN emit AND NOT heritage AND NOT ravine_sub_floor THEN length_m END` | LOT, `bylaw_standard_setback_m`, `is_corner_lot`, `is_heritage_designated`, `is_in_ravine_protection_area`, `is_through_lot`, `zoning_class` | `bylaw_standard_setback_m`, `zoning_class` (origins: zoning rows below) |
| `max_build_height_m` | numeric { precision: 8, scale: 2 } | as-built | `buildMaxBuildSql` (final SELECT) | `CASE WHEN emit AND NOT heritage AND NOT ravine_sub_floor THEN bylaw_max_height_m END` | LOT, `bylaw_max_height_m`, `bylaw_standard_setback_m`, `is_corner_lot`, `is_heritage_designated`, `is_in_ravine_protection_area`, `is_through_lot`, `zoning_class` | `bylaw_max_height_m`, `bylaw_standard_setback_m`, `zoning_class` (origins: zoning rows below) |
| `max_build_stories` | integer | as-built | `buildMaxBuildSql` (final SELECT) | `CASE WHEN NOT emit OR heritage_no_massing OR ravine_sub_floor THEN NULL ELSE stories_calc END` | LOT, `bylaw_max_height_m`, `bylaw_max_stories`, `bylaw_standard_setback_m`, `existing_footprint_sqm`, `is_corner_lot`, `is_heritage_designated`, `is_in_ravine_protection_area`, `is_through_lot`, `neighbourhood_id`, `pocket_p50_local`, `zoning_class` | `bylaw_max_height_m`, `bylaw_max_stories`, `bylaw_standard_setback_m`, `zoning_class` (origins: zoning rows below) |
| `max_build_stories_basis` | text | as-built | `buildMaxBuildSql` (final SELECT) | `CASE WHEN NOT emit OR heritage_no_massing OR ravine_sub_floor THEN NULL WHEN bylaw_max_stories IS NOT NULL THEN 'bylaw' WHEN pocket_p50 IS NOT NULL THEN 'pocket' WHEN bylaw_max_height_m IS NOT NULL AND bylaw_max_height_m > 0 THEN 'derived' ELSE NULL END` | LOT, `bylaw_max_height_m`, `bylaw_max_stories`, `bylaw_standard_setback_m`, `existing_footprint_sqm`, `is_corner_lot`, `is_heritage_designated`, `is_in_ravine_protection_area`, `is_through_lot`, `neighbourhood_id`, `pocket_p50_local`, `zoning_class` | `bylaw_max_height_m`, `bylaw_max_stories`, `bylaw_standard_setback_m`, `zoning_class` (origins: zoning rows below) |
| `max_build_basis` | text | as-built | `buildMaxBuildSql` (final SELECT) | `CASE WHEN NOT emit OR heritage_no_massing OR ravine_sub_floor THEN NULL WHEN heritage THEN 'heritage_existing' ELSE 'rect_approx' END` | LOT, `bylaw_standard_setback_m`, `existing_footprint_sqm`, `is_corner_lot`, `is_heritage_designated`, `is_in_ravine_protection_area`, `is_through_lot`, `zoning_class` | `bylaw_standard_setback_m`, `zoning_class` (origins: zoning rows below) |
| `max_buildable_gfa_sqm` | numeric { precision: 12, scale: 2 } | as-built | `buildMaxBuildSql` (final SELECT) | `CASE WHEN NOT emit OR heritage_no_massing OR ravine_sub_floor THEN NULL WHEN heritage THEN round(existing_footprint_sqm * stories_calc, 2) ELSE LEAST(gfa_box, fsi_cap) END` | LOT, `bylaw_max_coverage_pct`, `bylaw_max_fsi`, `bylaw_max_height_m`, `bylaw_max_stories`, `bylaw_standard_setback_m`, `existing_footprint_sqm`, `is_corner_lot`, `is_heritage_designated`, `is_in_ravine_protection_area`, `is_through_lot`, `neighbourhood_id`, `pocket_p50_local`, `zoning_class` | `bylaw_max_coverage_pct`, `bylaw_max_fsi`, `bylaw_max_height_m`, `bylaw_max_stories`, `bylaw_standard_setback_m`, `zoning_class` (origins: zoning rows below) |
| `max_buildable_gfa_basis` | text | as-built | `buildMaxBuildSql` (final SELECT) | `CASE WHEN NOT emit OR heritage_no_massing OR ravine_sub_floor THEN NULL WHEN heritage THEN 'heritage_existing' WHEN width_m IS NULL OR length_m IS NULL THEN 'coverage_only' WHEN fsi_cap IS NOT NULL AND fsi_cap <= COALESCE(gfa_box, 'infinity'::numeric) THEN 'fsi' ELSE 'coverage_box' END` | LOT, `bylaw_max_coverage_pct`, `bylaw_max_fsi`, `bylaw_max_height_m`, `bylaw_max_stories`, `bylaw_standard_setback_m`, `existing_footprint_sqm`, `is_corner_lot`, `is_heritage_designated`, `is_in_ravine_protection_area`, `is_through_lot`, `neighbourhood_id`, `pocket_p50_local`, `zoning_class` | `bylaw_max_coverage_pct`, `bylaw_max_fsi`, `bylaw_max_height_m`, `bylaw_max_stories`, `bylaw_standard_setback_m`, `zoning_class` (origins: zoning rows below) |
| `max_build_confidence` | text | as-built | `buildMaxBuildSql` (final SELECT) | `CASE WHEN NOT emit OR heritage_no_massing THEN NULL WHEN zoning_is_ambiguous THEN 'low' WHEN heritage THEN 'high' WHEN width_m IS NULL OR length_m IS NULL THEN 'low' WHEN lot_size_confidence = 'high' AND setback_is_bylaw AND (bylaw_max_fsi IS NOT NULL OR bylaw_max_height_m IS NOT NULL) THEN 'high' ELSE 'medium' END` | LOT, `bylaw_max_fsi`, `bylaw_max_height_m`, `bylaw_standard_setback_m`, `existing_footprint_sqm`, `is_corner_lot`, `is_heritage_designated`, `is_in_ravine_protection_area`, `is_through_lot`, `zoning_class`, `zoning_is_ambiguous` | `bylaw_max_fsi`, `bylaw_max_height_m`, `bylaw_standard_setback_m`, `zoning_class`, `zoning_is_ambiguous` (origins: zoning rows below) |
| `max_garden_suite_gfa_sqm` | numeric { precision: 8, scale: 2 } | as-built | `buildMaxBuildSql` (CTE `accessory2`) | `CASE WHEN a.garden_fits THEN round(60::numeric, 2) END` | LOT, `bylaw_standard_setback_m`, `is_heritage_designated`, `is_in_ravine_protection_area`, `zoning_class` | `bylaw_standard_setback_m`, `zoning_class` (origins: zoning rows below) |
| `garden_suite_fits` | boolean NOT NULL DEFAULT false | as-built | `buildMaxBuildSql` (CTE `accessory` (as `garden_fits`)) | `COALESCE(emit AND NOT heritage AND NOT is_in_ravine_protection_area AND lot_size_sqm >= 270 AND (depth_m - front_setback - rear_setback) >= 5, false)` | LOT, `bylaw_standard_setback_m`, `is_heritage_designated`, `is_in_ravine_protection_area`, `zoning_class` | `bylaw_standard_setback_m`, `zoning_class` (origins: zoning rows below) |
| `envelope_constrained` | boolean NOT NULL DEFAULT false | as-built | `buildMaxBuildSql` (final SELECT) | `COALESCE(emit AND (heritage OR is_in_ravine_protection_area OR width_m IS NULL OR length_m IS NULL OR (buffer_area IS NULL AND box_area IS NULL)), false)` | LOT, `bylaw_standard_setback_m`, `is_corner_lot`, `is_heritage_designated`, `is_in_ravine_protection_area`, `is_through_lot`, `zoning_class` | `bylaw_standard_setback_m`, `zoning_class` (origins: zoning rows below) |
| `envelope_constraint_reason` | text | as-built | `buildMaxBuildSql` (final SELECT) | `CASE WHEN NOT emit AND lot_size_sqm < 50 THEN 'lot_too_small' WHEN NOT emit AND lot_size_sqm > 2000 THEN 'lot_too_large' WHEN NOT emit THEN 'low_lot_confidence' WHEN heritage_no_massing THEN (CASE WHEN heritage_footprint_mislink THEN 'heritage_footprint_exceeds_lot' ELSE 'heritage_no_massing' END) WHEN heritage THEN 'heritage' WHEN is_in_ravine_protection_area AND (width_m IS NULL OR length_m IS NULL) THEN 'ravine_constrained' WHEN is_in_ravine_protection_area THEN 'ravine' WHEN buffer_area IS NULL AND box_area IS NULL THEN 'setback_exceeds_lot' WHEN width_m IS NULL OR length_m IS NULL THEN 'lot_too_narrow' WHEN zoning_is_ambiguous THEN 'ambiguous_zone' ELSE NULL END` | LOT, `bylaw_standard_setback_m`, `existing_footprint_sqm`, `is_corner_lot`, `is_heritage_designated`, `is_in_ravine_protection_area`, `is_through_lot`, `zoning_class`, `zoning_is_ambiguous` | `bylaw_standard_setback_m`, `zoning_class`, `zoning_is_ambiguous` (origins: zoning rows below) |
| `max_garage_gfa_sqm` | numeric { precision: 12, scale: 2 } | as-built | `buildMaxBuildSql` (CTE `accessory2`) | `CASE WHEN a.emit AND NOT a.heritage AND NOT a.is_in_ravine_protection_area AND a.lot_size_sqm >= 230 AND LEAST(60::numeric, 0.3::numeric * a.rear_yard_area) >= GREATEST(18::numeric, 18.5::numeric) THEN round(LEAST(60::numeric, 0.3::numeric * a.rear_yard_area), 2) END` | LOT, `bylaw_standard_setback_m`, `existing_total_footprint_sqm`, `is_corner_lot`, `is_heritage_designated`, `is_in_ravine_protection_area`, `zoning_class` | `bylaw_standard_setback_m`, `zoning_class` (origins: zoning rows below) |
| `garage_capacity_cars` | integer | as-built | `buildMaxBuildSql` (final SELECT) | `CASE WHEN max_garage_gfa_sqm IS NOT NULL THEN floor(max_garage_gfa_sqm / 18.5)::int END` | LOT, `bylaw_standard_setback_m`, `existing_total_footprint_sqm`, `is_corner_lot`, `is_heritage_designated`, `is_in_ravine_protection_area`, `zoning_class` | `bylaw_standard_setback_m`, `zoning_class` (origins: zoning rows below) |
| `garage_constraint_reason` | text | as-built | `buildMaxBuildSql` (final SELECT) | `CASE WHEN garage_fits THEN NULL WHEN NOT emit THEN 'low_lot_confidence' WHEN heritage THEN 'heritage' WHEN is_in_ravine_protection_area THEN 'ravine' WHEN lot_size_sqm < 230 THEN 'lot_too_small' WHEN LEAST(60::numeric, 0.3::numeric * rear_yard_area) < GREATEST(18::numeric, 18.5::numeric) THEN 'no_rear_yard' ELSE NULL END` | LOT, `bylaw_standard_setback_m`, `existing_total_footprint_sqm`, `is_corner_lot`, `is_heritage_designated`, `is_in_ravine_protection_area`, `zoning_class` | `bylaw_standard_setback_m`, `zoning_class` (origins: zoning rows below) |
| `garage_permission` | text | as-built | `buildMaxBuildSql` (final SELECT) | `CASE WHEN NOT garage_fits THEN (CASE WHEN emit THEN 'not_permitted' END) WHEN GREATEST(0, lot_size_sqm - COALESCE(existing_total_footprint_sqm, 0) - max_garage_gfa_sqm) >= 0.3 * lot_size_sqm THEN 'as_of_right' ELSE 'coa_required' END` | LOT, `bylaw_standard_setback_m`, `existing_total_footprint_sqm`, `is_corner_lot`, `is_heritage_designated`, `is_in_ravine_protection_area`, `zoning_class` | `bylaw_standard_setback_m`, `zoning_class` (origins: zoning rows below) |
| `max_laneway_suite_gfa_sqm` | numeric { precision: 12, scale: 2 } | as-built | `buildMaxBuildSql` (CTE `accessory2`) | `CASE WHEN a.laneway_fits THEN round(120::numeric, 2) END` | LOT, `abuts_laneway`, `bylaw_standard_setback_m`, `is_heritage_designated`, `is_in_ravine_protection_area`, `zoning_class` | `bylaw_standard_setback_m`, `zoning_class` (origins: zoning rows below) |
| `max_rear_suite_gfa_sqm` | numeric { precision: 12, scale: 2 } | as-built | `buildMaxBuildSql` (final SELECT) | `CASE rear_suite_type WHEN 'laneway' THEN max_laneway_suite_gfa_sqm WHEN 'garden' THEN max_garden_suite_gfa_sqm END` | LOT, `abuts_laneway`, `bylaw_standard_setback_m`, `is_heritage_designated`, `is_in_ravine_protection_area`, `zoning_class` | `bylaw_standard_setback_m`, `zoning_class` (origins: zoning rows below) |
| `rear_suite_type` | text | as-built | `buildMaxBuildSql` (CTE `accessory2`) | `CASE WHEN a.abuts_laneway AND a.laneway_fits THEN 'laneway' WHEN NOT a.abuts_laneway AND a.garden_fits THEN 'garden' END` | LOT, `abuts_laneway`, `bylaw_standard_setback_m`, `is_heritage_designated`, `is_in_ravine_protection_area`, `zoning_class` | `bylaw_standard_setback_m`, `zoning_class` (origins: zoning rows below) |
| `rear_suite_permission` | text | as-built | `buildMaxBuildSql` (final SELECT) | `CASE WHEN rear_suite_type IS NULL THEN (CASE WHEN emit THEN 'not_permitted' END) WHEN GREATEST(0, lot_size_sqm - COALESCE(existing_total_footprint_sqm, 0) - (CASE rear_suite_type WHEN 'laneway' THEN max_laneway_suite_gfa_sqm / 2 WHEN 'garden' THEN max_garden_suite_gfa_sqm / 1 END)) >= 0.3 * lot_size_sqm THEN 'as_of_right' ELSE 'coa_required' END` | LOT, `abuts_laneway`, `bylaw_standard_setback_m`, `existing_total_footprint_sqm`, `is_heritage_designated`, `is_in_ravine_protection_area`, `zoning_class` | `bylaw_standard_setback_m`, `zoning_class` (origins: zoning rows below) |
| `max_build_stories_aggressive` | integer | as-built | `buildMaxBuildSql` (final SELECT) | `CASE WHEN NOT emit OR heritage_no_massing OR heritage THEN NULL ELSE pocket_p90 END` | LOT, `existing_footprint_sqm`, `is_heritage_designated`, `neighbourhood_id`, `pocket_p90_local` | — (no Spec 58 input) |
| `market_exceeds_bylaw` | boolean NOT NULL DEFAULT false | as-built | `buildMaxBuildSql` (final SELECT) | `COALESCE(emit AND NOT heritage AND pocket_p90 IS NOT NULL AND height_implied IS NOT NULL AND pocket_p90 > height_implied, false)` | LOT, `bylaw_max_height_m`, `is_heritage_designated`, `neighbourhood_id`, `pocket_p90_local`, `zoning_class` | `bylaw_max_height_m`, `zoning_class` (origins: zoning rows below) |
| `neighbourhood_id` | integer | as-built | `buildMaxBuildSql` (CTE `scope`) | `nb.neighbourhood_id` | `neighbourhood_id` | — (no Spec 58 input) |
| `neighbourhood_cost_premium` | numeric { precision: 4, scale: 2 } | as-built | `buildMaxBuildSql` (final SELECT) | `round((CASE WHEN nbhd_income IS NULL THEN 1.00 WHEN nbhd_income >= 0 AND nbhd_income < 60000 THEN 1.00 WHEN nbhd_income >= 60000 AND nbhd_income < 100000 THEN 1.15 WHEN nbhd_income >= 100000 AND nbhd_income < 150000 THEN 1.35 WHEN nbhd_income >= 150000 AND nbhd_income < 200000 THEN 1.60 WHEN nbhd_income >= 200000 THEN 1.85 ELSE 1.00 END)::numeric, 2)` | `nbhd_income` | — (no Spec 58 input) |
| `bylaw_chapter` | text | as-built | `buildEnrichmentSql` (zoning pass, `ALL_WRITE_COLS`) | `precedence rule dominant` | — | `zoning_bylaw_areas.bylaw_chapter` ← CKAN `ZBL_CHAPT` (Spec 58 §2 Target Table 1, TEXT); precedence `dominant` |
| `bylaw_section` | text | as-built | `buildEnrichmentSql` (zoning pass, `ALL_WRITE_COLS`) | `precedence rule dominant` | — | `zoning_bylaw_areas.bylaw_section` ← CKAN `ZBL_SECTN` (Spec 58 §2 Target Table 1, TEXT); precedence `dominant` |
| `bylaw_exception_ref` | text | as-built | `buildEnrichmentSql` (zoning pass, `ALL_WRITE_COLS`) | `precedence rule dominant` | — | `zoning_bylaw_areas.bylaw_exception_ref` ← CKAN `ZBL_EXCPTN` (Spec 58 §2 Target Table 1, TEXT); precedence `dominant` |
| `bylaw_max_fsi` | numeric { precision: 6, scale: 3 } | as-built | `buildEnrichmentSql` (zoning pass, `ALL_WRITE_COLS`) | `precedence rule dominant` | — | `zoning_bylaw_areas.fsi_max` ← CKAN `FSI_TOTAL` (Spec 58 §2 Target Table 1, NUMERIC(6,3)); precedence `dominant` |
| `bylaw_max_units` | integer | as-built | `buildEnrichmentSql` (zoning pass, `ALL_WRITE_COLS`) | `precedence rule min` | — | `zoning_bylaw_areas.units_max` ← CKAN `UNITS` (Spec 58 §2 Target Table 1, INTEGER); precedence `min` |
| `bylaw_max_density` | numeric { precision: 10, scale: 2 } | as-built | `buildEnrichmentSql` (zoning pass, `ALL_WRITE_COLS`) | `precedence rule min` | — | `zoning_bylaw_areas.density_max` ← CKAN `DENSITY` (Spec 58 §2 Target Table 1, NUMERIC(10,2)); precedence `min` |
| `bylaw_pct_commercial_max` | numeric { precision: 5, scale: 2 } | as-built | `buildEnrichmentSql` (zoning pass, `ALL_WRITE_COLS`) | `precedence rule min` | — | `zoning_bylaw_areas.pct_commercial_max` ← CKAN `PRCNT_COMM` (Spec 58 §2 Target Table 1, NUMERIC(5,2)); precedence `min` |
| `bylaw_pct_residential_max` | numeric { precision: 5, scale: 2 } | as-built | `buildEnrichmentSql` (zoning pass, `ALL_WRITE_COLS`) | `precedence rule min` | — | `zoning_bylaw_areas.pct_residential_max` ← CKAN `PRCNT_RES` (Spec 58 §2 Target Table 1, NUMERIC(5,2)); precedence `min` |
| `bylaw_pct_employment_max` | numeric { precision: 5, scale: 2 } | as-built | `buildEnrichmentSql` (zoning pass, `ALL_WRITE_COLS`) | `precedence rule min` | — | `zoning_bylaw_areas.pct_employment_max` ← CKAN `PRCNT_EMMP` (Spec 58 §2 Target Table 1, NUMERIC(5,2)); precedence `min` |
| `bylaw_pct_office_max` | numeric { precision: 5, scale: 2 } | as-built | `buildEnrichmentSql` (zoning pass, `ALL_WRITE_COLS`) | `precedence rule min` | — | `zoning_bylaw_areas.pct_office_max` ← CKAN `PRCNT_OFFC` (Spec 58 §2 Target Table 1, NUMERIC(5,2)); precedence `min` |
| `bylaw_min_frontage_m` | numeric { precision: 8, scale: 2 } | as-built | `buildEnrichmentSql` (zoning pass, `ALL_WRITE_COLS`) | `precedence rule max` | — | `zoning_bylaw_areas.frontage_min_m` ← CKAN `FRONTAGE` (Spec 58 §2 Target Table 1, NUMERIC(8,2)); precedence `max` |
| `bylaw_min_area_sqm` | integer | as-built | `buildEnrichmentSql` (zoning pass, `ALL_WRITE_COLS`) | `precedence rule max` | — | `zoning_bylaw_areas.area_min_sqm` ← CKAN `ZN_AREA` (Spec 58 §2 Target Table 1, INTEGER); precedence `max` |
| `bylaw_standard_setback_m` | numeric { precision: 8, scale: 2 } | as-built | `buildEnrichmentSql` (zoning pass, `ALL_WRITE_COLS`) | `precedence rule max` | — | `zoning_bylaw_areas.standard_setback` ← CKAN `STAND_SET` (Spec 58 §2 Target Table 1, NUMERIC(8,2)); precedence `max` |
| `bylaw_max_coverage_pct` | numeric { precision: 5, scale: 2 } | as-built | `buildEnrichmentSql` (zoning pass, `ALL_WRITE_COLS`) | `precedence rule overlay_min` | — | `COALESCE(ca.cov_override, ba.base_coverage_max_pct)`: `zoning_lot_coverage_overlay.coverage_max_pct_override` ← CKAN `PRCNT_CVER` (MIN over overlapping polygons) else `zoning_bylaw_areas.coverage_max_pct` ← CKAN `COVERAGE` (MIN over base candidates) — Spec 58 §2 |
| `bylaw_max_height_m` | numeric { precision: 8, scale: 2 } | as-built | `buildEnrichmentSql` (zoning pass, `ALL_WRITE_COLS`) | `precedence rule overlay_min` | — | `zoning_height_overlay.height_max_m` ← CKAN `HT_LABEL` (Spec 58 §2 Target Tables 2-10, NUMERIC(8,2) CHECK >= 0); precedence `overlay_min` (lowest height wins: `ORDER BY h.height_max_m ASC`) |
| `bylaw_max_stories` | integer | as-built | `buildEnrichmentSql` (zoning pass, `ALL_WRITE_COLS`) | `precedence rule overlay_min` | — | `zoning_height_overlay.ht_stories` (Spec 58 §2 Target Tables 2-10, INTEGER CHECK >= 0); precedence `overlay_min` (lowest height wins: `ORDER BY h.height_max_m ASC`) |
| `zoning_class` | text | as-built | `buildEnrichmentSql` (zoning pass, `ALL_WRITE_COLS`) | `precedence rule dominant` | — | `zoning_bylaw_areas.zn_zone` ← CKAN `ZN_ZONE` (Spec 58 §2 Target Table 1, TEXT NOT NULL); precedence `dominant` |
| `zoning_is_ambiguous` | boolean | as-built | `buildEnrichmentSql` (zoning pass, `ALL_WRITE_COLS`) | `provenance column (see Source)` | — | derived in CTE `base_agg`: `(MAX(area_share) < 0.6)` over `zoning_bylaw_areas` base candidates (`AMBIGUOUS_DOMINANT_SHARE_MAX` = 0.6); final `COALESCE(..., false)` |
| `zoning_holding` | text | as-built | `buildEnrichmentSql` (zoning pass, `ALL_WRITE_COLS`) | `precedence rule dominant` | — | `zoning_bylaw_areas.zn_holding` ← CKAN `ZN_HOLDING` (Spec 58 §2 Target Table 1, TEXT); precedence `dominant` |
| `exception_number` | integer | as-built | `buildEnrichmentSql` (zoning pass, `ALL_WRITE_COLS`) | `precedence rule dominant` | — | `zoning_bylaw_areas.exception_number` ← CKAN `EXCPTN_NO` (Spec 58 §2 Target Table 1, INTEGER); precedence `dominant` |
| `on_policy_road` | boolean | as-built | `buildEnrichmentSql` (zoning pass, `ALL_WRITE_COLS`) | `precedence rule membership` | — | membership in `zoning_policy_road_overlay` (LineString: `ST_DWithin(parcel, line, road_overlay_distance_m)`, seed default 5) — Spec 58 §2 Target Tables 2-10 |

**Input owners** *(generated)*:

| Input | Owner / origin |
| --- | --- |
| `abuts_laneway` | Spec 62 (centreline) |
| `bylaw_max_coverage_pct` | Spec 58 — `COALESCE(ca.cov_override, ba.base_coverage_max_pct)`: `zoning_lot_coverage_overlay.coverage_max_pct_override` ← CKAN `PRCNT_CVER` (MIN over overlapping polygons) else `zoning_bylaw_areas.coverage_max_pct` ← CKAN `COVERAGE` (MIN over base candidates) — Spec 58 §2 |
| `bylaw_max_fsi` | Spec 58 — `zoning_bylaw_areas.fsi_max` ← CKAN `FSI_TOTAL` (Spec 58 §2 Target Table 1, NUMERIC(6,3)); precedence `dominant` |
| `bylaw_max_height_m` | Spec 58 — `zoning_height_overlay.height_max_m` ← CKAN `HT_LABEL` (Spec 58 §2 Target Tables 2-10, NUMERIC(8,2) CHECK >= 0); precedence `overlay_min` (lowest height wins: `ORDER BY h.height_max_m ASC`) |
| `bylaw_max_stories` | Spec 58 — `zoning_height_overlay.ht_stories` (Spec 58 §2 Target Tables 2-10, INTEGER CHECK >= 0); precedence `overlay_min` (lowest height wins: `ORDER BY h.height_max_m ASC`) |
| `bylaw_standard_setback_m` | Spec 58 — `zoning_bylaw_areas.standard_setback` ← CKAN `STAND_SET` (Spec 58 §2 Target Table 1, NUMERIC(8,2)); precedence `max` |
| `depth_m` | Spec 55 (parcels) |
| `existing_footprint_sqm` | Spec 56 (massing, primary) |
| `existing_total_footprint_sqm` | Spec 56 (massing, all) |
| `frontage_m` | Spec 55 (parcels) |
| `geom` | Spec 55 (parcels.geom) |
| `is_corner_lot` | Spec 62 (centreline) |
| `is_heritage_designated` | Spec 61 (heritage) |
| `is_in_ravine_protection_area` | Spec 59 (ravine) |
| `is_through_lot` | Spec 62 (centreline) |
| `lot_size_sqm` | Spec 55 (parcels) |
| `nbhd_income` | Spec 57 (neighbourhoods) |
| `neighbourhood_id` | Spec 57 (neighbourhoods) |
| `pocket_p50_local` | Spec 65 §8 (neighbourhood_storey_norms) |
| `pocket_p90_local` | Spec 65 §8 (neighbourhood_storey_norms) |
| `zoning_class` | Spec 58 — `zoning_bylaw_areas.zn_zone` ← CKAN `ZN_ZONE` (Spec 58 §2 Target Table 1, TEXT NOT NULL); precedence `dominant` |
| `zoning_is_ambiguous` | Spec 58 — derived in CTE `base_agg`: `(MAX(area_share) < 0.6)` over `zoning_bylaw_areas` base candidates (`AMBIGUOUS_DOMINANT_SHARE_MAX` = 0.6); final `COALESCE(..., false)` |

**Note — `bylaw_standard_setback_m` (CKAN `STAND_SET`), 2026-09-29 (CRITICAL finding, pending ruling; §8 KFM-14).** The table above traces it as the source of the front setback. The City's data dictionary says otherwise: STAND_SET = (Set of standards referred to in the Commercial-Residential mixed use zone, based on three different design typologies. The "standard set" number is prefaced by the letters "SS" in the zone label.) [H28]; Chapter 40 makes it a selector of five Development Standard Sets (H26/H27). Values are only 1/2/3; 2,341 residential parcels carry it only through MAX aggregation from edge-touching CR polygons. The field is kept; the proposed reading is in the plan's "Scope additions" (c).

### 3.2 Intermediate terms of the as-built pass *(generated)*

| Term | CTE in `buildMaxBuildSql` | Generated SQL (JS-fallback defaults) |
| --- | --- | --- |
| `front_setback` | `sb` | `COALESCE(s.bylaw_standard_setback_m, CASE WHEN upper(s.zoning_class) LIKE 'RD%' THEN 6.00 WHEN upper(s.zoning_class) LIKE 'RS%' THEN 6.00 WHEN upper(s.zoning_class) LIKE 'RT%' THEN 6.00 WHEN upper(s.zoning_class) LIKE 'RM%' THEN 6.00 WHEN upper(s.zoning_class) LIKE 'CR%' THEN 3.00 WHEN upper(s.zoning_class) LIKE 'CL%' THEN 3.00 WHEN upper(s.zoning_class) LIKE 'UT%' THEN 3.00 WHEN upper(s.zoning_class) LIKE 'R%' THEN 6.00 WHEN upper(s.zoning_class) LIKE 'C%' THEN 3.00 WHEN upper(s.zoning_class) LIKE 'E%' THEN 6.00 WHEN upper(s.zoning_class) LIKE 'I%' THEN 6.00 WHEN upper(s.zoning_class) LIKE 'O%' THEN 3.00 ELSE 6.00 END)` |
| `side_setback` | `sb` | `CASE WHEN upper(s.zoning_class) LIKE 'RD%' THEN 0.90 WHEN upper(s.zoning_class) LIKE 'RS%' THEN 0.90 WHEN upper(s.zoning_class) LIKE 'RT%' THEN 0.90 WHEN upper(s.zoning_class) LIKE 'RM%' THEN 1.50 WHEN upper(s.zoning_class) LIKE 'CR%' THEN 0.00 WHEN upper(s.zoning_class) LIKE 'CL%' THEN 0.00 WHEN upper(s.zoning_class) LIKE 'UT%' THEN 1.50 WHEN upper(s.zoning_class) LIKE 'R%' THEN 0.90 WHEN upper(s.zoning_class) LIKE 'C%' THEN 0.00 WHEN upper(s.zoning_class) LIKE 'E%' THEN 1.50 WHEN upper(s.zoning_class) LIKE 'I%' THEN 1.50 WHEN upper(s.zoning_class) LIKE 'O%' THEN 1.50 ELSE 1.20 END` |
| `rear_setback` | `sb` | `CASE WHEN upper(s.zoning_class) LIKE 'RD%' THEN 7.50 WHEN upper(s.zoning_class) LIKE 'RS%' THEN 7.50 WHEN upper(s.zoning_class) LIKE 'RT%' THEN 7.50 WHEN upper(s.zoning_class) LIKE 'RM%' THEN 7.50 WHEN upper(s.zoning_class) LIKE 'CR%' THEN 7.50 WHEN upper(s.zoning_class) LIKE 'CL%' THEN 7.50 WHEN upper(s.zoning_class) LIKE 'UT%' THEN 3.00 WHEN upper(s.zoning_class) LIKE 'R%' THEN 7.50 WHEN upper(s.zoning_class) LIKE 'C%' THEN 7.50 WHEN upper(s.zoning_class) LIKE 'E%' THEN 7.50 WHEN upper(s.zoning_class) LIKE 'I%' THEN 7.50 WHEN upper(s.zoning_class) LIKE 'O%' THEN 3.00 ELSE 7.50 END` |
| `flankage_setback` | `sb` | `CASE WHEN upper(s.zoning_class) LIKE 'RD%' THEN 4.50 WHEN upper(s.zoning_class) LIKE 'RS%' THEN 4.50 WHEN upper(s.zoning_class) LIKE 'RT%' THEN 4.50 WHEN upper(s.zoning_class) LIKE 'RM%' THEN 4.50 WHEN upper(s.zoning_class) LIKE 'CR%' THEN 3.00 WHEN upper(s.zoning_class) LIKE 'CL%' THEN 3.00 WHEN upper(s.zoning_class) LIKE 'UT%' THEN 3.00 WHEN upper(s.zoning_class) LIKE 'R%' THEN 4.50 WHEN upper(s.zoning_class) LIKE 'C%' THEN 3.00 WHEN upper(s.zoning_class) LIKE 'E%' THEN 6.00 WHEN upper(s.zoning_class) LIKE 'I%' THEN 6.00 WHEN upper(s.zoning_class) LIKE 'O%' THEN 3.00 ELSE 4.50 END` |
| `side_count` | `sb` | `CASE WHEN upper(s.zoning_class) LIKE 'RD%' THEN 2 WHEN upper(s.zoning_class) LIKE 'RS%' THEN 1 WHEN upper(s.zoning_class) LIKE 'RT%' THEN 0 WHEN upper(s.zoning_class) LIKE 'RM%' THEN 2 WHEN upper(s.zoning_class) LIKE 'CR%' THEN 2 WHEN upper(s.zoning_class) LIKE 'CL%' THEN 2 WHEN upper(s.zoning_class) LIKE 'UT%' THEN 2 WHEN upper(s.zoning_class) LIKE 'R%' THEN 2 WHEN upper(s.zoning_class) LIKE 'C%' THEN 2 WHEN upper(s.zoning_class) LIKE 'E%' THEN 2 WHEN upper(s.zoning_class) LIKE 'I%' THEN 2 WHEN upper(s.zoning_class) LIKE 'O%' THEN 2 ELSE 2 END` |
| `setback_is_bylaw` | `sb` | `(s.bylaw_standard_setback_m IS NOT NULL)` |
| `lot_size_confidence` | `tier` | `CASE WHEN best_area IS NULL THEN NULL WHEN best_area < 50 OR best_area > 2000 THEN 'low' WHEN pair_lg AND pair_lf AND pair_gf THEN 'high' WHEN pair_lg OR pair_lf OR pair_gf THEN 'medium' ELSE 'low' END` |
| `emit` | `box` | `COALESCE(lot_size_confidence IN ('high', 'medium'), false)` |
| `ravine_red` | `box` | `CASE WHEN is_in_ravine_protection_area THEN 10 ELSE 0 END` |
| `width_raw` | `box` | `GREATEST(0, (CASE WHEN is_corner_lot THEN frontage_m - LEAST(side_count, 1) * side_setback - flankage_setback ELSE frontage_m - side_count * side_setback END) - (CASE WHEN is_in_ravine_protection_area THEN 10 ELSE 0 END))` |
| `length_raw` | `box` | `GREATEST(0, (CASE WHEN is_through_lot THEN depth_m - 2 * front_setback ELSE depth_m - front_setback - rear_setback END) - (CASE WHEN is_in_ravine_protection_area THEN 10 ELSE 0 END))` |
| `width_m` | `geo` | `CASE WHEN width_raw >= 3 THEN width_raw END` |
| `length_m` | `geo` | `CASE WHEN length_raw >= 3 THEN length_raw END` |
| `box_area` | `geo` | `CASE WHEN width_raw >= 3 AND length_raw >= 3 THEN round(width_raw * length_raw, 2) END` |
| `buffer_area` | `geo` | `CASE WHEN round(ST_Area(ST_Buffer(geom::geography, -(side_setback * side_count / 2.0 + ravine_red)))::numeric, 2) >= 9 THEN round(ST_Area(ST_Buffer(geom::geography, -(side_setback * side_count / 2.0 + ravine_red)))::numeric, 2) END` |
| `coverage_cap` | `geo` | `round(lot_size_sqm * COALESCE(bylaw_max_coverage_pct, CASE WHEN upper(zoning_class) LIKE 'RD%' THEN 33.00 WHEN upper(zoning_class) LIKE 'RS%' THEN 33.00 WHEN upper(zoning_class) LIKE 'RT%' THEN 33.00 WHEN upper(zoning_class) LIKE 'RM%' THEN 30.00 WHEN upper(zoning_class) LIKE 'CR%' THEN 75.00 WHEN upper(zoning_class) LIKE 'CL%' THEN 75.00 WHEN upper(zoning_class) LIKE 'UT%' THEN 50.00 WHEN upper(zoning_class) LIKE 'R%' THEN 35.00 WHEN upper(zoning_class) LIKE 'C%' THEN 75.00 WHEN upper(zoning_class) LIKE 'E%' THEN 60.00 WHEN upper(zoning_class) LIKE 'I%' THEN 60.00 WHEN upper(zoning_class) LIKE 'O%' THEN 50.00 ELSE 50.00 END) / 100.0, 2)` |
| `coverage_defaulted` | `geo` | `(bylaw_max_coverage_pct IS NULL)` |
| `height_implied` | `geo` | `CASE WHEN bylaw_max_height_m IS NOT NULL AND bylaw_max_height_m > 0 THEN GREATEST(1, round(bylaw_max_height_m / (CASE WHEN upper(zoning_class) LIKE 'C%' OR upper(zoning_class) LIKE 'E%' OR upper(zoning_class) LIKE 'I%' OR upper(zoning_class) LIKE 'UT%' THEN 4.00 ELSE 3.00 END))::int) END` |
| `pocket_p50` | `geo` | `COALESCE(pocket_p50_local, (SELECT storeys_p50 FROM neighbourhood_storey_norms WHERE neighbourhood_id IS NULL))` |
| `ravine_sub_floor` | `env` | `(is_in_ravine_protection_area AND NOT is_heritage_designated AND (width_m IS NULL OR length_m IS NULL))` |
| `footprint_calc` | `env` | `CASE WHEN is_in_ravine_protection_area AND NOT is_heritage_designated AND (width_m IS NULL OR length_m IS NULL) THEN NULL WHEN width_m IS NULL OR length_m IS NULL THEN coverage_cap ELSE LEAST(buffer_area, box_area, coverage_cap) END` |
| `heritage_no_massing` | `env` | `(is_heritage_designated AND (existing_footprint_sqm IS NULL OR existing_footprint_sqm > lot_size_sqm * (1 + 0.05)))` |
| `stories_calc` | `env` | `CASE WHEN bylaw_max_stories IS NOT NULL THEN GREATEST(1, bylaw_max_stories) WHEN pocket_p50 IS NOT NULL AND height_implied IS NOT NULL THEN LEAST(pocket_p50, height_implied) WHEN pocket_p50 IS NOT NULL THEN pocket_p50 ELSE height_implied END` |
| `gfa_box` | `gfa` | `CASE WHEN footprint_calc IS NOT NULL AND stories_calc IS NOT NULL THEN round(footprint_calc * stories_calc, 2) END` |
| `fsi_cap` | `gfa` | `CASE WHEN bylaw_max_fsi IS NOT NULL THEN round(lot_size_sqm * bylaw_max_fsi, 2) END` |
| `rear_yard_depth` | `accessory` | `GREATEST(0, depth_m - front_setback - rear_setback)` |
| `rear_yard_area` | `accessory` | `GREATEST(0, GREATEST(0, depth_m - front_setback - rear_setback) * COALESCE(width_m, 0) - COALESCE(existing_total_footprint_sqm, 0))` |

### 3.3 Constants and tunables *(generated)*

`scripts/lib/max-build.js` zone-default table (longest `zoning_class` prefix wins; `DEFAULT` is the `ELSE`). Front is replaced by `bylaw_standard_setback_m` when present; side / rear / flankage **always** come from this table (MB-4):

| `zoning_class` prefix | front | side | rear | flankage | side_count | `COVERAGE_DEFAULTS` % |
| --- | --- | --- | --- | --- | --- | --- |
| `RD` | 6 | 0.9 | 7.5 | 4.5 | 2 | 33 |
| `RS` | 6 | 0.9 | 7.5 | 4.5 | 1 | 33 |
| `RT` | 6 | 0.9 | 7.5 | 4.5 | 0 | 33 |
| `RM` | 6 | 1.5 | 7.5 | 4.5 | 2 | 30 |
| `R` | 6 | 0.9 | 7.5 | 4.5 | 2 | 35 |
| `CR` | 3 | 0 | 7.5 | 3 | 2 | 75 |
| `CL` | 3 | 0 | 7.5 | 3 | 2 | 75 |
| `C` | 3 | 0 | 7.5 | 3 | 2 | 75 |
| `E` | 6 | 1.5 | 7.5 | 6 | 2 | 60 |
| `I` | 6 | 1.5 | 7.5 | 6 | 2 | 60 |
| `O` | 3 | 1.5 | 3 | 3 | 2 | 50 |
| `UT` | 3 | 1.5 | 3 | 3 | 2 | 50 |
| `DEFAULT` | 6 | 1.2 | 7.5 | 4.5 | 2 | 50 |

Logic variables read by the zoning pass (`runPass1`) and the max-build pass (`runPass2`), with the seeded defaults from `scripts/seeds/logic_variables.json`:

| Logic variable (seed) | Default | Seed description (first sentence) |
| --- | --- | --- |
| `road_overlay_distance_m` | 5 | Distance (metres) for the LineString zoning-overlay spatial join (Policy Road, Priority Retail). |
| `enrich_parcels_bbox_degree_divisor` | 78000 | Pilot 9 commit 7b (2026-09-04, Ask 5 externalization). |
| `storey_height_m` | 3 | Spec 65 §6 (Phase 2) — residential storey height (metres) for the height→storey translation (max_build_stories = round(bylaw_max_height_m / storey_height) when the by-law gives no storey count). |
| `max_build_min_dimension_m` | 3 | Spec 65 §4 MB-3 (WF3 Phase 1 D-C): minimum viable build dimension (m). |
| `mislink_footprint_lot_tol` | 0.05 | Spec 65 §5 (WF3-A) — mislink guard tolerance: existing_footprint > lot_size_sqm × (1 + this) means the WRONG building was linked (block/neighbour attribution); the whole existing structure is NULLed + existing_data_quality_flag='footprint_exceeds_lot'. |
| `max_build_lot_min_sqm` | 50 | Spec 65 §4 MB-2 (WF3 S0.1, Rule 3 / R-G) — lower bound of the sane residential lot band (m²), inclusive: lot_size_sqm >= this. |
| `max_build_lot_max_sqm` | 2000 | Spec 65 §4 MB-2 (WF3 S0.1, Rule 3 / R-G) — upper bound of the sane residential lot band (m²), inclusive: lot_size_sqm <= this. |
| `garden_suite_min_lot_sqm` | 270 | Spec 65 §7 (Phase 3) — externalized garden-suite min lot area (m²); default = the previously-hardcoded value (byte-stable). |
| `garden_suite_min_rear_yard_m` | 5 | Spec 65 §7 (Phase 3) — externalized garden-suite min usable rear-yard depth (m); default = previously-hardcoded. |
| `garden_suite_max_gfa_sqm` | 60 | Spec 65 §7 (Phase 3) — externalized garden-suite GFA cap (m²); default = previously-hardcoded. |
| `garage_min_lot_sqm` | 230 | Spec 65 §7 (Phase 3) — minimum lot area (m²) to consider an accessory garage. |
| `garage_max_gfa_sqm` | 60 | Spec 65 §7 (Phase 3) — by-law cap on a detached garage footprint (m²). |
| `garage_min_footprint_sqm` | 18 | Spec 65 §7 (Phase 3) — minimum usable rear-yard footprint (m²) for a garage to fit (one car). |
| `accessory_max_coverage_pct` | 0.3 | Spec 65 §7 (Phase 3) — max share of usable rear-yard area a garage may cover. |
| `car_footprint_sqm` | 18.5 | Spec 65 §7 (Phase 3) — one parking-stall footprint incl. |
| `laneway_suite_max_gfa_sqm` | 120 | Spec 65 §7 (Phase 3) — by-law cap on a laneway suite GFA (m², ~2-storey). |
| `laneway_suite_min_lot_sqm` | 230 | Spec 65 §7 (Phase 3) — minimum lot area (m²) for a laneway suite. |
| `laneway_suite_min_rear_yard_m` | 5 | Spec 65 §7 (Phase 3) — minimum usable rear-yard depth (m) for a laneway suite. |
| `min_soft_landscaping_pct` | 0.3 | Spec 65 §7 (Phase 3) — share of the lot that must remain soft landscaping; an accessory pushing greenspace below this is buildable only via a CoA minor variance (drives garage_permission / rear_suite_permission). |
| `laneway_suite_storeys` | 2 | Spec 65 §7 (Phase 3) — laneway suite storeys; suite footprint = GFA / storeys for the greenspace test. |
| `garden_suite_storeys` | 1 | Spec 65 §7 (Phase 3) — garden suite storeys; suite footprint = GFA / storeys for the greenspace test. |

### 3.4 Planned new fields NF-1..NF-28 — PLANNED *(generated; cells after the third column are byte-identical to the plan and to Spec 58 §13)*

`Status` and `Source (Spec 58)` are added by the generator: status from the row's own text (`USER INPUT` / open-question phrases, quoted) plus any Spec 67 grounding finding (§4.3, §8); source from the Spec 58 inputs the row's formula names.

| ID | Status | Source (Spec 58) | Field | By-law claim (exact citation) | Type | Formula / source | Constraints | Basis companion |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| NF-1 | planned | `zoning_class` ← `zoning_bylaw_areas.zn_zone` (CKAN `ZN_ZONE`); `bylaw_standard_setback_m` ← `zoning_bylaw_areas.standard_setback` (CKAN `STAND_SET`) | `bylaw_min_front_setback_m` | §10.20.40.70(1)/§10.40.40.70/§10.60.40.70/§10.80.40.70(1) — "the required minimum front yard setback... is 6.0 metres"; §10.5.40.70(1) — averaging when a qualifying neighbour exists | numeric | **PRECEDENCE — RESOLVED WITH REASONING, 2026-09-28 (a distinct, lower confidence tier than this report's verbatim-quoted findings — see caveat).** `COALESCE(STAND_SET, averaging_result, 6.0)` — this ordering is now grounded, not a guess: confirmed via search that Chapter 900 exceptions in this by-law use explicit "despite" language to override general provisions (e.g. *"Despite Regulations 15.5.40.10, the height of a building or structure is..."* — the standard, confirmed drafting pattern for a site-specific exception in 569-2013). `STAND_SET` sits in the base zoning-area schema immediately after `EXCPTN_NO`/`ZN_EXCPTN`, strongly suggesting it is populated precisely when a Chapter 900 exception modifies the front setback. Since §10.5.40.70(1) (averaging) is itself just another general provision with no stated immunity from being overridden, "specific overrides general" supports a real Chapter 900 `STAND_SET` value winning over the averaging calculation. **Caveat, stated honestly:** no direct clause was found saying "averaging does not apply when a Chapter 900 exception governs" — this is resolved by a confirmed general mechanism plus a reasonable schema-position inference, not a verbatim override sentence. Treat as resolved-enough-to-implement but flag for a final human/legal sanity check before shipping. | Averaging applies only when an abutting lot's building fronts the SAME street AND is within 15.0m of the subject lot; all four zones (RD/RS/RT/RM) | `'stand_set'` \| `'bylaw_default_6m'` \| `'averaged_neighbour'` |
| NF-2 | planned | `zoning_class` ← `zoning_bylaw_areas.zn_zone` (CKAN `ZN_ZONE`) | `bylaw_min_rear_setback_m` | RD §10.20.40.70(2), RS §10.40.40.70, RM §10.80.40.70(2) — "the greater of: (A) 7.5 metres; or (B) 25% of the lot depth"; RT §10.60.40.70 — "the required minimum rear yard setback in the RT zone is 7.5 metres" (flat, no depth term) | numeric | `GREATEST(7.5, 0.25 × depth_m)` for RD/RS/RM; `7.5` flat for RT | Zone-specific — RT does NOT use the depth-percentage term (verbatim-confirmed absence) | `'bylaw_formula_floor'` \| `'bylaw_formula_pct_depth'` \| `'bylaw_formula_rt_flat'` |
| NF-3 | research-required (plan text: "Open question"); Spec 67 finding — G1/G9: RD/RS side tiers key on the *required minimum lot frontage* (zone-label "f", G5 → `bylaw_min_frontage_m`), not `frontage_m` | `zoning_class` ← `zoning_bylaw_areas.zn_zone` (CKAN `ZN_ZONE`); Spec 67: `bylaw_min_frontage_m` ← `zoning_bylaw_areas.frontage_min_m` (CKAN `FRONTAGE`) | `bylaw_min_side_setback_m` | RD §10.20.40.70(3)(A)-(G) 7-band table; RS §10.40.40.70(3)(A)-(E); RT §10.60.40.70(3)(A)(B)(i-iv,vi) — clause (v) verbatim-confirmed as "(Deleted by By-law 648-2025)", the (iv)→(vi) jump is correct as written; RM §10.80.40.70(3)(A)(B)(C) for detached/semi/apartment, PLUS §10.80.40.70(4)(C) for townhouse | numeric | RD: 7-band `CASE` on `frontage_m` (0.6→3.0m). RS: 4-band `CASE` flattening at 1.5m for `frontage_m ≥ 15`, else 1.8m if non-residential use. RT: `CASE WHEN building_type IN ('detached','semi_detached','houseplex') OR (building_type='townhouse' AND all_units_front_street) THEN 0.9 ELSE 7.5 END`. RM (CORRECTED — reality-check caught the original formula lumping townhouse into the 2.4m apartment bucket with no citation): `CASE building_type WHEN 'detached' THEN 1.2 WHEN 'semi_detached' THEN 1.5 WHEN 'townhouse' THEN (CASE WHEN all_units_front_street THEN 0.9 ELSE 7.5 END) ELSE 2.4 END`. **Open question surfaced by this correction: §10.80.40.70(4) is headed "...for Residential Buildings on Major Streets" — the 0.9m/7.5m townhouse value may be confirmed ONLY for RM lots abutting a major street; an off-major-street RM townhouse's side setback was not found in any fetch. Do not assume without re-checking.** | RT/RM branches require `building_type` (NF-15) populated — NULL means this formula cannot resolve. **Fallback-philosophy decision required before implementation: match EF-5's "NULL, don't guess" approach (recommended) rather than silently falling back to the old flat constant** — since NF-15 has no auto-population path, this fix will likely be inert for the large majority of RT/RM parcels in practice; state that plainly in any consuming UI. | `'bylaw_formula_tier_<band>'` (RD/RS) \| `'bylaw_formula_by_type_<type>'` (RT/RM) \| `'bylaw_nonresidential_1.8m'` (RS) |
| NF-4 | research-required (plan text: "NOT yet independently verified", "not yet traced"); Spec 67 finding — G2: condition (A) keys on the *required minimum lot frontage*; RS/RT/RM carry no general corner clause (A1) | `zoning_class` ← `zoning_bylaw_areas.zn_zone` (CKAN `ZN_ZONE`); Spec 67: `bylaw_min_frontage_m` ← `zoning_bylaw_areas.frontage_min_m` (CKAN `FRONTAGE`) | `bylaw_min_flankage_setback_m` | **RESOLVED, 2026-09-28: not a separate provision.** §10.20.40.70(6) verbatim: "Despite regulation 10.20.40.70(3) and (4), for a corner lot in the RD zone, the required minimum side yard setback from a side lot line abutting a street is 3.0 metres, if: (A) the required minimum lot frontage... is 12.0 metres or more; and (B) there is an adjacent lot fronting on the street abutting the side lot line." Confirmed for RD; RS/RT/RM presumed to carry an analogous corner-lot clause, NOT yet independently verified. | numeric | `CASE WHEN is_corner_lot AND frontage_m >= 12.0 AND <adjacent-lot-on-flanking-street condition> THEN 3.0 ELSE bylaw_min_side_setback_m (NF-3) END` — "flankage" is not its own formula, it's a corner-lot override of the side-setback formula, falling back to NF-3 when the two conditions don't both hold | Condition (B) ("an adjacent lot fronting the street") needs its own derivation — likely `EXISTS` a neighbouring parcel on that flanking street, not yet traced to an existing column | `'corner_flankage_3m'` \| same basis as NF-3 when the override doesn't apply |
| NF-5 | planned | — (no Spec 58 input) | `bylaw_setback_averaging_applied` | §10.5.40.70(1) — same citation as NF-1's averaging branch | boolean | `TRUE` when NF-1 resolved via the averaging branch, else `FALSE` | Must be consistent with NF-1's basis companion (`'averaged_neighbour'` ⟺ `TRUE`) — a mechanical cross-check | — |
| NF-6 | planned | — (no Spec 58 input) | `existing_front_setback_m` | Not a by-law citation — an engineering prerequisite FOR §10.5.40.70(1) (NF-1): averaging requires reading a neighbour's actual built setback, which nothing currently measures | numeric | `ST_Distance(primary_building_front_wall, front_lot_line)`, same `ST_OrientedEnvelope`/EPSG:2952 projected-metres technique as `existing_width_m`/`existing_length_m` (Spec 65 §5 existing-structure pass) | Requires a linked primary building (same gate as the existing-structure pass); inherits its mislink guard | `'massing_measured'` — inherits the existing-structure pass's ±20-38% imagery error band |
| NF-7 | planned | `zoning_class` ← `zoning_bylaw_areas.zn_zone` (CKAN `ZN_ZONE`); `bylaw_max_height_m` ← `zoning_height_overlay.height_max_m` (CKAN `HT_LABEL`) | `bylaw_max_height_basis` | §10.20.40.10(1)/§10.40.40.10(1)/§10.60.40.10(1) — "...10.0 metres"; §10.80.40.10(1)(B) — "(i) 10.0 metres, for a detached house or semi-detached house; and (ii) 12.0 metres, for any other building" | text | Records which branch of the EF-5 height fix fired | RD/RS/RT can only be `'overlay'` or `'bylaw_default_10m'`; RM can additionally be `'bylaw_default_12m'` — a `'bylaw_default_12m'` value on a non-RM zone is a contradiction, should never occur | ∈ `{'overlay','bylaw_default_10m','bylaw_default_12m'}` |
| NF-8 | planned | `bylaw_max_coverage_pct` ← lot-coverage overlay / base `coverage_max_pct` | `bylaw_max_coverage_basis` | §10.20.30.40(1)(B)/§10.40.30.40/§10.60.30.40/§10.80.30.40 — "if a lot is not in an area with a numerical value on the Lot Coverage Overlay Map, no lot coverage applies" | text | `CASE WHEN bylaw_max_coverage_pct IS NOT NULL THEN 'overlay_mapped' ELSE 'unregulated' END` | Purely derived from an already-existing column — no new join required | ∈ `{'overlay_mapped','unregulated'}` |
| NF-9 | planned | `bylaw_max_fsi` ← `zoning_bylaw_areas.fsi_max` (CKAN `FSI_TOTAL`) | `bylaw_max_fsi_basis` | §10.20.40.40(1)(B)/§10.40.40.40(1)/§10.60.40.40(1)/§10.80.40.40(1) — "the floor space index is not limited by this regulation" | text | `CASE WHEN bylaw_max_fsi IS NOT NULL THEN 'zone_label_mapped' ELSE 'unregulated' END` | Same as NF-8 | ∈ `{'zone_label_mapped','unregulated'}` |
| NF-10 | research-required (plan text: "blocked on a prerequisite"); Spec 67 finding — G3/G20: RD cap applies only with required min. frontage ≤ 18.0 m; building length is the front-to-rear distance (§800.50(105)), not width | `zoning_class` ← `zoning_bylaw_areas.zn_zone` (CKAN `ZN_ZONE`); `on_policy_road` ← `zoning_policy_road_overlay` (LineString, `road_overlay_distance_m`) | `bylaw_max_building_length_m` | RD §10.20.40.20(1) "17.0 metres"; RS §10.40.40.20 (same); RM §10.80.40.20 (same + major-street exceptions); RT §10.60.40.20(1) — "If a lot abuts a major street, the permitted maximum building length is: (A) 19.0... (B) 25.0..." (no base-case clause exists, confirmed via full section-number enumeration) | numeric | RD/RS/RM: `17.0` baseline, `19.0` (townhouse)/`25.0` (apartment) if `on_major_street`. RT: `NULL` unless `on_major_street`, then `19.0`/`25.0` — RT has no base-case value, confirmed absence | **`on_major_street` — RESOLVED to a specific existing signal, blocked on a prerequisite fix (2026-09-28, orchestrator-grounded).** By-law §800.50(457) verbatim: "'Major Street' = any street identified as 'Major Streets' on the Policy Areas Overlay Map found in Section 995.10." That exact map is already ingested as `zoning_policy_road_overlay` (Spec 58, 8,913 lines) and already surfaced as `parcels.on_policy_road` (`enrich-parcels.js#buildEnrichmentSql`, `ST_DWithin` against `road_overlay_distance_m`). **But the flag is currently dead**: only 8 of 331,684 RD/RS/RT/RM parcels read `true`, because `road_overlay_distance_m=5` while road centrelines sit ~10m+ from lot lines (the laneway-detection code elsewhere uses 20m for the same kind of proximity test). See `wf3_policy_road_overlay_distance_fix_active_task.md` — a prerequisite WF3, not this WF2 — for the fix. `on_major_street` = `parcels.on_policy_road` once that lands. | `'bylaw_default_17m'` \| `'major_street_19m'` \| `'major_street_25m'` \| `'rt_no_base_cap'` |
| NF-11 | planned; Spec 67 finding — G4: RD cap applies only with required min. frontage ≤ 18.0 m; RD/RS text reads "required front yard setback" (RM: "required minimum") | `zoning_class` ← `zoning_bylaw_areas.zn_zone` (CKAN `ZN_ZONE`) | `bylaw_max_building_depth_m` | RD §10.20.40.30(1); RS §10.40.40.30; RM §10.80.40.30 — all three: "rear main wall... no more than 19.0 metres from the required minimum front yard setback"; RT: no section found in the full 10.60.40.10–.80 enumeration — confirmed absence | numeric | RD/RS/RM: `19.0`, measured from the front-setback line. RT: `NULL` always — confirmed absence, no major-street exception exists for depth | `on_major_street` dependency does not apply here (no major-street exception found for depth) | `'bylaw_default_19m'` \| `'rt_no_cap'` |
| NF-12 | planned | — (no Spec 58 input) | `bylaw_min_front_landscaping_pct` | §10.5.50.10(1) — "a minimum of 50 percent of the front yard must be landscaping" (6–15m frontage), "...60 percent..." (≥15m); under-6.0m figure not captured in any fetch | numeric | `CASE WHEN frontage_m < 6.0 THEN <UNVERIFIED> WHEN frontage_m < 15.0 THEN 50 ELSE 60 END` | **The under-6.0m-frontage figure was never captured — verify before implementing. The 15.0m tier boundary's inclusive/exclusive direction was also never explicitly stated — do not assume the setback tiers' convention applies.** | `'tier_50pct'` \| `'tier_60pct'` \| `'tier_under6m_UNVERIFIED'` |
| NF-13 | planned | — (no Spec 58 input) | `bylaw_min_rear_soft_landscaping_pct` | §10.5.50.10(3) — "a minimum of 50% of the rear yard for soft landscaping, if the lot frontage is greater than 6.0 metres... a minimum of 25%... if... 6.0 metres or less" | numeric | `CASE WHEN frontage_m > 6.0 THEN 50 ELSE 25 END` | Single-step, direct percentage of rear yard — no 75%-multiplier layer (unlike NF-12/NF-14) | `'tier_50pct'` \| `'tier_25pct'` |
| NF-14 | planned | — (no Spec 58 input) | `bylaw_min_corner_side_landscaping_pct` | §10.5.50.10(2) — "a minimum of 60 percent of the side yard abutting a street for landscaping" | numeric | `60` flat, corner lots only | `NULL` when `is_corner_lot = false` (existing column) | `'corner_60pct'` \| `NULL` |
| — | planned | — (no Spec 58 input) | *(formula constant, not a column)* | §10.5.50.10(1)/(2) — "a minimum of 75 percent of the front/side yard landscaping... must be soft landscaping" | — | The 75%-soft-of-landscaped-area multiplier applies uniformly to NF-12 and NF-14 (front/corner only, NOT NF-13/rear) — keep as a read-time constant, not persisted pre-multiplied, so a future by-law amendment is a one-constant change | — | — |
| NF-15 | user-input (plan text: manual/future viewer input only) | `zoning_class` ← `zoning_bylaw_areas.zn_zone` (CKAN `ZN_ZONE`) | `building_type` | Not a by-law citation — a modeling prerequisite: NF-3/NF-7's building-type branches need a value this report found no automated source for | text | NULL by default; manual/future viewer input only — **NOT auto-derived from `permits.building_type`** (permits are a subset of parcels and can be stale — corrected from an earlier flawed proposal) | Required (non-NULL) for NF-3/NF-7 to resolve their RT/RM branches; **owned by a separate WF1 (viewer-input UI, Admin/Cross-Domain), not this WF2** — this WF2 only needs the column to exist and be read defensively (NULL-safe) | — (always manual when populated) |
| NF-16 | user-input (plan text: manual/future viewer input only) | — (no Spec 58 input) | `current_stories` | Not a by-law citation — a data-quality fix for the retired `existing_stories` column, unrelated to any zoning formula in this WF2 | integer | NULL by default; manual/future viewer input only | **Owned by the same separate WF1 as NF-15** — out of this WF2's scope, listed here only because it shares the viewer-input mechanism | — |
| NF-17 | planned; Spec 67 finding — G20: box as written caps the width with NF-10; by definition NF-10 caps the front-to-rear length | — (no Spec 58 input) | `max_footprint_setback_sqm` | Setback envelope only: NF-1 front, NF-2 rear, NF-3/NF-4 side/flankage, NF-10 length cap, NF-11 depth cap (citations as those rows) | numeric | `LEAST(buffer_area, box_area)`, box = `MIN(frontage_m − side_count × NF-3, NF-10) × MIN(depth_m − NF-1 − NF-2, NF-11)`, buffer = lot polygon inset by the same setbacks. **No coverage term.** | NULL when the box cannot be computed (width/length NULL); never back-filled from coverage. The setback answer the report user sees beside NF-18 | `'setback_box'` | `'setback_buffer'` | `'length_cap'` | `'depth_cap'` | NULL |
| NF-18 | planned | `bylaw_max_coverage_pct` ← lot-coverage overlay / base `coverage_max_pct` | `max_footprint_coverage_sqm` | §10.20.30.40(1)/§10.40.30.40/§10.60.30.40/§10.80.30.40 — Lot Coverage Overlay Map percentage; "if a lot is not in an area with a numerical value on the Lot Coverage Overlay Map, no lot coverage applies" | numeric | `lot_size_sqm × bylaw_max_coverage_pct / 100` when NF-8 = `'overlay_mapped'` | NULL when NF-8 = `'unregulated'`: **no zone-median default** (the by-law applies no coverage limit there). The coverage answer the report user sees beside NF-17 | same as NF-8 |
| NF-19 | research-required (plan text: "pending research item") | — (no Spec 58 input) | `max_footprint_binding` | Not a by-law citation — tells the report user which limit decides | text | `'setback'` when NF-17 < NF-18 or NF-18 is NULL; `'coverage'` when NF-18 < NF-17; `'tie'` when equal; `'coverage_only_unchecked'` when NF-17 is NULL and NF-18 is not | Cross-check against EF-2 pending research item R1 below (whether EF-2 keeps the zone-median coverage default) | ∈ `{'setback','coverage','tie','coverage_only_unchecked'}` |
| NF-20 | research-required (plan text: "MORE RESEARCH REQUIRED") | — (no Spec 58 input) | `bylaw_min_front_soft_landscaping_pct` | §10.5.50.10(1)(D) — "(D) a minimum of 75 percent of the front yard landscaping required in (A), (B), and (C) above, must be soft landscaping, and if a lot does not have a permitted driveway in the front yard, a minimum of 75 percent of the front yard must be soft landscaping. [ By-law: 648-2025 ]" [L8]; §800.50(395) — "(395) Landscaping means an area used for trees, plants, decorative stonework, retaining walls, walkways, or other landscape or architectural elements. Driveways and areas for loading, parking or storing of vehicles are not landscaping." [L1]; §10.20.80.1(1)(D) (same text §10.40.80.1(1)(D), §10.60.80.1(1)(D), §10.80.80.1(1)(D)) — "(D) the area of the removed driveway in the front yard must be landscaping, but may continue to be considered a permitted driveway for the purposes of calculating required soft landscaping under regulation 10.5.50.10(1)(D);" [L18] | numeric (% of front yard area) | `CASE WHEN existing_driveway_type = 'none' THEN 75` (L8 no-driveway branch: 75% of the whole front yard) `WHEN existing_driveway_type = 'private' AND tier IN ('tier_50pct','tier_60pct') THEN 0.75 × bylaw_min_front_landscaping_pct` (NF-12 × 75% → 37.5 or 45) `WHEN existing_driveway_type = 'private' AND tier = 'under6m_all_but_driveway' THEN 0.75 × (front_yard_area − driveway_area − parking_pad_area) / front_yard_area × 100` (needs NF-27/NF-28 and a front-yard area; else NULL) `ELSE NULL END`; tier = NF-22; driveway state = NF-26 | 0–75. NULL when NF-26 is NULL / 'unknown' / 'shared' ('shared' = MORE RESEARCH REQUIRED), when NF-22 is NULL (building type outside L4 scope), or when the under-6 m branch lacks NF-27. A driveway removed under the zone-chapter §.80.1(1) conversion still counts as a permitted driveway for this row (L18). Depends on NF-26. | `bylaw_front_soft_landscaping_basis` ∈ `'with_driveway_75pct_of_required'` \| `'no_driveway_75pct_of_front_yard'` \| `NULL` |
| NF-21 | planned | — (no Spec 58 input) | `bylaw_max_front_hard_landscaping_pct` | NOT STATED IN THE BY-LAW — DERIVED by subtraction. The by-law defines landscaping and soft landscaping and sets only soft-landscaping minimums; it sets no hard-landscaping maximum. §800.50(395) — "(395) Landscaping means an area used for trees, plants, decorative stonework, retaining walls, walkways, or other landscape or architectural elements. Driveways and areas for loading, parking or storing of vehicles are not landscaping." [L1]; §800.50(780) — "(780) Soft Landscaping means landscaping excluding hard-surfaced areas such as decorative stonework, retaining walls, walkways, or other hard-surfaced landscape-architectural elements." [L2]; §10.5.50.10(1)(D) — "(D) a minimum of 75 percent of the front yard landscaping required in (A), (B), and (C) above, must be soft landscaping, and if a lot does not have a permitted driveway in the front yard, a minimum of 75 percent of the front yard must be soft landscaping. [ By-law: 648-2025 ]" [L8]; Chapter 800 (absence) — The phrase "hard landscaping" does not occur in Chapter 800 (Definitions), nor in any other fetched chapter. (generator count: hard landscaping@ch800=0, hard landscaping@ch10_5=0, hard landscaping@ch10_20=0, hard landscaping@ch10_40=0, hard landscaping@ch10_60=0, hard landscaping@ch10_80=0, hard landscaping@ch150_7=0, hard landscaping@ch150_8=0, hard landscaping@ch200=0) [L3] | numeric (% of front yard area) | `100 − NF-20` = the share of the front yard not required to be soft. When NF-27 is known the hard-landscaping ceiling is `100 − NF-20 − driveway_pct`, because a driveway is neither soft nor hard landscaping (L1) | NULL when NF-20 is NULL. ≥ 0. Hard landscaping still counts toward the NF-12 landscaping minimum (L1 includes stonework, retaining walls and walkways). Must be labelled "derived" in the report, never "by-law maximum". | inherits NF-20 basis, suffixed `'_derived_subtraction'` |
| NF-22 | planned | — (no Spec 58 input) | `bylaw_front_landscaping_basis` | §10.5.50.10(1) — "(1) Front Yard Landscaping for Certain Types of Residential Buildings In the Residential Zone category, on a lot with a detached house, semi-detached house, detached houseplex, semi-detached houseplex or townhouse, the following front yard landscaping regulations apply:" [L4]; §10.5.50.10(1)(A) — "(A) for lots with a lot frontage less than 6.0 metres, or a townhouse dwelling unit less than 6.0 metres wide, the front yard, excluding a permitted driveway or permitted parking pad must be landscaping; [By-law: 1429-2017]" [L5]; §10.5.50.10(1)(B) — "(B) for lots with a lot frontage of 6.0 metres to less than 15.0 metres, or a townhouse dwelling unit at least 6.0 metres wide, a minimum of 50 percent of the front yard must be landscaping;" [L6]; §10.5.50.10(1)(C) — "(C) for lots with a lot frontage of 15.0 metres or greater, a minimum of 60 percent of the front yard must be landscaping; and" [L7] | text | `CASE WHEN building_type NOT IN (detached, semi-detached, detached houseplex, semi-detached houseplex, townhouse) THEN NULL WHEN w < 6.0 THEN 'under6m_all_but_driveway' WHEN w < 15.0 THEN 'tier_50pct' ELSE 'tier_60pct' END`, where `w` = the townhouse dwelling-unit width for a townhouse, else `frontage_m`. A townhouse unit at least 6.0 m wide is `'tier_50pct'` (L7 names no townhouse substitution) | `'under6m_all_but_driveway'` = the whole front yard minus a permitted driveway / permitted parking pad must be landscaping (L5), not a percentage. 6.0 exactly → `'tier_50pct'`; 15.0 exactly → `'tier_60pct'` (L7 "15.0 metres or greater"). NULL when frontage is NULL or NF-15 is NULL / out of scope (apartment buildings use L11 instead). | is itself the basis companion for NF-12 and NF-20 |
| NF-23 | research-required (plan text: "MORE RESEARCH REQUIRED") | — (no Spec 58 input) | `bylaw_max_front_driveway_width_m` | §10.5.100.1(1)(A)-(D) — "(1) Driveway Width in the Front Yard for Certain Residential Building Types In the Residential Zone category, in addition to meeting the landscaping requirements in regulation 10.5.50.10, for a detached house, semi-detached house, or duplex, and for an individual townhouse dwelling unit if an individual private driveway leads directly to the dwelling unit, a driveway that is in the front yard or passes through the front yard may have the following dimensions in the front yard: (A) a minimum width of 2.0 metres; (B) for lots with a lot frontage less than 6.0 metres, or a townhouse dwelling unit less than 6.0 metres wide, a maximum width of 2.6 metres; (C) for lots with a lot frontage of 6.0 metres to 23.0 metres inclusive, or a townhouse dwelling unit at least 6.0 metres wide, a maximum driveway width the lesser of: (i) 6.0 metres; (ii) the cumulative width of side-by-side parking spaces behind the front main wall, but not in the rear yard; or (iii) the width of a single parking spaces behind the front main wall, but not in the rear yard; or (iv) 2.6 metres if all parking spaces are in the rear yard; and (D) for lots with a lot frontage greater than 23.0 metres, a maximum driveway width the lesser of: (i) 9.0 metres; (ii) the cumulative width of side-by-side parking spaces behind the front main wall if there is at least one parking space behind the front main wall but not in the rear yard; or (iii) 2.6 metres if all parking spaces are in the rear yard." [L15]; §200.5.1.10(2)(A) — "(2) Parking Space Dimensions - Minimum A parking space is subject to the following: (A) A parking space must have the following minimum dimensions: (i) length of 5.6 metres; (ii) width of 2.6 metres; (iii) vertical clearance of 2.0 metres; and (iv) the minimum width in (ii) must be increased by 0.3 metres for each side of the parking space that is obstructed according to (D) below;" [L25]; §200.5.1.10(3) — "(3) Parking Space Dimensions - Maximum The maximum dimensions for a parking space are: (A) length of 6.0 metres (B) width of 3.2 metres" [L26] | numeric (m) | `CASE WHEN w < 6.0 THEN 2.6 WHEN w <= 23.0 THEN LEAST(6.0, parking_width) WHEN w > 23.0 THEN LEAST(9.0, parking_width) END` (w as NF-22). `parking_width` = cumulative width of side-by-side parking spaces behind the front main wall (not in the rear yard); for a single space its width, which Chapter 200 bounds at 2.6 m minimum (+0.3 m per obstructed side) and 3.2 m maximum (L25/L26); 2.6 when all parking is in the rear yard. Parking layout is not a column → emit the 6.0 / 9.0 cap with basis `'cap_only_parking_layout_unknown'` | Minimum 2.0 m (L15(A)). Scope: detached house, semi-detached house, duplex, or a townhouse unit with its own private driveway (L15 lead-in); NULL otherwise. NF-26 decides use: `'private'` → compared against NF-27; `'none'` → shown as "if a driveway is added"; `'shared'` → comparison withheld, MORE RESEARCH REQUIRED. | `'under6m_2_6'` \| `'mid_lesser_of_6_0'` \| `'wide_lesser_of_9_0'` \| `'cap_only_parking_layout_unknown'` \| `NULL` |
| NF-24 | planned | — (no Spec 58 input) | `bylaw_min_soft_garden_suite_pct` | §150.7.50.10(1)(A)(B) — "(1) Landscaping Requirements for a Garden Suite Despite regulation 10.5.50.10(3), for a lot with a residential building and an ancillary building containing a garden suite: (A) with a lot frontage of greater than 6.0 metres, a minimum of 50 percent of the area: (i) between all rear main walls of the residential building on the lot and the rear lot line, and (ii) extending parallel to the rear lot line across the full width of the lot from the point where the rear main wall of the residential building meets the residential building's side main walls closest to the respective side lot lines, must be for soft landscaping; (B) with a lot frontage of 6.0 metres or less, a minimum of 25 percent of the area: (i) between all rear main walls of the residential building on the lot and the rear lot line, and (ii) extending parallel to the rear lot line across the full width of the lot from the point where the rear main wall of the residential building meets the residential building's side main walls closest to the respective side lot lines, must be for soft landscaping. [ By-law: 101-2022 ]" [L20] | numeric (% of the area behind the rear main walls) | `CASE WHEN frontage_m > 6.0 THEN 50 ELSE 25 END`, measured over the area between all rear main walls and the rear lot line, extended across the full lot width from where the rear main wall meets the side main walls | Only when the lot has a garden suite (no source column → NULL unless known). Replaces NF-13 ("Despite regulation 10.5.50.10(3)"). 6.0 exactly → 25. | `'garden_suite_50pct'` \| `'garden_suite_25pct'` \| `NULL` |
| NF-25 | planned | — (no Spec 58 input) | `bylaw_min_soft_laneway_suite_pct` | §150.8.50.10(1)(A)(B)(C) — "(1) Landscaping Requirements for a Laneway Suite Despite regulation 10.5.50.10 (3), for a lot with a residential building and an ancillary building containing a laneway suite: (A) with a lot frontage of 6.0 metres or less, a minimum of 60 percent of the area between all rear main walls of the residential building and the front main wall of the ancillary building containing a laneway suite must be for soft landscaping; (B) with a lot frontage of greater than 6.0 metres, a minimum of 85 percent of the area between all rear main walls of the residential building and the front main wall of the ancillary building containing a laneway suite must be for soft landscaping, excluding a pedestrian walkway which may have a maximum width of 1.5 metres; and (C) the area between the ancillary building containing a laneway suite and the lot line abutting a lane, excluding a permitted driveway, and a pedestrian walkway which may have a maximum width of 1.5 metres, must be landscaping, of which a minimum of 75 percent must be soft landscaping. [ By-law: 1107-2021 ]" [L21] | numeric (% of the area between the rear main walls and the suite front wall) | `CASE WHEN frontage_m > 6.0 THEN 85 ELSE 60 END`; the 85% case excludes a pedestrian walkway up to 1.5 m wide. Plus (C): the area between the suite and the lane lot line, excluding a permitted driveway and a walkway up to 1.5 m, must be landscaping, at least 75% of it soft | Only when the lot has a laneway suite (no source column → NULL unless known). Replaces NF-13 ("Despite regulation 10.5.50.10 (3)"). 6.0 exactly → 60. The (C) lane-side 75% rule is reported alongside, not folded into this number. | `'laneway_suite_85pct'` \| `'laneway_suite_60pct'` \| `NULL` |
| NF-26 | user-input (plan text: USER INPUT) | — (no Spec 58 input) | `existing_driveway_type` | NOT A BY-LAW CITATION — USER INPUT (entered by the viewer). It supplies the fact L8 branches on: §10.5.50.10(1)(D) — "(D) a minimum of 75 percent of the front yard landscaping required in (A), (B), and (C) above, must be soft landscaping, and if a lot does not have a permitted driveway in the front yard, a minimum of 75 percent of the front yard must be soft landscaping. [ By-law: 648-2025 ]" [L8]; All fetched chapters (absence) — The phrases "shared driveway" and "mutual driveway" do not occur in any fetched chapter (800, 10.5, 10.20, 10.40, 10.60, 10.80, 150.7, 150.8, 200). (generator count: shared driveway@ch800=0, shared driveway@ch10_5=0, shared driveway@ch10_20=0, shared driveway@ch10_40=0, shared driveway@ch10_60=0, shared driveway@ch10_80=0, shared driveway@ch150_7=0, shared driveway@ch150_8=0, shared driveway@ch200=0, mutual driveway@ch800=0, mutual driveway@ch10_5=0, mutual driveway@ch10_20=0, mutual driveway@ch10_40=0, mutual driveway@ch10_60=0, mutual driveway@ch10_80=0, mutual driveway@ch150_7=0, mutual driveway@ch150_8=0, mutual driveway@ch200=0) [L27] | text | USER INPUT, `NULL` default, same mechanism as NF-15/NF-16, never auto-derived. Values ∈ `'none'` \| `'private'` \| `'shared'` \| `'unknown'` | Drives NF-20's branch (L8 "does not have a permitted driveway") and NF-23's use. "Shared driveway" is not a by-law-defined term: the generator counted 0 occurrences of "shared driveway"/"mutual driveway" across 9 fetched chapters. How a shared driveway is treated under L8/L15 is MORE RESEARCH REQUIRED; until then 'shared' yields NULL in NF-20/NF-21. | `'user_input'` \| `NULL` |
| NF-27 | user-input (plan text: USER INPUT) | — (no Spec 58 input) | `existing_driveway_width_m` | NOT A BY-LAW CITATION — USER INPUT. Needed because a driveway is neither soft nor hard landscaping: §800.50(395) — "(395) Landscaping means an area used for trees, plants, decorative stonework, retaining walls, walkways, or other landscape or architectural elements. Driveways and areas for loading, parking or storing of vehicles are not landscaping." [L1]; bounds from §10.5.100.1(1)(A)-(D) [L15] | numeric (m) | USER INPUT, `NULL` default, never auto-derived. Actual front-yard landscaping area = front_yard_area − NF-27 × front-yard depth (− parking pad area, NF-28) | NULL default. Values below 2.0 m or above NF-23 are flagged as non-conforming, not rejected. Only meaningful when NF-26 = 'private'. | `'user_input'` \| `NULL` |
| NF-28 | user-input (plan text: USER INPUT) | — (no Spec 58 input) | `existing_front_parking_pad` | NOT A BY-LAW CITATION — USER INPUT. §10.5.50.10(1)(A) — "(A) for lots with a lot frontage less than 6.0 metres, or a townhouse dwelling unit less than 6.0 metres wide, the front yard, excluding a permitted driveway or permitted parking pad must be landscaping; [By-law: 1429-2017]" [L5]; §10.5.80.10(3) — "(3) Street Yard Parking Space In the Residential Zone category, a parking space may not be in a front yard or a side yard abutting a street. This regulation does not apply if a parking space in the front yard is permitted by the City of Toronto under the authority of the City of Toronto Act, 2006, or its predecessor." [L16]; Chapter 800 (absence) — "parking pad" does not occur in Chapter 800 (Definitions) or Chapter 200; in Chapter 10.5 it occurs once, inside L5. (generator count: parking pad@ch800=0, parking pad@ch200=0, parking pad@ch10_5=1) [L28] | boolean | USER INPUT, `NULL` default, never auto-derived. When true, the pad area is excluded from the under-6 m landscaping requirement (L5) | L5 excludes a "permitted parking pad", while L16 bars a parking space in a front yard unless the City permits it under the City of Toronto Act, 2006; "parking pad" is not defined in Chapter 800 (L28). How the two interact is MORE RESEARCH REQUIRED. | `'user_input'` \| `NULL` |
| NF-29 | user-input (plan text: USER INPUT) | `zoning_class` ← `zoning_bylaw_areas.zn_zone` (CKAN `ZN_ZONE`); `bylaw_max_coverage_pct` ← lot-coverage overlay / base `coverage_max_pct`; `bylaw_max_fsi` ← `zoning_bylaw_areas.fsi_max` (CKAN `FSI_TOTAL`) | `has_secondary_suite` | NOT A BY-LAW CITATION — USER INPUT. It supplies the fact the coverage and FSI clauses key on: §800.50(735) — "(735) Secondary Suite means self-contained living accommodation for an additional person or persons living together as a separate single housekeeping unit, in which both food preparation and sanitary facilities are provided for the exclusive use of the occupants of the suite, located in and subordinate to a dwelling unit." [H3]; §800.50(181) — "(181) Detached Houseplex means a building that has multiple dwelling units, and where: (A) the building has no more than four dwelling units; (B) the building is situated entirely on one lot; (C) the building is not attached to a building on an abutting lot; and (D) at least one dwelling unit is entirely or partially above another. (E) Detached houseplex includes the following types of building: a duplex, triplex or fourplex that complies with (A) to (D) above. (F) A detached house, semi-detached house or townhouse that has one or more secondary suites is not a detached houseplex. [ By-law: 648-2025 ]" [H1]; §800.50(746) — "(746) Semi-detached Houseplex means a portion of a building that has multiple dwelling units, and where: (A) the portion of the building has no more than four dwelling units; (B) the entire building is situated on two abutting lots; (C) the portion of the building is separated by party walls from any attached portions of the building on the abutting lot; and (D) at least one dwelling unit is entirely or partially above another. (E) Semi-detached houseplex includes the following types of building: a duplex, triplex or fourplex that complies with (A) to (D) above. (F) A detached house, semi-detached house or townhouse that has one or more secondary suites is not a semi-detached houseplex. [ By-law: 648-2025 ]" [H2]; §10.20.30.40(1)(D) — "(D) Despite (A) above, if the numerical value on the Lot Coverage Overlay Map is less than 45 percent and the lot contains a detached houseplex or a residential building with a secondary suite, the maximum lot coverage for all buildings and structures on the lot is 45 percent;" [H7]; §10.20.40.40(1)(C) — "(C) the permitted maximum floor space index in regulation (A) and (B) above does not apply to a detached houseplex, or a residential building with a secondary suite; and [ By-law: 848-2025 ]" [H8]; RS/RT/RM carry the same two rules: §10.40.30.40(1)(D) — "(D) Despite (A) above, if the numerical value on the Lot Coverage Overlay Map is less than 45 percent and the lot contains a detached houseplex, semi-detached houseplex or a residential building with a secondary suite, the maximum lot coverage for all buildings and structures on the lot is 45 percent;" [H9]; §10.40.40.40(1)(C) — "(C) the permitted maximum floor space index in regulation (A) and (B) above does not apply to a detached houseplex, semi-detached houseplex or a residential building with a secondary suite; and [ By-law: 848-2025 ]" [H10]; §10.60.30.40(1)(D) — "(D) Despite (A) above, if the numerical value on the Lot Coverage Overlay Map is less than 45 percent and the lot contains detached houseplex, semi-detached houseplex or a residential building with a secondary suite, the maximum lot coverage for all buildings and structures on the lot is 45 percent;" [H11]; §10.60.40.40(1)(C) — "(C) the permitted maximum floor space index in regulation (A) and (B) above does not apply to a detached houseplex, semi-detached houseplex or a residential building with a secondary suite; and [ By-law: 848-2025 ]" [H12]; §10.80.30.40(1)(D) — "(D) Despite (A) above, if the numerical value on the Lot Coverage Overlay Map is less than 45 percent and the lot contains a detached houseplex, semi-detached houseplex or a residential building with a secondary suite, the maximum lot coverage for all buildings and structures on the lot is 45 percent; [ By-law: 1062-2025(OLT); 608-2024; 848-2025 ]" [H13]; §10.80.40.40(1)(C) — "(C) the permitted maximum floor space index in regulation (A) and (B) above does not apply to a detached houseplex, semi-detached houseplex or a residential building with a secondary suite; and [ By-law: 848-2025 ]" [H14] (texts generator-extracted, Spec 67 Appendix E) | boolean | USER INPUT, `NULL` default, same mechanism as NF-15/NF-16/NF-26..NF-28, never auto-derived. TRUE when the main residential building contains a secondary suite (H3: inside and subordinate to a dwelling unit — a garden suite or laneway suite in an ancillary building is not a secondary suite). The houseplex/suite rule set applies when `building_type = 'houseplex'` (NF-15 already carries that value) OR `has_secondary_suite = TRUE` | **Rationale:** the MaxBuild answer changes with this fact. (1) Coverage: where the Lot Coverage Overlay value is under 45 %, the limit becomes 45 % "for all buildings and structures on the lot" (H7/H9/H11/H13); where the lot is unmapped, clause (D) keys on a numerical value that does not exist, so no coverage applies either way (G7(B)). (2) FSI: the zone-label `d` FSI does not apply (H8/H10/H12/H14). (3) So a different limit can bind — 41 Derwyn Rd (RD, overlay 35 %): detached 114.49 m² (coverage binds); with a suite 147.20 m² under the plan formulas, or 135.15 m² with the length cap on the front-to-rear axis (the setback envelope then binds); GFA 294.40 / 270.30 m² with no FSI cap versus 147.20 m² for a detached house once the label FSI is read (Spec 67 worked examples). A house with a secondary suite is not a houseplex (H1(F)/H2(F)), so this is a separate flag, not a `building_type` value; TRUE together with `building_type = 'houseplex'` is a contradiction to flag. NULL: nothing is assumed; both answers are still shown (NF-30..NF-32 beside EF-2/EF-8). | `'user_input'` \| `NULL` |
| NF-30 | planned | `zoning_class` ← `zoning_bylaw_areas.zn_zone` (CKAN `ZN_ZONE`); `bylaw_max_coverage_pct` ← lot-coverage overlay / base `coverage_max_pct` | `max_buildable_footprint_suite_sqm` | Houseplex / secondary-suite coverage rules: §10.20.30.40(1)(D) — "(D) Despite (A) above, if the numerical value on the Lot Coverage Overlay Map is less than 45 percent and the lot contains a detached houseplex or a residential building with a secondary suite, the maximum lot coverage for all buildings and structures on the lot is 45 percent;" [H7] (RS/RT/RM: H9/H11/H13, quoted in NF-29); §800.50(435) — "(435) Lot Coverage means the portion of the lot that is covered by any part of any building or structure on or above the surface of the lot." [H4] | numeric | `LEAST(buffer_area, NF-17 box, suite_coverage_cap)`, suite_coverage_cap = `lot_size_sqm × (CASE WHEN bylaw_max_coverage_pct IS NULL THEN NULL WHEN bylaw_max_coverage_pct < 45 THEN 45 ELSE bylaw_max_coverage_pct END) / 100` (LEAST skips NULL, so an unmapped lot = NF-17). Always computed, whatever NF-15/NF-29 hold, so the report shows the detached answer and the houseplex/suite answer side by side | The base field `max_buildable_footprint_sqm` (EF-2) keeps its current meaning (detached-house rules). The 45 % covers all buildings and structures (H7) and lot coverage counts any building or structure (H4), so ancillary buildings draw on the same allowance. Houseplex-only length/depth relief on deep lots (H17/H18: 19.0 m) is not applied — research. NULL rules as NF-17 (R2). | NF-32 |
| NF-31 | planned | `zoning_class` ← `zoning_bylaw_areas.zn_zone` (CKAN `ZN_ZONE`); `bylaw_max_fsi` ← `zoning_bylaw_areas.fsi_max` (CKAN `FSI_TOTAL`) | `max_buildable_gfa_suite_sqm` | §10.20.40.40(1)(C) — "(C) the permitted maximum floor space index in regulation (A) and (B) above does not apply to a detached houseplex, or a residential building with a secondary suite; and [ By-law: 848-2025 ]" [H8] (RS/RT/RM: H10/H12/H14, quoted in NF-29); detached houseplex height, not applied here: §10.20.40.10(1)(C) — "(C) despite (A) above, the permitted maximum height for a detached houseplex is the greater of ... (ii) 10.0 metres" [H15, excerpt] | numeric | `NF-30 × max_build_stories` (EF-6 storeys); no FSI term (H8/H10/H12/H14) | The base field `max_buildable_gfa_sqm` (EF-8) keeps its current meaning (FSI cap applies). The detached-houseplex height (H15: the greater of the HT value or 10.0 m) and storey rule (H16) do not apply to a secondary suite and are not applied here — research. NULL when NF-30 or EF-6 is NULL. | `'suite_no_fsi'` \| `NULL` |
| NF-32 | planned | — (no Spec 58 input) | `max_buildable_suite_binding` | Not a by-law citation — names the limit that decides NF-30, as NF-19 does for the base footprint | text | `'setback'` when NF-17 < suite_coverage_cap or the cap is NULL; `'coverage'` when the cap < NF-17; `'tie'` when equal; `'coverage_only_unchecked'` when NF-17 is NULL and the cap is not | Compare with NF-19: a flip from `'coverage'` to `'setback'` tells the report user that adding a suite moves the binding limit to the setbacks and length/depth caps. | ∈ `{'setback','coverage','tie','coverage_only_unchecked'}` |

### 3.5 Planned changes to existing fields EF-1..EF-22 — PLANNED *(generated; byte-identical to the plan and Spec 58 §13)*

| ID | Status | Source (Spec 58) | Existing field | Current calculation | New calculation | Constraints | Direction | Affected population |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| EF-1 | planned (change to an as-built field) | `bylaw_standard_setback_m` | `max_build_setback_basis` | `CASE WHEN bylaw_standard_setback_m IS NOT NULL THEN 'bylaw' ELSE 'zone_default' END` | Same CASE structure, but `'zone_default'` now means "verified universal formula, evaluated with this parcel's own frontage/depth" — a meaning change, no value/structure change | None — pure semantic reinterpretation | Confidence label upgrades; no value change | Every parcel currently on `'zone_default'` |
| EF-2 | planned (change to an as-built field) | `bylaw_max_coverage_pct`, `bylaw_standard_setback_m`, `zoning_class` | `max_buildable_footprint_sqm` | `LEAST(buffer, box, coverage_cap)`, `box` built from flat 6.0m front / 0.9m side / 7.5m rear constants | Same `LEAST()`, but `box`/`buffer` use NF-1/NF-2/NF-3 (real front/side/rear) AND are additionally `MIN()`-capped against NF-10/NF-11 (length/depth) | Requires NF-1, NF-2, NF-3, NF-10, NF-11 all landed; NF-3's RT/RM branch additionally requires NF-15 non-NULL | **Decreases in the common case — but NOT guaranteed, see EF-4** | `frontage_m ≥ 12` (side) or `depth_m > 30` (rear) or NF-10/11 binds, or NF-1's averaging branch (direction not fixed) |
| EF-3 | planned (change to an as-built field) | `bylaw_standard_setback_m`, `zoning_class` | `max_build_width_m` | `frontage_m − side_count × 0.9` (flat) | `frontage_m − side_count × bylaw_min_side_setback_m` (NF-3), then `MIN(result, bylaw_max_building_length_m)` (NF-10) | Same NF-3/NF-15 dependency as EF-2; NF-10's `on_major_street` dependency unverified | **Decreases** | `frontage_m ≥ 12` (setback effect) or NF-10 binds (length-cap effect) |
| EF-4 | planned (change to an as-built field) | `bylaw_standard_setback_m`, `zoning_class` | `max_build_length_m` | `depth_m − front_setback − 7.5` (flat rear, flat 6.0m front) | `depth_m − bylaw_min_front_setback_m (NF-1) − bylaw_min_rear_setback_m (NF-2)`, then `MIN(result, bylaw_max_building_depth_m)` (NF-11) | Requires NF-1, NF-2, NF-11 | **CROSS-FIELD INVARIANT — CONFIRMED REAL, NOT JUST A RISK (re-verified 2026-09-28): explicitly searched §10.20.40.70(1) and the surrounding averaging provisions for a floor clause — none exists.** *"No explicit minimum floor value is stated for averaged or reduced front yard setbacks... the provision permits reductions through averaging... but contains no language establishing a floor below which the setback cannot be reduced."* The rear-setback effect (NF-2) decreases this field on deep lots. NF-1's averaging branch, confirmed floor-free, CAN and WILL legitimately produce a front setback below 6.0m when a neighbour is built closer to the street — which INCREASES this field. **This is a genuine, by-law-permitted outcome, not a theoretical edge case — treat "may increase" as a real, expected population in the sanity-audit bounds (Execution Plan step 6), not a rare exception to guard against.** Breaks "decreases only" for every downstream field inheriting from EF-4 (EF-8, EF-13, EF-19-22) on any such parcel. | `depth_m > 30` (rear-setback effect, decreases) or NF-11 binds (decreases, RD/RS/RM only) or NF-1 averaging active with a closer-built neighbour (CONFIRMED possible — increases) |
| EF-5 | planned (change to an as-built field) | `bylaw_max_height_m`, `bylaw_standard_setback_m`, `zoning_class` | `max_build_height_m` | `bylaw_max_height_m` pass-through, NULL when overlay absent | `COALESCE(bylaw_max_height_m, NF-7-resolved-default)` — RD/RS/RT → 10.0; RM → 10.0/12.0 by `building_type` (NF-15) | RM branch requires NF-15 non-NULL or falls back to NULL (do not guess) | **NULL → populated** | The ~10% currently height-NULL |
| EF-6 | planned (change to an as-built field) | `bylaw_max_height_m`, `bylaw_max_stories`, `bylaw_standard_setback_m`, `zoning_class` | `max_build_stories` | `LEAST(pocket_p50, height_implied)`, `height_implied` NULL when `bylaw_max_height_m` NULL — cap silently absent | Same formula, `height_implied` now derives from EF-5's post-fix value | Inherits EF-5's dependency | **Decreases, only where pocket estimate > ~3 storeys** | The ~10% currently height-NULL, where empirical storeys exceed the legal cap |
| EF-7 | planned (change to an as-built field) | `bylaw_max_height_m`, `bylaw_max_stories`, `bylaw_standard_setback_m`, `zoning_class` | `max_build_stories_basis` | No `'bylaw'` value possible for the height-NULL slice | Gains a legitimate value for that slice | Inherits EF-5's dependency | Coverage increase | Same ~10% slice |
| EF-8 | planned (change to an as-built field) | `bylaw_max_coverage_pct`, `bylaw_max_fsi`, `bylaw_max_height_m`, `bylaw_max_stories`, `bylaw_standard_setback_m`, `zoning_class` | `max_buildable_gfa_sqm` | `LEAST(footprint×stories, lot×FSI)` | Same formula, inherits EF-2's footprint and EF-6's stories | Inherits EF-2 + EF-6 | **Decreases in the common case — inherits EF-4's unresolved-direction caveat** | Union of EF-2/EF-3/EF-4/EF-6's populations |
| EF-9 | planned (change to an as-built field) | `bylaw_max_fsi`, `bylaw_max_height_m`, `bylaw_standard_setback_m`, `zoning_class`, `zoning_is_ambiguous` | `max_build_confidence` | `CASE ... setback_is_bylaw ...` (front only) | Same CASE — should be revisited given NF-2/NF-3 make side/rear equally verified (a judgment call, not prescribed here) | Flagged, not prescribed | Confidence label upgrades (if revised) | Wherever other CASE conditions already held |
| EF-10 | planned (change to an as-built field) | `bylaw_standard_setback_m`, `zoning_class`, `zoning_is_ambiguous` | `envelope_constrained`/`envelope_constraint_reason` | Ordered CASE on the old (smaller) setback consumption | Same ordered CASE, evaluated against the new (larger) setback consumption | Needs the existing D-C viability-floor guard to hold under the new, larger inputs | **New edge case** | Narrow, small, wide-frontage or deep lots near the margin |
| EF-11 | planned (change to an as-built field) | `bylaw_max_coverage_pct`, `bylaw_max_fsi`, `bylaw_max_height_m`, `bylaw_max_stories`, `bylaw_standard_setback_m`, `zoning_class` | `max_buildable_gfa_basis` | `'coverage_box'` when width/length non-NULL | Could flip to `'coverage_only'` under the same margin cases as EF-10 | Same as EF-10 | **New edge case** | Same population as EF-10 |
| EF-12 | planned (change to an as-built field) | `bylaw_max_height_m`, `zoning_class` | `market_exceeds_bylaw` | `pocket_p90 > height_implied`, uncomparable when `height_implied` NULL | Same formula, now genuinely comparable via EF-5's fix | Inherits EF-5's dependency | **Newly meaningful** (was silently uncomparable) | The ~10% currently height-NULL |
| EF-13 | planned (change to an as-built field) | `bylaw_standard_setback_m`, `zoning_class` | `garden_suite_fits`, `max_garden_suite_gfa_sqm` | `rear_yard_depth = depth − front_setback − 7.5` (flat) | `rear_yard_depth = depth − NF-1 − NF-2` | Inherits NF-1 + NF-2 | **Decreases when NF-2 drives it — inherits EF-4's unresolved-direction caveat if NF-1 drives it instead** | `depth_m > 30` |
| EF-14 | planned (change to an as-built field) | `bylaw_standard_setback_m`, `zoning_class` | `max_laneway_suite_gfa_sqm` | Same `rear_yard_depth` gate as EF-13 | Same gate, NF-1/NF-2-derived | Inherits NF-1 + NF-2 | **Decreases** | `depth_m > 30`, `abuts_laneway` |
| EF-15 | planned (change to an as-built field) | `bylaw_standard_setback_m`, `zoning_class` | `rear_suite_type` | Chosen `'laneway'`/`'garden'`/NULL based on EF-13/EF-14 fit | Could flip to NULL at the margin | Inherits EF-13/EF-14 | **New edge case** | Deep lots near the suite-fit margin |
| EF-16 | planned (change to an as-built field) | `bylaw_standard_setback_m`, `zoning_class` | `max_rear_suite_gfa_sqm`, `rear_suite_permission` | Chosen type's GFA + greenspace permission | Shrinks/nulls in lockstep with EF-15 | Inherits EF-15 | **Decreases / new edge case** | Same population |
| EF-17 | planned (change to an as-built field) | `bylaw_standard_setback_m`, `zoning_class` | `max_garage_gfa_sqm`, `garage_capacity_cars`, `garage_constraint_reason`, `garage_permission` | `LEAST(garage_max_gfa, pct × rear_yard_area)`, old `rear_yard_area` | Same formula, new (smaller) `rear_yard_area` from NF-1/NF-2 | Inherits NF-1 + NF-2 | **Decreases / new edge case** | `depth_m > 30` |
| EF-18 | planned (change to an as-built field) | — (no Spec 58 input, or field outside the max-build pass) | `cost_laneway_suite_total` | Prices old `max_laneway_suite_gfa_sqm` | Prices EF-14's post-fix value | Inherits EF-14 | **Decreases** | `depth_m > 30`, `abuts_laneway` |
| EF-19 | planned (change to an as-built field) | — (no Spec 58 input, or field outside the max-build pass) | `opt_aor_gfa_sqm`/`opt_aor_storeys`/`opt_aor_units` | Reads pre-fix `max_buildable_footprint_sqm`/`max_build_stories` | Reads EF-2/EF-6 post-fix values | Inherits EF-2 + EF-6 | **Decreases in the common case — inherits EF-4's unresolved-direction caveat** | Same populations as EF-2/EF-6 |
| EF-20 | planned (change to an as-built field) | — (no Spec 58 input, or field outside the max-build pass) | `opt_coa_gfa_sqm`/`opt_coa_storeys` | Same feed, CoA tier | Same feed, post-fix | Inherits EF-19 | **Decreases in the common case — inherits EF-4's unresolved-direction caveat** | Same populations |
| EF-21 | planned (change to an as-built field) | — (no Spec 58 input, or field outside the max-build pass) | `max_build_fsi`/`coa_fsi` | `GFA ÷ lot`, pre-fix GFA | `GFA ÷ lot`, post-fix (smaller) GFA | Inherits EF-8/EF-20 | **Decreases in the common case — inherits EF-4's unresolved-direction caveat** | Same populations |
| EF-22 | planned (change to an as-built field) | — (no Spec 58 input, or field outside the max-build pass) | `cost_fb_total`, `cost_coa_total`, `cost_solar_total`, `cost_garden_suite_total`, `cost_garage_total` | Priced off pre-fix area fields | Priced off post-fix (smaller) area fields | Inherits EF-2/EF-8/EF-16/EF-17 | **Decreases in the common case — inherits EF-4's unresolved-direction caveat** | Same populations, proportionally |

### 3.6 Additional by-law provisions in scope *(generated; byte-identical)*

| Provision | By-law citation | Requirement | Handling today |
| --- | --- | --- | --- |
| Front yard setback averaging | §10.5.40.70(1) | If an abutting lot's building fronts the same street within 15.0m: required front setback = neighbour's actual setback, or average of both neighbours' | Not implemented — the common case on a built-up street, not an edge case. See NF-1/NF-6. |
| Building length | §10.20.40.20(1) (+ RS/RM equivalents) | Max 17.0m baseline, 19.0m/25.0m major-street exceptions | Not implemented — see NF-10 |
| Building depth | §10.20.40.30(1) (+ RS/RM equivalents) | Max 19.0m from front-setback line | Not implemented — see NF-11 |
| Soft landscaping | §10.5.50 | Two-tier: front/corner = landscaping-coverage % THEN 75% of that must be soft; rear = direct single-step % | Not implemented at all for the main house — see NF-12/13/14 |
| Narrow-lot side setback reduction | §10.5.40.71(3-4) | Reduced side setbacks for additions on narrow lots | Not implemented — informational, out of this WF2's numbered-field scope |
| Existing-building setback grandfathering | §10.5.40.71 | Lawfully-existing building retains its original setback | Informational only, not a "max buildable" input |
| Parking placement | §10.5.80.10(3)/(5) | Parking cannot be located in a front yard abutting a street | Entirely new category, not modeled — out of this WF2's scope |

## 4. By-law claims — verification summary

All by-law text is from the City's consolidation pages `https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter{800,10_5,10_20,10_40,10_60,10_80,150_7,150_8,200,995}.htm`, fetched by the generator (fetch times per row in the appendices). Normalization: tags stripped, entities decoded (incl. `&nbsp;`), curly quotes/dashes folded, whitespace collapsed (`landscaping-gen/norm.js`).

* **Appendix A — quoted claims.** Every double-quoted string in the plan's `By-law claim` cells (NF rows), the NF-10 constraints cell, and the report's "Verbatim by-law text — full record" was extracted mechanically and bound to the pages its preceding `§` citations name. `VERIFIED (exact)` = substring of the page; `(excerpt)` = the quote's `...`-separated fragments occur in order, each within 300 characters of the previous (the page text spanning them is reproduced); `+casefold` / `+trailing-punct` = matched only after case-folding / dropping a fragment's own trailing `. , ; :`. Anything else is **UNVERIFIED** with the failing fragment named — it is never re-worded into a quote. Quoted phrases that belong to an *absence* claim are routed to the ledger's absence counts.
* **Appendix B — landscaping ledger L1–L28**, ported verbatim from the plan and **re-verified** against this run's fetch with the original ledger's substring / regex-count semantics.
* **Appendix C — grounding extracts G1–G23**: provisions this spec relies on that the plan did not quote in full, **copied from the fetched page** between two search anchors (the anchors only locate text; the emitted text is the page's). Plus absence check A1.

**What verification found that matters (details §8):** the plan's own quotes are mostly exact, but the full provisions (G-extracts) show that the RD/RS side-setback tiers and the RD length/depth caps key on the **required minimum lot frontage** (the zone label's `f` value — Spec 58 `frontage_min_m` → `parcels.bylaw_min_frontage_m`), not the measured `frontage_m`; that **building length** is by definition a front-to-rear distance; and that RS/RT/RM have no general corner-lot clause.

## 5. Methodology

### 5.1 As-built derivation (Spec 65 §4 — what runs today)

Terms in `code` are the aliases in the SQL `buildMaxBuildSql` generates (§3.2 gives each expression).

1. **Inputs** (CTE `scope`, `massing`). From `parcels`: `lot_size_sqm`, `frontage_m`, `depth_m`, `geom` (Spec 55); `bylaw_max_height_m`, `bylaw_max_stories`, `bylaw_max_fsi`, `bylaw_max_coverage_pct`, `bylaw_standard_setback_m`, `zoning_class`, `zoning_is_ambiguous` (zoning pass ← Spec 58, §3.1 *Source (Spec 58)*); `is_corner_lot`, `is_through_lot`, `abuts_laneway` (Spec 62); `is_in_ravine_protection_area` (Spec 59); `is_heritage_designated` (Spec 61). A centroid-in-polygon LATERAL adds the neighbourhood link, income and the pocket storey norms (Spec 57, Spec 65 §8). `massing` sums the primary and all linked building footprints (Spec 56).
2. **Lot validation** (`lot`, `tier`). `lot_size_confidence` from a 3-way agreement (±`LOT_TOLERANCE` 15 %) of `lot_size_sqm`, `ST_Area(geom::geography)` and `frontage_m × depth_m`, with the band `[max_build_lot_min_sqm, max_build_lot_max_sqm]`. The envelope is emitted (`emit`) only for `high`/`medium`.
3. **Setbacks** (`sb`). `front_setback = COALESCE(bylaw_standard_setback_m, zone default)`; `side_setback`, `rear_setback`, `flankage_setback`, `side_count` from `SETBACK_DEFAULTS` (§3.3) by `zoning_class` prefix. `setback_is_bylaw` records whether `STAND_SET` supplied the front.
4. **Envelope** (`box`, `geo`). Rectangle: `width_raw` = `frontage − side_count × side` (interior) or `frontage − MIN(side_count,1) × side − flankage` (corner); `length_raw` = `depth − front − rear` (or `depth − 2 × front` on a through lot); both minus `RAVINE_SETBACK_M` (10 m) in a ravine protection area. Each dimension below `max_build_min_dimension_m` (3.0 m) is NULLed; `box_area = width × length`. Shape-aware check: `buffer_area = ST_Area(ST_Buffer(geom::geography, −(side × side_count / 2 + ravine_red)))`, dropped below `minDim²`.
5. **Coverage cap** (`geo`). `coverage_cap = lot_size_sqm × COALESCE(bylaw_max_coverage_pct, COVERAGE_DEFAULTS[zone]) / 100` — **a zone-median default fills unmapped lots** (`coverage_defaulted`), see §8 KFM-2.
6. **Length / depth caps.** **None as-built.**
7. **Footprint** (`env`, final SELECT). Ravine + sub-floor (not heritage) → NULL (`ravine_constrained`); width or length NULL → `coverage_cap` alone (`max_buildable_gfa_basis = 'coverage_only'`); otherwise `footprint_calc = LEAST(buffer_area, box_area, coverage_cap)` (LEAST skips NULLs). Heritage → the primary massing footprint (frozen), or NULL when there is no massing or it exceeds `lot × (1 + mislink_footprint_lot_tol)`.
8. **Storeys / height** (`geo`, `env`). `height_implied = GREATEST(1, round(bylaw_max_height_m / storey height))` (3.0 m residential via `storey_height_m`; 4.0 m C/E/I/UT). `stories_calc = bylaw_max_stories` → else `LEAST(pocket_p50, height_implied)` → else `pocket_p50` → else `height_implied`. `max_build_height_m = bylaw_max_height_m` passed through — **NULL when no height overlay covers the lot** (§8 KFM-3).
9. **GFA** (`gfa`, final SELECT). `max_buildable_gfa_sqm = LEAST(footprint × stories, lot × bylaw_max_fsi)`; FSI NULL ⇒ the FSI term drops (by-law: "not limited", G8). Heritage GFA = frozen footprint × `stories_calc`, no FSI cap. Basis `fsi` / `coverage_box` / `coverage_only` / `heritage_existing`.
10. **Confidence / basis / constraint** (final SELECT). `max_build_confidence` (worst-input-wins, MB-6), `max_build_setback_basis` (`bylaw` iff `STAND_SET` present), `max_build_basis`, `envelope_constrained` + ordered `envelope_constraint_reason`. Accessory fit (garage, rear suite, greenspace permission) follows in `accessory` / `accessory2` (Spec 65 §7).

### 5.2 Planned derivation (QUEUED WF2 — not implemented)

Same pipeline, with the flat constants replaced by the by-law formulas of §3.4/§3.5 (plan text governs; this is a reading guide):

1. **Setbacks:** front NF-1 `COALESCE(STAND_SET, averaging_result, 6.0)` (+ NF-5 flag, NF-6 measured neighbour setback); rear NF-2; side NF-3 (RD/RS tiers; RT/RM by `building_type`, NULL when NF-15 is NULL); corner NF-4.
2. **Caps:** length NF-10, depth NF-11.
3. **Envelope:** EF-3 width, EF-4 length, EF-2 footprint `LEAST(buffer, box, coverage_cap)`.
4. **Coverage vs setback, shown side by side (NF-17/18/19)** — ported verbatim from the plan:

* **Operator challenge (2026-09-29):** a coverage percentage gives a maximum footprint, but the owner must still meet every setback. The coverage-implied footprint may not fit inside the setbacks, so the real maximum may be set by the setbacks.
* **Where the model already agrees:** EF-2 takes `LEAST(buffer, box, coverage_cap)`, so setbacks win whenever they are smaller. V25 shows the real setbacks plus the NF-11 depth cap deciding (≈573 → ≈312 m²) with no coverage term.
* **Decision: show both, not one number.** NF-17 (setback-only footprint) and NF-18 (coverage-only footprint) are exposed side by side, and NF-19 names the one that binds. EF-2 (the headline footprint) is unchanged here.
* **MORE RESEARCH REQUIRED before implementation:**
  * **R1 — zone-median coverage default.** `scripts/lib/compute/enrich-parcels.js` computes `coverage_cap = COALESCE(bylaw_max_coverage_pct, zone median)`. On NF-8 `'unregulated'` lots the by-law applies no coverage limit, yet the median still enters EF-2's `LEAST` and can bind. The median was added (comment at the `coverage_cap` CTE: "else LEAST drops the term and the footprint balloons to the setback box (~67% coverage)") when setbacks were flat 0.9 / 7.5 m with no length/depth caps. Whether it retires once NF-1..4, NF-10 and NF-11 land needs a Reality-Check measurement (how often the median binds today, and by how much) and a Regression Guardian fence ruling.
  * **R2 — coverage-only fallback (EF-11).** When width/length is NULL the footprint is coverage alone, with no setback check. Decide what the report shows; interim: NF-17 NULL and NF-19 `'coverage_only_unchecked'`.
  * **R3 — shape feasibility.** A footprint inside both limits can still be unbuildable (minimum dwelling width, irregular polygons); the buffer's minimum-dimension floor is the only current guard.
  * **R4 — binding distribution.** Measure, per zone on real lots, how often setback vs coverage vs the length/depth caps bind before choosing any headline rule.

5. **Height / storeys:** EF-5 height default (RD/RS/RT 10.0; RM 10.0/12.0 by `building_type`), NF-7 basis, EF-6/EF-7 storeys, EF-12 hotspot.
6. **GFA:** EF-8 inherits EF-2 and EF-6; EF-19..EF-22 propagate to optimal-config (Spec 78) and cost (Spec 83/88).
7. **Landscaping and driveway (NF-12..NF-14, NF-20..NF-28).** Front yard two-step (landscaping share by frontage tier NF-22/NF-12, then 75 % soft NF-20 — or 75 % of the whole front yard when there is no permitted driveway); rear yard single-step (NF-13, replaced by NF-24/NF-25 for garden/laneway suites); corner side yard NF-14; hard landscaping is *derived by subtraction* (NF-21, never a by-law maximum); driveway width cap NF-23. **User-input fields** (NULL default, never auto-derived): `building_type` (NF-15), `current_stories` (NF-16), `existing_driveway_type` (NF-26 ∈ none/private/shared/unknown), `existing_driveway_width_m` (NF-27), `existing_front_parking_pad` (NF-28). The ledger (Appendix B) is the text authority; the plan's worked example (10 m × 6 m front yard) is in Spec 58 §13.

## 6. Scenarios

Each scenario lists the fields involved, the binding term, the plan's vectors that apply (rows copied verbatim), and a worked example **computed by `spec67-gen/calc.js`**: `asBuilt()` mirrors `buildMaxBuildSql` for an axis-aligned rectangle using the constants exported by `scripts/lib/max-build.js` (the negative buffer is modelled as `(F−2d)(D−2d)`; the real pass buffers the true polygon on geography); `planned()` implements the plan's formulas exactly as written; `bylawReading()` is this spec's reading of the G-extracts (**research-required**, §8). `calc.js` reproduces every numeric plan vector (Appendix D). Unless stated: lot confidence high, no FSI, height overlay 10.0 m, pocket p50 = 2 storeys, coverage overlay unmapped.

### 6.1 Regular lot — RD / RS / RT / RM
*Fields:* front/side/rear setbacks, `side_count`, `max_build_width_m`, `max_build_length_m`, `max_buildable_footprint_sqm`, `max_build_stories`, `max_buildable_gfa_sqm`; planned NF-1/2/3/10/11/17/18/19, EF-2..EF-5. *Binds (as-built):* on these worked lots the zone-median coverage cap (33 % RD/RS/RT, 30 % RM) binds before the box. *Binds (planned):* the NF-17 setback box (NF-18 is NULL on unmapped lots).

| # | Zone | Inputs | Field | Formula applied | Expected output |
| --- | --- | --- | --- | --- | --- |
| V2 | RD | `frontage_m=10` | NF-3 side | band (B) `6.0–<12.0` | `0.9` |
| V5 | RS | `frontage_m=16` | NF-3 side | band (D) `≥15.0`, flat (NOT further tiered like RD) | `1.5` |
| V7 | RD | `depth_m=25` | NF-2 rear | `GREATEST(7.5, 0.25×25=6.25)` | `7.5` (floor binds) |
| V10 | RT | `building_type='detached'` | NF-3 side | branch (B)(i) | `0.9` |
| V13 | RM | `building_type='detached'` | NF-3 side | (A) | `1.2` |
| V14 | RM | `building_type='semi_detached'` | NF-3 side | (B) | `1.5` |
| V17 | RM | `building_type='apartment'` | NF-3 side | (C), ELSE branch | `2.4` |
| V18 | RD/RS/RT | height overlay NULL | EF-5 height | flat default | `10.0` |
| V19 | RM | height overlay NULL, `building_type='detached'` | EF-5 height | (B)(i) | `10.0` |

#### RD — 10 m × 36 m, coverage overlay unmapped, height overlay 10.0 m, pocket p50 = 2

(a) As-built (`calc.asBuilt`)<br>
(b) Planned — plan formulas as written, building_type='detached' (`calc.planned`)

| Term | (a) | (b) |
| --- | --- | --- |
| `front` | 6 | 6 |
| `side` | 0.9 | 0.9 |
| `rear` | 7.5 | 9 |
| `flank` | 4.5 | — |
| `side_count` | 2 | — |
| `width_raw` | 8.2 | — |
| `length_raw` | 22.5 | — |
| `width_m` | 8.2 | 8.2 |
| `length_m` | 22.5 | 19 |
| `box_area` | 184.5 | — |
| `buffer_area` | 280.44 | — |
| `coverage_pct` | 33 | — |
| `coverage_defaulted` | true | — |
| `coverage_cap` | 118.8 | — |
| `footprint` | 118.8 | — |
| `binding` | coverage_cap | — |
| `height_implied` | 3 | — |
| `stories` | 2 | — |
| `gfa` | 237.6 | — |
| `gfa_basis` | coverage_box | — |
| `max_build_height_m` | 10 | — |
| `len_cap` | — | 17 |
| `depth_cap` | — | 19 |
| `nf17` | — | 155.8 |
| `nf18` | — | NULL |
| `nf19` | — | setback |
| `ef2_if_median_kept` | — | 118.8 |
| `height` | — | 10 |
| `corner_landscaping` | — | NULL |

#### RS — 7.5 m × 36 m, coverage overlay unmapped, height overlay 10.0 m, pocket p50 = 2

(a) As-built (`calc.asBuilt`)<br>
(b) Planned — plan formulas as written, building_type='semi_detached' (`calc.planned`)

| Term | (a) | (b) |
| --- | --- | --- |
| `front` | 6 | 6 |
| `side` | 0.9 | 0.9 |
| `rear` | 7.5 | 9 |
| `flank` | 4.5 | — |
| `side_count` | 1 | — |
| `width_raw` | 6.6 | — |
| `length_raw` | 22.5 | — |
| `width_m` | 6.6 | 6.6 |
| `length_m` | 22.5 | 19 |
| `box_area` | 148.5 | — |
| `buffer_area` | 231.66 | — |
| `coverage_pct` | 33 | — |
| `coverage_defaulted` | true | — |
| `coverage_cap` | 89.1 | — |
| `footprint` | 89.1 | — |
| `binding` | coverage_cap | — |
| `height_implied` | 3 | — |
| `stories` | 2 | — |
| `gfa` | 178.2 | — |
| `gfa_basis` | coverage_box | — |
| `max_build_height_m` | 10 | — |
| `len_cap` | — | 17 |
| `depth_cap` | — | 19 |
| `nf17` | — | 125.4 |
| `nf18` | — | NULL |
| `nf19` | — | setback |
| `ef2_if_median_kept` | — | 89.1 |
| `height` | — | 10 |
| `corner_landscaping` | — | NULL |

#### RT — 6 m × 30 m, coverage overlay unmapped, height overlay 10.0 m, pocket p50 = 2

(a) As-built (`calc.asBuilt`)<br>
(b) Planned — plan formulas as written, building_type='townhouse', all units front the street (`calc.planned`)

| Term | (a) | (b) |
| --- | --- | --- |
| `front` | 6 | 6 |
| `side` | 0.9 | 0.9 |
| `rear` | 7.5 | 7.5 |
| `flank` | 4.5 | — |
| `side_count` | 0 | — |
| `width_raw` | 6 | — |
| `length_raw` | 16.5 | — |
| `width_m` | 6 | 6 |
| `length_m` | 16.5 | 16.5 |
| `box_area` | 99 | — |
| `buffer_area` | 180 | — |
| `coverage_pct` | 33 | — |
| `coverage_defaulted` | true | — |
| `coverage_cap` | 59.4 | — |
| `footprint` | 59.4 | — |
| `binding` | coverage_cap | — |
| `height_implied` | 3 | — |
| `stories` | 2 | — |
| `gfa` | 118.8 | — |
| `gfa_basis` | coverage_box | — |
| `max_build_height_m` | 10 | — |
| `len_cap` | — | NULL |
| `depth_cap` | — | NULL |
| `nf17` | — | 99 |
| `nf18` | — | NULL |
| `nf19` | — | setback |
| `ef2_if_median_kept` | — | 59.4 |
| `height` | — | 10 |
| `corner_landscaping` | — | NULL |

#### RM — 12 m × 36 m, coverage overlay unmapped, height overlay 10.0 m, pocket p50 = 2

(a) As-built (`calc.asBuilt`)<br>
(b) Planned — plan formulas as written, building_type='detached' (`calc.planned`)

| Term | (a) | (b) |
| --- | --- | --- |
| `front` | 6 | 6 |
| `side` | 1.5 | 1.2 |
| `rear` | 7.5 | 9 |
| `flank` | 4.5 | — |
| `side_count` | 2 | — |
| `width_raw` | 9 | — |
| `length_raw` | 22.5 | — |
| `width_m` | 9 | 9.6 |
| `length_m` | 22.5 | 19 |
| `box_area` | 202.5 | — |
| `buffer_area` | 297 | — |
| `coverage_pct` | 30 | — |
| `coverage_defaulted` | true | — |
| `coverage_cap` | 129.6 | — |
| `footprint` | 129.6 | — |
| `binding` | coverage_cap | — |
| `height_implied` | 3 | — |
| `stories` | 2 | — |
| `gfa` | 259.2 | — |
| `gfa_basis` | coverage_box | — |
| `max_build_height_m` | 10 | — |
| `len_cap` | — | 17 |
| `depth_cap` | — | 19 |
| `nf17` | — | 182.4 |
| `nf18` | — | NULL |
| `nf19` | — | setback |
| `ef2_if_median_kept` | — | 129.6 |
| `height` | — | 10 |
| `corner_landscaping` | — | NULL |

### 6.2 Narrow lot (< 6 m frontage)
*Fields:* side setback (as-built 0.9 × 2 for RD), width floor (3.0 m), planned NF-3 band (A), front landscaping NF-22 `'under6m_all_but_driveway'`, driveway NF-23 2.6 m. *Binds:* the coverage cap while the width clears 3.0 m; below it the box is excluded and the envelope is coverage-only (`envelope_constraint_reason = 'lot_too_narrow'`, confidence `low`). Planned side 0.6 m keys on frontage in the plan but on the zone label's required frontage in the by-law (§8 KFM-4).

| # | Zone | Inputs | Field | Formula applied | Expected output |
| --- | --- | --- | --- | --- | --- |
| V1 | RD | `frontage_m=5` | NF-3 side | band (A) `<6.0` | `0.6` |

(a) As-built RD 5.5 m × 30 m<br>
(b) As-built RD 4.5 m × 30 m (width below the 3.0 m floor)<br>
(c) Planned RD 5.5 m × 30 m (plan formulas, keyed on frontage_m)

| Term | (a) | (b) | (c) |
| --- | --- | --- | --- |
| `front` | 6 | 6 | 6 |
| `side` | 0.9 | 0.9 | 0.6 |
| `rear` | 7.5 | 7.5 | 7.5 |
| `flank` | 4.5 | 4.5 | — |
| `side_count` | 2 | 2 | — |
| `width_raw` | 3.7 | 2.7 | — |
| `length_raw` | 16.5 | 16.5 | — |
| `width_m` | 3.7 | NULL | 4.3 |
| `length_m` | 16.5 | 16.5 | 16.5 |
| `box_area` | 61.05 | NULL | — |
| `buffer_area` | 104.34 | 76.14 | — |
| `coverage_pct` | 33 | 33 | — |
| `coverage_defaulted` | true | true | — |
| `coverage_cap` | 54.45 | 44.55 | — |
| `footprint` | 54.45 | 44.55 | — |
| `binding` | coverage_cap | coverage_only (box excluded) | — |
| `height_implied` | 3 | 3 | — |
| `stories` | 2 | 2 | — |
| `gfa` | 108.9 | 89.1 | — |
| `gfa_basis` | coverage_box | coverage_only | — |
| `max_build_height_m` | 10 | 10 | — |
| `len_cap` | — | — | 17 |
| `depth_cap` | — | — | 19 |
| `nf17` | — | — | 70.95 |
| `nf18` | — | — | NULL |
| `nf19` | — | — | setback |
| `ef2_if_median_kept` | — | — | 54.45 |
| `height` | — | — | 10 |
| `corner_landscaping` | — | — | NULL |

### 6.3 Wide lot (frontage tiers for side setback)
*Fields:* NF-3 RD 7-band / RS 4-band table. *Binds:* as-built coverage; planned the box, with side 1.8 m at 20 m frontage per the plan. The by-law tiers on the **required** minimum lot frontage (G1: "if the required minimum lot frontage is 18.0 metres to less than 24.0 metres"), so a 20 m lot in an `f12.0` zone takes band (C) 1.2 m, not 1.8 m — column (c).

| # | Zone | Inputs | Field | Formula applied | Expected output |
| --- | --- | --- | --- | --- | --- |
| V3 | RD | `frontage_m=20` | NF-3 side | band (E) `18.0–<24.0` | `1.8` |
| V4 | RD | `frontage_m=32` | NF-3 side | band (G) `≥30.0` | `3.0` |
| V5 | RS | `frontage_m=16` | NF-3 side | band (D) `≥15.0`, flat (NOT further tiered like RD) | `1.5` |
| V6 | RS | non-residential building | NF-3 side | clause (E), use-based exception | `1.8` |

(a) As-built RD 20 m × 40 m<br>
(b) Planned RD 20 m × 40 m (plan: side tier on frontage_m = 20 → band E)<br>
(c) Spec 67 reading, same lot, zone label f12.0 (`calc.bylawReading`, research-required)

| Term | (a) | (b) | (c) |
| --- | --- | --- | --- |
| `front` | 6 | 6 | — |
| `side` | 0.9 | 1.8 | 1.2 |
| `rear` | 7.5 | 10 | 10 |
| `flank` | 4.5 | — | — |
| `side_count` | 2 | — | — |
| `width_raw` | 18.2 | — | — |
| `length_raw` | 26.5 | — | — |
| `width_m` | 18.2 | 16.4 | 17.6 |
| `length_m` | 26.5 | 19 | 17 |
| `box_area` | 482.3 | — | — |
| `buffer_area` | 695.24 | — | — |
| `coverage_pct` | 33 | — | — |
| `coverage_defaulted` | true | — | — |
| `coverage_cap` | 264 | — | — |
| `footprint` | 264 | — | — |
| `binding` | coverage_cap | — | — |
| `height_implied` | 3 | — | — |
| `stories` | 2 | — | — |
| `gfa` | 528 | — | — |
| `gfa_basis` | coverage_box | — | — |
| `max_build_height_m` | 10 | — | — |
| `len_cap` | — | 17 | 17 |
| `depth_cap` | — | 19 | 19 |
| `nf17` | — | 311.6 | — |
| `nf18` | — | NULL | — |
| `nf19` | — | setback | — |
| `ef2_if_median_kept` | — | 264 | — |
| `height` | — | 10 | — |
| `corner_landscaping` | — | NULL | — |
| `box` | — | — | 299.2 |

### 6.4 Deep lot (rear 25 % of depth; 19 m depth cap — V25)
*Fields:* NF-2 (RD/RS/RM `GREATEST(7.5, 0.25 × depth)`; RT flat 7.5), NF-11 depth cap, EF-4 length, EF-2 footprint. *Binds:* planned — the NF-11 depth cap (V25). **As-built the V25 lot's footprint is 297 m² (zone-median coverage binds), not the 573.3 m² box the V25 "OLD" line states**; if R1 keeps the median, EF-2 stays 297 m² and V25's ~46 % reduction appears only in NF-17. Under the by-law reading (c) the 17.0 m length cap binds on the front-to-rear axis (289 m²); in a zone whose required frontage exceeds 18.0 m the RD caps do not apply (d).

| # | Zone | Inputs | Field | Formula applied | Expected output |
| --- | --- | --- | --- | --- | --- |
| V7 | RD | `depth_m=25` | NF-2 rear | `GREATEST(7.5, 0.25×25=6.25)` | `7.5` (floor binds) |
| V8 | RD | `depth_m=35` | NF-2 rear | `GREATEST(7.5, 0.25×35=8.75)` | `8.75` (%-of-depth binds) |
| V9 | RT | `depth_m=35` | NF-2 rear | flat, no depth term | `7.5` (unchanged regardless of depth — contrast with V8) |
| **V25 (end-to-end regression lock — the most important vector, shows the fix's real magnitude)** | RD | `frontage_m=20, depth_m=45, side_count=2, on_major_street=false`, coverage unmapped | EF-2/EF-3/EF-4 chain | **OLD (flat constants):** width `= 20 − 2×0.9 = 18.2`; rear `= 7.5` (flat) → length `= 45 − 6.0 − 7.5 = 31.5`; footprint `= 18.2 × 31.5 ≈ 573.3 m²`. **NEW (real formulas):** side `= 1.8` (band E) → width `= 20 − 2×1.8 = 16.4` (under the 17.0m length cap, not binding); rear `= GREATEST(7.5, 0.25×45=11.25) = 11.25` → raw length `= 45 − 6.0 − 11.25 = 27.75`, **then `MIN(27.75, 19.0) = 19.0`** (NF-11 depth cap binds — the dominant effect in this example) → footprint `= 16.4 × 19.0 ≈ 311.6 m²`. | **Expect ≈311.6 m², a ~46% reduction from the old ≈573.3 m² — this single worked example is the clearest illustration of why this WF2 matters and should be the first assertion written in Step 6's golden-differential test.** |

(a) As-built RD 20 m × 45 m (the V25 lot), coverage unmapped<br>
(b) Planned RD 20 m × 45 m (plan formulas as written — reproduces V25)<br>
(c) Spec 67 reading, V25 lot, zone label f15.0 (research-required)<br>
(d) Spec 67 reading, V25 lot, zone label f24.0 (RD caps do not apply above 18.0)<br>
(e) As-built RT 6 m × 45 m

| Term | (a) | (b) | (c) | (d) | (e) |
| --- | --- | --- | --- | --- | --- |
| `front` | 6 | 6 | — | — | 6 |
| `side` | 0.9 | 1.8 | 1.5 | 2.4 | 0.9 |
| `rear` | 7.5 | 11.25 | 11.25 | 11.25 | 7.5 |
| `flank` | 4.5 | — | — | — | 4.5 |
| `side_count` | 2 | — | — | — | 0 |
| `width_raw` | 18.2 | — | — | — | 6 |
| `length_raw` | 31.5 | — | — | — | 31.5 |
| `width_m` | 18.2 | 16.4 | 17 | 15.2 | 6 |
| `length_m` | 31.5 | 19 | 17 | 27.75 | 31.5 |
| `box_area` | 573.3 | — | — | — | 189 |
| `buffer_area` | 786.24 | — | — | — | 270 |
| `coverage_pct` | 33 | — | — | — | 33 |
| `coverage_defaulted` | true | — | — | — | true |
| `coverage_cap` | 297 | — | — | — | 89.1 |
| `footprint` | 297 | — | — | — | 89.1 |
| `binding` | coverage_cap | — | — | — | coverage_cap |
| `height_implied` | 3 | — | — | — | 3 |
| `stories` | 2 | — | — | — | 2 |
| `gfa` | 594 | — | — | — | 178.2 |
| `gfa_basis` | coverage_box | — | — | — | coverage_box |
| `max_build_height_m` | 10 | — | — | — | 10 |
| `len_cap` | — | 17 | 17 | NULL | — |
| `depth_cap` | — | 19 | 19 | NULL | — |
| `nf17` | — | 311.6 | — | — | — |
| `nf18` | — | NULL | — | — | — |
| `nf19` | — | setback | — | — | — |
| `ef2_if_median_kept` | — | 297 | — | — | — |
| `height` | — | 10 | — | — | — |
| `corner_landscaping` | — | NULL | — | — | — |
| `box` | — | — | 289 | 421.8 | — |

### 6.5 Corner lot (flankage)
*Fields:* as-built `flankage_setback` (4.5 m RD) with `width = frontage − MIN(side_count,1) × side − flankage` (MB-5 D-A); planned NF-4 (3.0 m when the required frontage ≥ 12.0 m and an adjacent lot fronts the flanking street — condition (B) not yet traced to a column), NF-14 corner landscaping 60 %. RS/RT/RM have no general corner clause (A1); their 3.0 m corner value exists only inside the major-street apartment clause (G9/G12/G15 (4)(D)(iv)). *Binds (as-built):* on the worked 13 m corner lot the flankage-reduced box (125.4 m²) binds below the 33 % coverage cap (128.7 m²), while the same interior lot binds on coverage.

| # | Zone | Inputs | Field | Formula applied | Expected output |
| --- | --- | --- | --- | --- | --- |
| V23 | RT | `is_corner_lot=false` | NF-14 corner landscaping | `NULL` gate | `NULL` |
| V24 | any | `is_corner_lot=true` | NF-14 corner landscaping | flat | `60` |

(a) As-built RD 13 m × 30 m corner lot<br>
(b) As-built RD 13 m × 30 m interior lot (for contrast)<br>
(c) Planned RD 13 m × 30 m corner, adjacent lot fronts the flanking street (NF-4 3.0 m)

| Term | (a) | (b) | (c) |
| --- | --- | --- | --- |
| `front` | 6 | 6 | 6 |
| `side` | 0.9 | 0.9 | 1.2 |
| `rear` | 7.5 | 7.5 | 7.5 |
| `flank` | 4.5 | 4.5 | — |
| `side_count` | 2 | 2 | — |
| `width_raw` | 7.6 | 11.2 | — |
| `length_raw` | 16.5 | 16.5 | — |
| `width_m` | 7.6 | 11.2 | 8.8 |
| `length_m` | 16.5 | 16.5 | 16.5 |
| `box_area` | 125.4 | 184.8 | — |
| `buffer_area` | 315.84 | 315.84 | — |
| `coverage_pct` | 33 | 33 | — |
| `coverage_defaulted` | true | true | — |
| `coverage_cap` | 128.7 | 128.7 | — |
| `footprint` | 125.4 | 128.7 | — |
| `binding` | box_area | coverage_cap | — |
| `height_implied` | 3 | 3 | — |
| `stories` | 2 | 2 | — |
| `gfa` | 250.8 | 257.4 | — |
| `gfa_basis` | coverage_box | coverage_box | — |
| `max_build_height_m` | 10 | 10 | — |
| `len_cap` | — | — | 17 |
| `depth_cap` | — | — | 19 |
| `nf17` | — | — | 145.2 |
| `nf18` | — | — | NULL |
| `nf19` | — | — | setback |
| `ef2_if_median_kept` | — | — | 128.7 |
| `height` | — | — | 10 |
| `corner_landscaping` | — | — | 60 |

### 6.6 Major street (length caps; pending the `on_policy_road` fix)
*Fields:* NF-10 (RD/RS/RM 17.0 base; 19.0 townhouse / 25.0 apartment on a major street; RT only on a major street), V15/V16 RM townhouse side. `on_major_street` = `parcels.on_policy_road` (Spec 58 `zoning_policy_road_overlay`, G22 "Major Street means any street identified as "Major Streets" on the Policy Areas Overlay Map found in Section 995.10") — **near-dead today** (§8 KFM-1), so every planned major-street branch is inert until `.cursor/wf3_policy_road_overlay_distance_fix_active_task.md` lands. The fetched RS/RT/RM text also has a major-street setback clause (4) (front 3.0 m / 6.0 m by depth and averaging, rear 7.5 m, townhouse side 0.9 / 7.5 m, apartment side 2.4 / 5.5 / 7.5 m, corner 3.0 m — G9/G12/G15) and RT major-street height/storey minimums (G14 (1)(D), (2)(D)) that the plan does not model — **research-required**. As-built: no length cap at all.

| # | Zone | Inputs | Field | Formula applied | Expected output |
| --- | --- | --- | --- | --- | --- |
| V15 | RM | `building_type='townhouse'`, `all_units_front_street=true`, on major street | NF-3 side | §10.80.40.70(4)(C)(i) | `0.9` |
| V16 | RM | `building_type='townhouse'`, off major street | NF-3 side | **UNCONFIRMED — no citation found; must be resolved (Step 1) before this input is safe to test against a fixed expected value** | TBD, do not assert `0.9`, `7.5`, or `2.4` without re-checking |
| V21 | RD | not on major street | NF-10 length | base case | `17.0` |
| V22 | RT | not on major street | NF-10 length | RT has no base case | `NULL` — confirm NOT `17.0` (the RD/RS/RM number must not leak into RT) |

(a) Planned RT townhouse on a major street (NF-10 19.0)<br>
(b) Planned RT townhouse off a major street (NF-10 NULL — V22)

| Term | (a) | (b) |
| --- | --- | --- |
| `front` | 6 | 6 |
| `side` | 0.9 | 0.9 |
| `rear` | 7.5 | 7.5 |
| `len_cap` | 19 | NULL |
| `depth_cap` | NULL | NULL |
| `width_m` | 6 | 6 |
| `length_m` | 16.5 | 16.5 |
| `nf17` | 99 | 99 |
| `nf18` | NULL | NULL |
| `nf19` | setback | setback |
| `ef2_if_median_kept` | 59.4 | 59.4 |
| `height` | 10 | 10 |
| `corner_landscaping` | NULL | NULL |

### 6.7 Coverage mapped vs unregulated
*Fields:* `bylaw_max_coverage_pct` (Spec 58 lot-coverage overlay ← `PRCNT_CVER`, else base `COVERAGE`), `coverage_cap`, `coverage_defaulted`, planned NF-8/NF-18/NF-19. The by-law: "if a lot is not in an area with a numerical value on the Lot Coverage Overlay Map, no lot coverage applies" (G7, claim verified on all four zone pages). As-built fills the gap with the zone median anyway (R1 / KFM-2). *Binds:* coverage in both as-built variants here; planned mapped → `coverage`, unmapped → `setback`.

(a) As-built RD 10 m × 36 m, coverage overlay 35 %<br>
(b) As-built RD 10 m × 36 m, coverage unmapped (zone median 33 % fills)<br>
(c) Planned, mapped 35 %<br>
(d) Planned, unmapped (NF-18 NULL)

| Term | (a) | (b) | (c) | (d) |
| --- | --- | --- | --- | --- |
| `front` | 6 | 6 | 6 | 6 |
| `side` | 0.9 | 0.9 | 0.9 | 0.9 |
| `rear` | 7.5 | 7.5 | 9 | 9 |
| `flank` | 4.5 | 4.5 | — | — |
| `side_count` | 2 | 2 | — | — |
| `width_raw` | 8.2 | 8.2 | — | — |
| `length_raw` | 22.5 | 22.5 | — | — |
| `width_m` | 8.2 | 8.2 | 8.2 | 8.2 |
| `length_m` | 22.5 | 22.5 | 19 | 19 |
| `box_area` | 184.5 | 184.5 | — | — |
| `buffer_area` | 280.44 | 280.44 | — | — |
| `coverage_pct` | 35 | 33 | — | — |
| `coverage_defaulted` | false | true | — | — |
| `coverage_cap` | 126 | 118.8 | — | — |
| `footprint` | 126 | 118.8 | — | — |
| `binding` | coverage_cap | coverage_cap | — | — |
| `height_implied` | 3 | 3 | — | — |
| `stories` | 2 | 2 | — | — |
| `gfa` | 252 | 237.6 | — | — |
| `gfa_basis` | coverage_box | coverage_box | — | — |
| `max_build_height_m` | 10 | 10 | — | — |
| `len_cap` | — | — | 17 | 17 |
| `depth_cap` | — | — | 19 | 19 |
| `nf17` | — | — | 155.8 | 155.8 |
| `nf18` | — | — | 126 | NULL |
| `nf19` | — | — | coverage | setback |
| `ef2_if_median_kept` | — | — | 126 | 118.8 |
| `height` | — | — | 10 | 10 |
| `corner_landscaping` | — | — | NULL | NULL |

### 6.8 Irregular lot / coverage-only fallback
*Fields:* `width_raw`/`length_raw` vs `max_build_min_dimension_m`, `buffer_area` sliver floor, `max_buildable_gfa_basis = 'coverage_only'`, `envelope_constrained`, planned NF-19 `'coverage_only_unchecked'` (R2), R3 shape feasibility. The rectangle box is shape-blind and the buffer is direction-blind (MB-3); on irregular or pie lots the `LEAST` of the two is the only shape guard. When a dimension falls below the floor the footprint is the coverage cap with **no setback check**.

(a) As-built RD 4.5 m × 30 m (sub-floor width → coverage-only)

| Term | (a) |
| --- | --- |
| `front` | 6 |
| `side` | 0.9 |
| `rear` | 7.5 |
| `flank` | 4.5 |
| `side_count` | 2 |
| `width_raw` | 2.7 |
| `length_raw` | 16.5 |
| `width_m` | NULL |
| `length_m` | 16.5 |
| `box_area` | NULL |
| `buffer_area` | 76.14 |
| `coverage_pct` | 33 |
| `coverage_defaulted` | true |
| `coverage_cap` | 44.55 |
| `footprint` | 44.55 |
| `binding` | coverage_only (box excluded) |
| `height_implied` | 3 |
| `stories` | 2 |
| `gfa` | 89.1 |
| `gfa_basis` | coverage_only |
| `max_build_height_m` | 10 |

### 6.9 Heritage freeze
*Fields (the worked table shows intermediate terms; the persisted width/length/height are NULL for heritage):* `is_heritage_designated` (Spec 61), `massing.existing_footprint_sqm` (primary, Spec 56), `mislink_footprint_lot_tol`, `max_build_basis = 'heritage_existing'`, `envelope_constraint_reason ∈ {heritage, heritage_no_massing, heritage_footprint_exceeds_lot}`. Footprint frozen to the existing primary building; storeys from the same bounded `stories_calc`; GFA uncapped by FSI; `max_build_width_m`/`_length_m`/`_height_m` NULL. `bylaw_max_*` are never overwritten. No planned change.

(a) As-built RD 10 m × 36 m heritage, primary massing footprint 120 m²<br>
(b) As-built heritage, massing footprint 400 m² (> lot × 1.05 → mislink)

| Term | (a) | (b) |
| --- | --- | --- |
| `front` | 6 | 6 |
| `side` | 0.9 | 0.9 |
| `rear` | 7.5 | 7.5 |
| `flank` | 4.5 | 4.5 |
| `side_count` | 2 | 2 |
| `width_raw` | 8.2 | 8.2 |
| `length_raw` | 22.5 | 22.5 |
| `width_m` | 8.2 | 8.2 |
| `length_m` | 22.5 | 22.5 |
| `box_area` | 184.5 | 184.5 |
| `buffer_area` | 280.44 | 280.44 |
| `coverage_pct` | 33 | 33 |
| `coverage_defaulted` | true | true |
| `coverage_cap` | 118.8 | 118.8 |
| `footprint` | 120 | NULL |
| `binding` | heritage freeze (existing footprint) | heritage_no_massing |
| `height_implied` | 3 | 3 |
| `stories` | 2 | 2 |
| `gfa` | 240 | NULL |
| `gfa_basis` | heritage_existing | NULL |
| `max_build_height_m` | NULL | NULL |

### 6.10 Ravine protection / sub-floor
*Fields:* `is_in_ravine_protection_area` (Spec 59), `RAVINE_SETBACK_M` 10 m subtracted from both rectangle dimensions and added to the buffer inset, `ravine_sub_floor`, `envelope_constraint_reason ∈ {ravine, ravine_constrained}`. Above the floor the envelope is emitted with reason `ravine`; below it **the whole envelope is withheld** (no ravine-blind coverage fallback). No planned change.

(a) As-built RD 15 m × 40 m in ravine protection area<br>
(b) As-built RD 12 m × 40 m in ravine protection area (sub-floor)

| Term | (a) | (b) |
| --- | --- | --- |
| `front` | 6 | 6 |
| `side` | 0.9 | 0.9 |
| `rear` | 7.5 | 7.5 |
| `flank` | 4.5 | 4.5 |
| `side_count` | 2 | 2 |
| `width_raw` | 3.2 | 0.2 |
| `length_raw` | 16.5 | 16.5 |
| `width_m` | 3.2 | NULL |
| `length_m` | 16.5 | 16.5 |
| `box_area` | 52.8 | NULL |
| `buffer_area` | NULL | NULL |
| `coverage_pct` | 33 | 33 |
| `coverage_defaulted` | true | true |
| `coverage_cap` | 198 | 158.4 |
| `footprint` | 52.8 | NULL |
| `binding` | box_area | withheld (ravine_constrained) |
| `height_implied` | 3 | 3 |
| `stories` | 2 | 2 |
| `gfa` | 105.6 | NULL |
| `gfa_basis` | coverage_box | NULL |
| `max_build_height_m` | 10 | NULL |

### 6.11 Front-yard setback averaging
*Fields:* planned NF-1 (averaging branch), NF-5, NF-6 (`existing_front_setback_m`, not yet measured), EF-4 (may **increase**), EF-13 onward. By-law G19 (§10.5.40.70(1)): one qualifying neighbour → its setback; two → their average; each must front the same street and be ≤ 15.0 m from the subject lot. Every zone's front-setback clause opens "If regulation 10.5.40.70(1) does not apply" (G1/G9/G12/G15), so averaging takes precedence over 6.0 m by the text itself; the `STAND_SET`-first ordering in NF-1 remains an inference (§8 KFM-10). As-built: not modelled (front = `STAND_SET` or 6.0).

(a) Planned RD 10 m × 30 m, no qualifying neighbour (NF-1 = 6.0)<br>
(b) Planned RD 10 m × 30 m, neighbours at 4.0 m and 5.0 m (NF-1 = 4.5, NF-5 TRUE)

| Term | (a) | (b) |
| --- | --- | --- |
| `front` | 6 | 4.5 |
| `side` | 0.9 | 0.9 |
| `rear` | 7.5 | 7.5 |
| `len_cap` | 17 | 17 |
| `depth_cap` | 19 | 19 |
| `width_m` | 8.2 | 8.2 |
| `length_m` | 16.5 | 18 |
| `nf17` | 135.3 | 147.6 |
| `nf18` | NULL | NULL |
| `nf19` | setback | setback |
| `ef2_if_median_kept` | 99 | 99 |
| `height` | 10 | 10 |
| `corner_landscaping` | NULL | NULL |

### 6.12 RT / RM with `building_type` NULL ("NULL, don't guess")
*Fields:* NF-15 `building_type` (user input, NULL default), NF-3 RT/RM branches, EF-5/NF-7 RM height branch. With `building_type` NULL the planned RT/RM side setback and the RM default height are NULL (V12, and EF-5's RM branch), never the old constant. RM length/depth caps also depend on type (G16/G17: 17.0 m / 19.0 m apply to "a detached house or a semi-detached house"; townhouse/apartment only on a major street). As-built uses the flat RT 0.9 m (side_count 0) and RM 1.5 m constants and the modal `side_count`.

| # | Zone | Inputs | Field | Formula applied | Expected output |
| --- | --- | --- | --- | --- | --- |
| V11 | RT | `building_type='apartment'` (not enumerated in (B)) | NF-3 side | falls to (A) | `7.5` |
| V12 | RT | `building_type=NULL` | NF-3 side | fallback-philosophy decision (Step 1c) | **`NULL`, per the recommended fix** — NOT `7.5` and NOT the old flat constant; confirm this is what actually got implemented |
| V16 | RM | `building_type='townhouse'`, off major street | NF-3 side | **UNCONFIRMED — no citation found; must be resolved (Step 1) before this input is safe to test against a fixed expected value** | TBD, do not assert `0.9`, `7.5`, or `2.4` without re-checking |
| V19 | RM | height overlay NULL, `building_type='detached'` | EF-5 height | (B)(i) | `10.0` |
| V20 | RM | height overlay NULL, `building_type='apartment'` | EF-5 height | (B)(ii) | `12.0` — **this is the case that would previously have been silently NULL; confirm it now populates** |

### 6.13 Through lot (as-built)
*Fields:* `is_through_lot` (Spec 62): `length_raw = depth − 2 × front` (no rear yard). No planned change named in the plan.

(a) As-built RD 10 m × 40 m through lot

| Term | (a) |
| --- | --- |
| `front` | 6 |
| `side` | 0.9 |
| `rear` | 7.5 |
| `flank` | 4.5 |
| `side_count` | 2 |
| `width_raw` | 8.2 |
| `length_raw` | 28 |
| `width_m` | 8.2 |
| `length_m` | 28 |
| `box_area` | 229.6 |
| `buffer_area` | 313.24 |
| `coverage_pct` | 33 |
| `coverage_defaulted` | true |
| `coverage_cap` | 132 |
| `footprint` | 132 |
| `binding` | coverage_cap |
| `height_implied` | 3 |
| `stories` | 2 |
| `gfa` | 264 |
| `gfa_basis` | coverage_box |
| `max_build_height_m` | 10 |

## Worked example — 41 Derwyn Road (real parcel, as-built vs planned)

> **Status:** AS-BUILT values are read from the local dev DB (read-only snapshot, captured 2026-09-29T15:40:26.183Z, `spec67-gen/derwyn-capture.js`, SELECT only) and **recomputed** here from the `buildMaxBuildSql` formulas (`calc.asBuilt` + the CTE terms named per row); **all 27 recomputed as-built values equal the stored values**. PLANNED values apply the QUEUED plan's NF/EF formulas **as written** (`calc.planned`); the *pending panel ruling* column applies F1–F3 (`calc.bylawReading`) and the data finding in step 12. Nothing planned exists in code or DB. Operator's figure "~100 × 30" is in feet and approximate: the data says **9.75 m (31.99 ft) frontage × 33.56 m (110.10 ft) depth** (≈ 32 ft × 110 ft).

### W.0 Data snapshot (every number below cites one of these queries)

| Q | SQL (as executed) | Result |
| --- | --- | --- |
| Q1 | `SELECT id, parcel_id, feature_type, address_number, linear_name_full, street_name_normalized FROM parcels WHERE address_number = '41' AND (linear_name_full ILIKE 'DERWYN%' OR street_name_normalized ILIKE 'DERWYN%')` | `{"id":153214,"parcel_id":"5293897","feature_type":"COMMON","address_number":"41","linear_name_full":"Derwyn Rd","street_name_normalized":"DERWYN"}` |
| Q2 | `SELECT ap.address_point_id, ap.address_full, ap.address_class_desc, ST_Contains(p.geom, ap.geom) AS inside_parcel_153214 FROM address_points ap, parcels p WHERE p.id = 153214 AND ap.address_number = '41' AND ap.linear_name_full ILIKE 'DERWYN%'` | `{"address_point_id":20870,"address_full":"41 Derwyn Rd","address_class_desc":"Land","inside_parcel_153214":true}` |
| Q3 | `SELECT lot_size_sqm, lot_size_sqft, frontage_m, frontage_ft, depth_m, depth_ft, is_irregular, stated_area_raw, lot_size_source, round(ST_Area(geom::geography)::numeric, 2) AS geom_area_sqm, ST_NPoints(geom) AS geom_npoints, is_in_ravine_protection_area, round(ravine_distance_m::numeric, 1) AS ravine_distance_m, is_heritage_designated, heritage_designation_type, is_corner_lot, is_through_lot, abuts_laneway, primary_frontage_street_name, neighbourhood_id FROM parcels WHERE id = 153214` | `{"lot_size_sqm":"327.12","lot_size_sqft":"3521.09","frontage_m":"9.75","frontage_ft":"31.99","depth_m":"33.56","depth_ft":"110.10","is_irregular":false,"stated_area_raw":"327.12 sq.m","lot_size_source":"stated","geom_area_sqm":"327.18","geom_npoints":5,"is_in_ravine_protection_area":false,"ravine_distance_m":"264.5","is_heritage_designated":false,"heritage_designation_type":null,"is_corner_lot":false,"is_through_lot":false,"abuts_laneway":false,"primary_frontage_street_name":"Derwyn Rd","neighbourhood_id":98}` |
| Q4 | `SELECT zoning_class, zoning_zn_string, zoning_holding, zone_status, zoning_is_ambiguous, zoning_dominant_area_share, zoning_base_source_id, exception_number, exception_text, bylaw_standard_setback_m, bylaw_min_frontage_m, bylaw_min_area_sqm, bylaw_max_coverage_pct, bylaw_max_height_m, bylaw_max_stories, bylaw_max_fsi, bylaw_max_density, bylaw_max_units, on_policy_road, in_policy_area, on_priority_retail, in_building_setback_overlay, zoning_overlays FROM parcels WHERE id = 153214` | `{"zoning_class":"RD","zoning_zn_string":"RD (f9.0; a280; d0.45)","zoning_holding":"N","zone_status":2,"zoning_is_ambiguous":false,"zoning_dominant_area_share":"1.0000","zoning_base_source_id":8933,"exception_number":null,"exception_text":"N","bylaw_standard_setback_m":null,"bylaw_min_frontage_m":"9.00","bylaw_min_area_sqm":280,"bylaw_max_coverage_pct":"35.00","bylaw_max_height_m":"8.50","bylaw_max_stories":null,"bylaw_max_fsi":null,"bylaw_max_density":"0.45","bylaw_max_units":null,"on_policy_road":false,"in_policy_area":false,"on_priority_retail":false,"in_building_setback_overlay":false,"zoning_overlays":{"base":[{"zn_zone":"RD","source_id":8933,"area_share":1}],"height_overlay":{"applied":true,"height_max_m":8.5},"lot_coverage_overlay":{"applied":true,"coverage_max_pct":35}}}` |
| Q5 | `SELECT source_id, zn_zone, zn_string, frontage_min_m, area_min_sqm, density_max, fsi_max, coverage_max_pct, standard_setback, exception_number FROM zoning_bylaw_areas WHERE source_id = 8933` | `{"source_id":8933,"zn_zone":"RD","zn_string":"RD (f9.0; a280; d0.45)","frontage_min_m":"9.00","area_min_sqm":280,"density_max":"0.45","fsi_max":null,"coverage_max_pct":null,"standard_setback":null,"exception_number":null}` |
| Q6 | `SELECT (SELECT json_agg(json_build_object('source_id', h.source_id, 'ht_string', h.ht_string, 'height_max_m', h.height_max_m, 'ht_stories', h.ht_stories)) FROM zoning_height_overlay h WHERE ST_Intersects(h.geom, p.geom)) AS height_overlay, (SELECT json_agg(json_build_object('source_id', c.source_id, 'coverage_max_pct_override', c.coverage_max_pct_override, 'area_share', round((ST_Area(ST_Intersection(c.geom, p.geom)::geography) / ST_Area(p.geom::geography))::numeric, 4))) FROM zoning_lot_coverage_overlay c WHERE ST_Intersects(c.geom, p.geom)) AS coverage_overlay FROM parcels p WHERE p.id = 153214` | `{"height_overlay":[{"source_id":802,"ht_string":"HT 8.5","height_max_m":8.5,"ht_stories":null}],"coverage_overlay":[{"source_id":1085,"coverage_max_pct_override":35,"area_share":1}]}` |
| Q7 | `SELECT lot_size_confidence, lot_size_basis, max_build_setback_basis, max_buildable_footprint_sqm, max_build_width_m, max_build_length_m, max_build_height_m, max_build_stories, max_build_stories_basis, max_build_stories_aggressive, market_exceeds_bylaw, max_build_basis, max_buildable_gfa_sqm, max_buildable_gfa_basis, max_build_confidence, envelope_constrained, envelope_constraint_reason, garden_suite_fits, max_garden_suite_gfa_sqm, max_laneway_suite_gfa_sqm, rear_suite_type, max_rear_suite_gfa_sqm, rear_suite_permission, max_garage_gfa_sqm, garage_capacity_cars, garage_constraint_reason, garage_permission, neighbourhood_cost_premium, max_newbuild_coa_gfa_sqm, max_build_fsi, opt_aor_gfa_sqm, opt_aor_storeys, opt_coa_gfa_sqm, opt_coa_storeys, opt_binding_constraint FROM parcels WHERE id = 153214` | `{"lot_size_confidence":"high","lot_size_basis":"3way","max_build_setback_basis":"zone_default","max_buildable_footprint_sqm":"114.49","max_build_width_m":"7.95","max_build_length_m":"20.06","max_build_height_m":"8.50","max_build_stories":2,"max_build_stories_basis":"pocket","max_build_stories_aggressive":3,"market_exceeds_bylaw":false,"max_build_basis":"rect_approx","max_buildable_gfa_sqm":"228.98","max_buildable_gfa_basis":"coverage_box","max_build_confidence":"medium","envelope_constrained":false,"envelope_constraint_reason":null,"garden_suite_fits":true,"max_garden_suite_gfa_sqm":"60.00","max_laneway_suite_gfa_sqm":null,"rear_suite_type":"garden","max_rear_suite_gfa_sqm":"60.00","rear_suite_permission":"as_of_right","max_garage_gfa_sqm":"22.56","garage_capacity_cars":1,"garage_constraint_reason":null,"garage_permission":"as_of_right","neighbourhood_cost_premium":"1.35","max_newbuild_coa_gfa_sqm":"240.43","max_build_fsi":"0.700","opt_aor_gfa_sqm":"228.98","opt_aor_storeys":2,"opt_coa_gfa_sqm":"343.47","opt_coa_storeys":3,"opt_binding_constraint":"coverage"}` |
| Q8 | `SELECT imagery_roof_footprint_sqm, existing_width_m, existing_length_m, existing_structure_confidence, existing_other_structures_count, existing_other_structures_sqm, existing_greenspace_sqm, existing_stories, existing_height_m FROM parcels WHERE id = 153214` | `{"imagery_roof_footprint_sqm":"84.29","existing_width_m":"7.28","existing_length_m":"11.71","existing_structure_confidence":"high","existing_other_structures_count":0,"existing_other_structures_sqm":"0.00","existing_greenspace_sqm":"242.83","existing_stories":null,"existing_height_m":null}` |
| Q9 | `SELECT pb.building_id, pb.is_primary, pb.match_type, pb.confidence, bf.footprint_area_sqm, bf.max_height_m FROM parcel_buildings pb JOIN building_footprints bf ON bf.id = pb.building_id WHERE pb.parcel_id = 153214` | `{"building_id":658913,"is_primary":true,"match_type":"centroid_in_parcel","confidence":"0.95","footprint_area_sqm":"84.29","max_height_m":"9.63"}` |
| Q10 | `SELECT round(ST_Area(ST_Buffer(geom::geography, -(0.9 * 2 / 2.0)))::numeric, 2) AS buffer_area_side_0_9 FROM parcels WHERE id = 153214` | `{"buffer_area_side_0_9":"252.48"}` |
| Q11 | `SELECT n.id AS neighbourhood_id, n.name, nsn.storeys_p50, nsn.storeys_p90, nsn.sample_count FROM neighbourhoods n LEFT JOIN neighbourhood_storey_norms nsn ON nsn.neighbourhood_id = n.id, parcels p WHERE p.id = 153214 AND ST_Contains(n.geom, ST_Centroid(p.geom)) ORDER BY n.id LIMIT 1` | `{"neighbourhood_id":98,"name":"Old East York","storeys_p50":2,"storeys_p90":3,"sample_count":55}` |
| Q12 | `SELECT variable_key, variable_value FROM logic_variables WHERE variable_key IN ('storey_height_m','max_build_min_dimension_m','max_build_lot_min_sqm','max_build_lot_max_sqm','mislink_footprint_lot_tol','min_soft_landscaping_pct','garden_suite_min_lot_sqm','garden_suite_min_rear_yard_m','garden_suite_max_gfa_sqm','garden_suite_storeys','garage_min_lot_sqm','garage_max_gfa_sqm','garage_min_footprint_sqm','accessory_max_coverage_pct','car_footprint_sqm','reno_coa_uplift_pct','road_overlay_distance_m') ORDER BY variable_key` | `[{"variable_key":"accessory_max_coverage_pct","variable_value":"0.3"},{"variable_key":"car_footprint_sqm","variable_value":"18.5"},{"variable_key":"garage_max_gfa_sqm","variable_value":"60"},{"variable_key":"garage_min_footprint_sqm","variable_value":"18"},{"variable_key":"garage_min_lot_sqm","variable_value":"230"},{"variable_key":"garden_suite_max_gfa_sqm","variable_value":"60"},{"variable_key":"garden_suite_min_lot_sqm","variable_value":"270"},{"variable_key":"garden_suite_min_rear_yard_m","variable_value":"5"},{"variable_key":"garden_suite_storeys","variable_value":"1"},{"variable_key":"max_build_lot_max_sqm","variable_value":"2000"},{"variable_key":"max_build_lot_min_sqm","variable_value":"50"},{"variable_key":"max_build_min_dimension_m","variable_value":"3"},{"variable_key":"min_soft_landscaping_pct","variable_value":"0.3"},{"variable_key":"mislink_footprint_lot_tol","variable_value":"0.05"},{"variable_key":"reno_coa_uplift_pct","variable_value":"0.05"},{"variable_key":"road_overlay_distance_m","variable_value":"5"},{"variable_key":"storey_height_m","variable_value":"3"}]` |
| Q13 | `SELECT count(*) AS rd_rs_rt_rm_parcels, count(*) FILTER (WHERE bylaw_max_fsi IS NOT NULL) AS with_bylaw_max_fsi, count(*) FILTER (WHERE bylaw_max_density IS NOT NULL) AS with_bylaw_max_density FROM parcels WHERE zoning_class IN ('RD','RS','RT','RM')` | `{"rd_rs_rt_rm_parcels":"331684","with_bylaw_max_fsi":"1312","with_bylaw_max_density":"120692"}` |
| Q14 | `SELECT count(*) AS rd_rs_rt_rm_zone_areas, count(*) FILTER (WHERE zn_string ~ 'd[0-9]') AS label_has_d, count(*) FILTER (WHERE density_max IS NOT NULL) AS density_max_set, count(*) FILTER (WHERE fsi_max IS NOT NULL) AS fsi_max_set FROM zoning_bylaw_areas WHERE zn_zone IN ('RD','RS','RT','RM')` | `{"rd_rs_rt_rm_zone_areas":"4926","label_has_d":"898","density_max_set":"898","fsi_max_set":"9"}` |

**Which parcel.** Q1 returns exactly one parcel: `id` 153214, `parcel_id` 5293897, `feature_type` COMMON. Q2: the one address point "41 Derwyn Rd" (Land) lies inside that parcel's polygon (`inside_parcel_153214` = true). No disambiguation needed.

### W.1 Completeness of the step list (derived from the code and the plan, not from the list)

Every gate / routing branch in `buildMaxBuildSql` (CTE order `scope → massing → sb → lot → tier → box → geo → env → gfa → accessory → accessory2 → final SELECT`), the downstream passes that read its output, and every NF/EF/F item, mapped to the operator's steps 1–14. "Added" rows are worked below in their code order, labelled **added — not in the original list**.

| Gate / step found in code or plan | Where | In operator's list? | Fields read | Fields written |
| --- | --- | --- | --- | --- |
| `scope`: `p.geom IS NOT NULL` + incremental scope | code | N — added as W.2a | `geom`, `lot_size_confidence`, `parcel_zoning_enrich` | — (row enters the pass) |
| `scope` LATERAL: neighbourhood (centroid-in-polygon) + pocket storey norms | code | N — added as W.2a; used in step 11 | `geom`, `neighbourhoods`, `neighbourhood_storey_norms` | `neighbourhood_id`, `neighbourhood_cost_premium` |
| `massing`: primary + total linked footprints | code | N — added as W.2b (existing building) | `parcel_buildings`, `building_footprints` | (intermediate) `existing_footprint_sqm`, `existing_total_footprint_sqm` |
| `sb`: front = `COALESCE(STAND_SET, zone default)`; side/rear/flankage/`side_count` from `SETBACK_DEFAULTS` | code | Y — steps 6/7 | `bylaw_standard_setback_m`, `zoning_class` | `max_build_setback_basis` (EF-1) |
| `lot`/`tier`: 3-way lot-area agreement ±15 % + band [50, 2000] m² → `emit` | code | N — added as W.5b (merged after step 5) | `lot_size_sqm`, `geom`, `frontage_m`, `depth_m` | `lot_size_confidence`, `lot_size_basis` |
| `box`: ravine reduction 10 m | code | Y — step 1 | `is_in_ravine_protection_area` | (intermediate) `ravine_red` |
| `box`: corner width branch (flankage) / through-lot length branch | code + NF-4 | Y (corner) — step 3; through lot N — added to step 3 | `is_corner_lot`, `is_through_lot` | (intermediate) `width_raw`, `length_raw` |
| `geo`: min-dimension floor (3.0 m) NULLs width/length; buffer sliver floor (9 m²) | code | N — added to step 8 | `max_build_min_dimension_m` | `max_build_width_m`, `max_build_length_m` |
| `geo`: `coverage_cap` with zone-median default (`coverage_defaulted`) | code + NF-8/NF-18, R1 | Y — steps 4/9 | `bylaw_max_coverage_pct`, `COVERAGE_DEFAULTS` | (intermediate) `coverage_cap` |
| `geo`: `height_implied`, pocket p50/p90 (citywide fallback) | code + EF-5/EF-6 | Y — step 11 | `bylaw_max_height_m`, `storey_height_m`, norms | (intermediate) |
| `env`: ravine sub-floor → envelope withheld | code | Y — merged into step 1 | ravine flag, `width_m`, `length_m` | `envelope_constraint_reason` |
| `env`: footprint routing (sub-floor → coverage-only; else `LEAST(buffer, box, coverage_cap)`) | code + EF-2/EF-11, NF-19 | Y — step 10 | `buffer_area`, `box_area`, `coverage_cap` | `max_buildable_footprint_sqm`, `max_build_basis` |
| `env`: heritage freeze / `heritage_no_massing` / mislink (> lot × 1.05) | code | Y — merged into step 2 | `is_heritage_designated`, massing, `mislink_footprint_lot_tol` | footprint, GFA, reason |
| `env`: `stories_calc` (ST → LEAST(p50, height-implied) → p50 → height-implied) | code + EF-6/EF-7 | Y — step 11 | `bylaw_max_stories`, p50, `height_implied` | `max_build_stories`, `max_build_stories_basis` |
| final: `max_build_stories_aggressive` (p90), `market_exceeds_bylaw` | code + EF-12 | N — added to step 11 | p90, `height_implied` | `max_build_stories_aggressive`, `market_exceeds_bylaw` |
| `gfa` + final: `LEAST(gfa_box, fsi_cap)`, basis | code + EF-8/NF-9 | Y — step 12 | `bylaw_max_fsi` | `max_buildable_gfa_sqm`, `max_buildable_gfa_basis` |
| final: `max_build_confidence` (ambiguous / heritage / sub-floor / lot high ∧ STAND_SET ∧ (FSI ∨ height)) | code + EF-9 | N — added as W.12b | `zoning_is_ambiguous`, lot confidence, `setback_is_bylaw` | `max_build_confidence` |
| final: `envelope_constrained` + ordered `envelope_constraint_reason` | code + EF-10 | N — added as W.12b | emit, heritage, ravine, dims, buffer/box, ambiguity | `envelope_constrained`, `envelope_constraint_reason` |
| `accessory`: rear-yard depth/area, garden/laneway fit | code + EF-13/EF-14/EF-15 | N — added as W.13b | `depth_m`, setbacks, `width_m`, total footprint, `abuts_laneway` | `garden_suite_fits`, `max_garden_suite_gfa_sqm`, `max_laneway_suite_gfa_sqm`, `rear_suite_type` |
| `accessory2` + final: garage fit, capacity, reason, permission; rear-suite permission (30 % of lot) | code + EF-16/EF-17, KFM-9 | N — added as W.13b | rear-yard area, garage LVs, `min_soft_landscaping_pct` | `max_garage_gfa_sqm`, `garage_capacity_cars`, `garage_constraint_reason`, `garage_permission`, `rear_suite_permission` |
| Pass 3: CoA uplift `max_newbuild_coa_gfa_sqm = GFA × (1 + reno_coa_uplift_pct)` | code (existing-structure pass) | N — added to step 14 (downstream) | `max_buildable_gfa_sqm` | `max_newbuild_coa_gfa_sqm` |
| Spec 78 opt-config / Spec 88 cost (EF-19..EF-22, `max_build_fsi`) | downstream | N — stored values listed in step 14, not recomputed | footprint, stories, GFA | `opt_*`, `cost_*`, `max_build_fsi` |
| `zoning_holding` (H symbol) | code (opt-config `isHolding` only) | N — not read by `buildMaxBuildSql` | `zoning_holding` | — |
| NF-1 averaging (+ NF-5, NF-6) | plan | Y — merged into step 7 (front) | `existing_front_setback_m` (not built) | NF-1, NF-5 |
| NF-15 `building_type` (user input) — gates NF-22/NF-23, W1(D), W2(C) | plan | N — added as W.6b (branch input) | — | NF-15 |
| NF-24 / NF-25 suite landscaping (replace NF-13) | plan | Y — merged into step 13 | suite existence (no column) | NF-24, NF-25 |
| F1 required vs measured frontage | plan findings | Y — steps 5/7 | `bylaw_min_frontage_m` | — |
| F2 length cap on the front-to-rear axis | plan findings | Y — step 8 | NF-10 | — |
| F3 cap / corner scope | plan findings | Y — steps 3/7 | `bylaw_min_frontage_m`, zone | — |
| F4 V25 "OLD" = coverage-bound | plan findings | n/a to this lot (coverage here is overlay-mapped, not the median) | — | — |
| F5 non-verbatim quotes | plan findings | n/a — this section quotes only G/L/W page text | — | — |
| **Data finding (new): zone-label `d` FSI lands in `bylaw_max_density`, not `bylaw_max_fsi`** | this example (Q4/Q5/Q13/Q14) | N — added to step 12 | `bylaw_max_density`, `bylaw_max_fsi` | EF-8 / NF-9 basis |

**Key fields this example does not exercise (and why):** heritage freeze / `heritage_no_massing` / mislink (not designated, Q3); ravine sub-floor and `ravine` reason (outside, 264.5 m away, Q3); corner flankage, NF-4, NF-14 (interior lot); through-lot length (`is_through_lot` false); sub-floor coverage-only (EF-11) and `setback_exceeds_lot` (both dimensions clear 3.0 m); `bylaw_max_stories` (no ST on the overlay, Q6); `bylaw_standard_setback_m` / `STAND_SET` and `exception_number` (NULL, Q4 — no Chapter 900 exception); `zoning_is_ambiguous` (false, one base polygon, area share 1.0); `zoning_holding` ('N'); laneway suite and NF-25 (`abuts_laneway` false); NF-5/NF-6 (no neighbour-setback measurement exists); NF-16 `current_stories` (out of the plan's scope); NF-28 parking pad (only matters in the under-6 m tier, L5); all major-street branches (`on_policy_road` false, and near-dead fleet-wide — KFM-1); EF-19..EF-22 (Spec 78/83/88 own them; stored values listed only).

### W.2a Scope and neighbourhood — **added — not in the original list**
(i) Does the parcel enter the max-build pass, and which storey norm applies? (ii) Yes: `geom` present (Q3 `geom_npoints` 5). Centroid lies in neighbourhood 98 "Old East York" (Q11), local norm p50 = 2, p90 = 3 (n = 55); stored `neighbourhood_id` = 98 (Q3). (iii) *Fields — EXISTING (as-built):* `geom`, `neighbourhood_id`, `neighbourhood_cost_premium` (stored 1.35, Q7)  
*Fields — NEW (NF-#/planned/user-input):* none  
 (iv) Rule: code — `ST_Contains(n.geom, ST_Centroid(p.geom))` in CTE `scope`; no by-law provision.

### W.2b Existing building — **added — not in the original list**
(i) What stands on the lot today? (ii) One linked building, primary (Q9: `building_id` 658913, `centroid_in_parcel`, confidence 0.95), footprint 84.29 m² (907.3 ft²); total linked footprint 84.29 m² (no sheds/garages). Existing-structure pass (Q8): 7.28 m × 11.71 m, confidence high, greenspace 242.83 m². Existing coverage 84.29 / 327.12 = 25.8 %. (iii) *Fields — EXISTING (as-built):* `imagery_roof_footprint_sqm`, `existing_width_m`, `existing_length_m`, `existing_greenspace_sqm`; massing intermediates `existing_footprint_sqm` / `existing_total_footprint_sqm`  
*Fields — NEW (NF-#/planned/user-input):* NF-6 `existing_front_setback_m` (planned, not measured — NULL)  
 (iv) Rule: code — CTE `massing` (`SUM(bf.footprint_area_sqm) FILTER (WHERE pb.is_primary)::numeric AS existing_footprint_sqm`). Used only by the heritage freeze and the accessory rear-yard area.

### Step 1 — Is it in a ravine protection area?
(i) Does the ravine 10 m reduction or the sub-floor withholding apply? (ii) **No** — `is_in_ravine_protection_area` = false, `ravine_distance_m` = 264.5 (Q3). `ravine_red` = 0; `ravine_sub_floor` = false. (iii) *Fields — EXISTING (as-built):* `is_in_ravine_protection_area`, `ravine_distance_m`  
*Fields — NEW (NF-#/planned/user-input):* none (no planned change, §6.10)  
 (iv) Rule: data flag (Spec 59) + code constant `RAVINE_SETBACK_M` = 10 m in CTE `box`; sub-floor branch `AS ravine_sub_floor`. No by-law text in the ledger.

### Step 2 — Is it heritage-designated?
(i) Does the heritage freeze (footprint = existing primary massing) apply? (ii) **No** — `is_heritage_designated` = false, type NULL (Q3). Had it been designated, the footprint would freeze at 84.29 m² (≤ lot × 1.05 = 343.48 m², so not a mislink). (iii) *Fields — EXISTING (as-built):* `is_heritage_designated`, massing `existing_footprint_sqm`  
*Fields — NEW (NF-#/planned/user-input):* none (no planned change, §6.9)  
 (iv) Rule: data flag (Spec 61) + code `AS heritage_no_massing`. No by-law text in the ledger.

### Step 3 — Is it a corner lot? (and through lot — **added — not in the original list**)
(i) Corner flankage / through-lot length branch? (ii) **Neither** — `is_corner_lot` = false, `is_through_lot` = false, `primary_frontage_street_name` = Derwyn Rd (Q3). Width uses the interior branch `frontage − side_count × side`; length uses `depth − front − rear`. (iii) *Fields — EXISTING (as-built):* `is_corner_lot`, `is_through_lot`  
*Fields — NEW (NF-#/planned/user-input):* NF-4 (not applicable → equals NF-3), NF-14 (NULL, not a corner)  
 (iv) Rule (planned NF-4; applies only to corner lots):

> **G2 — §10.20.40.70(6)** (RD corner-lot side yard abutting a street; Appendix C, fetched 2026-09-29T14:45:17.303Z): "(6) Minimum Side Yard Abutting a Street for Specified Corner Lots Despite regulation 10.20.40.70(3) and (4), for a corner lot in the RD zone, the required minimum side yard setback from a side lot line abutting a street is 3.0 metres, if: (A) the required minimum lot frontage for the corner lot is 12.0 metres or more; and (B) there is an adjacent lot fronting on the street abutting the side lot line of the corner lot."

### Step 4 — Does it have a by-law coverage percentage (Lot Coverage Overlay mapped)? — NF-8 basis
(i) Is the lot on the Lot Coverage Overlay Map? (ii) **Yes, 35 %** — overlay polygon 1085, `coverage_max_pct_override` 35, area share 1 (Q6) → `bylaw_max_coverage_pct` = 35.00 (Q4). `coverage_defaulted` = false, so the zone median (`COVERAGE_DEFAULTS.RD` = 33 %) is **not** used (R1 does not bite on this lot). (iii) *Fields — EXISTING (as-built):* `bylaw_max_coverage_pct`, `zoning_overlays.lot_coverage_overlay`  
*Fields — NEW (NF-#/planned/user-input):* NF-8 `bylaw_max_coverage_basis` = `overlay_mapped`  
 (iv) Rule:

> **G7 — §10.20.30.40(1)(A)(B)** (RD lot coverage (overlay-mapped or none); Appendix C, fetched 2026-09-29T14:45:17.303Z): "10.20.30.40 Lot Coverage (1) Maximum Lot Coverage (A) if a lot in is in an area with a numerical value on the Lot Coverage Overlay Map, that numerical value is the permitted maximum lot coverage, as a percentage of the lot area; (B) if a lot is not in an area with a numerical value on the Lot Coverage Overlay Map, no lot coverage applies; [ By-law: 848-2025 ]"

> **W1 — §10.20.30.40(1)(C)(D)** (RD lot coverage — major street / houseplex or secondary suite; section-local extract, [ch10_20](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_20.htm), fetched 2026-09-29T14:45:17.303Z): "(C) despite (A) and (B) above, if a lot abuts a major street, the permitted maximum lot coverage for a townhouse or apartment building is 50 percent of the lot area; and [ By-law: 1062-2025(OLT); 608-2024 ] [ By-law: 848-2025 ] (D) Despite (A) above, if the numerical value on the Lot Coverage Overlay Map is less than 45 percent and the lot contains a detached houseplex or a residential building with a secondary suite, the maximum lot coverage for all buildings and structures on the lot is 45 percent;"

W1(D) raises the cap to 45 % when the lot contains a detached houseplex or a building with a secondary suite — a building-type / suite fact with no column (NF-15 user input). Neither the code nor the plan models W1(D); its branch is shown in steps 9–10.

### Step 5 — Lot dimensions (operator skipped; included as lot geometry)
(i) Frontage, depth, area; regular or irregular; measured frontage vs the zone's required minimum (F1)? (ii) Frontage 9.75 m (31.99 ft) (stored `frontage_ft` 31.99); depth 33.56 m (110.10 ft) (stored `depth_ft` 110.10); lot 327.12 m² (3521.1 ft²) (stored `lot_size_sqft` 3521.09, source `stated`, raw "327.12 sq.m"); polygon area 327.18 m², 5-point multipolygon; `is_irregular` = false (Q3). Required minimum lot frontage = zone label `f9.0` → `bylaw_min_frontage_m` = 9.00 (Q4, Q5 `frontage_min_m`); required minimum area `a280` → 280 m². Measured 9.75 m ≥ required 9.00 m and 327.12 m² ≥ 280 m² — a conforming lot. **F1 is moot here:** 9.75 m (measured) and 9.0 m (required) fall in the same RD side band (B) "6.0 metres to less than 12.0 metres", and 9.0 ≤ 18.0 so the RD caps apply under either reading. (iii) *Fields — EXISTING (as-built):* `frontage_m`, `frontage_ft`, `depth_m`, `depth_ft`, `lot_size_sqm`, `lot_size_sqft`, `is_irregular`, `geom`, `bylaw_min_frontage_m`, `bylaw_min_area_sqm`  
*Fields — NEW (NF-#/planned/user-input):* none new (F1 would re-key NF-3/NF-10/NF-11 on `bylaw_min_frontage_m`)  
 (iv) Rule:

> **G5 — §10.20.30.20(1)(A)(B)** (RD required minimum lot frontage = zone-label "f" value; Appendix C, fetched 2026-09-29T14:45:17.303Z): "10.20.30.20 Lot Frontage (1) Minimum Lot Frontage In the RD zone: (A) if a zone label includes the letter "f", as on the Zoning By-law Map, the numerical value following the letter "f" is the required minimum lot frontage, in metres; and (B) if the zone label does not include an "f" value on the Zoning By-law Map, the required minimum lot frontage is 12.0 metres."

### W.5b Lot validation (`emit`) — **added — not in the original list**
| Term | Existing methodology (as-built code) | New approach (plan formulas as written) | Pending panel ruling (F1–F3 / data finding) |
| --- | --- | --- | --- |
| pair lot↔geom | abs(327.12 − 327.18) ≤ 0.15 × 327.18 → true (`AS pair_lg`) | unchanged | — |
| pair lot↔F×D | F × D = 327.21; → true | unchanged | — |
| pair geom↔F×D | → true | unchanged | — |
| band | 50 ≤ 327.12 ≤ 2000 → true | unchanged | — |
| `lot_size_confidence` / `_basis` | **high / 3way** (stored high / 3way, Q7) → `emit` = true | unchanged | — |

### Step 6 — What is the by-law zone?
(i) Zone class, zone string, exception, STAND_SET? (ii) **RD** (Residential Detached), zone string **`RD (f9.0; a280; d0.45)`** (Q4; source polygon 8933, Q5), holding `N`, one base polygon (area share 1.0000, `zoning_is_ambiguous` false); `exception_number` NULL (`exception_text` 'N'); `bylaw_standard_setback_m` (STAND_SET) NULL. Label decode: `f9.0` = required frontage 9.0 m (G5), `a280` = required area 280 m², `d0.45` = FSI 0.45 (G8(A)). Height overlay `HT 8.5` (no ST, Q6). (iii) *Fields — EXISTING (as-built):* `zoning_class`, `zoning_zn_string`, `zoning_holding`, `exception_number`, `bylaw_standard_setback_m`, `zoning_is_ambiguous`, `max_build_setback_basis` = `zone_default` (EF-1, Q7)  
*Fields — NEW (NF-#/planned/user-input):* none new  
 (iv) Rule: G5, G8 (quoted in steps 5 and 12).

### W.6b Building type and driveway — user inputs — **added — not in the original list**
(i) Which facts does the planned model need that no column holds? (ii) `building_type` (NF-15), `existing_driveway_type` (NF-26), `existing_driveway_width_m` (NF-27), `existing_front_parking_pad` (NF-28) — all NULL by default, never auto-derived. The RD formulas used in steps 7–12 do **not** need `building_type` (RD side tiers key on frontage; RD caps name "a permitted residential building" / "a detached house or detached houseplex"), but NF-22/NF-20/NF-23 (step 13), W1(D) and W2(C) do. Branches shown where they matter; nothing is guessed. (iii) *Fields — EXISTING:* none. *NEW:* NF-15, NF-26, NF-27, NF-28 (user-input). (iv) Rule: L4 (step 13).

### Step 7 — Which rules apply (this zone, this lot)?

| Rule | Applies? | Value on this lot | Why | Provision (verbatim below) |
| --- | --- | --- | --- | --- |
| Front setback | yes | NF-1 = 6.0 m (19.69 ft) — `bylaw_default_6m`; averaging research-required | no STAND_SET (Q4); NF-6 not measured, so the averaging branch cannot resolve; the depth cap (19.0 m from the *required* front setback) makes the footprint insensitive to averaging unless the averaged setback exceeds 6.17 m | G1 (1), G19 |
| Rear setback | yes | NF-2 = GREATEST(7.5, 0.25 × 33.56 = 8.39) = **8.39 m** (27.53 ft) | RD takes the depth term | G1 (2) |
| Side setback | yes | NF-3 = **0.9 m** × 2 sides | band (B): measured 9.75 and required 9.0 both in "6.0 to less than 12.0" (F1 moot) | G1 (3) |
| Corner side yard | no | — | interior lot | G2 |
| Height | yes | EF-5 = COALESCE(8.50, 10.0) = **8.50 m** (27.89 ft), NF-7 `overlay` | HT 8.5 on the Height Overlay Map (Q6) | G6 |
| Storeys | no | — (not limited) | no ST value (Q6) | W3 |
| Main-wall height | yes (not modelled) | higher of 7.0 m or 8.5 − 2.5 = 6.0 m → 7.0 m | governs wall height, not footprint/GFA; neither code nor plan models it | W4 |
| FSI | yes | d0.45 → lot × 0.45 = 147.20 m² | label carries `d` (G8(A)) — but `bylaw_max_fsi` is NULL (step 12 finding); W2(C) exempts a houseplex / secondary suite | G8, W2 |
| Building length | yes | NF-10 = 17.0 m | RD, required frontage 9.0 ≤ 18.0 (F3), not on a major street (`on_policy_road` false, Q4) | G3, G20 |
| Building depth | yes | NF-11 = 19.0 m from the required front setback | RD, required frontage 9.0 ≤ 18.0 (F3); applies to a detached house / detached houseplex | G4, G20 |
| Coverage | yes | 35 % → 114.49 m²; 45 % if houseplex / secondary suite | overlay-mapped (Q6) | G7, W1 |
| Front landscaping % | yes (if NF-15 in L4 scope) | NF-12 = 50 % | 6.0 ≤ 9.75 < 15.0 (actual frontage — L-tiers use the measured frontage) | L4, L6 |
| Front soft share | yes | NF-20: 75 % of front yard (no driveway) / 37.5 % (private driveway) | depends on NF-26 | L8, L1 |
| Front hard max | derived | NF-21 = 100 − NF-20 (− driveway %) | not a by-law maximum (L3 absence) | L1, L2 |
| Rear soft | yes | NF-13 = 50 % of rear yard (NF-24 50 % if a garden suite is built) | frontage > 6.0 | L10, L20 |
| Driveway width | yes (if in L15 scope) | NF-23 = LEAST(6.0, parking width) → 6.0 cap-only | 6.0 ≤ 9.75 ≤ 23.0 | L15 |

> **G1 — §10.20.40.70(1)-(3)** (RD front / rear / side setbacks; Appendix C, fetched 2026-09-29T14:45:17.303Z): "(1) Minimum Front Yard Setback If regulation 10.5.40.70(1) does not apply, the required minimum front yard setback in the RD zone is 6.0 metres. (2) Minimum Rear Yard Setback The required minimum rear yard setback in the RD zone is the greater of: (A) 7.5 metres; or (B) 25% of the lot depth. (3) Minimum Side Yard Setback The required minimum side yard setback in the RD zone is: (A) 0.6 metres if the required minimum lot frontage is less than 6.0 metres; (B) 0.9 metres if the required minimum lot frontage is 6.0 metres to less than 12.0 metres; (C) 1.2 metres if the required minimum lot frontage is 12.0 metres to less than 15.0 metres; (D) 1.5 metres if the required minimum lot frontage is 15.0 metres to less than 18.0 metres; (E) 1.8 metres if the required minimum lot frontage is 18.0 metres to less than 24.0 metres; (F) 2.4 metres if the required minimum lot frontage is 24.0 metres to less than 30.0 metres; and (G) 3.0 metres if the required minimum lot frontage is 30.0 metres or greater."

> **G19 — §10.5.40.70(1)** (Front yard setback averaging; Appendix C, fetched 2026-09-29T14:45:17.162Z): "10.5.40.70 Setbacks (1) Front Yard Setback - Averaging In the Residential Zone category, if a lot is: (A) beside one lot in the Residential Zone category, and that abutting lot has a building fronting on the same street and that building is, in whole or in part, 15.0 metres or less from the subject lot, the required minimum front yard setback is the front yard setback of that building on the abutting lot; and (B) between two abutting lots in the Residential Zone category, each with a building fronting on the same street and those buildings are both, in whole or in part, 15.0 metres or less from the subject lot, the required minimum front yard setback is the average of the front yard setbacks of those buildings on the abutting lots."

> **G6 — §10.20.40.10(1)(A)(B)** (RD maximum height; Appendix C, fetched 2026-09-29T14:45:17.303Z): "(1) Maximum Height The permitted maximum height for a building or structure on a lot in the RD zone is: (A) the numerical value, in metres, following the letters "HT" on the Height Overlay Map; or (B) if the lot is in an area with no numerical value following the letters "HT" on the Height Overlay Map, 10.0 metres;"

> **G3 — §10.20.40.20(1)** (RD maximum building length; Appendix C, fetched 2026-09-29T14:45:17.303Z): "(1) Maximum Building Length if Required Lot Frontage is in Specified Range In the RD zone with a required minimum lot frontage of 18.0 metres or less, the permitted maximum building length for a permitted residential building is 17.0 metres. [ By-law: 474-2023 ]"

> **G4 — §10.20.40.30(1)** (RD maximum building depth; Appendix C, fetched 2026-09-29T14:45:17.303Z): "(1) Maximum Building Depth if Required Lot Frontage is in Specified Range In the RD zone with a required minimum lot frontage of 18.0 metres or less, the rear main wall of a detached house or detached houseplex, not including a one storey extension that complies with regulation 10.20.40.20(2), may be no more than 19.0 metres from the required front yard setback. [ By-law: 648-2025 ]"

> **G20 — §800.50(100)/(105)** (Building Depth / Building Length definitions; Appendix C, fetched 2026-09-29T14:45:16.969Z): "(100) Building Depth means the horizontal distance between the front yard setback required on a lot and the portion of the building's rear main wall furthest from the required front yard setback, measured along a line that is perpendicular to the front yard setback line. (105) Building Length means the horizontal distance between the portion of the front main wall of a building on a lot closest to the front lot line, and the portion of the rear main wall of the building closest to the rear lot line, measured along the lot centreline. If the main walls are not intersected by the lot centreline, the measurement is from the point on the lot centreline where a line drawn perpendicular to the lot centreline connects with the main wall."

> **W3 — §10.20.40.10(3)(A)-(C)** (RD maximum number of storeys; section-local extract, [ch10_20](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_20.htm), fetched 2026-09-29T14:45:17.303Z): "(3) Maximum Number of Storeys The permitted maximum number of storeys in a building on a lot in the RD zone is: (A) the numerical value following the letters "ST" on the Height Overlay Map; (B) if the lot is in an area with no numerical value following the letters "ST" on the Height Overlay Map, the number of storeys is not limited by this regulation; and (C) the permitted maximum number of storeys in a building on a lot in regulation (A) does not apply to a detached houseplex. [ By-law: 648-2025 ]"

> **W4 — §10.20.40.10(2) (lead-in)** (RD main-wall height; section-local extract, [ch10_20](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_20.htm), fetched 2026-09-29T14:45:17.303Z): "(2) Maximum Height of Specified Pairs of Main Walls In the RD zone, the permitted maximum height of the exterior portion of main walls for a permitted residential building is the higher of 7.0 metres above established grade or 2.5 metres less than the permitted maximum height in regulation 10.20.40.10(1)"

*Fields — EXISTING (as-built):* `front_setback`/`side_setback`/`rear_setback`/`side_count` intermediates from `RD: { front: 6.0, side: 0.9, rear: 7.5, flankage: 4.5, side_count: 2 }`, `bylaw_max_height_m`, `bylaw_max_fsi`, `bylaw_max_coverage_pct`, `on_policy_road`.  
*Fields — NEW:* NF-1, NF-2, NF-3, NF-5 (FALSE), NF-7, NF-9, NF-10, NF-11, NF-12, NF-13, NF-20..NF-23.

### Step 8 — Max build from setbacks + by-law caps (NF-17 setback-only footprint)
(i) What footprint do the setbacks and caps alone allow? (ii) **Plan as written: 151.05 m² (1625.9 ft²); pending F2: 135.15 m² (1454.7 ft²); as-built box (no caps): 159.48 m² (1716.6 ft²).**

| Term | Existing methodology (as-built code) | New approach (plan formulas as written) | Pending panel ruling (F1–F3 / data finding) |
| --- | --- | --- | --- |
| front / side × count / rear | 6.0 / 0.9 × 2 / 7.5 (flat `SETBACK_DEFAULTS.RD`) | NF-1 6.0 / NF-3 0.9 × 2 / NF-2 8.39 | F1: side keyed on required 9.0 → 0.9 (same) |
| width | `width_raw` = 9.75 − 2 × 0.9 = **7.95** (`ELSE frontage_m - side_count * side_setback END`) | EF-3 = MIN(9.75 − 2 × 0.9, NF-10 17.0) = **7.95** | F2: no length cap on the width axis → 7.95 |
| length | `length_raw` = 33.56 − 6.0 − 7.5 = **20.06** (`ELSE depth_m - front_setback - rear_setback END`) | raw 33.56 − 6.0 − 8.39 = 19.17; EF-4 = MIN(19.17, NF-11 19.0) = **19.00** | F2: MIN(19.17, NF-10 17.0, NF-11 19.0) = **17.00** |
| min-dimension floor (added) | both ≥ 3 m → kept (`CASE WHEN width_raw >= `…) | same floor | same |
| box | 7.95 × 20.06 = **159.48** | 7.95 × 19.00 = **151.05** | 7.95 × 17.00 = **135.15** |
| buffer (inset side × count / 2 = 0.9 m) | live PostGIS 252.48 (Q10); rectangle model (F − 1.8)(D − 1.8) = 252.49; ≥ 9 m² sliver floor → kept | same inset (NF-3 = 0.9) → 252.48 | same |
| setback-only footprint | not persisted (no NF-17 today) | NF-17 = LEAST(252.48, 151.05) = **151.05**, basis `depth_cap` | **135.15**, basis `length_cap` |

*Fields — EXISTING (as-built):* `width_raw`, `length_raw`, `box_area`, `buffer_area` (intermediates), `max_build_width_m`, `max_build_length_m`  
*Fields — NEW (NF-#/planned/user-input):* NF-17 `max_footprint_setback_sqm`; EF-3, EF-4  
*Provisions:* G1, G3, G4, G20 (step 7).

### Step 9 — Max build from coverage % (NF-18)
(i) What footprint does lot coverage allow? (ii) **114.49 m² (1232.4 ft²)** = 327.12 × 35 / 100. Not "unregulated": the overlay is mapped (step 4), so NF-18 is non-NULL. Branch W1(D) (houseplex or secondary suite, user input): 327.12 × 45 / 100 = 147.20 m² (1584.4 ft²).

| Term | Existing methodology (as-built code) | New approach (plan formulas as written) | Pending panel ruling (F1–F3 / data finding) |
| --- | --- | --- | --- |
| coverage % | COALESCE(35, median 33) = 35 (`AS coverage_cap`); `coverage_defaulted` false | NF-8 `overlay_mapped` → 35 | W1(D) 45 if houseplex / secondary suite (not in plan) |
| coverage footprint | `coverage_cap` = **114.49** | NF-18 = **114.49** | 147.20 (W1(D) branch) |

*Fields — EXISTING (as-built):* `bylaw_max_coverage_pct`, `coverage_cap` / `coverage_defaulted` (intermediates)  
*Fields — NEW (NF-#/planned/user-input):* NF-8, NF-18  
*Provision:* G7, W1 (step 4).

### Step 10 — Which limit binds (NF-19) and the headline footprint (EF-2)
(i) Which term decides? (ii) **Coverage binds under every reading: headline footprint 114.49 m² (1232.4 ft²)** (stored 114.49, Q7).

| Term | Existing methodology (as-built code) | New approach (plan formulas as written) | Pending panel ruling (F1–F3 / data finding) |
| --- | --- | --- | --- |
| footprint | LEAST(buffer 252.48, box 159.48, cov 114.49) = **114.49** (`ELSE LEAST(buffer_area, box_area, coverage_cap) END AS footprint_calc`) | EF-2 = LEAST(252.48, 151.05, 114.49) = **114.49** | F2: LEAST(252.48, 135.15, 114.49) = **114.49** |
| binding term | `coverage_cap` (implicit; no binding column today) | NF-19 = `coverage` (114.49 < 151.05) | `coverage` (114.49 < 135.15) |
| W1(D) branch (houseplex / secondary suite) | not modelled | LEAST(252.48, 151.05, 147.20) = 147.20 → `coverage` | LEAST(252.48, 135.15, 147.20) = 135.15 → **setback (length cap) binds** |
| `max_build_basis` | `rect_approx` (stored rect_approx) | unchanged | — |

*Fields — EXISTING (as-built):* `max_buildable_footprint_sqm`, `max_build_basis`  
*Fields — NEW (NF-#/planned/user-input):* NF-19 `max_footprint_binding`; EF-2  
*Rule:* code (`AS footprint_calc`); plan NF-19 / EF-2 rows (§3.4 / §3.5).

### Step 11 — Height → storeys (EF-5 / EF-6)
(i) How many storeys? (ii) **2** (stored 2, basis `pocket`, Q7).

| Term | Existing methodology (as-built code) | New approach (plan formulas as written) | Pending panel ruling (F1–F3 / data finding) |
| --- | --- | --- | --- |
| height | `bylaw_max_height_m` pass-through = 8.50 (`THEN bylaw_max_height_m END AS max_build_height_m`) | EF-5 = COALESCE(8.50, 10.0) = 8.50; NF-7 `overlay` | — |
| height-implied storeys | GREATEST(1, round(8.50 / 3)) = round(2.833) = **3** (`AS height_implied`) | same (EF-6 inherits EF-5) | — |
| storeys | ST NULL → LEAST(p50 2, 3) = **2**, basis `pocket` | EF-6 = **2**; EF-7 `pocket` | — |
| aggressive / hotspot (added) | `max_build_stories_aggressive` = p90 3; `market_exceeds_bylaw` = 3 > 3 → false | EF-12 same | — |

*Fields — EXISTING (as-built):* `bylaw_max_height_m`, `bylaw_max_stories` (NULL), `max_build_height_m`, `max_build_stories`, `max_build_stories_basis`, `max_build_stories_aggressive`, `market_exceeds_bylaw`  
*Fields — NEW (NF-#/planned/user-input):* NF-7 `bylaw_max_height_basis`; EF-5, EF-6, EF-7, EF-12  
*Provisions:* G6, W3 (step 7).

### Step 12 — GFA = LEAST(footprint × storeys, FSI cap) (EF-8)
(i) Maximum GFA? (ii) **As-built and plan-as-written: 228.98 m² (2464.7 ft²). By-law label FSI (data finding, pending panel ruling): 147.20 m² (1584.4 ft²).**

| Term | Existing methodology (as-built code) | New approach (plan formulas as written) | Pending panel ruling (F1–F3 / data finding) |
| --- | --- | --- | --- |
| FSI input | `bylaw_max_fsi` = NULL (Q4) → `fsi_cap` NULL (`CASE WHEN bylaw_max_fsi IS NOT NULL THEN round(lot_size_sqm * bylaw_max_fsi, 2) END AS fsi_cap`) | NF-9 = `unregulated` (keys on `bylaw_max_fsi`) | G8(A): label `d0.45` → FSI 0.45 (held in `bylaw_max_density` = 0.45, Q4) → cap 327.12 × 0.45 = **147.20**; NF-9 would be `zone_label_mapped` |
| GFA | LEAST(114.49 × 2 = 228.98, NULL) = **228.98**, basis `coverage_box` | EF-8 = **228.98** | LEAST(228.98, 147.20) = **147.20**, basis `fsi` (FSI 0.45) |
| W2(C) branch (houseplex / secondary suite) | — | — | FSI does not apply → GFA = footprint × 2: 294.40 (plan + W1(D)) or 270.30 (F2 + W1(D)) |

**Data finding (not in F1–F5).** Spec 58 maps CKAN `DENSITY` → `zoning_bylaw_areas.density_max` → `parcels.bylaw_max_density` and CKAN `FSI_TOTAL` → `fsi_max` → `bylaw_max_fsi` (`bylaw_max_fsi: 'fsi_max',` / `bylaw_max_density: 'density_max',`). On this parcel the label's `d0.45` is in `density_max`; `fsi_max` is NULL (Q5). Fleet-wide (Q14) 898 of 4926 RD/RS/RT/RM zone polygons carry a `d` value, 898 have `density_max`, 9 have `fsi_max`; on parcels (Q13) 120692 of 331684 have `bylaw_max_density` vs 1312 with `bylaw_max_fsi`. The as-built GFA and the plan's NF-9/EF-8 both read only `bylaw_max_fsi`, so the by-law FSI on this lot is not applied (228.98 m² = FSI 0.70 vs the label's 0.45). **Pending panel ruling** — reported, not fixed.

> **G8 — §10.20.40.40(1)(A)(B)** (RD floor space index; Appendix C, fetched 2026-09-29T14:45:17.303Z): "10.20.40.40 Floor Area (1) Floor Space Index In the RD zone, the permitted maximum floor space index is: (A) the numerical value following the letter "d" in the zone label on the Zoning By-law Map; or (B) if the zone label on the Zoning By-law Map does not include a "d" value on the Zoning By-law Map, the floor space index is not limited by this regulation; [ By-law: 1062-2025(OLT); 608-2024 ]"

> **W2 — §10.20.40.40(1)(C)(D)** (RD FSI — houseplex / secondary suite / major street exclusions; section-local extract, [ch10_20](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_20.htm), fetched 2026-09-29T14:45:17.303Z): "(C) the permitted maximum floor space index in regulation (A) and (B) above does not apply to a detached houseplex, or a residential building with a secondary suite; and [ By-law: 848-2025 ] (D) despite (A) to (B) above, the permitted maximum floor space index regulations do not apply to a townhouse or an apartment building with 60 dwelling units or less located on a lot abutting a major street. [ By-law: 66-2024; 1062-2025(OLT); 608-2024 ]"

*Fields — EXISTING (as-built):* `bylaw_max_fsi`, `bylaw_max_density`, `max_buildable_gfa_sqm`, `max_buildable_gfa_basis`  
*Fields — NEW (NF-#/planned/user-input):* NF-9 `bylaw_max_fsi_basis`; EF-8  


### W.12b Confidence and envelope constraint — **added — not in the original list**
| Term | Existing methodology (as-built code) | New approach (plan formulas as written) | Pending panel ruling (F1–F3 / data finding) |
| --- | --- | --- | --- |
| `max_build_confidence` | not ambiguous, not heritage, dims present; lot `high` but STAND_SET NULL → **medium** (`WHEN lot_size_confidence = 'high' AND setback_is_bylaw`) — stored medium | EF-9: same CASE (revision flagged, not prescribed) → medium | — |
| `envelope_constrained` / reason | no heritage, ravine, sub-floor or empty envelope → **false / NULL** (stored false / NULL) | EF-10: same CASE on the new inputs → false / NULL (19.00 and 7.95 clear 3.0 m) | same (17.00) |

### Step 13 — Landscaping outcome (NF-12 / NF-20 / NF-21 / NF-22) by driveway branch
(i) How much of the front and rear yard must be (soft) landscaping? (ii) Front yard at the required setback: 9.75 × 6.0 = 58.50 m² (629.7 ft²) (the real front yard runs to the front main wall — NF-6 unmeasured, so this is the *minimum* front yard). Rear yard at the required setback: plan 9.75 × 8.39 = 81.80 m² (880.5 ft²); as-built rear 7.5 → 73.13 m². Every front-yard row needs NF-15 ∈ L4 scope (detached house, semi-detached house, detached/semi-detached houseplex, townhouse); with `building_type` NULL, NF-22 and hence NF-20/NF-21 are **NULL** (plan NF-22 constraint).

| Field | `building_type` NULL (default) | `detached`, NF-26 = `none` | `detached`, NF-26 = `private` | `detached`, NF-26 = `shared` |
| --- | --- | --- | --- | --- |
| NF-22 tier | NULL | `tier_50pct` | `tier_50pct` | `tier_50pct` |
| NF-12 landscaping ≥ | 50 % (formula has no type gate) | 50 % = 29.25 m² | 50 % = 29.25 m² | 50 % |
| NF-20 soft ≥ | NULL | 75 % of front yard = 43.88 m² | 0.75 × 50 = 37.5 % = 21.94 m² | NULL — MORE RESEARCH REQUIRED (L27) |
| NF-21 hard ≤ (derived) | NULL | 25 % | 62.5 % − driveway % (driveway % = NF-27 / 9.75 × 100 for a full-depth driveway) | NULL |
| NF-23 driveway ≤ | NULL (L15 scope) | shown as "if a driveway is added": 6.0 m cap-only | LEAST(6.0, parking width) → 6.0 cap-only; compared with NF-27 | withheld — research |
| NF-27 / NF-28 | — | — | user input; not guessed | — |

*Derived bound (private branch, driveway assumed to run the full front-yard depth):* a driveway is not landscaping (L1), so NF-12's 50 % leaves at most 50 % of the front yard for it → width ≤ 4.88 m (16.01 ft) on this lot; NF-23's 6.0 m cap would leave 38.5 % landscaping, below the 50 % minimum. L6 binds before L15(C)(i) here.

| Term | Existing methodology (as-built code) | New approach (plan formulas as written) | Pending panel ruling (F1–F3 / data finding) |
| --- | --- | --- | --- |
| front landscaping | not modelled | NF-12 / NF-20 / NF-21 / NF-22 as above | — |
| rear soft | none; greenspace test `lot − existing − accessory ≥ 0.3 × lot` = 98.14 m² (KFM-9) | NF-13 = 50 % of rear yard = 40.90 m² (NF-24 50 % of the area behind the rear main walls if a garden suite is built) | — |
| corner side | — | NF-14 NULL (not a corner) | — |

> **L4 — §10.5.50.10(1)** (Appendix B): "(1) Front Yard Landscaping for Certain Types of Residential Buildings In the Residential Zone category, on a lot with a detached house, semi-detached house, detached houseplex, semi-detached houseplex or townhouse, the following front yard landscaping regulations apply:"

> **L6 — §10.5.50.10(1)(B)** (Appendix B): "(B) for lots with a lot frontage of 6.0 metres to less than 15.0 metres, or a townhouse dwelling unit at least 6.0 metres wide, a minimum of 50 percent of the front yard must be landscaping;"

> **L8 — §10.5.50.10(1)(D)** (Appendix B): "(D) a minimum of 75 percent of the front yard landscaping required in (A), (B), and (C) above, must be soft landscaping, and if a lot does not have a permitted driveway in the front yard, a minimum of 75 percent of the front yard must be soft landscaping. [ By-law: 648-2025 ]"

> **L1 — §800.50(395)** (Appendix B): "(395) Landscaping means an area used for trees, plants, decorative stonework, retaining walls, walkways, or other landscape or architectural elements. Driveways and areas for loading, parking or storing of vehicles are not landscaping."

> **L2 — §800.50(780)** (Appendix B): "(780) Soft Landscaping means landscaping excluding hard-surfaced areas such as decorative stonework, retaining walls, walkways, or other hard-surfaced landscape-architectural elements."

> **L10 — §10.5.50.10(3)(A)(B)** (Appendix B): "(3) Rear Yard Soft Landscaping for Residential Buildings Other Than an Apartment Building In the Residential Zone category, a lot with a residential building, other than an apartment building, must have: (A) a minimum of 50% of the rear yard for soft landscaping, if the lot frontage is greater than 6.0 metres; and (B) a minimum of 25% of the rear yard for soft landscaping, if the lot frontage is 6.0 metres or less."

> **L15 — §10.5.100.1(1)(A)-(D)** (Appendix B): "(1) Driveway Width in the Front Yard for Certain Residential Building Types In the Residential Zone category, in addition to meeting the landscaping requirements in regulation 10.5.50.10, for a detached house, semi-detached house, or duplex, and for an individual townhouse dwelling unit if an individual private driveway leads directly to the dwelling unit, a driveway that is in the front yard or passes through the front yard may have the following dimensions in the front yard: (A) a minimum width of 2.0 metres; (B) for lots with a lot frontage less than 6.0 metres, or a townhouse dwelling unit less than 6.0 metres wide, a maximum width of 2.6 metres; (C) for lots with a lot frontage of 6.0 metres to 23.0 metres inclusive, or a townhouse dwelling unit at least 6.0 metres wide, a maximum driveway width the lesser of: (i) 6.0 metres; (ii) the cumulative width of side-by-side parking spaces behind the front main wall, but not in the rear yard; or (iii) the width of a single parking spaces behind the front main wall, but not in the rear yard; or (iv) 2.6 metres if all parking spaces are in the rear yard; and (D) for lots with a lot frontage greater than 23.0 metres, a maximum driveway width the lesser of: (i) 9.0 metres; (ii) the cumulative width of side-by-side parking spaces behind the front main wall if there is at least one parking space behind the front main wall but not in the rear yard; or (iii) 2.6 metres if all parking spaces are in the rear yard."

> **L20 — §150.7.50.10(1)(A)(B)** (Appendix B): "(1) Landscaping Requirements for a Garden Suite Despite regulation 10.5.50.10(3), for a lot with a residential building and an ancillary building containing a garden suite: (A) with a lot frontage of greater than 6.0 metres, a minimum of 50 percent of the area: (i) between all rear main walls of the residential building on the lot and the rear lot line, and (ii) extending parallel to the rear lot line across the full width of the lot from the point where the rear main wall of the residential building meets the residential building's side main walls closest to the respective side lot lines, must be for soft landscaping; (B) with a lot frontage of 6.0 metres or less, a minimum of 25 percent of the area: (i) between all rear main walls of the residential building on the lot and the rear lot line, and (ii) extending parallel to the rear lot line across the full width of the lot from the point where the rear main wall of the residential building meets the residential building's side main walls closest to the respective side lot lines, must be for soft landscaping. [ By-law: 101-2022 ]"

*Fields — EXISTING (as-built):* none (as-built has no landscaping field; `garage_permission` / `rear_suite_permission` use the 30 %-of-lot greenspace test)  
*Fields — NEW (NF-#/planned/user-input):* NF-12, NF-13, NF-14, NF-20, NF-21, NF-22, NF-23, NF-24; user inputs NF-15, NF-26, NF-27, NF-28  


### W.13b Accessory fit (garden suite, garage) — **added — not in the original list**
| Term | Existing methodology (as-built code) | New approach (plan formulas as written) | Pending panel ruling (F1–F3 / data finding) |
| --- | --- | --- | --- |
| rear-yard depth term | `depth − front − rear` = 20.06 (`GREATEST(0, depth_m - front_setback - rear_setback) AS rear_yard_depth`) — note: this is the envelope length, not the 7.5 m rear yard | EF-13: 33.56 − 6.0 − 8.39 = 19.17 | — |
| rear-yard area | 20.06 × 7.95 − 84.29 = 75.19 | 19.17 × 7.95 − 84.29 = 68.11 | — |
| garden suite | lot 327.12 ≥ 270 ∧ 20.06 ≥ 5 → fits, 60 m²; permission `as_of_right` | EF-13: 19.17 ≥ 5 → fits, 60 m² (unchanged) | — |
| garage | LEAST(60, 0.3 × 75.19) = **22.56** ≥ 18.5 → 1 car; permission `as_of_right` | EF-17: LEAST(60, 0.3 × 68.11) = **20.43** → 1 car; `as_of_right` | — |
| laneway suite | `abuts_laneway` false → NULL | EF-14 NULL | — |

### Step 14 — Summary

| Field | AS-BUILT stored (Q7) | AS-BUILT recomputed | PLANNED (plan formulas) | Delta (planned − as-built) | Pending panel ruling |
| --- | --- | --- | --- | --- | --- |
| `lot_size_confidence` | high | high | high (unchanged) | — | — |
| front / side / rear setback (m) | — (not persisted) | 6.0 / 0.9 / 7.5 | 6.0 / 0.9 / 8.39 | rear +0.89 | F1: same |
| `max_build_width_m` | 7.95 | 7.95 | 7.95 | 0 | F2: 7.95 |
| `max_build_length_m` | 20.06 | 20.06 | 19.00 | -1.06 | F2: 17.00 |
| box / NF-17 (m²) | — (not persisted) | 159.48 | 151.05 | -8.43 | F2: 135.15 |
| coverage cap / NF-18 (m²) | — (not persisted) | 114.49 | 114.49 | 0 | W1(D): 147.20 |
| NF-19 binding | — | (coverage_cap) | coverage | — | coverage; W1(D)+F2: setback |
| `max_buildable_footprint_sqm` | 114.49 | 114.49 | 114.49 | 0 | F2: 114.49; W1(D): 147.20 / F2 135.15 |
| `max_build_height_m` | 8.50 | 8.50 | 8.50 | 0 | — |
| `max_build_stories` | 2 | 2 | 2 | 0 | — |
| `max_buildable_gfa_sqm` | 228.98 | 228.98 | 228.98 | 0 | label FSI 0.45: **147.20** (−81.78) |
| `max_buildable_gfa_basis` | coverage_box | coverage_box | coverage_box | — | fsi |
| `max_build_confidence` | medium | medium | medium | — | — |
| `envelope_constrained` | false | false | false | — | — |
| `max_garage_gfa_sqm` / cars | 22.56 / 1 | 22.56 / 1 | 20.43 / 1 | -2.13 | — |
| `garden_suite_fits` / GFA | true / 60.00 | true / 60.00 | true / 60.00 | 0 | — |
| `max_newbuild_coa_gfa_sqm` (Pass 3) | 240.43 | 240.43 | 240.43 | 0 | label FSI: 154.56 |
| `max_build_fsi` (Spec 88) | 0.700 | 0.700 | 0.700 | 0 | 0.450 |
| NF-8 / NF-9 | — | — | `overlay_mapped` / `unregulated` | — | NF-9 `zone_label_mapped` |
| NF-12 / NF-13 / NF-20 | — | — | 50 / 50 / NULL (type NULL) · 75 (none) · 37.5 (private) | — | — |
| `opt_aor_gfa_sqm` / `opt_coa_gfa_sqm` (Spec 78, stored only) | 228.98 / 343.47 | not recomputed | EF-19/EF-20 inherit | — | — |

**Reading.** On this lot the plan changes the *intermediate* envelope (rear 7.5 → 8.39 m; length 20.06 → 19.00 m, or 17.00 m under F2; setback box 159.48 → 151.05 m²) but **not the headline**: the mapped 35 % coverage (114.49 m²) binds under the as-built code, the plan and F2 alike. The garage shrinks 22.56 → 20.43 m² (still one car). The only headline change the by-law text supports here is the **FSI**: the label's d0.45 caps GFA at 147.20 m² (1584.4 ft²), which neither the as-built code nor the plan reads (step 12 finding). A houseplex or secondary suite (user input) flips both: coverage rises to 45 % (W1(D)) and FSI stops applying (W2(C)).

### Houseplex / secondary suite — both answers (NF-15 / NF-29 → NF-30..NF-32) — appended 2026-09-29
(i) Does MaxBuild change if the building is a detached houseplex or has a secondary suite, and what does the report show? (ii) **Yes.** The report shows both answers: the base fields (EF-2 / EF-8, detached-house rules, meaning unchanged) and the paired NF-30 / NF-31 / NF-32 (houseplex / suite rules, always computed). On this lot the overlay value 35 % is under 45 %, so the suite answer uses **45 % = 147.20 m² (1584.4 ft²)** (H7) and **no FSI cap** (H8).

| Term | Detached house — base fields | Houseplex / secondary suite — NF-30..NF-32 | Rule |
| --- | --- | --- | --- |
| coverage % | 35 (G7(A)) | 45 (overlay value 35 < 45) | G7, H7 |
| coverage allowance (m²) | 114.49 | 147.20 | H7 — covers all buildings and structures (H4) |
| setback envelope NF-17 (m²) | 151.05 (plan) · 135.15 (F2) | same | G1, G3, G4, G20 |
| footprint | EF-2 = **114.49** (plan and F2) | NF-30 = **147.20** (plan) · **135.15** (F2) | — |
| binding limit | NF-19 = `coverage` (plan and F2) | NF-32 = `coverage` (plan) · `setback` (F2 — the length cap binds) | — |
| height / storeys | 8.50 m → 2 storeys | suite: same · detached houseplex: max(8.50, 10.0) = 10.00 m (H15) → LEAST(p50 2, 3) = 2 storeys — unchanged; ST not applicable either way (H16) | G6, H15, H16 |
| houseplex deep-lot length/depth 19.0 m | — | not applicable: depth 33.56 m < 36.0 m (H17/H18 (A)); not applied in NF-30 anyway (research) | H17, H18 |
| GFA — as built / plan as written (label FSI unread) | EF-8 = 228.98 | NF-31 = **294.40** (plan) · **270.30** (F2) | — |
| GFA — label FSI 0.45 read (data-gap fix) | LEAST(228.98, 147.20) = **147.20** | no FSI cap (H8) → **294.40** · **270.30** | G8, H8 |

**Rationale.** The houseplex / suite fact is a user input (NF-15 `building_type = 'houseplex'`, NF-29 `has_secondary_suite`) because no column holds it, and it moves the answer twice: coverage rises from 35 % to 45 % (footprint 114.49 → 147.20 m², or 135.15 m² where the front-to-rear length cap then binds), and the label FSI stops applying (GFA 147.20 m² → 294.40 / 270.30 m²). A house with a secondary suite is not a houseplex (H1(F)), so the suite is its own flag.

*Fields — EXISTING (as-built):* `max_buildable_footprint_sqm`, `max_buildable_gfa_sqm` (base; detached-house rules; meaning unchanged)  
*Fields — NEW (NF-#/planned/user-input):* NF-15 `building_type` (value `houseplex`), NF-29 `has_secondary_suite` (user input); NF-30 `max_buildable_footprint_suite_sqm`, NF-31 `max_buildable_gfa_suite_sqm`, NF-32 `max_buildable_suite_binding`  
*Provisions:*

> **H1 — §800.50(181)** (Detached Houseplex (definition); Appendix E, fetched 2026-09-29T14:45:16.969Z): "(181) Detached Houseplex means a building that has multiple dwelling units, and where: (A) the building has no more than four dwelling units; (B) the building is situated entirely on one lot; (C) the building is not attached to a building on an abutting lot; and (D) at least one dwelling unit is entirely or partially above another. (E) Detached houseplex includes the following types of building: a duplex, triplex or fourplex that complies with (A) to (D) above. (F) A detached house, semi-detached house or townhouse that has one or more secondary suites is not a detached houseplex. [ By-law: 648-2025 ]"

> **H3 — §800.50(735)** (Secondary Suite (definition); Appendix E, fetched 2026-09-29T14:45:16.969Z): "(735) Secondary Suite means self-contained living accommodation for an additional person or persons living together as a separate single housekeeping unit, in which both food preparation and sanitary facilities are provided for the exclusive use of the occupants of the suite, located in and subordinate to a dwelling unit."

> **H4 — §800.50(435)** (Lot Coverage (definition); Appendix E, fetched 2026-09-29T14:45:16.969Z): "(435) Lot Coverage means the portion of the lot that is covered by any part of any building or structure on or above the surface of the lot."

> **H7 — §10.20.30.40(1)(D)** (RD lot coverage 45 % — houseplex / secondary suite; Appendix E, fetched 2026-09-29T14:45:17.303Z): "(D) Despite (A) above, if the numerical value on the Lot Coverage Overlay Map is less than 45 percent and the lot contains a detached houseplex or a residential building with a secondary suite, the maximum lot coverage for all buildings and structures on the lot is 45 percent;"

> **H8 — §10.20.40.40(1)(C)** (RD FSI not applied — houseplex / secondary suite; Appendix E, fetched 2026-09-29T14:45:17.303Z): "(C) the permitted maximum floor space index in regulation (A) and (B) above does not apply to a detached houseplex, or a residential building with a secondary suite; and [ By-law: 848-2025 ]"

> **H15 — §10.20.40.10(1)(C)** (RD height — detached houseplex; Appendix E, fetched 2026-09-29T14:45:17.303Z): "(C) despite (A) above, the permitted maximum height for a detached houseplex is the greater of: (i) the numerical value, in metres, following the letters "HT" on the Height Overlay Map; or (ii) 10.0 metres; and [ By-law: 648-2025 ]"

> **H16 — §10.20.40.10(3)(C)** (RD storeys — detached houseplex; Appendix E, fetched 2026-09-29T14:45:17.303Z): "(C) the permitted maximum number of storeys in a building on a lot in regulation (A) does not apply to a detached houseplex. [ By-law: 648-2025 ]"

> **H17 — §10.20.40.20(3)** (RD building length 19.0 m — detached houseplex on a deep lot; Appendix E, fetched 2026-09-29T14:45:17.303Z): "(3) Maximum Building Length for a Detached Houseplex if Lot Frontage and Lot Depth is in Specified Range Despite regulation 10.20.40.20(1), in the RD zone, a detached houseplex may have a permitted maximum building length of 19.0 metres if the lot: (A) has a lot depth of 36.0 metres or greater and a lot frontage of less than 10.0 metres; or (B) has a lot depth of 40.0 metres or greater and a lot frontage of 10.0 metres or greater. [ By-law: 648-2025 ]"

### Does landscaping change MaxBuild? — appended 2026-09-29
(i) Do the landscaping rules cap the main house? (ii) **No — main-house MaxBuild is unaffected** (EF-2 114.49 m², EF-8, NF-30, NF-31 unchanged). Front-yard landscaping (L4–L8) is a share of the front yard, the area in front of the front main walls (H5), which sit at or behind the 6.0 m setback; rear soft landscaping (L10) is a share of the rear yard, the area behind the rear main walls (H6). Both are percentages of whatever yard the house leaves. **They bite on the driveway and on ancillary buildings:**

| Outcome | Affected? | This lot (house assumed at the 6.0 m front setback; driveway full front-yard depth) | Rule |
| --- | --- | --- | --- |
| main house footprint / GFA | no | EF-2 114.49, NF-30 147.20 m² — landscaping enters neither formula | H5, H6, L4, L10 |
| front driveway / paving | **yes** | front yard 9.75 × 6.0 = 58.50 m²; the 50 % landscaping minimum (L6) and "Driveways and areas for loading, parking or storing of vehicles are not landscaping" (L1) cap a full-depth driveway at 4.88 m — below the NF-23 cap 6.0 m (L15) | L1, L6, L15 |
| garden suite — house length 19.00 m (planned max length (EF-4)) | **yes** | area behind the house 33.56 − 6.0 − 19.00 = 8.56 m × 9.75 = 83.46 m²; 50 % soft (L20) → suite footprint ≤ **41.73 m²** vs the 60 m² the model offers → does not fit as of right | L20 |
| garden suite — house length 17.00 m (F2 length cap) | **yes** | area behind the house 33.56 − 6.0 − 17.00 = 10.56 m × 9.75 = 102.96 m²; 50 % soft (L20) → suite footprint ≤ **51.48 m²** vs the 60 m² the model offers → does not fit as of right | L20 |
| garden suite — house length 20.06 m (as-built envelope length) | **yes** | area behind the house 33.56 − 6.0 − 20.06 = 7.50 m × 9.75 = 73.13 m²; 50 % soft (L20) → suite footprint ≤ **36.57 m²** vs the 60 m² the model offers → does not fit as of right | L20 |
| garden suite — house length 14.40 m (coverage-bound house, full width 7.95 m (114.49 / 7.95)) | no | area behind the house 33.56 − 6.0 − 14.40 = 13.16 m × 9.75 = 128.31 m²; 50 % soft (L20) → suite footprint ≤ **64.16 m²** vs the 60 m² the model offers → fits | L20 |
| garage (no garden suite) | no | rear-yard soft 50 % (L10) of 83.46 m² leaves 41.73 m² for a garage and paving; garage 22.56 (as-built) / 20.43 m² (planned) fits | L10 |
| garage + garden suite together | **yes** | L20 replaces L10 ("Despite regulation 10.5.50.10(3)"); suite 60 + garage 22.56 = 82.56 m² > 41.73 m² at the planned length | L20 |
| laneway suite | n/a | `abuts_laneway` false | L21 |

**As-built code path.** The accessory fit never applies L10/L20. It sizes the garage from `rear_yard_area` (`AS rear_yard_area`; `::numeric * a.rear_yard_area`) and grants `garage_permission` / `rear_suite_permission` when the remaining greenspace is at least `min_soft_landscaping_pct` = 0.3 of the lot (`* lot_size_sqm THEN 'as_of_right' ELSE 'coa_required' END AS garage_permission`; `AS rear_suite_permission`): 327.12 − 84.29 − 22.56 = 220.27 ≥ 98.14 → `as_of_right`; 327.12 − 84.29 − 60 = 182.83 ≥ 98.14 → `as_of_right` (KFM-9). **Conclusion (41 Derwyn Rd):** main-house MaxBuild unaffected; driveway width and garden-suite size (and garage + suite together) are affected — a 60 m² garden suite behind a house built to the planned 19.0 m depth is not as of right under L20.

> **H5 — §800.50(285)** (Front Yard (definition); Appendix E, fetched 2026-09-29T14:45:16.969Z): "(285) Front Yard means the area on a lot, (A) between the front lot line and all front main walls of the building, and (B) extending parallel to the front lot line across the full width of the lot from the point where the front main wall of the building meets the building's side main walls closest to the respective side lot lines."

> **H6 — §800.50(650)** (Rear Yard (definition); Appendix E, fetched 2026-09-29T14:45:16.969Z): "(650) Rear Yard means the area on a lot, (A) between the rear lot line and all rear main walls of the building, and (B) extending parallel to the rear lot line across the full width of the lot from the point where the rear main wall of the building meets the building's side main walls closest to the respective side lot lines."

> **L10 — §10.5.50.10(3)(A)(B)** (Appendix B): "(3) Rear Yard Soft Landscaping for Residential Buildings Other Than an Apartment Building In the Residential Zone category, a lot with a residential building, other than an apartment building, must have: (A) a minimum of 50% of the rear yard for soft landscaping, if the lot frontage is greater than 6.0 metres; and (B) a minimum of 25% of the rear yard for soft landscaping, if the lot frontage is 6.0 metres or less."

> **L20 — §150.7.50.10(1)(A)(B)** (Appendix B): "(1) Landscaping Requirements for a Garden Suite Despite regulation 10.5.50.10(3), for a lot with a residential building and an ancillary building containing a garden suite: (A) with a lot frontage of greater than 6.0 metres, a minimum of 50 percent of the area: (i) between all rear main walls of the residential building on the lot and the rear lot line, and (ii) extending parallel to the rear lot line across the full width of the lot from the point where the rear main wall of the residential building meets the residential building's side main walls closest to the respective side lot lines, must be for soft landscaping; (B) with a lot frontage of 6.0 metres or less, a minimum of 25 percent of the area: (i) between all rear main walls of the residential building on the lot and the rear lot line, and (ii) extending parallel to the rear lot line across the full width of the lot from the point where the rear main wall of the residential building meets the residential building's side main walls closest to the respective side lot lines, must be for soft landscaping. [ By-law: 101-2022 ]"

## Worked example — 64 Eastbourne Crescent (no coverage overlay: old vs new)

> **Status:** as for the 41 Derwyn Rd example — AS-BUILT read from the local dev DB (read-only snapshot, captured 2026-09-29T16:08:23.486Z, `spec67-gen/ex2-capture.js`, SELECT only) and recomputed from the `buildMaxBuildSql` formulas: **all 27 recomputed as-built values equal the stored values**. PLANNED = the plan's formulas as written; F1/F2 columns = findings pending panel ruling. **The contrast this lot shows:** it has **no Lot Coverage Overlay value**, so as-built fills coverage with the zone median (`COVERAGE_DEFAULTS.RD` = 33 %) and that median decides the footprint; the planned approach treats coverage as unregulated (NF-8 `unregulated`, NF-18 NULL) so the setbacks and length/depth caps (NF-17) decide — unless research item R1 keeps the median inside EF-2.

### X.0 Parcel selection and data snapshot
**Selection query (Q1)** — RD, `bylaw_max_coverage_pct IS NULL`, regular, not ravine / heritage / corner / through / laneway, lot confidence high, one unambiguous zone polygon, no STAND_SET / exception / holding, frontage 9–15 m, a `d` value and a height overlay present, exactly one linked (primary) building; ordered by closeness to a 12 m × 36 m lot. The population it samples (Q1b): 19285 regular RD lots without a coverage value, median 11.31 m × 36.72 m. **Chosen: id 190819, 64 Eastbourne Cres** — the closest candidate whose stored envelope reproduces. Skipped: id 352604 (80 Second St) — stored `max_build_length_m` 22.42 ≠ recomputed 22.43 (depth − 6.0 − 7.5), a stale row, not investigated here. Q2: two address points match "64 Eastbourne"; only "64 Eastbourne Cres" lies inside the parcel.

| Q | SQL (as executed) | Result |
| --- | --- | --- |
| Q1 | `SELECT p.id, p.address_number, p.linear_name_full, p.frontage_m, p.depth_m, p.lot_size_sqm, p.zoning_zn_string, p.bylaw_max_height_m, p.bylaw_max_density, p.bylaw_min_frontage_m, (p.depth_m - 6 - 7.5) AS recomputed_length_m, p.max_build_length_m FROM parcels p WHERE p.zoning_class = 'RD' AND p.bylaw_max_coverage_pct IS NULL AND p.is_irregular = false AND NOT COALESCE(p.is_in_ravine_protection_area, false) AND NOT COALESCE(p.is_heritage_designated, false) AND NOT COALESCE(p.is_corner_lot, false) AND NOT COALESCE(p.is_through_lot, false) AND NOT COALESCE(p.abuts_laneway, false) AND p.lot_size_confidence = 'high' AND NOT COALESCE(p.zoning_is_ambiguous, false) AND p.bylaw_standard_setback_m IS NULL AND p.exception_number IS NULL AND p.zoning_holding = 'N' AND p.frontage_m BETWEEN 9 AND 15 AND p.address_number IS NOT NULL AND p.bylaw_max_density IS NOT NULL AND p.bylaw_max_height_m IS NOT NULL AND p.max_buildable_footprint_sqm IS NOT NULL AND EXISTS (SELECT 1 FROM parcel_buildings pb WHERE pb.parcel_id = p.id AND pb.is_primary) AND (SELECT count(*) FROM parcel_buildings pb WHERE pb.parcel_id = p.id) = 1 ORDER BY abs(p.frontage_m - 12.0) + abs(p.depth_m - 36.0) / 3, p.id LIMIT 5` | `[{"id":352604,"address_number":"80","linear_name_full":"Second St","frontage_m":"12.02","depth_m":"35.93","lot_size_sqm":"431.72","zoning_zn_string":"RD (f7.5; a230; d0.4)","bylaw_max_height_m":"9.50","bylaw_max_density":"0.40","bylaw_min_frontage_m":"7.50","recomputed_length_m":"22.43","max_build_length_m":"22.42"},{"id":190819,"address_number":"64","linear_name_full":"Eastbourne Cres","frontage_m":"12.14","depth_m":"35.88","lot_size_sqm":"435.53","zoning_zn_string":"RD (f10.5; a325; d0.4)","bylaw_max_height_m":"9.50","bylaw_max_density":"0.40","bylaw_min_frontage_m":"10.50","recomputed_length_m":"22.38","max_build_length_m":"22.38"},{"id":28687,"address_number":"3763-3765","linear_name_full":"Lake Shore Blvd W","frontage_m":"12.13","depth_m":"36.24","lot_size_sqm":"439.63","zoning_zn_string":"RD (f12.0; a370; d0.35)","bylaw_max_height_m":"9.50","bylaw_max_density":"0.35","bylaw_min_frontage_m":"12.00","recomputed_length_m":"22.74","max_build_length_m":"22.74"},{"id":26007,"address_number":"40","linear_name_full":"Ellins Ave","frontage_m":"12.10","depth_m":"35.63","lot_size_sqm":"431.25","zoning_zn_string":"RD (f12.0; a370; d0.4)","bylaw_max_height_m":"11.00","bylaw_max_density":"0.40","bylaw_min_frontage_m":"12.00","recomputed_length_m":"22.13","max_build_length_m":"22.13"},{"id":97847,"address_number":"62","linear_name_full":"Eastbourne Cres","frontage_m":"11.94","depth_m":"35.47","lot_size_sqm":"423.64","zoning_zn_string":"RD (f10.5; a325; d0.4)","bylaw_max_height_m":"9.50","bylaw_max_density":"0.40","bylaw_min_frontage_m":"10.50","recomputed_length_m":"21.97","max_build_length_m":"21.97"}]` |
| Q1b | `SELECT count(*) AS rd_unmapped_regular, percentile_cont(0.5) WITHIN GROUP (ORDER BY frontage_m) AS frontage_p50, percentile_cont(0.5) WITHIN GROUP (ORDER BY depth_m) AS depth_p50 FROM parcels WHERE zoning_class = 'RD' AND bylaw_max_coverage_pct IS NULL AND is_irregular = false` | `{"rd_unmapped_regular":"19285","frontage_p50":11.31,"depth_p50":36.72}` |
| Q2 | `SELECT ap.address_point_id, ap.address_full, ap.address_class_desc, ST_Contains(p.geom, ap.geom) AS inside_parcel_190819 FROM address_points ap, parcels p WHERE p.id = 190819 AND ap.address_number = '64' AND ap.linear_name_full ILIKE 'EASTBOURNE%'` | `[{"address_point_id":8344892,"address_full":"64 Eastbourne Ave","address_class_desc":"Land","inside_parcel_190819":false},{"address_point_id":997839,"address_full":"64 Eastbourne Cres","address_class_desc":"Land","inside_parcel_190819":true}]` |
| Q3 | `SELECT lot_size_sqm, lot_size_sqft, frontage_m, frontage_ft, depth_m, depth_ft, is_irregular, stated_area_raw, lot_size_source, round(ST_Area(geom::geography)::numeric, 2) AS geom_area_sqm, ST_NPoints(geom) AS geom_npoints, is_in_ravine_protection_area, round(ravine_distance_m::numeric, 1) AS ravine_distance_m, is_heritage_designated, heritage_designation_type, is_corner_lot, is_through_lot, abuts_laneway, primary_frontage_street_name, neighbourhood_id FROM parcels WHERE id = 190819` | `{"lot_size_sqm":"435.53","lot_size_sqft":"4688.00","frontage_m":"12.14","frontage_ft":"39.83","depth_m":"35.88","depth_ft":"117.72","is_irregular":false,"stated_area_raw":"435.53 sq.m","lot_size_source":"stated","geom_area_sqm":"435.61","geom_npoints":5,"is_in_ravine_protection_area":false,"ravine_distance_m":"593.6","is_heritage_designated":false,"heritage_designation_type":null,"is_corner_lot":false,"is_through_lot":false,"abuts_laneway":false,"primary_frontage_street_name":"Eastbourne Cres","neighbourhood_id":46}` |
| Q4 | `SELECT zoning_class, zoning_zn_string, zoning_holding, zone_status, zoning_is_ambiguous, zoning_dominant_area_share, zoning_base_source_id, exception_number, exception_text, bylaw_standard_setback_m, bylaw_min_frontage_m, bylaw_min_area_sqm, bylaw_max_coverage_pct, bylaw_max_height_m, bylaw_max_stories, bylaw_max_fsi, bylaw_max_density, bylaw_max_units, on_policy_road, in_policy_area, on_priority_retail, in_building_setback_overlay, zoning_overlays FROM parcels WHERE id = 190819` | `{"zoning_class":"RD","zoning_zn_string":"RD (f10.5; a325; d0.4)","zoning_holding":"N","zone_status":3,"zoning_is_ambiguous":false,"zoning_dominant_area_share":"1.0000","zoning_base_source_id":11223,"exception_number":null,"exception_text":"N","bylaw_standard_setback_m":null,"bylaw_min_frontage_m":"10.50","bylaw_min_area_sqm":325,"bylaw_max_coverage_pct":null,"bylaw_max_height_m":"9.50","bylaw_max_stories":null,"bylaw_max_fsi":null,"bylaw_max_density":"0.40","bylaw_max_units":null,"on_policy_road":false,"in_policy_area":false,"on_priority_retail":false,"in_building_setback_overlay":false,"zoning_overlays":{"base":[{"zn_zone":"RD","source_id":11223,"area_share":1}],"height_overlay":{"applied":true,"height_max_m":9.5}}}` |
| Q5 | `SELECT source_id, zn_zone, zn_string, frontage_min_m, area_min_sqm, density_max, fsi_max, coverage_max_pct, standard_setback, exception_number FROM zoning_bylaw_areas WHERE source_id = (SELECT zoning_base_source_id FROM parcels WHERE id = 190819)` | `{"source_id":11223,"zn_zone":"RD","zn_string":"RD (f10.5; a325; d0.4)","frontage_min_m":"10.50","area_min_sqm":325,"density_max":"0.40","fsi_max":null,"coverage_max_pct":null,"standard_setback":null,"exception_number":null}` |
| Q6 | `SELECT (SELECT json_agg(json_build_object('source_id', h.source_id, 'ht_string', h.ht_string, 'height_max_m', h.height_max_m, 'ht_stories', h.ht_stories)) FROM zoning_height_overlay h WHERE ST_Intersects(h.geom, p.geom)) AS height_overlay, (SELECT json_agg(json_build_object('source_id', c.source_id, 'coverage_max_pct_override', c.coverage_max_pct_override, 'area_share', round((ST_Area(ST_Intersection(c.geom, p.geom)::geography) / ST_Area(p.geom::geography))::numeric, 4))) FROM zoning_lot_coverage_overlay c WHERE ST_Intersects(c.geom, p.geom)) AS coverage_overlay FROM parcels p WHERE p.id = 190819` | `{"height_overlay":[{"source_id":2498,"ht_string":"HT 9.5","height_max_m":9.5,"ht_stories":null}],"coverage_overlay":null}` |
| Q7 | `SELECT lot_size_confidence, lot_size_basis, max_build_setback_basis, max_buildable_footprint_sqm, max_build_width_m, max_build_length_m, max_build_height_m, max_build_stories, max_build_stories_basis, max_build_stories_aggressive, market_exceeds_bylaw, max_build_basis, max_buildable_gfa_sqm, max_buildable_gfa_basis, max_build_confidence, envelope_constrained, envelope_constraint_reason, garden_suite_fits, max_garden_suite_gfa_sqm, max_laneway_suite_gfa_sqm, rear_suite_type, max_rear_suite_gfa_sqm, rear_suite_permission, max_garage_gfa_sqm, garage_capacity_cars, garage_constraint_reason, garage_permission, neighbourhood_cost_premium, max_newbuild_coa_gfa_sqm, max_build_fsi, opt_aor_gfa_sqm, opt_aor_storeys, opt_coa_gfa_sqm, opt_coa_storeys, opt_binding_constraint FROM parcels WHERE id = 190819` | `{"lot_size_confidence":"high","lot_size_basis":"3way","max_build_setback_basis":"zone_default","max_buildable_footprint_sqm":"143.72","max_build_width_m":"10.34","max_build_length_m":"22.38","max_build_height_m":"9.50","max_build_stories":2,"max_build_stories_basis":"pocket","max_build_stories_aggressive":3,"market_exceeds_bylaw":false,"max_build_basis":"rect_approx","max_buildable_gfa_sqm":"287.44","max_buildable_gfa_basis":"coverage_box","max_build_confidence":"medium","envelope_constrained":false,"envelope_constraint_reason":null,"garden_suite_fits":true,"max_garden_suite_gfa_sqm":"60.00","max_laneway_suite_gfa_sqm":null,"rear_suite_type":"garden","max_rear_suite_gfa_sqm":"60.00","rear_suite_permission":"as_of_right","max_garage_gfa_sqm":"31.40","garage_capacity_cars":1,"garage_constraint_reason":null,"garage_permission":"as_of_right","neighbourhood_cost_premium":"1.35","max_newbuild_coa_gfa_sqm":"301.81","max_build_fsi":"0.660","opt_aor_gfa_sqm":"287.44","opt_aor_storeys":2,"opt_coa_gfa_sqm":"431.16","opt_coa_storeys":3,"opt_binding_constraint":"coverage"}` |
| Q8 | `SELECT imagery_roof_footprint_sqm, existing_width_m, existing_length_m, existing_structure_confidence, existing_other_structures_count, existing_other_structures_sqm, existing_greenspace_sqm, existing_stories, existing_height_m FROM parcels WHERE id = 190819` | `{"imagery_roof_footprint_sqm":"126.74","existing_width_m":"7.76","existing_length_m":"17.10","existing_structure_confidence":"high","existing_other_structures_count":0,"existing_other_structures_sqm":"0.00","existing_greenspace_sqm":"308.79","existing_stories":null,"existing_height_m":null}` |
| Q9 | `SELECT pb.building_id, pb.is_primary, pb.match_type, pb.confidence, bf.footprint_area_sqm, bf.max_height_m FROM parcel_buildings pb JOIN building_footprints bf ON bf.id = pb.building_id WHERE pb.parcel_id = 190819` | `{"building_id":471464,"is_primary":true,"match_type":"centroid_in_parcel","confidence":"0.95","footprint_area_sqm":"126.74","max_height_m":"13.36"}` |
| Q10 | `SELECT round(ST_Area(ST_Buffer(geom::geography, -(0.9 * 2 / 2.0)))::numeric, 2) AS buffer_area_side_0_9, round(ST_Area(ST_Buffer(geom::geography, -(1.2 * 2 / 2.0)))::numeric, 2) AS buffer_area_side_1_2 FROM parcels WHERE id = 190819` | `{"buffer_area_side_0_9":"352.57","buffer_area_side_1_2":"326.33"}` |
| Q11 | `SELECT n.id AS neighbourhood_id, n.name, nsn.storeys_p50, nsn.storeys_p90, nsn.sample_count FROM neighbourhoods n LEFT JOIN neighbourhood_storey_norms nsn ON nsn.neighbourhood_id = n.id, parcels p WHERE p.id = 190819 AND ST_Contains(n.geom, ST_Centroid(p.geom)) ORDER BY n.id LIMIT 1` | `{"neighbourhood_id":46,"name":"Mimico-Queensway","storeys_p50":2,"storeys_p90":3,"sample_count":78}` |
| Q12 | `SELECT variable_key, variable_value FROM logic_variables WHERE variable_key IN ('storey_height_m','max_build_min_dimension_m','max_build_lot_min_sqm','max_build_lot_max_sqm','mislink_footprint_lot_tol','min_soft_landscaping_pct','garden_suite_min_lot_sqm','garden_suite_min_rear_yard_m','garden_suite_max_gfa_sqm','garden_suite_storeys','garage_min_lot_sqm','garage_max_gfa_sqm','garage_min_footprint_sqm','accessory_max_coverage_pct','car_footprint_sqm','reno_coa_uplift_pct','road_overlay_distance_m') ORDER BY variable_key` | `[{"variable_key":"accessory_max_coverage_pct","variable_value":"0.3"},{"variable_key":"car_footprint_sqm","variable_value":"18.5"},{"variable_key":"garage_max_gfa_sqm","variable_value":"60"},{"variable_key":"garage_min_footprint_sqm","variable_value":"18"},{"variable_key":"garage_min_lot_sqm","variable_value":"230"},{"variable_key":"garden_suite_max_gfa_sqm","variable_value":"60"},{"variable_key":"garden_suite_min_lot_sqm","variable_value":"270"},{"variable_key":"garden_suite_min_rear_yard_m","variable_value":"5"},{"variable_key":"garden_suite_storeys","variable_value":"1"},{"variable_key":"max_build_lot_max_sqm","variable_value":"2000"},{"variable_key":"max_build_lot_min_sqm","variable_value":"50"},{"variable_key":"max_build_min_dimension_m","variable_value":"3"},{"variable_key":"min_soft_landscaping_pct","variable_value":"0.3"},{"variable_key":"mislink_footprint_lot_tol","variable_value":"0.05"},{"variable_key":"reno_coa_uplift_pct","variable_value":"0.05"},{"variable_key":"road_overlay_distance_m","variable_value":"5"},{"variable_key":"storey_height_m","variable_value":"3"}]` |
| Q13 | `SELECT count(*) AS rd_rs_rt_rm_parcels, count(*) FILTER (WHERE bylaw_max_fsi IS NOT NULL) AS with_bylaw_max_fsi, count(*) FILTER (WHERE bylaw_max_density IS NOT NULL) AS with_bylaw_max_density FROM parcels WHERE zoning_class IN ('RD','RS','RT','RM')` | `{"rd_rs_rt_rm_parcels":"331684","with_bylaw_max_fsi":"1312","with_bylaw_max_density":"120692"}` |
| Q14 | `SELECT count(*) AS rd_rs_rt_rm_zone_areas, count(*) FILTER (WHERE zn_string ~ 'd[0-9]') AS label_has_d, count(*) FILTER (WHERE density_max IS NOT NULL) AS density_max_set, count(*) FILTER (WHERE fsi_max IS NOT NULL) AS fsi_max_set FROM zoning_bylaw_areas WHERE zn_zone IN ('RD','RS','RT','RM')` | `{"rd_rs_rt_rm_zone_areas":"4926","label_has_d":"898","density_max_set":"898","fsi_max_set":"9"}` |

### X.1 Completeness (same gates as the 41 Derwyn Rd table; what this lot exercises)

| Gate / step (code or plan) | In operator's list? | On this lot | Fields read → written |
| --- | --- | --- | --- |
| `scope` + neighbourhood / pocket norms | N — added (X.2a) | enters; Mimico-Queensway p50 2 / p90 3 | `geom`, norms → `neighbourhood_id` |
| `massing` (existing building) | N — added (X.2b) | one primary, 126.74 m² | `parcel_buildings` → intermediates |
| ravine / heritage | Y — steps 1, 2 | neither | flags |
| corner / through | Y — step 3 (through added) | neither | flags → `width_raw`, `length_raw` |
| coverage overlay (NF-8) | Y — step 4 | **unmapped** → `coverage_defaulted` TRUE | `bylaw_max_coverage_pct` → `coverage_cap` |
| lot geometry + required frontage (F1) | Y — step 5 | measured 12.14 vs required 10.50 — **different side bands** | `frontage_m`, `bylaw_min_frontage_m` |
| `lot` / `tier` → `emit` | N — added (X.5b) | high / 3way | → `lot_size_confidence` |
| zone / exception / STAND_SET | Y — step 6 | RD (f10.5; a325; d0.4); none | → `max_build_setback_basis` |
| NF-15 / NF-29 user inputs | N — added (X.6b) | NULL (branches shown) | — |
| rules (setbacks, caps, height, FSI, landscaping) | Y — step 7 | see table | — |
| min-dimension floor, buffer | N — added to step 8 | clear | → `max_build_width_m`, `max_build_length_m` |
| coverage cap (median default, R1) | Y — step 9 | **median 33 % binds as-built** | → `coverage_cap` |
| footprint routing / binding (NF-19) | Y — step 10 | see step 10 | → `max_buildable_footprint_sqm` |
| storeys + aggressive / hotspot | Y — step 11 (+ added) | 2; p90 3 | → `max_build_stories*`, `market_exceeds_bylaw` |
| GFA + FSI data gap | Y — step 12 (+ added) | `d0.4` in `bylaw_max_density`; `bylaw_max_fsi` NULL | → `max_buildable_gfa_sqm` |
| confidence / envelope constraint | N — added (X.12b) | medium / false | → `max_build_confidence`, `envelope_*` |
| landscaping (NF-12..NF-14, NF-20..NF-28) | Y — step 13 | branches | — |
| accessory fit (garage, suites) | N — added (X.13b) | garage 31.40 m², garden suite fits | → accessory fields |
| houseplex / suite outputs (NF-30..NF-32) | N — added (X.13c) | both answers | → NF-30..NF-32 |
| "Does landscaping change MaxBuild?" | N — added (X.13d) | main house no; ancillary yes | — |

**Not exercised (and why):** heritage freeze / mislink, ravine sub-floor, corner flankage / NF-4 / NF-14, through lot, coverage-only fallback (dimensions clear 3.0 m), `bylaw_max_stories` (no ST), STAND_SET / exceptions (NULL), `zoning_is_ambiguous` (false), laneway suite / NF-25 (`abuts_laneway` false), NF-5 / NF-6 (not measured), NF-16, NF-28, major-street branches (`on_policy_road` false), EF-19..EF-22 (downstream owners).

### X.2a Scope and neighbourhood — **added — not in the original list**
(i) Enters the pass? Which storey norm? (ii) Yes (Q3 `geom_npoints` 5); neighbourhood 46 "Mimico-Queensway" p50 2, p90 3 (n = 78, Q11). (iii) *Fields — EXISTING (as-built):* `geom`, `neighbourhood_id`, `neighbourhood_cost_premium` (1.35)  
*Fields — NEW (NF-#/planned/user-input):* none  
(iv) Rule: code — `ST_Contains(n.geom, ST_Centroid(p.geom))`.

### X.2b Existing building — **added — not in the original list**
(i) What stands there? (ii) One primary building (Q9: 471464, centroid_in_parcel), footprint 126.74 m² (1364.2 ft²); existing-structure pass 7.76 × 17.10 m (Q8); existing coverage 29.1 %. (iii) *Fields — EXISTING (as-built):* `imagery_roof_footprint_sqm`, `existing_width_m`, `existing_length_m`, `existing_greenspace_sqm`  
*Fields — NEW (NF-#/planned/user-input):* NF-6 (not measured)  
(iv) Rule: code — CTE `massing`.

### Step 1 — Ravine protection area?
(i)/(ii) **No** — `is_in_ravine_protection_area` false, 593.6 m away (Q3). (iii) *Fields — EXISTING (as-built):* `is_in_ravine_protection_area`  
*Fields — NEW (NF-#/planned/user-input):* none  
(iv) Rule: code `AS ravine_sub_floor`; no by-law text in the ledger.

### Step 2 — Heritage-designated?
(i)/(ii) **No** — `is_heritage_designated` false (Q3). (iii) *Fields — EXISTING (as-built):* `is_heritage_designated`  
*Fields — NEW (NF-#/planned/user-input):* none  
(iv) Rule: code `AS heritage_no_massing`.

### Step 3 — Corner lot? (through lot — **added**)
(i)/(ii) **Neither** — corner false, through false, fronts Eastbourne Cres (Q3). (iii) *Fields — EXISTING (as-built):* `is_corner_lot`, `is_through_lot`  
*Fields — NEW (NF-#/planned/user-input):* NF-4 = NF-3, NF-14 NULL  
(iv) Rule: G2 (corner lots only; quoted in the 41 Derwyn Rd example).

### Step 4 — By-law coverage percentage? (NF-8)
(i) Is the lot on the Lot Coverage Overlay Map? (ii) **No** — `coverage_overlay` NULL (Q6), `bylaw_max_coverage_pct` NULL (Q4). By-law: no lot coverage applies (G7(B)). NF-8 = `unregulated`. As-built: `coverage_defaulted` = TRUE — the zone median 33 % fills the gap (`COALESCE(bylaw_max_coverage_pct, `…). The houseplex / suite 45 % clause (H7) does not apply: it replaces a numerical overlay value under 45 %, and there is none. (iii) *Fields — EXISTING (as-built):* `bylaw_max_coverage_pct`, `coverage_defaulted` (intermediate)  
*Fields — NEW (NF-#/planned/user-input):* NF-8 `bylaw_max_coverage_basis` = `unregulated`  
(iv) Rule:

> **G7 — §10.20.30.40(1)(A)(B)** (RD lot coverage (overlay-mapped or none); Appendix C, fetched 2026-09-29T14:45:17.303Z): "10.20.30.40 Lot Coverage (1) Maximum Lot Coverage (A) if a lot in is in an area with a numerical value on the Lot Coverage Overlay Map, that numerical value is the permitted maximum lot coverage, as a percentage of the lot area; (B) if a lot is not in an area with a numerical value on the Lot Coverage Overlay Map, no lot coverage applies; [ By-law: 848-2025 ]"

> **H7 — §10.20.30.40(1)(D)** (RD lot coverage 45 % — houseplex / secondary suite; Appendix E, fetched 2026-09-29T14:45:17.303Z): "(D) Despite (A) above, if the numerical value on the Lot Coverage Overlay Map is less than 45 percent and the lot contains a detached houseplex or a residential building with a secondary suite, the maximum lot coverage for all buildings and structures on the lot is 45 percent;"

### Step 5 — Lot dimensions
(i) Frontage, depth, area, regular? Measured vs required frontage (F1)? (ii) 12.14 m (39.83 ft) × 35.88 m (117.72 ft), lot 435.53 m² (4688.0 ft²) (stored 4688.00 ft², `stated`); polygon 435.61 m², 5-point; `is_irregular` false (Q3). Required frontage `f10.5` → 10.50 m; required area `a325` → 325 m² (Q4/Q5) — a conforming lot. **F1 matters here:** measured 12.14 m is in RD side band (C) "12.0 metres to less than 15.0 metres" (1.2 m), the required 10.50 m in band (B) "6.0 metres to less than 12.0 metres" (0.9 m); 10.5 ≤ 18.0, so the RD caps apply under either reading. (iii) *Fields — EXISTING (as-built):* `frontage_m`, `depth_m`, `lot_size_sqm`, `is_irregular`, `bylaw_min_frontage_m`, `bylaw_min_area_sqm`  
*Fields — NEW (NF-#/planned/user-input):* none new  
(iv) Rule:

> **G5 — §10.20.30.20(1)(A)(B)** (RD required minimum lot frontage = zone-label "f" value; Appendix C, fetched 2026-09-29T14:45:17.303Z): "10.20.30.20 Lot Frontage (1) Minimum Lot Frontage In the RD zone: (A) if a zone label includes the letter "f", as on the Zoning By-law Map, the numerical value following the letter "f" is the required minimum lot frontage, in metres; and (B) if the zone label does not include an "f" value on the Zoning By-law Map, the required minimum lot frontage is 12.0 metres."

### X.5b Lot validation (`emit`) — **added — not in the original list**
abs(435.53 − 435.61), abs(435.53 − 435.58), abs(435.61 − 435.58) each within 0.15 × the larger → [true, true, true]; band true → **high / 3way** (stored high / 3way); `emit` true (`AS pair_lg`). No planned change.

### Step 6 — By-law zone
(ii) **RD**, `RD (f10.5; a325; d0.4)` (Q4; polygon 11223), holding `N`, area share 1.0000, no exception, STAND_SET NULL; height overlay `HT 9.5` (no ST). Label: `f10.5` required frontage (G5), `a325` required area, `d0.4` FSI 0.40 (G8(A)). (iii) *Fields — EXISTING (as-built):* `zoning_class`, `zoning_zn_string`, `exception_number`, `bylaw_standard_setback_m`, `max_build_setback_basis` = `zone_default`  
*Fields — NEW (NF-#/planned/user-input):* none new  

### X.6b User inputs — **added — not in the original list**
NF-15 `building_type`, NF-29 `has_secondary_suite`, NF-26/NF-27/NF-28 — NULL by default; the RD envelope formulas below do not need them; the landscaping rows (step 13) and the houseplex / suite answer (X.13c) branch on them.

### Step 7 — Rules that apply

| Rule | Applies? | Value on this lot | Why | Provision |
| --- | --- | --- | --- | --- |
| Front setback | yes | NF-1 = 6.0 m (averaging research-required; NF-6 unmeasured) | no STAND_SET | G1 (1), G19 |
| Rear setback | yes | NF-2 = GREATEST(7.5, 0.25 × 35.88 = 8.97) = **8.97 m** | RD depth term | G1 (2) |
| Side setback | yes | plan (on `frontage_m` 12.14): **1.2 m**; F1 (on required 10.50): **0.9 m**; × 2 sides | band (C) vs (B) | G1 (3) |
| Height | yes | EF-5 = COALESCE(9.50, 10.0) = 9.50 m, NF-7 `overlay` | HT 9.5 | G6 |
| FSI | yes | d0.4 → 435.53 × 0.40 = 174.21 m² | label `d`, held in `bylaw_max_density` (data gap, step 12); not for a houseplex / suite (H8) | G8, H8 |
| Building length | yes | NF-10 = 17.0 m | required 10.5 ≤ 18.0 (F3); not a major street | G3, G20 |
| Building depth | yes | NF-11 = 19.0 m | required 10.5 ≤ 18.0 (F3) | G4, G20 |
| Coverage | **no** | unregulated (NF-18 NULL); as-built median 33 % | no overlay value (Q6) | G7 |
| Front landscaping | yes (NF-15 in L4 scope) | NF-12 = 50 % (6.0 ≤ 12.14 < 15.0) | measured frontage | L4, L6 |
| Rear soft | yes | NF-13 = 50 % of rear yard | frontage > 6.0 | L10 |
| Driveway width | yes (L15 scope) | NF-23 = LEAST(6.0, parking width) → 6.0 | 6.0 ≤ 12.14 ≤ 23.0 | L15 |

Provision texts G1, G3, G4, G6, G8, G19, G20, L4, L6, L15 are quoted in the 41 Derwyn Rd example and Appendices B/C (same fetch).

### Step 8 — Max build from setbacks + caps (NF-17)
(i) What do the setbacks and caps alone allow? (ii) **Plan as written 185.06 m² (1992.0 ft²); F1 196.46; F2 165.58; F1 + F2 175.78 m²; as-built box 231.41 m² (no caps).**

| Term | Existing methodology (as-built code) | New — plan formulas as written | F1 (side tier on required frontage) | F2 (length cap front-to-rear) | F1 + F2 (`calc.bylawReading`) |
| --- | --- | --- | --- | --- | --- |
| front / side / rear | 6.0 / 0.9 × 2 / 7.5 (`SETBACK_DEFAULTS.RD`) | 6.0 / 1.2 × 2 / 8.97 | 6.0 / 0.9 × 2 / 8.97 | 6.0 / 1.2 × 2 / 8.97 | 6.0 / 0.9 × 2 / 8.97 |
| width | 12.14 − 1.8 = **10.34** (`ELSE frontage_m - side_count * side_setback END`) | **9.74** | **10.34** | **9.74** | **10.34** |
| length | 35.88 − 13.5 = **22.38** | MIN(20.91, 19.0) = **19.00** | MIN(20.91, 19.0) = **19.00** | MIN(20.91, 17.0, 19.0) = **17.00** | MIN(20.91, 17.0, 19.0) = **17.00** |
| box | **231.41** | **185.06** | **196.46** | **165.58** | **175.78** |
| buffer (live PostGIS, Q10) | 352.57 (inset 0.9) | 326.33 (inset 1.2) | 352.57 (inset 0.9) | 326.33 (inset 1.2) | 352.57 (inset 0.9) |
| NF-17 = LEAST(buffer, box) | not persisted | **185.06** | **196.46** | **165.58** | **175.78** |

*Fields — EXISTING (as-built):* `width_raw`, `length_raw`, `box_area`, `buffer_area`, `max_build_width_m`, `max_build_length_m`  
*Fields — NEW (NF-#/planned/user-input):* NF-17; EF-3, EF-4  
*Provisions:* G1, G3, G4, G20.

### Step 9 — Max build from coverage % (NF-18) — **the key contrast**
(i) What does coverage allow? (ii) **As-built: 143.72 m² (1547.0 ft²)** from the zone median — 435.53 × COALESCE(NULL, 33) / 100 (`AS coverage_cap`), `coverage_defaulted` TRUE. **New: NULL** — NF-8 `unregulated`, NF-18 NULL, "no lot coverage applies" (G7(B)).

| Term | Existing methodology (as-built code) | New — plan formulas as written | F1 (side tier on required frontage) | F2 (length cap front-to-rear) | F1 + F2 (`calc.bylawReading`) |
| --- | --- | --- | --- | --- | --- |
| coverage % | COALESCE(NULL, median 33) = 33 | none (NF-8 `unregulated`) | none (NF-8 `unregulated`) | none (NF-8 `unregulated`) | none (NF-8 `unregulated`) |
| coverage footprint | `coverage_cap` = **143.72** | NF-18 = **NULL** | NF-18 = **NULL** | NF-18 = **NULL** | NF-18 = **NULL** |

*Fields — EXISTING (as-built):* `bylaw_max_coverage_pct` (NULL), `coverage_cap`, `coverage_defaulted` (intermediates); `COVERAGE_DEFAULTS.RD` `RD: 33, RS: 33, RT: 33, RM: 30`  
*Fields — NEW (NF-#/planned/user-input):* NF-8, NF-18; research item R1  
*Provision:* G7.

### Step 10 — Which limit binds (NF-19); headline footprint (EF-2)
(i) Which term decides? (ii) **As-built: the zone median, 143.72 m²** (stored 143.72). **New: the setbacks + caps** (NF-19 `setback`) — EF-2 = NF-17 = 185.06 m² if R1 retires the median; if R1 keeps it, EF-2 stays 143.72 m² and the change shows only in NF-17.

| Term | Existing methodology (as-built code) | New — plan formulas as written | F1 (side tier on required frontage) | F2 (length cap front-to-rear) | F1 + F2 (`calc.bylawReading`) |
| --- | --- | --- | --- | --- | --- |
| footprint | LEAST(352.57, 231.41, 143.72) = **143.72** (`ELSE LEAST(buffer_area, box_area, coverage_cap) END AS footprint_calc`) | R1 retires median: **185.06** · R1 keeps: 143.72 | R1 retires median: **196.46** · R1 keeps: 143.72 | R1 retires median: **165.58** · R1 keeps: 143.72 | R1 retires median: **175.78** · R1 keeps: 143.72 |
| binding | `coverage_cap` (the median) | NF-19 `setback` | NF-19 `setback` | NF-19 `setback` | NF-19 `setback` |
| change vs as-built | — | +41.34 m² (R1 retire) · 0 (R1 keep) | +52.74 m² (R1 retire) · 0 (R1 keep) | +21.86 m² (R1 retire) · 0 (R1 keep) | +32.06 m² (R1 retire) · 0 (R1 keep) |

*Fields — EXISTING (as-built):* `max_buildable_footprint_sqm`, `max_build_basis` = `rect_approx`  
*Fields — NEW (NF-#/planned/user-input):* NF-17, NF-19; EF-2  

### Step 11 — Height → storeys (EF-5 / EF-6)
(ii) **2 storeys** (stored 2, `pocket`): height_implied = GREATEST(1, round(9.50 / 3)) = 3; LEAST(p50 2, 3) = 2; aggressive p90 3; `market_exceeds_bylaw` 3 > 3 → false (`AS height_implied`). Planned EF-5 = 9.50 (NF-7 `overlay`), EF-6 = 2. No change. (iii) *Fields — EXISTING (as-built):* `bylaw_max_height_m`, `max_build_height_m`, `max_build_stories`, `max_build_stories_basis`, `max_build_stories_aggressive`, `market_exceeds_bylaw`  
*Fields — NEW (NF-#/planned/user-input):* NF-7; EF-5, EF-6, EF-7, EF-12  

### Step 12 — GFA = LEAST(footprint × storeys, FSI cap) (EF-8) and the FSI data gap
(i) Maximum GFA? (ii) **As-built 287.44 m² (3094.0 ft²)** (FSI unread). The label's `d0.4` sits in `bylaw_max_density` = 0.40; `bylaw_max_fsi` is NULL (Q4, Q5), so neither the code nor the plan's NF-9 / EF-8 applies it (fleet: Q13 / Q14, as in the 41 Derwyn Rd finding). With the gap fixed, FSI caps GFA at 435.53 × 0.40 = **174.21 m²** under every footprint variant.

| Term | Existing methodology (as-built code) | New — plan formulas as written | F1 (side tier on required frontage) | F2 (length cap front-to-rear) | F1 + F2 (`calc.bylawReading`) |
| --- | --- | --- | --- | --- | --- |
| FSI input | `bylaw_max_fsi` NULL → `fsi_cap` NULL (`CASE WHEN bylaw_max_fsi IS NOT NULL THEN round(lot_size_sqm * bylaw_max_fsi, 2) END AS fsi_cap`) | NF-9 `unregulated` as written; `zone_label_mapped` 0.40 with the fix | NF-9 `unregulated` as written; `zone_label_mapped` 0.40 with the fix | NF-9 `unregulated` as written; `zone_label_mapped` 0.40 with the fix | NF-9 `unregulated` as written; `zone_label_mapped` 0.40 with the fix |
| GFA — FSI unread (as written) | 143.72 × 2 = **287.44**, `coverage_box` | R1 retire **370.12** · keep 287.44 | R1 retire **392.92** · keep 287.44 | R1 retire **331.16** · keep 287.44 | R1 retire **351.56** · keep 287.44 |
| GFA — label FSI read (fix) | LEAST(287.44, 174.21) = 174.21 | **174.21** (FSI binds) · keep 174.21 | **174.21** (FSI binds) · keep 174.21 | **174.21** (FSI binds) · keep 174.21 | **174.21** (FSI binds) · keep 174.21 |

*Fields — EXISTING (as-built):* `bylaw_max_fsi`, `bylaw_max_density`, `max_buildable_gfa_sqm`, `max_buildable_gfa_basis`  
*Fields — NEW (NF-#/planned/user-input):* NF-9; EF-8  
*Provision:* G8.

### X.12b Confidence and envelope constraint — **added — not in the original list**
`max_build_confidence` = **medium** (lot high, STAND_SET NULL — `WHEN lot_size_confidence = 'high' AND setback_is_bylaw`; stored medium); `envelope_constrained` false / reason NULL (stored false / NULL). Planned EF-9 / EF-10: same (all dimensions ≥ 3.0 m).

### Step 13 — Landscaping by driveway branch (NF-12 / NF-20 / NF-21 / NF-22)
Front yard at the required setback 12.14 × 6.0 = 72.84 m² (784.0 ft²); rear yard at the required rear setback 12.14 × 8.97 = 108.90 m². With `building_type` NULL, NF-22 / NF-20 / NF-21 are NULL.

| Field | `building_type` NULL | `detached`, NF-26 `none` | `detached`, NF-26 `private` | `detached`, NF-26 `shared` |
| --- | --- | --- | --- | --- |
| NF-22 | NULL | `tier_50pct` | `tier_50pct` | `tier_50pct` |
| NF-12 landscaping ≥ | 50 % | 50 % = 36.42 m² | 50 % = 36.42 m² | 50 % |
| NF-20 soft ≥ | NULL | 75 % = 54.63 m² | 37.5 % = 27.32 m² | NULL — research (L27) |
| NF-21 hard ≤ | NULL | 25 % | 62.5 % − driveway % (NF-27 / 12.14 × 100) | NULL |
| NF-23 driveway ≤ | NULL | 6.0 m "if added" | 6.0 m (cap-only); a full-depth 6.0 m driveway leaves 50.6 % landscaping ≥ 50 % → L15 binds before L6 | withheld |

Rear soft: as-built none (greenspace test 0.3 × lot = 130.66 m², KFM-9); planned NF-13 = 50 % of rear yard = 54.45 m². (iii) *Fields — EXISTING (as-built):* none  
*Fields — NEW (NF-#/planned/user-input):* NF-12, NF-13, NF-20..NF-23; user inputs NF-15, NF-26..NF-28  

### X.13b Accessory fit — **added — not in the original list**
| Term | Existing methodology (as-built code) | New — plan formulas as written | F1 (side tier on required frontage) | F2 (length cap front-to-rear) | F1 + F2 (`calc.bylawReading`) |
| --- | --- | --- | --- | --- | --- |
| rear-yard depth term | 35.88 − 6.0 − 7.5 = 22.38 (`GREATEST(0, depth_m - front_setback - rear_setback) AS rear_yard_depth`) | EF-13: 20.91 | — | — | — |
| rear-yard area | 22.38 × 10.34 − 126.74 = 104.67 | 20.91 × 9.74 − 126.74 = 76.92 | — | — | — |
| garage | LEAST(60, 0.3 × 104.67) = **31.40** → 1 car, `as_of_right` | EF-17: **23.08** → 1 car | — | — | — |
| garden suite | fits, 60 m², `as_of_right` | fits (EF-13) | — | — | — |

### X.13c Houseplex / secondary suite — both answers (NF-30..NF-32) — **added — not in the original list**
(i) What changes for a houseplex or a house with a secondary suite? (ii) **Footprint: nothing** — there is no overlay value for clause (D) to replace (H7), so coverage stays unregulated and NF-30 = NF-17. **GFA: the FSI stops applying** (H8), so once the label FSI is read the two answers differ sharply. Houseplex height max(9.50, 10.0) = 10.00 m (H15) → 2 storeys, unchanged; deep-lot length/depth relief (H17/H18) needs depth ≥ 40.0 m at this frontage (≥ 10.0 m) — 35.88 m, not applicable.

| Term | Existing methodology (as-built code) | New — plan formulas as written | F1 (side tier on required frontage) | F2 (length cap front-to-rear) | F1 + F2 (`calc.bylawReading`) |
| --- | --- | --- | --- | --- | --- |
| footprint — detached (EF-2) | 143.72 | 185.06 (R1 retire) · 143.72 (keep) | 196.46 (R1 retire) · 143.72 (keep) | 165.58 (R1 retire) · 143.72 (keep) | 175.78 (R1 retire) · 143.72 (keep) |
| footprint — houseplex / suite (NF-30) | — (not modelled) | **185.06**, NF-32 `setback` | **196.46**, NF-32 `setback` | **165.58**, NF-32 `setback` | **175.78**, NF-32 `setback` |
| GFA — detached, label FSI read | 174.21 | **174.21** | **174.21** | **174.21** | **174.21** |
| GFA — houseplex / suite (NF-31, no FSI) | — | **370.12** | **392.92** | **331.16** | **351.56** |

*Fields — EXISTING (as-built):* `max_buildable_footprint_sqm`, `max_buildable_gfa_sqm` (base; detached-house rules; meaning unchanged)  
*Fields — NEW (NF-#/planned/user-input):* NF-15, NF-29 (user inputs); NF-30, NF-31, NF-32  
*Provisions:* H1, H3, H7, H8, H15, H17 (quoted in the 41 Derwyn Rd example and Appendix E).

### X.13d Does landscaping change MaxBuild? — **added — not in the original list**
(ii) **Main-house MaxBuild unaffected** — front-yard landscaping (L4–L8) governs the front yard in front of the front main walls (H5) and rear soft landscaping (L10) the rear yard behind the rear main walls (H6); both are percentages of the yard the house leaves (EF-2, EF-8, NF-30, NF-31 unchanged).

| Outcome | Affected? | This lot | Rule |
| --- | --- | --- | --- |
| main house footprint / GFA | no | — | H5, H6, L4, L10 |
| front driveway / paving | no (on this lot) | the 50 % minimum would allow 6.07 m, above the 6.0 m NF-23 cap — the driveway cap (L15) binds first | L6, L15 |
| garden suite, house at the planned 19.0 m length | no | area behind the house (35.88 − 6.0 − 19.00) × 12.14 = 132.08 m²; 50 % soft (L20) → suite ≤ 66.04 m² ≥ 60 → fits | L20 |
| garden suite, house at the as-built 22.38 m length | **yes** | (35.88 − 6.0 − 22.38) × 12.14 = 91.05 m² → suite ≤ 45.53 m² < 60 | L20 |
| garage (no suite) | no | garage 31.40 / 23.08 m² ≤ 50 % of 132.08 m² | L10 |
| garage + garden suite | **yes** | 60 + 31.40 = 91.40 m² > 66.04 m² | L20 |

As-built code path: garage / rear-suite permission test greenspace against 0.3 × lot (`* lot_size_sqm THEN 'as_of_right' ELSE 'coa_required' END AS garage_permission`): 435.53 − 126.74 − 31.40 = 277.39 ≥ 130.66 → `as_of_right`; suite `as_of_right` (KFM-9). **Conclusion (64 Eastbourne Cres):** main-house MaxBuild unaffected; the driveway is capped by L15, not landscaping; a garden suite fits beside a house at the planned 19.0 m length but not beside the as-built 22.38 m envelope, and not together with a garage.

### Step 14 — Summary

| Field | AS-BUILT stored (Q7) | AS-BUILT recomputed | PLANNED (plan formulas; R1 retire · keep) | F1 + F2 (pending) | With label FSI read |
| --- | --- | --- | --- | --- | --- |
| side / rear setback (m) | — | 0.9 / 7.5 | 1.2 / 8.97 | 0.9 / 8.97 | — |
| `max_build_width_m` | 10.34 | 10.34 | 9.74 | 10.34 | — |
| `max_build_length_m` | 22.38 | 22.38 | 19.00 | 17.00 | — |
| coverage cap / NF-18 | — | 143.72 (median) | NULL | NULL | — |
| NF-17 setback footprint | — | (box 231.41) | 185.06 | 175.78 | — |
| `max_buildable_footprint_sqm` (EF-2) | 143.72 | 143.72 | 185.06 · 143.72 | 175.78 · 143.72 | same |
| binding | — | median coverage | NF-19 setback | setback | — |
| `max_build_stories` | 2 | 2 | 2 | 2 | — |
| `max_buildable_gfa_sqm` (EF-8) | 287.44 | 287.44 | 370.12 · 287.44 | 351.56 · 287.44 | **174.21** (all variants) |
| NF-30 footprint (houseplex / suite) | — | — | 185.06 | 175.78 | same |
| NF-31 GFA (houseplex / suite, no FSI) | — | — | 370.12 | 351.56 | same (FSI not applied) |
| `max_garage_gfa_sqm` | 31.40 | 31.40 | 23.08 | — | — |
| `max_newbuild_coa_gfa_sqm` | 301.81 | 301.81 | 388.63 · 301.81 | — | 182.92 |
| `max_build_fsi` (Spec 88) | 0.660 | 0.660 | 0.850 · 0.660 | — | 0.400 |
| `lot_size_confidence` / `max_build_confidence` | high / medium | high / medium | unchanged | — | — |

**Reading.** Old: the missing coverage value is filled with the zone median and that median sets the footprint (143.72 m², 33 % of the lot). New: coverage is unregulated, so the setbacks and the 19.0 m depth cap decide (185.06 m² as written; 175.78 m² with F1 + F2) — **but only if R1 retires the median**; otherwise EF-2 stays 143.72 m² and the change lives in NF-17. GFA is decided by neither: once the label FSI 0.40 is read, it caps GFA at 174.21 m² (1875.2 ft²) in every variant, against 287.44 m² stored today. A houseplex or secondary suite leaves the footprint unchanged (no overlay value) but lifts the FSI cap: NF-31 370.12 m² (351.56 m² with F1 + F2). Operator figures in feet: 39.83 ft × 117.72 ft.

## Worked example — 96 Futura Drive (semi-detached, coverage overlay mapped: old vs new)

> **Status:** AS-BUILT read from the local dev DB (read-only snapshot, captured 2026-09-29T16:51:17.520Z, `spec67-gen/excap.js`, SELECT only) and recomputed from the `buildMaxBuildSql` formulas: **all 27 recomputed as-built values equal the stored values**. PLANNED = the plan's formulas as written with `building_type` = `semi_detached` (NF-15, user input); F1/F2 = findings pending panel ruling; the last column shows NF-15 NULL ("NULL, don't guess"). **Semi-detached, coverage mapped (30 %).** RS keeps a party wall on one side (`side_count` 1), so the side setback is charged once.

### S1.0 Parcel selection, building type and data snapshot
**Selection (Q1):** RS, coverage mapped, regular, not ravine / heritage / corner / through / laneway, lot confidence high, one unambiguous zone polygon, no STAND_SET / exception / holding, frontage 6.5–9.5 m (semi-detached lots), ordered by closeness to 7.6 m × 33 m, with the massing shared-wall test (Q1 columns `buildings_within_1m`, `parcels_spanned`). **Chosen: id 237578 (parcel_id 5149454) — 96 Futura Dr**; the first candidate whose primary building touches exactly one neighbouring footprint (a shared wall, halves kept as separate polygons) and whose stored envelope reproduces. Passed over: 4 Imogene Ave (one footprint spanning two parcels — weaker evidence), 95 Futura Dr (stored `max_build_length_m` 20.04 vs recomputed 20.05 — stale; and `bylaw_min_frontage_m` 30.00 against its own label `f18.0`, borrowed from a zero-share sliver polygon by the MAX rule — the same class as the STAND_SET finding).

**Building type — permitted and corroborated.** A semi-detached house is a permitted residential building type in the RS zone (H19, quoted below; definition H21). Corroboration from massing (Q15): the primary building footprint is 137.38 m², lies within ~1 m of 1 other building footprint(s) and overlaps 1 parcel(s) by more than 5 m² — one shared wall with one neighbour: consistent with one half of a semi-detached pair. The building type itself is **not a column** (NF-15 user input); it is assumed here and every branch that needs it is also shown with NF-15 NULL.

> **H19 — §10.40.20.20(1)** (RS permitted residential building types; Appendix E, fetched 2026-09-29T14:45:17.446Z): "In the RS Zone, a dwelling unit is permitted in the following residential building types: (A) Detached House; (B) Semi-detached House; (C) Detached Houseplex; [ By-law: 648-2025 ] (D) Semi-Detached Houseplex; and [ By-law: 648-2025 ] (E) (Deleted by By-law 648-2025) [ By-law: 648-2025 ] (F) Townhouse if the lot abuts a major street; and (G) Apartment Building if the lot abuts a major street."

> **H21 — §800.50(745)** (Semi-Detached House (definition); Appendix E, fetched 2026-09-29T14:45:16.969Z): "(745) Semi-Detached House means a building that has two dwelling units, and no dwelling unit is entirely or partially above another."

| Q | SQL (as executed) | Result |
| --- | --- | --- |
| Q1 | `WITH c AS (SELECT p.id, p.address_number, p.linear_name_full, p.frontage_m, p.depth_m, p.lot_size_sqm, p.zoning_zn_string, p.bylaw_max_coverage_pct, p.bylaw_max_height_m, p.bylaw_max_density, p.bylaw_min_frontage_m, (SELECT pb.building_id FROM parcel_buildings pb WHERE pb.parcel_id = p.id AND pb.is_primary LIMIT 1) AS bid FROM parcels p WHERE p.zoning_class = 'RS' AND p.bylaw_max_coverage_pct IS NOT NULL AND p.is_irregular = false AND NOT COALESCE(p.is_in_ravine_protection_area, false) AND NOT COALESCE(p.is_heritage_designated, false) AND NOT COALESCE(p.is_corner_lot, false) AND NOT COALESCE(p.is_through_lot, false) AND NOT COALESCE(p.abuts_laneway, false) AND p.lot_size_confidence = 'high' AND NOT COALESCE(p.zoning_is_ambiguous, false) AND p.bylaw_standard_setback_m IS NULL AND p.exception_number IS NULL AND p.zoning_holding = 'N' AND p.frontage_m BETWEEN 6.5 AND 9.5 AND p.depth_m >= 0 AND p.address_number IS NOT NULL AND p.address_number <> 'None' AND p.bylaw_max_height_m IS NOT NULL AND p.max_buildable_footprint_sqm IS NOT NULL AND (SELECT count(*) FROM parcel_buildings pb WHERE pb.parcel_id = p.id) = 1 AND EXISTS (SELECT 1 FROM parcel_buildings pb WHERE pb.parcel_id = p.id AND pb.is_primary) ORDER BY abs(p.frontage_m - 7.6) + abs(p.depth_m - 33) / 3, p.id LIMIT 6) SELECT c.id, c.address_number, c.linear_name_full, c.frontage_m, c.depth_m, c.lot_size_sqm, c.zoning_zn_string, c.bylaw_max_coverage_pct, c.bylaw_max_height_m, c.bylaw_max_density, c.bylaw_min_frontage_m, (SELECT count(*) FROM building_footprints o, building_footprints b WHERE b.id = c.bid AND o.id <> b.id AND ST_DWithin(o.geom, b.geom, 0.00001)) AS buildings_within_1m, (SELECT count(*) FROM parcels q, building_footprints b WHERE b.id = c.bid AND q.geom && b.geom AND ST_Area(ST_Intersection(q.geom, b.geom)::geography) > 5) AS parcels_spanned FROM c` | `[{"id":348090,"address_number":"4","linear_name_full":"Imogene Ave","frontage_m":"8.09","depth_m":"34.14","lot_size_sqm":"276.21","zoning_zn_string":"RS (f18.0; a665)","bylaw_max_coverage_pct":"30.00","bylaw_max_height_m":"10.00","bylaw_max_density":null,"bylaw_min_frontage_m":"18.00","buildings_within_1m":"0","parcels_spanned":"2"},{"id":353142,"address_number":"95","linear_name_full":"Futura Dr","frontage_m":"8.83","depth_m":"33.55","lot_size_sqm":"296.21","zoning_zn_string":"RS (f18.0; a665)","bylaw_max_coverage_pct":"30.00","bylaw_max_height_m":"10.00","bylaw_max_density":null,"bylaw_min_frontage_m":"30.00","buildings_within_1m":"1","parcels_spanned":"1"},{"id":237578,"address_number":"96","linear_name_full":"Futura Dr","frontage_m":"8.83","depth_m":"33.56","lot_size_sqm":"296.33","zoning_zn_string":"RS (f18.0; a665)","bylaw_max_coverage_pct":"30.00","bylaw_max_height_m":"10.00","bylaw_max_density":null,"bylaw_min_frontage_m":"18.00","buildings_within_1m":"1","parcels_spanned":"1"},{"id":665,"address_number":"48","linear_name_full":"Habitant Dr","frontage_m":"8.39","depth_m":"34.94","lot_size_sqm":"293.11","zoning_zn_string":"RS (f18.0; a665)","bylaw_max_coverage_pct":"30.00","bylaw_max_height_m":"10.00","bylaw_max_density":null,"bylaw_min_frontage_m":"18.00","buildings_within_1m":"0","parcels_spanned":"2"},{"id":83145,"address_number":"21","linear_name_full":"Wedmore Ave","frontage_m":"9.12","depth_m":"33.67","lot_size_sqm":"306.91","zoning_zn_string":"RS (f18.0; a580)","bylaw_max_coverage_pct":"30.00","bylaw_max_height_m":"10.00","bylaw_max_density":null,"bylaw_min_frontage_m":"18.00","buildings_within_1m":"0","parcels_spanned":"2"},{"id":302220,"address_number":"24","linear_name_full":"Habitant Dr","frontage_m":"8.70","depth_m":"34.99","lot_size_sqm":"304.37","zoning_zn_string":"RS (f18.0; a665)","bylaw_max_coverage_pct":"30.00","bylaw_max_height_m":"10.00","bylaw_max_density":null,"bylaw_min_frontage_m":"18.00","buildings_within_1m":"0","parcels_spanned":"2"}]` |
| Q2 | `SELECT ap.address_point_id, ap.address_full, ap.address_class_desc FROM address_points ap, parcels p WHERE p.id = 237578 AND ST_Contains(p.geom, ap.geom) ORDER BY ap.address_full` | `{"address_point_id":518693,"address_full":"96 Futura Dr","address_class_desc":"Land"}` |
| Q3 | `SELECT id, parcel_id, address_number, linear_name_full, lot_size_sqm, lot_size_sqft, frontage_m, frontage_ft, depth_m, depth_ft, is_irregular, stated_area_raw, lot_size_source, round(ST_Area(geom::geography)::numeric, 2) AS geom_area_sqm, ST_NPoints(geom) AS geom_npoints, is_in_ravine_protection_area, round(ravine_distance_m::numeric, 1) AS ravine_distance_m, is_heritage_designated, heritage_designation_type, is_corner_lot, is_through_lot, abuts_laneway, primary_frontage_street_name, neighbourhood_id FROM parcels WHERE id = 237578` | `{"id":237578,"parcel_id":"5149454","address_number":"96","linear_name_full":"Futura Dr","lot_size_sqm":"296.33","lot_size_sqft":"3189.67","frontage_m":"8.83","frontage_ft":"28.97","depth_m":"33.56","depth_ft":"110.10","is_irregular":false,"stated_area_raw":"296.33 sq.m","lot_size_source":"stated","geom_area_sqm":"296.38","geom_npoints":5,"is_in_ravine_protection_area":false,"ravine_distance_m":"72.1","is_heritage_designated":false,"heritage_designation_type":null,"is_corner_lot":false,"is_through_lot":false,"abuts_laneway":false,"primary_frontage_street_name":"Futura Dr","neighbourhood_id":127}` |
| Q4 | `SELECT zoning_class, zoning_zn_string, zoning_holding, zone_status, zoning_is_ambiguous, zoning_dominant_area_share, zoning_base_source_id, exception_number, exception_text, bylaw_standard_setback_m, bylaw_min_frontage_m, bylaw_min_area_sqm, bylaw_max_coverage_pct, bylaw_max_height_m, bylaw_max_stories, bylaw_max_fsi, bylaw_max_density, bylaw_max_units, on_policy_road, in_policy_area, on_priority_retail, in_building_setback_overlay, zoning_overlays FROM parcels WHERE id = 237578` | `{"zoning_class":"RS","zoning_zn_string":"RS (f18.0; a665)","zoning_holding":"N","zone_status":2,"zoning_is_ambiguous":false,"zoning_dominant_area_share":"1.0000","zoning_base_source_id":5633,"exception_number":null,"exception_text":"N","bylaw_standard_setback_m":null,"bylaw_min_frontage_m":"18.00","bylaw_min_area_sqm":665,"bylaw_max_coverage_pct":"30.00","bylaw_max_height_m":"10.00","bylaw_max_stories":2,"bylaw_max_fsi":null,"bylaw_max_density":null,"bylaw_max_units":null,"on_policy_road":false,"in_policy_area":false,"on_priority_retail":false,"in_building_setback_overlay":false,"zoning_overlays":{"base":[{"zn_zone":"RS","source_id":5633,"area_share":1}],"height_overlay":{"applied":true,"stories":2,"height_max_m":10},"lot_coverage_overlay":{"applied":true,"coverage_max_pct":30}}}` |
| Q5 | `SELECT source_id, zn_zone, zn_string, frontage_min_m, area_min_sqm, density_max, fsi_max, coverage_max_pct, standard_setback, exception_number FROM zoning_bylaw_areas WHERE source_id = (SELECT zoning_base_source_id FROM parcels WHERE id = 237578)` | `{"source_id":5633,"zn_zone":"RS","zn_string":"RS (f18.0; a665)","frontage_min_m":"18.00","area_min_sqm":665,"density_max":null,"fsi_max":null,"coverage_max_pct":null,"standard_setback":null,"exception_number":null}` |
| Q6 | `SELECT (SELECT json_agg(json_build_object('source_id', h.source_id, 'ht_string', h.ht_string, 'height_max_m', h.height_max_m, 'ht_stories', h.ht_stories)) FROM zoning_height_overlay h WHERE ST_Intersects(h.geom, p.geom) AND NOT ST_Touches(h.geom, p.geom)) AS height_overlay, (SELECT json_agg(json_build_object('source_id', c.source_id, 'coverage_max_pct_override', c.coverage_max_pct_override, 'area_share', round((ST_Area(ST_Intersection(c.geom, p.geom)::geography) / ST_Area(p.geom::geography))::numeric, 4))) FROM zoning_lot_coverage_overlay c WHERE ST_Intersects(c.geom, p.geom) AND NOT ST_Touches(c.geom, p.geom)) AS coverage_overlay FROM parcels p WHERE p.id = 237578` | `{"height_overlay":[{"source_id":1649,"ht_string":"HT 10.0, ST 2","height_max_m":10,"ht_stories":2}],"coverage_overlay":[{"source_id":376,"coverage_max_pct_override":30,"area_share":1}]}` |
| Q7 | `SELECT lot_size_confidence, lot_size_basis, max_build_setback_basis, max_buildable_footprint_sqm, max_build_width_m, max_build_length_m, max_build_height_m, max_build_stories, max_build_stories_basis, max_build_stories_aggressive, market_exceeds_bylaw, max_build_basis, max_buildable_gfa_sqm, max_buildable_gfa_basis, max_build_confidence, envelope_constrained, envelope_constraint_reason, garden_suite_fits, max_garden_suite_gfa_sqm, max_laneway_suite_gfa_sqm, rear_suite_type, max_rear_suite_gfa_sqm, rear_suite_permission, max_garage_gfa_sqm, garage_capacity_cars, garage_constraint_reason, garage_permission, neighbourhood_cost_premium, max_newbuild_coa_gfa_sqm, max_build_fsi, opt_aor_gfa_sqm, opt_aor_storeys, opt_coa_gfa_sqm, opt_coa_storeys, opt_binding_constraint FROM parcels WHERE id = 237578` | `{"lot_size_confidence":"high","lot_size_basis":"3way","max_build_setback_basis":"zone_default","max_buildable_footprint_sqm":"88.90","max_build_width_m":"7.93","max_build_length_m":"20.06","max_build_height_m":"10.00","max_build_stories":2,"max_build_stories_basis":"bylaw","max_build_stories_aggressive":3,"market_exceeds_bylaw":false,"max_build_basis":"rect_approx","max_buildable_gfa_sqm":"177.80","max_buildable_gfa_basis":"coverage_box","max_build_confidence":"medium","envelope_constrained":false,"envelope_constraint_reason":null,"garden_suite_fits":true,"max_garden_suite_gfa_sqm":"60.00","max_laneway_suite_gfa_sqm":null,"rear_suite_type":"garden","max_rear_suite_gfa_sqm":"60.00","rear_suite_permission":"as_of_right","max_garage_gfa_sqm":null,"garage_capacity_cars":null,"garage_constraint_reason":"no_rear_yard","garage_permission":"not_permitted","neighbourhood_cost_premium":"1.15","max_newbuild_coa_gfa_sqm":"186.69","max_build_fsi":"0.600","opt_aor_gfa_sqm":"177.8","opt_aor_storeys":2,"opt_coa_gfa_sqm":"266.7","opt_coa_storeys":3,"opt_binding_constraint":"coverage"}` |
| Q8 | `SELECT imagery_roof_footprint_sqm, existing_width_m, existing_length_m, existing_structure_confidence, existing_other_structures_count, existing_other_structures_sqm, existing_greenspace_sqm, existing_stories, existing_height_m, existing_data_quality_flag FROM parcels WHERE id = 237578` | `{"imagery_roof_footprint_sqm":"137.38","existing_width_m":"7.70","existing_length_m":"17.83","existing_structure_confidence":"high","existing_other_structures_count":0,"existing_other_structures_sqm":"0.00","existing_greenspace_sqm":"158.95","existing_stories":null,"existing_height_m":null,"existing_data_quality_flag":null}` |
| Q9 | `SELECT pb.building_id, pb.is_primary, pb.match_type, pb.confidence, bf.footprint_area_sqm, bf.max_height_m FROM parcel_buildings pb JOIN building_footprints bf ON bf.id = pb.building_id WHERE pb.parcel_id = 237578` | `{"building_id":771877,"is_primary":true,"match_type":"centroid_in_parcel","confidence":"0.95","footprint_area_sqm":"137.38","max_height_m":"5.39"}` |
| Q10 | `SELECT round(ST_Area(ST_Buffer(geom::geography, -0))::numeric, 2) AS buffer_inset_0, round(ST_Area(ST_Buffer(geom::geography, -0.45))::numeric, 2) AS buffer_inset_0_45, round(ST_Area(ST_Buffer(geom::geography, -0.75))::numeric, 2) AS buffer_inset_0_75, round(ST_Area(ST_Buffer(geom::geography, -0.9))::numeric, 2) AS buffer_inset_0_9, round(ST_Area(ST_Buffer(geom::geography, -1.2))::numeric, 2) AS buffer_inset_1_2 FROM parcels WHERE id = 237578` | `{"buffer_inset_0":"296.38","buffer_inset_0_45":"259.05","buffer_inset_0_75":"235.06","buffer_inset_0_9":"223.34","buffer_inset_1_2":"200.44"}` |
| Q11 | `SELECT n.id AS neighbourhood_id, n.name, nsn.storeys_p50, nsn.storeys_p90, nsn.sample_count FROM neighbourhoods n LEFT JOIN neighbourhood_storey_norms nsn ON nsn.neighbourhood_id = n.id, parcels p WHERE p.id = 237578 AND ST_Contains(n.geom, ST_Centroid(p.geom)) ORDER BY n.id LIMIT 1` | `{"neighbourhood_id":127,"name":"Glenfield-Jane Heights","storeys_p50":null,"storeys_p90":null,"sample_count":null}` |
| Q11b | `SELECT storeys_p50, storeys_p90, sample_count FROM neighbourhood_storey_norms WHERE neighbourhood_id IS NULL` | `{"storeys_p50":2,"storeys_p90":3,"sample_count":6592}` |
| Q12 | `SELECT variable_key, variable_value FROM logic_variables WHERE variable_key IN ('storey_height_m','max_build_min_dimension_m','max_build_lot_min_sqm','max_build_lot_max_sqm','mislink_footprint_lot_tol','min_soft_landscaping_pct','garden_suite_min_lot_sqm','garden_suite_min_rear_yard_m','garden_suite_max_gfa_sqm','garden_suite_storeys','garage_min_lot_sqm','garage_max_gfa_sqm','garage_min_footprint_sqm','accessory_max_coverage_pct','car_footprint_sqm','reno_coa_uplift_pct','road_overlay_distance_m') ORDER BY variable_key` | `[{"variable_key":"accessory_max_coverage_pct","variable_value":"0.3"},{"variable_key":"car_footprint_sqm","variable_value":"18.5"},{"variable_key":"garage_max_gfa_sqm","variable_value":"60"},{"variable_key":"garage_min_footprint_sqm","variable_value":"18"},{"variable_key":"garage_min_lot_sqm","variable_value":"230"},{"variable_key":"garden_suite_max_gfa_sqm","variable_value":"60"},{"variable_key":"garden_suite_min_lot_sqm","variable_value":"270"},{"variable_key":"garden_suite_min_rear_yard_m","variable_value":"5"},{"variable_key":"garden_suite_storeys","variable_value":"1"},{"variable_key":"max_build_lot_max_sqm","variable_value":"2000"},{"variable_key":"max_build_lot_min_sqm","variable_value":"50"},{"variable_key":"max_build_min_dimension_m","variable_value":"3"},{"variable_key":"min_soft_landscaping_pct","variable_value":"0.3"},{"variable_key":"mislink_footprint_lot_tol","variable_value":"0.05"},{"variable_key":"reno_coa_uplift_pct","variable_value":"0.05"},{"variable_key":"road_overlay_distance_m","variable_value":"5"},{"variable_key":"storey_height_m","variable_value":"3"}]` |
| Q15 | `SELECT (SELECT count(*) FROM building_footprints o WHERE o.id <> b.id AND ST_DWithin(o.geom, b.geom, 0.00001)) AS buildings_within_1m, (SELECT count(*) FROM parcels q WHERE q.geom && b.geom AND ST_Area(ST_Intersection(q.geom, b.geom)::geography) > 5) AS parcels_spanned_over_5sqm, round(b.footprint_area_sqm, 2) AS building_footprint_sqm FROM building_footprints b WHERE b.id = (SELECT building_id FROM parcel_buildings WHERE parcel_id = 237578 AND is_primary LIMIT 1)` | `{"buildings_within_1m":"1","parcels_spanned_over_5sqm":"1","building_footprint_sqm":"137.38"}` |

### S1.1 Completeness (gates as in the 41 Derwyn Rd table; what this lot exercises)

| Gate / step (code or plan) | In operator's list? | On this lot | Fields read → written |
| --- | --- | --- | --- |
| `scope` + neighbourhood / pocket norms (citywide fallback) | N — added | Glenfield-Jane Heights; p50 2 (citywide fallback) | → `neighbourhood_id` |
| `massing` (existing building) | N — added | primary 137.38 m² (Q9; spans 1 parcel(s)) | → intermediates |
| ravine / heritage / corner / through | Y — steps 1–3 | none | flags |
| coverage overlay (NF-8) | Y — step 4 | mapped 30.00 % | → `coverage_cap` |
| lot geometry + required frontage (F1) | Y — step 5 | measured 8.83 m vs required 18.00 m | `frontage_m`, `bylaw_min_frontage_m` |
| `lot` / `tier` → `emit` | N — added | high / 3way | → `lot_size_confidence` |
| zone / exception / STAND_SET | Y — step 6 | RS (f18.0; a665); none | → `max_build_setback_basis` |
| NF-15 building type (user input) | N — added | `semi_detached` assumed; NULL branch shown | — |
| min-dimension floor → coverage-only (EF-10 / EF-11) | N — added | clear | → `envelope_constraint_reason` |
| coverage cap / NF-18 / R1 | Y — step 9 | overlay | → `coverage_cap` |
| footprint routing / NF-19 | Y — step 10 | coverage_cap | → `max_buildable_footprint_sqm` |
| storeys (ST → bylaw) | Y — step 11 | 2 (bylaw) | → `max_build_stories` |
| GFA / FSI data gap | Y — step 12 | no `d` value — FSI unregulated | → `max_buildable_gfa_sqm` |
| landscaping (NF-12..NF-14, NF-20..NF-28) | Y — step 13 | `tier_50pct` (semi) | — |
| accessory fit | N — added | garage none, garden suite fits | → accessory fields |
| houseplex / suite outputs (NF-30..NF-32) | N — added | both answers | → NF-30..NF-32 |
| "Does landscaping change MaxBuild?" | N — added | see below | — |

### Steps 1–3 — ravine / heritage / corner / through
**None apply** (Q3): ravine false (72.1 m away), heritage false, corner false, through false, laneway false. *Fields — EXISTING (as-built):* `is_in_ravine_protection_area`, `is_heritage_designated`, `is_corner_lot`, `is_through_lot`  
*Fields — NEW (NF-#/planned/user-input):* NF-4 = NF-3; NF-14 NULL  

### Step 4 — By-law coverage percentage? (NF-8)
(ii) **Yes — 30.00 %** (Q4, Q6: [{"source_id":376,"coverage_max_pct_override":30,"area_share":1}]). NF-8 = `overlay_mapped`. Houseplex / suite: 45 % applies (H9). *Fields — EXISTING (as-built):* `bylaw_max_coverage_pct`, `coverage_defaulted`  
*Fields — NEW (NF-#/planned/user-input):* NF-8  

> **H9 — §10.40.30.40(1)(D)** (RS lot coverage 45 % — houseplex / secondary suite; Appendix E, fetched 2026-09-29T14:45:17.446Z): "(D) Despite (A) above, if the numerical value on the Lot Coverage Overlay Map is less than 45 percent and the lot contains a detached houseplex, semi-detached houseplex or a residential building with a secondary suite, the maximum lot coverage for all buildings and structures on the lot is 45 percent;"

### Step 5 — Lot dimensions
(ii) 8.83 m (28.97 ft) × 33.56 m (110.10 ft), lot 296.33 m² (3189.7 ft²) (polygon 296.38 m², 5 points, `is_irregular` false; Q3). Zone label `RS (f18.0; a665)`: required frontage 18.00 m, required area 665 m² (Q4/Q5). **F1 matters:** measured frontage is RS band (B) (0.9 m), the required 18.0 m is band (D) "15.0 metres or more" (1.5 m). The lot is also far below its own required frontage (legal non-conforming). *Fields — EXISTING (as-built):* `frontage_m`, `depth_m`, `lot_size_sqm`, `bylaw_min_frontage_m`  
*Fields — NEW (NF-#/planned/user-input):* none new  

### S1.5b Lot validation — **added — not in the original list**
abs(296.33 − 296.38), abs(296.33 − 296.33), abs(296.38 − 296.33) within 0.15 × the larger → [true, true, true] → **high / 3way** (stored high / 3way); `emit` true.

### Step 6 — By-law zone
**RS**, `RS (f18.0; a665)` (polygon 5633), holding `N`, no exception, STAND_SET NULL; height overlay ["HT 10.0, ST 2"] → `bylaw_max_height_m` 10.00, `bylaw_max_stories` 2. *Fields — EXISTING (as-built):* `zoning_class`, `zoning_zn_string`, `max_build_setback_basis` = `zone_default`  
*Fields — NEW (NF-#/planned/user-input):* none new  

### Step 7 — Rules that apply

| Rule | Applies? | Value on this lot | Why | Provision |
| --- | --- | --- | --- | --- |
| Front setback | yes | NF-1 = 6.0 m (averaging research-required) | no STAND_SET | G9 (1), G19 |
| Rear setback | yes | NF-2 = GREATEST(7.5, 0.25 × 33.56) = **8.39 m** | RS depth term | G9 (2) |
| Side setback | yes | plan (on `frontage_m` 8.83): **0.9 m**; F1 (on required 18.00): **1.5 m**; × side_count 1 (party wall on the other side) | RS tiers: band (B) vs band (D) "15.0 metres or more" | G9 (3) |
| Height / storeys | yes | 10.00 m; ST 2 | Height Overlay | EF-5 row; overlay (Q6) |
| FSI | no | no `d` value → not limited | H23 (A)/(B) | H23 |
| Building length | yes | NF-10 = 17.0 m | RS base cap, not on a major street | G10 |
| Building depth | yes | NF-11 = 19.0 m (semi-detached house named) | RS | G11 |
| Coverage | yes | 30.00 % → 88.90 m² | Lot Coverage Overlay | RS (A)/(B) — the G7 text on the RS page (§6.7) |
| Front landscaping | yes | NF-12 = 50 % (6.0 ≤ 8.83 < 15.0) | semi-detached house is in L4 scope | L4, L6 |
| Rear soft | yes | NF-13 = 50 % | frontage > 6.0 | L10 |
| Driveway width | yes | NF-23 = LEAST(6.0, parking width) | 6.0 ≤ frontage ≤ 23.0 | L15 |

> **G9 — §10.40.40.70(1)-(4)** (RS setbacks (incl. major-street clause (4)); Appendix C, fetched 2026-09-29T14:45:17.446Z): "10.40.40.70 Setbacks (1) Minimum Front Yard Setback If regulation 10.5.40.70(1) does not apply, the required minimum front yard setback in the RS zone is 6.0 metres. (2) Minimum Rear Yard Setback The required minimum rear yard setback in the RS zone is the greater of: (A) 7.5 metres; or (B) 25% of the lot depth. (3) Minimum Side Yard Setback The required minimum side yard setback in the RS zone is: (A) 0.6 metres, if the required minimum lot frontage for a permitted residential building is less than 6.0 metres; (B) 0.9 metres, if the required minimum lot frontage for a permitted residential building is 6.0 metres to less than 12.0 metres; (C) 1.2 metres, if the required minimum lot frontage for a permitted residential building is 12.0 metres to less than 15.0 metres; (D) 1.5 metres, if the required minimum lot frontage for a permitted residential building is 15.0 metres or more; and (E) 1.8 metres, for a non-residential building. [ By-law: 474-2023 ] (4) Minimum Setback Requirements for Residential Buildings on Major Streets Despite (1) to (3) above, a townhouse or apartment building located on a lot abutting a major street must have the following minimum building setbacks: (A) a front yard setback of: (i) for a lot depth equal to or less than 36.0 metres: (a) if regulation 10.5.40.70(1) applies, the lesser of the front yard setback required by 10.5.40.70(1) or 6.0 metres; (b) if regulation 10.5.40.70(1) does not apply: 3.0 metres; (c) despite (a) and (b) above, if on a through lot: 6.0 metres; (ii) despite (i) above, for a lot depth greater than 36.0 metres: 6.0 metres. (B) a rear yard setback of 7.5 metres; (C) for a townhouse, a side yard setback of: (i) 0.9 metres, if all dwelling units front directly onto a street; (ii) 7.5 metres, if all dwelling units do not front directly onto a street; (D) for an apartment building, a side yard setback of: (i) 2.4 metres for all portions of the main wall that do not have primary windows; (ii) 5.5 metres for portions of the main wall that have primary windows; (iii) Despite (i) and (ii) above, 7.5 metres for all portions of the main wall exceeding a building length of 25.0 metres; and (iv) despite (i) to (iii) above, on a corner lot the required minimum side yard setback from a side lot line abutting a street is 3.0 metres; [ By-law: 1062-2025(OLT); 608-2024 ]"

> **G10 — §10.40.40.20(1)** (RS maximum building length; Appendix C, fetched 2026-09-29T14:45:17.446Z): "(1) Maximum Building Length In the RS zone, the permitted maximum building length for a permitted residential building is 17.0 metres. [ By-law: 474-2023 ]"

> **G11 — §10.40.40.30(1)** (RS maximum building depth; Appendix C, fetched 2026-09-29T14:45:17.446Z): "(1) Maximum Building Depth if Required Lot Frontage is in Specified Range In the RS zone, the rear main wall of a detached house, semi-detached house, detached houseplex or semi-detached houseplex, not including a one storey extension that complies with regulation 10.20.40.20(2), may be no more than 19.0 metres from the required front yard setback. [ By-law: 648-2025 ]"

### Step 8 — Max build from setbacks + caps (NF-17)
(ii) **Plan as written 150.67 m² (1621.8 ft²); F1 139.27; F2 134.81; F1 + F2 124.61; NF-15 NULL 150.67; as-built box 159.08.**

| Term | Existing methodology (as-built code) | New — plan formulas as written | F1 (side tier on required frontage) | F2 (length cap front-to-rear) | F1 + F2 (`calc.bylawReading`) | `building_type` NULL (plan formulas) |
| --- | --- | --- | --- | --- | --- | --- |
| front / side × side_count / rear | 6.0 / 0.9 × 1 / 7.5 (`SETBACK_DEFAULTS.RS`) | 6.0 / 0.9 × 1 / 8.39 | 6.0 / 1.5 × 1 / 8.39 | 6.0 / 0.9 × 1 / 8.39 | 6.0 / 1.5 × 1 / 8.39 | 6.0 / 0.9 × 1 / 8.39 |
| width | 8.83 − 1 × 0.9 = **7.93** | **7.93** | **7.33** | **7.93** | **7.33** | **7.93** |
| length | 33.56 − 6.0 − 7.5 = **20.06** | **19.00** | **19.00** | **17.00** | **17.00** | **19.00** |
| box | **159.08** | **150.67** | **139.27** | **134.81** | **124.61** | **150.67** |
| buffer (live PostGIS, Q10) | 259.05 (inset 0.45) | 259.05 | 235.06 | 259.05 | 235.06 | 259.05 |
| NF-17 | not persisted | **150.67** | **139.27** | **134.81** | **124.61** | **150.67** |

*Fields — EXISTING (as-built):* `width_raw`, `length_raw`, `box_area`, `buffer_area`, `max_build_width_m`, `max_build_length_m`  
*Fields — NEW (NF-#/planned/user-input):* NF-1, NF-2, NF-3, NF-10, NF-11, NF-17; EF-3, EF-4  

### Step 9 — Max build from coverage % (NF-18)
(ii) **As-built 88.90 m²** (30.00 % overlay, `AS coverage_cap`); **new NF-18 88.90**; houseplex / suite 133.35. *Fields — EXISTING (as-built):* `coverage_cap`, `coverage_defaulted`  
*Fields — NEW (NF-#/planned/user-input):* NF-18; R1  

### Step 10 — Which limit binds (NF-19); headline footprint (EF-2)
(ii) **As-built 88.90 m²** (stored 88.90; binding `coverage_cap`).

| Term | Existing methodology (as-built code) | New — plan formulas as written | F1 (side tier on required frontage) | F2 (length cap front-to-rear) | F1 + F2 (`calc.bylawReading`) | `building_type` NULL (plan formulas) |
| --- | --- | --- | --- | --- | --- | --- |
| footprint | LEAST(259.05, 159.08, 88.90) = **88.90** | R1 retire **88.90** · keep 88.90 | R1 retire **88.90** · keep 88.90 | R1 retire **88.90** · keep 88.90 | R1 retire **88.90** · keep 88.90 | R1 retire **88.90** · keep 88.90 |
| binding (NF-19) | `coverage_cap` | `coverage` | `coverage` | `coverage` | `coverage` | `coverage` |

Coverage (88.90 m²) binds in every variant — the planned setback changes only move NF-17 (150.67 → 124.61 m² under F1 + F2).

*Fields — EXISTING (as-built):* `max_buildable_footprint_sqm`, `max_buildable_gfa_basis` = `coverage_box`, `envelope_constrained` = false  
*Fields — NEW (NF-#/planned/user-input):* NF-19; EF-2, EF-10, EF-11  

### Step 11 — Height → storeys (EF-5 / EF-6)
(ii) **2 storeys**, basis `bylaw` (stored 2 / `bylaw`): `bylaw_max_stories` 2 (ST on the overlay) wins over the pocket norm. EF-5 = 10.00 m (overlay; NF-7 `overlay`) — with NF-15 NULL still 10.00 (RS height does not branch on type). *Fields — EXISTING (as-built):* `bylaw_max_height_m`, `bylaw_max_stories`, `max_build_stories*`  
*Fields — NEW (NF-#/planned/user-input):* NF-7; EF-5, EF-6, EF-7  

### Step 12 — GFA and the FSI data gap (EF-8)
(ii) **As-built 177.80 m²** (coverage_box). No `d` value in the label → FSI not limited (the FSI data gap does not arise here). 

| Term | Existing methodology (as-built code) | New — plan formulas as written | F1 (side tier on required frontage) | F2 (length cap front-to-rear) | F1 + F2 (`calc.bylawReading`) | `building_type` NULL (plan formulas) |
| --- | --- | --- | --- | --- | --- | --- |
| GFA — FSI unread | **177.80** | retire **177.80** · keep 177.80 | retire **177.80** · keep 177.80 | retire **177.80** · keep 177.80 | retire **177.80** · keep 177.80 | retire **177.80** · keep 177.80 |
| GFA — label FSI read | n/a | n/a | n/a | n/a | n/a | n/a |

> **H23 — §10.40.40.40(1)(A)(B)** (RS floor space index = zone-label "d" value; Appendix E, fetched 2026-09-29T14:45:17.446Z): "Floor Space Index In the RS zone, the permitted maximum floor space index is: (A) the numerical value following the letter "d" in the zone label on the Zoning By-law Map; or (B) if the zone label on the Zoning By-law Map does not include a "d" value on the Zoning By-law Map, the floor space index is not limited by this regulation; [ By-law: 1062-2025(OLT); 608-2024 ]"

*Fields — EXISTING (as-built):* `bylaw_max_fsi`, `bylaw_max_density`, `max_buildable_gfa_sqm`  
*Fields — NEW (NF-#/planned/user-input):* NF-9; EF-8  

### S1.12b Confidence / constraint — **added — not in the original list**
`max_build_confidence` **medium** (stored medium); `envelope_constrained` false / reason NULL (stored false / NULL).

### Step 13 — Landscaping (NF-12 / NF-20 / NF-21 / NF-22 / NF-23)
Front yard at the required setback 8.83 × 6.0 = 52.98 m² (570.3 ft²). With `building_type` = `semi_detached`: NF-22 `tier_50pct`; NF-12 50 % = 26.49 m²; NF-20 75 % = 39.73 m² (no driveway) or 37.5 % = 19.87 m² (private driveway); NF-21 derived; NF-23 cap 6.0 m, but the 50 % landscaping minimum limits a full-depth driveway to 4.42 m — **L6 binds before L15** on this frontage. With NF-15 NULL: NF-22 / NF-20 / NF-21 / NF-23 NULL. Rear soft NF-13 50 % of the rear yard (8.83 × 8.39 = 74.08 m² → 37.04 m²).

### S1.13b Accessory fit — **added — not in the original list**
rear-yard depth term 33.56 − 6.0 − 7.5 = 20.06 m; rear-yard area 20.06 × 7.93 − 137.38 (all linked footprint) = 21.70 m² → garage **none** (`not_permitted`), garden suite fits (stored: garage NULL, suite fits true).  Planned (EF-13/EF-17): garage none.

### S1.13c Houseplex / secondary suite — both answers (NF-30..NF-32) — **added — not in the original list**

| Term | Existing methodology (as-built code) | New — plan formulas as written | F1 (side tier on required frontage) | F2 (length cap front-to-rear) | F1 + F2 (`calc.bylawReading`) | `building_type` NULL (plan formulas) |
| --- | --- | --- | --- | --- | --- | --- |
| footprint — base (EF-2) | 88.90 | 88.90 (retire) · 88.90 (keep) | 88.90 (retire) · 88.90 (keep) | 88.90 (retire) · 88.90 (keep) | 88.90 (retire) · 88.90 (keep) | 88.90 · 88.90 |
| footprint — houseplex / suite (NF-30 / NF-32) | — | **133.35** `coverage` | **133.35** `coverage` | **133.35** `coverage` | **124.61** `setback` | **133.35** `coverage` |
| GFA — houseplex / suite (NF-31, no FSI) | — | **266.70** | **266.70** | **266.70** | **249.22** | **266.70** |

Coverage 30.00 % < 45 % → the houseplex / suite answer uses 45 % (133.35 m²); binding moves from coverage to coverage (45 %). No `d` value, so the FSI exemption changes nothing here. A semi-detached house with a secondary suite is not a semi-detached houseplex (H2(F)).

### S1.13d Does landscaping change MaxBuild? — **added — not in the original list**
**Main-house MaxBuild unaffected** — front landscaping governs the yard in front of the front main walls (H5), rear soft landscaping the yard behind the rear main walls (H6); both are shares of the yard the house leaves. **Where it bites:** driveway width (step 13) and the rear yard: with the house at the planned length 19.00 m the area behind it is 75.58 m², of which 50 % must be soft (L10 / L20) → at most 37.79 m² for a garage, garden suite and paving combined. As-built accessory fit: garage none, garden suite fits (60 m², as_of_right) — decided by the 30 %-of-lot greenspace test and the rear-depth / lot-size gates, not by L10/L20 (KFM-9).

### Step 14 — Summary

| Field | AS-BUILT stored | AS-BUILT recomputed | PLANNED as written (retire · keep) | F1 + F2 | NF-15 NULL |
| --- | --- | --- | --- | --- | --- |
| side × count / rear (m) | — | 0.9 × 1 / 7.5 | 0.9 × 1 / 8.39 | 1.5 × 1 / 8.39 | 0.9 |
| `max_build_width_m` / `_length_m` | 7.93 / 20.06 | 7.93 / 20.06 | 7.93 / 19.00 | 7.33 / 17.00 | 7.93 / 19.00 |
| coverage cap / NF-18 | — | 88.90 | 88.90 | 88.90 | 88.90 |
| NF-17 | — | (box 159.08) | 150.67 | 124.61 | 150.67 |
| `max_buildable_footprint_sqm` (EF-2) | 88.90 | 88.90 | 88.90 · 88.90 | 88.90 · 88.90 | 88.90 · 88.90 |
| binding | — | coverage_cap | coverage | coverage | coverage |
| `max_build_stories` | 2 | 2 | 2 | 2 | 2 |
| `max_buildable_gfa_sqm` (EF-8) | 177.80 | 177.80 | 177.80 · 177.80 | 177.80 · 177.80 | 177.80 · 177.80 |
| GFA with label FSI read | — | n/a | n/a | n/a | — |
| NF-30 / NF-31 (houseplex / suite) | — | — | 133.35 / 266.70 | 124.61 / 249.22 | 133.35 / 266.70 |
| `max_garage_gfa_sqm` | NULL | NULL | NULL | — | — |
| confidence / constrained | medium / false | medium / false | unchanged | — | — |

**Reading.** Semi-detached with a 30 % overlay: coverage decides old and new (88.90 m²); F1 would widen the side setback to 1.5 m and F2 cap the length at 17.0 m, but both only shrink NF-17. With a secondary suite the cap rises to 45 % (133.35 m²) and the setback envelope binds under F1 + F2 (124.61 m²). Storeys come from the overlay's ST 2.

## Worked example — 68 Cordella Avenue (semi-detached, no coverage overlay: old vs new)

> **Status:** AS-BUILT read from the local dev DB (read-only snapshot, captured 2026-09-29T16:51:17.552Z, `spec67-gen/excap.js`, SELECT only) and recomputed from the `buildMaxBuildSql` formulas: **all 27 recomputed as-built values equal the stored values**. PLANNED = the plan's formulas as written with `building_type` = `semi_detached` (NF-15, user input); F1/F2 = findings pending panel ruling; the last column shows NF-15 NULL ("NULL, don't guess"). **Semi-detached, coverage unmapped.** As-built fills coverage with the RS median; the new approach lets the setbacks and caps decide — and the label FSI 0.6 then decides GFA.

### S2.0 Parcel selection, building type and data snapshot
**Selection (Q1):** RS, coverage unmapped, regular, not ravine / heritage / corner / through / laneway, lot confidence high, one unambiguous zone polygon, no STAND_SET / exception / holding, frontage 6.5–9.5 m, ordered by closeness to 7.6 m × 33 m, with the massing shared-wall test. **Chosen: id 194039 (parcel_id 5354223) — 68 Cordella Ave**; no candidate has a separately-mapped half touching exactly one neighbour; the first candidate whose single primary footprint spans exactly two parcels (a semi pair captured as one polygon) is chosen.

**Building type — permitted and corroborated.** A semi-detached house is a permitted residential building type in the RS zone (H19, quoted below; definition H21). Corroboration from massing (Q15): the primary building footprint is 115.72 m², lies within ~1 m of 0 other building footprint(s) and overlaps 2 parcel(s) by more than 5 m² — one footprint covering two parcels: consistent with a semi-detached pair mapped as one polygon (massing link `nearest`, confidence 0.60 — Q9). The building type itself is **not a column** (NF-15 user input); it is assumed here and every branch that needs it is also shown with NF-15 NULL.

> **H19 — §10.40.20.20(1)** (RS permitted residential building types; Appendix E, fetched 2026-09-29T14:45:17.446Z): "In the RS Zone, a dwelling unit is permitted in the following residential building types: (A) Detached House; (B) Semi-detached House; (C) Detached Houseplex; [ By-law: 648-2025 ] (D) Semi-Detached Houseplex; and [ By-law: 648-2025 ] (E) (Deleted by By-law 648-2025) [ By-law: 648-2025 ] (F) Townhouse if the lot abuts a major street; and (G) Apartment Building if the lot abuts a major street."

> **H21 — §800.50(745)** (Semi-Detached House (definition); Appendix E, fetched 2026-09-29T14:45:16.969Z): "(745) Semi-Detached House means a building that has two dwelling units, and no dwelling unit is entirely or partially above another."

| Q | SQL (as executed) | Result |
| --- | --- | --- |
| Q1 | `WITH c AS (SELECT p.id, p.address_number, p.linear_name_full, p.frontage_m, p.depth_m, p.lot_size_sqm, p.zoning_zn_string, p.bylaw_max_coverage_pct, p.bylaw_max_height_m, p.bylaw_max_density, p.bylaw_min_frontage_m, (SELECT pb.building_id FROM parcel_buildings pb WHERE pb.parcel_id = p.id AND pb.is_primary LIMIT 1) AS bid FROM parcels p WHERE p.zoning_class = 'RS' AND p.bylaw_max_coverage_pct IS NULL AND p.is_irregular = false AND NOT COALESCE(p.is_in_ravine_protection_area, false) AND NOT COALESCE(p.is_heritage_designated, false) AND NOT COALESCE(p.is_corner_lot, false) AND NOT COALESCE(p.is_through_lot, false) AND NOT COALESCE(p.abuts_laneway, false) AND p.lot_size_confidence = 'high' AND NOT COALESCE(p.zoning_is_ambiguous, false) AND p.bylaw_standard_setback_m IS NULL AND p.exception_number IS NULL AND p.zoning_holding = 'N' AND p.frontage_m BETWEEN 6.5 AND 9.5 AND p.depth_m >= 0 AND p.address_number IS NOT NULL AND p.address_number <> 'None' AND p.bylaw_max_height_m IS NOT NULL AND p.max_buildable_footprint_sqm IS NOT NULL AND (SELECT count(*) FROM parcel_buildings pb WHERE pb.parcel_id = p.id) = 1 AND EXISTS (SELECT 1 FROM parcel_buildings pb WHERE pb.parcel_id = p.id AND pb.is_primary) ORDER BY abs(p.frontage_m - 7.6) + abs(p.depth_m - 33) / 3, p.id LIMIT 6) SELECT c.id, c.address_number, c.linear_name_full, c.frontage_m, c.depth_m, c.lot_size_sqm, c.zoning_zn_string, c.bylaw_max_coverage_pct, c.bylaw_max_height_m, c.bylaw_max_density, c.bylaw_min_frontage_m, (SELECT count(*) FROM building_footprints o, building_footprints b WHERE b.id = c.bid AND o.id <> b.id AND ST_DWithin(o.geom, b.geom, 0.00001)) AS buildings_within_1m, (SELECT count(*) FROM parcels q, building_footprints b WHERE b.id = c.bid AND q.geom && b.geom AND ST_Area(ST_Intersection(q.geom, b.geom)::geography) > 5) AS parcels_spanned FROM c` | `[{"id":194039,"address_number":"68","linear_name_full":"Cordella Ave","frontage_m":"7.73","depth_m":"33.51","lot_size_sqm":"259.16","zoning_zn_string":"RS (f18.0; a550; d0.6)","bylaw_max_coverage_pct":null,"bylaw_max_height_m":"11.00","bylaw_max_density":"0.60","bylaw_min_frontage_m":"18.00","buildings_within_1m":"0","parcels_spanned":"2"},{"id":263380,"address_number":"66","linear_name_full":"Cordella Ave","frontage_m":"7.73","depth_m":"33.52","lot_size_sqm":"259.08","zoning_zn_string":"RS (f18.0; a550; d0.6)","bylaw_max_coverage_pct":null,"bylaw_max_height_m":"11.00","bylaw_max_density":"0.60","bylaw_min_frontage_m":"18.00","buildings_within_1m":"0","parcels_spanned":"2"},{"id":101194,"address_number":"82","linear_name_full":"Cordella Ave","frontage_m":"7.33","depth_m":"33.50","lot_size_sqm":"245.64","zoning_zn_string":"RS (f18.0; a550; d0.6)","bylaw_max_coverage_pct":null,"bylaw_max_height_m":"11.00","bylaw_max_density":"0.60","bylaw_min_frontage_m":"18.00","buildings_within_1m":"0","parcels_spanned":"2"},{"id":217160,"address_number":"78","linear_name_full":"Cordella Ave","frontage_m":"7.33","depth_m":"33.50","lot_size_sqm":"245.64","zoning_zn_string":"RS (f18.0; a550; d0.6)","bylaw_max_coverage_pct":null,"bylaw_max_height_m":"11.00","bylaw_max_density":"0.60","bylaw_min_frontage_m":"18.00","buildings_within_1m":"0","parcels_spanned":"2"},{"id":217162,"address_number":"80","linear_name_full":"Cordella Ave","frontage_m":"7.33","depth_m":"33.50","lot_size_sqm":"245.64","zoning_zn_string":"RS (f18.0; a550; d0.6)","bylaw_max_coverage_pct":null,"bylaw_max_height_m":"11.00","bylaw_max_density":"0.60","bylaw_min_frontage_m":"18.00","buildings_within_1m":"0","parcels_spanned":"2"},{"id":147203,"address_number":"84","linear_name_full":"Cordella Ave","frontage_m":"7.33","depth_m":"33.51","lot_size_sqm":"245.64","zoning_zn_string":"RS (f18.0; a550; d0.6)","bylaw_max_coverage_pct":null,"bylaw_max_height_m":"11.00","bylaw_max_density":"0.60","bylaw_min_frontage_m":"18.00","buildings_within_1m":"0","parcels_spanned":"2"}]` |
| Q2 | `SELECT ap.address_point_id, ap.address_full, ap.address_class_desc FROM address_points ap, parcels p WHERE p.id = 194039 AND ST_Contains(p.geom, ap.geom) ORDER BY ap.address_full` | `{"address_point_id":8593977,"address_full":"68 Cordella Ave","address_class_desc":"Land"}` |
| Q3 | `SELECT id, parcel_id, address_number, linear_name_full, lot_size_sqm, lot_size_sqft, frontage_m, frontage_ft, depth_m, depth_ft, is_irregular, stated_area_raw, lot_size_source, round(ST_Area(geom::geography)::numeric, 2) AS geom_area_sqm, ST_NPoints(geom) AS geom_npoints, is_in_ravine_protection_area, round(ravine_distance_m::numeric, 1) AS ravine_distance_m, is_heritage_designated, heritage_designation_type, is_corner_lot, is_through_lot, abuts_laneway, primary_frontage_street_name, neighbourhood_id FROM parcels WHERE id = 194039` | `{"id":194039,"parcel_id":"5354223","address_number":"68","linear_name_full":"Cordella Ave","lot_size_sqm":"259.16","lot_size_sqft":"2789.57","frontage_m":"7.73","frontage_ft":"25.36","depth_m":"33.51","depth_ft":"109.94","is_irregular":false,"stated_area_raw":"259.16 sq.m","lot_size_source":"stated","geom_area_sqm":"259.23","geom_npoints":7,"is_in_ravine_protection_area":false,"ravine_distance_m":"61.9","is_heritage_designated":false,"heritage_designation_type":null,"is_corner_lot":false,"is_through_lot":false,"abuts_laneway":false,"primary_frontage_street_name":"Cordella Ave","neighbourhood_id":77}` |
| Q4 | `SELECT zoning_class, zoning_zn_string, zoning_holding, zone_status, zoning_is_ambiguous, zoning_dominant_area_share, zoning_base_source_id, exception_number, exception_text, bylaw_standard_setback_m, bylaw_min_frontage_m, bylaw_min_area_sqm, bylaw_max_coverage_pct, bylaw_max_height_m, bylaw_max_stories, bylaw_max_fsi, bylaw_max_density, bylaw_max_units, on_policy_road, in_policy_area, on_priority_retail, in_building_setback_overlay, zoning_overlays FROM parcels WHERE id = 194039` | `{"zoning_class":"RS","zoning_zn_string":"RS (f18.0; a550; d0.6)","zoning_holding":"N","zone_status":2,"zoning_is_ambiguous":false,"zoning_dominant_area_share":"1.0000","zoning_base_source_id":3409,"exception_number":null,"exception_text":"N","bylaw_standard_setback_m":null,"bylaw_min_frontage_m":"18.00","bylaw_min_area_sqm":550,"bylaw_max_coverage_pct":null,"bylaw_max_height_m":"11.00","bylaw_max_stories":3,"bylaw_max_fsi":null,"bylaw_max_density":"0.60","bylaw_max_units":null,"on_policy_road":false,"in_policy_area":false,"on_priority_retail":false,"in_building_setback_overlay":false,"zoning_overlays":{"base":[{"zn_zone":"RS","source_id":3409,"area_share":1}],"height_overlay":{"applied":true,"stories":3,"height_max_m":11}}}` |
| Q5 | `SELECT source_id, zn_zone, zn_string, frontage_min_m, area_min_sqm, density_max, fsi_max, coverage_max_pct, standard_setback, exception_number FROM zoning_bylaw_areas WHERE source_id = (SELECT zoning_base_source_id FROM parcels WHERE id = 194039)` | `{"source_id":3409,"zn_zone":"RS","zn_string":"RS (f18.0; a550; d0.6)","frontage_min_m":"18.00","area_min_sqm":550,"density_max":"0.60","fsi_max":null,"coverage_max_pct":null,"standard_setback":null,"exception_number":null}` |
| Q6 | `SELECT (SELECT json_agg(json_build_object('source_id', h.source_id, 'ht_string', h.ht_string, 'height_max_m', h.height_max_m, 'ht_stories', h.ht_stories)) FROM zoning_height_overlay h WHERE ST_Intersects(h.geom, p.geom) AND NOT ST_Touches(h.geom, p.geom)) AS height_overlay, (SELECT json_agg(json_build_object('source_id', c.source_id, 'coverage_max_pct_override', c.coverage_max_pct_override, 'area_share', round((ST_Area(ST_Intersection(c.geom, p.geom)::geography) / ST_Area(p.geom::geography))::numeric, 4))) FROM zoning_lot_coverage_overlay c WHERE ST_Intersects(c.geom, p.geom) AND NOT ST_Touches(c.geom, p.geom)) AS coverage_overlay FROM parcels p WHERE p.id = 194039` | `{"height_overlay":[{"source_id":1579,"ht_string":"HT 11.0, ST 3","height_max_m":11,"ht_stories":3}],"coverage_overlay":null}` |
| Q7 | `SELECT lot_size_confidence, lot_size_basis, max_build_setback_basis, max_buildable_footprint_sqm, max_build_width_m, max_build_length_m, max_build_height_m, max_build_stories, max_build_stories_basis, max_build_stories_aggressive, market_exceeds_bylaw, max_build_basis, max_buildable_gfa_sqm, max_buildable_gfa_basis, max_build_confidence, envelope_constrained, envelope_constraint_reason, garden_suite_fits, max_garden_suite_gfa_sqm, max_laneway_suite_gfa_sqm, rear_suite_type, max_rear_suite_gfa_sqm, rear_suite_permission, max_garage_gfa_sqm, garage_capacity_cars, garage_constraint_reason, garage_permission, neighbourhood_cost_premium, max_newbuild_coa_gfa_sqm, max_build_fsi, opt_aor_gfa_sqm, opt_aor_storeys, opt_coa_gfa_sqm, opt_coa_storeys, opt_binding_constraint FROM parcels WHERE id = 194039` | `{"lot_size_confidence":"high","lot_size_basis":"3way","max_build_setback_basis":"zone_default","max_buildable_footprint_sqm":"85.52","max_build_width_m":"6.83","max_build_length_m":"20.01","max_build_height_m":"11.00","max_build_stories":3,"max_build_stories_basis":"bylaw","max_build_stories_aggressive":3,"market_exceeds_bylaw":false,"max_build_basis":"rect_approx","max_buildable_gfa_sqm":"256.56","max_buildable_gfa_basis":"coverage_box","max_build_confidence":"medium","envelope_constrained":false,"envelope_constraint_reason":null,"garden_suite_fits":false,"max_garden_suite_gfa_sqm":null,"max_laneway_suite_gfa_sqm":null,"rear_suite_type":null,"max_rear_suite_gfa_sqm":null,"rear_suite_permission":"not_permitted","max_garage_gfa_sqm":null,"garage_capacity_cars":null,"garage_constraint_reason":"no_rear_yard","garage_permission":"not_permitted","neighbourhood_cost_premium":"1.15","max_newbuild_coa_gfa_sqm":"269.39","max_build_fsi":"0.990","opt_aor_gfa_sqm":"171.04","opt_aor_storeys":2,"opt_coa_gfa_sqm":"256.56","opt_coa_storeys":3,"opt_binding_constraint":"coverage"}` |
| Q8 | `SELECT imagery_roof_footprint_sqm, existing_width_m, existing_length_m, existing_structure_confidence, existing_other_structures_count, existing_other_structures_sqm, existing_greenspace_sqm, existing_stories, existing_height_m, existing_data_quality_flag FROM parcels WHERE id = 194039` | `{"imagery_roof_footprint_sqm":"115.72","existing_width_m":"9.38","existing_length_m":"12.34","existing_structure_confidence":"low","existing_other_structures_count":0,"existing_other_structures_sqm":"0.00","existing_greenspace_sqm":"143.44","existing_stories":null,"existing_height_m":null,"existing_data_quality_flag":null}` |
| Q9 | `SELECT pb.building_id, pb.is_primary, pb.match_type, pb.confidence, bf.footprint_area_sqm, bf.max_height_m FROM parcel_buildings pb JOIN building_footprints bf ON bf.id = pb.building_id WHERE pb.parcel_id = 194039` | `{"building_id":500940,"is_primary":true,"match_type":"nearest","confidence":"0.60","footprint_area_sqm":"115.72","max_height_m":"8.73"}` |
| Q10 | `SELECT round(ST_Area(ST_Buffer(geom::geography, -0))::numeric, 2) AS buffer_inset_0, round(ST_Area(ST_Buffer(geom::geography, -0.45))::numeric, 2) AS buffer_inset_0_45, round(ST_Area(ST_Buffer(geom::geography, -0.75))::numeric, 2) AS buffer_inset_0_75, round(ST_Area(ST_Buffer(geom::geography, -0.9))::numeric, 2) AS buffer_inset_0_9, round(ST_Area(ST_Buffer(geom::geography, -1.2))::numeric, 2) AS buffer_inset_1_2 FROM parcels WHERE id = 194039` | `{"buffer_inset_0":"259.23","buffer_inset_0_45":"222.89","buffer_inset_0_75":"199.56","buffer_inset_0_9":"188.16","buffer_inset_1_2":"165.92"}` |
| Q11 | `SELECT n.id AS neighbourhood_id, n.name, nsn.storeys_p50, nsn.storeys_p90, nsn.sample_count FROM neighbourhoods n LEFT JOIN neighbourhood_storey_norms nsn ON nsn.neighbourhood_id = n.id, parcels p WHERE p.id = 194039 AND ST_Contains(n.geom, ST_Centroid(p.geom)) ORDER BY n.id LIMIT 1` | `{"neighbourhood_id":77,"name":"Rockcliffe-Smythe","storeys_p50":2,"storeys_p90":3,"sample_count":40}` |
| Q11b | `SELECT storeys_p50, storeys_p90, sample_count FROM neighbourhood_storey_norms WHERE neighbourhood_id IS NULL` | `{"storeys_p50":2,"storeys_p90":3,"sample_count":6592}` |
| Q12 | `SELECT variable_key, variable_value FROM logic_variables WHERE variable_key IN ('storey_height_m','max_build_min_dimension_m','max_build_lot_min_sqm','max_build_lot_max_sqm','mislink_footprint_lot_tol','min_soft_landscaping_pct','garden_suite_min_lot_sqm','garden_suite_min_rear_yard_m','garden_suite_max_gfa_sqm','garden_suite_storeys','garage_min_lot_sqm','garage_max_gfa_sqm','garage_min_footprint_sqm','accessory_max_coverage_pct','car_footprint_sqm','reno_coa_uplift_pct','road_overlay_distance_m') ORDER BY variable_key` | `[{"variable_key":"accessory_max_coverage_pct","variable_value":"0.3"},{"variable_key":"car_footprint_sqm","variable_value":"18.5"},{"variable_key":"garage_max_gfa_sqm","variable_value":"60"},{"variable_key":"garage_min_footprint_sqm","variable_value":"18"},{"variable_key":"garage_min_lot_sqm","variable_value":"230"},{"variable_key":"garden_suite_max_gfa_sqm","variable_value":"60"},{"variable_key":"garden_suite_min_lot_sqm","variable_value":"270"},{"variable_key":"garden_suite_min_rear_yard_m","variable_value":"5"},{"variable_key":"garden_suite_storeys","variable_value":"1"},{"variable_key":"max_build_lot_max_sqm","variable_value":"2000"},{"variable_key":"max_build_lot_min_sqm","variable_value":"50"},{"variable_key":"max_build_min_dimension_m","variable_value":"3"},{"variable_key":"min_soft_landscaping_pct","variable_value":"0.3"},{"variable_key":"mislink_footprint_lot_tol","variable_value":"0.05"},{"variable_key":"reno_coa_uplift_pct","variable_value":"0.05"},{"variable_key":"road_overlay_distance_m","variable_value":"5"},{"variable_key":"storey_height_m","variable_value":"3"}]` |
| Q15 | `SELECT (SELECT count(*) FROM building_footprints o WHERE o.id <> b.id AND ST_DWithin(o.geom, b.geom, 0.00001)) AS buildings_within_1m, (SELECT count(*) FROM parcels q WHERE q.geom && b.geom AND ST_Area(ST_Intersection(q.geom, b.geom)::geography) > 5) AS parcels_spanned_over_5sqm, round(b.footprint_area_sqm, 2) AS building_footprint_sqm FROM building_footprints b WHERE b.id = (SELECT building_id FROM parcel_buildings WHERE parcel_id = 194039 AND is_primary LIMIT 1)` | `{"buildings_within_1m":"0","parcels_spanned_over_5sqm":"2","building_footprint_sqm":"115.72"}` |

### S2.1 Completeness (gates as in the 41 Derwyn Rd table; what this lot exercises)

| Gate / step (code or plan) | In operator's list? | On this lot | Fields read → written |
| --- | --- | --- | --- |
| `scope` + neighbourhood / pocket norms (citywide fallback) | N — added | Rockcliffe-Smythe; p50 2 | → `neighbourhood_id` |
| `massing` (existing building) | N — added | primary 115.72 m² (Q9; spans 2 parcel(s)) | → intermediates |
| ravine / heritage / corner / through | Y — steps 1–3 | none | flags |
| coverage overlay (NF-8) | Y — step 4 | **unmapped** → as-built median 33 % | → `coverage_cap` |
| lot geometry + required frontage (F1) | Y — step 5 | measured 7.73 m vs required 18.00 m | `frontage_m`, `bylaw_min_frontage_m` |
| `lot` / `tier` → `emit` | N — added | high / 3way | → `lot_size_confidence` |
| zone / exception / STAND_SET | Y — step 6 | RS (f18.0; a550; d0.6); none | → `max_build_setback_basis` |
| NF-15 building type (user input) | N — added | `semi_detached` assumed; NULL branch shown | — |
| min-dimension floor → coverage-only (EF-10 / EF-11) | N — added | clear | → `envelope_constraint_reason` |
| coverage cap / NF-18 / R1 | Y — step 9 | median default | → `coverage_cap` |
| footprint routing / NF-19 | Y — step 10 | coverage_cap | → `max_buildable_footprint_sqm` |
| storeys (ST → bylaw) | Y — step 11 | 3 (bylaw) | → `max_build_stories` |
| GFA / FSI data gap | Y — step 12 | label `d0.6` unread | → `max_buildable_gfa_sqm` |
| landscaping (NF-12..NF-14, NF-20..NF-28) | Y — step 13 | `tier_50pct` (semi) | — |
| accessory fit | N — added | garage none, garden suite does not fit | → accessory fields |
| houseplex / suite outputs (NF-30..NF-32) | N — added | both answers | → NF-30..NF-32 |
| "Does landscaping change MaxBuild?" | N — added | see below | — |

### Steps 1–3 — ravine / heritage / corner / through
**None apply** (Q3): ravine false (61.9 m away), heritage false, corner false, through false, laneway false. *Fields — EXISTING (as-built):* `is_in_ravine_protection_area`, `is_heritage_designated`, `is_corner_lot`, `is_through_lot`  
*Fields — NEW (NF-#/planned/user-input):* NF-4 = NF-3; NF-14 NULL  

### Step 4 — By-law coverage percentage? (NF-8)
(ii) **No** (Q4, Q6: null). NF-8 = `unregulated`. As-built fills it with the zone median `COVERAGE_DEFAULTS.RS` = 33 % (`COALESCE(bylaw_max_coverage_pct, `…); the by-law applies no coverage (G7(B) analogue on the RS page). Houseplex / suite: no overlay value for clause (D) to replace (H9) — unchanged. *Fields — EXISTING (as-built):* `bylaw_max_coverage_pct`, `coverage_defaulted`  
*Fields — NEW (NF-#/planned/user-input):* NF-8  

> **H9 — §10.40.30.40(1)(D)** (RS lot coverage 45 % — houseplex / secondary suite; Appendix E, fetched 2026-09-29T14:45:17.446Z): "(D) Despite (A) above, if the numerical value on the Lot Coverage Overlay Map is less than 45 percent and the lot contains a detached houseplex, semi-detached houseplex or a residential building with a secondary suite, the maximum lot coverage for all buildings and structures on the lot is 45 percent;"

### Step 5 — Lot dimensions
(ii) 7.73 m (25.36 ft) × 33.51 m (109.94 ft), lot 259.16 m² (2789.6 ft²) (polygon 259.23 m², 7 points, `is_irregular` false; Q3). Zone label `RS (f18.0; a550; d0.6)`: required frontage 18.00 m, required area 550 m² (Q4/Q5). **F1 matters:** measured frontage is band (B) (0.9 m), required 18.0 m band (D) (1.5 m). *Fields — EXISTING (as-built):* `frontage_m`, `depth_m`, `lot_size_sqm`, `bylaw_min_frontage_m`  
*Fields — NEW (NF-#/planned/user-input):* none new  

### S2.5b Lot validation — **added — not in the original list**
abs(259.16 − 259.23), abs(259.16 − 259.03), abs(259.23 − 259.03) within 0.15 × the larger → [true, true, true] → **high / 3way** (stored high / 3way); `emit` true.

### Step 6 — By-law zone
**RS**, `RS (f18.0; a550; d0.6)` (polygon 3409), holding `N`, no exception, STAND_SET NULL; height overlay ["HT 11.0, ST 3"] → `bylaw_max_height_m` 11.00, `bylaw_max_stories` 3. *Fields — EXISTING (as-built):* `zoning_class`, `zoning_zn_string`, `max_build_setback_basis` = `zone_default`  
*Fields — NEW (NF-#/planned/user-input):* none new  

### Step 7 — Rules that apply

| Rule | Applies? | Value on this lot | Why | Provision |
| --- | --- | --- | --- | --- |
| Front setback | yes | NF-1 = 6.0 m (averaging research-required) | no STAND_SET | G9 (1), G19 |
| Rear setback | yes | NF-2 = GREATEST(7.5, 0.25 × 33.51) = **8.38 m** | RS depth term | G9 (2) |
| Side setback | yes | plan (on `frontage_m` 7.73): **0.9 m**; F1 (on required 18.00): **1.5 m**; × side_count 1 (party wall on the other side) | RS tiers: band (B) vs band (D) "15.0 metres or more" | G9 (3) |
| Height / storeys | yes | 11.00 m; ST 3 | Height Overlay | EF-5 row; overlay (Q6) |
| FSI | yes | d0.6 → 155.50 m² (held in `bylaw_max_density`) | H23 (A)/(B) | H23 |
| Building length | yes | NF-10 = 17.0 m | RS base cap, not on a major street | G10 |
| Building depth | yes | NF-11 = 19.0 m (semi-detached house named) | RS | G11 |
| Coverage | **no** | unregulated; as-built median 33 % | Lot Coverage Overlay | RS (A)/(B) — the G7 text on the RS page (§6.7) |
| Front landscaping | yes | NF-12 = 50 % (6.0 ≤ 7.73 < 15.0) | semi-detached house is in L4 scope | L4, L6 |
| Rear soft | yes | NF-13 = 50 % | frontage > 6.0 | L10 |
| Driveway width | yes | NF-23 = LEAST(6.0, parking width) | 6.0 ≤ frontage ≤ 23.0 | L15 |

> **G9 — §10.40.40.70(1)-(4)** (RS setbacks (incl. major-street clause (4)); Appendix C, fetched 2026-09-29T14:45:17.446Z): "10.40.40.70 Setbacks (1) Minimum Front Yard Setback If regulation 10.5.40.70(1) does not apply, the required minimum front yard setback in the RS zone is 6.0 metres. (2) Minimum Rear Yard Setback The required minimum rear yard setback in the RS zone is the greater of: (A) 7.5 metres; or (B) 25% of the lot depth. (3) Minimum Side Yard Setback The required minimum side yard setback in the RS zone is: (A) 0.6 metres, if the required minimum lot frontage for a permitted residential building is less than 6.0 metres; (B) 0.9 metres, if the required minimum lot frontage for a permitted residential building is 6.0 metres to less than 12.0 metres; (C) 1.2 metres, if the required minimum lot frontage for a permitted residential building is 12.0 metres to less than 15.0 metres; (D) 1.5 metres, if the required minimum lot frontage for a permitted residential building is 15.0 metres or more; and (E) 1.8 metres, for a non-residential building. [ By-law: 474-2023 ] (4) Minimum Setback Requirements for Residential Buildings on Major Streets Despite (1) to (3) above, a townhouse or apartment building located on a lot abutting a major street must have the following minimum building setbacks: (A) a front yard setback of: (i) for a lot depth equal to or less than 36.0 metres: (a) if regulation 10.5.40.70(1) applies, the lesser of the front yard setback required by 10.5.40.70(1) or 6.0 metres; (b) if regulation 10.5.40.70(1) does not apply: 3.0 metres; (c) despite (a) and (b) above, if on a through lot: 6.0 metres; (ii) despite (i) above, for a lot depth greater than 36.0 metres: 6.0 metres. (B) a rear yard setback of 7.5 metres; (C) for a townhouse, a side yard setback of: (i) 0.9 metres, if all dwelling units front directly onto a street; (ii) 7.5 metres, if all dwelling units do not front directly onto a street; (D) for an apartment building, a side yard setback of: (i) 2.4 metres for all portions of the main wall that do not have primary windows; (ii) 5.5 metres for portions of the main wall that have primary windows; (iii) Despite (i) and (ii) above, 7.5 metres for all portions of the main wall exceeding a building length of 25.0 metres; and (iv) despite (i) to (iii) above, on a corner lot the required minimum side yard setback from a side lot line abutting a street is 3.0 metres; [ By-law: 1062-2025(OLT); 608-2024 ]"

> **G10 — §10.40.40.20(1)** (RS maximum building length; Appendix C, fetched 2026-09-29T14:45:17.446Z): "(1) Maximum Building Length In the RS zone, the permitted maximum building length for a permitted residential building is 17.0 metres. [ By-law: 474-2023 ]"

> **G11 — §10.40.40.30(1)** (RS maximum building depth; Appendix C, fetched 2026-09-29T14:45:17.446Z): "(1) Maximum Building Depth if Required Lot Frontage is in Specified Range In the RS zone, the rear main wall of a detached house, semi-detached house, detached houseplex or semi-detached houseplex, not including a one storey extension that complies with regulation 10.20.40.20(2), may be no more than 19.0 metres from the required front yard setback. [ By-law: 648-2025 ]"

### Step 8 — Max build from setbacks + caps (NF-17)
(ii) **Plan as written 129.77 m² (1396.8 ft²); F1 118.37; F2 116.11; F1 + F2 105.91; NF-15 NULL 129.77; as-built box 136.67.**

| Term | Existing methodology (as-built code) | New — plan formulas as written | F1 (side tier on required frontage) | F2 (length cap front-to-rear) | F1 + F2 (`calc.bylawReading`) | `building_type` NULL (plan formulas) |
| --- | --- | --- | --- | --- | --- | --- |
| front / side × side_count / rear | 6.0 / 0.9 × 1 / 7.5 (`SETBACK_DEFAULTS.RS`) | 6.0 / 0.9 × 1 / 8.38 | 6.0 / 1.5 × 1 / 8.38 | 6.0 / 0.9 × 1 / 8.38 | 6.0 / 1.5 × 1 / 8.38 | 6.0 / 0.9 × 1 / 8.38 |
| width | 7.73 − 1 × 0.9 = **6.83** | **6.83** | **6.23** | **6.83** | **6.23** | **6.83** |
| length | 33.51 − 6.0 − 7.5 = **20.01** | **19.00** | **19.00** | **17.00** | **17.00** | **19.00** |
| box | **136.67** | **129.77** | **118.37** | **116.11** | **105.91** | **129.77** |
| buffer (live PostGIS, Q10) | 222.89 (inset 0.45) | 222.89 | 199.56 | 222.89 | 199.56 | 222.89 |
| NF-17 | not persisted | **129.77** | **118.37** | **116.11** | **105.91** | **129.77** |

*Fields — EXISTING (as-built):* `width_raw`, `length_raw`, `box_area`, `buffer_area`, `max_build_width_m`, `max_build_length_m`  
*Fields — NEW (NF-#/planned/user-input):* NF-1, NF-2, NF-3, NF-10, NF-11, NF-17; EF-3, EF-4  

### Step 9 — Max build from coverage % (NF-18)
(ii) **As-built 85.52 m²** (median 33 %, `coverage_defaulted` TRUE, `AS coverage_cap`); **new NF-18 NULL** (unregulated); houseplex / suite NULL. *Fields — EXISTING (as-built):* `coverage_cap`, `coverage_defaulted`  
*Fields — NEW (NF-#/planned/user-input):* NF-18; R1  

### Step 10 — Which limit binds (NF-19); headline footprint (EF-2)
(ii) **As-built 85.52 m²** (stored 85.52; binding `coverage_cap`).

| Term | Existing methodology (as-built code) | New — plan formulas as written | F1 (side tier on required frontage) | F2 (length cap front-to-rear) | F1 + F2 (`calc.bylawReading`) | `building_type` NULL (plan formulas) |
| --- | --- | --- | --- | --- | --- | --- |
| footprint | LEAST(222.89, 136.67, 85.52) = **85.52** | R1 retire **129.77** · keep 85.52 | R1 retire **118.37** · keep 85.52 | R1 retire **116.11** · keep 85.52 | R1 retire **105.91** · keep 85.52 | R1 retire **129.77** · keep 85.52 |
| binding (NF-19) | `coverage_cap` | `setback` | `setback` | `setback` | `setback` | `setback` |

The median (85.52 m²) binds as-built; with R1 retired NF-17 decides (129.77 as written, 105.91 under F1 + F2) — a larger footprint than today.

*Fields — EXISTING (as-built):* `max_buildable_footprint_sqm`, `max_buildable_gfa_basis` = `coverage_box`, `envelope_constrained` = false  
*Fields — NEW (NF-#/planned/user-input):* NF-19; EF-2, EF-10, EF-11  

### Step 11 — Height → storeys (EF-5 / EF-6)
(ii) **3 storeys**, basis `bylaw` (stored 3 / `bylaw`): `bylaw_max_stories` 3 (ST on the overlay) wins over the pocket norm. EF-5 = 11.00 m (overlay; NF-7 `overlay`) — with NF-15 NULL still 11.00 (RS height does not branch on type). *Fields — EXISTING (as-built):* `bylaw_max_height_m`, `bylaw_max_stories`, `max_build_stories*`  
*Fields — NEW (NF-#/planned/user-input):* NF-7; EF-5, EF-6, EF-7  

### Step 12 — GFA and the FSI data gap (EF-8)
(ii) **As-built 256.56 m²** (coverage_box). Label `d0.6` sits in `bylaw_max_density`; `bylaw_max_fsi` NULL → FSI unread; with the fix FSI caps GFA at 155.50 m². 

| Term | Existing methodology (as-built code) | New — plan formulas as written | F1 (side tier on required frontage) | F2 (length cap front-to-rear) | F1 + F2 (`calc.bylawReading`) | `building_type` NULL (plan formulas) |
| --- | --- | --- | --- | --- | --- | --- |
| GFA — FSI unread | **256.56** | retire **389.31** · keep 256.56 | retire **355.11** · keep 256.56 | retire **348.33** · keep 256.56 | retire **317.73** · keep 256.56 | retire **389.31** · keep 256.56 |
| GFA — label FSI read | 155.50 | **155.50** · keep 155.50 | **155.50** · keep 155.50 | **155.50** · keep 155.50 | **155.50** · keep 155.50 | 155.50 |

> **H23 — §10.40.40.40(1)(A)(B)** (RS floor space index = zone-label "d" value; Appendix E, fetched 2026-09-29T14:45:17.446Z): "Floor Space Index In the RS zone, the permitted maximum floor space index is: (A) the numerical value following the letter "d" in the zone label on the Zoning By-law Map; or (B) if the zone label on the Zoning By-law Map does not include a "d" value on the Zoning By-law Map, the floor space index is not limited by this regulation; [ By-law: 1062-2025(OLT); 608-2024 ]"

*Fields — EXISTING (as-built):* `bylaw_max_fsi`, `bylaw_max_density`, `max_buildable_gfa_sqm`  
*Fields — NEW (NF-#/planned/user-input):* NF-9; EF-8  

### S2.12b Confidence / constraint — **added — not in the original list**
`max_build_confidence` **medium** (stored medium); `envelope_constrained` false / reason NULL (stored false / NULL).

### Step 13 — Landscaping (NF-12 / NF-20 / NF-21 / NF-22 / NF-23)
Front yard at the required setback 7.73 × 6.0 = 46.38 m² (499.2 ft²). With `building_type` = `semi_detached`: NF-22 `tier_50pct`; NF-12 50 % = 23.19 m²; NF-20 75 % = 34.79 m² (no driveway) or 37.5 % = 17.39 m² (private driveway); NF-21 derived; NF-23 cap 6.0 m, but the 50 % landscaping minimum limits a full-depth driveway to 3.87 m — **L6 binds before L15** on this frontage. With NF-15 NULL: NF-22 / NF-20 / NF-21 / NF-23 NULL. Rear soft NF-13 50 % of the rear yard (7.73 × 8.38 = 64.76 m² → 32.38 m²).

### S2.13b Accessory fit — **added — not in the original list**
rear-yard depth term 33.51 − 6.0 − 7.5 = 20.01 m; rear-yard area 20.01 × 6.83 − 115.72 (all linked footprint) = 20.95 m² → garage **none** (`not_permitted`), garden suite **does not fit** (rear depth 20.01  m, lot 259.16 < 270 m²) (stored: garage NULL, suite fits false).  Planned (EF-13/EF-17): garage none.

### S2.13c Houseplex / secondary suite — both answers (NF-30..NF-32) — **added — not in the original list**

| Term | Existing methodology (as-built code) | New — plan formulas as written | F1 (side tier on required frontage) | F2 (length cap front-to-rear) | F1 + F2 (`calc.bylawReading`) | `building_type` NULL (plan formulas) |
| --- | --- | --- | --- | --- | --- | --- |
| footprint — base (EF-2) | 85.52 | 129.77 (retire) · 85.52 (keep) | 118.37 (retire) · 85.52 (keep) | 116.11 (retire) · 85.52 (keep) | 105.91 (retire) · 85.52 (keep) | 129.77 · 85.52 |
| footprint — houseplex / suite (NF-30 / NF-32) | — | **129.77** `setback` | **118.37** `setback` | **116.11** `setback` | **105.91** `setback` | **129.77** `setback` |
| GFA — houseplex / suite (NF-31, no FSI) | — | **389.31** | **355.11** | **348.33** | **317.73** | **389.31** |

No overlay value for clause (D) to replace → the houseplex / suite footprint equals NF-17. FSI would not apply to a houseplex / suite (H10/H12). A semi-detached house with a secondary suite is not a semi-detached houseplex (H2(F)).

### S2.13d Does landscaping change MaxBuild? — **added — not in the original list**
**Main-house MaxBuild unaffected** — front landscaping governs the yard in front of the front main walls (H5), rear soft landscaping the yard behind the rear main walls (H6); both are shares of the yard the house leaves. **Where it bites:** driveway width (step 13) and the rear yard: with the house at the planned length 19.00 m the area behind it is 65.78 m², of which 50 % must be soft (L10 / L20) → at most 32.89 m² for a garage, garden suite and paving combined. As-built accessory fit: garage none, garden suite does not fit — decided by the 30 %-of-lot greenspace test and the rear-depth / lot-size gates, not by L10/L20 (KFM-9).

### Step 14 — Summary

| Field | AS-BUILT stored | AS-BUILT recomputed | PLANNED as written (retire · keep) | F1 + F2 | NF-15 NULL |
| --- | --- | --- | --- | --- | --- |
| side × count / rear (m) | — | 0.9 × 1 / 7.5 | 0.9 × 1 / 8.38 | 1.5 × 1 / 8.38 | 0.9 |
| `max_build_width_m` / `_length_m` | 6.83 / 20.01 | 6.83 / 20.01 | 6.83 / 19.00 | 6.23 / 17.00 | 6.83 / 19.00 |
| coverage cap / NF-18 | — | 85.52 | NULL | NULL | NULL |
| NF-17 | — | (box 136.67) | 129.77 | 105.91 | 129.77 |
| `max_buildable_footprint_sqm` (EF-2) | 85.52 | 85.52 | 129.77 · 85.52 | 105.91 · 85.52 | 129.77 · 85.52 |
| binding | — | coverage_cap | setback | setback | setback |
| `max_build_stories` | 3 | 3 | 3 | 3 | 3 |
| `max_buildable_gfa_sqm` (EF-8) | 256.56 | 256.56 | 389.31 · 256.56 | 317.73 · 256.56 | 389.31 · 256.56 |
| GFA with label FSI read | — | 155.50 | 155.50 | 155.50 | — |
| NF-30 / NF-31 (houseplex / suite) | — | — | 129.77 / 389.31 | 105.91 / 317.73 | 129.77 / 389.31 |
| `max_garage_gfa_sqm` | NULL | NULL | NULL | — | — |
| confidence / constrained | medium / false | medium / false | unchanged | — | — |

**Reading.** Old: median coverage 85.52 m², GFA 256.56 m² at the ST 3 storey cap. New: setbacks + caps 129.77 m² (F1 + F2 105.91) — but the label FSI 0.6 caps GFA at 155.50 m² once read, below today's 256.56 m². A secondary suite lifts that cap (NF-31 389.31 / 317.73 m²).

## Worked example — parcel 5071306, RT townhouse row (townhouse, coverage overlay mapped: old vs new)

> **Status:** AS-BUILT read from the local dev DB (read-only snapshot, captured 2026-09-29T16:51:17.571Z, `spec67-gen/excap.js`, SELECT only) and recomputed from the `buildMaxBuildSql` formulas: **all 27 recomputed as-built values equal the stored values**. PLANNED = the plan's formulas as written with `building_type` = `townhouse` (NF-15, user input; units assumed to front a street); F1/F2 = findings pending panel ruling; the last column shows NF-15 NULL ("NULL, don't guess"). **Townhouse, coverage mapped (25 %).** RT: flat 7.5 m rear, no length/depth cap, side setback by building type but `side_count` 0.

### T1.0 Parcel selection, building type and data snapshot
**Selection (Q1):** RT, coverage mapped, regular, not ravine / heritage / corner / through / laneway, lot confidence high, one unambiguous zone polygon, no STAND_SET / exception / holding, frontage 4.5–7.5 m, depth ≥ 18 m, ordered by closeness to 5.5 m × 30 m (no address filter — freehold townhouse parcels in this sample carry none). **Chosen: id 58074 (parcel_id 5071306) — no address point inside the parcel (parcel_id 5071306)**; the first candidate; every candidate belongs to one 12-parcel row.

**Building type — permitted and corroborated.** A townhouse is a permitted residential building type in the RT zone (H20, quoted below; definition H22). Corroboration from massing (Q15): the primary building footprint is 1264.31 m², lies within ~1 m of 0 other building footprint(s) and overlaps 12 parcel(s) by more than 5 m² — a single 1,264 m² footprint covering 12 parcels: a townhouse row. The building type itself is **not a column** (NF-15 user input); it is assumed here and every branch that needs it is also shown with NF-15 NULL.

> **H20 — §10.60.20.20(1)** (RT permitted residential building types; Appendix E, fetched 2026-09-29T14:45:17.645Z): "In the RT Zone, a dwelling unit is permitted in the following residential building types: (A) Detached House; (B) Semi-detached House; (C) Townhouse; (D) Detached Houseplex; [ By-law: 648-2025 ] (E) Semi-Detached Houseplex; and [ By-law: 648-2025 ] (F) (Deleted by By-law 648-2025) [ By-law: 648-2025 ] (G) Apartment Building, if the lot abuts a major street."

> **H22 — §800.50(865)** (Townhouse (definition); Appendix E, fetched 2026-09-29T14:45:16.969Z): "(865) Townhouse means a building that has three or more dwelling units, and no dwelling unit is entirely or partially above another. A detached house or semi-detached house that has one or more secondary suites is not a townhouse. A detached houseplex or two semi-detached houseplexes is not a townhouse. [ By-law: 648-2025 ]"

| Q | SQL (as executed) | Result |
| --- | --- | --- |
| Q1 | `WITH c AS (SELECT p.id, p.address_number, p.linear_name_full, p.frontage_m, p.depth_m, p.lot_size_sqm, p.zoning_zn_string, p.bylaw_max_coverage_pct, p.bylaw_max_height_m, p.bylaw_max_density, p.bylaw_min_frontage_m, (SELECT pb.building_id FROM parcel_buildings pb WHERE pb.parcel_id = p.id AND pb.is_primary LIMIT 1) AS bid FROM parcels p WHERE p.zoning_class = 'RT' AND p.bylaw_max_coverage_pct IS NOT NULL AND p.is_irregular = false AND NOT COALESCE(p.is_in_ravine_protection_area, false) AND NOT COALESCE(p.is_heritage_designated, false) AND NOT COALESCE(p.is_corner_lot, false) AND NOT COALESCE(p.is_through_lot, false) AND NOT COALESCE(p.abuts_laneway, false) AND p.lot_size_confidence = 'high' AND NOT COALESCE(p.zoning_is_ambiguous, false) AND p.bylaw_standard_setback_m IS NULL AND p.exception_number IS NULL AND p.zoning_holding = 'N' AND p.frontage_m BETWEEN 4.5 AND 7.5 AND p.depth_m >= 18  AND p.bylaw_max_height_m IS NOT NULL AND p.max_buildable_footprint_sqm IS NOT NULL AND (SELECT count(*) FROM parcel_buildings pb WHERE pb.parcel_id = p.id) = 1 AND EXISTS (SELECT 1 FROM parcel_buildings pb WHERE pb.parcel_id = p.id AND pb.is_primary) ORDER BY abs(p.frontage_m - 5.5) + abs(p.depth_m - 30) / 3, p.id LIMIT 6) SELECT c.id, c.address_number, c.linear_name_full, c.frontage_m, c.depth_m, c.lot_size_sqm, c.zoning_zn_string, c.bylaw_max_coverage_pct, c.bylaw_max_height_m, c.bylaw_max_density, c.bylaw_min_frontage_m, (SELECT count(*) FROM building_footprints o, building_footprints b WHERE b.id = c.bid AND o.id <> b.id AND ST_DWithin(o.geom, b.geom, 0.00001)) AS buildings_within_1m, (SELECT count(*) FROM parcels q, building_footprints b WHERE b.id = c.bid AND q.geom && b.geom AND ST_Area(ST_Intersection(q.geom, b.geom)::geography) > 5) AS parcels_spanned FROM c` | `[{"id":58074,"address_number":"None","linear_name_full":"None","frontage_m":"5.12","depth_m":"29.28","lot_size_sqm":"149.93","zoning_zn_string":"RT (au220.0)","bylaw_max_coverage_pct":"25.00","bylaw_max_height_m":"10.50","bylaw_max_density":null,"bylaw_min_frontage_m":null,"buildings_within_1m":"0","parcels_spanned":"12"},{"id":150700,"address_number":"None","linear_name_full":"None","frontage_m":"5.12","depth_m":"29.27","lot_size_sqm":"149.88","zoning_zn_string":"RT (au220.0)","bylaw_max_coverage_pct":"25.00","bylaw_max_height_m":"10.50","bylaw_max_density":null,"bylaw_min_frontage_m":null,"buildings_within_1m":"0","parcels_spanned":"12"},{"id":313142,"address_number":"None","linear_name_full":"None","frontage_m":"5.12","depth_m":"29.25","lot_size_sqm":"149.75","zoning_zn_string":"RT (au220.0)","bylaw_max_coverage_pct":"25.00","bylaw_max_height_m":"10.50","bylaw_max_density":null,"bylaw_min_frontage_m":null,"buildings_within_1m":"0","parcels_spanned":"12"},{"id":420988,"address_number":"None","linear_name_full":"None","frontage_m":"5.12","depth_m":"29.24","lot_size_sqm":"149.72","zoning_zn_string":"RT (au220.0)","bylaw_max_coverage_pct":"25.00","bylaw_max_height_m":"10.00","bylaw_max_density":null,"bylaw_min_frontage_m":"15.00","buildings_within_1m":"0","parcels_spanned":"12"},{"id":420987,"address_number":"None","linear_name_full":"None","frontage_m":"5.12","depth_m":"29.23","lot_size_sqm":"149.69","zoning_zn_string":"RT (au220.0)","bylaw_max_coverage_pct":"25.00","bylaw_max_height_m":"10.00","bylaw_max_density":null,"bylaw_min_frontage_m":"15.00","buildings_within_1m":"0","parcels_spanned":"12"},{"id":174221,"address_number":"None","linear_name_full":"None","frontage_m":"5.17","depth_m":"29.00","lot_size_sqm":"149.85","zoning_zn_string":"RT (au220.0)","bylaw_max_coverage_pct":"25.00","bylaw_max_height_m":"10.50","bylaw_max_density":null,"bylaw_min_frontage_m":null,"buildings_within_1m":"0","parcels_spanned":"12"}]` |
| Q2 | `SELECT ap.address_point_id, ap.address_full, ap.address_class_desc FROM address_points ap, parcels p WHERE p.id = 58074 AND ST_Contains(p.geom, ap.geom) ORDER BY ap.address_full` | `[]` |
| Q3 | `SELECT id, parcel_id, address_number, linear_name_full, lot_size_sqm, lot_size_sqft, frontage_m, frontage_ft, depth_m, depth_ft, is_irregular, stated_area_raw, lot_size_source, round(ST_Area(geom::geography)::numeric, 2) AS geom_area_sqm, ST_NPoints(geom) AS geom_npoints, is_in_ravine_protection_area, round(ravine_distance_m::numeric, 1) AS ravine_distance_m, is_heritage_designated, heritage_designation_type, is_corner_lot, is_through_lot, abuts_laneway, primary_frontage_street_name, neighbourhood_id FROM parcels WHERE id = 58074` | `{"id":58074,"parcel_id":"5071306","address_number":"None","linear_name_full":"None","lot_size_sqm":"149.93","lot_size_sqft":"1613.83","frontage_m":"5.12","frontage_ft":"16.80","depth_m":"29.28","depth_ft":"96.06","is_irregular":false,"stated_area_raw":"149.93 sq.m","lot_size_source":"stated","geom_area_sqm":"149.95","geom_npoints":10,"is_in_ravine_protection_area":false,"ravine_distance_m":"55.6","is_heritage_designated":false,"heritage_designation_type":null,"is_corner_lot":false,"is_through_lot":false,"abuts_laneway":false,"primary_frontage_street_name":null,"neighbourhood_id":11}` |
| Q4 | `SELECT zoning_class, zoning_zn_string, zoning_holding, zone_status, zoning_is_ambiguous, zoning_dominant_area_share, zoning_base_source_id, exception_number, exception_text, bylaw_standard_setback_m, bylaw_min_frontage_m, bylaw_min_area_sqm, bylaw_max_coverage_pct, bylaw_max_height_m, bylaw_max_stories, bylaw_max_fsi, bylaw_max_density, bylaw_max_units, on_policy_road, in_policy_area, on_priority_retail, in_building_setback_overlay, zoning_overlays FROM parcels WHERE id = 58074` | `{"zoning_class":"RT","zoning_zn_string":"RT (au220.0)","zoning_holding":"N","zone_status":0,"zoning_is_ambiguous":false,"zoning_dominant_area_share":"1.0000","zoning_base_source_id":5856,"exception_number":null,"exception_text":"N","bylaw_standard_setback_m":null,"bylaw_min_frontage_m":null,"bylaw_min_area_sqm":null,"bylaw_max_coverage_pct":"25.00","bylaw_max_height_m":"10.50","bylaw_max_stories":3,"bylaw_max_fsi":null,"bylaw_max_density":null,"bylaw_max_units":null,"on_policy_road":false,"in_policy_area":false,"on_priority_retail":false,"in_building_setback_overlay":false,"zoning_overlays":{"base":[{"zn_zone":"RT","source_id":5856,"area_share":1}],"height_overlay":{"applied":true,"stories":3,"height_max_m":10.5},"lot_coverage_overlay":{"applied":true,"coverage_max_pct":25}}}` |
| Q5 | `SELECT source_id, zn_zone, zn_string, frontage_min_m, area_min_sqm, density_max, fsi_max, coverage_max_pct, standard_setback, exception_number FROM zoning_bylaw_areas WHERE source_id = (SELECT zoning_base_source_id FROM parcels WHERE id = 58074)` | `{"source_id":5856,"zn_zone":"RT","zn_string":"RT (au220.0)","frontage_min_m":null,"area_min_sqm":null,"density_max":null,"fsi_max":null,"coverage_max_pct":null,"standard_setback":null,"exception_number":null}` |
| Q6 | `SELECT (SELECT json_agg(json_build_object('source_id', h.source_id, 'ht_string', h.ht_string, 'height_max_m', h.height_max_m, 'ht_stories', h.ht_stories)) FROM zoning_height_overlay h WHERE ST_Intersects(h.geom, p.geom) AND NOT ST_Touches(h.geom, p.geom)) AS height_overlay, (SELECT json_agg(json_build_object('source_id', c.source_id, 'coverage_max_pct_override', c.coverage_max_pct_override, 'area_share', round((ST_Area(ST_Intersection(c.geom, p.geom)::geography) / ST_Area(p.geom::geography))::numeric, 4))) FROM zoning_lot_coverage_overlay c WHERE ST_Intersects(c.geom, p.geom) AND NOT ST_Touches(c.geom, p.geom)) AS coverage_overlay FROM parcels p WHERE p.id = 58074` | `{"height_overlay":[{"source_id":284,"ht_string":"HT 10.0, ST 2","height_max_m":10,"ht_stories":2},{"source_id":292,"ht_string":"HT 10.5, ST 3","height_max_m":10.5,"ht_stories":3}],"coverage_overlay":[{"source_id":846,"coverage_max_pct_override":25,"area_share":1},{"source_id":1125,"coverage_max_pct_override":30,"area_share":0}]}` |
| Q7 | `SELECT lot_size_confidence, lot_size_basis, max_build_setback_basis, max_buildable_footprint_sqm, max_build_width_m, max_build_length_m, max_build_height_m, max_build_stories, max_build_stories_basis, max_build_stories_aggressive, market_exceeds_bylaw, max_build_basis, max_buildable_gfa_sqm, max_buildable_gfa_basis, max_build_confidence, envelope_constrained, envelope_constraint_reason, garden_suite_fits, max_garden_suite_gfa_sqm, max_laneway_suite_gfa_sqm, rear_suite_type, max_rear_suite_gfa_sqm, rear_suite_permission, max_garage_gfa_sqm, garage_capacity_cars, garage_constraint_reason, garage_permission, neighbourhood_cost_premium, max_newbuild_coa_gfa_sqm, max_build_fsi, opt_aor_gfa_sqm, opt_aor_storeys, opt_coa_gfa_sqm, opt_coa_storeys, opt_binding_constraint FROM parcels WHERE id = 58074` | `{"lot_size_confidence":"high","lot_size_basis":"3way","max_build_setback_basis":"zone_default","max_buildable_footprint_sqm":"37.48","max_build_width_m":"5.12","max_build_length_m":"15.78","max_build_height_m":"10.50","max_build_stories":3,"max_build_stories_basis":"bylaw","max_build_stories_aggressive":3,"market_exceeds_bylaw":false,"max_build_basis":"rect_approx","max_buildable_gfa_sqm":"112.44","max_buildable_gfa_basis":"coverage_box","max_build_confidence":"medium","envelope_constrained":false,"envelope_constraint_reason":null,"garden_suite_fits":false,"max_garden_suite_gfa_sqm":null,"max_laneway_suite_gfa_sqm":null,"rear_suite_type":null,"max_rear_suite_gfa_sqm":null,"rear_suite_permission":"not_permitted","max_garage_gfa_sqm":null,"garage_capacity_cars":null,"garage_constraint_reason":"lot_too_small","garage_permission":"not_permitted","neighbourhood_cost_premium":"1.35","max_newbuild_coa_gfa_sqm":"118.06","max_build_fsi":"0.750","opt_aor_gfa_sqm":"74.96","opt_aor_storeys":2,"opt_coa_gfa_sqm":"112.44","opt_coa_storeys":3,"opt_binding_constraint":"depth"}` |
| Q8 | `SELECT imagery_roof_footprint_sqm, existing_width_m, existing_length_m, existing_structure_confidence, existing_other_structures_count, existing_other_structures_sqm, existing_greenspace_sqm, existing_stories, existing_height_m, existing_data_quality_flag FROM parcels WHERE id = 58074` | `{"imagery_roof_footprint_sqm":null,"existing_width_m":null,"existing_length_m":null,"existing_structure_confidence":"low","existing_other_structures_count":null,"existing_other_structures_sqm":null,"existing_greenspace_sqm":null,"existing_stories":null,"existing_height_m":null,"existing_data_quality_flag":"footprint_exceeds_lot"}` |
| Q9 | `SELECT pb.building_id, pb.is_primary, pb.match_type, pb.confidence, bf.footprint_area_sqm, bf.max_height_m FROM parcel_buildings pb JOIN building_footprints bf ON bf.id = pb.building_id WHERE pb.parcel_id = 58074` | `{"building_id":618215,"is_primary":true,"match_type":"centroid_in_parcel","confidence":"0.95","footprint_area_sqm":"1264.31","max_height_m":"12.69"}` |
| Q10 | `SELECT round(ST_Area(ST_Buffer(geom::geography, -0))::numeric, 2) AS buffer_inset_0, round(ST_Area(ST_Buffer(geom::geography, -0.45))::numeric, 2) AS buffer_inset_0_45, round(ST_Area(ST_Buffer(geom::geography, -0.75))::numeric, 2) AS buffer_inset_0_75, round(ST_Area(ST_Buffer(geom::geography, -0.9))::numeric, 2) AS buffer_inset_0_9, round(ST_Area(ST_Buffer(geom::geography, -1.2))::numeric, 2) AS buffer_inset_1_2 FROM parcels WHERE id = 58074` | `{"buffer_inset_0":"149.95","buffer_inset_0_45":"119.83","buffer_inset_0_75":"100.65","buffer_inset_0_9":"91.34","buffer_inset_1_2":"73.24"}` |
| Q11 | `SELECT n.id AS neighbourhood_id, n.name, nsn.storeys_p50, nsn.storeys_p90, nsn.sample_count FROM neighbourhoods n LEFT JOIN neighbourhood_storey_norms nsn ON nsn.neighbourhood_id = n.id, parcels p WHERE p.id = 58074 AND ST_Contains(n.geom, ST_Centroid(p.geom)) ORDER BY n.id LIMIT 1` | `{"neighbourhood_id":11,"name":"East Willowdale","storeys_p50":2,"storeys_p90":3,"sample_count":141}` |
| Q11b | `SELECT storeys_p50, storeys_p90, sample_count FROM neighbourhood_storey_norms WHERE neighbourhood_id IS NULL` | `{"storeys_p50":2,"storeys_p90":3,"sample_count":6592}` |
| Q12 | `SELECT variable_key, variable_value FROM logic_variables WHERE variable_key IN ('storey_height_m','max_build_min_dimension_m','max_build_lot_min_sqm','max_build_lot_max_sqm','mislink_footprint_lot_tol','min_soft_landscaping_pct','garden_suite_min_lot_sqm','garden_suite_min_rear_yard_m','garden_suite_max_gfa_sqm','garden_suite_storeys','garage_min_lot_sqm','garage_max_gfa_sqm','garage_min_footprint_sqm','accessory_max_coverage_pct','car_footprint_sqm','reno_coa_uplift_pct','road_overlay_distance_m') ORDER BY variable_key` | `[{"variable_key":"accessory_max_coverage_pct","variable_value":"0.3"},{"variable_key":"car_footprint_sqm","variable_value":"18.5"},{"variable_key":"garage_max_gfa_sqm","variable_value":"60"},{"variable_key":"garage_min_footprint_sqm","variable_value":"18"},{"variable_key":"garage_min_lot_sqm","variable_value":"230"},{"variable_key":"garden_suite_max_gfa_sqm","variable_value":"60"},{"variable_key":"garden_suite_min_lot_sqm","variable_value":"270"},{"variable_key":"garden_suite_min_rear_yard_m","variable_value":"5"},{"variable_key":"garden_suite_storeys","variable_value":"1"},{"variable_key":"max_build_lot_max_sqm","variable_value":"2000"},{"variable_key":"max_build_lot_min_sqm","variable_value":"50"},{"variable_key":"max_build_min_dimension_m","variable_value":"3"},{"variable_key":"min_soft_landscaping_pct","variable_value":"0.3"},{"variable_key":"mislink_footprint_lot_tol","variable_value":"0.05"},{"variable_key":"reno_coa_uplift_pct","variable_value":"0.05"},{"variable_key":"road_overlay_distance_m","variable_value":"5"},{"variable_key":"storey_height_m","variable_value":"3"}]` |
| Q15 | `SELECT (SELECT count(*) FROM building_footprints o WHERE o.id <> b.id AND ST_DWithin(o.geom, b.geom, 0.00001)) AS buildings_within_1m, (SELECT count(*) FROM parcels q WHERE q.geom && b.geom AND ST_Area(ST_Intersection(q.geom, b.geom)::geography) > 5) AS parcels_spanned_over_5sqm, round(b.footprint_area_sqm, 2) AS building_footprint_sqm FROM building_footprints b WHERE b.id = (SELECT building_id FROM parcel_buildings WHERE parcel_id = 58074 AND is_primary LIMIT 1)` | `{"buildings_within_1m":"0","parcels_spanned_over_5sqm":"12","building_footprint_sqm":"1264.31"}` |

### T1.1 Completeness (gates as in the 41 Derwyn Rd table; what this lot exercises)

| Gate / step (code or plan) | In operator's list? | On this lot | Fields read → written |
| --- | --- | --- | --- |
| `scope` + neighbourhood / pocket norms (citywide fallback) | N — added | East Willowdale; p50 2 | → `neighbourhood_id` |
| `massing` (existing building) | N — added | primary 1264.31 m² (Q9; spans 12 parcel(s)) | → intermediates |
| ravine / heritage / corner / through | Y — steps 1–3 | none | flags |
| coverage overlay (NF-8) | Y — step 4 | mapped 25.00 % | → `coverage_cap` |
| lot geometry + required frontage (F1) | Y — step 5 | measured 5.12 m vs required none (no `f` in the label) | `frontage_m`, `bylaw_min_frontage_m` |
| `lot` / `tier` → `emit` | N — added | high / 3way | → `lot_size_confidence` |
| zone / exception / STAND_SET | Y — step 6 | RT (au220.0); none | → `max_build_setback_basis` |
| NF-15 building type (user input) | N — added | `townhouse` assumed; NULL branch shown | — |
| min-dimension floor → coverage-only (EF-10 / EF-11) | N — added | clear | → `envelope_constraint_reason` |
| coverage cap / NF-18 / R1 | Y — step 9 | overlay | → `coverage_cap` |
| footprint routing / NF-19 | Y — step 10 | coverage_cap | → `max_buildable_footprint_sqm` |
| storeys (ST → bylaw) | Y — step 11 | 3 (bylaw) | → `max_build_stories` |
| GFA / FSI data gap | Y — step 12 | no `d` value — FSI unregulated | → `max_buildable_gfa_sqm` |
| landscaping (NF-12..NF-14, NF-20..NF-28) | Y — step 13 | `under6m_all_but_driveway` (unit < 6 m) | — |
| accessory fit | N — added | garage none, garden suite does not fit | → accessory fields |
| houseplex / suite outputs (NF-30..NF-32) | N — added | both answers | → NF-30..NF-32 |
| "Does landscaping change MaxBuild?" | N — added | see below | — |

### Steps 1–3 — ravine / heritage / corner / through
**None apply** (Q3): ravine false (55.6 m away), heritage false, corner false, through false, laneway false. *Fields — EXISTING (as-built):* `is_in_ravine_protection_area`, `is_heritage_designated`, `is_corner_lot`, `is_through_lot`  
*Fields — NEW (NF-#/planned/user-input):* NF-4 = NF-3; NF-14 NULL  

### Step 4 — By-law coverage percentage? (NF-8)
(ii) **Yes — 25.00 %** (Q4, Q6: [{"source_id":846,"coverage_max_pct_override":25,"area_share":1},{"source_id":1125,"coverage_max_pct_override":30,"area_share":0}]). NF-8 = `overlay_mapped`. Houseplex / suite: 45 % applies (H11). *Fields — EXISTING (as-built):* `bylaw_max_coverage_pct`, `coverage_defaulted`  
*Fields — NEW (NF-#/planned/user-input):* NF-8  

> **H11 — §10.60.30.40(1)(D)** (RT lot coverage 45 % — houseplex / secondary suite; Appendix E, fetched 2026-09-29T14:45:17.645Z): "(D) Despite (A) above, if the numerical value on the Lot Coverage Overlay Map is less than 45 percent and the lot contains detached houseplex, semi-detached houseplex or a residential building with a secondary suite, the maximum lot coverage for all buildings and structures on the lot is 45 percent;"

### Step 5 — Lot dimensions
(ii) 5.12 m (16.80 ft) × 29.28 m (96.06 ft), lot 149.93 m² (1613.8 ft²) (polygon 149.95 m², 10 points, `is_irregular` false; Q3). Zone label `RT (au220.0)`: required frontage — (no `f`) (Q4/Q5). RT has no frontage tiers (the label has no `f`), so **F1 does not apply**; RT has no length or depth cap off a major street, so **F2 does not apply** either. *Fields — EXISTING (as-built):* `frontage_m`, `depth_m`, `lot_size_sqm`, `bylaw_min_frontage_m`  
*Fields — NEW (NF-#/planned/user-input):* none new  

### T1.5b Lot validation — **added — not in the original list**
abs(149.93 − 149.95), abs(149.93 − 149.91), abs(149.95 − 149.91) within 0.15 × the larger → [true, true, true] → **high / 3way** (stored high / 3way); `emit` true.

### Step 6 — By-law zone
**RT**, `RT (au220.0)` (polygon 5856), holding `N`, no exception, STAND_SET NULL; height overlay ["HT 10.0, ST 2","HT 10.5, ST 3"] → `bylaw_max_height_m` 10.50, `bylaw_max_stories` 3. *Fields — EXISTING (as-built):* `zoning_class`, `zoning_zn_string`, `max_build_setback_basis` = `zone_default`  
*Fields — NEW (NF-#/planned/user-input):* none new  

### Step 7 — Rules that apply

| Rule | Applies? | Value on this lot | Why | Provision |
| --- | --- | --- | --- | --- |
| Front setback | yes | NF-1 = 6.0 m (averaging research-required) | no STAND_SET | G12 (1), G19 |
| Rear setback | yes | NF-2 = **7.5 m flat** (no depth term in RT) | RT | G12 (2) |
| Side setback | yes | townhouse, all units front a street: **0.9 m** — but side_count 0 (party walls both sides), so it removes no width; NF-15 NULL → **NF-3 NULL** | RT side is by building type | G12 (3) |
| Height / storeys | yes | 10.50 m; ST 3 (EF-5 RT does not branch on type: NULL-type 10.50) | Height Overlay | G14 (1)(A), (2)(A) |
| FSI | no | no `d` value → not limited |  | H24 |
| Building length | **no** | NF-10 NULL — RT has a length cap only on a major street | `on_policy_road` false | G13 |
| Building depth | **no** | NF-11 NULL — no RT depth provision (confirmed absence, plan NF-11) | — | — |
| Coverage | yes | 25.00 % → 37.48 m² | Lot Coverage Overlay | RT (A)/(B) (§6.7) |
| Front landscaping | yes | townhouse unit 5.12 m wide < 6.0 → NF-22 `under6m_all_but_driveway` (front yard minus a permitted driveway / parking pad must be landscaping) | L5 keys on the townhouse dwelling-unit width | L4, L5 |
| Rear soft | yes | NF-13 = 25 % (frontage ≤ 6.0) |  | L10 |
| Driveway width | yes | NF-23 = 2.6 m (unit < 6.0 m wide) |  | L15 |

> **G12 — §10.60.40.70(1)-(4)** (RT setbacks (incl. major-street clause (4)); Appendix C, fetched 2026-09-29T14:45:17.645Z): "10.60.40.70 Setbacks (1) Minimum Front Yard Setback If regulation 10.5.40.70(1) does not apply, the required minimum front yard setback in the RT zone is 6.0 metres. (2) Minimum Rear Yard Setback The required minimum rear yard setback in the RT zone is 7.5 metres. (3) Minimum Side Yard Setback In the RT zone: (A) the required minimum side yard setback is 7.5 metres; and (B) despite (A) above, the required minimum side yard setback is 0.9 metres for: (i) a detached house; (ii) a semi-detached house; (iii) a detached houseplex; [ By-law: 648-2025 ] (iv) a semi-detached houseplex; and [ By-law: 648-2025 ] (v) (Deleted by By-law 648-2025) [ By-law: 648-2025 ] (vi) a townhouse, if all the dwelling units front directly on a street. [ By-law: 474-2023 ] (4) Minimum Setback Requirements for Residential Buildings on Major Streets Despite (1) to (3) above, a townhouse or apartment building located on a lot abutting a major street must have the following minimum building setbacks: (A) a front yard setback of: (i) for a lot depth equal to or less than 36.0 metres: (a) If regulation 10.5.40.70(1) applies, the lesser of the front yard setback required by 10.5.40.70(1) or 6.0 metres; (b) if regulation 10.5.40.70(1) does not apply: 3.0 metres; and (c) despite (a) and (b) above, if on a through lot: 6.0 metres; (ii) despite (i) above, for a lot depth greater than 36.0 metres: 6.0 metres. (B) a rear yard setback of 7.5 metres; (C) for a townhouse, a side yard setback of: (i) 0.9 metres, if all dwelling units front directly onto a street; (ii) 7.5 metres, if all dwelling units do not front directly onto a street; (D) for an apartment building, a side yard setback of: (i) 2.4 metres for all portions of the main wall that do not have primary windows; (ii) 5.5 metres for portions of the main wall that have primary windows; (iii) Despite (i) and (ii) above, 7.5 metres for all portions of the main wall exceeding a building length of 25.0 metres; and (iv) Despite (i) to (iii) above, on a corner lot the required minimum side yard setback from a side lot line abutting a street is 3.0 metres. [ By-law: 1062-2025(OLT); 608-2024 ]"

> **G13 — §10.60.40.20(1)** (RT maximum building length (major street only); Appendix C, fetched 2026-09-29T14:45:17.645Z): "10.60.40.20 Building Length (1) Maximum Building Length If a lot abuts a major street, the permitted maximum building length is: (A) 19.0 metres for a townhouse; and (B) 25.0 metres for an apartment building. [ By-law: 1062-2025(OLT); 608-2024 ]"

> **G14 — §10.60.40.10(1)** (RT maximum height; Appendix C, fetched 2026-09-29T14:45:17.645Z): "(1) Maximum Height The permitted maximum height for a building or structure on a lot in the RT zone is: (A) the numerical value, in metres, following the letters "HT" on the Height Overlay Map; or (B) if the lot is in an area with no numerical value following the letters "HT" on the Height Overlay Map, 10.0 metres; (C) despite (A) above, the permitted maximum height for a detached houseplex or semi-detached houseplex is the greater of: (i) the numerical value, in metres, following the letters "HT" on the Height Overlay Map; or (ii) 10.0 metres; and [ By-law: 648-2025 ] (D) despite (A) and (B) above, the permitted maximum height for the following residential buildings located on a lot abutting a major street is: (i) for a townhouse, the greater of 13.0 metres or the numerical value following the letters "HT" on the Height Overlay Map; and (ii) for an apartment building, the greater of 19.0 metres or the numerical value following the letters "HT" on the Height Overlay Map. [ By-law: 1062-2025(OLT); 608-2024 ] (2) Maximum Number of Storeys The permitted maximum number of storeys in a building on a lot in the RT zone is: (A) the numerical value following the letters "ST" on the Height Overlay Map; (B) if the lot is in an area with no numerical value following the letters "ST" on the Height Overlay Map, the number of storeys is not limited by this regulation; (C) the permitted maximum number of storeys in a building on a lot in regulation (A) does not apply to a detached houseplex or semi-detached houseplex; and [ By-law: 648-2025 ] (D) despite (A) to (C) above, the permitted maximum number of storeys for the following residential buildings, excluding a mechanical penthouse, located on a lot abutting a major street is: (i) for a townhouse, the greater of four storeys or the numerical value following the letters "ST" on the Height Overlay Map; and (ii) for an apartment building, the greater of six storeys or the numerical value following the letters "ST" on the Height Overlay Map. [ By-law: 1062-2025(OLT); 608-2024 ]"

### Step 8 — Max build from setbacks + caps (NF-17)
(ii) **Plan as written 80.79 m² (869.6 ft²); F1 80.79; F2 80.79; F1 + F2 80.79; NF-15 NULL NULL; as-built box 80.79.**

| Term | Existing methodology (as-built code) | New — plan formulas as written | F1 (side tier on required frontage) | F2 (length cap front-to-rear) | F1 + F2 (`calc.bylawReading`) | `building_type` NULL (plan formulas) |
| --- | --- | --- | --- | --- | --- | --- |
| front / side × side_count / rear | 6.0 / 0.9 × 0 / 7.5 (`SETBACK_DEFAULTS.RT`) | 6.0 / 0.9 × 0 / 7.50 | 6.0 / 0.9 × 0 / 7.50 | 6.0 / 0.9 × 0 / 7.50 | 6.0 / 0.9 × 0 / 7.50 | 6.0 / NULL × 0 / 7.50 |
| width | 5.12 − 0 × 0.9 = **5.12** | **5.12** | **5.12** | **5.12** | **5.12** | **NULL** (NF-3 NULL) |
| length | 29.28 − 6.0 − 7.5 = **15.78** | **15.78** | **15.78** | **15.78** | **15.78** | **15.78** |
| box | **80.79** | **80.79** | **80.79** | **80.79** | **80.79** | **NULL** |
| buffer (live PostGIS, Q10) | 149.95 (inset 0) | 149.95 | 149.95 | 149.95 | 149.95 | NULL |
| NF-17 | not persisted | **80.79** | **80.79** | **80.79** | **80.79** | **NULL** |

*Fields — EXISTING (as-built):* `width_raw`, `length_raw`, `box_area`, `buffer_area`, `max_build_width_m`, `max_build_length_m`  
*Fields — NEW (NF-#/planned/user-input):* NF-1, NF-2, NF-3, NF-10, NF-11, NF-17; EF-3, EF-4  

### Step 9 — Max build from coverage % (NF-18)
(ii) **As-built 37.48 m²** (25.00 % overlay, `AS coverage_cap`); **new NF-18 37.48**; houseplex / suite 67.47. *Fields — EXISTING (as-built):* `coverage_cap`, `coverage_defaulted`  
*Fields — NEW (NF-#/planned/user-input):* NF-18; R1  

### Step 10 — Which limit binds (NF-19); headline footprint (EF-2)
(ii) **As-built 37.48 m²** (stored 37.48; binding `coverage_cap`).

| Term | Existing methodology (as-built code) | New — plan formulas as written | F1 (side tier on required frontage) | F2 (length cap front-to-rear) | F1 + F2 (`calc.bylawReading`) | `building_type` NULL (plan formulas) |
| --- | --- | --- | --- | --- | --- | --- |
| footprint | LEAST(149.95, 80.79, 37.48) = **37.48** | R1 retire **37.48** · keep 37.48 | R1 retire **37.48** · keep 37.48 | R1 retire **37.48** · keep 37.48 | R1 retire **37.48** · keep 37.48 | R1 retire **37.48** · keep 37.48 |
| binding (NF-19) | `coverage_cap` | `coverage` | `coverage` | `coverage` | `coverage` | `coverage_only_unchecked` |

Coverage (37.48 m²) binds old and new. **NF-15 NULL:** NF-3 is NULL, so NF-17 is NULL and NF-19 = `coverage_only_unchecked` — the footprint (37.48) is coverage alone, although with `side_count` 0 the side setback has no geometric effect: "NULL, don't guess" withholds a number the building type cannot change here.

*Fields — EXISTING (as-built):* `max_buildable_footprint_sqm`, `max_buildable_gfa_basis` = `coverage_box`, `envelope_constrained` = false  
*Fields — NEW (NF-#/planned/user-input):* NF-19; EF-2, EF-10, EF-11  

### Step 11 — Height → storeys (EF-5 / EF-6)
(ii) **3 storeys**, basis `bylaw` (stored 3 / `bylaw`): `bylaw_max_stories` 3 (ST on the overlay) wins over the pocket norm. EF-5 = 10.50 m (overlay; NF-7 `overlay`) — with NF-15 NULL still 10.50 (RT height does not branch on type). *Fields — EXISTING (as-built):* `bylaw_max_height_m`, `bylaw_max_stories`, `max_build_stories*`  
*Fields — NEW (NF-#/planned/user-input):* NF-7; EF-5, EF-6, EF-7  

### Step 12 — GFA and the FSI data gap (EF-8)
(ii) **As-built 112.44 m²** (coverage_box). No `d` value in the label → FSI not limited (the FSI data gap does not arise here). 

| Term | Existing methodology (as-built code) | New — plan formulas as written | F1 (side tier on required frontage) | F2 (length cap front-to-rear) | F1 + F2 (`calc.bylawReading`) | `building_type` NULL (plan formulas) |
| --- | --- | --- | --- | --- | --- | --- |
| GFA — FSI unread | **112.44** | retire **112.44** · keep 112.44 | retire **112.44** · keep 112.44 | retire **112.44** · keep 112.44 | retire **112.44** · keep 112.44 | retire **112.44** · keep 112.44 |
| GFA — label FSI read | n/a | n/a | n/a | n/a | n/a | n/a |

> **H24 — §10.60.40.40(1)(A)(B)** (RT floor space index = zone-label "d" value; Appendix E, fetched 2026-09-29T14:45:17.645Z): "Floor Space Index In the RT zone, the permitted maximum floor space index is: (A) the numerical value following the letter "d" in the zone label on the Zoning By-law Map; or (B) if the zone label on the Zoning By-law Map does not include a "d" value on the Zoning By-law Map, the floor space index is not limited by this regulation;"

*Fields — EXISTING (as-built):* `bylaw_max_fsi`, `bylaw_max_density`, `max_buildable_gfa_sqm`  
*Fields — NEW (NF-#/planned/user-input):* NF-9; EF-8  

### T1.12b Confidence / constraint — **added — not in the original list**
`max_build_confidence` **medium** (stored medium); `envelope_constrained` false / reason NULL (stored false / NULL).

### Step 13 — Landscaping (NF-12 / NF-20 / NF-21 / NF-22 / NF-23)
Front yard at the required setback 5.12 × 6.0 = 30.72 m² (330.7 ft²). With `building_type` = `townhouse`: the unit is 5.12 m wide (< 6.0 m), so NF-22 = `under6m_all_but_driveway`: the whole front yard **excluding a permitted driveway or permitted parking pad** must be landscaping (L5) — here NF-27 (driveway width) and **NF-28 (parking pad, user input)** decide the number: with a 2.6 m driveway (NF-23 maximum, L15(B)) running the full front-yard depth, landscaping ≥ 15.12 m² (49.22 %); NF-20 soft = 0.75 × that = 11.34 m² (the plan's under-6 m branch; NULL without NF-27). NF-12 carries the plan's `<UNVERIFIED>` under-6 m figure — the ledger (L5) shows it is not a percentage. Rear soft NF-13 = **25 %** (frontage ≤ 6.0). NF-15 NULL → NF-22 / NF-20 / NF-23 NULL.

### T1.13b Accessory fit — **added — not in the original list**
rear-yard depth term 29.28 − 6.0 − 7.5 = 15.78 m; rear-yard area 15.78 × 5.12 − 1264.31 (all linked footprint) = 0.00 m² → garage **none** (`not_permitted`), garden suite **does not fit** (rear depth 15.78  m, lot 149.93 < 270 m²) (stored: garage NULL, suite fits false). The linked massing footprint (1264.31 m²) is the whole attached row and exceeds the lot, so `rear_yard_area` clamps to 0 — the accessory fit sees no rear yard at all. Planned (EF-13/EF-17): garage none.

### T1.13c Houseplex / secondary suite — both answers (NF-30..NF-32) — **added — not in the original list**

| Term | Existing methodology (as-built code) | New — plan formulas as written | F1 (side tier on required frontage) | F2 (length cap front-to-rear) | F1 + F2 (`calc.bylawReading`) | `building_type` NULL (plan formulas) |
| --- | --- | --- | --- | --- | --- | --- |
| footprint — base (EF-2) | 37.48 | 37.48 (retire) · 37.48 (keep) | 37.48 (retire) · 37.48 (keep) | 37.48 (retire) · 37.48 (keep) | 37.48 (retire) · 37.48 (keep) | 37.48 · 37.48 |
| footprint — houseplex / suite (NF-30 / NF-32) | — | **67.47** `coverage` | **67.47** `coverage` | **67.47** `coverage` | **67.47** `coverage` | **67.47** `coverage_only_unchecked` |
| GFA — houseplex / suite (NF-31, no FSI) | — | **202.41** | **202.41** | **202.41** | **202.41** | **202.41** |

Coverage 25.00 % < 45 % → the houseplex / suite answer uses 45 % (67.47 m²); binding moves from coverage to coverage (45 %). No `d` value, so the FSI exemption changes nothing here. A townhouse unit with a secondary suite is "a residential building with a secondary suite" (H11/H12); a townhouse is never a houseplex (H22).

### T1.13d Does landscaping change MaxBuild? — **added — not in the original list**
**Main-house MaxBuild unaffected** — front landscaping governs the yard in front of the front main walls (H5), rear soft landscaping the yard behind the rear main walls (H6); both are shares of the yard the house leaves. **Where it bites:** driveway width (step 13) and the rear yard: with the house at the planned length 15.78 m the area behind it is 38.40 m², of which 25 % must be soft (L10 / L20) → at most 28.80 m² for a garage, garden suite and paving combined. As-built accessory fit: garage none, garden suite does not fit — decided by the 30 %-of-lot greenspace test and the rear-depth / lot-size gates, not by L10/L20 (KFM-9). The linked footprint is the whole attached row (1264.31 m² > lot 149.93 m²), so the as-built rear-yard area is 0 — a massing-link effect, not a landscaping one.

### Step 14 — Summary

| Field | AS-BUILT stored | AS-BUILT recomputed | PLANNED as written (retire · keep) | F1 + F2 | NF-15 NULL |
| --- | --- | --- | --- | --- | --- |
| side × count / rear (m) | — | 0.9 × 0 / 7.5 | 0.9 × 0 / 7.50 | 0.9 × 0 / 7.50 | NULL |
| `max_build_width_m` / `_length_m` | 5.12 / 15.78 | 5.12 / 15.78 | 5.12 / 15.78 | 5.12 / 15.78 | NULL / 15.78 |
| coverage cap / NF-18 | — | 37.48 | 37.48 | 37.48 | 37.48 |
| NF-17 | — | (box 80.79) | 80.79 | 80.79 | NULL |
| `max_buildable_footprint_sqm` (EF-2) | 37.48 | 37.48 | 37.48 · 37.48 | 37.48 · 37.48 | 37.48 · 37.48 |
| binding | — | coverage_cap | coverage | coverage | coverage_only_unchecked |
| `max_build_stories` | 3 | 3 | 3 | 3 | 3 |
| `max_buildable_gfa_sqm` (EF-8) | 112.44 | 112.44 | 112.44 · 112.44 | 112.44 · 112.44 | 112.44 · 112.44 |
| GFA with label FSI read | — | n/a | n/a | n/a | — |
| NF-30 / NF-31 (houseplex / suite) | — | — | 67.47 / 202.41 | 67.47 / 202.41 | 67.47 / 202.41 |
| `max_garage_gfa_sqm` | NULL | NULL | NULL | — | — |
| confidence / constrained | medium / false | medium / false | unchanged | — | — |

**Reading.** The as-built and planned footprints agree (37.48 m², 25 % coverage); none of the RD/RS-driven fields fire in RT (no depth term, no caps, no frontage tiers). What changes is labels and nulls: with NF-15 NULL the setback check is withheld (NF-19 `coverage_only_unchecked`). A townhouse unit with a secondary suite gets 45 % (67.47 m², NF-31 202.41 m²). The accessory fit sees no rear yard because the whole 12-unit row is linked as this parcel's massing.

## Worked example — 7 Bijou Walk (townhouse, no coverage overlay: old vs new)

> **Status:** AS-BUILT read from the local dev DB (read-only snapshot, captured 2026-09-29T16:51:17.594Z, `spec67-gen/excap.js`, SELECT only) and recomputed from the `buildMaxBuildSql` formulas: **all 27 recomputed as-built values equal the stored values**. PLANNED = the plan's formulas as written with `building_type` = `townhouse` (NF-15, user input; units assumed to front a street); F1/F2 = findings pending panel ruling; the last column shows NF-15 NULL ("NULL, don't guess"). **Townhouse, coverage unmapped, shallow lot.** The envelope length falls below the 3.0 m floor: as-built routes to coverage-only on the zone median; the new approach has no coverage to fall back on.

### T2.0 Parcel selection, building type and data snapshot
**Selection (Q1):** RT, coverage unmapped, regular, not ravine / heritage / corner / through / laneway, lot confidence high, one unambiguous zone polygon, no STAND_SET / exception / holding, frontage 4–8 m (no depth or address filter), ordered by closeness to 5.5 m × 30 m; only three regular RT parcels without an overlay value pass the standard filters. **Chosen: id 469021 (parcel_id 5326942) — 7 Bijou Walk**; the first candidate (all three are units of one 4-parcel row on Bijou Walk).

**Building type — permitted and corroborated.** A townhouse is a permitted residential building type in the RT zone (H20, quoted below; definition H22). Corroboration from massing (Q15): the primary building footprint is 241.39 m², lies within ~1 m of 0 other building footprint(s) and overlaps 4 parcel(s) by more than 5 m² — one footprint covering 4 parcels: a townhouse row (link `nearest`, confidence 0.60 — Q9). The building type itself is **not a column** (NF-15 user input); it is assumed here and every branch that needs it is also shown with NF-15 NULL.

> **H20 — §10.60.20.20(1)** (RT permitted residential building types; Appendix E, fetched 2026-09-29T14:45:17.645Z): "In the RT Zone, a dwelling unit is permitted in the following residential building types: (A) Detached House; (B) Semi-detached House; (C) Townhouse; (D) Detached Houseplex; [ By-law: 648-2025 ] (E) Semi-Detached Houseplex; and [ By-law: 648-2025 ] (F) (Deleted by By-law 648-2025) [ By-law: 648-2025 ] (G) Apartment Building, if the lot abuts a major street."

> **H22 — §800.50(865)** (Townhouse (definition); Appendix E, fetched 2026-09-29T14:45:16.969Z): "(865) Townhouse means a building that has three or more dwelling units, and no dwelling unit is entirely or partially above another. A detached house or semi-detached house that has one or more secondary suites is not a townhouse. A detached houseplex or two semi-detached houseplexes is not a townhouse. [ By-law: 648-2025 ]"

| Q | SQL (as executed) | Result |
| --- | --- | --- |
| Q1 | `WITH c AS (SELECT p.id, p.address_number, p.linear_name_full, p.frontage_m, p.depth_m, p.lot_size_sqm, p.zoning_zn_string, p.bylaw_max_coverage_pct, p.bylaw_max_height_m, p.bylaw_max_density, p.bylaw_min_frontage_m, (SELECT pb.building_id FROM parcel_buildings pb WHERE pb.parcel_id = p.id AND pb.is_primary LIMIT 1) AS bid FROM parcels p WHERE p.zoning_class = 'RT' AND p.bylaw_max_coverage_pct IS NULL AND p.is_irregular = false AND NOT COALESCE(p.is_in_ravine_protection_area, false) AND NOT COALESCE(p.is_heritage_designated, false) AND NOT COALESCE(p.is_corner_lot, false) AND NOT COALESCE(p.is_through_lot, false) AND NOT COALESCE(p.abuts_laneway, false) AND p.lot_size_confidence = 'high' AND NOT COALESCE(p.zoning_is_ambiguous, false) AND p.bylaw_standard_setback_m IS NULL AND p.exception_number IS NULL AND p.zoning_holding = 'N' AND p.frontage_m BETWEEN 4 AND 8 AND p.depth_m >= 0  AND p.bylaw_max_height_m IS NOT NULL AND p.max_buildable_footprint_sqm IS NOT NULL AND (SELECT count(*) FROM parcel_buildings pb WHERE pb.parcel_id = p.id) = 1 AND EXISTS (SELECT 1 FROM parcel_buildings pb WHERE pb.parcel_id = p.id AND pb.is_primary) ORDER BY abs(p.frontage_m - 5.5) + abs(p.depth_m - 30) / 3, p.id LIMIT 6) SELECT c.id, c.address_number, c.linear_name_full, c.frontage_m, c.depth_m, c.lot_size_sqm, c.zoning_zn_string, c.bylaw_max_coverage_pct, c.bylaw_max_height_m, c.bylaw_max_density, c.bylaw_min_frontage_m, (SELECT count(*) FROM building_footprints o, building_footprints b WHERE b.id = c.bid AND o.id <> b.id AND ST_DWithin(o.geom, b.geom, 0.00001)) AS buildings_within_1m, (SELECT count(*) FROM parcels q, building_footprints b WHERE b.id = c.bid AND q.geom && b.geom AND ST_Area(ST_Intersection(q.geom, b.geom)::geography) > 5) AS parcels_spanned FROM c` | `[{"id":469021,"address_number":"7","linear_name_full":"Bijou Walk","frontage_m":"5.15","depth_m":"16.34","lot_size_sqm":"84.13","zoning_zn_string":"RT","bylaw_max_coverage_pct":null,"bylaw_max_height_m":"11.00","bylaw_max_density":null,"bylaw_min_frontage_m":null,"buildings_within_1m":"0","parcels_spanned":"4"},{"id":467752,"address_number":"3","linear_name_full":"Bijou Walk","frontage_m":"4.74","depth_m":"16.35","lot_size_sqm":"77.53","zoning_zn_string":"RT","bylaw_max_coverage_pct":null,"bylaw_max_height_m":"11.00","bylaw_max_density":null,"bylaw_min_frontage_m":null,"buildings_within_1m":"0","parcels_spanned":"4"},{"id":467909,"address_number":"5","linear_name_full":"Bijou Walk","frontage_m":"4.74","depth_m":"16.35","lot_size_sqm":"77.52","zoning_zn_string":"RT","bylaw_max_coverage_pct":null,"bylaw_max_height_m":"11.00","bylaw_max_density":null,"bylaw_min_frontage_m":null,"buildings_within_1m":"0","parcels_spanned":"4"}]` |
| Q2 | `SELECT ap.address_point_id, ap.address_full, ap.address_class_desc FROM address_points ap, parcels p WHERE p.id = 469021 AND ST_Contains(p.geom, ap.geom) ORDER BY ap.address_full` | `{"address_point_id":14627927,"address_full":"7 Bijou Walk","address_class_desc":"Land"}` |
| Q3 | `SELECT id, parcel_id, address_number, linear_name_full, lot_size_sqm, lot_size_sqft, frontage_m, frontage_ft, depth_m, depth_ft, is_irregular, stated_area_raw, lot_size_source, round(ST_Area(geom::geography)::numeric, 2) AS geom_area_sqm, ST_NPoints(geom) AS geom_npoints, is_in_ravine_protection_area, round(ravine_distance_m::numeric, 1) AS ravine_distance_m, is_heritage_designated, heritage_designation_type, is_corner_lot, is_through_lot, abuts_laneway, primary_frontage_street_name, neighbourhood_id FROM parcels WHERE id = 469021` | `{"id":469021,"parcel_id":"5326942","address_number":"7","linear_name_full":"Bijou Walk","lot_size_sqm":"84.13","lot_size_sqft":"905.57","frontage_m":"5.15","frontage_ft":"16.90","depth_m":"16.34","depth_ft":"53.61","is_irregular":false,"stated_area_raw":"84.13 sq.m","lot_size_source":"stated","geom_area_sqm":"84.15","geom_npoints":7,"is_in_ravine_protection_area":false,"ravine_distance_m":"165.5","is_heritage_designated":false,"heritage_designation_type":null,"is_corner_lot":false,"is_through_lot":false,"abuts_laneway":false,"primary_frontage_street_name":null,"neighbourhood_id":73}` |
| Q4 | `SELECT zoning_class, zoning_zn_string, zoning_holding, zone_status, zoning_is_ambiguous, zoning_dominant_area_share, zoning_base_source_id, exception_number, exception_text, bylaw_standard_setback_m, bylaw_min_frontage_m, bylaw_min_area_sqm, bylaw_max_coverage_pct, bylaw_max_height_m, bylaw_max_stories, bylaw_max_fsi, bylaw_max_density, bylaw_max_units, on_policy_road, in_policy_area, on_priority_retail, in_building_setback_overlay, zoning_overlays FROM parcels WHERE id = 469021` | `{"zoning_class":"RT","zoning_zn_string":"RT","zoning_holding":"N","zone_status":2,"zoning_is_ambiguous":false,"zoning_dominant_area_share":"1.0000","zoning_base_source_id":11375,"exception_number":null,"exception_text":"N","bylaw_standard_setback_m":null,"bylaw_min_frontage_m":null,"bylaw_min_area_sqm":null,"bylaw_max_coverage_pct":null,"bylaw_max_height_m":"11.00","bylaw_max_stories":3,"bylaw_max_fsi":null,"bylaw_max_density":null,"bylaw_max_units":null,"on_policy_road":false,"in_policy_area":false,"on_priority_retail":false,"in_building_setback_overlay":false,"zoning_overlays":{"base":[{"zn_zone":"RT","source_id":11375,"area_share":1}],"height_overlay":{"applied":true,"stories":3,"height_max_m":11}}}` |
| Q5 | `SELECT source_id, zn_zone, zn_string, frontage_min_m, area_min_sqm, density_max, fsi_max, coverage_max_pct, standard_setback, exception_number FROM zoning_bylaw_areas WHERE source_id = (SELECT zoning_base_source_id FROM parcels WHERE id = 469021)` | `{"source_id":11375,"zn_zone":"RT","zn_string":"RT","frontage_min_m":null,"area_min_sqm":null,"density_max":null,"fsi_max":null,"coverage_max_pct":null,"standard_setback":null,"exception_number":null}` |
| Q6 | `SELECT (SELECT json_agg(json_build_object('source_id', h.source_id, 'ht_string', h.ht_string, 'height_max_m', h.height_max_m, 'ht_stories', h.ht_stories)) FROM zoning_height_overlay h WHERE ST_Intersects(h.geom, p.geom) AND NOT ST_Touches(h.geom, p.geom)) AS height_overlay, (SELECT json_agg(json_build_object('source_id', c.source_id, 'coverage_max_pct_override', c.coverage_max_pct_override, 'area_share', round((ST_Area(ST_Intersection(c.geom, p.geom)::geography) / ST_Area(p.geom::geography))::numeric, 4))) FROM zoning_lot_coverage_overlay c WHERE ST_Intersects(c.geom, p.geom) AND NOT ST_Touches(c.geom, p.geom)) AS coverage_overlay FROM parcels p WHERE p.id = 469021` | `{"height_overlay":[{"source_id":1579,"ht_string":"HT 11.0, ST 3","height_max_m":11,"ht_stories":3}],"coverage_overlay":null}` |
| Q7 | `SELECT lot_size_confidence, lot_size_basis, max_build_setback_basis, max_buildable_footprint_sqm, max_build_width_m, max_build_length_m, max_build_height_m, max_build_stories, max_build_stories_basis, max_build_stories_aggressive, market_exceeds_bylaw, max_build_basis, max_buildable_gfa_sqm, max_buildable_gfa_basis, max_build_confidence, envelope_constrained, envelope_constraint_reason, garden_suite_fits, max_garden_suite_gfa_sqm, max_laneway_suite_gfa_sqm, rear_suite_type, max_rear_suite_gfa_sqm, rear_suite_permission, max_garage_gfa_sqm, garage_capacity_cars, garage_constraint_reason, garage_permission, neighbourhood_cost_premium, max_newbuild_coa_gfa_sqm, max_build_fsi, opt_aor_gfa_sqm, opt_aor_storeys, opt_coa_gfa_sqm, opt_coa_storeys, opt_binding_constraint FROM parcels WHERE id = 469021` | `{"lot_size_confidence":"high","lot_size_basis":"3way","max_build_setback_basis":"zone_default","max_buildable_footprint_sqm":"27.76","max_build_width_m":"5.15","max_build_length_m":null,"max_build_height_m":"11.00","max_build_stories":3,"max_build_stories_basis":"bylaw","max_build_stories_aggressive":3,"market_exceeds_bylaw":false,"max_build_basis":"rect_approx","max_buildable_gfa_sqm":"83.28","max_buildable_gfa_basis":"coverage_only","max_build_confidence":"low","envelope_constrained":true,"envelope_constraint_reason":"lot_too_narrow","garden_suite_fits":false,"max_garden_suite_gfa_sqm":null,"max_laneway_suite_gfa_sqm":null,"rear_suite_type":null,"max_rear_suite_gfa_sqm":null,"rear_suite_permission":"not_permitted","max_garage_gfa_sqm":null,"garage_capacity_cars":null,"garage_constraint_reason":"lot_too_small","garage_permission":"not_permitted","neighbourhood_cost_premium":"1.15","max_newbuild_coa_gfa_sqm":"87.44","max_build_fsi":"0.990","opt_aor_gfa_sqm":"55.52","opt_aor_storeys":2,"opt_coa_gfa_sqm":"83.28","opt_coa_storeys":3,"opt_binding_constraint":"depth"}` |
| Q8 | `SELECT imagery_roof_footprint_sqm, existing_width_m, existing_length_m, existing_structure_confidence, existing_other_structures_count, existing_other_structures_sqm, existing_greenspace_sqm, existing_stories, existing_height_m, existing_data_quality_flag FROM parcels WHERE id = 469021` | `{"imagery_roof_footprint_sqm":null,"existing_width_m":null,"existing_length_m":null,"existing_structure_confidence":"low","existing_other_structures_count":null,"existing_other_structures_sqm":null,"existing_greenspace_sqm":null,"existing_stories":null,"existing_height_m":null,"existing_data_quality_flag":"footprint_exceeds_lot"}` |
| Q9 | `SELECT pb.building_id, pb.is_primary, pb.match_type, pb.confidence, bf.footprint_area_sqm, bf.max_height_m FROM parcel_buildings pb JOIN building_footprints bf ON bf.id = pb.building_id WHERE pb.parcel_id = 469021` | `{"building_id":764316,"is_primary":true,"match_type":"nearest","confidence":"0.60","footprint_area_sqm":"241.39","max_height_m":"10.37"}` |
| Q10 | `SELECT round(ST_Area(ST_Buffer(geom::geography, -0))::numeric, 2) AS buffer_inset_0, round(ST_Area(ST_Buffer(geom::geography, -0.45))::numeric, 2) AS buffer_inset_0_45, round(ST_Area(ST_Buffer(geom::geography, -0.75))::numeric, 2) AS buffer_inset_0_75, round(ST_Area(ST_Buffer(geom::geography, -0.9))::numeric, 2) AS buffer_inset_0_9, round(ST_Area(ST_Buffer(geom::geography, -1.2))::numeric, 2) AS buffer_inset_1_2 FROM parcels WHERE id = 469021` | `{"buffer_inset_0":"84.15","buffer_inset_0_45":"65.60","buffer_inset_0_75":"54.14","buffer_inset_0_9":"48.68","buffer_inset_1_2":"38.30"}` |
| Q11 | `SELECT n.id AS neighbourhood_id, n.name, nsn.storeys_p50, nsn.storeys_p90, nsn.sample_count FROM neighbourhoods n LEFT JOIN neighbourhood_storey_norms nsn ON nsn.neighbourhood_id = n.id, parcels p WHERE p.id = 469021 AND ST_Contains(n.geom, ST_Centroid(p.geom)) ORDER BY n.id LIMIT 1` | `{"neighbourhood_id":73,"name":"Mount Dennis","storeys_p50":2,"storeys_p90":3,"sample_count":18}` |
| Q11b | `SELECT storeys_p50, storeys_p90, sample_count FROM neighbourhood_storey_norms WHERE neighbourhood_id IS NULL` | `{"storeys_p50":2,"storeys_p90":3,"sample_count":6592}` |
| Q12 | `SELECT variable_key, variable_value FROM logic_variables WHERE variable_key IN ('storey_height_m','max_build_min_dimension_m','max_build_lot_min_sqm','max_build_lot_max_sqm','mislink_footprint_lot_tol','min_soft_landscaping_pct','garden_suite_min_lot_sqm','garden_suite_min_rear_yard_m','garden_suite_max_gfa_sqm','garden_suite_storeys','garage_min_lot_sqm','garage_max_gfa_sqm','garage_min_footprint_sqm','accessory_max_coverage_pct','car_footprint_sqm','reno_coa_uplift_pct','road_overlay_distance_m') ORDER BY variable_key` | `[{"variable_key":"accessory_max_coverage_pct","variable_value":"0.3"},{"variable_key":"car_footprint_sqm","variable_value":"18.5"},{"variable_key":"garage_max_gfa_sqm","variable_value":"60"},{"variable_key":"garage_min_footprint_sqm","variable_value":"18"},{"variable_key":"garage_min_lot_sqm","variable_value":"230"},{"variable_key":"garden_suite_max_gfa_sqm","variable_value":"60"},{"variable_key":"garden_suite_min_lot_sqm","variable_value":"270"},{"variable_key":"garden_suite_min_rear_yard_m","variable_value":"5"},{"variable_key":"garden_suite_storeys","variable_value":"1"},{"variable_key":"max_build_lot_max_sqm","variable_value":"2000"},{"variable_key":"max_build_lot_min_sqm","variable_value":"50"},{"variable_key":"max_build_min_dimension_m","variable_value":"3"},{"variable_key":"min_soft_landscaping_pct","variable_value":"0.3"},{"variable_key":"mislink_footprint_lot_tol","variable_value":"0.05"},{"variable_key":"reno_coa_uplift_pct","variable_value":"0.05"},{"variable_key":"road_overlay_distance_m","variable_value":"5"},{"variable_key":"storey_height_m","variable_value":"3"}]` |
| Q15 | `SELECT (SELECT count(*) FROM building_footprints o WHERE o.id <> b.id AND ST_DWithin(o.geom, b.geom, 0.00001)) AS buildings_within_1m, (SELECT count(*) FROM parcels q WHERE q.geom && b.geom AND ST_Area(ST_Intersection(q.geom, b.geom)::geography) > 5) AS parcels_spanned_over_5sqm, round(b.footprint_area_sqm, 2) AS building_footprint_sqm FROM building_footprints b WHERE b.id = (SELECT building_id FROM parcel_buildings WHERE parcel_id = 469021 AND is_primary LIMIT 1)` | `{"buildings_within_1m":"0","parcels_spanned_over_5sqm":"4","building_footprint_sqm":"241.39"}` |

### T2.1 Completeness (gates as in the 41 Derwyn Rd table; what this lot exercises)

| Gate / step (code or plan) | In operator's list? | On this lot | Fields read → written |
| --- | --- | --- | --- |
| `scope` + neighbourhood / pocket norms (citywide fallback) | N — added | Mount Dennis; p50 2 | → `neighbourhood_id` |
| `massing` (existing building) | N — added | primary 241.39 m² (Q9; spans 4 parcel(s)) | → intermediates |
| ravine / heritage / corner / through | Y — steps 1–3 | none | flags |
| coverage overlay (NF-8) | Y — step 4 | **unmapped** → as-built median 33 % | → `coverage_cap` |
| lot geometry + required frontage (F1) | Y — step 5 | measured 5.15 m vs required none (no `f` in the label) | `frontage_m`, `bylaw_min_frontage_m` |
| `lot` / `tier` → `emit` | N — added | high / 3way | → `lot_size_confidence` |
| zone / exception / STAND_SET | Y — step 6 | RT; none | → `max_build_setback_basis` |
| NF-15 building type (user input) | N — added | `townhouse` assumed; NULL branch shown | — |
| min-dimension floor → coverage-only (EF-10 / EF-11) | N — added | **exercised** — length 2.84 m < 3 m | → `envelope_constraint_reason` |
| coverage cap / NF-18 / R1 | Y — step 9 | median default | → `coverage_cap` |
| footprint routing / NF-19 | Y — step 10 | coverage_only | → `max_buildable_footprint_sqm` |
| storeys (ST → bylaw) | Y — step 11 | 3 (bylaw) | → `max_build_stories` |
| GFA / FSI data gap | Y — step 12 | no `d` value — FSI unregulated | → `max_buildable_gfa_sqm` |
| landscaping (NF-12..NF-14, NF-20..NF-28) | Y — step 13 | `under6m_all_but_driveway` (unit < 6 m) | — |
| accessory fit | N — added | garage none, garden suite does not fit | → accessory fields |
| houseplex / suite outputs (NF-30..NF-32) | N — added | both answers | → NF-30..NF-32 |
| "Does landscaping change MaxBuild?" | N — added | see below | — |

### Steps 1–3 — ravine / heritage / corner / through
**None apply** (Q3): ravine false (165.5 m away), heritage false, corner false, through false, laneway false. *Fields — EXISTING (as-built):* `is_in_ravine_protection_area`, `is_heritage_designated`, `is_corner_lot`, `is_through_lot`  
*Fields — NEW (NF-#/planned/user-input):* NF-4 = NF-3; NF-14 NULL  

### Step 4 — By-law coverage percentage? (NF-8)
(ii) **No** (Q4, Q6: null). NF-8 = `unregulated`. As-built fills it with the zone median `COVERAGE_DEFAULTS.RT` = 33 % (`COALESCE(bylaw_max_coverage_pct, `…); the by-law applies no coverage (G7(B) analogue on the RT page). Houseplex / suite: no overlay value for clause (D) to replace (H11) — unchanged. *Fields — EXISTING (as-built):* `bylaw_max_coverage_pct`, `coverage_defaulted`  
*Fields — NEW (NF-#/planned/user-input):* NF-8  

> **H11 — §10.60.30.40(1)(D)** (RT lot coverage 45 % — houseplex / secondary suite; Appendix E, fetched 2026-09-29T14:45:17.645Z): "(D) Despite (A) above, if the numerical value on the Lot Coverage Overlay Map is less than 45 percent and the lot contains detached houseplex, semi-detached houseplex or a residential building with a secondary suite, the maximum lot coverage for all buildings and structures on the lot is 45 percent;"

### Step 5 — Lot dimensions
(ii) 5.15 m (16.90 ft) × 16.34 m (53.61 ft), lot 84.13 m² (905.6 ft²) (polygon 84.15 m², 7 points, `is_irregular` false; Q3). Zone label `RT`: required frontage — (no `f`) (Q4/Q5). F1 / F2 do not apply in RT (no `f`, no caps). **The lot is only 16.34 m deep**: 16.34 − 6.0 − 7.5 = 2.84 m < the 3.0 m viability floor. *Fields — EXISTING (as-built):* `frontage_m`, `depth_m`, `lot_size_sqm`, `bylaw_min_frontage_m`  
*Fields — NEW (NF-#/planned/user-input):* none new  

### T2.5b Lot validation — **added — not in the original list**
abs(84.13 − 84.15), abs(84.13 − 84.15), abs(84.15 − 84.15) within 0.15 × the larger → [true, true, true] → **high / 3way** (stored high / 3way); `emit` true.

### Step 6 — By-law zone
**RT**, `RT` (polygon 11375), holding `N`, no exception, STAND_SET NULL; height overlay ["HT 11.0, ST 3"] → `bylaw_max_height_m` 11.00, `bylaw_max_stories` 3. *Fields — EXISTING (as-built):* `zoning_class`, `zoning_zn_string`, `max_build_setback_basis` = `zone_default`  
*Fields — NEW (NF-#/planned/user-input):* none new  

### Step 7 — Rules that apply

| Rule | Applies? | Value on this lot | Why | Provision |
| --- | --- | --- | --- | --- |
| Front setback | yes | NF-1 = 6.0 m (averaging research-required) | no STAND_SET | G12 (1), G19 |
| Rear setback | yes | NF-2 = **7.5 m flat** (no depth term in RT) | RT | G12 (2) |
| Side setback | yes | townhouse, all units front a street: **0.9 m** — but side_count 0 (party walls both sides), so it removes no width; NF-15 NULL → **NF-3 NULL** | RT side is by building type | G12 (3) |
| Height / storeys | yes | 11.00 m; ST 3 (EF-5 RT does not branch on type: NULL-type 11.00) | Height Overlay | G14 (1)(A), (2)(A) |
| FSI | no | no `d` value → not limited |  | H24 |
| Building length | **no** | NF-10 NULL — RT has a length cap only on a major street | `on_policy_road` false | G13 |
| Building depth | **no** | NF-11 NULL — no RT depth provision (confirmed absence, plan NF-11) | — | — |
| Coverage | **no** | unregulated; as-built median 33 % | Lot Coverage Overlay | RT (A)/(B) (§6.7) |
| Front landscaping | yes | townhouse unit 5.15 m wide < 6.0 → NF-22 `under6m_all_but_driveway` (front yard minus a permitted driveway / parking pad must be landscaping) | L5 keys on the townhouse dwelling-unit width | L4, L5 |
| Rear soft | yes | NF-13 = 25 % (frontage ≤ 6.0) |  | L10 |
| Driveway width | yes | NF-23 = 2.6 m (unit < 6.0 m wide) |  | L15 |

> **G12 — §10.60.40.70(1)-(4)** (RT setbacks (incl. major-street clause (4)); Appendix C, fetched 2026-09-29T14:45:17.645Z): "10.60.40.70 Setbacks (1) Minimum Front Yard Setback If regulation 10.5.40.70(1) does not apply, the required minimum front yard setback in the RT zone is 6.0 metres. (2) Minimum Rear Yard Setback The required minimum rear yard setback in the RT zone is 7.5 metres. (3) Minimum Side Yard Setback In the RT zone: (A) the required minimum side yard setback is 7.5 metres; and (B) despite (A) above, the required minimum side yard setback is 0.9 metres for: (i) a detached house; (ii) a semi-detached house; (iii) a detached houseplex; [ By-law: 648-2025 ] (iv) a semi-detached houseplex; and [ By-law: 648-2025 ] (v) (Deleted by By-law 648-2025) [ By-law: 648-2025 ] (vi) a townhouse, if all the dwelling units front directly on a street. [ By-law: 474-2023 ] (4) Minimum Setback Requirements for Residential Buildings on Major Streets Despite (1) to (3) above, a townhouse or apartment building located on a lot abutting a major street must have the following minimum building setbacks: (A) a front yard setback of: (i) for a lot depth equal to or less than 36.0 metres: (a) If regulation 10.5.40.70(1) applies, the lesser of the front yard setback required by 10.5.40.70(1) or 6.0 metres; (b) if regulation 10.5.40.70(1) does not apply: 3.0 metres; and (c) despite (a) and (b) above, if on a through lot: 6.0 metres; (ii) despite (i) above, for a lot depth greater than 36.0 metres: 6.0 metres. (B) a rear yard setback of 7.5 metres; (C) for a townhouse, a side yard setback of: (i) 0.9 metres, if all dwelling units front directly onto a street; (ii) 7.5 metres, if all dwelling units do not front directly onto a street; (D) for an apartment building, a side yard setback of: (i) 2.4 metres for all portions of the main wall that do not have primary windows; (ii) 5.5 metres for portions of the main wall that have primary windows; (iii) Despite (i) and (ii) above, 7.5 metres for all portions of the main wall exceeding a building length of 25.0 metres; and (iv) Despite (i) to (iii) above, on a corner lot the required minimum side yard setback from a side lot line abutting a street is 3.0 metres. [ By-law: 1062-2025(OLT); 608-2024 ]"

> **G13 — §10.60.40.20(1)** (RT maximum building length (major street only); Appendix C, fetched 2026-09-29T14:45:17.645Z): "10.60.40.20 Building Length (1) Maximum Building Length If a lot abuts a major street, the permitted maximum building length is: (A) 19.0 metres for a townhouse; and (B) 25.0 metres for an apartment building. [ By-law: 1062-2025(OLT); 608-2024 ]"

> **G14 — §10.60.40.10(1)** (RT maximum height; Appendix C, fetched 2026-09-29T14:45:17.645Z): "(1) Maximum Height The permitted maximum height for a building or structure on a lot in the RT zone is: (A) the numerical value, in metres, following the letters "HT" on the Height Overlay Map; or (B) if the lot is in an area with no numerical value following the letters "HT" on the Height Overlay Map, 10.0 metres; (C) despite (A) above, the permitted maximum height for a detached houseplex or semi-detached houseplex is the greater of: (i) the numerical value, in metres, following the letters "HT" on the Height Overlay Map; or (ii) 10.0 metres; and [ By-law: 648-2025 ] (D) despite (A) and (B) above, the permitted maximum height for the following residential buildings located on a lot abutting a major street is: (i) for a townhouse, the greater of 13.0 metres or the numerical value following the letters "HT" on the Height Overlay Map; and (ii) for an apartment building, the greater of 19.0 metres or the numerical value following the letters "HT" on the Height Overlay Map. [ By-law: 1062-2025(OLT); 608-2024 ] (2) Maximum Number of Storeys The permitted maximum number of storeys in a building on a lot in the RT zone is: (A) the numerical value following the letters "ST" on the Height Overlay Map; (B) if the lot is in an area with no numerical value following the letters "ST" on the Height Overlay Map, the number of storeys is not limited by this regulation; (C) the permitted maximum number of storeys in a building on a lot in regulation (A) does not apply to a detached houseplex or semi-detached houseplex; and [ By-law: 648-2025 ] (D) despite (A) to (C) above, the permitted maximum number of storeys for the following residential buildings, excluding a mechanical penthouse, located on a lot abutting a major street is: (i) for a townhouse, the greater of four storeys or the numerical value following the letters "ST" on the Height Overlay Map; and (ii) for an apartment building, the greater of six storeys or the numerical value following the letters "ST" on the Height Overlay Map. [ By-law: 1062-2025(OLT); 608-2024 ]"

### Step 8 — Max build from setbacks + caps (NF-17)
(ii) **Plan as written NULL; F1 NULL; F2 NULL; F1 + F2 NULL; NF-15 NULL NULL; as-built box NULL.**

| Term | Existing methodology (as-built code) | New — plan formulas as written | F1 (side tier on required frontage) | F2 (length cap front-to-rear) | F1 + F2 (`calc.bylawReading`) | `building_type` NULL (plan formulas) |
| --- | --- | --- | --- | --- | --- | --- |
| front / side × side_count / rear | 6.0 / 0.9 × 0 / 7.5 (`SETBACK_DEFAULTS.RT`) | 6.0 / 0.9 × 0 / 7.50 | 6.0 / 0.9 × 0 / 7.50 | 6.0 / 0.9 × 0 / 7.50 | 6.0 / 0.9 × 0 / 7.50 | 6.0 / NULL × 0 / 7.50 |
| width | 5.15 − 0 × 0.9 = **5.15** | **5.15** | **5.15** | **5.15** | **5.15** | **NULL** (NF-3 NULL) |
| length | 16.34 − 6.0 − 7.5 = **2.84** < 3 → NULL | **2.84** < 3 → NULL | **2.84** < 3 → NULL | **2.84** < 3 → NULL | **2.84** < 3 → NULL | **2.84** |
| box | **NULL** | **NULL** | **NULL** | **NULL** | **NULL** | **NULL** |
| buffer (live PostGIS, Q10) | 84.15 (inset 0) | 84.15 | 84.15 | 84.15 | 84.15 | NULL |
| NF-17 | not persisted | **NULL** | **NULL** | **NULL** | **NULL** | **NULL** |

*Fields — EXISTING (as-built):* `width_raw`, `length_raw`, `box_area`, `buffer_area`, `max_build_width_m`, `max_build_length_m`  
*Fields — NEW (NF-#/planned/user-input):* NF-1, NF-2, NF-3, NF-10, NF-11, NF-17; EF-3, EF-4  

### Step 9 — Max build from coverage % (NF-18)
(ii) **As-built 27.76 m²** (median 33 %, `coverage_defaulted` TRUE, `AS coverage_cap`); **new NF-18 NULL** (unregulated); houseplex / suite NULL. *Fields — EXISTING (as-built):* `coverage_cap`, `coverage_defaulted`  
*Fields — NEW (NF-#/planned/user-input):* NF-18; R1  

### Step 10 — Which limit binds (NF-19); headline footprint (EF-2)
(ii) **As-built 27.76 m²** (stored 27.76; sub-floor → coverage-only route).

| Term | Existing methodology (as-built code) | New — plan formulas as written | F1 (side tier on required frontage) | F2 (length cap front-to-rear) | F1 + F2 (`calc.bylawReading`) | `building_type` NULL (plan formulas) |
| --- | --- | --- | --- | --- | --- | --- |
| footprint | width/length NULL → `coverage_cap` alone = **27.76** (`WHEN width_m IS NULL OR length_m IS NULL THEN coverage_cap`) | R1 retire **NULL** · keep 27.76 | R1 retire **NULL** · keep 27.76 | R1 retire **NULL** · keep 27.76 | R1 retire **NULL** · keep 27.76 | R1 retire **NULL** · keep 27.76 |
| binding (NF-19) | `coverage_only` | `NULL` | `NULL` | `NULL` | `NULL` | `NULL` |

As-built: sub-floor → **coverage-only** on the median (27.76 m², basis `coverage_only`, confidence `low`, `lot_too_narrow`). New: NF-17 NULL (length 2.84 m < 3.0) and NF-18 NULL (unmapped) → NF-19 NULL; EF-2 = 27.76 only if R1 keeps the median, otherwise **no footprint at all** (research items R1 + R2). A front setback reduced by averaging (NF-1, G19) to 5.84 m or less would lift the length over the floor — this row is where averaging decides the answer.

*Fields — EXISTING (as-built):* `max_buildable_footprint_sqm`, `max_buildable_gfa_basis` = `coverage_only`, `envelope_constrained` = true  
*Fields — NEW (NF-#/planned/user-input):* NF-19; EF-2, EF-10, EF-11  

### Step 11 — Height → storeys (EF-5 / EF-6)
(ii) **3 storeys**, basis `bylaw` (stored 3 / `bylaw`): `bylaw_max_stories` 3 (ST on the overlay) wins over the pocket norm. EF-5 = 11.00 m (overlay; NF-7 `overlay`) — with NF-15 NULL still 11.00 (RT height does not branch on type). *Fields — EXISTING (as-built):* `bylaw_max_height_m`, `bylaw_max_stories`, `max_build_stories*`  
*Fields — NEW (NF-#/planned/user-input):* NF-7; EF-5, EF-6, EF-7  

### Step 12 — GFA and the FSI data gap (EF-8)
(ii) **As-built 83.28 m²** (coverage_only). No `d` value in the label → FSI not limited (the FSI data gap does not arise here). 

| Term | Existing methodology (as-built code) | New — plan formulas as written | F1 (side tier on required frontage) | F2 (length cap front-to-rear) | F1 + F2 (`calc.bylawReading`) | `building_type` NULL (plan formulas) |
| --- | --- | --- | --- | --- | --- | --- |
| GFA — FSI unread | **83.28** | retire **NULL** · keep 83.28 | retire **NULL** · keep 83.28 | retire **NULL** · keep 83.28 | retire **NULL** · keep 83.28 | retire **NULL** · keep 83.28 |
| GFA — label FSI read | n/a | n/a | n/a | n/a | n/a | n/a |

> **H24 — §10.60.40.40(1)(A)(B)** (RT floor space index = zone-label "d" value; Appendix E, fetched 2026-09-29T14:45:17.645Z): "Floor Space Index In the RT zone, the permitted maximum floor space index is: (A) the numerical value following the letter "d" in the zone label on the Zoning By-law Map; or (B) if the zone label on the Zoning By-law Map does not include a "d" value on the Zoning By-law Map, the floor space index is not limited by this regulation;"

*Fields — EXISTING (as-built):* `bylaw_max_fsi`, `bylaw_max_density`, `max_buildable_gfa_sqm`  
*Fields — NEW (NF-#/planned/user-input):* NF-9; EF-8  

### T2.12b Confidence / constraint — **added — not in the original list**
`max_build_confidence` **low** (stored low); `envelope_constrained` true / reason `lot_too_narrow` (stored true / lot_too_narrow).

### Step 13 — Landscaping (NF-12 / NF-20 / NF-21 / NF-22 / NF-23)
Front yard at the required setback 5.15 × 6.0 = 30.90 m² (332.6 ft²). With `building_type` = `townhouse`: the unit is 5.15 m wide (< 6.0 m), so NF-22 = `under6m_all_but_driveway`: the whole front yard **excluding a permitted driveway or permitted parking pad** must be landscaping (L5) — here NF-27 (driveway width) and **NF-28 (parking pad, user input)** decide the number: with a 2.6 m driveway (NF-23 maximum, L15(B)) running the full front-yard depth, landscaping ≥ 15.30 m² (49.51 %); NF-20 soft = 0.75 × that = 11.47 m² (the plan's under-6 m branch; NULL without NF-27). NF-12 carries the plan's `<UNVERIFIED>` under-6 m figure — the ledger (L5) shows it is not a percentage. Rear soft NF-13 = **25 %** (frontage ≤ 6.0). NF-15 NULL → NF-22 / NF-20 / NF-23 NULL.

### T2.13b Accessory fit — **added — not in the original list**
rear-yard depth term 16.34 − 6.0 − 7.5 = 2.84 m; rear-yard area 2.84 × 5.15 − 241.39 (all linked footprint) = 0.00 m² → garage **none** (`not_permitted`), garden suite **does not fit** (rear depth 2.84 < 5 m, lot 84.13 < 270 m²) (stored: garage NULL, suite fits false). The linked massing footprint (241.39 m²) is the whole attached row and exceeds the lot, so `rear_yard_area` clamps to 0 — the accessory fit sees no rear yard at all. Planned (EF-13/EF-17): garage none.

### T2.13c Houseplex / secondary suite — both answers (NF-30..NF-32) — **added — not in the original list**

| Term | Existing methodology (as-built code) | New — plan formulas as written | F1 (side tier on required frontage) | F2 (length cap front-to-rear) | F1 + F2 (`calc.bylawReading`) | `building_type` NULL (plan formulas) |
| --- | --- | --- | --- | --- | --- | --- |
| footprint — base (EF-2) | 27.76 | NULL (retire) · 27.76 (keep) | NULL (retire) · 27.76 (keep) | NULL (retire) · 27.76 (keep) | NULL (retire) · 27.76 (keep) | NULL · 27.76 |
| footprint — houseplex / suite (NF-30 / NF-32) | — | **NULL** `NULL` | **NULL** `NULL` | **NULL** `NULL` | **NULL** `NULL` | **NULL** `NULL` |
| GFA — houseplex / suite (NF-31, no FSI) | — | **NULL** | **NULL** | **NULL** | **NULL** | **NULL** |

No overlay value for clause (D) to replace → the houseplex / suite footprint equals NF-17. No `d` value, so the FSI exemption changes nothing here. A townhouse unit with a secondary suite is "a residential building with a secondary suite" (H11/H12); a townhouse is never a houseplex (H22).

### T2.13d Does landscaping change MaxBuild? — **added — not in the original list**
**Main-house MaxBuild unaffected** — front landscaping governs the yard in front of the front main walls (H5), rear soft landscaping the yard behind the rear main walls (H6); both are shares of the yard the house leaves. **Where it bites:** driveway width (step 13) and the rear yard: with the house at the planned length 2.84 m the area behind it is 38.63 m², of which 25 % must be soft (L10 / L20) → at most 28.97 m² for a garage, garden suite and paving combined. As-built accessory fit: garage none, garden suite does not fit — decided by the 30 %-of-lot greenspace test and the rear-depth / lot-size gates, not by L10/L20 (KFM-9). The linked footprint is the whole attached row (241.39 m² > lot 84.13 m²), so the as-built rear-yard area is 0 — a massing-link effect, not a landscaping one.

### Step 14 — Summary

| Field | AS-BUILT stored | AS-BUILT recomputed | PLANNED as written (retire · keep) | F1 + F2 | NF-15 NULL |
| --- | --- | --- | --- | --- | --- |
| side × count / rear (m) | — | 0.9 × 0 / 7.5 | 0.9 × 0 / 7.50 | 0.9 × 0 / 7.50 | NULL |
| `max_build_width_m` / `_length_m` | 5.15 / NULL | 5.15 / NULL | 5.15 / 2.84 | 5.15 / 2.84 | NULL / 2.84 |
| coverage cap / NF-18 | — | 27.76 | NULL | NULL | NULL |
| NF-17 | — | (box NULL) | NULL | NULL | NULL |
| `max_buildable_footprint_sqm` (EF-2) | 27.76 | 27.76 | NULL · 27.76 | NULL · 27.76 | NULL · 27.76 |
| binding | — | coverage_only | NULL | NULL | NULL |
| `max_build_stories` | 3 | 3 | 3 | 3 | 3 |
| `max_buildable_gfa_sqm` (EF-8) | 83.28 | 83.28 | NULL · 83.28 | NULL · 83.28 | NULL · 83.28 |
| GFA with label FSI read | — | n/a | n/a | n/a | — |
| NF-30 / NF-31 (houseplex / suite) | — | — | NULL / NULL | NULL / NULL | NULL / NULL |
| `max_garage_gfa_sqm` | NULL | NULL | NULL | — | — |
| confidence / constrained | low / true | low / true | unchanged | — | — |

**Reading.** The shallowest case: old = median coverage-only 27.76 m² (GFA 83.28 m² at ST 3); new = no answer unless R1 keeps the median or averaging (NF-1/NF-6) shortens the front setback. It is the one example where the planned fields *remove* a number rather than change it, which is why R2 must be decided before the WF2 ships.

## Worked examples — summary

All numbers below are re-computed by the generator from the same snapshots as the six worked examples above (as-built = stored in every case). "Retire · keep" = research item R1 (the zone-median coverage default retired or kept inside EF-2). F1 + F2 = the Spec 67 derivation findings pending panel ruling.

### Comparison across all examples

| Parcel | Zone / type | Coverage mapped? | As-built footprint / GFA (m²) | New, as written: footprint / GFA (retire · keep) | New, F1 + F2: footprint / GFA (retire) | Houseplex / suite NF-30 / NF-31 | Binding: old → new | Label-FSI fix (EF-23): GFA |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 41 Derwyn Road | RD / detached (RD) | yes, 35.00 % | 114.49 / 228.98 | 114.49 · 114.49 / 228.98 · 228.98 | 114.49 / 228.98 | 147.20 / 294.40 | coverage_cap → coverage | 228.98 → **147.20** (d0.45) |
| 64 Eastbourne Crescent | RD / detached (RD) | **no** | 143.72 / 287.44 | 185.06 · 143.72 / 370.12 · 287.44 | 175.78 / 351.56 | 185.06 / 370.12 | coverage_cap → setback | 287.44 → **174.21** (d0.4) |
| 96 Futura Drive | RS / semi_detached | yes, 30.00 % | 88.90 / 177.80 | 88.90 · 88.90 / 177.80 · 177.80 | 88.90 / 177.80 | 133.35 / 266.70 | coverage_cap → coverage | no `d` — none |
| 68 Cordella Avenue | RS / semi_detached | **no** | 85.52 / 256.56 | 129.77 · 85.52 / 389.31 · 256.56 | 105.91 / 317.73 | 129.77 / 389.31 | coverage_cap → setback | 256.56 → **155.50** (d0.6) |
| parcel 5071306 (RT townhouse row, East Willowdale) | RT / townhouse | yes, 25.00 % | 37.48 / 112.44 | 37.48 · 37.48 / 112.44 · 112.44 | 37.48 / 112.44 | 67.47 / 202.41 | coverage_cap → coverage | no `d` — none |
| 7 Bijou Walk | RT / townhouse | **no** | 27.76 / 83.28 | NULL · 27.76 / NULL · 83.28 | NULL / NULL | NULL / NULL | coverage_only → NULL | no `d` — none |

### Field-usage matrix

Cells: **bold** = the field changed or decided a number on that lot; `label` = it only sets a basis / binding label; "new value" = it produces a number with no as-built counterpart; "user input" = it waits for NF-15 / NF-26..NF-29; "—" = not exercised (reason given).

| Field | 41 Derwyn Road | 64 Eastbourne Crescent | 96 Futura Drive | 68 Cordella Avenue | parcel 5071306 (RT townhouse row, East Willowdale) | 7 Bijou Walk |
| --- | --- | --- | --- | --- | --- | --- |
| as-built `coverage_cap` (median, R1) | — (overlay) | **binding** (median 143.72) | — (overlay) | **binding** (median 85.52) | — (overlay) | **binding** (median 27.76) |
| NF-1 front | same 6.0 (NF-6 unmeasured) | same 6.0 (NF-6 unmeasured) | same 6.0 (NF-6 unmeasured) | same 6.0 (NF-6 unmeasured) | same 6.0 (NF-6 unmeasured) | same 6.0 — decisive once NF-6 measures the neighbours (averaging) |
| NF-2 rear | **changes** 7.50 → 8.39 | **changes** 7.50 → 8.97 | **changes** 7.50 → 8.39 | **changes** 7.50 → 8.38 | same 7.5 (flat) | same 7.5 (flat) |
| NF-3 side | same 0.9 | **changes** 0.9 → 1.2; F1 **0.9** | same 0.9; F1 **1.5** | same 0.9; F1 **1.5** | same 0.9 (no width effect); **NULL** if NF-15 NULL | same 0.9 (no width effect); **NULL** if NF-15 NULL |
| NF-4 flankage / NF-14 corner | — (interior lot) | — (interior lot) | — (interior lot) | — (interior lot) | — (interior lot) | — (interior lot) |
| NF-5 / NF-6 averaging | — (not measured) | — (not measured) | — (not measured) | — (not measured) | — (not measured) | — (not measured) |
| NF-7 height basis | label `overlay` | label `overlay` | label `overlay` | label `overlay` | label `overlay` | label `overlay` |
| NF-8 coverage basis | label `overlay_mapped` | label `unregulated` | label `overlay_mapped` | label `unregulated` | label `overlay_mapped` | label `unregulated` |
| NF-9 FSI basis | label `unregulated` — wrong (label has `d`, KFM-12) | label `unregulated` — wrong (label has `d`, KFM-12) | label `unregulated` | label `unregulated` — wrong (label has `d`, KFM-12) | label `unregulated` | label `unregulated` |
| NF-10 length cap | as written caps width: no effect; F2 **binding** (17.00 m) | as written caps width: no effect; F2 **binding** (17.00 m) | as written caps width: no effect; F2 **binding** (17.00 m) | as written caps width: no effect; F2 **binding** (17.00 m) | — (major street only) | — (major street only) |
| NF-11 depth cap | **binding** (19.17 → 19.00) | **binding** (20.91 → 19.00) | **binding** (19.17 → 19.00) | **binding** (19.13 → 19.00) | — (none in RT) | — (none in RT) |
| NF-12 / NF-13 landscaping % | new value (50 % / 50 %) | new value (50 % / 50 %) | new value (50 % / 50 %) | new value (50 % / 50 %) | new value (under-6 m rule / 25 %) | new value (under-6 m rule / 25 %) |
| NF-15 building_type | user input (landscaping only) | user input (landscaping only) | user input (landscaping only) | user input (landscaping only) | user input — **gates NF-3 → NF-17** | user input — **gates NF-3 → NF-17** |
| NF-16 current_stories | — (out of scope) | — (out of scope) | — (out of scope) | — (out of scope) | — (out of scope) | — (out of scope) |
| NF-17 setback footprint | new value 151.05 | new value 185.06 — **binding if R1 retires** | new value 150.67 | new value 129.77 — **binding if R1 retires** | new value 80.79 | **NULL** (length < 3.0 m) |
| NF-18 coverage footprint | new value 114.49 (= as-built cap) | **NULL** (median retired) | new value 88.90 (= as-built cap) | **NULL** (median retired) | new value 37.48 (= as-built cap) | **NULL** (median retired) |
| NF-19 binding | label `coverage` | label `setback` | label `coverage` | label `setback` | label `coverage` | label `NULL` |
| NF-20 / NF-21 soft / hard | user input (NF-15, NF-26) | user input (NF-15, NF-26) | user input (NF-15, NF-26) | user input (NF-15, NF-26) | user input (NF-15, NF-26) | user input (NF-15, NF-26) |
| NF-22 front tier | label `tier_50pct` (needs NF-15) | label `tier_50pct` (needs NF-15) | label `tier_50pct` (needs NF-15) | label `tier_50pct` (needs NF-15) | label `under6m_all_but_driveway` (needs NF-15) | label `under6m_all_but_driveway` (needs NF-15) |
| NF-23 driveway cap | new value 6.0 — L6 **binds first** (4.88 m) | new value 6.0 m (binds) | new value 6.0 — L6 **binds first** (4.42 m) | new value 6.0 — L6 **binds first** (3.87 m) | new value 2.6 m | new value 2.6 m |
| NF-24 garden-suite soft | user input (suite exists?) | user input (suite exists?) | user input (suite exists?) | user input (suite exists?) | user input (suite exists?) | user input (suite exists?) |
| NF-25 laneway-suite soft | — (no lane) | — (no lane) | — (no lane) | — (no lane) | — (no lane) | — (no lane) |
| NF-26 / NF-27 driveway | user input | user input | user input | user input | user input | user input |
| NF-28 parking pad | — (frontage ≥ 6 m) | — (frontage ≥ 6 m) | — (frontage ≥ 6 m) | — (frontage ≥ 6 m) | user input — decides the under-6 m landscaping once answered | user input — decides the under-6 m landscaping once answered |
| NF-29 has_secondary_suite | user input | user input | user input | user input | user input | user input |
| NF-30 suite footprint | **changes** 114.49 → 147.20 (45 %) | new value 185.06 (= base once R1 retires the median; no overlay value for the 45 % rule) | **changes** 88.90 → 133.35 (45 %) | new value 129.77 (= base once R1 retires the median; no overlay value for the 45 % rule) | **changes** 37.48 → 67.47 (45 %) | **NULL** |
| NF-31 suite GFA | **changes** vs base (294.40) | **changes** vs base (370.12) | **changes** vs base (266.70) | **changes** vs base (389.31) | **changes** vs base (202.41) | **NULL** |
| NF-32 suite binding | label `coverage` | label `setback` | label `coverage` | label `setback` | label `coverage` | label `NULL` |
| EF-1 setback basis | label (meaning change) | label (meaning change) | label (meaning change) | label (meaning change) | label (meaning change) | label (meaning change) |
| EF-2 footprint | same (coverage binds) | **changes if R1 retires** (143.72 → 185.06) | same (coverage binds) | **changes if R1 retires** (85.52 → 129.77) | same (coverage binds) | **NULL if R1 retires** (R2) |
| EF-3 width | same | **changes** 10.34 → 9.74 | same | same | same | same |
| EF-4 length | **changes** 20.06 → 19.00 | **changes** 22.38 → 19.00 | **changes** 20.06 → 19.00 | **changes** 20.01 → 19.00 | same | NULL both (floor) |
| EF-5 / EF-6 / EF-7 height, storeys | same (overlay present) | same (overlay present) | same (overlay present) | same (overlay present) | same (overlay present) | same (overlay present) |
| EF-8 GFA | same | **changes if R1 retires** (287.44 → 370.12) | same | **changes if R1 retires** (256.56 → 389.31) | same | **NULL if R1 retires** |
| EF-9 confidence | label (not prescribed) | label (not prescribed) | label (not prescribed) | label (not prescribed) | label (not prescribed) | label (not prescribed) |
| EF-10 / EF-11 constraint / coverage-only | same | same | same | same | same | **fires** (coverage-only, `lot_too_narrow`) |
| EF-12 hotspot | same | same | same | same | same | same |
| EF-13..EF-17 accessory | **changes** garage 22.56 → 20.43 | **changes** garage 31.40 → 23.08 | none (no garage either way) | none (no garage either way) | none (no garage either way) | none (no garage either way) |
| EF-18..EF-22 downstream | inherits (not recomputed) | inherits (not recomputed) | inherits (not recomputed) | inherits (not recomputed) | inherits (not recomputed) | inherits (not recomputed) |
| EF-23 label FSI (proposed) | **changes** GFA 228.98 → 147.20 | **changes** GFA 287.44 → 174.21 | — (no `d`) | **changes** GFA 256.56 → 155.50 | — (no `d`) | — (no `d`) |
| EF-24 garden-suite L20 (proposed) | **bites** (≤ 41.73 m² vs 60) | passes (≤ 66.04 m²) | **bites** (≤ 37.79 m² vs 60) | — (no suite offered) | — (no suite offered) | — (no suite offered) |
| EF-25 / EF-26 STAND_SET (proposed) | — (no STAND_SET) | — (no STAND_SET) | — (no STAND_SET) | — (no STAND_SET) | — (no STAND_SET) | — (no STAND_SET) |

### Finding — "fewer new fields were used than expected, yet they proved valuable"

Of the 42 field rows above, **19 changed or decided a number on at least one lot**: as-built `coverage_cap` (median, R1); NF-2 rear; NF-3 side; NF-10 length cap; NF-11 depth cap; NF-15 building_type; NF-17 setback footprint; NF-18 coverage footprint; NF-23 driveway cap; NF-30 suite footprint; NF-31 suite GFA; EF-2 footprint; EF-3 width; EF-4 length; EF-8 GFA; EF-10 / EF-11 constraint / coverage-only; EF-13..EF-17 accessory; EF-23 label FSI (proposed); EF-24 garden-suite L20 (proposed). **8 only set a label or basis**: NF-7 height basis; NF-8 coverage basis; NF-9 FSI basis; NF-19 binding; NF-22 front tier; NF-32 suite binding; EF-1 setback basis; EF-9 confidence. **5 wait on user input** and so change nothing until a viewer answers: NF-20 / NF-21 soft / hard; NF-24 garden-suite soft; NF-26 / NF-27 driveway; NF-28 parking pad; NF-29 has_secondary_suite. **5 never fired** on these six residential lots: NF-4 flankage / NF-14 corner; NF-5 / NF-6 averaging; NF-16 current_stories; NF-25 laneway-suite soft; EF-25 / EF-26 STAND_SET (proposed).

Why so few fire, and why they still matter: (1) on the two lots with a coverage overlay (41 Derwyn Rd, 96 Futura Dr) and the RT row lot, coverage binds before any setback, so the new setback fields (NF-2, NF-3, NF-10, NF-11) move only the intermediate NF-17 — the report's side-by-side NF-17 / NF-18 / NF-19 is the only place the difference is visible; (2) on unmapped lots (64 Eastbourne Cres, 68 Cordella Ave) the same fields become the headline the moment R1 retires the median — they are the difference between a statistical guess and a by-law envelope; (3) on the 3 of 6 lots whose label carries a `d` value, the largest single number change is not a new field at all but the FSI source (KFM-12 / EF-23), found only because the examples recomputed GFA; (4) RT lots exercise almost none of the RD/RS machinery, but they are where "NULL, don't guess" (NF-15) and the coverage-only / R2 question (7 Bijou Walk) bite hardest; (5) the major-street branches never fire — no regular RD/RS/RT/RM lot in the snapshot has `on_policy_road` = true (proposal query below returns none), consistent with KFM-1.

**Examples that would exercise the rest** (read-only picks, `spec67-gen/proposals-capture.js`, captured 2026-09-29T16:56:56.179Z):

| Field family | Proposed parcel | Query |
| --- | --- | --- |
| NF-4, NF-14, EF-3 corner branch | id 280130 — 27 Woodward Ave (RD (f12.0; a370; d0.4); 13.01 × 34.95 m; coverage unmapped) | `SELECT p.id, p.address_number \|\| ' ' \|\| p.linear_name_full AS address, p.zoning_class, p.zoning_zn_string, p.frontage_m, p.depth_m, p.bylaw_max_coverage_pct FROM parcels p WHERE p.is_irregular = false AND p.lot_size_confidence = 'high' AND NOT COALESCE(p.zoning_is_ambiguous, false) AND p.exception_number IS NULL AND p.bylaw_standard_setback_m IS NULL AND p.address_number IS NOT NULL AND p.address_number <> 'None' AND p.max_buildable_footprint_sqm IS NOT NULL AND p.zoning_class = 'RD' AND p.is_corner_lot AND p.frontage_m BETWEEN 12 AND 16 ORDER BY abs(p.frontage_m - 13), p.id LIMIT 1` |
| NF-3 bands (E)-(G), NF-10 on width, F3 (required frontage > 18 m) | id 211670 — 82 Abilene Dr (RD (f24.0; a555; d0.45); 22.01 × 35.10 m; coverage 33.00) | `SELECT p.id, p.address_number \|\| ' ' \|\| p.linear_name_full AS address, p.zoning_class, p.zoning_zn_string, p.frontage_m, p.depth_m, p.bylaw_max_coverage_pct FROM parcels p WHERE p.is_irregular = false AND p.lot_size_confidence = 'high' AND NOT COALESCE(p.zoning_is_ambiguous, false) AND p.exception_number IS NULL AND p.bylaw_standard_setback_m IS NULL AND p.address_number IS NOT NULL AND p.address_number <> 'None' AND p.max_buildable_footprint_sqm IS NOT NULL AND p.zoning_class = 'RD' AND NOT p.is_corner_lot AND p.frontage_m >= 20 AND p.bylaw_min_frontage_m > 18 ORDER BY abs(p.frontage_m - 22), p.id LIMIT 1` |
| ravine reduction / ravine_constrained | id 70259 — 74 Barkwin Dr (RD (f13.5; a510; d0.45); 15.00 × 40.15 m; coverage 33.00) | `SELECT p.id, p.address_number \|\| ' ' \|\| p.linear_name_full AS address, p.zoning_class, p.zoning_zn_string, p.frontage_m, p.depth_m, p.bylaw_max_coverage_pct FROM parcels p WHERE p.is_irregular = false AND p.lot_size_confidence = 'high' AND NOT COALESCE(p.zoning_is_ambiguous, false) AND p.exception_number IS NULL AND p.bylaw_standard_setback_m IS NULL AND p.address_number IS NOT NULL AND p.address_number <> 'None' AND p.max_buildable_footprint_sqm IS NOT NULL AND p.zoning_class = 'RD' AND p.is_in_ravine_protection_area AND NOT p.is_heritage_designated ORDER BY abs(p.frontage_m - 15), p.id LIMIT 1` |
| heritage freeze / mislink | id 418809 — 5 Baby Point Rd (RD (f12.0; a370; d0.4); 10.01 × 44.24 m; coverage unmapped) | `SELECT p.id, p.address_number \|\| ' ' \|\| p.linear_name_full AS address, p.zoning_class, p.zoning_zn_string, p.frontage_m, p.depth_m, p.bylaw_max_coverage_pct FROM parcels p WHERE p.is_irregular = false AND p.lot_size_confidence = 'high' AND NOT COALESCE(p.zoning_is_ambiguous, false) AND p.exception_number IS NULL AND p.bylaw_standard_setback_m IS NULL AND p.address_number IS NOT NULL AND p.address_number <> 'None' AND p.max_buildable_footprint_sqm IS NOT NULL AND p.zoning_class IN ('RD','RS','RM') AND p.is_heritage_designated ORDER BY abs(p.frontage_m - 10), p.id LIMIT 1` |
| NF-25, laneway suite (EF-14/EF-18) | id 246624 — 5 Thyra Ave (RD (f6.0; a185; d0.75); 7.97 × 37.98 m; coverage 35.00) | `SELECT p.id, p.address_number \|\| ' ' \|\| p.linear_name_full AS address, p.zoning_class, p.zoning_zn_string, p.frontage_m, p.depth_m, p.bylaw_max_coverage_pct FROM parcels p WHERE p.is_irregular = false AND p.lot_size_confidence = 'high' AND NOT COALESCE(p.zoning_is_ambiguous, false) AND p.exception_number IS NULL AND p.bylaw_standard_setback_m IS NULL AND p.address_number IS NOT NULL AND p.address_number <> 'None' AND p.max_buildable_footprint_sqm IS NOT NULL AND p.zoning_class IN ('RD','RS','RM') AND p.abuts_laneway AND NOT p.is_corner_lot ORDER BY abs(p.frontage_m - 8), p.id LIMIT 1` |
| NF-10 19.0/25.0 m, RS/RT/RM clause (4), RT height (1)(D) — inert until the on_policy_road fix | **none found** — no regular clean lot qualifies (for major streets: KFM-1, `on_policy_road` near-dead) | `SELECT p.id, p.address_number \|\| ' ' \|\| p.linear_name_full AS address, p.zoning_class, p.zoning_zn_string, p.frontage_m, p.depth_m, p.bylaw_max_coverage_pct FROM parcels p WHERE p.is_irregular = false AND p.lot_size_confidence = 'high' AND NOT COALESCE(p.zoning_is_ambiguous, false) AND p.exception_number IS NULL AND p.bylaw_standard_setback_m IS NULL AND p.address_number IS NOT NULL AND p.address_number <> 'None' AND p.max_buildable_footprint_sqm IS NOT NULL AND p.on_policy_road AND p.zoning_class IN ('RD','RS','RT','RM') ORDER BY p.frontage_m DESC, p.id LIMIT 1` |
| NF-3 RM by type, NF-7 12.0 m branch, G16/G17 type scope | id 308262 — 120 Brookhaven Dr (RM (d0.85); 10.02 × 37.62 m; coverage 35.00) | `SELECT p.id, p.address_number \|\| ' ' \|\| p.linear_name_full AS address, p.zoning_class, p.zoning_zn_string, p.frontage_m, p.depth_m, p.bylaw_max_coverage_pct FROM parcels p WHERE p.is_irregular = false AND p.lot_size_confidence = 'high' AND NOT COALESCE(p.zoning_is_ambiguous, false) AND p.exception_number IS NULL AND p.bylaw_standard_setback_m IS NULL AND p.address_number IS NOT NULL AND p.address_number <> 'None' AND p.max_buildable_footprint_sqm IS NOT NULL AND p.zoning_class = 'RM' AND NOT p.is_corner_lot AND p.bylaw_max_height_m IS NULL ORDER BY abs(p.frontage_m - 10), p.id LIMIT 1` |
| through-lot length (depth − 2 × front) | id 51192 — 1 Savona Dr (RD (f13.5; a510; d0.45); 11.96 × 37.27 m; coverage 33.00) | `SELECT p.id, p.address_number \|\| ' ' \|\| p.linear_name_full AS address, p.zoning_class, p.zoning_zn_string, p.frontage_m, p.depth_m, p.bylaw_max_coverage_pct FROM parcels p WHERE p.is_irregular = false AND p.lot_size_confidence = 'high' AND NOT COALESCE(p.zoning_is_ambiguous, false) AND p.exception_number IS NULL AND p.bylaw_standard_setback_m IS NULL AND p.address_number IS NOT NULL AND p.address_number <> 'None' AND p.max_buildable_footprint_sqm IS NOT NULL AND p.zoning_class = 'RD' AND p.is_through_lot ORDER BY abs(p.frontage_m - 12), p.id LIMIT 1` |
| NF-3 band (A), NF-22 under-6 m on a non-townhouse lot, NF-28 | id 80446 — 374 Old Orchard Grv (RD (f18.0; a690); 5.50 × 32.03 m; coverage 35.00) | `SELECT p.id, p.address_number \|\| ' ' \|\| p.linear_name_full AS address, p.zoning_class, p.zoning_zn_string, p.frontage_m, p.depth_m, p.bylaw_max_coverage_pct FROM parcels p WHERE p.is_irregular = false AND p.lot_size_confidence = 'high' AND NOT COALESCE(p.zoning_is_ambiguous, false) AND p.exception_number IS NULL AND p.bylaw_standard_setback_m IS NULL AND p.address_number IS NOT NULL AND p.address_number <> 'None' AND p.max_buildable_footprint_sqm IS NOT NULL AND p.zoning_class IN ('RD','RS') AND p.frontage_m < 6 AND NOT p.is_corner_lot ORDER BY abs(p.frontage_m - 5.5), p.id LIMIT 1` |

## 7. CoA MaxBuild (step 2 — PLANNED, not specified yet)

A Committee-of-Adjustment MaxBuild will derive from the §5 MaxBuild result, with minor-variance relief applied on top of the as-of-right envelope. **No formula is specified here.** Existing CoA-tier fields (`max_newbuild_coa_gfa_sqm` = `max_buildable_gfa_sqm × (1 + reno_coa_uplift_pct)`, Spec 65 §6 SC-1; `opt_coa_*`, Spec 78 P2.2) are calibration heuristics, not a CoA derivation, and are not redefined by this section.

## 8. Known Failure Modes

- **KFM-1 — `on_policy_road` is near-dead.** `road_overlay_distance_m` seeds at 5 m (§3.3) while the plan reports road centrelines ~10 m+ from lot lines and only 8 of 331,684 RD/RS/RT/RM parcels flagged (plan-reported; not re-measured here — this task had no DB access). Every major-street branch (NF-10, RM/RT (4) clauses) is inert until `.cursor/wf3_policy_road_overlay_distance_fix_active_task.md` lands.
- **KFM-2 — zone-median coverage default on unregulated lots (R1).** As-built `coverage_cap` fills a NULL `bylaw_max_coverage_pct` with `COVERAGE_DEFAULTS`, although the by-law applies no coverage there (G7). It binds on typical lots (§6.1, §6.4): the V25 lot's as-built footprint is 297 m², so the plan's V25 "OLD ≈573.3 m²" is the box term, not the as-built headline.
- **KFM-3 — height NULL without an overlay.** `max_build_height_m` passes `bylaw_max_height_m` through, NULL when no height overlay covers the lot, although the by-law default is 10.0 m (G6/G14; RM 10.0/12.0, G18). `height_implied` is then NULL and storeys fall to the uncapped pocket p50 (EF-5/EF-6/EF-12).
- **KFM-4 — required minimum lot frontage vs measured frontage (plan NF-3, NF-4, NF-10, NF-11).** The by-law's RD/RS side tiers, the RD corner clause and the RD length/depth applicability key on "the required minimum lot frontage" (G1, G2, G3, G4, G9), which is the zone label's `f` value (G5; default 12.0 m in RD when no `f`) — Spec 58 `zoning_bylaw_areas.frontage_min_m` (CKAN `FRONTAGE`) → `parcels.bylaw_min_frontage_m`. The plan's formulas key on `frontage_m`. The landscaping and driveway tiers (L5–L7, L10, L15) do key on the actual lot frontage. **Operator decision; not fixed here.**
- **KFM-5 — building length axis (plan EF-3, NF-17).** §800.50(105) defines building length as the distance between the front and rear main walls along the lot centreline (G20), i.e. the front-to-rear axis. The plan applies NF-10 to `max_build_width_m`. Read literally, NF-10 caps `max_build_length_m` together with NF-11; V25 would then be 16.4 × 17.0 = 278.8 m² (plan formula otherwise unchanged) instead of 311.6 m². **Operator decision.**
- **KFM-6 — RD/RM cap applicability.** RD length and depth caps apply only "with a required minimum lot frontage of 18.0 metres or less" (G3/G4); RM's 17.0/19.0 m apply to detached/semi-detached houses only (G16/G17). The plan applies them unconditionally to RD/RS/RM.
- **KFM-7 — corner clause scope.** RS/RT/RM have no general analogue of RD §10.20.40.70(6) (A1 absence check); the plan's NF-4 presumes one.
- **KFM-8 — flat side setbacks as-built.** `SETBACK_DEFAULTS` side 0.9 m (RD/RS/RT) / 1.5 m (RM) regardless of frontage tier or building type (by-law: G1, G9, G12, G15).
- **KFM-9 — greenspace permission is not the by-law rule.** As-built `garage_permission` / `rear_suite_permission` test `greenspace_after ≥ min_soft_landscaping_pct × lot_size_sqm` (30 % of the lot, Spec 65 AF-5), not the rear-yard soft-landscaping rule (L10: 50 % / 25 % of the rear yard; L20/L21 for suites).
- **KFM-10 — `STAND_SET` semantics.** Whether `STAND_SET` encodes a Chapter 900 front-setback exception (and so outranks averaging) is an inference from schema position (plan NF-1 caveat), not a verbatim rule.
- **KFM-11 — quotes that are not verbatim.** 12 quoted strings in the plan/report fail verification (Appendix A) — elided `[ By-law … ]` notes, single-for-double quotes, a paraphrased Major-Street definition (C12), a merged "front/side" 75 % rule (C18), a period inserted into a section heading (C55), and the report's own emphasis phrases (C58/C59). They must not be re-used as quotes. (Separately, the RD coverage clause on the City page itself reads "if a lot in is in an area" — G7 reproduces it as published.)
- **KFM-12 — zone-label FSI never applied (plan Scope additions (a), EF-23).** `fsi_cap` reads `bylaw_max_fsi` (CKAN `FSI_TOTAL`); the label `d` (the FSI by G8/H23–H25) is in `bylaw_max_density` on 119,386 RD/RS/RT/RM parcels; 82,444 GFAs would drop (8,511,554 m²). `bylaw_max_density` is MIN-sourced — a fix must source it dominant (DEC-1).
- **KFM-13 — garden-suite permission is not §150.7.50.10 (plan Scope additions (b), EF-24).** The 30 %-of-lot greenspace test passes suites that the by-law's 50 % / 25 % soft share of the area behind the house rejects: 214,586 of 279,243 at envelope length (41 Derwyn Rd: ≤ 41.73 m² vs 60 m²).
- **KFM-14 — STAND_SET is a Development Standard Set number, not metres (plan Scope additions (c), EF-25/EF-26).** Borrowed onto 2,341 residential parcels by MAX aggregation and used as a 2–3 m front setback: 127 footprints and 127 GFAs too large, 2,020 confidence labels inflated. Field kept; ruling pending.

## 9. Open operator decisions (surfaced, not decided)

1. KFM-4 — key the RD/RS side tiers, the RD corner clause and the RD caps on `bylaw_min_frontage_m` (required) or `frontage_m` (measured)?
2. KFM-5 — does NF-10 cap width (plan) or length (by-law definition)? V25's expected value depends on it.
3. KFM-6 — scope the RD caps to required frontage ≤ 18.0 m and the RM caps to detached/semi?
4. R1 — retire the zone-median coverage default once real setbacks + caps land (plan R1)?
5. Plan Step 1(c) — the NF-3/EF-5 "NULL, don't guess" fallback (still open in the plan).
6. Whether to model the RS/RT/RM major-street clauses (4) and RT height (1)(D) now or after KFM-1.
7. KFM-12 / EF-23 — read the label FSI from `bylaw_max_density` (sourced dominant), gated on Reality-Check?
8. KFM-13 / EF-24 — replace the 30 %-of-lot garden-suite test with the §150.7.50.10 share of the area behind the house?
9. KFM-14 / EF-25 / EF-26 — treat STAND_SET as the CR standard-set selector (never a residential front setback) and source it dominant? (operator belief and evidence side by side in the plan)

## 10. Testing Mandate

- **Existing (as-built):** `src/tests/max-build.logic.test.ts` (setback/coverage/side-count generators, `MAX_BUILD_COLS` ∩ `ALL_WRITE_COLS` empty, constants), `src/tests/db/enrich-parcels-maxbuild.db.test.ts` (lot tiers, footprint vs coverage cap, ravine, heritage, garden suite, NULL-on-low-confidence, idempotency; gated `BUILDO_TEST_DB=1`), `src/tests/db/enrich-parcels-maxbuild-corner.db.test.ts` (corner width, MB-5 D-A), `src/tests/db/enrich-parcels-clamp.db.test.ts` (below-floor clamp, MB-3 D-C), `src/tests/enrich-permits-maxbuild.logic.test.ts` (propagation), `src/tests/steps/enrich_parcels/sql-verbatim.logic.test.ts`, `src/tests/optimal-config.logic.test.ts` (Spec 78 consumer).
- **Planned:** V1–V25 as literal fixture rows in the planned golden-differential test (plan Step 6), after the §9 decisions — V25's expected value changes under KFM-5/KFM-4. The generator's self-check of the vectors against the plan formulas:

| Vector | Plan expected | calc.js (plan formulas) | Match |
| --- | --- | --- | --- |
| V1 | 0.6 | 0.6 | yes |
| V2 | 0.9 | 0.9 | yes |
| V3 | 1.8 | 1.8 | yes |
| V4 | 3 | 3 | yes |
| V5 | 1.5 | 1.5 | yes |
| V6 | 1.8 | 1.8 | yes |
| V7 | 7.5 | 7.5 | yes |
| V8 | 8.75 | 8.75 | yes |
| V9 | 7.5 | 7.5 | yes |
| V10 | 0.9 | 0.9 | yes |
| V11 | 7.5 | 7.5 | yes |
| V12 | NULL | NULL | yes |
| V13 | 1.2 | 1.2 | yes |
| V14 | 1.5 | 1.5 | yes |
| V15 | 0.9 | 0.9 | yes |
| V16 | — | expected value TBD in plan | skipped |
| V17 | 2.4 | 2.4 | yes |
| V18 | 10 | 10 / 10 / 10 | yes |
| V19 | 10 | 10 | yes |
| V20 | 12 | 12 | yes |
| V21 | 17 | 17 | yes |
| V22 | NULL | NULL | yes |
| V23 | NULL | NULL | yes |
| V24 | 60 | 60 | yes |
| V25 | 311.6 | 311.6 | yes |

- **This spec:** re-run `spec67-gen/gen.js --write` after any change to the plan, Spec 58 §13, `MAX_BUILD_COLS`, `SETBACK_DEFAULTS`/`COVERAGE_DEFAULTS` or the generated schema; it exits non-zero on any plan↔Spec 58 divergence, non-byte-exact port, missing anchor or vector mismatch.

## 11. Operating Boundaries

### Target Files
<!-- generated:target-files -->
<!-- do not hand-edit: npm run target-files regenerates this block from the census owner_specs, the capture-step-golden derivation, the cross-step ledger and consumer-registry.json -->
- `enrich_parcels` — ENRICHER · converted · owner specs: 65 · 67 · 78
  - `scripts/enrich-parcels.js`
  - `scripts/enrich-parcels.descriptor.json`
  - `scripts/enrich-parcels.notes.json`
  - `scripts/lib/compute/enrich-parcels.js`
  - `src/tests/steps/enrich_parcels/pending-scope-when.logic.test.ts`
  - `src/tests/steps/enrich_parcels/sql-verbatim.logic.test.ts`
  - `src/tests/steps/enrich_parcels/violations.test.ts`
  - data (descriptor): `building_footprints` reads (migrations/023_building_footprints.sql); `coa_applications` reads (migrations/009_coa_applications.sql); `enrich_parcels_pass3_scope` writes (migrations/240_phase_b_massing_watermark_and_pass3_scope.sql); `neighbourhood_build_norms` reads (migrations/199_neighbourhood_build_norms.sql); `neighbourhood_storey_norms` reads (migrations/195_neighbourhood_storey_norms.sql); `neighbourhoods` reads (migrations/013_neighbourhoods.sql); `parcel_buildings` reads (migrations/024_parcel_buildings.sql); `parcels` reads+writes (migrations/011_parcels.sql); `permits` reads (migrations/001_permits.sql); `zoning_bylaw_areas` reads (migrations/164_zoning_bylaw_tables.sql); `zoning_height_overlay` reads (migrations/164_zoning_bylaw_tables.sql); `zoning_lot_coverage_overlay` reads (migrations/164_zoning_bylaw_tables.sql)
  - upstream: enrich_centreline · enrich_heritage · enrich_ravines · link_massing · massing · neighbourhoods · parcels
  - downstream: assert_global_coverage · assert_parcel_sanity · compute_parcel_cost_estimates · link_massing
  - consumers: none
<!-- /generated:target-files -->
- `scripts/lib/max-build.js` — as-built constants + generators (`SETBACK_DEFAULTS`, `COVERAGE_DEFAULTS`, `buildSetbackCase`, `buildCoverageCase`, `buildSideCountCase`, `MAX_BUILD_COLS`) — documented here, owned by Spec 65
- `scripts/seeds/logic_variables.json` — the max-build / zoning-pass tunables of §3.3
- PLANNED (plan Steps 2–8, not created): new `migrations/` for NF-1..NF-16 (parcels + permits/coa mirrors), `buildRearSetbackCase` / `buildSideSetbackCase` / `buildBuildingLengthCase` / `buildBuildingDepthCase` / `buildLandscapingCase` in `scripts/lib/max-build.js`, `src/tests/factories.ts`, `scripts/analysis/parcel-sanity-audit.js` bounds
- Tests this spec governs beyond its generated step suites (Amendment 6 of the generated-Target-Files WF2: the block's step tests switched off the system map's whole-spec test fallback, so these are now named here): `src/tests/max-build.logic.test.ts`, `src/tests/db/enrich-parcels-maxbuild.db.test.ts`, `src/tests/db/enrich-parcels-maxbuild-corner.db.test.ts`, `src/tests/db/enrich-parcels-clamp.db.test.ts`, `src/tests/enrich-permits-maxbuild.logic.test.ts`, `src/tests/optimal-config.logic.test.ts`

### Step-file notes
*Moved out of Target Files by the generated-Target-Files WF2 (2026-09-30): the step-owned files are listed by the generated block under Target Files; each note below is the annotation its bullet carried, verbatim.*
- `scripts/lib/compute/enrich-parcels.js` — `buildMaxBuildSql` (max-build pass) and `buildEnrichmentSql` (zoning pass writing `bylaw_*`) — documented here, owned by Spec 65

### Out-of-Scope Files
- `scripts/load-zoning.js` and the zoning source tables — Spec 58
- `scripts/enrich-permits.js` (propagation) — Spec 65 MB-7 / Spec 66
- `scripts/lib/optimal-config.js` and the optimal-config pass — Spec 78
- Cost model (`compute-parcel-cost-estimates`, `cost-model-shared`) — Specs 83 / 88
- Admin / mobile UI for the user-input fields (NF-15, NF-16, NF-26..NF-28) — the separate viewer-input WF1

### Cross-Spec Dependencies
- **Relies on:** Spec 58 (zoning source tables §2, `records_meta` contract §9, provisions reference §13), Spec 65 (§4 max-build envelope — the as-built owner; §6–§8 scenarios, accessory fit, storey norms), Spec 55 (parcels lot dims + geom), Spec 56 (massing), Spec 57 (neighbourhoods), Spec 59 (ravine), Spec 61 (heritage), Spec 62 (corner / through / laneway flags)
- **Consumed by:** Spec 78 (optimal-config engine reads the envelope), Spec 83 / Spec 88 (cost model prices `max_buildable_gfa_sqm` and the accessory fields), Spec 89 / Spec 100 (parcel cost tool surfaces)
- `scripts/enrich-parcels.js` (chain step `enrich_parcels`, owned by Spec 65) — the step whose compute module `scripts/lib/compute/enrich-parcels.js` this spec documents
- `.cursor/wf2_bylaw_formula_fixes_active_task.md` — QUEUED source of record for §3.4/§3.5 and V1–V25
- `.cursor/wf3_policy_road_overlay_distance_fix_active_task.md` — QUEUED prerequisite for every major-street branch
- `docs/reports/parcel-columns-buyer-lot-report-derivation.md` — research source

---

## Appendix A — quoted by-law claims *(generated)*

| Claim | Origin | Cited section(s) | Quote (as written in the source) | Result | Page(s) | fetched_at | Page text spanning an excerpt (verbatim) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C1 | NF-1 · By-law claim | §10.20.40.70, §10.40.40.70, §10.60.40.70, §10.80.40.70 | "the required minimum front yard setback... is 6.0 metres" | VERIFIED (excerpt) | [ch10_20](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_20.htm)<br>[ch10_40](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_40.htm)<br>[ch10_60](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_60.htm)<br>[ch10_80](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_80.htm) | 2026-09-29T14:45:17.303Z<br>2026-09-29T14:45:17.446Z<br>2026-09-29T14:45:17.645Z<br>2026-09-29T14:45:17.778Z | ch10_20: "the required minimum front yard setback in the RD zone is 6.0 metres"<br>ch10_40: "the required minimum front yard setback in the RS zone is 6.0 metres"<br>ch10_60: "the required minimum front yard setback in the RT zone is 6.0 metres"<br>ch10_80: "the required minimum front yard setback in the RM zone is 6.0 metres" |
| C2 | NF-2 · By-law claim | §10.20.40.70, §10.40.40.70, §10.80.40.70 | "the greater of: (A) 7.5 metres; or (B) 25% of the lot depth" | VERIFIED (exact) | [ch10_20](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_20.htm)<br>[ch10_40](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_40.htm)<br>[ch10_80](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_80.htm) | 2026-09-29T14:45:17.303Z<br>2026-09-29T14:45:17.446Z<br>2026-09-29T14:45:17.778Z | — |
| C3 | NF-2 · By-law claim | §10.60.40.70 | "the required minimum rear yard setback in the RT zone is 7.5 metres" | VERIFIED (exact+casefold) | [ch10_60](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_60.htm) | 2026-09-29T14:45:17.645Z | — |
| C4 | NF-3 · By-law claim | §10.20.40.70, §10.40.40.70, §10.60.40.70 | "(Deleted by By-law 648-2025)" | VERIFIED (exact) | [ch10_20](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_20.htm)<br>[ch10_40](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_40.htm)<br>[ch10_60](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_60.htm) | 2026-09-29T14:45:17.303Z<br>2026-09-29T14:45:17.446Z<br>2026-09-29T14:45:17.645Z | — |
| C5 | NF-4 · By-law claim | §10.20.40.70 | "Despite regulation 10.20.40.70(3) and (4), for a corner lot in the RD zone, the required minimum side yard setback from a side lot line abutting a street is 3.0 metres, if: (A) the required minimum lot frontage... is 12.0 metres or more; and (B) there is an adjacent lot fronting on the street abutting the side lot line." | VERIFIED (excerpt+trailing-punct) | [ch10_20](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_20.htm) | 2026-09-29T14:45:17.303Z | ch10_20: "Despite regulation 10.20.40.70(3) and (4), for a corner lot in the RD zone, the required minimum side yard setback from a side lot line abutting a street is 3.0 metres, if: (A) the required minimum lot frontage for the corner lot is 12.0 metres or more; and (B) there is an adjacent lot fronting on the street abutting the side lot line" |
| C6 | NF-7 · By-law claim | §10.20.40.10, §10.40.40.10, §10.60.40.10 | "...10.0 metres" | VERIFIED (exact) — weak (<15 chars) | [ch10_20](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_20.htm)<br>[ch10_40](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_40.htm)<br>[ch10_60](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_60.htm) | 2026-09-29T14:45:17.303Z<br>2026-09-29T14:45:17.446Z<br>2026-09-29T14:45:17.645Z | — |
| C7 | NF-7 · By-law claim | §10.80.40.10 | "(i) 10.0 metres, for a detached house or semi-detached house; and (ii) 12.0 metres, for any other building" | VERIFIED (exact) | [ch10_80](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_80.htm) | 2026-09-29T14:45:17.778Z | — |
| C8 | NF-8 · By-law claim | §10.20.30.40, §10.40.30.40, §10.60.30.40, §10.80.30.40 | "if a lot is not in an area with a numerical value on the Lot Coverage Overlay Map, no lot coverage applies" | VERIFIED (exact) | [ch10_20](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_20.htm)<br>[ch10_40](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_40.htm)<br>[ch10_60](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_60.htm)<br>[ch10_80](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_80.htm) | 2026-09-29T14:45:17.303Z<br>2026-09-29T14:45:17.446Z<br>2026-09-29T14:45:17.645Z<br>2026-09-29T14:45:17.778Z | — |
| C9 | NF-9 · By-law claim | §10.20.40.40, §10.40.40.40, §10.60.40.40, §10.80.40.40 | "the floor space index is not limited by this regulation" | VERIFIED (exact) | [ch10_20](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_20.htm)<br>[ch10_40](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_40.htm)<br>[ch10_60](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_60.htm)<br>[ch10_80](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_80.htm) | 2026-09-29T14:45:17.303Z<br>2026-09-29T14:45:17.446Z<br>2026-09-29T14:45:17.645Z<br>2026-09-29T14:45:17.778Z | — |
| C10 | NF-10 · By-law claim | §10.20.40.20 | "17.0 metres" | VERIFIED (exact) — weak (<15 chars) | [ch10_20](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_20.htm) | 2026-09-29T14:45:17.303Z | — |
| C11 | NF-10 · By-law claim | §10.40.40.20, §10.80.40.20, §10.60.40.20 | "If a lot abuts a major street, the permitted maximum building length is: (A) 19.0... (B) 25.0..." | VERIFIED (excerpt+casefold/excerpt) | [ch10_40](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_40.htm)<br>[ch10_80](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_80.htm)<br>[ch10_60](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_60.htm) | 2026-09-29T14:45:17.446Z<br>2026-09-29T14:45:17.778Z<br>2026-09-29T14:45:17.645Z | ch10_40: "if a lot abuts a major street, the permitted maximum building length is: (A) 19.0 metres for a townhouse; and (B) 25.0"<br>ch10_80: "if a lot abuts a major street, the permitted maximum building length is: (A) 19.0 metres for a townhouse; and (B) 25.0"<br>ch10_60: "If a lot abuts a major street, the permitted maximum building length is: (A) 19.0 metres for a townhouse; and (B) 25.0" |
| C12 | NF-10 · Constraints | §800.50 | "'Major Street' = any street identified as 'Major Streets' on the Policy Areas Overlay Map found in Section 995.10." | UNVERIFIED | [ch800](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter800.htm) ✗ fragment 1/1 not found: "'Major Street' = any street identified as 'Major Streets' on the Polic" | 2026-09-29T14:45:16.969Z | — |
| C13 | NF-11 · By-law claim | §10.20.40.30, §10.40.40.30, §10.80.40.30 | "rear main wall... no more than 19.0 metres from the required minimum front yard setback" | UNVERIFIED | [ch10_20](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_20.htm) ✗ fragment 2/2 not found in order after fragment 1: "no more than 19.0 metres from the required minimum front yard setback"<br>[ch10_40](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_40.htm) ✗ fragment 2/2 not found in order after fragment 1: "no more than 19.0 metres from the required minimum front yard setback"<br>[ch10_80](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_80.htm) | 2026-09-29T14:45:17.303Z<br>2026-09-29T14:45:17.446Z<br>2026-09-29T14:45:17.778Z | ch10_80: "rear main wall of a detached house or semi-detached house, not including a one storey extension that complies with regulation 10.80.40.20(2), may be no more than 19.0 metres from the required minimum front yard setback" |
| C14 | NF-12 · By-law claim | §10.5.50.10 | "a minimum of 50 percent of the front yard must be landscaping" | VERIFIED (exact) | [ch10_5](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm) | 2026-09-29T14:45:17.162Z | — |
| C15 | NF-12 · By-law claim | (inherited) ch10_5 | "...60 percent..." | VERIFIED (exact) — weak (<15 chars) | [ch10_5](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm) | 2026-09-29T14:45:17.162Z | — |
| C16 | NF-13 · By-law claim | §10.5.50.10 | "a minimum of 50% of the rear yard for soft landscaping, if the lot frontage is greater than 6.0 metres... a minimum of 25%... if... 6.0 metres or less" | VERIFIED (excerpt) | [ch10_5](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm) | 2026-09-29T14:45:17.162Z | ch10_5: "a minimum of 50% of the rear yard for soft landscaping, if the lot frontage is greater than 6.0 metres; and (B) a minimum of 25% of the rear yard for soft landscaping, if the lot frontage is 6.0 metres or less" |
| C17 | NF-14 · By-law claim | §10.5.50.10 | "a minimum of 60 percent of the side yard abutting a street for landscaping" | VERIFIED (exact) | [ch10_5](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm) | 2026-09-29T14:45:17.162Z | — |
| C18 | — · By-law claim | §10.5.50.10 | "a minimum of 75 percent of the front/side yard landscaping... must be soft landscaping" | UNVERIFIED | [ch10_5](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm) ✗ fragment 1/2 not found: "a minimum of 75 percent of the front/side yard landscaping" | 2026-09-29T14:45:17.162Z | — |
| C19 | NF-18 · By-law claim | §10.20.30.40, §10.40.30.40, §10.60.30.40, §10.80.30.40 | "if a lot is not in an area with a numerical value on the Lot Coverage Overlay Map, no lot coverage applies" | VERIFIED (exact) | [ch10_20](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_20.htm)<br>[ch10_40](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_40.htm)<br>[ch10_60](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_60.htm)<br>[ch10_80](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_80.htm) | 2026-09-29T14:45:17.303Z<br>2026-09-29T14:45:17.446Z<br>2026-09-29T14:45:17.645Z<br>2026-09-29T14:45:17.778Z | — |
| C20 | NF-20 · By-law claim | §10.5.50.10 | "(D) a minimum of 75 percent of the front yard landscaping required in (A), (B), and (C) above, must be soft landscaping, and if a lot does not have a permitted driveway in the front yard, a minimum of 75 percent of the front yard must be soft landscaping. [ By-law: 648-2025 ]" | VERIFIED (exact) | [ch10_5](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm) | 2026-09-29T14:45:17.162Z | — |
| C21 | NF-20 · By-law claim | §800.50 | "(395) Landscaping means an area used for trees, plants, decorative stonework, retaining walls, walkways, or other landscape or architectural elements. Driveways and areas for loading, parking or storing of vehicles are not landscaping." | VERIFIED (exact) | [ch800](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter800.htm) | 2026-09-29T14:45:16.969Z | — |
| C22 | NF-20 · By-law claim | §10.20.80.1, §10.40.80.1, §10.60.80.1, §10.80.80.1 | "(D) the area of the removed driveway in the front yard must be landscaping, but may continue to be considered a permitted driveway for the purposes of calculating required soft landscaping under regulation 10.5.50.10(1)(D);" | VERIFIED (exact) | [ch10_20](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_20.htm)<br>[ch10_40](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_40.htm)<br>[ch10_60](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_60.htm)<br>[ch10_80](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_80.htm) | 2026-09-29T14:45:17.303Z<br>2026-09-29T14:45:17.446Z<br>2026-09-29T14:45:17.645Z<br>2026-09-29T14:45:17.778Z | — |
| C23 | NF-21 · By-law claim | §800.50 | "(395) Landscaping means an area used for trees, plants, decorative stonework, retaining walls, walkways, or other landscape or architectural elements. Driveways and areas for loading, parking or storing of vehicles are not landscaping." | VERIFIED (exact) | [ch800](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter800.htm) | 2026-09-29T14:45:16.969Z | — |
| C24 | NF-21 · By-law claim | §800.50 | "(780) Soft Landscaping means landscaping excluding hard-surfaced areas such as decorative stonework, retaining walls, walkways, or other hard-surfaced landscape-architectural elements." | VERIFIED (exact) | [ch800](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter800.htm) | 2026-09-29T14:45:16.969Z | — |
| C25 | NF-21 · By-law claim | §10.5.50.10 | "(D) a minimum of 75 percent of the front yard landscaping required in (A), (B), and (C) above, must be soft landscaping, and if a lot does not have a permitted driveway in the front yard, a minimum of 75 percent of the front yard must be soft landscaping. [ By-law: 648-2025 ]" | VERIFIED (exact) | [ch10_5](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm) | 2026-09-29T14:45:17.162Z | — |
| C26 | NF-21 · By-law claim | (inherited) ch10_5 | "hard landscaping" | ABSENCE PHRASE (verified by count via ledger L3/L27/L28) | — | — | — |
| C27 | NF-22 · By-law claim | §10.5.50.10 | "(1) Front Yard Landscaping for Certain Types of Residential Buildings In the Residential Zone category, on a lot with a detached house, semi-detached house, detached houseplex, semi-detached houseplex or townhouse, the following front yard landscaping regulations apply:" | VERIFIED (exact) | [ch10_5](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm) | 2026-09-29T14:45:17.162Z | — |
| C28 | NF-22 · By-law claim | §10.5.50.10 | "(A) for lots with a lot frontage less than 6.0 metres, or a townhouse dwelling unit less than 6.0 metres wide, the front yard, excluding a permitted driveway or permitted parking pad must be landscaping; [By-law: 1429-2017]" | VERIFIED (exact) | [ch10_5](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm) | 2026-09-29T14:45:17.162Z | — |
| C29 | NF-22 · By-law claim | §10.5.50.10 | "(B) for lots with a lot frontage of 6.0 metres to less than 15.0 metres, or a townhouse dwelling unit at least 6.0 metres wide, a minimum of 50 percent of the front yard must be landscaping;" | VERIFIED (exact) | [ch10_5](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm) | 2026-09-29T14:45:17.162Z | — |
| C30 | NF-22 · By-law claim | §10.5.50.10 | "(C) for lots with a lot frontage of 15.0 metres or greater, a minimum of 60 percent of the front yard must be landscaping; and" | VERIFIED (exact) | [ch10_5](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm) | 2026-09-29T14:45:17.162Z | — |
| C31 | NF-23 · By-law claim | §10.5.100.1 | "(1) Driveway Width in the Front Yard for Certain Residential Building Types In the Residential Zone category, in addition to meeting the landscaping requirements in regulation 10.5.50.10, for a detached house, semi-detached house, or duplex, and for an individual townhouse dwelling unit if an individual private driveway leads directly to the dwelling unit, a driveway that is in the front yard or passes through the front yard may have the following dimensions in the front yard: (A) a minimum width of 2.0 metres; (B) for lots with a lot frontage less than 6.0 metres, or a townhouse dwelling unit less than 6.0 metres wide, a maximum width of 2.6 metres; (C) for lots with a lot frontage of 6.0 metres to 23.0 metres inclusive, or a townhouse dwelling unit at least 6.0 metres wide, a maximum driveway width the lesser of: (i) 6.0 metres; (ii) the cumulative width of side-by-side parking spaces behind the front main wall, but not in the rear yard; or (iii) the width of a single parking spaces behind the front main wall, but not in the rear yard; or (iv) 2.6 metres if all parking spaces are in the rear yard; and (D) for lots with a lot frontage greater than 23.0 metres, a maximum driveway width the lesser of: (i) 9.0 metres; (ii) the cumulative width of side-by-side parking spaces behind the front main wall if there is at least one parking space behind the front main wall but not in the rear yard; or (iii) 2.6 metres if all parking spaces are in the rear yard." | VERIFIED (exact) | [ch10_5](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm) | 2026-09-29T14:45:17.162Z | — |
| C32 | NF-23 · By-law claim | §200.5.1.10 | "(2) Parking Space Dimensions - Minimum A parking space is subject to the following: (A) A parking space must have the following minimum dimensions: (i) length of 5.6 metres; (ii) width of 2.6 metres; (iii) vertical clearance of 2.0 metres; and (iv) the minimum width in (ii) must be increased by 0.3 metres for each side of the parking space that is obstructed according to (D) below;" | VERIFIED (exact) | [ch200](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter200.htm) | 2026-09-29T14:45:18.194Z | — |
| C33 | NF-23 · By-law claim | §200.5.1.10 | "(3) Parking Space Dimensions - Maximum The maximum dimensions for a parking space are: (A) length of 6.0 metres (B) width of 3.2 metres" | VERIFIED (exact) | [ch200](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter200.htm) | 2026-09-29T14:45:18.194Z | — |
| C34 | NF-24 · By-law claim | §150.7.50.10 | "(1) Landscaping Requirements for a Garden Suite Despite regulation 10.5.50.10(3), for a lot with a residential building and an ancillary building containing a garden suite: (A) with a lot frontage of greater than 6.0 metres, a minimum of 50 percent of the area: (i) between all rear main walls of the residential building on the lot and the rear lot line, and (ii) extending parallel to the rear lot line across the full width of the lot from the point where the rear main wall of the residential building meets the residential building's side main walls closest to the respective side lot lines, must be for soft landscaping; (B) with a lot frontage of 6.0 metres or less, a minimum of 25 percent of the area: (i) between all rear main walls of the residential building on the lot and the rear lot line, and (ii) extending parallel to the rear lot line across the full width of the lot from the point where the rear main wall of the residential building meets the residential building's side main walls closest to the respective side lot lines, must be for soft landscaping. [ By-law: 101-2022 ]" | VERIFIED (exact) | [ch150_7](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter150_7.htm) | 2026-09-29T14:45:17.918Z | — |
| C35 | NF-25 · By-law claim | §150.8.50.10 | "(1) Landscaping Requirements for a Laneway Suite Despite regulation 10.5.50.10 (3), for a lot with a residential building and an ancillary building containing a laneway suite: (A) with a lot frontage of 6.0 metres or less, a minimum of 60 percent of the area between all rear main walls of the residential building and the front main wall of the ancillary building containing a laneway suite must be for soft landscaping; (B) with a lot frontage of greater than 6.0 metres, a minimum of 85 percent of the area between all rear main walls of the residential building and the front main wall of the ancillary building containing a laneway suite must be for soft landscaping, excluding a pedestrian walkway which may have a maximum width of 1.5 metres; and (C) the area between the ancillary building containing a laneway suite and the lot line abutting a lane, excluding a permitted driveway, and a pedestrian walkway which may have a maximum width of 1.5 metres, must be landscaping, of which a minimum of 75 percent must be soft landscaping. [ By-law: 1107-2021 ]" | VERIFIED (exact) | [ch150_8](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter150_8.htm) | 2026-09-29T14:45:18.062Z | — |
| C36 | NF-26 · By-law claim | §10.5.50.10 | "(D) a minimum of 75 percent of the front yard landscaping required in (A), (B), and (C) above, must be soft landscaping, and if a lot does not have a permitted driveway in the front yard, a minimum of 75 percent of the front yard must be soft landscaping. [ By-law: 648-2025 ]" | VERIFIED (exact) | [ch10_5](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm) | 2026-09-29T14:45:17.162Z | — |
| C37 | NF-26 · By-law claim | (inherited) ch10_5 | "shared driveway" | ABSENCE PHRASE (verified by count via ledger L3/L27/L28) | — | — | — |
| C38 | NF-26 · By-law claim | (inherited) ch10_5 | "mutual driveway" | ABSENCE PHRASE (verified by count via ledger L3/L27/L28) | — | — | — |
| C39 | NF-27 · By-law claim | §800.50 | "(395) Landscaping means an area used for trees, plants, decorative stonework, retaining walls, walkways, or other landscape or architectural elements. Driveways and areas for loading, parking or storing of vehicles are not landscaping." | VERIFIED (exact) | [ch800](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter800.htm) | 2026-09-29T14:45:16.969Z | — |
| C40 | NF-28 · By-law claim | §10.5.50.10 | "(A) for lots with a lot frontage less than 6.0 metres, or a townhouse dwelling unit less than 6.0 metres wide, the front yard, excluding a permitted driveway or permitted parking pad must be landscaping; [By-law: 1429-2017]" | VERIFIED (exact) | [ch10_5](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm) | 2026-09-29T14:45:17.162Z | — |
| C41 | NF-28 · By-law claim | §10.5.80.10 | "(3) Street Yard Parking Space In the Residential Zone category, a parking space may not be in a front yard or a side yard abutting a street. This regulation does not apply if a parking space in the front yard is permitted by the City of Toronto under the authority of the City of Toronto Act, 2006, or its predecessor." | VERIFIED (exact) | [ch10_5](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm) | 2026-09-29T14:45:17.162Z | — |
| C42 | NF-28 · By-law claim | (inherited) ch10_5 | "parking pad" | ABSENCE PHRASE (verified by count via ledger L3/L27/L28) | — | — | — |
| C43 | report · verbatim record | (inherited) ch10_60, ch10_80 | "(A) if a lot is in an area with a numerical value on the Lot Coverage Overlay Map, that numerical value is the permitted maximum lot coverage... (B) if a lot is not in an area with a numerical value on the Lot Coverage Overlay Map, no lot coverage applies; (C) ...if a lot abuts a major street, the permitted maximum lot coverage for a townhouse or apartment building is 50 percent...; (D) ...if the numerical value on the Lot Coverage Overlay Map is less than 45 percent and the lot contains detached houseplex, semi-detached houseplex or a residential building with a secondary suite, the maximum lot coverage for all buildings and structures on the lot is 45 percent." | UNVERIFIED | [ch10_60](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_60.htm) ✗ fragment 2/5 not found in order after fragment 1: "(B) if a lot is not in an area with a numerical value on the Lot Cover"<br>[ch10_80](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_80.htm) ✗ fragment 2/5 not found in order after fragment 1: "(B) if a lot is not in an area with a numerical value on the Lot Cover" | 2026-09-29T14:45:17.645Z<br>2026-09-29T14:45:17.778Z | — |
| C44 | report · verbatim record | (inherited) ch10_60, ch10_80 | "...(B) if the zone label... does not include a 'd' value... the floor space index is not limited by this regulation; (C) the permitted maximum floor space index in regulation (A) and (B) above does not apply to a detached houseplex, semi-detached houseplex or a residential building with a secondary suite; and (D) ...the permitted maximum floor space index regulations do not apply to a townhouse or an apartment building that has 60 dwelling units or less... on a lot abutting a major street." | UNVERIFIED | [ch10_60](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_60.htm) ✗ fragment 2/5 not found in order after fragment 1: "does not include a 'd' value"<br>[ch10_80](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_80.htm) ✗ fragment 2/5 not found in order after fragment 1: "does not include a 'd' value" | 2026-09-29T14:45:17.645Z<br>2026-09-29T14:45:17.778Z | — |
| C45 | report · verbatim record | (inherited) ch10_60 | "(B) if the lot is in an area with no numerical value... 10.0 metres; (C) ...the permitted maximum height for a detached houseplex or semi-detached houseplex is the greater of: (i) the numerical value... on the Height Overlay Map; or (ii) 10.0 metres; and (D) ...for a townhouse, the greater of 13.0 metres or the [HT] value; and... for an apartment building, the greater of 19.0 metres or the [HT] value." | UNVERIFIED | [ch10_60](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_60.htm) ✗ fragment 4/8 not found in order after fragment 3: "on the Height Overlay Map; or (ii) 10.0 metres; and (D)" | 2026-09-29T14:45:17.645Z | — |
| C46 | report · verbatim record | (inherited) ch10_80 | "(B) if the lot is in an area with no numerical value... (i) 10.0 metres, for a detached house or semi-detached house; and (ii) 12.0 metres, for any other building or structure." | VERIFIED (excerpt) | [ch10_80](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_80.htm) | 2026-09-29T14:45:17.778Z | ch10_80: "(B) if the lot is in an area with no numerical value following the letters "HT" on the Height Overlay Map: (i) 10.0 metres, for a detached house or semi-detached house; and (ii) 12.0 metres, for any other building or structure." |
| C47 | report · verbatim record | (inherited) ch10_60 | "the required minimum front yard setback in the RT zone is 6.0 metres." | VERIFIED (exact) | [ch10_60](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_60.htm) | 2026-09-29T14:45:17.645Z | — |
| C48 | report · verbatim record | (inherited) ch10_60 | "The required minimum rear yard setback in the RT zone is 7.5 metres." | VERIFIED (exact) | [ch10_60](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_60.htm) | 2026-09-29T14:45:17.645Z | — |
| C49 | report · verbatim record | (inherited) ch10_60 | "(A) the required minimum side yard setback is 7.5 metres; and (B) despite (A) above, the required minimum side yard setback is 0.9 metres for: (i) a detached house; (ii) a semi-detached house; (iii) a detached houseplex; (iv) a semi-detached houseplex; and (vi) a townhouse, if all the dwelling units front directly on a street." | UNVERIFIED | [ch10_60](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_60.htm) ✗ fragment 1/1 not found: "(A) the required minimum side yard setback is 7.5 metres; and (B) desp" | 2026-09-29T14:45:17.645Z | — |
| C50 | report · verbatim record | (inherited) ch10_80 | "(1) ...If regulation 10.5.40.70(1) does not apply, the required minimum front yard setback in the RM zone is 6.0 metres." | VERIFIED (excerpt) | [ch10_80](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_80.htm) | 2026-09-29T14:45:17.778Z | ch10_80: "(1) Minimum Front Yard Setback If regulation 10.5.40.70(1) does not apply, the required minimum front yard setback in the RM zone is 6.0 metres." |
| C51 | report · verbatim record | (inherited) ch10_80 | "(2) ...the greater of: (A) 7.5 metres; or (B) 25% of the lot depth." | VERIFIED (excerpt) | [ch10_80](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_80.htm) | 2026-09-29T14:45:17.778Z | ch10_80: "(2) Minimum Rear Yard Setback The required minimum rear yard setback in the RM zone is the greater of: (A) 7.5 metres; or (B) 25% of the lot depth." |
| C52 | report · verbatim record | (inherited) ch10_80 | "(3) ...(A) 1.2 metres for a detached house or detached houseplex; (B) 1.5 metres for a semi-detached house or semi-detached houseplex; and (C) 2.4 metres for an apartment building, or a non-residential building." | UNVERIFIED | [ch10_80](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_80.htm) ✗ fragment 2/2 not found in order after fragment 1: "(A) 1.2 metres for a detached house or detached houseplex; (B) 1.5 met" | 2026-09-29T14:45:17.778Z | — |
| C53 | report · verbatim record | (inherited) ch10_20 | "(A) 0.6 metres if the required minimum lot frontage is less than 6.0 metres; (B) 0.9 metres if... 6.0 metres to less than 12.0 metres; (C) 1.2 metres if... 12.0 metres to less than 15.0 metres; (D) 1.5 metres if... 15.0 metres to less than 18.0 metres; (E) 1.8 metres if... 18.0 metres to less than 24.0 metres; (F) 2.4 metres if... 24.0 metres to less than 30.0 metres; and (G) 3.0 metres if... 30.0 metres or greater." | VERIFIED (excerpt) | [ch10_20](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_20.htm) | 2026-09-29T14:45:17.303Z | ch10_20: "(A) 0.6 metres if the required minimum lot frontage is less than 6.0 metres; (B) 0.9 metres if the required minimum lot frontage is 6.0 metres to less than 12.0 metres; (C) 1.2 metres if the required minimum lot frontage is 12.0 metres to less than 15.0 metres; (D) 1.5 metres if the required minimum lot frontage is 15.0 metres to less than 18.0 metres; (E) 1.8 metres if the required minimum lot frontage is 18.0 metres to less than 24.0 metres; (F) 2.4 metres if the required minimum lot frontage is 24.0 metres to less than 30.0 metres; and (G) 3.0 metres if the required minimum lot frontage is 30.0 metres or greater." |
| C54 | report · verbatim record | (inherited) ch10_40 | "(A) 0.6 metres... less than 6.0 metres; (B) 0.9 metres... 6.0 to less than 12.0 metres; (C) 1.2 metres... 12.0 to less than 15.0 metres; (D) 1.5 metres, if the required minimum lot frontage... is 15.0 metres or more; (E) 1.8 metres, for a non-residential building." | UNVERIFIED | [ch10_40](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_40.htm) ✗ fragment 3/5 not found in order after fragment 2: "6.0 to less than 12.0 metres; (C) 1.2 metres" | 2026-09-29T14:45:17.446Z | — |
| C55 | report · verbatim record | §10.60.40.20 | "(1) Maximum Building Length. If a lot abuts a major street, the permitted maximum building length is: (A) 19.0 metres for a townhouse; and (B) 25.0 metres for an apartment building." | UNVERIFIED | [ch10_60](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_60.htm) ✗ fragment 1/1 not found: "(1) Maximum Building Length. If a lot abuts a major street, the permit" | 2026-09-29T14:45:17.645Z | — |
| C56 | report · verbatim record | §10.5 | "In the Residential Zone category, if a lot is:" | VERIFIED (exact) | [ch10_5](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm) | 2026-09-29T14:45:17.162Z | — |
| C57 | report · verbatim record | §10.80.40.70 | "if regulation 10.5.40.70(1) does not apply." | VERIFIED (exact+trailing-punct) | [ch10_80](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_80.htm) | 2026-09-29T14:45:17.778Z | — |
| C58 | report · verbatim record | §10.5.50.10 | "75% of the front yard," | UNVERIFIED | [ch10_5](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm) ✗ fragment 1/1 not found: "75% of the front yard," | 2026-09-29T14:45:17.162Z | — |
| C59 | report · verbatim record | (inherited) ch10_5 | "75% of the landscaping portion within the front yard," | UNVERIFIED | [ch10_5](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm) ✗ fragment 1/1 not found: "75% of the landscaping portion within the front yard," | 2026-09-29T14:45:17.162Z | — |
| C60 | report · verbatim record | §10.5.50.10 | "a minimum of 50% of the rear yard for soft landscaping, if the lot frontage is greater than 6.0 metres... a minimum of 25%... if the lot frontage is 6.0 metres or less." | VERIFIED (excerpt) | [ch10_5](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm) | 2026-09-29T14:45:17.162Z | ch10_5: "a minimum of 50% of the rear yard for soft landscaping, if the lot frontage is greater than 6.0 metres; and (B) a minimum of 25% of the rear yard for soft landscaping, if the lot frontage is 6.0 metres or less." |
| C61 | report · verbatim record | §10.5.50.10 | "a minimum of 60 percent of the side yard abutting a street for landscaping... a minimum of 75 percent of the side yard landscaping... must be soft landscaping" | VERIFIED (excerpt) | [ch10_5](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm) | 2026-09-29T14:45:17.162Z | ch10_5: "a minimum of 60 percent of the side yard abutting a street for landscaping; and (B) a minimum of 75 percent of the side yard landscaping required in (A), above, must be soft landscaping" |
| C62 | NF-29 · By-law claim | §800.50 | "(735) Secondary Suite means self-contained living accommodation for an additional person or persons living together as a separate single housekeeping unit, in which both food preparation and sanitary facilities are provided for the exclusive use of the occupants of the suite, located in and subordinate to a dwelling unit." | VERIFIED (exact) | [ch800](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter800.htm) | 2026-09-29T14:45:16.969Z | — |
| C63 | NF-29 · By-law claim | §800.50 | "(181) Detached Houseplex means a building that has multiple dwelling units, and where: (A) the building has no more than four dwelling units; (B) the building is situated entirely on one lot; (C) the building is not attached to a building on an abutting lot; and (D) at least one dwelling unit is entirely or partially above another. (E) Detached houseplex includes the following types of building: a duplex, triplex or fourplex that complies with (A) to (D) above. (F) A detached house, semi-detached house or townhouse that has one or more secondary suites is not a detached houseplex. [ By-law: 648-2025 ]" | VERIFIED (exact) | [ch800](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter800.htm) | 2026-09-29T14:45:16.969Z | — |
| C64 | NF-29 · By-law claim | §800.50 | "(746) Semi-detached Houseplex means a portion of a building that has multiple dwelling units, and where: (A) the portion of the building has no more than four dwelling units; (B) the entire building is situated on two abutting lots; (C) the portion of the building is separated by party walls from any attached portions of the building on the abutting lot; and (D) at least one dwelling unit is entirely or partially above another. (E) Semi-detached houseplex includes the following types of building: a duplex, triplex or fourplex that complies with (A) to (D) above. (F) A detached house, semi-detached house or townhouse that has one or more secondary suites is not a semi-detached houseplex. [ By-law: 648-2025 ]" | VERIFIED (exact) | [ch800](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter800.htm) | 2026-09-29T14:45:16.969Z | — |
| C65 | NF-29 · By-law claim | §10.20.30.40 | "(D) Despite (A) above, if the numerical value on the Lot Coverage Overlay Map is less than 45 percent and the lot contains a detached houseplex or a residential building with a secondary suite, the maximum lot coverage for all buildings and structures on the lot is 45 percent;" | VERIFIED (exact) | [ch10_20](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_20.htm) | 2026-09-29T14:45:17.303Z | — |
| C66 | NF-29 · By-law claim | §10.20.40.40 | "(C) the permitted maximum floor space index in regulation (A) and (B) above does not apply to a detached houseplex, or a residential building with a secondary suite; and [ By-law: 848-2025 ]" | VERIFIED (exact) | [ch10_20](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_20.htm) | 2026-09-29T14:45:17.303Z | — |
| C67 | NF-29 · By-law claim | §10.40.30.40 | "(D) Despite (A) above, if the numerical value on the Lot Coverage Overlay Map is less than 45 percent and the lot contains a detached houseplex, semi-detached houseplex or a residential building with a secondary suite, the maximum lot coverage for all buildings and structures on the lot is 45 percent;" | VERIFIED (exact) | [ch10_40](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_40.htm) | 2026-09-29T14:45:17.446Z | — |
| C68 | NF-29 · By-law claim | §10.40.40.40 | "(C) the permitted maximum floor space index in regulation (A) and (B) above does not apply to a detached houseplex, semi-detached houseplex or a residential building with a secondary suite; and [ By-law: 848-2025 ]" | VERIFIED (exact) | [ch10_40](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_40.htm) | 2026-09-29T14:45:17.446Z | — |
| C69 | NF-29 · By-law claim | §10.60.30.40 | "(D) Despite (A) above, if the numerical value on the Lot Coverage Overlay Map is less than 45 percent and the lot contains detached houseplex, semi-detached houseplex or a residential building with a secondary suite, the maximum lot coverage for all buildings and structures on the lot is 45 percent;" | VERIFIED (exact) | [ch10_60](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_60.htm) | 2026-09-29T14:45:17.645Z | — |
| C70 | NF-29 · By-law claim | §10.60.40.40 | "(C) the permitted maximum floor space index in regulation (A) and (B) above does not apply to a detached houseplex, semi-detached houseplex or a residential building with a secondary suite; and [ By-law: 848-2025 ]" | VERIFIED (exact) | [ch10_60](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_60.htm) | 2026-09-29T14:45:17.645Z | — |
| C71 | NF-29 · By-law claim | §10.80.30.40 | "(D) Despite (A) above, if the numerical value on the Lot Coverage Overlay Map is less than 45 percent and the lot contains a detached houseplex, semi-detached houseplex or a residential building with a secondary suite, the maximum lot coverage for all buildings and structures on the lot is 45 percent; [ By-law: 1062-2025(OLT); 608-2024; 848-2025 ]" | VERIFIED (exact) | [ch10_80](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_80.htm) | 2026-09-29T14:45:17.778Z | — |
| C72 | NF-29 · By-law claim | §10.80.40.40 | "(C) the permitted maximum floor space index in regulation (A) and (B) above does not apply to a detached houseplex, semi-detached houseplex or a residential building with a secondary suite; and [ By-law: 848-2025 ]" | VERIFIED (exact) | [ch10_80](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_80.htm) | 2026-09-29T14:45:17.778Z | — |
| C73 | NF-30 · By-law claim | §10.20.30.40 | "(D) Despite (A) above, if the numerical value on the Lot Coverage Overlay Map is less than 45 percent and the lot contains a detached houseplex or a residential building with a secondary suite, the maximum lot coverage for all buildings and structures on the lot is 45 percent;" | VERIFIED (exact) | [ch10_20](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_20.htm) | 2026-09-29T14:45:17.303Z | — |
| C74 | NF-30 · By-law claim | §800.50 | "(435) Lot Coverage means the portion of the lot that is covered by any part of any building or structure on or above the surface of the lot." | VERIFIED (exact) | [ch800](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter800.htm) | 2026-09-29T14:45:16.969Z | — |
| C75 | NF-31 · By-law claim | §10.20.40.40 | "(C) the permitted maximum floor space index in regulation (A) and (B) above does not apply to a detached houseplex, or a residential building with a secondary suite; and [ By-law: 848-2025 ]" | VERIFIED (exact) | [ch10_20](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_20.htm) | 2026-09-29T14:45:17.303Z | — |
| C76 | NF-31 · By-law claim | §10.20.40.10 | "(C) despite (A) above, the permitted maximum height for a detached houseplex is the greater of ... (ii) 10.0 metres" | VERIFIED (excerpt) | [ch10_20](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_20.htm) | 2026-09-29T14:45:17.303Z | ch10_20: "(C) despite (A) above, the permitted maximum height for a detached houseplex is the greater of: (i) the numerical value, in metres, following the letters "HT" on the Height Overlay Map; or (ii) 10.0 metres" |

## Appendix B — landscaping / driveway provision ledger L1–L28 *(ported verbatim from the plan = Spec 58 §13)*

| ID | Topic | Section | Verbatim text | URL | Verified |
| :--- | :--- | :--- | :--- | :--- | :--- |
| L1 | Landscaping (definition) | §800.50(395) | "(395) Landscaping means an area used for trees, plants, decorative stonework, retaining walls, walkways, or other landscape or architectural elements. Driveways and areas for loading, parking or storing of vehicles are not landscaping." | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter800.htm | substring found in ch800 — PASS (fetched 2026-09-29) |
| L2 | Soft landscaping (definition) | §800.50(780) | "(780) Soft Landscaping means landscaping excluding hard-surfaced areas such as decorative stonework, retaining walls, walkways, or other hard-surfaced landscape-architectural elements." | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter800.htm | substring found in ch800 — PASS (fetched 2026-09-29) |
| L3 | Hard landscaping is not a defined term | Chapter 800 (absence) | *(absence claim)* The phrase "hard landscaping" does not occur in Chapter 800 (Definitions), nor in any other fetched chapter. | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter800.htm | absence: `hard landscaping` in ch800 = 0 (expect 0); `hard landscaping` in ch10_5 = 0 (expect 0); `hard landscaping` in ch10_20 = 0 (expect 0); `hard landscaping` in ch10_40 = 0 (expect 0); `hard landscaping` in ch10_60 = 0 (expect 0); `hard landscaping` in ch10_80 = 0 (expect 0); `hard landscaping` in ch150_7 = 0 (expect 0); `hard landscaping` in ch150_8 = 0 (expect 0); `hard landscaping` in ch200 = 0 (expect 0) — PASS |
| L4 | Front-yard landscaping scope (building types) | §10.5.50.10(1) | "(1) Front Yard Landscaping for Certain Types of Residential Buildings In the Residential Zone category, on a lot with a detached house, semi-detached house, detached houseplex, semi-detached houseplex or townhouse, the following front yard landscaping regulations apply:" | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm | substring found in ch10_5 — PASS (fetched 2026-09-29) |
| L5 | Front landscaping, frontage < 6.0 m | §10.5.50.10(1)(A) | "(A) for lots with a lot frontage less than 6.0 metres, or a townhouse dwelling unit less than 6.0 metres wide, the front yard, excluding a permitted driveway or permitted parking pad must be landscaping; [By-law: 1429-2017]" | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm | substring found in ch10_5 — PASS (fetched 2026-09-29) |
| L6 | Front landscaping, 6.0 to < 15.0 m | §10.5.50.10(1)(B) | "(B) for lots with a lot frontage of 6.0 metres to less than 15.0 metres, or a townhouse dwelling unit at least 6.0 metres wide, a minimum of 50 percent of the front yard must be landscaping;" | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm | substring found in ch10_5 — PASS (fetched 2026-09-29) |
| L7 | Front landscaping, >= 15.0 m | §10.5.50.10(1)(C) | "(C) for lots with a lot frontage of 15.0 metres or greater, a minimum of 60 percent of the front yard must be landscaping; and" | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm | substring found in ch10_5 — PASS (fetched 2026-09-29) |
| L8 | Front soft landscaping 75% (with / without driveway) | §10.5.50.10(1)(D) | "(D) a minimum of 75 percent of the front yard landscaping required in (A), (B), and (C) above, must be soft landscaping, and if a lot does not have a permitted driveway in the front yard, a minimum of 75 percent of the front yard must be soft landscaping. [ By-law: 648-2025 ]" | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm | substring found in ch10_5 — PASS (fetched 2026-09-29) |
| L9 | Corner-lot side yard landscaping | §10.5.50.10(2)(A)(B) | "(2) Side Yard Landscaping for Certain Types of Residential Buildings on Corner Lots In the Residential Zone category, a corner lot with a detached house, semi- detached house, detached houseplex, semi-detached houseplex or townhouse must have: (A) a minimum of 60 percent of the side yard abutting a street for landscaping; and (B) a minimum of 75 percent of the side yard landscaping required in (A), above, must be soft landscaping. [ By-law: 648-2025 ]" | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm | substring found in ch10_5 — PASS (fetched 2026-09-29) |
| L10 | Rear yard soft landscaping | §10.5.50.10(3)(A)(B) | "(3) Rear Yard Soft Landscaping for Residential Buildings Other Than an Apartment Building In the Residential Zone category, a lot with a residential building, other than an apartment building, must have: (A) a minimum of 50% of the rear yard for soft landscaping, if the lot frontage is greater than 6.0 metres; and (B) a minimum of 25% of the rear yard for soft landscaping, if the lot frontage is 6.0 metres or less." | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm | substring found in ch10_5 — PASS (fetched 2026-09-29) |
| L11 | Apartment building landscaping | §10.5.50.10(4) | "(4) Landscaping Requirements for an Apartment Building In the Residential Zone category, a lot with an apartment building must have: (A) a minimum of 50 percent of the area of the lot for landscaping; (B) a minimum of 50 percent of the landscaping area required in (A), above, must be soft landscaping; and (C) despite (A) and (B) above, if an apartment building has 60 dwelling units or less and is located on a lot abutting a major street, a minimum of 30 percent of the area of the lot must be for landscaping, of which 50 percent of the required landscaping area must be comprised of soft landscaping. [ By-law: 1062-2025(OLT); 608-2024 ]" | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm | substring found in ch10_5 — PASS (fetched 2026-09-29) |
| L12 | Apartment soft strip | §10.5.50.10(5) | "(5) Landscaping Requirement for an Apartment Building Abutting Another Residential Lot In the Residential Zone category, a lot with an apartment building must have a minimum 1.5 metre wide strip of soft landscaping along any part of a lot line abutting another lot in the Residential Zone category." | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm | substring found in ch10_5 — PASS (fetched 2026-09-29) |
| L13 | Exclusion: permitted encroachments, utility equipment | §10.5.50.10(6)(A) | "(6) Landscaping Exclusion for Permitted Encroachments and Public Utility Equipment (A) In the Residential Zone category, the calculation of landscaping or soft landscaping in regulations 10.5.50.10(1), (2), (3) and (4) excludes: (i) the area of the required minimum building setback covered by any part of a building or structure which is permitted to encroach into a required minimum building setback by Clause 10.5.40.60; and (ii) the area covered by public utility equipment essential for the functional operation of the building, such as an electrical transformer and associated pads, or other equipment necessary to connect to public utility services. [ By-law: 648-2025 ]" | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm | substring found in ch10_5 — PASS (fetched 2026-09-29) |
| L14 | Pools deemed soft (rear/apartment only) | §10.5.50.10(7) | "(7) Swimming Pools or Similar Ancillary Structures Containing Water Deemed to be Soft Landscaping for Specified Regulations In the Residential Zone category, for the calculation of soft landscaping required by regulation 10.5.50.10(3) and (4), the area of soft landscaping includes the water surface area of outdoor swimming pools or other ancillary structures used to hold water, such as fountains or artificial ponds." | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm | substring found in ch10_5 — PASS (fetched 2026-09-29) |
| L15 | Front-yard driveway width | §10.5.100.1(1)(A)-(D) | "(1) Driveway Width in the Front Yard for Certain Residential Building Types In the Residential Zone category, in addition to meeting the landscaping requirements in regulation 10.5.50.10, for a detached house, semi-detached house, or duplex, and for an individual townhouse dwelling unit if an individual private driveway leads directly to the dwelling unit, a driveway that is in the front yard or passes through the front yard may have the following dimensions in the front yard: (A) a minimum width of 2.0 metres; (B) for lots with a lot frontage less than 6.0 metres, or a townhouse dwelling unit less than 6.0 metres wide, a maximum width of 2.6 metres; (C) for lots with a lot frontage of 6.0 metres to 23.0 metres inclusive, or a townhouse dwelling unit at least 6.0 metres wide, a maximum driveway width the lesser of: (i) 6.0 metres; (ii) the cumulative width of side-by-side parking spaces behind the front main wall, but not in the rear yard; or (iii) the width of a single parking spaces behind the front main wall, but not in the rear yard; or (iv) 2.6 metres if all parking spaces are in the rear yard; and (D) for lots with a lot frontage greater than 23.0 metres, a maximum driveway width the lesser of: (i) 9.0 metres; (ii) the cumulative width of side-by-side parking spaces behind the front main wall if there is at least one parking space behind the front main wall but not in the rear yard; or (iii) 2.6 metres if all parking spaces are in the rear yard." | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm | substring found in ch10_5 — PASS (fetched 2026-09-29) |
| L16 | No parking space in a street yard | §10.5.80.10(3) | "(3) Street Yard Parking Space In the Residential Zone category, a parking space may not be in a front yard or a side yard abutting a street. This regulation does not apply if a parking space in the front yard is permitted by the City of Toronto under the authority of the City of Toronto Act, 2006, or its predecessor." | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm | substring found in ch10_5 — PASS (fetched 2026-09-29) |
| L17 | Two-access driveway needs landscaping compliance | §10.5.100.1(6) | "(6) Driveway with Two Points of Access to the Same Street A lot in the Residential Zone category may have a driveway with two points of vehicle access to the same street, if: (A) the lot has a lot frontage greater than 18.0 metres; and (B) the front yard landscaping complies with Clause 10.5.50.10." | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm | substring found in ch10_5 — PASS (fetched 2026-09-29) |
| L18 | Removed driveway still counts as permitted driveway for (1)(D) | §10.20.80.1(1)(D) (same text §10.40.80.1(1)(D), §10.60.80.1(1)(D), §10.80.80.1(1)(D)) | "(D) the area of the removed driveway in the front yard must be landscaping, but may continue to be considered a permitted driveway for the purposes of calculating required soft landscaping under regulation 10.5.50.10(1)(D);" | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_20.htm<br>https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_40.htm<br>https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_60.htm<br>https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_80.htm | substring found in ch10_20, ch10_40, ch10_60, ch10_80 — PASS (fetched 2026-09-29) |
| L19 | Zone chapters have no own landscaping article | Chapters 10.20/10.40/10.60/10.80 (absence) | *(absence claim)* No 10.20.50 / 10.40.50 / 10.60.50 / 10.80.50 article exists, and every occurrence of "landscap" in each zone chapter lies inside the L18 clause (count on page equals count inside the L18 text). | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_20.htm | absence: `10\.20\.50` in ch10_20 = 0 (expect 0); `10\.40\.50` in ch10_40 = 0 (expect 0); `10\.60\.50` in ch10_60 = 0 (expect 0); `10\.80\.50` in ch10_80 = 0 (expect 0); `landscap` in ch10_20 = 2 (expect 2); `landscap` in ch10_40 = 2 (expect 2); `landscap` in ch10_60 = 2 (expect 2); `landscap` in ch10_80 = 2 (expect 2) — PASS |
| L20 | Garden suite soft landscaping (overrides rear) | §150.7.50.10(1)(A)(B) | "(1) Landscaping Requirements for a Garden Suite Despite regulation 10.5.50.10(3), for a lot with a residential building and an ancillary building containing a garden suite: (A) with a lot frontage of greater than 6.0 metres, a minimum of 50 percent of the area: (i) between all rear main walls of the residential building on the lot and the rear lot line, and (ii) extending parallel to the rear lot line across the full width of the lot from the point where the rear main wall of the residential building meets the residential building's side main walls closest to the respective side lot lines, must be for soft landscaping; (B) with a lot frontage of 6.0 metres or less, a minimum of 25 percent of the area: (i) between all rear main walls of the residential building on the lot and the rear lot line, and (ii) extending parallel to the rear lot line across the full width of the lot from the point where the rear main wall of the residential building meets the residential building's side main walls closest to the respective side lot lines, must be for soft landscaping. [ By-law: 101-2022 ]" | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter150_7.htm | substring found in ch150_7 — PASS (fetched 2026-09-29) |
| L21 | Laneway suite soft landscaping (overrides rear) | §150.8.50.10(1)(A)(B)(C) | "(1) Landscaping Requirements for a Laneway Suite Despite regulation 10.5.50.10 (3), for a lot with a residential building and an ancillary building containing a laneway suite: (A) with a lot frontage of 6.0 metres or less, a minimum of 60 percent of the area between all rear main walls of the residential building and the front main wall of the ancillary building containing a laneway suite must be for soft landscaping; (B) with a lot frontage of greater than 6.0 metres, a minimum of 85 percent of the area between all rear main walls of the residential building and the front main wall of the ancillary building containing a laneway suite must be for soft landscaping, excluding a pedestrian walkway which may have a maximum width of 1.5 metres; and (C) the area between the ancillary building containing a laneway suite and the lot line abutting a lane, excluding a permitted driveway, and a pedestrian walkway which may have a maximum width of 1.5 metres, must be landscaping, of which a minimum of 75 percent must be soft landscaping. [ By-law: 1107-2021 ]" | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter150_8.htm | substring found in ch150_8 — PASS (fetched 2026-09-29) |
| L22 | Ancillary buildings article has no landscaping text | §10.5.60 (absence) | *(absence claim)* The body of Article 10.5.60 (from "10.5.60 Ancillary Buildings and Structures 10.5.60.1 General (1)" up to "10.5.75 Energy Regulations") contains no occurrence of "landscap". | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm | absence: `landscap` in ch10_5 = 0 (expect 0) — PASS |
| L23 | Decks/porches (platforms) as permitted encroachments | §10.5.40.60(1)(A)-(D) | "(1) Platforms Despite regulation 10.5.40.50(2), in the Residential Zone category, a platform without main walls, such as a deck, porch, balcony or similar structure, attached to or less than 0.3 metres from a building, are subject to the following: (A) in a front yard, a platform with a floor no higher than the first storey of the building above established grade: (i) may encroach into the required front yard setback the lesser of 2.5 metres or 50% of the required front yard setback, if it is no closer to a side lot line than the required side yard setback; and (ii) there may be enclosed space below this platform; (B) in a front yard, a platform with a floor higher than the first storey of the building above established grade may encroach into the required front yard setback the lesser of 1.5 metres or 50% of the required front yard setback, if it is no closer to a side lot line than the required side yard setback; (C) in a rear yard, a platform with a floor no higher than the first storey of the building above established grade may encroach into the required rear yard setback the lesser of 2.5 metres or 50% of the required rear yard setback, if it is no closer to a side lot line than the greater of: (i) 0.3 metres; or (ii) a distance equal to the vertical distance between the highest part of the floor of the platform and the average elevation of the ground at the side of the platform; (D) in a rear yard, a platform with a floor higher than the first storey of the building above established grade may encroach into the required rear yard setback the lesser of 1.5 metres or 50% of the required rear yard setback, if it is no closer to a side lot line than the required side yard setback plus the vertical distance between the first floor of the building and the average elevation of the ground along the building's rear main wall;" | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm | substring found in ch10_5 — PASS (fetched 2026-09-29) |
| L24 | At-grade patios are not addressed in Chapter 10.5 | Chapter 10.5 (absence) | *(absence claim)* The word "patio" does not occur in Chapter 10.5; in the zone chapters it occurs only as the commercial "Outdoor Patio" use. | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm | absence: `\bpatios?\b` in ch10_5 = 0 (expect 0); `\bpatios?\b` in ch10_20 = 6 (expect 6); `\bpatios?\b` in ch10_40 = 6 (expect 6); `\bpatios?\b` in ch10_60 = 6 (expect 6); `\bpatios?\b` in ch10_80 = 6 (expect 6) — PASS |
| L25 | Parking space minimum dimensions | §200.5.1.10(2)(A) | "(2) Parking Space Dimensions - Minimum A parking space is subject to the following: (A) A parking space must have the following minimum dimensions: (i) length of 5.6 metres; (ii) width of 2.6 metres; (iii) vertical clearance of 2.0 metres; and (iv) the minimum width in (ii) must be increased by 0.3 metres for each side of the parking space that is obstructed according to (D) below;" | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter200.htm | substring found in ch200 — PASS (fetched 2026-09-29) |
| L26 | Parking space maximum dimensions | §200.5.1.10(3) | "(3) Parking Space Dimensions - Maximum The maximum dimensions for a parking space are: (A) length of 6.0 metres (B) width of 3.2 metres" | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter200.htm | substring found in ch200 — PASS (fetched 2026-09-29) |
| L27 | "Shared driveway" is not a by-law term | All fetched chapters (absence) | *(absence claim)* The phrases "shared driveway" and "mutual driveway" do not occur in any fetched chapter (800, 10.5, 10.20, 10.40, 10.60, 10.80, 150.7, 150.8, 200). | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter800.htm | absence: `shared driveway` in ch800 = 0 (expect 0); `shared driveway` in ch10_5 = 0 (expect 0); `shared driveway` in ch10_20 = 0 (expect 0); `shared driveway` in ch10_40 = 0 (expect 0); `shared driveway` in ch10_60 = 0 (expect 0); `shared driveway` in ch10_80 = 0 (expect 0); `shared driveway` in ch150_7 = 0 (expect 0); `shared driveway` in ch150_8 = 0 (expect 0); `shared driveway` in ch200 = 0 (expect 0); `mutual driveway` in ch800 = 0 (expect 0); `mutual driveway` in ch10_5 = 0 (expect 0); `mutual driveway` in ch10_20 = 0 (expect 0); `mutual driveway` in ch10_40 = 0 (expect 0); `mutual driveway` in ch10_60 = 0 (expect 0); `mutual driveway` in ch10_80 = 0 (expect 0); `mutual driveway` in ch150_7 = 0 (expect 0); `mutual driveway` in ch150_8 = 0 (expect 0); `mutual driveway` in ch200 = 0 (expect 0) — PASS |
| L28 | "Parking pad" is not a defined term | Chapter 800 (absence) | *(absence claim)* "parking pad" does not occur in Chapter 800 (Definitions) or Chapter 200; in Chapter 10.5 it occurs once, inside L5. | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter800.htm | absence: `parking pad` in ch800 = 0 (expect 0); `parking pad` in ch200 = 0 (expect 0); `parking pad` in ch10_5 = 1 (expect 1) — PASS |

**Corrections/additions to existing rows (ported verbatim):**

| Existing row | What the ledger adds | Ledger ids |
| :--- | :--- | :--- |
| NF-12 `bylaw_min_front_landscaping_pct` | The under-6.0 m tier is not a percentage: the whole front yard, minus a permitted driveway or permitted parking pad, must be landscaping. A 15.0 m frontage is in the **60%** tier ("15.0 metres or greater"; the 50% tier is "to less than 15.0"). A townhouse dwelling-unit width replaces lot frontage in (A) and (B), so a townhouse unit at least 6.0 m wide is in the 50% tier. Tier recorded in NF-22. | L5, L6, L7, L4 |
| NF-13 `bylaw_min_rear_soft_landscaping_pct` | Pool, fountain and pond water surface counts as soft landscaping for 10.5.50.10(3). A garden suite or laneway suite replaces this rule ("Despite regulation 10.5.50.10(3)"); see NF-24/NF-25. | L14, L20, L21 |
| NF-14 `bylaw_min_corner_side_landscaping_pct` | Applies only to a corner lot with a detached house, semi-detached house, detached/semi-detached houseplex or townhouse. The front-yard rules have the same building-type scope (L4); apartment buildings follow L11/L12. | L9, L4, L11 |
| *(formula constant)* 75% soft multiplier | Missing the no-driveway branch: "if a lot does not have a permitted driveway in the front yard, a minimum of 75 percent of the front yard must be soft landscaping" (75% of the whole yard, not of the required portion). The same 75% also applies to the laneway-suite lane-side area (L21(C)). Cite precisely as §10.5.50.10(1)(D) and §10.5.50.10(2)(B). A removed driveway still counts as a driveway (L18). | L8, L9, L21, L18 |

**Re-verification against this run's fetch *(generated)*:**

| Ledger | Section | Kind | Re-verified | Pages / counts | URL | fetched_at |
| --- | --- | --- | --- | --- | --- | --- |
| L1 | §800.50(395) | verbatim | PASS | ch800 | [link](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter800.htm) | 2026-09-29T14:45:16.969Z |
| L2 | §800.50(780) | verbatim | PASS | ch800 | [link](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter800.htm) | 2026-09-29T14:45:16.969Z |
| L3 | Chapter 800 (absence) | absence | PASS | hard landscaping@ch800=0/0, hard landscaping@ch10_5=0/0, hard landscaping@ch10_20=0/0, hard landscaping@ch10_40=0/0, hard landscaping@ch10_60=0/0, hard landscaping@ch10_80=0/0, hard landscaping@ch150_7=0/0, hard landscaping@ch150_8=0/0, hard landscaping@ch200=0/0 | [link](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter800.htm) | 2026-09-29T14:45:16.969Z |
| L4 | §10.5.50.10(1) | verbatim | PASS | ch10_5 | [link](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm) | 2026-09-29T14:45:17.162Z |
| L5 | §10.5.50.10(1)(A) | verbatim | PASS | ch10_5 | [link](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm) | 2026-09-29T14:45:17.162Z |
| L6 | §10.5.50.10(1)(B) | verbatim | PASS | ch10_5 | [link](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm) | 2026-09-29T14:45:17.162Z |
| L7 | §10.5.50.10(1)(C) | verbatim | PASS | ch10_5 | [link](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm) | 2026-09-29T14:45:17.162Z |
| L8 | §10.5.50.10(1)(D) | verbatim | PASS | ch10_5 | [link](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm) | 2026-09-29T14:45:17.162Z |
| L9 | §10.5.50.10(2)(A)(B) | verbatim | PASS | ch10_5 | [link](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm) | 2026-09-29T14:45:17.162Z |
| L10 | §10.5.50.10(3)(A)(B) | verbatim | PASS | ch10_5 | [link](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm) | 2026-09-29T14:45:17.162Z |
| L11 | §10.5.50.10(4) | verbatim | PASS | ch10_5 | [link](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm) | 2026-09-29T14:45:17.162Z |
| L12 | §10.5.50.10(5) | verbatim | PASS | ch10_5 | [link](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm) | 2026-09-29T14:45:17.162Z |
| L13 | §10.5.50.10(6)(A) | verbatim | PASS | ch10_5 | [link](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm) | 2026-09-29T14:45:17.162Z |
| L14 | §10.5.50.10(7) | verbatim | PASS | ch10_5 | [link](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm) | 2026-09-29T14:45:17.162Z |
| L15 | §10.5.100.1(1)(A)-(D) | verbatim | PASS | ch10_5 | [link](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm) | 2026-09-29T14:45:17.162Z |
| L16 | §10.5.80.10(3) | verbatim | PASS | ch10_5 | [link](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm) | 2026-09-29T14:45:17.162Z |
| L17 | §10.5.100.1(6) | verbatim | PASS | ch10_5 | [link](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm) | 2026-09-29T14:45:17.162Z |
| L18 | §10.20.80.1(1)(D) (same text §10.40.80.1(1)(D), §10.60.80.1(1)(D), §10.80.80.1(1)(D)) | verbatim | PASS | ch10_20, ch10_40, ch10_60, ch10_80 | [link](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_20.htm) | 2026-09-29T14:45:17.303Z |
| L19 | Chapters 10.20/10.40/10.60/10.80 (absence) | absence | PASS | 10\.20\.50@ch10_20=0/0, 10\.40\.50@ch10_40=0/0, 10\.60\.50@ch10_60=0/0, 10\.80\.50@ch10_80=0/0, landscap@ch10_20=2/2, landscap@ch10_40=2/2, landscap@ch10_60=2/2, landscap@ch10_80=2/2 | [link](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_20.htm) | 2026-09-29T14:45:17.303Z |
| L20 | §150.7.50.10(1)(A)(B) | verbatim | PASS | ch150_7 | [link](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter150_7.htm) | 2026-09-29T14:45:17.918Z |
| L21 | §150.8.50.10(1)(A)(B)(C) | verbatim | PASS | ch150_8 | [link](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter150_8.htm) | 2026-09-29T14:45:18.062Z |
| L22 | §10.5.60 (absence) | absence | PASS | landscap@ch10_5=0/0 | [link](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm) | 2026-09-29T14:45:17.162Z |
| L23 | §10.5.40.60(1)(A)-(D) | verbatim | PASS | ch10_5 | [link](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm) | 2026-09-29T14:45:17.162Z |
| L24 | Chapter 10.5 (absence) | absence | PASS | \bpatios?\b@ch10_5=0/0, \bpatios?\b@ch10_20=6/6, \bpatios?\b@ch10_40=6/6, \bpatios?\b@ch10_60=6/6, \bpatios?\b@ch10_80=6/6 | [link](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm) | 2026-09-29T14:45:17.162Z |
| L25 | §200.5.1.10(2)(A) | verbatim | PASS | ch200 | [link](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter200.htm) | 2026-09-29T14:45:18.194Z |
| L26 | §200.5.1.10(3) | verbatim | PASS | ch200 | [link](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter200.htm) | 2026-09-29T14:45:18.194Z |
| L27 | All fetched chapters (absence) | absence | PASS | shared driveway@ch800=0/0, shared driveway@ch10_5=0/0, shared driveway@ch10_20=0/0, shared driveway@ch10_40=0/0, shared driveway@ch10_60=0/0, shared driveway@ch10_80=0/0, shared driveway@ch150_7=0/0, shared driveway@ch150_8=0/0, shared driveway@ch200=0/0, mutual driveway@ch800=0/0, mutual driveway@ch10_5=0/0, mutual driveway@ch10_20=0/0, mutual driveway@ch10_40=0/0, mutual driveway@ch10_60=0/0, mutual driveway@ch10_80=0/0, mutual driveway@ch150_7=0/0, mutual driveway@ch150_8=0/0, mutual driveway@ch200=0/0 | [link](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter800.htm) | 2026-09-29T14:45:16.969Z |
| L28 | Chapter 800 (absence) | absence | PASS | parking pad@ch800=0/0, parking pad@ch200=0/0, parking pad@ch10_5=1/1 | [link](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter800.htm) | 2026-09-29T14:45:16.969Z |

## Appendix C — grounding extracts G1–G23 and absence checks *(generated)*

| G | Section | Topic | Verbatim page text (extracted between anchors) | URL | fetched_at |
| --- | --- | --- | --- | --- | --- |
| G1 | §10.20.40.70(1)-(3) | RD front / rear / side setbacks | "(1) Minimum Front Yard Setback If regulation 10.5.40.70(1) does not apply, the required minimum front yard setback in the RD zone is 6.0 metres. (2) Minimum Rear Yard Setback The required minimum rear yard setback in the RD zone is the greater of: (A) 7.5 metres; or (B) 25% of the lot depth. (3) Minimum Side Yard Setback The required minimum side yard setback in the RD zone is: (A) 0.6 metres if the required minimum lot frontage is less than 6.0 metres; (B) 0.9 metres if the required minimum lot frontage is 6.0 metres to less than 12.0 metres; (C) 1.2 metres if the required minimum lot frontage is 12.0 metres to less than 15.0 metres; (D) 1.5 metres if the required minimum lot frontage is 15.0 metres to less than 18.0 metres; (E) 1.8 metres if the required minimum lot frontage is 18.0 metres to less than 24.0 metres; (F) 2.4 metres if the required minimum lot frontage is 24.0 metres to less than 30.0 metres; and (G) 3.0 metres if the required minimum lot frontage is 30.0 metres or greater." | [ch10_20](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_20.htm) | 2026-09-29T14:45:17.303Z |
| G2 | §10.20.40.70(6) | RD corner-lot side yard abutting a street | "(6) Minimum Side Yard Abutting a Street for Specified Corner Lots Despite regulation 10.20.40.70(3) and (4), for a corner lot in the RD zone, the required minimum side yard setback from a side lot line abutting a street is 3.0 metres, if: (A) the required minimum lot frontage for the corner lot is 12.0 metres or more; and (B) there is an adjacent lot fronting on the street abutting the side lot line of the corner lot." | [ch10_20](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_20.htm) | 2026-09-29T14:45:17.303Z |
| G3 | §10.20.40.20(1) | RD maximum building length | "(1) Maximum Building Length if Required Lot Frontage is in Specified Range In the RD zone with a required minimum lot frontage of 18.0 metres or less, the permitted maximum building length for a permitted residential building is 17.0 metres. [ By-law: 474-2023 ]" | [ch10_20](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_20.htm) | 2026-09-29T14:45:17.303Z |
| G4 | §10.20.40.30(1) | RD maximum building depth | "(1) Maximum Building Depth if Required Lot Frontage is in Specified Range In the RD zone with a required minimum lot frontage of 18.0 metres or less, the rear main wall of a detached house or detached houseplex, not including a one storey extension that complies with regulation 10.20.40.20(2), may be no more than 19.0 metres from the required front yard setback. [ By-law: 648-2025 ]" | [ch10_20](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_20.htm) | 2026-09-29T14:45:17.303Z |
| G5 | §10.20.30.20(1)(A)(B) | RD required minimum lot frontage = zone-label "f" value | "10.20.30.20 Lot Frontage (1) Minimum Lot Frontage In the RD zone: (A) if a zone label includes the letter "f", as on the Zoning By-law Map, the numerical value following the letter "f" is the required minimum lot frontage, in metres; and (B) if the zone label does not include an "f" value on the Zoning By-law Map, the required minimum lot frontage is 12.0 metres." | [ch10_20](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_20.htm) | 2026-09-29T14:45:17.303Z |
| G6 | §10.20.40.10(1)(A)(B) | RD maximum height | "(1) Maximum Height The permitted maximum height for a building or structure on a lot in the RD zone is: (A) the numerical value, in metres, following the letters "HT" on the Height Overlay Map; or (B) if the lot is in an area with no numerical value following the letters "HT" on the Height Overlay Map, 10.0 metres;" | [ch10_20](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_20.htm) | 2026-09-29T14:45:17.303Z |
| G7 | §10.20.30.40(1)(A)(B) | RD lot coverage (overlay-mapped or none) | "10.20.30.40 Lot Coverage (1) Maximum Lot Coverage (A) if a lot in is in an area with a numerical value on the Lot Coverage Overlay Map, that numerical value is the permitted maximum lot coverage, as a percentage of the lot area; (B) if a lot is not in an area with a numerical value on the Lot Coverage Overlay Map, no lot coverage applies; [ By-law: 848-2025 ]" | [ch10_20](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_20.htm) | 2026-09-29T14:45:17.303Z |
| G8 | §10.20.40.40(1)(A)(B) | RD floor space index | "10.20.40.40 Floor Area (1) Floor Space Index In the RD zone, the permitted maximum floor space index is: (A) the numerical value following the letter "d" in the zone label on the Zoning By-law Map; or (B) if the zone label on the Zoning By-law Map does not include a "d" value on the Zoning By-law Map, the floor space index is not limited by this regulation; [ By-law: 1062-2025(OLT); 608-2024 ]" | [ch10_20](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_20.htm) | 2026-09-29T14:45:17.303Z |
| G9 | §10.40.40.70(1)-(4) | RS setbacks (incl. major-street clause (4)) | "10.40.40.70 Setbacks (1) Minimum Front Yard Setback If regulation 10.5.40.70(1) does not apply, the required minimum front yard setback in the RS zone is 6.0 metres. (2) Minimum Rear Yard Setback The required minimum rear yard setback in the RS zone is the greater of: (A) 7.5 metres; or (B) 25% of the lot depth. (3) Minimum Side Yard Setback The required minimum side yard setback in the RS zone is: (A) 0.6 metres, if the required minimum lot frontage for a permitted residential building is less than 6.0 metres; (B) 0.9 metres, if the required minimum lot frontage for a permitted residential building is 6.0 metres to less than 12.0 metres; (C) 1.2 metres, if the required minimum lot frontage for a permitted residential building is 12.0 metres to less than 15.0 metres; (D) 1.5 metres, if the required minimum lot frontage for a permitted residential building is 15.0 metres or more; and (E) 1.8 metres, for a non-residential building. [ By-law: 474-2023 ] (4) Minimum Setback Requirements for Residential Buildings on Major Streets Despite (1) to (3) above, a townhouse or apartment building located on a lot abutting a major street must have the following minimum building setbacks: (A) a front yard setback of: (i) for a lot depth equal to or less than 36.0 metres: (a) if regulation 10.5.40.70(1) applies, the lesser of the front yard setback required by 10.5.40.70(1) or 6.0 metres; (b) if regulation 10.5.40.70(1) does not apply: 3.0 metres; (c) despite (a) and (b) above, if on a through lot: 6.0 metres; (ii) despite (i) above, for a lot depth greater than 36.0 metres: 6.0 metres. (B) a rear yard setback of 7.5 metres; (C) for a townhouse, a side yard setback of: (i) 0.9 metres, if all dwelling units front directly onto a street; (ii) 7.5 metres, if all dwelling units do not front directly onto a street; (D) for an apartment building, a side yard setback of: (i) 2.4 metres for all portions of the main wall that do not have primary windows; (ii) 5.5 metres for portions of the main wall that have primary windows; (iii) Despite (i) and (ii) above, 7.5 metres for all portions of the main wall exceeding a building length of 25.0 metres; and (iv) despite (i) to (iii) above, on a corner lot the required minimum side yard setback from a side lot line abutting a street is 3.0 metres; [ By-law: 1062-2025(OLT); 608-2024 ]" | [ch10_40](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_40.htm) | 2026-09-29T14:45:17.446Z |
| G10 | §10.40.40.20(1) | RS maximum building length | "(1) Maximum Building Length In the RS zone, the permitted maximum building length for a permitted residential building is 17.0 metres. [ By-law: 474-2023 ]" | [ch10_40](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_40.htm) | 2026-09-29T14:45:17.446Z |
| G11 | §10.40.40.30(1) | RS maximum building depth | "(1) Maximum Building Depth if Required Lot Frontage is in Specified Range In the RS zone, the rear main wall of a detached house, semi-detached house, detached houseplex or semi-detached houseplex, not including a one storey extension that complies with regulation 10.20.40.20(2), may be no more than 19.0 metres from the required front yard setback. [ By-law: 648-2025 ]" | [ch10_40](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_40.htm) | 2026-09-29T14:45:17.446Z |
| G12 | §10.60.40.70(1)-(4) | RT setbacks (incl. major-street clause (4)) | "10.60.40.70 Setbacks (1) Minimum Front Yard Setback If regulation 10.5.40.70(1) does not apply, the required minimum front yard setback in the RT zone is 6.0 metres. (2) Minimum Rear Yard Setback The required minimum rear yard setback in the RT zone is 7.5 metres. (3) Minimum Side Yard Setback In the RT zone: (A) the required minimum side yard setback is 7.5 metres; and (B) despite (A) above, the required minimum side yard setback is 0.9 metres for: (i) a detached house; (ii) a semi-detached house; (iii) a detached houseplex; [ By-law: 648-2025 ] (iv) a semi-detached houseplex; and [ By-law: 648-2025 ] (v) (Deleted by By-law 648-2025) [ By-law: 648-2025 ] (vi) a townhouse, if all the dwelling units front directly on a street. [ By-law: 474-2023 ] (4) Minimum Setback Requirements for Residential Buildings on Major Streets Despite (1) to (3) above, a townhouse or apartment building located on a lot abutting a major street must have the following minimum building setbacks: (A) a front yard setback of: (i) for a lot depth equal to or less than 36.0 metres: (a) If regulation 10.5.40.70(1) applies, the lesser of the front yard setback required by 10.5.40.70(1) or 6.0 metres; (b) if regulation 10.5.40.70(1) does not apply: 3.0 metres; and (c) despite (a) and (b) above, if on a through lot: 6.0 metres; (ii) despite (i) above, for a lot depth greater than 36.0 metres: 6.0 metres. (B) a rear yard setback of 7.5 metres; (C) for a townhouse, a side yard setback of: (i) 0.9 metres, if all dwelling units front directly onto a street; (ii) 7.5 metres, if all dwelling units do not front directly onto a street; (D) for an apartment building, a side yard setback of: (i) 2.4 metres for all portions of the main wall that do not have primary windows; (ii) 5.5 metres for portions of the main wall that have primary windows; (iii) Despite (i) and (ii) above, 7.5 metres for all portions of the main wall exceeding a building length of 25.0 metres; and (iv) Despite (i) to (iii) above, on a corner lot the required minimum side yard setback from a side lot line abutting a street is 3.0 metres. [ By-law: 1062-2025(OLT); 608-2024 ]" | [ch10_60](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_60.htm) | 2026-09-29T14:45:17.645Z |
| G13 | §10.60.40.20(1) | RT maximum building length (major street only) | "10.60.40.20 Building Length (1) Maximum Building Length If a lot abuts a major street, the permitted maximum building length is: (A) 19.0 metres for a townhouse; and (B) 25.0 metres for an apartment building. [ By-law: 1062-2025(OLT); 608-2024 ]" | [ch10_60](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_60.htm) | 2026-09-29T14:45:17.645Z |
| G14 | §10.60.40.10(1) | RT maximum height | "(1) Maximum Height The permitted maximum height for a building or structure on a lot in the RT zone is: (A) the numerical value, in metres, following the letters "HT" on the Height Overlay Map; or (B) if the lot is in an area with no numerical value following the letters "HT" on the Height Overlay Map, 10.0 metres; (C) despite (A) above, the permitted maximum height for a detached houseplex or semi-detached houseplex is the greater of: (i) the numerical value, in metres, following the letters "HT" on the Height Overlay Map; or (ii) 10.0 metres; and [ By-law: 648-2025 ] (D) despite (A) and (B) above, the permitted maximum height for the following residential buildings located on a lot abutting a major street is: (i) for a townhouse, the greater of 13.0 metres or the numerical value following the letters "HT" on the Height Overlay Map; and (ii) for an apartment building, the greater of 19.0 metres or the numerical value following the letters "HT" on the Height Overlay Map. [ By-law: 1062-2025(OLT); 608-2024 ] (2) Maximum Number of Storeys The permitted maximum number of storeys in a building on a lot in the RT zone is: (A) the numerical value following the letters "ST" on the Height Overlay Map; (B) if the lot is in an area with no numerical value following the letters "ST" on the Height Overlay Map, the number of storeys is not limited by this regulation; (C) the permitted maximum number of storeys in a building on a lot in regulation (A) does not apply to a detached houseplex or semi-detached houseplex; and [ By-law: 648-2025 ] (D) despite (A) to (C) above, the permitted maximum number of storeys for the following residential buildings, excluding a mechanical penthouse, located on a lot abutting a major street is: (i) for a townhouse, the greater of four storeys or the numerical value following the letters "ST" on the Height Overlay Map; and (ii) for an apartment building, the greater of six storeys or the numerical value following the letters "ST" on the Height Overlay Map. [ By-law: 1062-2025(OLT); 608-2024 ]" | [ch10_60](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_60.htm) | 2026-09-29T14:45:17.645Z |
| G15 | §10.80.40.70(1)-(4) | RM setbacks (incl. major-street clause (4)) | "10.80.40.70 Setbacks (1) Minimum Front Yard Setback If regulation 10.5.40.70(1) does not apply, the required minimum front yard setback in the RM zone is 6.0 metres. (2) Minimum Rear Yard Setback The required minimum rear yard setback in the RM zone is the greater of: (A) 7.5 metres; or (B) 25% of the lot depth. (3) Minimum Side Yard Setback The required minimum side yard setback in the RM zone is: (A) 1.2 metres for a detached house or detached houseplex; [ By-law: 648-2025 ] (B) 1.5 metres for a semi-detached house or semi-detached houseplex; and [ By-law: 648-2025 ] (C) 2.4 metres for an apartment building, or a non-residential building. [ By-law: 474-2023 ] (4) Minimum Setback Requirements for Residential Buildings on Major Streets Despite regulations 10.80.40.70(1) to (3) above, a townhouse or apartment building located on a lot abutting a major street must have the following minimum building setbacks: (A) a front yard setback of: (i) for a lot depth equal to or less than 36.0 metres: (a) if regulation 10.5.40.70(1) applies, the lesser of the front yard setback required by 10.5.40.70(1) or 6.0 metres; (b) if regulation 10.5.40.70(1) does not apply: 3.0 metres; and (c) despite (a) and (b) above, if on a through lot: 6.0 metres; (ii) despite (i) above, for a lot depth greater than 36.0 metres: 6.0 metres. (B) a rear yard setback of 7.5 metres; (C) for a townhouse, a side yard setback of: (i) 0.9 metres, if all dwelling units front directly onto a street; (ii) 7.5 metres, if all dwelling units do not front directly onto a street; (D) for an apartment building, a side yard setback of: (i) 2.4 metres; (ii) Despite (i) above, 5.5 metres for portions of the main wall that have primary windows; (iii) Despite (i) and (ii) above, 7.5 metres for all portions of the main wall exceeding a building length of 25.0 metres; and (iv) despite (i) to (iii) above, on a corner lot the required minimum side yard setback from a side lot line abutting a street is 3.0 metres. [ By-law: 1062-2025(OLT); 608-2024 ]" | [ch10_80](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_80.htm) | 2026-09-29T14:45:17.778Z |
| G16 | §10.80.40.20(1)-(3) | RM maximum building length | "(1) Maximum Building Length In the RM zone, the permitted maximum building length for a detached house or a semi-detached house is 17.0 metres. (2) One Storey Extension to Building Length if Required Lot Frontage is More than 12.0 Metres In the RM zone, despite regulation 10.80.40.20(1), on a lot with a required minimum lot frontage of more than 12.0 metres for a detached house or for an entire semi-detached house, a detached house or semi-detached house may extend beyond the permitted maximum building length by a maximum of 2.0 metres, if the extended part: (A) has a maximum height of 5.0 metres and one storey; (B) is no wider than 50% of the width of the dwelling unit at its widest point; and (C) is at least 3.0 metres from each side lot line, not including a side lot line extending between the two dwelling units of the semi-detached house. (3) Maximum Building Length for a Townhouse or Apartment Building on a Major Street In the RM zone, if a lot abuts a major street, the permitted maximum building length is: (A) 19.0 metres for a townhouse; and (B) 25.0 metres for an apartment building; [ By-law: 1062-2025(OLT); 608-2024 ]" | [ch10_80](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_80.htm) | 2026-09-29T14:45:17.778Z |
| G17 | §10.80.40.30(1) | RM maximum building depth | "(1) Maximum Building Depth In the RM zone, the rear main wall of a detached house or semi-detached house, not including a one storey extension that complies with regulation 10.80.40.20(2), may be no more than 19.0 metres from the required minimum front yard setback." | [ch10_80](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_80.htm) | 2026-09-29T14:45:17.778Z |
| G18 | §10.80.40.10(1)(A)(B) | RM maximum height | "(1) Maximum Height The permitted maximum height for a building or structure on a lot in the RM zone is: (A) the numerical value, in metres, following the letters "HT" on the Height Overlay Map; or (B) if the lot is in an area with no numerical value following the letters "HT" on the Height Overlay Map: (i) 10.0 metres, for a detached house or semi-detached house; and (ii) 12.0 metres, for any other building or structure." | [ch10_80](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_80.htm) | 2026-09-29T14:45:17.778Z |
| G19 | §10.5.40.70(1) | Front yard setback averaging | "10.5.40.70 Setbacks (1) Front Yard Setback - Averaging In the Residential Zone category, if a lot is: (A) beside one lot in the Residential Zone category, and that abutting lot has a building fronting on the same street and that building is, in whole or in part, 15.0 metres or less from the subject lot, the required minimum front yard setback is the front yard setback of that building on the abutting lot; and (B) between two abutting lots in the Residential Zone category, each with a building fronting on the same street and those buildings are both, in whole or in part, 15.0 metres or less from the subject lot, the required minimum front yard setback is the average of the front yard setbacks of those buildings on the abutting lots." | [ch10_5](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm) | 2026-09-29T14:45:17.162Z |
| G20 | §800.50(100)/(105) | Building Depth / Building Length definitions | "(100) Building Depth means the horizontal distance between the front yard setback required on a lot and the portion of the building's rear main wall furthest from the required front yard setback, measured along a line that is perpendicular to the front yard setback line. (105) Building Length means the horizontal distance between the portion of the front main wall of a building on a lot closest to the front lot line, and the portion of the rear main wall of the building closest to the rear lot line, measured along the lot centreline. If the main walls are not intersected by the lot centreline, the measurement is from the point on the lot centreline where a line drawn perpendicular to the lot centreline connects with the main wall." | [ch800](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter800.htm) | 2026-09-29T14:45:16.969Z |
| G21 | §800.50(440)/(445) | Lot Depth / Lot Frontage definitions | "(440) Lot Depth means the horizontal distance between the front lot line and rear lot line of a lot, measured along the lot centreline. [ By-law: 1124-2018 ] (445) Lot Frontage means the horizontal distance between the side lot lines of a lot, or the projection of the side lot lines, measured along a straight line drawn perpendicular to the lot centreline at the required minimum front yard setback." | [ch800](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter800.htm) | 2026-09-29T14:45:16.969Z |
| G22 | §800.50(457) | Major Street definition | "(457) Major Street means any street identified as "Major Streets" on the Policy Areas Overlay Map found in Section 995.10. For the purpose of this definition, the phrase "major street on the Policy Area Overlay Map" has the same meaning as major street." | [ch800](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter800.htm) | 2026-09-29T14:45:16.969Z |
| G23 | §995.10.1(1) | Policy Area Overlay Maps (where Major Streets are mapped) | "995.10.1 General (1) Policy Area Overlay Maps The Policy Area Overlay Maps of this By-law are located in a separately bound Policy Area Overlay Map booklets with the individual map sheets identified on the index map located at the front of the map book." | [ch995](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter995.htm) | 2026-09-29T14:45:18.325Z |

| A | Claim | Result | Counts |
| --- | --- | --- | --- |
| A1 | No general corner-lot 3.0 m side-yard clause for RS/RT/RM analogous to RD §10.20.40.70(6) | PASS | "corner lot in the RD zone"@ch10_20=1 (expect 1); "corner lot in the RS zone"@ch10_40=0 (expect 0); "corner lot in the RT zone"@ch10_60=0 (expect 0); "corner lot in the RM zone"@ch10_80=0 (expect 0) |

## Appendix D — vector self-check

See §10 (generated table). V16 is skipped because the plan marks its expected value TBD.

## Appendix E — houseplex / secondary suite / lot coverage / yard provisions H1–H18 *(generated)*

Copied from the fetched pages between two search anchors (`spec67-gen/suite-anchors.js`; each start occurs exactly once on its page), as for Appendix C. Rows NF-29..NF-31 of the plan (= Spec 58 §13 = the report) quote H1–H3 and H7–H14 byte-for-byte (generator-checked); H4–H6 and H15–H18 are cited by id.

| H | Section | Topic | Verbatim page text (extracted between anchors) | URL | fetched_at |
| --- | --- | --- | --- | --- | --- |
| H1 | §800.50(181) | Detached Houseplex (definition) | "(181) Detached Houseplex means a building that has multiple dwelling units, and where: (A) the building has no more than four dwelling units; (B) the building is situated entirely on one lot; (C) the building is not attached to a building on an abutting lot; and (D) at least one dwelling unit is entirely or partially above another. (E) Detached houseplex includes the following types of building: a duplex, triplex or fourplex that complies with (A) to (D) above. (F) A detached house, semi-detached house or townhouse that has one or more secondary suites is not a detached houseplex. [ By-law: 648-2025 ]" | [ch800](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter800.htm) | 2026-09-29T14:45:16.969Z |
| H2 | §800.50(746) | Semi-detached Houseplex (definition) | "(746) Semi-detached Houseplex means a portion of a building that has multiple dwelling units, and where: (A) the portion of the building has no more than four dwelling units; (B) the entire building is situated on two abutting lots; (C) the portion of the building is separated by party walls from any attached portions of the building on the abutting lot; and (D) at least one dwelling unit is entirely or partially above another. (E) Semi-detached houseplex includes the following types of building: a duplex, triplex or fourplex that complies with (A) to (D) above. (F) A detached house, semi-detached house or townhouse that has one or more secondary suites is not a semi-detached houseplex. [ By-law: 648-2025 ]" | [ch800](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter800.htm) | 2026-09-29T14:45:16.969Z |
| H3 | §800.50(735) | Secondary Suite (definition) | "(735) Secondary Suite means self-contained living accommodation for an additional person or persons living together as a separate single housekeeping unit, in which both food preparation and sanitary facilities are provided for the exclusive use of the occupants of the suite, located in and subordinate to a dwelling unit." | [ch800](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter800.htm) | 2026-09-29T14:45:16.969Z |
| H4 | §800.50(435) | Lot Coverage (definition) | "(435) Lot Coverage means the portion of the lot that is covered by any part of any building or structure on or above the surface of the lot." | [ch800](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter800.htm) | 2026-09-29T14:45:16.969Z |
| H5 | §800.50(285) | Front Yard (definition) | "(285) Front Yard means the area on a lot, (A) between the front lot line and all front main walls of the building, and (B) extending parallel to the front lot line across the full width of the lot from the point where the front main wall of the building meets the building's side main walls closest to the respective side lot lines." | [ch800](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter800.htm) | 2026-09-29T14:45:16.969Z |
| H6 | §800.50(650) | Rear Yard (definition) | "(650) Rear Yard means the area on a lot, (A) between the rear lot line and all rear main walls of the building, and (B) extending parallel to the rear lot line across the full width of the lot from the point where the rear main wall of the building meets the building's side main walls closest to the respective side lot lines." | [ch800](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter800.htm) | 2026-09-29T14:45:16.969Z |
| H7 | §10.20.30.40(1)(D) | RD lot coverage 45 % — houseplex / secondary suite | "(D) Despite (A) above, if the numerical value on the Lot Coverage Overlay Map is less than 45 percent and the lot contains a detached houseplex or a residential building with a secondary suite, the maximum lot coverage for all buildings and structures on the lot is 45 percent;" | [ch10_20](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_20.htm) | 2026-09-29T14:45:17.303Z |
| H8 | §10.20.40.40(1)(C) | RD FSI not applied — houseplex / secondary suite | "(C) the permitted maximum floor space index in regulation (A) and (B) above does not apply to a detached houseplex, or a residential building with a secondary suite; and [ By-law: 848-2025 ]" | [ch10_20](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_20.htm) | 2026-09-29T14:45:17.303Z |
| H9 | §10.40.30.40(1)(D) | RS lot coverage 45 % — houseplex / secondary suite | "(D) Despite (A) above, if the numerical value on the Lot Coverage Overlay Map is less than 45 percent and the lot contains a detached houseplex, semi-detached houseplex or a residential building with a secondary suite, the maximum lot coverage for all buildings and structures on the lot is 45 percent;" | [ch10_40](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_40.htm) | 2026-09-29T14:45:17.446Z |
| H10 | §10.40.40.40(1)(C) | RS FSI not applied — houseplex / secondary suite | "(C) the permitted maximum floor space index in regulation (A) and (B) above does not apply to a detached houseplex, semi-detached houseplex or a residential building with a secondary suite; and [ By-law: 848-2025 ]" | [ch10_40](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_40.htm) | 2026-09-29T14:45:17.446Z |
| H11 | §10.60.30.40(1)(D) | RT lot coverage 45 % — houseplex / secondary suite | "(D) Despite (A) above, if the numerical value on the Lot Coverage Overlay Map is less than 45 percent and the lot contains detached houseplex, semi-detached houseplex or a residential building with a secondary suite, the maximum lot coverage for all buildings and structures on the lot is 45 percent;" | [ch10_60](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_60.htm) | 2026-09-29T14:45:17.645Z |
| H12 | §10.60.40.40(1)(C) | RT FSI not applied — houseplex / secondary suite | "(C) the permitted maximum floor space index in regulation (A) and (B) above does not apply to a detached houseplex, semi-detached houseplex or a residential building with a secondary suite; and [ By-law: 848-2025 ]" | [ch10_60](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_60.htm) | 2026-09-29T14:45:17.645Z |
| H13 | §10.80.30.40(1)(D) | RM lot coverage 45 % — houseplex / secondary suite | "(D) Despite (A) above, if the numerical value on the Lot Coverage Overlay Map is less than 45 percent and the lot contains a detached houseplex, semi-detached houseplex or a residential building with a secondary suite, the maximum lot coverage for all buildings and structures on the lot is 45 percent; [ By-law: 1062-2025(OLT); 608-2024; 848-2025 ]" | [ch10_80](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_80.htm) | 2026-09-29T14:45:17.778Z |
| H14 | §10.80.40.40(1)(C) | RM FSI not applied — houseplex / secondary suite | "(C) the permitted maximum floor space index in regulation (A) and (B) above does not apply to a detached houseplex, semi-detached houseplex or a residential building with a secondary suite; and [ By-law: 848-2025 ]" | [ch10_80](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_80.htm) | 2026-09-29T14:45:17.778Z |
| H15 | §10.20.40.10(1)(C) | RD height — detached houseplex | "(C) despite (A) above, the permitted maximum height for a detached houseplex is the greater of: (i) the numerical value, in metres, following the letters "HT" on the Height Overlay Map; or (ii) 10.0 metres; and [ By-law: 648-2025 ]" | [ch10_20](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_20.htm) | 2026-09-29T14:45:17.303Z |
| H16 | §10.20.40.10(3)(C) | RD storeys — detached houseplex | "(C) the permitted maximum number of storeys in a building on a lot in regulation (A) does not apply to a detached houseplex. [ By-law: 648-2025 ]" | [ch10_20](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_20.htm) | 2026-09-29T14:45:17.303Z |
| H17 | §10.20.40.20(3) | RD building length 19.0 m — detached houseplex on a deep lot | "(3) Maximum Building Length for a Detached Houseplex if Lot Frontage and Lot Depth is in Specified Range Despite regulation 10.20.40.20(1), in the RD zone, a detached houseplex may have a permitted maximum building length of 19.0 metres if the lot: (A) has a lot depth of 36.0 metres or greater and a lot frontage of less than 10.0 metres; or (B) has a lot depth of 40.0 metres or greater and a lot frontage of 10.0 metres or greater. [ By-law: 648-2025 ]" | [ch10_20](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_20.htm) | 2026-09-29T14:45:17.303Z |
| H18 | §10.20.40.30(2) | RD building depth — detached houseplex on a deep lot | "(2) Maximum Building Depth for a Detached Houseplex if Lot Frontage and Lot Depth is in Specified Range Despite regulation 10.20.40.20(1), in the RD zone, a detached houseplex may have a permitted maximum building depth of 19.0 metres if the lot: (A) has a lot depth of 36.0 metres or greater and a lot frontage of less than 10.0 metres; or (B) has a lot depth of 40.0 metres or greater and a lot frontage of 10.0 metres or greater. [ By-law: 648-2025 ]" | [ch10_20](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_20.htm) | 2026-09-29T14:45:17.303Z |
| H19 | §10.40.20.20(1) | RS permitted residential building types | "In the RS Zone, a dwelling unit is permitted in the following residential building types: (A) Detached House; (B) Semi-detached House; (C) Detached Houseplex; [ By-law: 648-2025 ] (D) Semi-Detached Houseplex; and [ By-law: 648-2025 ] (E) (Deleted by By-law 648-2025) [ By-law: 648-2025 ] (F) Townhouse if the lot abuts a major street; and (G) Apartment Building if the lot abuts a major street." | [ch10_40](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_40.htm) | 2026-09-29T14:45:17.446Z |
| H20 | §10.60.20.20(1) | RT permitted residential building types | "In the RT Zone, a dwelling unit is permitted in the following residential building types: (A) Detached House; (B) Semi-detached House; (C) Townhouse; (D) Detached Houseplex; [ By-law: 648-2025 ] (E) Semi-Detached Houseplex; and [ By-law: 648-2025 ] (F) (Deleted by By-law 648-2025) [ By-law: 648-2025 ] (G) Apartment Building, if the lot abuts a major street." | [ch10_60](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_60.htm) | 2026-09-29T14:45:17.645Z |
| H21 | §800.50(745) | Semi-Detached House (definition) | "(745) Semi-Detached House means a building that has two dwelling units, and no dwelling unit is entirely or partially above another." | [ch800](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter800.htm) | 2026-09-29T14:45:16.969Z |
| H22 | §800.50(865) | Townhouse (definition) | "(865) Townhouse means a building that has three or more dwelling units, and no dwelling unit is entirely or partially above another. A detached house or semi-detached house that has one or more secondary suites is not a townhouse. A detached houseplex or two semi-detached houseplexes is not a townhouse. [ By-law: 648-2025 ]" | [ch800](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter800.htm) | 2026-09-29T14:45:16.969Z |
| H23 | §10.40.40.40(1)(A)(B) | RS floor space index = zone-label "d" value | "Floor Space Index In the RS zone, the permitted maximum floor space index is: (A) the numerical value following the letter "d" in the zone label on the Zoning By-law Map; or (B) if the zone label on the Zoning By-law Map does not include a "d" value on the Zoning By-law Map, the floor space index is not limited by this regulation; [ By-law: 1062-2025(OLT); 608-2024 ]" | [ch10_40](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_40.htm) | 2026-09-29T14:45:17.446Z |
| H24 | §10.60.40.40(1)(A)(B) | RT floor space index = zone-label "d" value | "Floor Space Index In the RT zone, the permitted maximum floor space index is: (A) the numerical value following the letter "d" in the zone label on the Zoning By-law Map; or (B) if the zone label on the Zoning By-law Map does not include a "d" value on the Zoning By-law Map, the floor space index is not limited by this regulation;" | [ch10_60](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_60.htm) | 2026-09-29T14:45:17.645Z |
| H25 | §10.80.40.40(1)(A)(B) | RM floor space index = zone-label "d" value | "Floor Space Index In the RM zone, the permitted maximum floor space index is: (A) the numerical value following the letter "d" in the zone label on the Zoning By-law Map; or (B) if the zone label on the Zoning By-law Map does not include a "d" value on the Zoning By-law Map, the floor space index is not limited by this regulation; [ By-law: 1062-2025(OLT); 608-2024 ]" | [ch10_80](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_80.htm) | 2026-09-29T14:45:17.778Z |
| H26 | §40.5.1.10(3)(B)-(4) | CR Development Standard Set symbol (SS) — what it selects | "(B) the Development Standard Set symbol (SS) and number indicates the set of development standards in regulation 40.5.1.10(4), that applies to a lot. (4) Interpretation of the Development Standard Set Symbol The Development Standard Set symbol (SS) in the zone label on the Zoning By-law Map identifies the Development Standard Set with a numerical value that corresponds to a specific set of development standards that may control one or all of the following requirements: (A) Required Minimum Building Setback from a Front Lot Line; (B) Permitted Maximum Building Setback from a Front Lot Line; (C) Required Minimum Building Setback from a Rear Lot Line; (D) Required Minimum Building Setback from a Side Lot Line; (E) Required Building Angular Plane from a Front Lot Line or Side Lot Line abutting a street; (F) Required Building Angular Plane from a Rear Lot Line; (G) Required Minimum Landscaping Area on a Lot; and (H) Permitted Maximum Building Height." | [ch40_5](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter40_5.htm) | 2026-09-29T16:43:59.816Z |
| H27 | §40.10.1.10(2) | CR zone: five Development Standard Sets | "(2) CR Zone Development Standard Sets In the CR zone there are five Development Standard Sets: SS1, SS2, SS3, SS4 and SS5, which form part of the zone label. [ By-law: 1260-2024 ]" | [ch40_10](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter40_10.htm) | 2026-09-29T16:43:59.574Z |
| H28 | Zoning_readme.txt (City open data, Zoning By-law dataset) | CKAN field STAND_SET (data dictionary) | "STAND_SET = (Set of standards referred to in the Commercial-Residential mixed use zone, based on three different design typologies. The "standard set" number is prefaced by the letters "SS" in the zone label.)" | [chreadme](https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/34927e44-fc11-4336-a8aa-a0dfb27658b7/resource/aa11a6f1-17fd-49b7-bbe4-f381bbc36f94/download/zoning_readme.txt) | 2026-09-29T16:44:35.857Z |
