# Enriched Parcels — Complete Field Specification

**Date:** 2026-06-26
**Status:** Field definition (pre-WF1). **No code/spec/migration changes.** Get the fields right here, then build the plan.
**Supersedes/consolidates the field lists in:** `wf1-max-build-storey-height-accuracy-investigation.md`, `wf1-reno-build-pattern-investigation.md`, `massing-footprint-reliability-investigation.md`, `optimal-lot-configuration-implementation-plan.md` (§12–§13).

This is the **authoritative, exhaustive** list of every proposed enriched-parcel field — new, degraded, and deleted — for the Optimal Lot Configuration + Max-Build + Reno-Intelligence model. Not a summary: every field is listed.

---

## 0. Design decisions encoded (from review)

1. **Permit data is authoritative for GFA/FSI.** `permits.RESIDENTIAL` (m²) = GFA; `FSI = GFA ÷ lot`. Drives the resolved footprint/GFA and the storey count.
2. **Permit FSI/GFA determines storeys.** Max-build storeys are derived from realized permit FSI ÷ coverage (and description storey-norms), not bylaw-height ÷ 3.
3. **Massing is kept for *positioning only*** — setbacks, rear-yard depth, open-pocket — never for size (size = fallback, flagged).
4. **Kitchen & bathroom reno size → based on realized reno-permit % (§J), applied to the current home (§G)** — *revised:* not max-build, not the unreliable existing footprint. **Solar option → sized from footprint** (not the Google Solar API, which we are not using).
5. **Current footprint & storeys → DEGRADED to a RANGE** (basement / 1-storey / 2-storey). Assume the home is **smaller than max-build** (a reno candidate — if it were already maxed, why renovate?); the range is **capped at max-build** (legal-non-conforming exceptions flagged, not assumed). **CONFIRMED.** Supporting evidence: addition permits add a median **38% of the max-build envelope**, implying reno-candidate homes sit ≥38% below max-build — so the range should default *well* below the cap, not near it.
6. **New, better-informed CoA max-build** — uses realized neighbourhood variance FSI/coverage (the 28% who exceed as-of-right), not bylaw+margin.
7. **Storeys come from permit-neighbourhood data** (realized FSI + storey-norms), not bylaw-height ÷ 3. **CONFIRMED.**

**Source hierarchy (governs `resolved_*`):** permit FSI/coverage → max-build ceiling → imagery (flagged fallback). Reliability legend: 🟢 high · 🟡 medium · 🟠 low/fallback.

---

## A. Lot & zoning foundation — KEEP as-is

| Field | Type | Source | Reliability |
|---|---|---|---|
| `lot_size_sqm`, `frontage_m`, `depth_m` | numeric | parcels/centreline | 🟢 |
| `lot_size_confidence`, `lot_size_basis` | text | derived | 🟢 |
| `zoning_class` | text | zoning | 🟢 |
| `bylaw_max_coverage_pct`, `bylaw_max_fsi`, `bylaw_max_height_m`, `bylaw_max_stories`, `bylaw_max_units`, `bylaw_max_density` | numeric | zoning by-law | 🟢 |
| `is_in_ravine_protection_area`, `ravine_distance_m`, `is_heritage_designated`, `abuts_laneway` | bool/num | overlays | 🟢 |
| `neighbourhood_id`, `neighbourhood_cost_premium` | int/num | spatial join | 🟢 |

---

## B. Max-build envelope (as-of-right) — permit-informed storeys

| Field | Type | Source / formula | Reliability |
|---|---|---|---|
| `max_buildable_footprint_sqm` | numeric | `LEAST(setback-box, coverage-cap)` | 🟢 |
| `max_build_width_m`, `max_build_length_m` | numeric | oriented envelope **(projection-fixed, EPSG:2952)** | 🟢 |
| `max_build_height_m` | numeric | `bylaw_max_height_m` | 🟢 |
| `max_build_stories` | int | **PRIMARY = permit-neighbourhood realized** (CONFIRMED): from `neighbourhood_build_norms` — realized FSI + storey-norm p50 (FSI for GFA, description storey-norm for the count, reconciled for basement exclusion); fallback bylaw-height÷3 | 🟡 |
| `max_build_stories_basis` | text | `permit_nbhd` (primary) │ `pocket_p50` │ `bylaw_height` │ `derived` | — |
| `max_buildable_gfa_sqm` | numeric | `footprint × stories`, capped at `bylaw_max_fsi × lot` | 🟢 |
| `max_buildable_gfa_basis` | text | `fsi_cap` │ `coverage_box` │ `coverage_only` (WF3 Phase 1 D-C: below-floor dims — box excluded as degenerate, envelope = coverage cap only) │ `heritage_existing` | — |
| `max_build_greenspace_sqm` | numeric | `lot_size_sqm − max_buildable_footprint_sqm` (open/soft-landscaped remainder after the build) | 🟢 |
| `max_build_confidence` | text | high/med/low | — |

---

## C. CoA-upside max-build (NEW — realized-variance informed)

| Field | Type | Source / formula | Reliability |
|---|---|---|---|
| `coa_max_build_fsi` | numeric | neighbourhood realized variance FSI **p90** (from permit `RESIDENTIAL ÷ lot` among CoA-linked builds) | 🟡 |
| `coa_max_build_coverage_pct` | numeric | realized variance coverage p90 (on-inquiry/plan; else derived) | 🟠 |
| `coa_max_build_footprint_sqm` | numeric | `coa_coverage × lot` | 🟡 |
| `coa_max_build_stories` | int | `round(coa_fsi ÷ coverage)`; or storey-norm p90 | 🟡 |
| `coa_max_build_gfa_sqm` | numeric | `coa_max_build_fsi × lot` | 🟡 |
| `coa_variance_likelihood` | numeric | `nbhd_coa_approval_pct` × local variance rate | 🟡 |
| `coa_max_build_greenspace_sqm` | numeric | `lot_size_sqm − coa_max_build_footprint_sqm` (remaining open space at the CoA envelope) | 🟡 |
| `coa_max_build_basis` | text | `nbhd_realized_variance` │ `bylaw_plus_margin` | — |

---

## D. Permit data — REFERENCE INPUT (not parcel fields)

**Permit data is a reference set, not a parcel field.** The enriched parcels are *all ~486K parcels*, and the typical parcel has **no permit** — that's the whole point (we prospect un-permitted homes). Permit GFA/FSI from the *permitted minority* is aggregated and surfaced as a reference that **calibrates** every parcel's enrichment. It lives in:
- **§J** — neighbourhood realized FSI / storeys / build-ratio (calibrates max-build storeys §B, the current range §G, CoA-upside §C, and the reno %s §H).
- **§K** — comparable nearby builds with their FSI / GSM.
- The **permits table itself** holds `permit_gfa_sqm` (= `RESIDENTIAL`), `permit_fsi` (= GFA÷lot), `permit_residential_added_sqm`, `permit_interior_alt_sqm`, `permit_work_direction` (up/out/interior) for the minority with a permit — these *build* J/K, they are not copied onto every parcel.

---

## E. Two size concepts on the parcel (no per-parcel permit)

Because a parcel has no permit, there is **no single "resolved footprint."** Two distinct sizes are carried:

| Concept | Field group | Source | Reliability |
|---|---|---|---|
| **Build potential** (what *could* be built) | max-build §B / CoA-upside §C | lot + by-law + nbhd permit norms | 🟢 |
| **Current structure** (what's *there*) | the **range** §G | nbhd realized build-% (§J) + imagery *position* cross-check (§F) | 🟡 range |

`footprint_confidence` (high/med/low) flags how firm the current estimate is (firms up at inquiry via MLS / a linked permit / plans).

---

## F. Position-from-massing (KEEP for positioning — NOT size; Google Solar NOT used)

Massing is retained **only for placement** (setbacks, rear-yard, open pocket). Its *size* is a flagged fallback. **Decision: Google Solar API is not used** — so no Solar-derived footprint or imagery date.

| Field | Type | Source / formula | Reliability |
|---|---|---|---|
| `imagery_roof_footprint_sqm` | numeric | re-labeled `existing_footprint_sqm` — **fallback size only** | 🟠 |
| `imagery_roof_gfa_sqm` | numeric | re-labeled `existing_gfa_sqm` — fallback | 🟠 |
| `imagery_footprint_confidence` | text | link confidence + over-cap flag | — |
| `imagery_source` | text | City 3D Massing (~2025 release; **capture date not published**) | — |
| `front_setback_m`, `side_setback_min_m` | numeric | building-to-lot-edge (position) | 🟢 |
| `rear_yard_depth_m` | numeric | depth behind building (position) | 🟢 |
| `open_yard_pocket_radius_m` | numeric | `ST_MaximumInscribedCircle(lot − building)` — suite/accessory feasibility | 🟢 |
| `existing_other_structures_count`, `existing_other_structures_sqm` | int/num | non-primary buildings (position) | 🟡 |
| `existing_greenspace_sqm` | numeric | `lot − footprint − other` (recomputed; flag over-stated when accessories unseen) | 🟡 |

---

## G. Current-structure RANGE (DEGRADED — neighbourhood-permit-calibrated)

Replaces the point fields `cur_floor_gfa_sqm` / `cur_pot_2story_gfa_sqm` / `cur_pot_3story_gfa_sqm`. Estimated from the **local neighbourhood realized build-%** (§J — the addition-delta + build-ratio work: reno homes sit ≥38% below max-build), **not** the unreliable massing size. Assume the home is below max-build (reno candidate).

| Field | Type | Source / formula | Reliability |
|---|---|---|---|
| `cur_gfa_high_sqm` | numeric | `max_buildable_gfa_sqm × nbhd_existing_build_ratio_p50` — **OLD-STOCK ratio** (≈0.62 from addition-delta `1 − Δ/max_build`), NOT the new-build 0.80; capped at max-build | 🟡 |
| `cur_gfa_low_sqm` | numeric | `max_buildable_gfa_sqm × nbhd_existing_build_ratio_p25` (or basement / single-floor floor) | 🟡 |
| `cur_storeys_range` | text | from nbhd storey-norm (e.g. `1-2`, `2-3`) | 🟡 |
| `cur_gfa_range_basis` | text | `nbhd_build_ratio` │ `basement_only` | — |
| `cur_below_maxbuild` | bool | default TRUE (reno candidate); FALSE = legal-non-conforming flag | 🟡 |

---

## H. Reno / build option scope

| Field | Type | Source / formula | Reliability |
|---|---|---|---|
| `cur_est_kitchen_gfa_sqm` | numeric | **`cur_gfa × nbhd_reno_kitchen_pct`** — % from **scope-classified KIT permits** (via classify-scope/archetypes, NOT raw `INTERIOR_ALTERATIONS`); applied to the CURRENT home (§G); min-sample → citywide fallback | 🟡 |
| `cur_est_bath_gfa_sqm` | numeric | **`cur_gfa × nbhd_reno_bath_pct`** — % from scope-classified BTH permits | 🟡 |
| `gut_reno_gfa_low/high_sqm` | numeric | = `cur_gfa_low/high` (§G) — interior gut priced off the current range | 🟡 |
| `basement_reno_sqm` | numeric | `cur_gfa_low` (basement ≈ footprint / single floor) | 🟡 |
| `solar_roof_sqm` | numeric | ≈ footprint (roof area) — **solar option sized from footprint, not the Solar API** | 🟡 |
| `max_newbuild_coa_gfa_sqm` | numeric | `coa_max_build_gfa_sqm` (§C) | 🟡 |

*(Dollar values = separate market-rate $/m² model × `neighbourhood_cost_premium`; `EST_CONST_COST` unusable.)*

---

## H2. Suite & garage options (CORRECTED — see `massing-footprint-reliability` §6)

| Field | Type | Source / formula | Reliability |
|---|---|---|---|
| `max_garden_suite_gfa_sqm` | numeric | footprint = **min(40% × rear_yard_area, 60 m²)**; GFA = footprint × storeys, **< main-house GFA**; subject to ≤20% all-ancillary lot coverage + soft-landscaping floor + open-pocket fit (§F) | 🟡 |
| `max_laneway_suite_gfa_sqm` | numeric | footprint ≤ **60 m² (8×10 m)**; GFA ≤ **main-house above-grade** = `resolved_gfa_sqm` if permit-linked, else **`cur_gfa_high` (§G)**, else citywide 120 m² fallback; gated by `abuts_laneway ≥ 3.5 m` + height/separation | 🟡 |
| `suite_soft_landscape_min_pct` | numeric | **0.50** of rear yard if `frontage_m > 6.0`, else **0.25** (incl. the suite footprint) — gates suite fit | 🟢 by-law |
| `suite_separation_required_m` | numeric | **5 m** (→ ≤4 m height) / **7.5 m** (→ ≤6 m height) | 🟢 by-law |
| `max_rear_suite_gfa_sqm`, `rear_suite_type` | num/text | chosen suite (laneway ⊕ garden; mutually exclusive) | 🟡 |
| `garden_suite_fits` | bool | rear-yard depth + open-pocket (NOT massing greenspace) | 🟡 |
| `rear_suite_permission`, `garage_permission` | text | as_of_right / coa_required / not_permitted (greenspace-driven; verify soft-landscaping %) | 🟡 |
| `max_garage_gfa_sqm` | numeric | by-law-capped footprint that fits the rear yard | 🟡 |
| `garage_capacity_cars` | int | **FIX: floor at one-car footprint (≥18.5 m²); never 0-car `as_of_right`** | 🟡 |
| `garage_constraint_reason` | text | heritage / ravine / lot_too_small / no_rear_yard | — |

---

## I. Optimal config (the option menu)

| Field | Type | Source / formula |
|---|---|---|
| `opt_aor_storeys`, `opt_aor_gfa_sqm`, `opt_aor_units` | int/num | as-of-right config (B) |
| `opt_coa_storeys`, `opt_coa_gfa_sqm` | int/num | CoA-upside config (C) |
| `opt_suite_type` | text | `garden` │ `laneway` │ `none` |
| `opt_suite_fits_full` | bool | both at full size (rear-yard geometry, F) |
| `opt_binding_constraint` | text | `coverage` │ `fsi` │ `depth` │ `soft_landscaping` |
| `opt_config_confidence` | text | high/med/low |
| `optimal_config` | jsonb | full menu of all options + assumptions + per-option scope |

---

## J. Nearby reno/build summary — per neighbourhood (5-yr window)

| Field | Type | Source / formula |
|---|---|---|
| `nbhd_new_builds_5yr`, `nbhd_additions_5yr`, `nbhd_renos_5yr`, `nbhd_suites_5yr`, `nbhd_demos_5yr` | int | distinct-parcel permit counts |
| `nbhd_coa_approval_pct` | numeric | approved ÷ decided CoA (5-yr) |
| `nbhd_realized_fsi_p50`, `nbhd_realized_fsi_p90` | numeric | permit `RESIDENTIAL ÷ lot` distribution |
| `nbhd_realized_coverage_p50/p90` | numeric | on-inquiry/derived |
| `nbhd_storeys_typical`, `nbhd_storeys_stretch` | int | storey-norm p50/p90 |
| `nbhd_build_ratio_p25`, `nbhd_build_ratio_p50` | numeric | realized GFA ÷ max-build (localised current-size prior — drives §G range) |
| `nbhd_reno_kitchen_pct`, `nbhd_reno_bath_pct` | numeric | realized kitchen/bath reno area ÷ home GFA, from permit reno data (drives §H) |
| `nbhd_reno_mix` | jsonb | counts + median FSI/GFA **by reno type** (new build / addition-up / addition-out / gut / suite / kitchen / bath …) |
| `nearby_builds_summary` | jsonb | the human-readable neighbourhood card |

---

## K. Comparable reno/build details — per parcel (with FSI & GSM)

| Field | Type | Contents |
|---|---|---|
| `comparable_builds` | jsonb (array) | each: `{address, lot_sqm, frontage_m, distance_m, work_type, work_direction, permit_gfa_sqm (GSM), permit_fsi, storeys, coa_decision, what_built}` |
| `comp_count` | int | matched comps (confidence) |
| `comp_dominant_build` | text | modal realized build |
| `comp_build_ratio_p50` | numeric | comp footprint ÷ max-build — **EXCLUDE comps >1.1** (not cap) from the p50; if that drops `comp_count` below min → `opt_config_confidence='low'` |
| `comp_fsi_p50` | numeric | median realized FSI among comps |

---

## L. DEGRADED fields (kept, meaning changed)

| Current | → New role |
|---|---|
| `existing_footprint_sqm` | → `imagery_roof_footprint_sqm` (fallback/position; never as-of-right) |
| `existing_gfa_sqm` | → `imagery_roof_gfa_sqm` (fallback) |
| `existing_width_m`, `existing_length_m`, `max_build_width_m`, `max_build_length_m` | keep names; **FIX projection bug** |
| `cur_floor_gfa_sqm`, `cur_pot_2story_gfa_sqm`, `cur_pot_3story_gfa_sqm` | → replaced by the `cur_gfa_low/high` **range** (G) |
| `cur_est_kitchen_gfa_sqm`, `cur_est_bath_gfa_sqm` | → `cur_gfa × nbhd_reno_kitchen/bath_pct` (§H) — **based on the CURRENT home, NOT max-build** (supersedes the earlier max-build wording) |
| `existing_structure_confidence`, `existing_data_quality_flag` | keep (feed `imagery_footprint_confidence`) |

---

## M. DELETED / RETIRED fields (leave NULL, document as retired — no destructive drop)

| Field | Reason |
|---|---|
| `existing_stories` | tree-contaminated (47% of detached read ≥4 storeys) |
| `existing_height_m` | tree-contaminated (canopy; heights to 122 m) |
| `cur_basement_gfa_sqm` | deprecated (folds into `cur_gfa_low`) |
| `cur_storey_gfa_sqm` | deprecated (depended on retired `existing_stories`) |
| `cur_interior_reno_gfa_sqm` | deprecated (was `existing_gfa`) |
| *(`permits.EST_CONST_COST`)* | **do not use for value** — understated + sparse (not an enrich field; flagged for the cost model) |

> 🔴 **Phase-3 hard dependency (review B-4):** `cur_floor_gfa_sqm` / `cur_pot_2story_gfa_sqm` are LIVE cost-model inputs via `ARCHETYPE_GEOM_BASIS` (`src/lib/classification/archetypes.ts` ADD/BAS→`cur_floor`, INT→`cur_pot_2story`) and are population-monitored in `assert-global-coverage.js`. RANGE-ifying/retiring them in Phase 3 **must update the geom_basis map + the coverage asserts in the SAME change**, or ADD/BAS/INT cost estimates silently go NULL across ~486K parcels. RE-LABEL (rename `existing_footprint_sqm`→`imagery_roof_footprint_sqm`) must `RENAME COLUMN` on **parcels + permits + coa_applications** together and update `EXISTING_COLS` in `max-build.js` (array-driven propagation + orphan-nullify key off it).

---

## N. Open items before the plan
1. ✅ **RESOLVED** — current range capped at max-build, assume below (decision #5); evidence: additions = 38% of envelope.
2. ✅ **RESOLVED** — `RESIDENTIAL` (GFA) available, **~37% raw fill** of residential permits (higher after principal-row dedup); **131+ neighbourhoods** covered → per-nbhd norms viable + citywide fallback. **⚠️ SCHEMA DRIFT found:** loader expects 9 fields now GONE from CKAN (incl. **`STOREYS`** — explains why `permits.storeys` is all 0) and never maps 10 present ones (incl. **`RESIDENTIAL`**). Fix the loader's drift-detection + remap as part of the ingest change (§13.0 of the plan). Storeys therefore come from description-norms + FSI (not the dropped `STOREYS` field) — consistent with decision #7.
3. ✅ **RESOLVED (researched; cite by-law text in WF1).** Key 569-2013 / O.Reg 462/24 constants (corrects our placeholders):
   - **Garden suite:** the flat **60 m² GFA cap is REMOVED** (2-storey now allowed); governed by the **20% total-lot ancillary-building coverage** + rear setback (1.5 m, or ½-height if lot depth >45 m) + height/separation. → re-derive size from coverage + open-pocket, **not** a flat 60.
   - **Laneway suite:** footprint ≤ **60 m² (8.0 m × 10.0 m)**, ≤ 2 storeys, **GFA ≤ main-house above-grade area** (≈120 m² typical); lane setback 1.5 m, side 1.0 m (1.5 m if >4 m & near residential); lot must **abut a lane ≥ 3.5 m**.
   - **Separation (main↔suite):** **4–5 m** if suite height ≤4 m, **7.5 m** if >4 m. (Our flat 7.5 m over-states single-storey suites.)
   - **Remaining gap for WF1 by-law text:** exact **soft-landscaping %** + garden-suite height/angular-plane. (NB: kitchen/bath % is *permit-derived* §J, not by-law.)
4. **Current-range build-ratio** — §G must use a *pre-reno / old-stock* ratio (addition-delta implies ≤0.62), NOT the new-build ratio (0.80) which over-states the existing home.
5. **Permit↔parcel address normalization** — §J/§K matching (~94% naive); align permit `STREET_NAME` to `street_name_normalized` to keep the calibration base wide.
4. ✅ **RESOLVED** — storeys from permit-neighbourhood realized FSI + storey-norms (primary basis `permit_nbhd`); reconcile the basement-exclusion adjustment in the build-norms computation.

---

## O. Lot-shape & overlay handling (corner / through / ravine / heritage / massing)

The optimal-config envelope (§B/§C) + suite-fit (§F/§H2) MUST consume the existing overlay fields — these change the buildable envelope and suite placement:
- **Corner lot** (`is_corner_lot`, Spec 62): the flanking street side uses the **flankage setback** (`SETBACK_DEFAULTS.flankage` ≈ 4.5 m) instead of the interior side setback → narrower buildable width. **VERIFIED present** (`enrich-parcels.js:474` already branches on `is_corner_lot`). ⚠️ **DESCOPED (review):** a "no suite in the street-facing flanking yard" rule is **NOT buildable** — Spec 62 derives only `is_corner_lot`/`is_through_lot` (bools) + `primary_frontage_street_name` (*address-side*, not the flank); no field says *which* physical side flanks, and the open-pocket geometry is direction-blind. Suite-side exclusion needs a **Spec 62 follow-up** (flank-side geometry, deferred there). For now: flankage width only; suite-fit stays direction-blind (conservative).
- **Through lot** (`is_through_lot`, Spec 62): two front setbacks, **no rear yard** → `rear_yard_depth_m ≈ 0`, garden/laneway suite-fit = **false**. ⚠️ **LIVE BUG (review):** the current accessory CTE (`enrich-parcels.js:522-528`) ignores `is_through_lot` and uses the non-through rear-yard formula → a through lot can be told a suite "fits". **Phase 3 must add the `is_through_lot` guard** to `rear_yard_depth`/`garden_fits`/`laneway_fits`/`rear_suite_permission` (an explicit scoped step, not just §O prose).
- **Ravine** (`is_in_ravine_protection_area`, Spec 59): the 10 m ravine setback already reduces max-build footprint; suite-fit + greenspace use the ravine-reduced envelope; suite/garage permission → `not_permitted`/`coa_required`.
- **Heritage** (`is_heritage_designated`, Spec 61): max-build frozen at existing (`max_build_basis='heritage_existing'`); new-build option suppressed; reno options remain.
- **Massing link** (Spec 56): `imagery_*` + position fields depend on the building-centroid-in-parcel link (~99.7% residential); unlinked → imagery/position NULL, suite-fit falls back to lot-geometry only. (Heritage parcel with no massing link → `heritage_no_massing` NULLs the frozen envelope — degraded path.)

**Overlays CONSUMED vs DEFERRED (review #6 — make the omission a decision, not a silent gap):**
| Consumed (envelope-affecting) | Deferred — with rationale (Phase-3 decision) |
|---|---|
| ravine (10 m), heritage (freeze), corner (flankage width), through (rear-yard guard) | `in_building_setback_overlay` (a literal setback overlay — Phase 3 should fold into the setback math); `zoning_holding` ='H' (development suspended → flag `opt_binding_constraint='holding'` / lower confidence); `exception_number`/`exception_text` (site-specific FSI/height/setback — at minimum flag `exception_number IS NOT NULL` → lower envelope confidence); `in_parking_zone_overlay` |

(Ravine forces permission = **`not_permitted`** always — there is no `coa_required` path in the current code; tighten §H2 wording accordingly.)

## P. Round-2 review resolutions (folded)

- **Permit fields live on the `permits` table, not `parcels`** (DeepSeek CRIT); **Solar API not used** → no `imagery_capture_date` (DeepSeek CRIT).
- **Kitchen/bath = `cur_gfa × reno_pct`, NOT max-build** — §H supersedes the old §L wording (Gemini CRIT).
- **Projection fix = the `dims` CTE ONLY** (Integration FAIL — max_build width/length is setback arithmetic).
- **Comp match = kNN** (`geom <->` over-fetch ~50 → post-filter tolerance → re-rank), NOT `ST_DWithin` mass-match (DeepSeek CRIT — supersedes §4.6); `comp_count` counts only post-exclusion survivors (>1.1 excluded).
- **Old-stock ratio = `clamp(1 − Δ÷max_build, 0, 1)`**, exclude null/zero denom (Gemini HIGH).
- **Principal-row dedup** = `ORDER BY zoning_dominant_parcel_id, issued_date DESC, revision_num DESC, RESIDENTIAL DESC NULLS LAST, _ckan_id DESC` — keep `_ckan_id` as the stable tiebreaker (preserves the documented no-ping-pong idempotency fence) + a regression lock (Gemini MED + Integration).
- **§G NULL fallback:** nbhd ratio NULL → citywide row → else default **0.62**, `cur_gfa_range_basis='fallback'` (DeepSeek MED).
- **max-build GFA cap:** guard `bylaw_max_fsi` NULL → no FSI uplift (cap = footprint×stories) (DeepSeek MED).
- **Suite-fit envelope = the current building** position (conservative); open-pocket on `lot − existing` (DeepSeek MED).
- **`max_build_stories_basis`** reflects the ACTUAL basis used (→ `bylaw_height` when no nbhd norm) (DeepSeek MED).
- **CONCURRENTLY comp index = separate non-transactional migration** (Integration); **garage capacity gated ≥1 directly** (Integration); `manifest.scripts` not `.steps`.
- **`build_ratio_null_rate` WARN > 50%**; citywide-NULL row via **unconditional pre-insert** (Observability); `reno_mix` + `data_provenance` get documented JSON schemas; **RESIDENTIAL 37%-fill sampling bias acknowledged** — norms are neighbourhood-level priors, not per-parcel claims.

## Implementation phasing (epic — each phase = own plan-lock + review)

| Phase | Scope | Files | Spec refs |
|---|---|---|---|
| **0** (2× WF3) | projection-bug fix; garage one-car floor | `enrich-parcels.js`, `max-build.js` | 65 |
| **1** | permit occupancy ingest + `STOREYS` drift fix; `neighbourhood_build_norms` + `compute-build-norms.js` (FSI/storey/build-ratio/reno-% by type, citywide fallback) | `load-permits.js`, `build-norms.js`(NEW), `compute-build-norms.js`(NEW), 2 migrations | 30 (Enricher), 47, 48 §3.6, 41/43, 55 |
| **2** | `optimal-config.js` engine (pure) + by-law 569-2013 constants + logic tests | `optimal-config.js`(NEW) | 65, _contracts.json |
| **3** | enrich-parcels optimal-config pass — new fields (A–K), degrade→`imagery_*`, retire→NULL, rebuild suite/garage, comps | `enrich-parcels.js`, parcels migration | 47, 48, 65 |
| **4** | chain wiring + observability + validation/regression locks (Derwyn ground-truth) | `manifest.json`, `assert-*`, `*.regression.test.ts` | 43, 48, 79 |

**Dependency order:** 0 (independent) → 1 (foundation) → 2 (engine) → 3 (writes fields) → 4 (wire + verify). New spec/lock: **78** (`docs/specs/01-pipeline/78_optimal_lot_configuration.md`; 81 is taken). DB impact: `permits` ALTER (metadata-only), `neighbourhood_build_norms` (new), `parcels` ALTER (Phase 3 — incl. comp index **`CREATE INDEX CONCURRENTLY`**, validator won't catch the 486K lock).

**Speed model:** one parallel plan-review of THIS design now → revise once → implement each phase with only its per-diff output review.

---

## Appendix — Complete current enriched-parcel fields (121) + disposition

Every column on `parcels` today, grouped, with disposition (KEEP / DEGRADE / RETIRE / REBUILD).

**1. Identity & geometry (23) — KEEP:** `id`, `parcel_id`, `feature_type`, `address_number`, `linear_name_full`, `addr_num_normalized`, `street_name_normalized`, `street_type_normalized`, `stated_area_raw`, `lot_size_sqm`, `lot_size_sqft`, `frontage_m`, `frontage_ft`, `depth_m`, `depth_ft`, `geometry`, `date_effective`, `date_expiry`, `created_at`, `centroid_lat`, `centroid_lng`, `is_irregular`, `geom`

**2. Zoning & by-law (36) — KEEP:** `zoning_class`, `zoning_zn_string`, `zoning_gen_zone`, `zoning_holding`, `zone_status`, `bylaw_max_fsi`, `bylaw_max_coverage_pct`, `bylaw_max_height_m`, `bylaw_max_stories`, `bylaw_max_units`, `bylaw_max_density`, `bylaw_min_frontage_m`, `bylaw_min_area_sqm`, `bylaw_standard_setback_m`, `bylaw_pct_commercial_max`, `bylaw_pct_residential_max`, `bylaw_pct_employment_max`, `bylaw_pct_office_max`, `exception_number`, `exception_text`, `bylaw_chapter`, `bylaw_section`, `bylaw_exception_ref`, `in_policy_area`, `on_policy_road`, `in_rooming_house_overlay`, `in_parking_zone_overlay`, `in_building_setback_overlay`, `on_priority_retail`, `in_queenstw_eat_overlay`, `zoning_overlays`, `zoning_base_source_id`, `zoning_dominant_area_share`, `zoning_is_ambiguous`, `zoning_base_source_dataset_version`, `zoning_enriched_at`

**3. Overlays — ravine / heritage / centreline (11) — KEEP:** `is_in_ravine_protection_area`, `ravine_distance_m`, `ravine_dataset_version_when_enriched`, `is_heritage_designated`, `heritage_designation_type`, `heritage_designation_date`, `heritage_dataset_version_when_enriched`, `is_corner_lot`, `is_through_lot`, `primary_frontage_street_name`, `centreline_dataset_version_when_enriched`

**4. Max-build (15) — KEEP** (storeys basis → `permit_nbhd`; `*_width/length_m` projection FIX): `lot_size_confidence`, `lot_size_basis`, `max_build_setback_basis`, `max_buildable_footprint_sqm`, `max_build_width_m`, `max_build_length_m`, `max_build_height_m`, `max_build_stories`, `max_build_stories_basis`, `max_build_basis`, `max_buildable_gfa_sqm`, `max_buildable_gfa_basis`, `max_build_confidence`, `max_build_stories_aggressive`, `market_exceeds_bylaw`

**5. Suite / garden / garage / envelope (13) — REBUILD** (lot-geometry + open-pocket; garage one-car floor FIX): `max_garden_suite_gfa_sqm`, `garden_suite_fits`, `envelope_constrained`, `envelope_constraint_reason`, `abuts_laneway`, `max_garage_gfa_sqm`, `garage_capacity_cars`, `garage_constraint_reason`, `garage_permission`, `max_laneway_suite_gfa_sqm`, `max_rear_suite_gfa_sqm`, `rear_suite_type`, `rear_suite_permission`

**6. Existing structure — massing (10):** DEGRADE → `existing_footprint_sqm`→`imagery_roof_footprint_sqm`, `existing_gfa_sqm`→`imagery_roof_gfa_sqm`; **RETIRE** `existing_stories`, `existing_height_m`; KEEP (position) `existing_width_m`, `existing_length_m` (FIX projection), `existing_structure_confidence`, `existing_other_structures_count`, `existing_other_structures_sqm`, `existing_greenspace_sqm`

**7. Scenario / reno (11):** **RANGE-ify** `cur_floor_gfa_sqm`/`cur_pot_2story_gfa_sqm`/`cur_pot_3story_gfa_sqm` → `cur_gfa_low/high` (§G); **reno-%** `cur_est_kitchen_gfa_sqm`/`cur_est_bath_gfa_sqm` (§H); **RETIRE** `cur_basement_gfa_sqm`, `cur_storey_gfa_sqm`, `cur_interior_reno_gfa_sqm`; KEEP `max_newbuild_coa_gfa_sqm`, `cur_gfa_range_basis`, `existing_data_quality_flag`

**8. Neighbourhood (2) — KEEP:** `neighbourhood_id`, `neighbourhood_cost_premium`

*Total: 121. New fields (§A–§K above) are additive; permit GFA/FSI fields live on the `permits` table + neighbourhood norms (§D), not here.*

---

*No code, specs, or migrations written. This field spec drives the WF1 plan.*
