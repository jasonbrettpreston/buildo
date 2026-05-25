# WF1 — Cost Estimation Master Implementation Plan

**Date:** 2026-05-24
**Status:** Final consolidated plan
**Scope:** Consolidates all learnings from the 10 cost-estimation investigations into a single phased implementation plan. **Phase 1 is data foundation (ingestion + computed fields + storeys derivation), with NO impact on cost-estimate calculation.** Cost-model integration is sequenced for later phases once the new data is validated in operator reporting surfaces.

---

## 0. Source investigations consolidated

This plan supersedes and consolidates the 10 prior reports:

| # | Report | Key finding |
|---|---|---|
| 1 | `wf3-cost-model-none.md` | Root cause of 14-day silent regression: matrix vocabulary mismatch |
| 2 | `wf1-cost-matrix-rekey-pis.md` | Pre-implementation investigations for the §3.A re-key (10 PIs executed) |
| 3 | `wf1-cost-matrix-rekey-allocation-mapping.md` | PI-3 production-vocabulary mapping (32 rows seeded by migration 163) |
| 4 | `wf1-cost-accuracy-investigation.md` | Model over-predicts additions 2-30x; under-predicts megaprojects 10-30x; Liar's Gate masks over-prediction |
| 5 | `wf1-gfa-accuracy-investigation.md` | GFA + massing analysis — `permits.storeys = 0` for ALL permits; massing breaks for new construction; 50-250% lot coverage on shared parcels |
| 6 | `wf1-bylaw-heuristic-validation.md` | Bylaw `lot × coverage × floors` heuristic: 15x improvement on megaprojects, 6.6x improvement on laneways, ±25% on SFD |
| 7 | `wf1-toronto-bylaw-investigation.md` | Toronto Zoning By-law 569-2013 mapped per structure type — bylaw-anchored defaults to replace my heuristic guesses |
| 8 | `wf1-reno-build-pattern-investigation.md` | 38% of "Small Residential Projects" SFD permits are reno-builds (9+ trades, $500K+) disguised as alterations |
| 9 | `wf1-cost-estimate-findings.md` | Consolidated findings — 4 independent root causes, 12 ranked actions |
| 10 | `wf1-cost-estimate-master-approach.md` | Best-in-class design — 6 dimensions of variation, 11 GFA paths, 14 work-intent tiers |

---

## 1. Executive summary — the four root causes

| # | Root cause | Magnitude | Affected permits | Fix path |
|---|---|---|---|---|
| RC1 | **Massing data answers "what exists," not "what's being built"** | 10-100x error on new construction | All `New Building × Apartment / Mixed-Use` (~1,500 permits) | Phase 3 — `link-massing` bypass + bylaw GFA path |
| RC2 | **`permits.storeys = 0` for ALL 248,571 permits** (Toronto CKAN publishes NULL) | Compounds RC1 — tall buildings get height = 1 story | All permits | Phase 1 — derive from description text + dwelling_units + structure_type heuristics |
| RC3 | **Toronto's "3-wall renovation" pattern misclassified** | 3-4x UNDER-prediction on reno-builds disguised as alterations | ~12,500 SFD Small Residential Projects (38% of category) | Phase 3 — trade-count + cost + description detector |
| RC4 | **Shared parcels (townhouse/condo): per-unit lot vs whole-building footprint** | 150-250% nonsensical coverage ratios | All townhouse/semi-detached/condo permits | Phase 1 — `feature_type='CONDO'` flag + `parcel_buildings` divisor logic |

**Secondary issues** (Liar's Gate over-prediction, trade-sum > 100%, bylaw-anchored vs guessed defaults) are addressed in Phase 4.

---

## 2. Strategic principle — data first, calculation later

The implementation is sequenced into **4 phases**, with strict separation between **data foundation** (Phases 1-2) and **cost-model changes** (Phases 3-4):

```
PHASE 1: Data foundation                  PHASE 2: Reporting surfaces
├─ Ingest 5 new Toronto Open Data sets    ├─ Lead/permit display: applicable bylaws
├─ Add computed fields on parcels         ├─ Lead/permit display: overlay flags
├─ Derive storeys from description text   ├─ Lead/permit display: lot configuration
└─ Update Spec 43 chain_sources           └─ Audit observability for new fields
                                          (no cost-estimate impact yet)
                                          ↓
PHASE 3: Cost-model integration           PHASE 4: Calibration refinement
├─ Bylaw-anchored coverage/floors         ├─ Trade-sum > 100% investigation
├─ Reno-build detector (Action #9)        ├─ External ground-truth (FOIPP)
├─ New-build GFA path                     ├─ Per-permit-type sub-models
├─ Laneway/garden fixed envelope          └─ Description-text NLP for proposed GFA
├─ Multi-unit divisor
├─ Heritage premium
└─ TRCA setback reduction
```

**Why this sequence:**
- **Operators get rich data immediately** (Phase 2) without risk to cost estimates
- **Data quality is verifiable in the UI** before being trusted by the cost model
- **Cost-model changes (Phase 3) reference data that's already in the DB**, not pending — reduces coupling
- If a new dataset is buggy, the impact is contained to reporting, not numerical estimates

---

## 3. Master approach table (the canonical design)

This is the target state — what the model should do for every permit. Detailed version in `wf1-cost-estimate-master-approach.md` (18 sections).

### 3a. Six dimensions of variation per permit

| Dim | Captures | Phase that adds detection |
|---|---|---|
| A. **Work intent** (14 tiers W0-W13) | maintenance / cosmetic / minor / addition / reno-build / new construction / etc. | Phase 3 (reno-build detector — Action #9) |
| B. **Built form** (22 sub-types BF1-BF22) | SFD detached / semi / townhouse / multiplex / mid-rise / tower / etc. | Already in `permits.structure_type` |
| C. **Zoning class** (18 codes R/RD/RS/RT/RM/RA/CR/CL/CG/E/I/O) | Toronto Zoning By-law 569-2013 zone | **Phase 1.6** (Spec 58 ingest) |
| D. **Overlay modifiers** (12 overlays) | Major Streets / Avenues / Heritage HCD / Heritage Individual / Section 37 / IZ / Multiplex / Garden Suite / Laneway Suite / TRCA / Chapter 900 / Tower-in-the-Park | **Phase 1.3-1.7** (4 Open Data ingests) |
| E. **Lot configuration** (10 types) | standard / corner / through / flag / ravine / heritage / shared / vacant / subdivision / air-rights | **Phase 1** (computed from existing + ingested data) |
| F. **Cost-side modifiers** (8 factors) | income premium / tall-building / heritage / construction tier / soil / labor / phasing / size | Phase 4 |

### 3b. Path selection — the decision tree

| Path code | Condition | GFA formula | Allocation |
|---|---|---|---|
| **G-SKIP** | Trade-specific permit (Plumbing/Mechanical/Drain/Electrical/Demolition) — Spec 83 §3.A(d) | n/a | safe-skip |
| **G-EXISTING** | Standard addition/alteration on existing single-owner property | `footprint × stories` from massing | matrix value (0.10-0.40) |
| **G-EXISTING-DIV** | Addition/alteration on shared parcel (townhouse / semi / condo) | `(footprint × stories) ÷ unit_count` | matrix value |
| **G-BYLAW-STD** | New construction on SFD/multiplex zone | `lot × bylaw_coverage × default_floors` | 1.00 |
| **G-BYLAW-DERIVED** | Megaproject (20+ units, Apartment / Mixed Use) | `lot × coverage × derived_floors` where derived = `ceil(units × unit_sqm / (lot × coverage × efficiency))` | 1.00 |
| **G-BYLAW-FSI** | Tower or high-density CR zone | `lot × FSI_max` (looked up from zoning data) | 1.00 |
| **G-RENO-BUILD** | "Small Residential Projects" with 9+ trades OR $500K+ declared (Finding 7) | Same as G-BYLAW-STD/DERIVED | 1.00 |
| **G-LANEWAY** | Laneway / Rear Yard Suite | `MIN(100 m², lot × 0.20)` | 1.00 |
| **G-GARDEN** | Garden Suite | `MIN(120 m², lot × 0.40 × rear_yard_fraction)` | 1.00 |
| **G-HERITAGE** | Heritage-designated property | Existing form constrained; replace within 5% of existing | varies + heritage premium |
| **G-MIXED-SPLIT** | Mixed-use podium + tower | Commercial podium (low floors × high coverage) + residential tower (FSI-based) | weighted |
| **G-FALLBACK** | All inputs missing | `lot × urban_coverage_ratio × FALLBACK_FLOORS` (current Brain fallback) | matrix value |

### 3c. The cost equation

```
GFA(p)         = pickGfaPath(p)
allocation(p)  = pickAllocation(work_intent(p), structure_type(p), overlays(p))
Area_Eff(p)    = GFA(p) × allocation(p)
Surgical(p)    = Σ over active_trades: Area_Eff × trade_rate × complexity × neighborhood_premium × shell_mult
cost(p)        = LiarsGate(declared(p), Surgical(p))
range(p)       = [cost × (1-r), cost × (1+r)]  where r depends on confidence band
```

---

## 4. Phase 1 — Data foundation (NO cost-estimate impact)

**Goal:** ingest 5 new Toronto Open Data datasets, add computed fields on `parcels`, derive `storeys`, and surface everything in reporting — without touching the cost model.

### 4.1 — Toronto Centreline (streets) → new Spec 62

**Source:** Toronto Open Data CKAN — `toronto-centreline-tcl`
**Purpose:** enables corner-lot, through-lot, frontage-side detection via `ST_Intersects` against parcels.

**New table:** `toronto_centreline (geom geometry(LineString, 4326), street_name, street_type, classification)`
**New script:** `scripts/load-centreline.js`
**Refresh:** annual
**Lock ID:** 62

### 4.2 — TRCA Regulated Areas → new Spec 61

**Source:** TRCA Open Data portal — Regulated Areas polygon dataset
**Purpose:** detect ravine/floodplain lots where 10-30m setback from top-of-bank reduces buildable area.

**New table:** `trca_regulated_areas (geom geometry(MultiPolygon, 4326), regulation_type, jurisdiction)`
**New script:** `scripts/load-trca.js`
**Refresh:** annual
**Lock ID:** 61

### 4.3 — Toronto Heritage Register → new Spec 59

**Source:** Toronto Open Data CKAN — `heritage-register`
**Purpose:** flag heritage-designated properties (Heritage Conservation District membership or Individual Designation).

**New table:** `heritage_register (address, designation_type, hcd_name, designation_date, bylaw_number)`
**New script:** `scripts/load-heritage.js`
**Refresh:** quarterly
**Lock ID:** 59

### 4.4 — Toronto Zoning By-law per-parcel → new Spec 58

**Source:** Toronto Open Data CKAN — `zoning-by-law`
**Purpose:** authoritative `zoning_class` per parcel (R / RD / RS / RT / RM / RA / RAC / CR / CL / CG / E / I subtypes) plus the Chapter 900 exception number if applicable.

**New table:** `zoning_bylaw_areas (geom geometry(Polygon, 4326), zoning_class, exception_number, fsi_max, height_max_m, lot_coverage_max_pct)`
**New script:** `scripts/load-zoning.js`
**Refresh:** quarterly
**Lock ID:** 58

### 4.5 — Toronto Major Streets / Avenues → new Spec 63

**Source:** Toronto Planning Major Streets bylaw map (CKAN if published, otherwise GeoJSON from Planning portal)
**Purpose:** flag properties on major streets where FSI restrictions are removed and avenue/mid-rise built-form policies apply.

**New table:** `major_streets (geom geometry(LineString, 4326), street_name, classification, fsi_exempt boolean)`
**New script:** `scripts/load-major-streets.js`
**Refresh:** annual
**Lock ID:** 63

### 4.6 — Storeys derivation (the storeys=0 fix)

**Root cause:** Toronto's CKAN publishes `STOREYS = NULL` for 100% of permits. This is NOT a code bug. Our `load-permits.js:155` correctly parses NULL → 0 fallback.

**Fix:** derive `storeys` from other signals in a new step:

1. **Description text parsing** — regex on `permits.description` for "X storey", "X-1/2 storey", "X floor":
   ```
   /(\d+)(\s|-)?(1\/2|0\.5|\.5)?\s*(storey|story|stories|floor)/i
   ```
2. **Structure type defaults** when description has no match:
   - SFD detached/semi: 2.5
   - SFD townhouse / multiplex: 3
   - Stacked townhouse: 4
   - Apartment Building: derived from `dwelling_units_created × unit_sqm ÷ (lot × coverage)`
3. **Massing-side fallback** (existing): `building_footprints.estimated_stories` when permit-side derivation fails

**Implementation:**
- New script: `scripts/derive-permit-storeys.js` (runs once during chain after `load-permits`)
- New column: `permits.derived_storeys integer` (separate from the raw `storeys` field — preserves data lineage)
- Audit row: `derived_storeys_coverage_pct` per chain run

This is a **derivation**, not an ingestion fix. Toronto doesn't publish the data; we infer it.

### 4.7 — New computed fields on `parcels` table

After all new sources are ingested, add a `link-parcels-enrichment.js` step that populates these fields via spatial joins:

| New column | Type | Derivation | Phase 1 sub-step |
|---|---|---|---|
| `corner_lot` | boolean | `parcels.geom` touches ≥ 2 distinct `toronto_centreline.street_name` records at edge | 4.1 |
| `through_lot` | boolean | Touches streets on opposite sides of polygon | 4.1 |
| `frontage_street` | text | Primary street name (highest classification / most frontage length) | 4.1 |
| `in_trca_regulated` | boolean | `ST_Intersects(parcels.geom, trca_regulated_areas.geom)` | 4.2 |
| `trca_setback_area_sqm` | numeric | `ST_Area(ST_Intersection(parcels.geom, trca_regulated_areas.geom))` × adjusted setback | 4.2 |
| `is_heritage` | boolean | Address match against `heritage_register` | 4.3 |
| `heritage_designation_type` | text | `'HCD'` / `'Individual'` / `'Easement'` | 4.3 |
| `heritage_hcd_name` | text | HCD area name if applicable | 4.3 |
| `zoning_class` | text | Spatial join against `zoning_bylaw_areas` | 4.4 |
| `zoning_exception_number` | text | Chapter 900 reference if applicable | 4.4 |
| `bylaw_max_coverage_pct` | numeric | From `zoning_bylaw_areas.lot_coverage_max_pct` for the zone | 4.4 |
| `bylaw_max_height_m` | numeric | From `zoning_bylaw_areas.height_max_m` | 4.4 |
| `bylaw_max_fsi` | numeric | From `zoning_bylaw_areas.fsi_max` | 4.4 |
| `on_major_street` | boolean | Parcel adjacent to a major street | 4.5 |
| `fsi_exempt` | boolean | On a major street where FSI rules are exempted | 4.5 |
| `flag_lot` | boolean | Geometric (existing data): `is_irregular AND frontage_m/depth_m < 0.15` | Now (no new ingest) |
| `vacant_lot` | boolean | Computed (existing data): `NOT EXISTS primary parcel_buildings` | Now (no new ingest) |
| `is_condo_common_element` | boolean | Direct: `feature_type = 'CONDO'` | Now (no new ingest) |

Each new column gets a `*_classified_at` timestamp for lineage.

### 4.8 — New computed fields on `permits` (per-permit overlay summary)

| New column | Type | Derivation | Used by |
|---|---|---|---|
| `applicable_bylaws` | jsonb | Array of bylaw rules that apply (base zoning + overlays) | Reporting (Phase 2) |
| `overlay_summary` | jsonb | `{ heritage, trca, major_street, multiplex_eligible, laneway_eligible, garden_suite_eligible }` | Reporting |
| `lot_configuration` | text | One of: `standard / corner / through / flag / ravine / heritage / shared / vacant / condo` | Reporting + future cost-model |
| `derived_storeys` | integer | Derived per §4.6 | Reporting + future cost-model (Phase 3) |

These are **READ-ONLY DERIVED** — never edited directly. Recomputed on each pipeline run from upstream sources.

### 4.9 — Update Spec 43 (chain_sources)

Add the 5 new ingest steps to the `chain_sources` pipeline:

```
Existing chain_sources steps:
  1. load_permits
  2. load_coa
  3. load_wsib
  4. load_aic_inspections
  5. load_address_points
  6. load_parcels
  7. load_massing
  8. load_neighbourhoods

ADD (Phase 1):
  9. load_zoning              (Spec 58)
 10. load_heritage             (Spec 59)
 11. load_trca                 (Spec 61)
 12. load_centreline           (Spec 62)
 13. load_major_streets        (Spec 63)
 14. enrich_parcels            (computes new fields per §4.7 using ingested data + parcels.geom)
 15. derive_permit_storeys     (computes derived_storeys per §4.6)
 16. enrich_permits            (computes applicable_bylaws + overlay_summary per §4.8)
```

Note: steps 14-16 are **enrichment** (downstream of ingestion) and should run AFTER all the load steps complete. They're idempotent and re-run on each chain pass.

### 4.10 — Phase 1 deliverables checklist

| # | Deliverable | Type | Effort |
|---|---|---|---|
| 1 | Spec 58 — Toronto Zoning By-law | New spec | 0.5 day write |
| 2 | Spec 59 — Toronto Heritage Register | New spec | 0.5 day write |
| 3 | Spec 61 — TRCA Regulated Areas | New spec | 0.5 day write |
| 4 | Spec 62 — Toronto Centreline | New spec | 0.5 day write |
| 5 | Spec 63 — Toronto Major Streets | New spec | 0.5 day write |
| 6 | **Spec 64 — Toronto Design Standards (constants)** | **New spec** | **1 day write** (citation-heavy: bylaw sections, TGS tiers, design guidelines, OBC refs) |
| 7 | Update Spec 43 chain_sources | Spec edit | 0.5 day |
| 8 | `scripts/load-zoning.js` + migrations | Code | 1.5 days |
| 9 | `scripts/load-heritage.js` + migrations | Code | 1.5 days |
| 10 | `scripts/load-trca.js` + migrations | Code | 1.5 days |
| 11 | `scripts/load-centreline.js` + migrations | Code | 1.5 days |
| 12 | `scripts/load-major-streets.js` + migrations | Code | 1 day |
| 13 | **Add Spec 64 constants to `logic_variables.json` + DB seed migration** (~25-40 new keys: ancillary costs, landscaping minimums, TGS thresholds, glazing ratios, exemption rules) | Code | 1 day |
| 14 | `scripts/derive-permit-storeys.js` + migration (new column) | Code | 1-2 days |
| 15 | `scripts/enrich-parcels.js` (spatial joins for new computed fields) + migration | Code | 2 days |
| 16 | `scripts/enrich-permits.js` (applicable_bylaws, overlay_summary, lot_configuration, derived_storeys join) + migration | Code | 1.5 days |
| 17 | Audit rows in observability for each new field's populate rate | Code | 0.5 day |

**Phase 1 total: ~15-17 days of focused engineering** (across 5 new polygon ingests + 1 constants spec + 3 enrichment steps + 6 specs).

**Note on Spec 64 sequencing:** Spec 64 can be written and seeded INDEPENDENTLY of the 5 polygon ingests (no spatial dependencies). It's listed in Phase 1 for cohesion but can be split into its own mini-WF if scheduling demands.

---

## 5. Phase 2 — Reporting surfaces (NO cost-estimate impact)

**Goal:** make the new data visible to operators via the admin UI and chain audit reports, so the data can be QA'd before being trusted by the cost model.

### 5.1 — Lead/permit detail page

For every permit displayed in the admin lead inspector (Spec 88 `/admin/leads/[id]`), add a new "Property Context" section showing:

```
Property Context
────────────────
Address:              123 Example St
Parcel:               5151326 (COMMON; not irregular)
Lot size:             382 m² | 11.5m × 33.2m
Zoning:               R (Residential Detached) — base coverage 35%, max 10m height
Lot configuration:    Standard rectangular
Heritage status:      No
TRCA jurisdiction:    No
Major street:         No (Eglinton Ave 200m away)
Applicable bylaws:    Toronto Bylaw 569-2013 §10.20 (RD zone)
                      OPA 649 multiplex bylaw (eligible)
                      Garden Suite Bylaw 89-2022 (eligible)
                      Laneway Suite Bylaw §150 (NOT eligible — no public lane)
Overlays:             None
```

This makes Phase 1 data immediately useful WITHOUT any cost-model coupling.

### 5.2 — Pipeline audit observability

For each new computed field, add an `audit_table` row in the enrichment step:

| Audit row | Threshold | Meaning |
|---|---|---|
| `zoning_class_coverage_pct` | ≥ 95% | % of parcels with a populated `zoning_class` |
| `heritage_match_count` | INFO | Number of parcels matched to Heritage Register |
| `trca_match_count` | INFO | Number of parcels intersecting TRCA |
| `major_street_match_count` | INFO | Number of parcels on major streets |
| `corner_lot_count` | INFO | Number of corner lots identified |
| `derived_storeys_coverage_pct` | ≥ 90% | % of permits with `derived_storeys > 0` |
| `lot_configuration_distribution` | INFO | JSON breakdown by category |

OB-2-style FAIL escalation if a coverage drops to 0% (catches an ingestion regression — same pattern as the WF1 §3.A re-key).

### 5.3 — Operator validation period

Run Phase 1 + 2 in production for **2-4 weeks** before starting Phase 3. Operators QA:
- Are heritage matches accurate?
- Does TRCA coverage match known ravine-adjacent properties?
- Does zoning_class match Toronto's interactive zoning map?
- Are derived storeys plausible?

Surface any discrepancies as feedback in the report sidebar. Fix data ingestion or derivation logic before any cost-model code reads the new fields.

---

## 6. Phase 3 — Cost-model integration (uses Phase 1 data)

Only after Phase 1 + 2 validation complete:

| # | Action | Source root cause | Effort |
|---|---|---|---|
| 3.1 | Replace heuristic coverage/floors defaults with **bylaw-anchored values from `parcels.bylaw_max_*`** (Phase 1 §4.4) | Bylaw-anchored defaults (was: my guesses) | 1 day |
| 3.2 | Add **reno-build detector** (`effectivePermitScope()`) using trade count + cost + description | RC3 | 1-2 days |
| 3.3 | **New-build GFA path** (`G-BYLAW-STD` / `G-BYLAW-DERIVED`): use `parcels.bylaw_max_*` + `permits.dwelling_units_created` + `permits.derived_storeys` | RC1 + RC2 | 2-3 days |
| 3.4 | **Laneway / garden suite fixed envelope** path (`G-LANEWAY` / `G-GARDEN`) | RC1 (laneway sub-case) | 1 day |
| 3.5 | **Multi-unit divisor** (Action #11): `parcels.feature_type='CONDO'` + `dwelling_units_created > 1` → divide footprint by unit count | RC4 | 1-2 days |
| 3.6 | **Heritage premium** (1.3-2.0x) when `parcels.is_heritage = true` | Cost-side modifier F | 0.5 day |
| 3.7 | **TRCA setback subtraction** from `lot_size_sqm` when `parcels.in_trca_regulated = true` | Overlay D | 0.5 day |
| 3.8 | **FSI-exempt path** for Major-Streets / Multiplex (use FSI from `parcels.bylaw_max_fsi`) | Overlay D | 1 day |
| 3.9 | **Story divisor by structure_type** for the 3m assumption (commercial 3.6m, industrial 6m) | Caveat 1 from bylaw investigation | 0.5 day |

**Phase 3 total: ~10-12 days** — all building on Phase 1 data.

---

## 7. Phase 4 — Calibration refinement (longer-term)

| # | Action | Effort |
|---|---|---|
| 4.1 | Investigate trade-sum > 100% in `computeSurgicalTotal` (Finding 5) | 0.5-1 day |
| 4.2 | Cost estimate accuracy monitoring (MAPE per combo as audit row) | 0.5 day |
| 4.3 | External ground-truth calibration via FOIPP / news data | 2-4 weeks |
| 4.4 | `permits.description` NLP parsing for proposed GFA / dwelling-unit / storey signals | 1-2 weeks |
| 4.5 | Per-permit-type sub-models (separate paths for SFD vs apartment vs commercial) | 1-2 weeks |

---

## 8. New spec list

| Spec # | Name | Source | Purpose |
|---|---|---|---|
| **58** | source_zoning_bylaw | Toronto CKAN `zoning-by-law` | Per-parcel zoning class + base coverage/height/FSI (POLYGON dataset) |
| **59** | source_heritage_register | Toronto CKAN `heritage-register` | HCD + Individual + Easement designations |
| **61** | source_trca_regulated_areas | TRCA Open Data | Ravine/floodplain setback areas (skip 60 since taken by shared_steps) |
| **62** | source_toronto_centreline | Toronto CKAN `toronto-centreline-tcl` | Street network for corner/through/frontage detection |
| **63** | source_major_streets | Toronto Planning Major Streets | FSI-exempt + avenue policy parcels |
| **64** | toronto_design_standards | Bylaw 569-2013 §150-152 + TGS + Tall/Mid-Rise Design Guidelines + Bylaw 89-2022 (Garden Suite) + Bylaw §150 (Laneway) + Ontario Building Code §9.7 + Fences Bylaw Ch.447 | **CONSTANTS spec (no polygon ingest)** — seeds `logic_variables` with citywide design rules: hard/soft landscaping ratios, ancillary structure typical costs (decks, porches, garages, sheds, pools, fences, retaining walls, pergolas), TGS Tier 1/2/3 thresholds, glazing ratios, window minimums, ancillary 20% combined cap. Operator-tunable via Spec 86 Control Panel. |

**Spec naming convention:** follow `50_source_permits.md` pattern for source ingest specs (58, 59, 61, 62, 63). Each includes:
- Goal & User Story
- Data Source (URL, format, schedule, script, lock ID)
- Target Table schema with column-by-column source map
- Idempotency + refresh policy
- Operating Boundaries (Target Files, Out-of-Scope, Cross-Spec Dependencies)

**Spec 64 is structurally different** — it's a **constants spec**, not a polygon-ingest spec. It seeds `logic_variables` from regulatory text/PDFs rather than from a CKAN dataset. Pattern is closer to the existing `logic_variables.json` seed approach. No spatial join, no per-parcel data — values apply citywide (with structure_type-specific variation).

Skipping #60 because `60_shared_steps.md` already exists for cross-source pipeline orchestration helpers.

---

## 9. Updated Spec 43 (chain_sources)

Add a new section after the existing chain enumeration:

```markdown
### Enrichment steps (added 2026-Q3)

After all `load-*` steps complete, the chain runs three enrichment steps that
spatially join the new datasets into the operational tables:

| Step | Script | Reads | Writes |
|---|---|---|---|
| `derive_permit_storeys` | scripts/derive-permit-storeys.js | permits.description, structure_type, dwelling_units_created | permits.derived_storeys |
| `enrich_parcels` | scripts/enrich-parcels.js | parcels.geom + zoning + heritage + trca + centreline + major_streets | parcels: corner_lot, through_lot, in_trca_regulated, trca_setback_area_sqm, is_heritage, heritage_designation_type, heritage_hcd_name, zoning_class, zoning_exception_number, bylaw_max_coverage_pct, bylaw_max_height_m, bylaw_max_fsi, on_major_street, fsi_exempt, flag_lot, vacant_lot, is_condo_common_element |
| `enrich_permits` | scripts/enrich-permits.js | permits + parcels (enriched) + permit_parcels | permits: applicable_bylaws (jsonb), overlay_summary (jsonb), lot_configuration (text) |
```

The 3 enrichment steps are pure DB joins — no external network calls. Idempotent. Re-run on every chain pass.

---

## 10. Why this separation matters

| Without the separation | With the separation |
|---|---|
| New data sources land AND cost-model changes simultaneously — operators can't tell if a cost change is from a data bug or a logic change | Data lands first; operators QA in reporting; cost-model changes are isolated to logic |
| If TRCA data is mis-mapped, cost estimates silently break for hundreds of premium-area leads | Mis-mapping is visible in reporting; cost model is untouched |
| Heritage Register false positives propagate into 100% cost over-estimates (1.3-2.0x multiplier) | False positives surface in the heritage flag on the lead detail page; operators can flag for fix before cost-model integration |
| Stories derivation bug affects every cost estimate immediately | Stories derivation lives in `permits.derived_storeys` column; cost model still uses old logic until Phase 3 |

This is the same architectural principle as the WF1 v3 plan's HALT GATE — data first, behavior change second.

---

## 11. Implementation effort summary

| Phase | Scope | Effort | Risk |
|---|---|---|---|
| Phase 1 | 5 new data sources + storeys derivation + 3 enrichment steps + 5 specs | ~14-15 days | Low — pure ingestion, no behavior change |
| Phase 2 | Lead detail UI + audit observability + 2-4 week validation period | ~5 days code + 2-4 weeks calendar | Low — read-only display |
| Phase 3 | Cost-model integration (9 sub-tasks) | ~10-12 days | Medium — touches cost estimates |
| Phase 4 | Calibration + monitoring + external ground truth | ~3-5 weeks | Low — incremental refinement |

**End-to-end total: ~6-9 weeks of engineering + 2-4 weeks of validation.**

---

## 12. What success looks like

After Phase 1 + 2 complete, an operator inspecting any lead should see:
- The exact bylaw class (`R / RD / RS / RT / RM / RA / RAC / CR / CL / CG / E / I`)
- Whether any overlays apply (heritage, TRCA, major streets, multiplex eligibility)
- Lot configuration (standard / corner / flag / shared / vacant / etc.)
- The derived stories count from description text
- All applicable bylaws as a structured list

After Phase 3 complete, cost estimates should:
- Land within ±30% MAPE for SFD additions (vs current ±2-3x)
- Land within ±30% MAPE for megaprojects (vs current 10-30x under)
- Correctly identify reno-builds (38% of SFD Small Resid Proj re-bucketed)
- Use bylaw-anchored, operator-validated defaults instead of my heuristic guesses

After Phase 4 complete, the model should have:
- MAPE per combo emitted as audit row (regression-detectable)
- External ground-truth validation cycle established
- Trade-sum invariant either fixed or documented as intentional

---

## 13. Risks and dependencies

| Risk | Likelihood | Mitigation |
|---|---|---|
| Toronto CKAN changes a dataset format mid-pipeline (like the 2026-05-20 Property Boundaries strip) | MEDIUM | Use the existing `*-csv-drift.js` pattern (see Spec 55 §`parcels-csv-drift.js`) for every new ingest |
| TRCA open data has license restrictions for redistribution | LOW | Confirm license terms before ingest; document in Spec 61 |
| Heritage Register address matching has high false-positive rate | MEDIUM | Use multi-field match (number + normalized street name + neighbourhood); Phase 2 validation period catches issues before Phase 3 |
| Zoning data with Chapter 900 exceptions is huge (thousands of exceptions) | MEDIUM | Ingest base zone + exception_number as separate columns; store exception text in a side table for reference |
| Storeys derivation from description text has < 90% accuracy on first pass | MEDIUM | Iterate regex; supplement with structure_type defaults; OK to ship at 75% in Phase 1, refine in Phase 4 |
| Spec 43 chain_sources update conflicts with parallel WF | LOW | Coordinate via WF1 plan ceremony |

---

## 14. Open questions for operator decision

Before scoping the WF for Phase 1, decide:

1. **TRCA data licensing** — confirm we can redistribute the regulated-area polygons within our admin UI / lead exports
2. **Heritage matching tolerance** — accept fuzzy-address matches (e.g., "123 Example St" matches "123 Example Street")? Or require exact?
3. **Zoning Chapter 900 exceptions** — ingest the full text of every exception (large), or just the exception number with a link to Toronto's bylaw page?
4. **Storeys derivation Phase 1 acceptance threshold** — ship at 75% coverage and iterate, or hold for 90%?
5. **Major Streets dataset** — does Toronto publish a clean CKAN version, or do we need to scrape the Planning portal's GeoJSON?

---

## 15. Source documents

All 10 investigations + the master design + spec references live under `docs/reports/` and `docs/specs/`:

| Path | Purpose |
|---|---|
| `docs/reports/wf3-cost-model-none.md` | Phase A investigation that started the WF1 |
| `docs/reports/wf1-cost-matrix-rekey-pis.md` | The 10 PIs executed before §3.A re-key |
| `docs/reports/wf1-cost-matrix-rekey-allocation-mapping.md` | PI-3 mapping (32 production-vocab rows) |
| `docs/reports/wf1-cost-accuracy-investigation.md` | Per-combo cost distribution + MAPE + Liar's Gate analysis |
| `docs/reports/wf1-gfa-accuracy-investigation.md` | GFA + massing + stories + residential coverage analysis (Lens A-L) |
| `docs/reports/wf1-bylaw-heuristic-validation.md` | `lot × coverage × floors` heuristic validation |
| `docs/reports/wf1-toronto-bylaw-investigation.md` | Toronto Zoning By-law 569-2013 sourced defaults |
| `docs/reports/wf1-reno-build-pattern-investigation.md` | Reno-build pattern (Finding 7) detection signals |
| `docs/reports/wf1-cost-estimate-findings.md` | Consolidated findings — 4 root causes, 12 actions |
| `docs/reports/wf1-cost-estimate-master-approach.md` | Best-in-class design — 18 sections, 6 dimensions, 11 paths |
| **This document** | **Master implementation plan — supersedes all above for execution sequencing** |
| `docs/specs/01-pipeline/43_chain_sources.md` | Update target (§4.9) |
| `docs/specs/01-pipeline/55_source_parcels.md` | Reference pattern for new source specs |
| `docs/specs/01-pipeline/83_lead_cost_model.md` | Brain spec — updated by Phase 3 |
| `docs/specs/01-pipeline/58_source_zoning_bylaw.md` | NEW (Phase 1.4) — narrow scope (polygons only) |
| `docs/specs/01-pipeline/59_source_heritage_register.md` | NEW (Phase 1.3) |
| `docs/specs/01-pipeline/61_source_trca_regulated_areas.md` | NEW (Phase 1.2) |
| `docs/specs/01-pipeline/62_source_toronto_centreline.md` | NEW (Phase 1.1) |
| `docs/specs/01-pipeline/63_source_major_streets.md` | NEW (Phase 1.5) |
| `docs/specs/01-pipeline/64_toronto_design_standards.md` | NEW (Phase 1, parallel) — TGS + landscaping + ancillary structure costs + design constants — seeds `logic_variables`, NOT polygon ingest |
