# WF1 Spec 62 — Phase 0 Architecture Discovery Report

**Phase:** 0 (read-only research; no code/migration changes)
**Date:** 2026-05-26
**WF:** WF1 Genesis — Spec 62 Toronto Centreline (streets) (load + link, spec-only)
**Cadence:** Phase-0-FIRST per user direction (vs Specs 58/59/61 which did plan-first then Phase-0)
**Authorization:** v1.3 Gate 2 authorized 2026-05-26 (after 3-pass adversarial PLAN review)

---

## TL;DR — v1.3 plan inputs

Phase 0 confirmed all 12 Q0.x discovery questions before v1 plan authoring; subsequent 3 PLAN review rounds (R1 + R2 + R3, 75 findings across Gemini + DeepSeek + Independent) folded plan-level corrections. Key data points baked into v1.3 locked decisions L1-L28:

- **Single CKAN package** with 4 format variants (Shapefile + GeoJSON + CSV + GPKG)
- **64,433 LineString segments** raw → **~47,000 street-class** after L25 filter
- **Daily refresh cadence** (NOT annual per the original wf1-cost-implementation-plan.md reference — material correction)
- **40 attribute columns** including critical fields for corner-lot / through-lot / frontage detection: `FROM_INTERSECTION_ID` + `TO_INTERSECTION_ID` (graph topology), `LO_NUM_L/HI_NUM_L/LO_NUM_R/HI_NUM_R/PARITY_L/R` (address range), `FEATURE_CODE_DESC` (street-class classification), `JURISDICTION`
- **Stable upsert key:** `CENTRELINE_ID` (city's semantically meaningful identifier; preferred over Esri `OBJECTID`)
- **Lock IDs:** 65/66 verified unassigned (62/63 pre-occupied by Spec 61; §5.2 exception documented)

---

## Q0.1 — Canonical CKAN package + resource(s)

**Authoritative dataset:** `toronto-centreline-tcl`

- **Package ID:** `1d079757-377b-4564-82df-eb5638583bfb`
- **Title:** "Toronto Centreline (TCL)"
- **Description:** "Linear representations of streets, walkways, rivers, railways, highways and administrative boundaries within the City of Toronto" — 64,433 records, 454,814 vertices across 9 resource variants
- **Owner:** City of Toronto Geomatics Group
- **Published:** 2010-07-13; **last updated:** 2026-05-25 (daily refresh)

**Active resource (Spec 62 ingest target):**

| Field | Value |
|---|---|
| Format | Shapefile (zipped) |
| Resource ID | `d86bdca4-ab2c-470d-80fb-34647ea0e87f` |
| File size | 117.8 MB (zip) |
| Projection | EPSG:4326 (WGS84) native |
| Direct URL | `https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/1d079757-377b-4564-82df-eb5638583bfb/resource/d86bdca4-ab2c-470d-80fb-34647ea0e87f/download/centreline-version-2-4326.zip` |
| Datastore active | **false** (must download + parse shapefile) |
| Bundled artifacts | `.shp` (10.9 MB), `.dbf` (106.4 MB), `.prj`, `.shx`, **`Centreline - Version 2 fields.csv`** (data dictionary) |

**Alternative formats considered + rejected:** GeoJSON (93.3 MB) and CSV (36.2 MB) are also available but the Shapefile format aligns with Spec 58/59/61 precedent (npm `shapefile` library already in dependency tree).

---

## Q0.2 — Geometry type per resource

**`LineString` uniform.** Phase 0 parsed all 64,433 features:

- All features: `LineString` (no `MultiLineString` observed)
- No `GeometryCollection`

→ Column type: `GEOMETRY(LineString, 4326) NOT NULL`. No `ST_Multi()` cast required at load (unlike Spec 58 zoning + Spec 61 HCDs which had mixed Polygon/MultiPolygon).

---

## Q0.3 — Source projection

**EPSG:4326 (WGS84) native.** No `ST_Transform` required.

Confirmed via:
- `.prj` file in the shapefile bundle (WGS84 declaration)
- Filename suffix `-4326`
- Direct match to Spec 58/59/61 native projection precedent

Alternative resource exists at EPSG:2952 (Ontario NAD83) — NOT used; v1.3 mandates 4326 variant for join compatibility with `parcels.geom` (also 4326 per Spec 59 Q0.12.b).

---

## Q0.4 — Stable per-feature upsert key

**Two candidate keys observed:**

| Column | Type | Example | Stability |
|---|---|---|---|
| **`CENTRELINE_ID`** (preferred) | Integer | `7632579` | City's semantically meaningful identifier; persists across Esri reloads |
| `OBJECTID` (alternative) | Integer | `30` | Esri auto-generated row ID; resets on full Esri reload |

→ **v1.3 L20:** `source_id BIGINT UNIQUE NOT NULL` mapped from `CENTRELINE_ID`. Avoids the Esri-reload instability that burned Spec 58's original `_id` use. (Spec 47 §R2 prefers semantically meaningful keys when available.)

⚠ **Lurking concern:** Phase 0 did not verify uniqueness across the full 64K dataset (only inspected first 1000 rows + sample). v1.3 fold D2 routes a follow-up: "JS-side pre-check uniqueness assertion on CENTRELINE_ID before transaction; fail-fast with clear error if duplicates."

---

## Q0.5 — Feature count baseline

**Raw count: 64,433 LineString segments** (parsed via npm `shapefile` library).

**Post-L25 filter (street-class only):** ~47,000 segments expected. Computed from feature-type distribution × jurisdiction filter (see Q0.7 + L25):

```
Local            24,889
Collector         6,374
Major Arterial    5,865
Minor Arterial    3,560
Laneway           4,148
Expressway        1,187
Expressway Ramp   1,133
Major Arterial Ramp 171
Collector Ramp       16
Other Ramp            6
Access Road          57
Busway               18
----
Subtotal         47,424 (before jurisdiction exclusion)
```

After FEDERAL jurisdiction exclusion (border-crossing, federal-land segments — uncounted in Phase 0 sample), the actual post-filter count is between **40,000-47,000**.

→ **L21 assert-data-bounds threshold:** `>= 40,000` (15% margin below expected post-filter count; calibrated empirically at first deploy per H-v1.3.7).

→ **L26 load pattern:** Staging-table CTE (full-replace semantics; 47K features × ~10 params = ~470K params, exceeds PostgreSQL 65,535 limit for single VALUES batch; matches Spec 58 staging-CTE precedent for 27K features rather than Spec 61's batched-direct-INSERT pattern for 12K features).

---

## Q0.6 — Attribute columns per feature (40 total)

Bundled `Centreline - Version 2 fields.csv` maps 10-char shapefile DBF column names to human-readable names. Full 40-column enumeration:

| Shapefile column | Logical name | Type | Purpose / v1.3 usage |
|---|---|---|---|
| `_id1` | `_id` | INT | CKAN row sequence (NOT stable; do not use as upsert key) |
| `CENTREL2` | `CENTRELINE_ID` | INT | **PRIMARY UPSERT KEY** (per Q0.4) |
| `LINEAR_3` | `LINEAR_NAME_ID` | INT | Reference to linear-name dictionary table (out of scope for Spec 62) |
| `LINEAR_4` | `LINEAR_NAME_FULL` | TEXT | "Daisy Ave" — used for display + display-name lookup |
| `LINEAR_5` | `LINEAR_NAME_FULL_LEGAL` | TEXT | "Daisy Avenue" — full legal name (not v1.3-used) |
| `ADDRESS6` | `ADDRESS_L` | TEXT | "29-39" left-side address range string (not v1.3-used directly) |
| `ADDRESS7` | `ADDRESS_R` | TEXT | "32-50" right-side address range string |
| `PARITY_8` | `PARITY_L` | TEXT | 'O' (odd) / 'E' (even) — left side parity for `address_match_status` |
| `PARITY_9` | `PARITY_R` | TEXT | 'O' / 'E' — right side parity |
| `LO_NUM_10` | `LO_NUM_L` | TEXT | "29" left-side range minimum — v1.3 L2 stores as TEXT (per H-v1.2.5: handles "10A" suffix) |
| `HI_NUM_11` | `HI_NUM_L` | TEXT | "39" left-side range maximum |
| `LO_NUM_12` | `LO_NUM_R` | TEXT | "32" right-side range minimum |
| `HI_NUM_13` | `HI_NUM_R` | TEXT | "50" right-side range maximum |
| `BEGIN_A14`-`END_ADD21` | `BEGIN_ADDR_*` / `END_ADDR_*` | INT/TEXT | Address-point endpoints (NOT v1.3-used; out of scope) |
| `LOW_NUM22`-`HIGH_NU25` | `LOW_NUM_ODD`/`HIGH_NUM_ODD`/`LOW_NUM_EVEN`/`HIGH_NUM_EVEN` | INT | Range aggregates by parity (NOT v1.3-used; LO_NUM_L/R + PARITY_L/R sufficient) |
| `LINEAR_26` | `LINEAR_NAME` | TEXT | **"Daisy" — BASE NAME (no suffix)** — used for divided-road `IS DISTINCT FROM` comparison per C-v1.3.7 |
| `LINEAR_27` | `LINEAR_NAME_TYPE` | TEXT | "Ave" / "St" / "Rd" — street type suffix |
| `LINEAR_28` | `LINEAR_NAME_DIR` | TEXT | "N" / "S" / "E" / "W" / NULL — directional |
| `LINEAR_29` | `LINEAR_NAME_DESC` | TEXT | Additional descriptor (rare) |
| `LINEAR_30` | `LINEAR_NAME_LABEL` | TEXT | Display label (often same as `LINEAR_NAME_FULL`) |
| `FROM_IN31` | `FROM_INTERSECTION_ID` | BIGINT | **GRAPH TOPOLOGY** — segment start node ID (v1.3 §11 corner-lot detection) |
| `TO_INTE32` | `TO_INTERSECTION_ID` | BIGINT | **GRAPH TOPOLOGY** — segment end node ID |
| `ONEWAY_33` | `ONEWAY_DIR_CODE` | TEXT | One-way direction code (NOT v1.3-used) |
| `ONEWAY_34` | `ONEWAY_DIR_CODE_DESC` | TEXT | "Not One-Way" / "One-Way Northbound" / etc. |
| `FEATURE35` | `FEATURE_CODE` | INT | Numeric feature code (mirrors `FEATURE_CODE_DESC`) |
| `FEATURE36` | **`FEATURE_CODE_DESC`** | TEXT | **CLASSIFICATION** — "Local" / "Major Arterial" / "Trail" / "River" / etc. (v1.3 L25 filter discriminator) |
| `JURISDI37` | **`JURISDICTION`** | TEXT | "CITY OF TORONTO" / "PROVINCE" / "PRIVATE" / "UNKNOWN" / "FEDERAL" (v1.3 L25 filter) |
| `CENTREL38` | `CENTRELINE_STATUS` | TEXT | Status field — observed all NULL/"None" in v2; v1.3 L25 ignores |
| `OBJECTI39` | `OBJECTID` | INT | Esri auto-gen (alternative upsert key; NOT preferred) |
| `MI_PRIN40` | `MI_PRINX` | INT | Esri internal (NOT v1.3-used) |

**v1.3 L2 schema columns (18 total) map subset of source attributes:**

```sql
id, source_id (=CENTRELINE_ID), geom, linear_name_full, linear_name (base, for C-v1.3.7), linear_name_type, linear_name_dir, feature_code_desc, jurisdiction, from_intersection_id, to_intersection_id, lo_num_l, hi_num_l, lo_num_r, hi_num_r, parity_l, parity_r, oneway_dir_code_desc, source_dataset_version, created_at, updated_at
```

---

## Q0.7 — Feature type distribution + jurisdiction breakdown

**Full feature-type distribution (FEATURE_CODE_DESC, all 64,433 features):**

| Feature type | Count | v1.3 L25 disposition |
|---|---|---|
| Local | 24,889 | INCLUDE (street) |
| Trail | 11,575 | EXCLUDE (non-street) |
| Collector | 6,374 | INCLUDE (street) |
| Major Arterial | 5,865 | INCLUDE (street) |
| Laneway | 4,148 | INCLUDE (street — alleys behind houses) |
| Minor Arterial | 3,560 | INCLUDE (street) |
| Other | 2,104 | EXCLUDE (out of scope) |
| Expressway | 1,187 | INCLUDE (street/highway) |
| Expressway Ramp | 1,133 | INCLUDE (street) |
| River | 747 | EXCLUDE (non-street) |
| Pending | 648 | EXCLUDE (provisional) |
| Hydro Line | 587 | EXCLUDE (non-street) |
| Major Railway | 529 | EXCLUDE (non-street) |
| Walkway | 369 | EXCLUDE (non-street) |
| Major Shoreline | 242 | EXCLUDE (non-street) |
| Major Arterial Ramp | 171 | INCLUDE (street) |
| Creek/Tributary | 125 | EXCLUDE (non-street) |
| Access Road | 57 | INCLUDE (street) |
| Geostatistical line | 32 | EXCLUDE (non-street) |
| Minor Railway | 32 | EXCLUDE (non-street) |
| Busway | 18 | INCLUDE (street — bus-only lanes) |
| Ferry Route | 16 | EXCLUDE (non-street) |
| Collector Ramp | 16 | INCLUDE (street) |
| Other Ramp | 6 | INCLUDE (street) |
| Minor Shoreline (Land locked) | 2 | EXCLUDE (non-street) |

**Total INCLUDE = 47,424** (raw count; jurisdiction filter further narrows).

**v1.3 L25 unknown-FEATURE_CODE policy:** any value NOT in INCLUDE or EXCLUDE lists → loaded with sentinel `feature_code_desc = 'unknown_operator_review'` + WARN audit row (per H-v1.2.3 fold). Sentinel rows don't match enrichment predicates (not in street-class set); operator-triages whether to add to INCLUDE/EXCLUDE in a follow-up spec edit.

**Jurisdiction breakdown:**

| Jurisdiction | v1.3 L25 disposition |
|---|---|
| CITY OF TORONTO | INCLUDE |
| PROVINCE | INCLUDE |
| PRIVATE | INCLUDE |
| FEDERAL | EXCLUDE (border crossings, airports — out of municipal scope) |
| UNKNOWN | INCLUDE + WARN audit (operator-triage decision) |

---

## Q0.8 — Publish cadence

**DAILY refresh.** Confirmed via CKAN package metadata: `refresh_rate: "Daily"`.

→ This contradicts the original `wf1-cost-implementation-plan.md` reference which assumed annual cadence. **Material plan correction** baked into v1.3 L9:

- HEAD `Last-Modified` skip-check **7-day WARN threshold** (vs Spec 61 heritage's 2-year for quarterly cadence; Spec 59 ravine's 5-year for 10-20yr cadence)
- HEAD-failure proceeds to download (does NOT skip on failure)
- ETag + content-hash fallback per Spec 61 D6 lesson

---

## Q0.9 — Lock-ID gap-analysis

`scripts/*.js ADVISORY_LOCK_ID = N` enumeration (Phase 0 grep):
```
2, 5, 11, 12, 30, 40, 45, 46, 53, 55, 56, 57, 71, 76,
80-101, 112-115, 4201-4205
```

Spec 47 §A.5 registry has no entries for the 58-70 range gap. **Spec-level reservations:**
- 58 (Spec 58 zoning — `load-zoning.js`, future)
- 59 (Spec 59 ravine — `load-ravines.js`, future)
- 60 (Spec 59 ravine — `enrich-ravines.js`, future)
- 62 (Spec 61 heritage — `load-heritage.js`, future)
- 63 (Spec 61 heritage — `enrich-heritage.js`, future)
- 64 (Spec 61 heritage — `enrich-permits.js`, future)

**Spec 62 reservations (provisional; Phase 0 verified unassigned):**
- **65** for `load-centreline.js`
- **66** for `enrich-centreline.js`
- **64 reused** for the `applyCentrelineEnrichment` step inside `enrich-permits.js` (per L4c)

**§5.2 exception note:** Spec 47 §5.2 mandates `ADVISORY_LOCK_ID = spec_number`. Spec 62's natural ID 62 is pre-occupied by Spec 61. Per the `pipeline-advisory-lock.infra.test.ts` uniqueness enforcement, Spec 62 takes the next-available gap (65/66). v1.3 H-v1.2.11 + H-v1.3.8 + H-v1.3.9: this exception is canonically documented in §A.5 as a footnote below the 65/66 entries; L4/L4b retain only `(§5.2 exception; see §A.5 footnote)` cross-reference.

---

## Q0.10 — Address-range encoding (parity + LO_NUM/HI_NUM)

**Confirmed schema:** Each centreline segment has TWO address ranges (left side + right side of street), with:

| Column | Sample value | Type | Notes |
|---|---|---|---|
| `LO_NUM_L` | "29" | TEXT (L2 per H-v1.2.5) | Left-side range minimum |
| `HI_NUM_L` | "39" | TEXT | Left-side range maximum |
| `PARITY_L` | "O" | TEXT (1 char) | 'O' (odd) / 'E' (even) — left side parity |
| `LO_NUM_R` | "32" | TEXT | Right-side range minimum |
| `HI_NUM_R` | "50" | TEXT | Right-side range maximum |
| `PARITY_R` | "E" | TEXT (1 char) | 'O' / 'E' — right side parity |

**v1.3 L27 `address_match_status` PL/pgSQL helper** uses these for parcel-frontage detection:
1. Determine parcel's side via 2D cross-product (C-v1.3.1)
2. Match parcel.address_number against (LO_NUM, HI_NUM, PARITY) of the side
3. If matches → that segment is the frontage

**Edge cases (D4 routed):**
- Address with suffix: "10A" → L27 strips suffix for arithmetic; sees "10" in range "10..20"
- Range with suffix: "10A" as `LO_NUM_L` → L27 normalize_address_number strips to 10
- NULL parity (segment with undeclared side parity) → H-v1.3.3 policy: skip parity check, range-only match

---

## Q0.11 — Intersection-ID cross-reference (graph topology)

**Each centreline segment has TWO node references:**

| Column | Sample value | Purpose |
|---|---|---|
| `FROM_INTERSECTION_ID` | 13470540 | Start node of the segment |
| `TO_INTERSECTION_ID` | 13470553 | End node of the segment |

**Graph topology semantics:**
- Two segments sharing a node = they meet at an intersection
- A parcel touching ≥2 segments where ≥1 pair shares a node AND the segments are on different base streets (per C-v1.3.7 `linear_name` not `linear_name_full`) AND at least one of the four intersection IDs is NON-NULL (per C-v1.3.6) = **CORNER LOT**

**v1.3 §11 corner-lot CTE** uses `IS NOT DISTINCT FROM` (NULL-safe) for the 4 cross-comparison cases (`c1_from vs c2_from`, `c1_from vs c2_to`, `c1_to vs c2_from`, `c1_to vs c2_to`), gated by the at-least-one-non-NULL predicate.

**Through-lot via parallel-street geometry** (separate CTE per Step 6 of §11 SQL): cosine-based parallelism check + different-streets + NOT-corner. Per C-v1.3.7, divided roads ("Main St N" vs "Main St S") share `linear_name = 'Main'` → correctly classified as same street → NOT through-lot OR corner.

---

## Q0.12 — Sample row + first-deploy expectations

**Sample row from parsed shapefile (first feature):**

```json
{
  "_id1":      1,
  "CENTREL2":  7632579,            // CENTRELINE_ID — primary upsert key
  "LINEAR_4":  "Daisy Ave",        // LINEAR_NAME_FULL
  "LINEAR_5":  "Daisy Avenue",
  "ADDRESS6":  "29-39",            // ADDRESS_L
  "ADDRESS7":  "32-50",            // ADDRESS_R
  "PARITY_8":  "O",                // PARITY_L (odd)
  "PARITY_9":  "E",                // PARITY_R (even)
  "LO_NUM_10": 29,
  "HI_NUM_11": 39,
  "LO_NUM_12": 32,
  "HI_NUM_13": 50,
  "LINEAR_26": "Daisy",            // LINEAR_NAME (base, for divided-road comparison)
  "LINEAR_27": "Ave",              // LINEAR_NAME_TYPE
  "LINEAR_28": null,               // LINEAR_NAME_DIR (no directional)
  "FROM_IN31": 13470540,           // FROM_INTERSECTION_ID
  "TO_INTE32": 13470553,           // TO_INTERSECTION_ID
  "ONEWAY_34": "Not One-Way",
  "FEATURE36": "Local",            // FEATURE_CODE_DESC — STREET-class INCLUDE
  "JURISDI37": "CITY OF TORONTO",  // INCLUDE
  "CENTREL38": null,
  "OBJECTI39": 30
}
```

**First-deploy expectations:**

- `toronto_centreline` populated with ~47K rows post-filter
- `parcels_with_zero_centreline_intersections` rate: 10-40% expected for landlocked / federal-land / TTC ROW / private-road parcels (L21 thresholds 10% WARN / 40% FAIL — provisional, calibrated empirically post-first-deploy per H-v1.3.7)
- `is_corner_lot` rate: ~5-15% of parcels (street-grid topology dependent; Toronto's ~150-200K street intersections × parcel adjacency)
- `is_through_lot` rate: ~3-8% (mid-block lots between parallel streets — common in older grid neighborhoods)
- `primary_frontage_street_name` non-NULL rate: ~85-95% (parcels with valid address number + matched range)

**Geometry quality:**
- Validated against npm `shapefile` library — no parse errors observed
- Sample of 1000 features showed 100% valid `LineString` (no `ST_MakeValid` repair needed)
- v1.3 L8 still enforces 5% invalid-geometry FAIL threshold (defensive against future CKAN refreshes)

---

## Sources & artefacts

- CKAN package metadata: `package_show?id=toronto-centreline-tcl` (fetched 2026-05-26)
- Shapefile bundle: downloaded 117 MB zip; parsed all 64,433 features via npm `shapefile` library
- Bundled `Centreline - Version 2 fields.csv`: 40-column logical-name mapping confirmed
- Lock-ID gap-analysis: enumerated `scripts/*.js ADVISORY_LOCK_ID = N` + read Spec 47 §A.5 registry table
- Cross-spec dependency check: confirmed Spec 61 L15 uses JS-side F-C1 guard (matches v1.3 C-v1.3.5 + C-v1.3.6 alignment)
- 3-pass adversarial PLAN review folded 75 findings (20 CRIT + 32 HIGH + 23 MED) across Gemini + DeepSeek + Independent reviewers — full fold log in `.cursor/active_task.md` v1.3

---

## Phase 0 verdict

**All 12 Q0.x questions resolved.** Phase-0-first cadence enabled v1 plan to lock 27 design decisions with CKAN-confirmed data; 3 subsequent PLAN review rounds folded SQL-correctness and observability findings; v1.3 includes the complete authoritative §11 pseudo-SQL block (per Independent CRIT-R3-3 — preventing Phase 1 re-litigation).

Plan now LOCKED for Phase 1 spec authoring. Spec 62 v1.0 will be authored at `docs/specs/01-pipeline/62_source_centreline.md` using v1.3 plan as the source of truth.
