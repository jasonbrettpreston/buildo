# Optimal Lot Configuration — Implementation Plan

**Date:** 2026-06-25
**Status:** Implementation blueprint (pre-WF1). **No code/spec/migration changes made.**
**Companion:** `docs/reports/massing-footprint-reliability-investigation.md` (the findings this builds on).
**Domain:** Backend/Pipeline.

---

## 1. Purpose

Replace the parcels product's reliance on the unreliable massing **footprint area** with a **lot-driven Optimal Lot Configuration**: per parcel, the best as-of-right build and the CoA-upside build, plus a 5-year nearby-builds + CoA-decision summary. Rests on the inputs proven reliable (lot geometry, by-law caps, max-build ceiling, realized permit/CoA comps, building *position*) and designs the footprint-area noise out of the headline.

Why now: the reliability investigation proved (a) max-build is exact (median 1.00 vs coverage cap), (b) massing footprint *area* is ±20% noisy / 33% over the legal cap, but (c) massing *position* is reliable, and (d) realized comps + 5-year activity are well-populated (157/158 neighbourhoods). The pivot turns the soft product into a reliable one.

---

## 2. What gets produced (recap)

Per parcel, an `optimal_config` with four parts — full layout in the companion report §8 and the "layout" discussion:
- **as_of_right** — best legal build, no variance (main build + suite-if-fits + deck + solar + garage).
- **coa_upside** — storeys/GFA uplift via variance (footprint stays at the cap; storeys → neighbourhood p90).
- **nearby_builds (5-yr)** — neighbourhood aggregate: build-type mix, suite-adoption, build-ratio, **CoA approval rate**.
- **comparable_builds** — parcel-level comps: the actual nearby addresses on similar lots (size + frontage matched) and *what they built* + CoA outcome. "Here are the addresses like yours and what they did," vs the neighbourhood-wide pattern.

---

## 3. Data model changes

### 3.1 `parcels` — new output columns (one migration)
Two viable shapes; **recommend a hybrid**: flat scalar columns for the headline numbers (queryable/indexable) + a JSONB blob for the full config menu.

Flat (queryable):
| Column | Type | Notes |
|---|---|---|
| `opt_aor_storeys` | INTEGER | as-of-right storeys (= max_build_stories) |
| `opt_aor_gfa_sqm` | NUMERIC | main-build GFA |
| `opt_aor_units` | INTEGER | 1 or 2 (suite) |
| `opt_coa_storeys` | INTEGER | p90 storeys |
| `opt_coa_gfa_sqm` | NUMERIC | CoA-upside GFA |
| `opt_suite_type` | TEXT | `garden`/`laneway`/`none` |
| `opt_suite_fits_full` | BOOLEAN | both at full size (no house reduction) |
| `opt_binding_constraint` | TEXT | coverage/fsi/depth/soft_landscaping |
| `opt_config_confidence` | TEXT | high/medium/low (see §9) |

JSONB (full menu + provenance):
| Column | Type | Notes |
|---|---|---|
| `optimal_config` | JSONB | `{as_of_right, coa_upside, components[], assumptions}` |
| `nearby_builds_summary` | JSONB | the 5-yr summary object (§3.3) |

Propagate the flat headline columns to permits/coa via the existing `LOT_MAXBUILD`-style array mechanism (optional — decide in WF1).

### 3.2 New table `neighbourhood_build_norms` (extends `neighbourhood_storey_norms`)
`neighbourhood_storey_norms` (WF3-C1) already holds storey p50/p90. **Extend, don't replace** — add a sibling table (or columns) for the 5-year build summary:
| Column | Notes |
|---|---|
| `neighbourhood_id` FK | + NULL citywide-fallback row (same pattern as storey norms) |
| `window_start` / `window_end` | the 5-year window (DB-clock derived) |
| `new_build_count` / `addition_count` / `reno_count` | distinct-parcel counts |
| `rear_suite_count` | existing-suite signal |
| `coa_approved` / `coa_refused` / `coa_total` / `coa_approval_rate` | CoA decision summary |
| `new_builds_5yr`/`additions_5yr`/`renos_5yr`/`suites_5yr`/`demos_5yr` | distinct-parcel counts by type |
| `realized_fsi_p50` / `realized_fsi_p90` | `RESIDENTIAL ÷ lot` (drives `max_build_stories` §B + CoA-upside §C) |
| `realized_coverage_p50` / `realized_coverage_p90` | realized coverage (CoA-upside "possible") |
| `build_ratio_p50` | **new-build** GFA ÷ max-build (≈0.80) |
| **`existing_build_ratio_p25` / `existing_build_ratio_p50`** | **OLD-STOCK** ratio = `1 − addition_Δ ÷ max_build` (≈0.62) — drives §G current range (review B-1) |
| `reno_kitchen_pct` / `reno_bath_pct` | from scope-classified KIT/BTH permits (review B-2) |
| `storeys_p50` / `storeys_p90` | storey-norms (drives §B `permit_nbhd` basis) |
| `coa_approved`/`refused`/`total`/`approval_rate` | CoA decision summary |
| `reno_mix` (jsonb) | counts + median FSI/GFA by reno type |
| `sample_n` / `data_provenance` | honesty fields |

### 3.3 `nearby_builds_summary` JSONB (per parcel)
A frozen snapshot copied from `neighbourhood_build_norms` at enrich time, plus a human-readable `headline` string (e.g. *"East York: 135 new builds + 179 additions in 5 yrs; CoA 95% approval; typical 2 storeys (p90 3), 81% of footprint ceiling"*).

### 3.4 Comparable-builds fields (parcel-level comps)
| Column | Type | Notes |
|---|---|---|
| `comparable_builds` | JSONB (array) | up to ~10 matched comps, nearest-first |
| `comp_count` | INTEGER | how many comps found (confidence signal — low count → lower `opt_config_confidence`) |
| `comp_dominant_build` | TEXT | the modal realized build, e.g. `"new 2-storey detached, integral garage"` |
| `comp_build_ratio_p50` | NUMERIC | realized footprint ÷ max-build among comps (clamped — see §4.6) |

Each `comparable_builds[]` element:
```json
{ "address": "62 Northridge", "lot_sqm": 327, "frontage_m": 9.8, "distance_m": 20,
  "massing_fp_sqm": 84, "build_ratio": 0.74, "abuts_laneway": false,
  "recent_permit": "new_build", "coa_decision": "Approved",
  "what_built": "new two-storey detached dwelling with an integral garage" }
```

`comparable_builds` is the **parcel-level** evidence (named addresses); `nearby_builds_summary` (§3.3) is the **neighbourhood-level** aggregate. Both are surfaced on the parcel.

---

## 4. Pipeline changes (scripts)

### 4.1 New: `scripts/lib/optimal-config.js` (pure functions)
The budget-allocation engine — pure, unit-testable, single source of truth (mirrors the `max-build.js` pattern). Inputs: lot dims, by-law caps, max-build outputs, neighbourhood norms, building position. Outputs: the two config tiers + the components list. Holds the by-law rule constants (§5). No DB/IO.

### 4.2 New: `scripts/compute-build-norms.js` (permits chain, Spec 47 skeleton)
Extends/parallels `compute-storey-norms.js`: computes `neighbourhood_build_norms` from the **5-year** permit + CoA window (DB-clock derived, no `new Date()`), with the NULL citywide-fallback row. Advisory lock = its own spec number. Runs **before** enrich-parcels in the chain (dependency, like storey-norms).

### 4.3 Modified: `scripts/enrich-parcels.js`
Add an **optimal-config pass** (a new UPDATE, disjoint column set — same discipline as the max-build / existing-structure passes): reads lot + by-law + max-build cols + `neighbourhood_build_norms` + building position; calls `optimal-config.js`; writes the §3.1 columns + the two JSONB blobs. Idempotent (`IS DISTINCT FROM` guards), observability rows (config-tier distribution, suite-fit rate, confidence distribution).

### 4.4 Position-based geometry (replaces footprint-area dependence)
- **Suite-fit (clean-slate):** lot-geometry — `rear_behind_max = depth − front_setback − (coverage_cap / buildable_width)`; buildable_width = `frontage − 2·side_setback` (NOT the unreliable `max_build_width_m` rect-approx — see fix §6.1). `fits_full` when `rear_behind_max ≥ suite_requirement`.
- **Existing-accessory detection:** `ST_MaximumInscribedCircle(ST_Difference(lot, primary_building))` for the open-yard pocket + permit/CoA accessory signals — to flag "rear yard already occupied" without trusting footprint area.

### 4.5 Manifest / chain wiring
Register `compute_build_norms` (permits chain, before enrich-parcels' dependents) and ensure the new enrich pass runs in `enrich_parcels`. Update `manifest.chains` + `assert-schema` + relevant `assert-global-coverage` rows.

### 4.6 Comparable-builds matching (parcel-level comps)
A spatial similarity query in the enrich-parcels optimal-config pass, per parcel:
```
same zoning class
AND lot_size within ±20%
AND frontage within ±20%
AND ST_DWithin(geom, 1.5 km)
AND has new_build/addition permit OR CoA decision in last 5 yrs
ORDER BY similarity (|Δlot| + |Δfrontage|·10), nearest-first   LIMIT ~10
```
For each comp, attach: address, lot/frontage, distance, massing footprint, `build_ratio`, `abuts_laneway`, most-recent permit `project_type`, and the CoA `decision` + `description` (the richest "what they built" signal). Derive `comp_dominant_build` (modal) and `comp_build_ratio_p50`.

**Over-capture clamp (required):** `build_ratio` uses the massing footprint, so over-captured comps read >1.0 (e.g. 4 Stanhope showed 1.28×, physically impossible for a compliant build). Clamp/flag any `build_ratio > 1.1` so it doesn't inflate `comp_build_ratio_p50`.

**Fallback / confidence:** if `comp_count` is low for the strict tolerance, progressively widen lot/frontage tolerance then radius; surface `comp_count` and feed it into `opt_config_confidence` (few comps → lower confidence). Tolerances/radius/window are tunable knobs (decide defaults in WF1).

**Performance (review B-5 — REDESIGNED):** a naive per-parcel `ST_DWithin` × 486K = ~13 hrs / OOM. Instead: **(1)** restrict the candidate universe to **permitted parcels only** (the comp pool is ~10–15% of parcels, not 486K) — materialize a `permit_comp_candidates` temp table (parcel_id, geom, zoning, lot, frontage, what_built, fsi) ONCE per run; **(2)** batch the match as a single **spatial self-join** `subject JOIN candidates ON ST_DWithin(...) AND zoning match AND lot/frontage ±20%` with `LATERAL … ORDER BY similarity LIMIT 10`, streamed; **(3)** indexes: existing GiST `idx_parcels_geom_gist` (mig 039) + **`CREATE INDEX CONCURRENTLY`** on `(zoning_class, lot_size_sqm)` (validator does NOT flag non-CONCURRENTLY on `parcels` — 486K, not in `LARGE_TABLES`; must specify CONCURRENTLY ourselves). Only subjects that need comps (residential, has max-build) are processed.

---

## 5. By-law rule extraction (must precede coding — spec-first)

The current Spec 65 constants are **placeholders** and must be verified against **Toronto Zoning By-law 569-2013** (and ARU/garden-suite by-laws) before they drive outputs:

| Constant (current placeholder) | Used for |
|---|---|
| garden-suite max GFA = 60 m² / laneway = 120 m² | suite size |
| suite ↔ main-house **separation distance** = 7.5 m | suite-fit |
| suite rear setback = 1.5 m | suite-fit |
| soft-landscaping minimum = 30% | feasibility floor |
| side/front/rear setbacks (SETBACK_DEFAULTS) | buildable width, house length |
| deck/pool coverage carve-outs | component feasibility |
| solar height-projection allowance | solar feasibility |

This is **WF1 task 1** and gates the `opt_suite_fits_full` reliability (turns it 🟡→🟢). Output: a verified rules table cited to by-law sections, encoded in `optimal-config.js`.

---

## 6. Prerequisite fixes (feed the model — small, isolated)

These are correctness fixes from the reliability investigation that the optimal-config depends on. Each is its own WF3 (per project cadence):

1. **🔴 Oriented-envelope projection bug** (`enrich-parcels.js:717–728`) — `ST_OrientedEnvelope` on SRID-4326 inflates length +7.3%. Fix: `ST_OrientedEnvelope(ST_Transform(geom, 2952))`. Needed because house-shape feeds suite-fit. (Also fixes `existing_width/length`.)
2. **🔴 Garage one-car floor** (`max-build.js`: `GARAGE_MIN_FOOTPRINT_SQM 18 < CAR_FOOTPRINT 18.5`) — 46,598 phantom 0-car garages. Fix: raise the fit floor to ≥ one-car footprint. (Garage logic carries into the integral-vs-detached config rule.)
3. **🟠 Existing-accessory greenspace overstatement** — switch suite/garage "already exists?" from footprint-area greenspace to the position-based open-pocket + permit/CoA method (§4.4). Demotes false `as_of_right` to "verify on site."
4. **⚠️ Store massing capture-context** — add a vintage/provenance note on `building_footprints` load (traceability).

Fixes 1 & 2 are tiny and independent — recommend landing them first regardless of the pivot.

---

## 7. Reliability & validation plan

Validate the engine against realized comps + ground truth before shipping:
- **Storeys:** `opt_aor_storeys`/`opt_coa_storeys` vs neighbourhood realized p50/p90 (passed on all test lots: 41 Derwyn 2/3, 37 Yorkdale 2/3, 2 Blacksmith 2/2).
- **Suite-fit:** `opt_suite_fits_full` rate vs realized suite-adoption rate per neighbourhood; spot-check vs the position-based open-pocket on a ground-truth set.
- **Footprint ceiling:** max-build ÷ coverage cap median ≈ 1.00 (already validated).
- **Ground-truth set:** the Derwyn plans (37/41/43/45) + any further plans collected — seed a `*.regression.test.ts` lock.
- **Honesty:** every config carries `opt_config_confidence`; the suite-fit and any coverage-variance "possible" are flagged, never asserted.

---

## 8. Sequence (phases)

| Phase | Work | WF |
|---|---|---|
| 0 | Land the two isolated fixes (projection, garage floor) | WF3 ×2 |
| 1 | By-law rule extraction (569-2013) → verified constants | WF1 task 1 |
| 2 | `compute-build-norms.js` + `neighbourhood_build_norms` table + migration | WF1 |
| 3 | `optimal-config.js` engine + unit tests (logic) | WF1 |
| 4 | enrich-parcels optimal-config pass + columns/JSONB + migration | WF1 |
| 5 | Position-based existing-accessory detection | WF1 |
| 6 | Chain wiring + observability + validation/regression locks | WF1 |
| 7 | (future) per-config dollar costing — separate WF | — |

---

## 9. Reliability scorecard of the delivered fields

| Field | Reliability | Basis |
|---|---|---|
| `opt_*_storeys`, `nearby_builds_summary` | 🟢 High | realized permits/CoA; validated |
| `comparable_builds` (addresses, CoA outcome, what-built) | 🟢 High | direct permit/CoA records on named comps |
| `comp_build_ratio_p50` | 🟡 Med | uses massing footprint (clamp >1.1); fine in aggregate across comps |
| main-build footprint / GFA / `binding_constraint` | 🟢 High | max-build = coverage cap (median 1.00) |
| `opt_suite_fits_full` | 🟡 Med → 🟢 after §5 | lot-geometry solid; threshold = by-law constant |
| existing-accessory "already there?" | 🟠 Low-Med | position + permit/CoA; misses unpermitted+unmassed (e.g. 41's suite) |
| CoA coverage-variance "possible" | 🟠 Low | not measurable from our data (over-capture noise) |
| per-config dollar cost | ⚪ Not yet | future WF |

`opt_config_confidence` is derived from: lot-size confidence, whether by-law caps are present (FSI often null), comp sample size, and whether an existing accessory is suspected.

---

## 10. Open decisions / risks

1. **Data-model shape** — hybrid flat + JSONB (recommended) vs JSONB-only.
2. **Propagate optimal-config to permits/coa?** or keep parcels-only (suite/units are a parcel concept).
3. **Peer-group radius** for comps — neighbourhood (have it) first; street/block is a later refinement (needs spatial clustering).
4. **Soft-landscaping & separation numbers** — block on 569-2013; do not ship placeholders into a user-facing "as_of_right."
5. **Existing-structure track** — confirm it demotes to a clearly-flagged soft secondary product (reno pricing), not deleted.
6. **Spec home** — new Spec (e.g. "Optimal Lot Configuration") under `docs/specs/01-pipeline/`, cross-referencing Spec 65 (max-build), Spec 56 (massing), Spec 62 (centreline/laneway), Spec 47 (protocol).

---

## 11. Required-changes checklist (concrete)

- [ ] WF3: fix oriented-envelope projection (`enrich-parcels.js`)
- [ ] WF3: fix garage one-car floor (`scripts/lib/max-build.js`)
- [ ] WF1: extract + verify by-law rules (569-2013) → constants in `optimal-config.js`
- [ ] New `scripts/lib/optimal-config.js` (engine, pure) + logic tests
- [ ] New `scripts/compute-build-norms.js` (5-yr norms) + advisory lock
- [ ] New table `neighbourhood_build_norms` + migration (+ NULL citywide row, FK)
- [ ] Migration: `parcels` optimal-config columns + JSONB
- [ ] `enrich-parcels.js`: optimal-config pass (disjoint UPDATE) + observability
- [ ] Position-based existing-accessory detection (open-pocket + permit/CoA)
- [ ] Comparable-builds matching (§4.6) + `comparable_builds` JSONB + `comp_*` columns + over-capture clamp + supporting index `(zoning_class, lot_size_sqm)`
- [ ] `manifest.json` chain wiring + `assert-schema` + coverage asserts
- [ ] Drizzle schema regen (`npm run db:generate`)
- [ ] Validation: comp-agreement checks + Derwyn ground-truth regression lock
- [ ] New spec doc + System Map regen

---

## 12. Field migration — current enrich fields → proposed target

57 enrichment-output columns are in scope on `parcels`. Disposition below (driven by the reliability findings; companion report §3–§8). **Principle: demote/re-label, don't delete** — preserve position signals and fallbacks; no destructive migration.

### 12.1 KEEP as-is (reliable, not in scope)
- **Lot:** `lot_size_sqm/sqft`, `frontage_m/ft`, `depth_m/ft`, `lot_size_basis`, `lot_size_confidence`
- **By-law/zoning:** `bylaw_max_coverage_pct`, `bylaw_max_fsi`, `bylaw_max_height_m`, `bylaw_max_stories`, `bylaw_max_units`, `bylaw_max_density`, all other `bylaw_*` / `zoning_*`
- **Overlays:** `is_in_ravine_protection_area`, `ravine_distance_m`, `is_heritage_designated`, `heritage_*`, `abuts_laneway`, `in_rooming_house_overlay`
- **Neighbourhood:** `neighbourhood_id`, `neighbourhood_cost_premium`

### 12.2 KEEP (reliable — the as-of-right ceiling)
`max_buildable_footprint_sqm`, `max_build_height_m`, `max_build_stories`, `max_build_stories_basis`, `max_build_basis`, `max_buildable_gfa_sqm`, `max_buildable_gfa_basis`, `max_build_confidence`, `max_build_setback_basis`, `max_build_stories_aggressive`, `market_exceeds_bylaw`.

### 12.3 FIX (projection bug — §6.1)
`max_build_width_m`, `max_build_length_m`, `existing_width_m`, `existing_length_m` — recompute via `ST_OrientedEnvelope(ST_Transform(geom,2952))` (+7% length error today).

### 12.4 DEMOTE + RE-LABEL (imagery-derived, ±20–38%, missed maximized builds — keep as flagged fallback only)
| Current | → Proposed | Note |
|---|---|---|
| `existing_footprint_sqm` | `imagery_roof_footprint_sqm` | + `imagery_footprint_confidence`, `imagery_capture_date`; **never drives as-of-right** |
| `existing_gfa_sqm` | `imagery_roof_gfa_sqm` | fallback only |
| `existing_structure_confidence` | keep (= imagery confidence) | |
| `existing_data_quality_flag` | keep | mislink sentinel |

### 12.5 KEEP (position-derived — reliable, the useful part of massing)
`existing_other_structures_count`, `existing_other_structures_sqm`, `existing_greenspace_sqm` (recompute; flag as over-stated where accessories unseen).

### 12.6 RETIRE (already NULL — leave NULL, document; no drop to avoid churn)
`existing_stories`, `existing_height_m`, `cur_basement_gfa_sqm`, `cur_storey_gfa_sqm`, `cur_interior_reno_gfa_sqm`.

### 12.7 REBUILD via optimal-config (recompute from lot-geometry + position + by-law, NOT massing greenspace; fix garage floor §6.2)
`garden_suite_fits`, `garage_permission`, `garage_capacity_cars`, `garage_constraint_reason`, `rear_suite_type`, `rear_suite_permission`, `max_garden_suite_gfa_sqm`, `max_garage_gfa_sqm`, `max_laneway_suite_gfa_sqm`, `max_rear_suite_gfa_sqm`, `envelope_constrained`, `envelope_constraint_reason`.

### 12.8 KEEP scenario/reno (anchor to permit GFA where available, else max-build)
`cur_floor_gfa_sqm`, `cur_pot_2story_gfa_sqm`, `cur_pot_3story_gfa_sqm`, `cur_gfa_range_basis`, `cur_est_kitchen_gfa_sqm`, `cur_est_bath_gfa_sqm`, `max_newbuild_coa_gfa_sqm`.

### 12.9 ADD — new fields
**Permit/CoA authoritative footprint + GFA (the headline new source — §3 hierarchy tier 1):**
`permit_fsi`, `permit_coverage_pct`, `permit_gfa_sqm` (= FSI×lot), `permit_footprint_sqm` (= coverage×lot), `permit_height_m`, `permit_source_ref` (permit#/CoA#), `permit_approved_date`.

**Resolved footprint/GFA (source-hierarchy output):**
`resolved_footprint_sqm`, `resolved_footprint_source` (permit│maxbuild│imagery), `resolved_gfa_sqm`, `resolved_gfa_source`, `footprint_confidence`.

**Position-derived (new reliable signals — open-pocket method §4.4):**
`front_setback_m`, `side_setback_min_m`, `rear_yard_depth_m`, `open_yard_pocket_radius_m`.

**Optimal config (§3.1):** `opt_aor_storeys`, `opt_aor_gfa_sqm`, `opt_aor_units`, `opt_coa_storeys`, `opt_coa_gfa_sqm`, `opt_suite_type`, `opt_suite_fits_full`, `opt_binding_constraint`, `opt_config_confidence`, `optimal_config` (JSONB).

**Nearby builds + comps (§3.3/§3.4):** `nbhd_new_builds_5yr`, `nbhd_coa_approval_pct`, `nbhd_build_ratio`, `nbhd_storeys_typical`, `nbhd_storeys_stretch`, `nearby_builds_summary` (JSONB); `comparable_builds` (JSONB), `comp_count`, `comp_dominant_build`, `comp_build_ratio_p50`.

### 12.10 Footprint/GFA resolution order (encoded in `resolved_*`)
1. **Permit/CoA** `coverage_pct × lot` / `FSI × lot` — authoritative (matched 39/41/43 + MLS).
2. **Max-build** coverage cap — as-of-right ceiling.
3. **Imagery** roof footprint — flagged fallback, position only.

---

---

## 13. Finalized enrich field changes — ADD / RETIRE / RE-LABEL

Consolidates §12 with the permit-ground-truth learnings (companion report §10). **Principle: demote/re-label, don't delete.**

### 13.0 Prerequisite ingest change (not enrich, but feeds it)
`load-permits.js` + `permits` table: **add the unused occupancy floor-area columns** from the CKAN feed we already fetch — `RESIDENTIAL`, `INTERIOR_ALTERATIONS`, `ASSEMBLY`, `INSTITUTIONAL`, `MERCANTILE`, `INDUSTRIAL`, `BUSINESS_AND_PERSONAL_SERVICES` — with junk-value cleaning. Review-folded specifics: **(a)** dedup keeps the **principal row = max `RESIDENTIAL`** per `(permit_num,revision_num)`, NOT the current highest-CKAN-id row (which may be the blank MEP companion → B-9); **(b)** add `RESIDENTIAL` to `CRITICAL_FIELDS` (keep `STOREYS` monitored) so re-drift is caught not silent-0-filled (A-8), and update the `emitMeta` reads-array (L666); **(c)** PRESERVE the Spec 48 §3.6 row-derived cascade (canonical example); new occupancy audit rows use it. `compute-build-norms.js` = **Mutator** (Spec 30), **lock 78**, audit rows + `emitMeta` per Spec 47 §8/§R11; citywide NULL row written even on empty (A-10); `manifest.steps.compute_build_norms` def + `chains.permits` entry beside `compute_storey_norms`.

### 13.1 ADD — new enrich fields

**Permit-sourced (authoritative GFA — tier 1) — these live on the `permits` TABLE, NOT on `parcels`** (review CRIT, consistent with field-spec §D: the typical parcel has no permit; do not bloat `parcels` with ~mostly-NULL permit columns). They feed `neighbourhood_build_norms` (§J) + `comparable_builds` (§K):
| Field (on `permits`) | Source / formula |
|---|---|
| `permit_gfa_sqm` | permit `RESIDENTIAL` (new-build total) |
| `permit_gfa_basis` | `newbuild_total` │ `addition_delta` │ `none` |
| `permit_residential_added_sqm` | `RESIDENTIAL` on additions (the expansion delta) |
| `permit_interior_alt_sqm` | `INTERIOR_ALTERATIONS` (reno scope) |
| `permit_fsi` | = `permit_gfa_sqm ÷ lot_size_sqm` |
| `permit_coverage_pct`, `permit_footprint_sqm` | **on-inquiry only** (plans/PDF; null in bulk) |

**Resolved (source-hierarchy output — what downstream reads):**
`resolved_footprint_sqm`, `resolved_footprint_source` (permit│maxbuild│imagery), `resolved_gfa_sqm`, `resolved_gfa_source`, `footprint_confidence`.

**Position-derived (reliable):** `front_setback_m`, `side_setback_min_m`, `rear_yard_depth_m`, `open_yard_pocket_radius_m`.

**Optimal config:** `opt_aor_storeys`, `opt_aor_gfa_sqm`, `opt_aor_units`, `opt_coa_storeys`, `opt_coa_gfa_sqm`, `opt_suite_type`, `opt_suite_fits_full`, `opt_binding_constraint`, `opt_config_confidence`, `optimal_config` (JSONB).

**Nearby builds + comps:** `nbhd_new_builds_5yr`, `nbhd_coa_approval_pct`, `nbhd_build_ratio`, `nbhd_storeys_typical`, `nbhd_storeys_stretch`, `nearby_builds_summary` (JSONB); `comparable_builds` (JSONB), `comp_count`, `comp_dominant_build`, `comp_build_ratio_p50`.

**Imagery provenance:** `imagery_source` (= City 3D Massing; capture date NOT published and **Google Solar API is not used** — so no `imagery_capture_date`; `footprint_confidence` is derived from link-confidence + over-cap flag, not an imagery date).

### 13.2 RE-LABEL (keep column, change meaning — flagged fallback only)
| Current | → New | Note |
|---|---|---|
| `existing_footprint_sqm` | `imagery_roof_footprint_sqm` | + `imagery_footprint_confidence`; never drives as-of-right |
| `existing_gfa_sqm` | `imagery_roof_gfa_sqm` | fallback only |
| `existing_width_m`/`existing_length_m`, `max_build_width_m`/`max_build_length_m` | (keep names) | **FIX** projection bug (§6.1) |

### 13.3 RETIRE (leave NULL, document as retired — no destructive drop)
`existing_stories`, `existing_height_m` (tree-contaminated), `cur_basement_gfa_sqm`, `cur_storey_gfa_sqm`, `cur_interior_reno_gfa_sqm` (deprecated). **Do NOT use `permits.EST_CONST_COST` for value** (understated + sparse — companion §10.5); value comes from a market-rate $/m² model.

### 13.4 REBUILD (recompute from lot-geometry + position + by-law, not massing greenspace)
`garden_suite_fits`, `garage_permission`, `garage_capacity_cars`, `garage_constraint_reason`, `rear_suite_type`, `rear_suite_permission`, `max_garden/garage/laneway/rear_suite_gfa_sqm`, `envelope_constrained`, `envelope_constraint_reason` (fix garage one-car floor §6.2).

### 13.5 Option → footprint dependency (which options need `resolved_footprint`)
| Needs `resolved_footprint` (interior-reno; present as RANGE, flag "refine on inquiry") | Sized from max-build / by-law (no dependency) |
|---|---|
| Basement reno (± underpinning), 1-floor gut, 2-floor gut, kitchen, bathroom | New build, addition/build-back, laneway suite, garden suite, garage, deck, pool, solar |

Interior-reno GFA = `resolved_footprint × storeys` (storeys from norms/description; footprint ±20% → range).

---

*No code, specs, or migrations have been written. This is the blueprint for the WF1 to formalize.*
