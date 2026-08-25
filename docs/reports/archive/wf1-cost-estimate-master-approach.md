# Cost Estimate — Best-in-Class Master Approach

**Date:** 2026-05-24
**Purpose:** The complete design reference for how Buildo estimates construction cost. Captures every structural distinction, bylaw subtlety, and path differentiation in the model — independent of current implementation state.

---

## 1. Six dimensions of variation

Cost varies along six independent dimensions. The model must classify each permit on every dimension and route to the right path.

| Dimension | Values | Why it matters |
|---|---|---|
| **A. Work intent** | maintenance / cosmetic / single-trade swap / interior reno / addition / substantial reno / reno-build / new construction / density expansion / heritage retention | Scope-fraction-of-GFA varies 100x across these |
| **B. Built form** | SFD detached / SFD semi / SFD townhouse / stacked townhouse / multiplex (2-6 units) / low-rise apt / mid-rise apt / high-rise apt+tower / mixed-use podium+tower / office / retail / industrial / institutional / hotel / laneway / garden suite | $/m² and trade composition vary by form |
| **C. Zoning class** | R / RD / RS / RT / RM / RA (1/2/C) / CR (1/2/3) / CL / CG / E0–EH / I (B/E/H) / O / multiplex-eligible overlays | Bylaw envelope (coverage, height, FSI) caps the buildable GFA |
| **D. Overlay modifiers** | Major-streets / Avenues / Heritage Conservation District / Individual Heritage / Section 37 bonusing / Inclusionary zoning / Tower-in-the-park / Chapter 900 exception / Multiplex / Laneway+Garden eligibility / TRCA ravine setbacks | Can raise OR lower the base zone caps significantly |
| **E. Lot configuration** | Standard / corner / through / flag / ravine / heritage / shared (per-unit) / under-subdivision / air-rights / stratified | Changes effective lot size, coverage interpretation, setbacks |
| **F. Cost-side modifiers** | Neighborhood income tier / construction tier (high-end vs mid vs basic) / height premium (tower-rate) / heritage retention premium / soil conditions / labor market | Multiplies the $/m² rate after GFA is established |

The master approach derives a single cost estimate by:
1. Classifying the permit on each dimension
2. Picking a GFA path (Section 4)
3. Applying an allocation (Section 5)
4. Multiplying by per-trade rates with modifiers (Section 6)
5. Reconciling against declared cost via Liar's Gate (Section 7)

---

## 2. Permit work-intent taxonomy (Dimension A)

This taxonomy is what the Scope Classifier produces. It's finer-grained than the raw `permits.permit_type` field — derived from `permit_type` + `active_trade_slugs` + `est_const_cost` + description-text signals.

| Tier | Work intent | Trade-count signal | Cost signal | Description signal | Typical GFA fraction |
|---|---|---|---|---|---|
| W0 | Pure maintenance | 0-1 trades | < $5K | "repair", "replace", "leak", "service" | 0 — safe-skip |
| W1 | Cosmetic interior | 1-2 trades (paint, flooring) | $5K-$25K | "interior alteration", "painting" | 0.02-0.05 |
| W2 | Single-trade swap | 1 trade (HVAC, electrical panel, water heater) | $5K-$50K | "replace furnace", "panel upgrade", trade-specific permit_type | trade-direct, not GFA-based |
| W3 | Multi-trade minor (kitchen / bath) | 3-5 trades | $25K-$150K | "kitchen renovation", "bathroom" | 0.05-0.15 |
| W4 | Standard alteration | 4-6 trades | $50K-$300K | "interior alteration", "minor addition" | 0.15-0.25 |
| W5 | Major addition | 6-8 trades | $150K-$750K | "rear addition", "second storey addition", "third storey" | 0.30-0.50 |
| W6 | Substantial / gut renovation | 7-9 trades | $300K-$1M | "gut renovation", "down to studs", "complete renovation" | 0.50-0.80 |
| W7 | **Reno-build** (disguised new build) | **9+ trades** | **$500K-$5M+** | "demolition + addition + interior alterations", "3 walls retained", description lists EVERY floor + all trades | **0.85-1.00** — treat as new build |
| W8 | New construction (primary structure) | 9-14 trades | varies | `permit_type IN ('New Building','New Houses','Residential Building Permit')` | 1.00 |
| W9 | Density expansion (multiplex conversion) | 7-10 trades | $300K-$2M | "convert to duplex/triplex/fourplex", multiplex bylaw applicable | 0.60-0.90 |
| W10 | Mixed-use / institutional megaproject | 12-20+ trades | $20M+ | High dwelling_units_created, institutional permit_type | 1.00 (full envelope) |
| W11 | Laneway / garden suite (ADU) | 6-10 trades | $150K-$500K | structure_type explicitly identifies | n/a — fixed envelope, not lot-derived |
| W12 | Heritage retention rebuild | 9-14 trades | premium 30-100% over W7/W8 | "heritage conservation", "facade retention", "designated property" | 1.00 with heritage premium |
| W13 | Trade-specific (Plumbing/Mechanical/Drain/Electrical/Demolition) | 0 (the trade is the permit) | varies | `permit_type IN ('Plumbing(PS)','Mechanical(MS)','Drain and Site Service','Demolition Folder (DM)','Electrical')` | 0 — safe-skip per §3.A(d) |

**Classifier produces a work-intent tier per permit. The tier drives Steps 1 (GFA path) and 2 (allocation).** Some permits may match multiple tiers — pick the highest tier that fits (e.g., a permit with 10 trades AND $1M cost AND "rebuild" keyword → W7 reno-build, not W4 standard alteration).

---

## 3. Built-form taxonomy (Dimension B)

Mapping `permits.structure_type` to a built form. Each form has its own typical envelope, typical unit size, and trade composition.

| Form code | Built form | structure_type values | Typical envelope | Typical unit area | $/m² ballpark (Toronto 2026) |
|---|---|---|---|---|---|
| BF1 | Detached SFD | `SFD - Detached` | 200-400 m² GFA, 2-3 storeys | 200-400 m² (whole building) | $2,500-$4,000 |
| BF2 | Semi-detached SFD | `SFD - Semi-Detached` | 150-300 m² per unit, 2-3 storeys | 150-300 m² | $2,500-$3,800 |
| BF3 | Row/SFD townhouse | `SFD - Townhouse` | 120-250 m² per unit, 3 storeys | 120-250 m² | $2,400-$3,600 |
| BF4 | Stacked townhouse | `Stacked Townhouses` | 80-150 m² per unit, 4 storeys | 80-150 m² | $2,800-$4,000 |
| BF5 | Multiplex (2-6 units) | `2 Unit - Detached/Semi`, `3+ Unit - Detached`, multiplex-converted SFDs | 250-500 m² total, 3 storeys (10m cap) | 80-150 m² per unit | $2,800-$4,200 |
| BF6 | Low-rise apt (2-4 storeys) | `Multiple Unit Building` (small) | 1,500-5,000 m² total | 60-100 m² per unit | $3,000-$4,200 |
| BF7 | Mid-rise apt (5-12 storeys) | `Multiple Unit Building` (mid), `Apartment Building` (mid) | 5,000-25,000 m² | 60-90 m² per unit | $3,200-$4,500 |
| BF8 | High-rise apt (13-39 storeys) | `Apartment Building` (high), `Apartment Hotel` | 15,000-60,000 m² | 50-80 m² per unit | $3,800-$5,500 |
| BF9 | Tall tower (40+ storeys) | `Apartment Building` (supertall), `Mixed Use/Res w Non Res` (tower) | 40,000-150,000+ m² | 50-75 m² per unit | $4,500-$7,000 |
| BF10 | Mixed-use podium + tower | `Mixed Use/Res w Non Res` | Podium 5,000-15,000 m² (commercial) + tower (residential) | Split commercial/residential | $3,500-$6,000 weighted |
| BF11 | Office (low/mid-rise) | `Office`, `Medical/Dental Office` | 500-15,000 m² | n/a (commercial lease) | $2,800-$4,500 |
| BF12 | Office (tower) | `Office` (CR3+) | 20,000-100,000 m² | n/a | $4,000-$6,500 |
| BF13 | Retail (small) | `Retail Store`, `Restaurant 30 Seats or Less`, `Restaurant Greater Than 30 Seats` | 100-2,000 m², 1-2 storeys | n/a | $2,500-$4,500 |
| BF14 | Retail (large / mall) | `Retail Mall/Plaza`, `Multiple Use/Non Residential` | 5,000-30,000 m² | n/a | $2,500-$4,000 |
| BF15 | Industrial / warehouse | `Industrial` | 1,000-30,000 m², 1 storey high-ceiling | n/a | $1,500-$2,800 |
| BF16 | Institutional — schools | `Elementary School`, `University` | 2,000-20,000 m² | n/a | $3,500-$5,500 (specialized) |
| BF17 | Institutional — healthcare | `Hospital` | 5,000-100,000+ m² | n/a | $5,000-$9,000 (specialized — mechanical-heavy) |
| BF18 | Institutional — civic / religious | `Place of Worship` | 500-5,000 m² | n/a | $2,800-$5,000 |
| BF19 | Laneway suite | `Laneway / Rear Yard Suite` | 60-100 m² total (fixed envelope) | one unit | $3,500-$6,500 (premium for separate utilities) |
| BF20 | Garden suite | `Laneway / Rear Yard Suite` (subset) | 40-120 m² total | one unit | $3,500-$6,500 |
| BF21 | Hybrid (existing converted) | `Converted House`, `Mixed Use/Res w Non Res` (small) | Variable | Variable | depends on conversion scope |
| BF22 | Unknown / other | `Unknown`, `Other`, `Multiple Use/Non Residential` (ambiguous) | fall back to neighborhood-typical | — | $2,500-$3,500 (conservative) |

**Each built form gets its own envelope baseline + cost rate.** The `$/m² ballpark` column is the operator-tunable input — these become entries in the `typical_construction_rate` logic_variable table.

---

## 4. Zoning class taxonomy (Dimension C) — Toronto Bylaw 569-2013

Toronto's zoning hierarchy. The zone determines maximum coverage, height, and FSI for buildable envelope.

| Zone code | Zone name | Permits | Max coverage | Max height / storeys | Max FSI | Bylaw |
|---|---|---|---|---|---|---|
| **R** | Residential (generic) | Pre-amalgamation legacy | 35-40% | 9-10m / 2.5-3 | 0.45-0.60 | 10.5 |
| **RD** | Residential Detached | Single detached only (base) | **35%** | 7.2m flat / **10m peaked** / 2.5-3 storeys | **0.45** typical | 10.20 |
| **RS** | Residential Semi-Detached | Semi-detached pairs | **35-40%** | Similar to RD | similar | 10.40 |
| **RT** | Residential Townhouse | Row townhouses | **60%** | **12m / 3-4 storeys** | No FSI (60% upper-storey platform cap) | 10.60 |
| **RM** | Residential Multiple | Townhouses, walk-ups, small apts | 40-60% (overlay) | varies (overlay) | 1.0-2.5 (overlay) | 10.80 |
| **RA** | Residential Apartment (base) | Apartment buildings | **70%** | varies — base low/mid-rise | **2.0-4.0+** | 15.10 |
| **RAC** | Residential Apartment Commercial | RA + ground-floor commercial | 70-80% | varies | 2.0-5.0 | 15.20 |
| **R Multiplex** | Any R zone post-2023 multiplex bylaw | 2-6 units in RD/RS/RT | base zone coverage | **10m / 3 storeys** | **FSI EXEMPT** | OPA 649 (2023+) |
| **CR** | Commercial Residential (low) | Low-rise mixed-use | 60-70% | 10.5m min / 3+ storeys | **1.0-3.0** (e.g., CR1, CR2) | 40.10 |
| **CR3+** | Commercial Residential (high) | Mid/high-rise mixed-use | 75-80% | varies | **3.0-6.0+** | 40.10 + Avenues |
| **CL** | Commercial Local | Strip/neighborhood retail | 50-60% | 10-15m / 2-4 storeys | 1.0-1.5 | 30.10 |
| **CG** | Commercial General | General commercial | 60-70% | varies | 1.5-3.0 | 30.10 |
| **E0 / EL** | Employment Light Industrial | Office-park-style industrial | 50-60% | 12-15m / 2-3 storeys | 1.0-1.5 | 60 |
| **EM** | Employment Mid Industrial | Manufacturing / warehouse | 60% | 15-20m high-ceiling 1-2 storeys | 1.0-1.5 | 60 |
| **EH** | Employment Heavy Industrial | Heavy industrial | 60-70% | 20-30m / 1-2 storeys | 1.0-2.0 | 60 |
| **I** | Institutional (generic) | Schools, hospitals, civic | varies | varies | varies | 50.10 |
| **IB** | Institutional Block | Large hospital / university campuses | 60-70% | 30-100m | 3.0-6.0 | 50.20 |
| **IE** | Institutional Education | Schools | 40-50% | 12-15m / 2-3 storeys | 1.0-2.0 | 50.30 |
| **IH** | Institutional Healthcare | Hospitals | 60-70% | varies (high) | 3.0-6.0+ | 50.40 |
| **O** | Open Space | Parks, golf, ravines | 0-5% | low | very low | 70 |

**We don't have `parcels.zoning_class` in our DB today** (Action #10 to ingest from Toronto Open Data). Without it, we **proxy the zone via `structure_type`** — this is an approximation that works for ~80% of permits but breaks for outliers (e.g., a house on a CR3 zone wanting to expand mid-rise).

---

## 5. Overlay modifiers (Dimension D)

Layers that ADD to or modify base zone caps.

| Overlay | Effect | When it applies | Where to detect |
|---|---|---|---|
| **Major Streets Bylaw (2024)** | FSI EXEMPT for residential; can build to envelope cap; height per Avenues policy | Properties on designated major streets (Yonge, Eglinton, Bloor, Dundas, Queen, etc.) | Need new ingest: Toronto Major Streets dataset → `parcels.on_major_street` |
| **Avenues policy** | Mid-rise built-form encouraged: 6-12 storeys, 80% coverage | Designated avenues (subset of major streets) | Avenues map (Toronto Planning) |
| **Heritage Conservation District (HCD)** | Forces facade retention, limits demolition, constraints on additions visible from street | Properties in HCD boundaries (Cabbagetown, Garden District, etc.) | Toronto Heritage Register CKAN |
| **Individual Heritage Designation** | Forces retention of designated features; major alterations require HPRC approval | Properties on Heritage Register | Heritage Register CKAN |
| **Section 37 Bonusing** | Density above base FSI in exchange for community benefits | Negotiated for taller projects | One-off site-by-site agreements |
| **Inclusionary Zoning** | Mandatory affordable units (5-10% of GFA) | Designated zones (TOcore) | Toronto Planning IZ map |
| **Tower-in-the-Park overlay** | Maintains park-like setback; tall building criteria apply | Specific cluster sites | Spec design guidelines |
| **Multiplex Bylaw (2023, expanding 2025)** | Allows 2-4 units (→6) in RD/RS/RT; 10m height cap; FSI exempt | Most RD/RS/RT zones citywide | OPA 649 |
| **Garden Suite Bylaw 89-2022** | Allows 60 m² (or 120 m² with cantilever) garden suite in rear yard | Most R zones | Bylaw 89-2022 |
| **Laneway Suite Bylaw (2018+)** | Allows 100 m² laneway suite (8m × 10m × 6m height) | Lots backing on a public laneway | Bylaw 569-2013 §150 |
| **TRCA ravine setback** | Forces 10-30m setback from ravine top-of-bank | Ravine lots (TRCA jurisdiction) | TRCA Regulated Area map |
| **Chapter 900 site-specific exceptions** | Per-parcel custom rules — can be MORE or LESS permissive than base zone | Thousands of individual parcels | Chapter 900 of Bylaw 569-2013 |

**Overlay precedence:**
1. Section 37 bonusing (if applicable) overrides everything — highest density
2. Major Streets / Avenues (FSI exempt) takes precedence over base zone FSI
3. Heritage (HCD or Individual) caps demolition + facade changes regardless of base zone
4. Multiplex / Laneway / Garden Suite bylaws are additive (allow MORE than base zone)
5. TRCA ravine setbacks REDUCE buildable area regardless of zone
6. Chapter 900 exception (if applicable) overrides base zone

**For our model:** we currently apply NONE of these overlays — base zone only. Operator should be aware estimates can be 30-100% off for properties with significant overlays.

---

## 6. Lot configuration nuances (Dimension E)

Different lot shapes affect interpretation of `lot_size_sqm` and coverage. Each row below has a **Detect via** column showing the SQL or data dependency.

### What's in our `parcels` table today

Loaded from Toronto Open Data **Property Boundaries** CKAN dataset (`property-boundaries`, refreshed via `scripts/load-parcels.js`):

| Field | Use |
|---|---|
| `parcel_id` | Toronto Property ID — primary key |
| `lot_size_sqm` / `lot_size_sqft` | Lot area |
| `frontage_m`, `depth_m` | Computed from minimum bounding rectangle (line 152-153 of `load-parcels.js`) — **approximate for irregular lots** |
| `geometry jsonb` | Polygon coordinates (4326 WGS84) |
| `geom` (PostGIS) | Indexed spatial geometry — enables `ST_Intersects`, `ST_Centroid`, etc. |
| `centroid_lat` / `centroid_lng` | Point representation |
| **`is_irregular boolean`** | **Our flag**: `(polygon_area / minimum_bounding_rectangle_area) < 0.95` (line 148-149). 25% of parcels (~123K) flagged. |
| **`feature_type varchar`** | **Toronto's flag**: `COMMON` (99.3%) vs `CONDO` (0.7% — 3,396 condominium common-element parcels). |
| `date_effective` / `date_expiry` | Active vs retired parcel — expired = subdivided |
| `address_number`, `linear_name_full` | Single street address |

### Per-lot-type detection

| Lot type | Detect via | What we have | Coverage-calc effect | Confidence |
|---|---|---|---|---|
| **Standard rectangular** | `is_irregular = false AND feature_type = 'COMMON'` | ✅ Today | None — `lot_size × coverage × floors` works as-is | HIGH |
| **Irregular shape (L / pie / cul-de-sac)** | `is_irregular = true` (~25% of parcels, our geometric flag) | ✅ Today | `frontage_m`/`depth_m` are MBR-derived — approximate. Coverage % still OK because `lot_size_sqm` uses actual polygon area. | MEDIUM — widen confidence band ±25%→±50% |
| **Condo common-element parcel** | `feature_type = 'CONDO'` (3,396 parcels) | ✅ Today | Lot is the WHOLE tower site; if permit is unit-level (interior alt < $200K), use `typical_condo_unit_sqm` instead of `lot_size_sqm`. If permit is building-level (> $500K), use lot with apartment-zone coverage. | HIGH — strong free signal |
| **Vacant lot** | `NOT EXISTS (SELECT 1 FROM parcel_buildings pb WHERE pb.parcel_id = parcels.id AND pb.is_primary = true)` | ✅ Today | Forces G-BYLAW-STD path (no existing massing to use as anchor) | HIGH |
| **Shared parcel (townhouse / semi)** | `permits.dwelling_units_created > 1` AND building_footprint serves multiple permits OR per-unit lot < 250 m² with footprint > lot | ✅ Today | **CRITICAL** — divide footprint by `unit_count` OR aggregate sibling parcels. Without this, coverage % goes 150-250% (Lens L finding). | HIGH detection / fix is Action #11 |
| **Under-subdivision** | `parcels.date_expiry IS NOT NULL AND date_expiry > permits.application_date` (parcel got subdivided between application and now) | ✅ Today | Pre-construction lot is the LARGE parent parcel; post-construction the units have their own parcels. Use parent-parcel area for the new-build envelope, then divide. | MEDIUM — edge case |
| **Flag / pipe-stem lot** | `frontage_m / depth_m < 0.15` AND `is_irregular = true` (long thin "stem") — geometric approximation. PostGIS analysis on `geom` polygon for definitive detection. | 🟡 Approximate today | Stem area isn't buildable — reduce effective `lot_size_sqm` by ~15-25% before coverage calc | LOW — niche |
| **Corner lot** | Parcel geometry touches ≥2 streets at a corner. Requires `ST_Intersects` against Toronto Centreline. | ❌ Need new ingest: **Toronto Centreline** CKAN dataset (`toronto-centreline`) | Two front-yard setbacks → ~5-10% smaller buildable area | MEDIUM impact, MEDIUM effort |
| **Through lot** (front + rear streets) | Parcel touches streets on opposite sides | ❌ Same — Toronto Centreline | Two front yards, similar to corner | LOW — rare |
| **Ravine lot (TRCA jurisdiction)** | `ST_Intersects(parcels.geom, trca_regulated_areas.geom)` | ❌ Need new ingest: **TRCA Regulated Areas** (TRCA Open Data portal) | Ravine setback strip (10-30m from top-of-bank) NOT buildable — can reduce effective lot 30-80% on affected parcels | HIGH impact on premium areas (Bayview/Rosedale/Hoggs Hollow) |
| **Heritage lot** | Address match against Toronto Heritage Register | ❌ Need new ingest: **Toronto Heritage Register** CKAN | Existing structure largely fixed; demolition restricted; cost premium 30-100% | HIGH impact on ~3% of lots |
| **Air-rights / stratified** | Multiple `parcels` at same centroid with different vertical layers | ❌ Outside Open Data — requires Land Registry (paid, complex) | Not modelable in 2D lot system | NICHE — downtown only, flag for manual |

### Direct-from-data detection queries

```sql
-- Condo common-element parcel (Toronto Property Boundaries CKAN classification)
SELECT * FROM parcels WHERE feature_type = 'CONDO';

-- Irregular shape (our geometric flag: polygon fills <95% of bounding rectangle)
SELECT * FROM parcels WHERE is_irregular = true;

-- Vacant lot (no primary building linked)
SELECT p.* FROM parcels p
WHERE NOT EXISTS (
  SELECT 1 FROM parcel_buildings pb WHERE pb.parcel_id = p.id AND pb.is_primary = true
);

-- Shared parcel hosting multiple permits over time
SELECT p.id, p.lot_size_sqm, COUNT(DISTINCT pp.permit_num) AS permits_on_parcel
FROM parcels p
JOIN permit_parcels pp ON pp.parcel_id = p.id
GROUP BY p.id, p.lot_size_sqm
HAVING COUNT(DISTINCT pp.permit_num) > 5;

-- Likely subdivided parcel
SELECT * FROM parcels WHERE date_expiry IS NOT NULL AND date_expiry > '2024-01-01';

-- Likely flag/pipe-stem lot (geometric approximation from MBR)
SELECT * FROM parcels
WHERE is_irregular = true
  AND lot_size_sqm > 300
  AND (frontage_m::numeric / NULLIF(depth_m::numeric, 0)) < 0.15;
```

### Field accuracy notes

- `is_irregular` — **OUR computation**, not Toronto-provided. Threshold 0.95 (polygon must fill ≥95% of MBR to be "rectangular"). 25% of all parcels flagged true — high because Toronto has many cul-de-sac pie-shapes and L-shaped corner lots.
- `feature_type` — **Toronto-provided**, only 2 values. `COMMON` = regular individually-owned parcel. `CONDO` = condo common-element (the building site that all units in the tower share).
- `frontage_m` / `depth_m` — **derived from minimum bounding rectangle**, scaled to match `lot_size_sqm` (line 145-153). For an irregular lot, these are the bounding-box dimensions, not the buildable rectangle's dimensions. Use with `is_irregular` as a confidence widener.
- `lot_size_sqm` — preferred source is `stated_area_raw` from Toronto's data (line 144). Falls back to polygon shoelace area if stated area is missing/zero. Authoritative.

### What we can DO today vs need new ingest

**Today (no new ingest, just code):**
1. **Condo unit-level vs building-level handling** via `feature_type='CONDO'` check
2. **Vacant lot detection** for new-build path
3. **Confidence-band widening** for `is_irregular = true` lots
4. **Shared parcel divisor** (Action #11) using `dwelling_units_created` + permit_parcels
5. **Flag/pipe-stem approximation** using frontage/depth ratio + `is_irregular`
6. **Under-subdivision detection** via `date_expiry`

**Require new Toronto Open Data ingest:**
| Dataset | Source | Effort | Adds detection for |
|---|---|---|---|
| Toronto Centreline | CKAN `toronto-centreline` | 1 day | Corner lots, through lots |
| TRCA Regulated Areas | TRCA Open Data | 1 day | Ravine lots (HIGH impact, premium areas) |
| Toronto Heritage Register | CKAN `heritage-register` | 1-2 days | Heritage lots (HIGH cost premium) |

**For our model — priority order:**
1. ✅ **CONDO detection** — free immediate win using `feature_type` (Action: new)
2. ✅ **Shared parcel divisor** — uses data we have (Action #11)
3. ✅ **Vacant lot detection** — uses data we have (sub-task of Action #3)
4. ✅ **`is_irregular` confidence widener** — uses data we have (Action: new)
5. 🟡 **TRCA Regulated Areas ingest** — 1 day, high-value for premium-area accuracy
6. 🟡 **Heritage Register ingest** — 1-2 days, high cost-premium impact
7. ⚪ **Centreline ingest** — 1 day, second-order accuracy improvement
8. ⚪ **Air-rights / stratified** — outside model scope

---

## 7. Cost-side modifiers (Dimension F)

After GFA × allocation × per-trade rates, multiply by:

| Modifier | Range | Driver | Source |
|---|---|---|---|
| Neighborhood income premium | 1.0x-1.5x | `neighbourhoods.avg_household_income` tiers | Existing `logic_variables.premiumTiers` |
| Tall-building rate premium | 1.2x-2.5x | Construction cost rises with height (cranes, formwork, MEP complexity) | Should be added — multiplier per storey range |
| Heritage retention premium | 1.3x-2.0x | Specialized trades (matching brick, custom millwork, facade jacking) | Should be added — flag from Heritage Register |
| Construction tier (basic / mid / high-end) | 0.8x-1.6x | Finishes quality, mechanical complexity, custom design | Should be inferred from neighborhood + structure_type + declared $ |
| Soil conditions | 1.0x-1.3x | Bedrock excavation, contaminated soil, ravine geotech | Outside model scope — flag for manual |
| Labor market (union/non-union) | 1.0x-1.15x | Toronto construction has both | Currently rolled into base rates |
| Phasing premium | 1.0x-1.1x | Multi-phase projects have ramp-up overhead | Flag for large projects |
| Project size discount/penalty | 0.95x-1.1x | Volume discount on large; small-project overhead | Could be derived from project total |

---

## 8. The GFA path decision matrix

Given the work-intent tier (W0-W13) and built form (BF1-BF22), pick the GFA path:

| Path code | Path name | When | GFA formula |
|---|---|---|---|
| **G-SKIP** | Safe-skip | W0, W2 (trade-direct), W13 | n/a — no GFA-based cost |
| **G-EXISTING** | Existing building (massing) | W1, W3, W4, W5 on existing structure | `footprint_area_sqm × estimated_stories` (current Brain default) |
| **G-EXISTING-DIV** | Existing building, per-unit divisor | W1-W5 on shared parcel (townhouse/semi) | `(footprint × stories) ÷ unit_count` |
| **G-BYLAW-STD** | Bylaw standard new build | W8 (SFD/Semi/Townhouse/multiplex) | `lot × coverage_by_zone × default_floors_by_zone` |
| **G-BYLAW-DERIVED** | Bylaw + density-derived floors | W8, W10 megaproject (apartment/mixed-use, 20+ units) | `lot × coverage × MAX(default_floors, ceil(units × unit_sqm / (lot × coverage × efficiency)))` |
| **G-BYLAW-FSI** | FSI-based (preferred for towers) | W8, W10 tower (15+ storeys), CR/RA zones | `lot × FSI_max` where FSI from logic_variable by zone+overlay |
| **G-RENO-BUILD** | Bylaw envelope but classified as alteration | **W7** (reno-build pattern detected) | Same as G-BYLAW-STD or G-BYLAW-DERIVED |
| **G-LANEWAY** | Fixed laneway/garden envelope | W11 | `MIN(bylaw_max_gfa, lot × 0.20)` — typically 60-120 m² |
| **G-HERITAGE** | Constrained by existing form | W12 + heritage overlay | `MAX(existing_GFA, smaller_replacement_GFA)` — no expansion |
| **G-MIXED-SPLIT** | Mixed-use podium + tower | W10 with mixed-use structure_type | Commercial: `lot × podium_coverage × podium_floors`. Residential: `lot × FSI_residential` (separated). |
| **G-FALLBACK** | Last-resort fallback | Massing missing AND lot data thin AND classification unclear | `lot × coverage_by_overlay × FALLBACK_FLOORS` |

---

## 9. Allocation logic — what fraction of GFA is in scope

Building on the work-intent tier (Section 2):

| Work intent | Base allocation | Modifier rule | Final |
|---|---|---|---|
| W0 maintenance | n/a (safe-skip) | — | safe-skip |
| W1 cosmetic interior | 0.03 | 0.5x if trade_count = 0-1 | 0.015-0.05 |
| W2 single-trade swap | n/a (trade-direct cost, not GFA-based) | use `trade_direct_cost` logic_variable | trade-specific $ |
| W3 multi-trade minor | 0.10 | 0.5x if 2 trades; 1.5x if cost > $150K | 0.05-0.15 |
| W4 standard alteration | 0.20 | (matrix value × trade-count modifier) | 0.10-0.30 |
| W5 major addition | 0.40 | matrix × 2.0 if trade_count ≥ 6 | 0.30-0.60 |
| W6 substantial reno | 0.65 | matrix × 2.5 if "gut renovation" / "down to studs" keyword | 0.50-0.80 |
| **W7 reno-build** | **1.00** | use NEW BUILD GFA path (G-BYLAW-STD/DERIVED), not existing massing | **1.00** |
| W8 new construction | 1.00 | always full envelope | 1.00 |
| W9 multiplex conversion | 0.75 | 1.0 if full demolition + rebuild within multiplex envelope | 0.60-1.00 |
| W10 megaproject | 1.00 | always full envelope | 1.00 |
| W11 laneway / garden | 1.00 | of FIXED envelope (laneway path G-LANEWAY) | 1.00 |
| W12 heritage retention | varies | matrix × heritage premium 1.3-2.0x | depends on retention extent |
| W13 trade-specific | n/a (safe-skip) | — | safe-skip per §3.A(d) |

**Per-built-form override:** for `Laneway / Rear Yard Suite` structure_type, allocation is ALWAYS 1.00 of the laneway envelope (G-LANEWAY path) regardless of the work-intent tier — laneways/garden suites are by definition new builds of a constrained envelope.

---

## 10. Trade composition matrix

Different work intents activate different trades. Currently `permits.active_trade_slugs` is set by `classify-permits.js` from the description text — we use what it gives us. But it's worth documenting the expected composition per work-intent so we can audit when classification looks off:

| Work intent | Expected trades | Trade count |
|---|---|---|
| W1 cosmetic | painting, flooring, drywall | 1-3 |
| W3 kitchen/bath | plumbing, electrical, drywall, flooring, tiling, painting | 4-6 |
| W4 standard alt | framing, electrical, plumbing, drywall, flooring, painting | 4-6 |
| W5 major addition | foundation/excavation, framing, electrical, plumbing, hvac, drywall, flooring, roofing, painting | 6-9 |
| W6 gut reno | framing (interior), electrical, plumbing, hvac, drywall, flooring, painting, masonry, structural-steel | 7-10 |
| W7 reno-build / W8 new construction | foundation, excavation, framing, structural-steel, masonry, roofing, electrical, plumbing, hvac, drywall, flooring, painting, glazing, insulation, fire-protection, landscaping | **9-16** |
| W10 megaproject | All of W8 + elevator + structural-steel-heavy + concrete-heavy + fire-protection (sprinklers) + glazing curtain-wall | 12-20 |
| W11 laneway/garden suite | framing, electrical, plumbing, drywall, flooring, painting, roofing, foundation (slab) | 6-9 |
| W13 trade-specific | the trade itself only | 0-1 (the permit IS the trade) |

**Audit query** (informational, not enforced): if a permit's active_trade_slugs count doesn't match its work-intent tier's expected range, flag for review. E.g., a permit classified W4 (standard alt) with 12 trades is probably actually W7 (reno-build).

---

## 11. Per-trade $/m² rates and modifiers

The Surgical Triangle (Spec 83 §3 Step C) computes:

```
Trade_Value = Area_Eff
            × trade_sqft_rates.base_rate_sqft
            × structure_complexity_factor
            × neighborhood_premium
            × (shell_multiplier IF shell + interior trade)
            × tall_building_premium (NEW — by storey range)
            × heritage_retention_premium (NEW — if heritage flag)
            × construction_tier_multiplier (NEW — basic/mid/high-end)
```

**Each rate component has its own logic_variable for operator tuning.**

Base rates per trade (existing `trade_sqft_rates` table — examples for Toronto 2026):

| trade_slug | base_rate_sqft (CAD/m²) | structure_complexity_factor by structure_type |
|---|---|---|
| framing | $290 | 1.0 SFD, 1.3 multi, 1.5 mid-rise, 2.0+ tower |
| plumbing | $195 | 1.0-2.0 (rises with unit density) |
| electrical | $195 | 1.0-2.0 |
| hvac | $230 | 1.0-2.5 (commercial much higher) |
| drywall | $98 | 1.0 baseline |
| roofing | $122 | 1.0 SFD; n/a for tower (curtain wall instead) |
| flooring | $130 | 1.0 baseline |
| painting | $60 | 1.0 baseline |
| concrete | $180 | 1.5 SFD, 2.0 mid-rise, 3.0+ tower |
| masonry | $220 | 1.0-1.5 |
| structural-steel | $480 | 1.5 mid-rise, 2.5+ tower |
| glazing | $310 | 1.0 SFD windows; 3.0+ curtain wall |
| elevator | $5,200/floor | 1.0 baseline |
| fire-protection | $42 | 1.0 SFD, 1.8 commercial, 2.5 high-rise |
| excavation | $85 | 1.0 SFD; varies with soil |
| insulation | $70 | 1.0 baseline |
| landscaping | $130 | varies |
| demolition | $50 | typically separate permit (trade-specific) |
| caulking, eavestrough-siding, decking-fences, pool-installation, security, solar, stone-countertops, temporary-fencing, tiling, trim-work, waterproofing, millwork-cabinetry, drain-plumbing | varies — per current `trade_sqft_rates` rows | varies |

**These all sit in `trade_sqft_rates` already, editable via Spec 86 Control Panel.**

---

## 12. The reno-build detection rule (detail)

The single highest-impact addition (Finding 7, Action #9). Affects ~12,500 SFD permits in our corpus that are economically new builds but classified as alterations.

```js
function detectRenoBuildPattern(row, config) {
  const tradeCount = (row.active_trade_slugs || []).length;
  const declaredCost = row.est_const_cost || 0;
  const description = (row.description || '').toLowerCase();

  // Signal 1: trade count >= threshold (default 9)
  const sig1_trades = tradeCount >= config.reno_build_trade_threshold;

  // Signal 2: declared cost >= threshold (default $750K for SFD-Detached)
  const sig2_cost = declaredCost >= config.reno_build_cost_threshold;

  // Signal 3: explicit reno-build language in description
  const renoBuildKeywords = /(demolish.{0,30}addition|tear[ -]down|three[ -]wall|substantial(ly)? renovat|gut renovat|down to studs|new construction|rebuild|complete renovat)/;
  const sig3_keyword = renoBuildKeywords.test(description);

  // Signal 4: compound major-addition language ("3 storey rear addition + interior alterations + new foundation")
  const compoundAdditionKeywords = /(rear addition.*interior alter|second storey addition.*interior|3rd storey|third storey|underpinning.*new floor)/;
  const sig4_compound = compoundAdditionKeywords.test(description);

  // Detection: 2 of 4 signals present
  const signalCount = [sig1_trades, sig2_cost, sig3_keyword, sig4_compound].filter(Boolean).length;

  return signalCount >= 2;
}
```

**Why 2-of-4:** any single signal alone produces too many false positives. Combining trade count + cost magnitude (the strongest two) catches the high-confidence cases. Adding keyword signals catches the lower-cost but still substantial-scope cases.

**When detected:** the permit gets re-routed from work-intent W4/W5 → **W7**, which switches:
- GFA path: G-EXISTING → G-BYLAW-STD (use new-build envelope)
- Allocation: matrix value → 1.00
- Trade composition expectation: 4-6 trades → 9-14 trades (already matches, that's the signal)

---

## 13. Edge cases and known model limits

| Edge case | Why hard | Current model behavior | Operator workaround |
|---|---|---|---|
| Section 37 bonusing | Site-specific negotiated density above base zone | Uses base zone — under-estimates | Per-project flag |
| Inclusionary zoning units | Mandatory affordable units may have lower cost spec | Same rate as market | Per-project flag |
| Phased megaprojects | Multiple permits over years; partial-build at any time | Estimates each phase separately | Aggregate at lead level |
| Air-rights / stratified | Vertical ownership splits | Treats as flat lot | Manual review |
| Below-grade GFA (parking, mechanical) | Not in `building_footprints` polygon | Excluded — under-estimates total cost | Per-project flag |
| Mechanical penthouse / rooftop GFA | Often above max_height_m in massing | Under-counted | Accept |
| Multi-parcel consolidation projects | Pre-construction lot data shows individual parcels | Picks one parcel — under-estimates | Manual aggregation |
| Land assembly (assembled site, single permit, multiple original parcels) | Permit data may reference one parcel only | Same as above | Manual aggregation |
| Chapter 900 site-specific exceptions | Thousands of per-parcel custom rules | Uses base zone — can be 10-30% off | Accept; flag if structurally important |
| Newly-zoned property | Recently re-zoned, our data is stale | Old zoning used | Refresh zoning data quarterly |
| TRCA ravine lots | 10-30m setback reduces buildable lot | Uses full lot — over-estimates | Flag ravine lots |
| Heritage retention projects | Cost is 30-100% higher than equivalent new build | Same as equivalent new build | Apply heritage premium |
| Mixed-use podium + tower | Commercial podium + residential tower have different rates | Single rate weighted average | Split into two notional GFAs |
| Demolition-only permits | No new GFA, but real cost ($50-150K typical) | Safe-skipped (W13) | Trade-direct rate from `trade_sqft_rates.demolition` |
| Below-$1K placeholder declared cost | Applicant didn't bother declaring real value | Liar's Gate Path A — use model | OK; this is intentional |
| Trade-specific permit with 9+ trades | E.g., a Plumbing permit with 12 sub-trades classified | Currently safe-skipped (W13 wins) | Investigate why classification put so many trades on a plumbing permit |
| Permit with conflicting permit_type/structure_type | E.g., "Demolition Folder" structure="SFD" | Permit_type wins (safe-skip) | Accept |
| Withdrawn / cancelled / refused permits | Cost shouldn't be counted | Filtered upstream by lifecycle_phase | Verified |
| Revision of original permit | est_const_cost may differ from original | Use latest revision | Verified |

---

## 14. Cost output: source labels and trust hierarchy

The `cost_estimates.cost_source` column captures which path was taken. Operators use this to gauge trust:

| `cost_source` | Meaning | Trust | Operator action |
|---|---|---|---|
| **`permit`** | Liar's Gate trusted the declared value; we sliced it by trade weights | 🟢 HIGH | Use the value with confidence |
| **`model`** (with `is_geometric_override=true`) | Declared was too low; we used the surgical model | 🟡 MED-HIGH | Sanity-check against neighborhood comps |
| **`model`** (without override, low declared) | Declared was $0 or placeholder | 🟡 MED | Same as above |
| **`geometric`** | CoA path (no declared cost available; always geometric) | 🟢 HIGH | This is the only path for CoA; trust the math |
| **`none`** (`Path A` — class skip) | `permit_type_class != 'construction'` (signage / safety / etc.) | ⚪ N/A | Correct safe-skip — these don't have meaningful "construction cost" |
| **`none`** (`Path B` — matrix miss) | No matrix row for `(permit_type, structure_type)` pair — trade-specific permit or long-tail combo | ⚪ N/A | Correct safe-skip per §3.A(d); investigate matrix coverage if appearing often |
| **`none`** (`Path C` — zero-total bypass) | Matrix hit + GFA > 0 but `Surgical_Total = 0` because no active trade rates matched | 🟡 LOW | Investigate — likely missing `trade_sqft_rates` row |

**An additional confidence dimension (for surfacing in UI):** per-permit, also report:
- Which work-intent tier (W0-W13) was assigned
- Which GFA path (G-*) was used
- Whether reno-build detector fired
- Whether Liar's Gate fired (model > declared)
- Whether any overlays were detected (heritage, ravine, etc.)

This is `cost_estimate.classifier_metadata` — a JSONB column for full transparency.

---

## 15. Cost-range output for confidence bands

Beyond a single `estimated_cost`, the model emits a **range**:

```js
cost_range_low  = estimated_cost × (1 - range_pct)
cost_range_high = estimated_cost × (1 + range_pct)
```

Where `range_pct` varies by confidence:

| Confidence | range_pct | When |
|---|---|---|
| Tight (±15%) | 0.15 | `cost_source=permit` AND Liar's Gate verified |
| Standard (±25%) | 0.25 | `cost_source=model` on a well-calibrated combo |
| Wide (±50%) | 0.50 | `cost_source=model` on a known-noisy combo (reno-build, megaproject) |
| Very wide (±100%) | 1.00 | Heritage / overlay / edge-case flagged |
| None | n/a | `cost_source=none` |

Current model emits `cost_range_low` / `cost_range_high` but doesn't differentiate confidence per-permit. Should.

---

## 16. Cross-reference to data sources

| Concept | Source dataset | Our field | Update frequency |
|---|---|---|---|
| Permit metadata | Toronto Open Data — Building Permits CKAN | `permits.*` | Daily ingest |
| Existing building footprints + heights | Toronto Open Data — 3D Massing CKAN | `building_footprints.*` | Annual refresh (2025 snapshot) |
| Parcels (lot polygons + sizes) | Toronto Open Data — Property Parcels CKAN | `parcels.*` | Quarterly refresh |
| Permit ↔ parcel linkage | Spatial join (link-parcels.js) | `permit_parcels` | Per-pipeline-run |
| Parcel ↔ primary building | Spatial join (link-massing.js) | `parcel_buildings.is_primary` | Per-pipeline-run |
| Active trades per permit | Classifier (classify-permits.js) from `description` | `permit_trades`, `active_trade_slugs` | Per-pipeline-run |
| Neighborhood income | Toronto Open Data — Neighbourhood Profiles | `neighbourhoods.avg_household_income` | Annual refresh |
| Per-trade rates | Operator-managed via Spec 86 Control Panel | `trade_sqft_rates` | Operator-tunable |
| GFA allocation matrix | Operator-managed via Spec 86 Control Panel | `scope_intensity_matrix` | Operator-tunable |
| Logic variables (all thresholds + multipliers) | JSON seed + Spec 86 Control Panel | `logic_variables` | Operator-tunable |
| Zoning class | **NOT INGESTED YET** — Toronto Open Data CKAN | (future) `parcels.zoning_class` | (target) Quarterly |
| Heritage Register | **NOT INGESTED YET** — Toronto Open Data CKAN | (future) `parcels.heritage_status` | (target) Quarterly |
| Major Streets / Avenues | **NOT INGESTED YET** — Toronto Planning | (future) `parcels.on_major_street` | (target) Annual |
| TRCA Regulated Areas | **NOT INGESTED YET** — TRCA Open Data | (future) `parcels.in_trca_regulated` | (target) Annual |

---

## 17. The summary equation

For any permit `p`:

```
GFA(p) = pickGfaPath(p) → one of G-SKIP, G-EXISTING, G-EXISTING-DIV, G-BYLAW-STD,
                                  G-BYLAW-DERIVED, G-BYLAW-FSI, G-RENO-BUILD,
                                  G-LANEWAY, G-HERITAGE, G-MIXED-SPLIT, G-FALLBACK

allocation(p) = pickAllocation(work_intent(p), structure_type(p))
              ∈ {0, 0.03, 0.10, 0.20, 0.40, 0.65, 1.00, ...}

Area_Eff(p) = GFA(p) × allocation(p)

Surgical_Total(p) = Σ over active_trades t:
                    Area_Eff(p)
                    × trade_sqft_rates[t].base_rate_sqft
                    × trade_sqft_rates[t].structure_complexity_factor[structure_type(p)]
                    × neighborhood_premium(p)
                    × shell_mult(p, t)
                    × tall_building_premium(p)
                    × heritage_premium(p)
                    × construction_tier_mult(p)

cost(p) = LiarsGate(declared_cost(p), Surgical_Total(p))
        → emit one of: declared (sliced), model, geometric, or none

cost_range(p) = [cost × (1 - r), cost × (1 + r)]  where r depends on confidence band
```

Everything else in this document is the operator-tunable lookup tables and the path selection logic that feed this equation.

---

## 18. Sources

- WF1 plan: `.cursor/active_task.md` v3
- Spec: `docs/specs/01-pipeline/83_lead_cost_model.md`
- Consolidated findings: `docs/reports/wf1-cost-estimate-findings.md`
- Cost accuracy investigation: `docs/reports/wf1-cost-accuracy-investigation.md`
- GFA / massing investigation: `docs/reports/wf1-gfa-accuracy-investigation.md`
- Bylaw heuristic validation: `docs/reports/wf1-bylaw-heuristic-validation.md`
- Toronto bylaw investigation: `docs/reports/wf1-toronto-bylaw-investigation.md`
- Reno-build pattern investigation: `docs/reports/wf1-reno-build-pattern-investigation.md`
- Toronto Zoning By-law 569-2013 (all amendments)
- Toronto Open Data CKAN datasets: Building Permits, 3D Massing, Property Parcels, Neighbourhood Profiles, (target: Zoning By-law, Heritage Register, Major Streets, TRCA Regulated Areas)
- Multiplex Bylaw OPA 649 (2023 → expanding 2025)
- Laneway Suite Bylaw (Bylaw 569-2013 §150, 2018+)
- Garden Suite Bylaw 89-2022 (Bylaw 569-2013 §170)
- Major Streets Bylaw (2024)
