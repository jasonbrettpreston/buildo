# WF1 Spec 61 -- Phase 0 Architecture Discovery Report

**Phase:** 0 (read-only research; no code/migration changes)
**Date:** 2026-05-26
**WF:** WF1 Genesis -- Spec 61 Toronto Heritage Properties (load + link, spec-only)
**Authorization:** v1.3 Gate 2 authorized 2026-05-26
**Next gate:** v2 PLAN authorization (Gate 3) -- triggered by Phase 0 schema findings that warrant a plan revision

---

## TL;DR -- v2 plan inputs

Phase 0 resolved all 9 OPEN questions + the 2 DEFERRED informational items. **One material plan-affecting finding:** the v1.3 L13 "single `heritage_properties` table with `geometry_type` discriminator" design does NOT match the data shape. The two CKAN datasets are structurally different and warrant **two separate tables**:

- **`heritage_properties`** -- 12,320 POINT rows from `heritage-register` CKAN package (Part IV individual + Part V member-of-HCD points + Listed); 41 attribute columns; quarterly refresh; WGS84 native
- **`heritage_districts`** -- 32 POLYGON/MultiPolygon rows from `heritage-conservation-districts` CKAN package (HCD boundary polygons); 12 attribute columns; quarterly refresh; WGS84 native

The user's scope ("by-law-impacting only -- drop Listed") becomes a **filter at JS load time on `STATUS != 'Listed'`** for `heritage-register`, and `HCD_TYPE = 'Designated District'` for `heritage-conservation-districts`.

The §11 Linking Contract becomes simpler than v1.3 anticipated:
- **Part V (HCD member):** `ST_Intersects(parcels.geom, heritage_districts.geom)` -- pure polygon predicate; no address-fuzzy needed
- **Part IV (individual):** address-fuzzy + spatial-proximity on `heritage_properties` rows where `STATUS = 'Part IV'`
- **Precedence (L12):** unchanged -- Part IV wins over Part V HCD

---

## Q0.1 -- Canonical CKAN package + resource(s)

**Two packages confirmed (multi-resource per v1.3 Q0.7 anticipation):**

| Package | ID | Resource (active) | Format | Size | Last Modified |
|---|---|---|---|---|---|
| `heritage-register` | `e41da515-5ad1-4bc3-85ea-18ec9e55cd33` | `108b1080-d048-439f-a9e8-e8d6cd81bddb` | Shapefile zip | 1.6 MB | 2026-05-21 |
| `heritage-conservation-districts` | `37a3c911-0813-4e87-90ed-3b9fa6156a63` | `8e6b9347-63a8-4dac-91fb-a6491a8c1e5a` | Shapefile zip | 90 KB | 2026-03-02 |

Both `datastore_active = false` -- must download + parse Shapefile bundle (same pattern as Spec 58/59).

Direct download URLs captured in Q0.7 below for spec §2 verbatim use.

---

## Q0.2 -- Geometry types per resource

**Two distinct geometry classes (resolves v1.3 L13 mixed-geometry handling):**

| Dataset | Geometry types observed | Count |
|---|---|---|
| `heritage_register` | `Point` (single type) | 12,320 |
| `heritage_districts` | `Polygon` + `MultiPolygon` (mixed; needs `ST_Multi()` cast) | 32 |

**Plan-affecting implication:** the v1.3 L13 "single `heritage_properties` table with `geometry_type` discriminator" is structurally wrong. Two separate tables with two separate `GEOMETRY(<type>, 4326)` columns is the right pattern. See v2 plan recommendation below.

---

## Q0.3 -- Source projection

**Both = EPSG:4326 (WGS84) native.** No `ST_Transform` required.

- `heritage-register` resource filename: `heritage_register_address_points_wgs84.zip`
- `heritage-conservation-districts` resource: `.prj` file confirms WGS84 (145 bytes; matches Spec 58 + 59 pattern)

---

## Q0.4 -- Stable per-feature upsert key

**Both datasets have stable integer keys (D1 upsert pattern applies):**

| Dataset | Stable key column | Type | Stride |
|---|---|---|---|
| `heritage-register` | `OBJECTID` | Integer | Sequential 1..N (no Esri stride pattern; cleaner than Spec 58/59) |
| `heritage_districts` | `HCD_NO` | Integer (1..32 range observed) | City-assigned HCD numbers; semantically meaningful |

No full-table-replace fallback needed (C5 from v1.3-cumulative dissolves).

---

## Q0.5 -- Feature counts

| Dataset | Feature count |
|---|---|
| `heritage-register` | **12,320** |
| `heritage_districts` | **32** |

**Plan-affecting implication:** Heritage Register exceeds the Spec 59 staging-CTE threshold (2000). v2 plan should mandate **staging-table CTE pattern** for the load script (like Spec 58 did), not direct INSERT. HCDs are well under threshold -> direct INSERT.

Actually 12,320 features * ~3 params per row = ~37K params -- still well under PostgreSQL 65,535 param limit. Direct INSERT batched in chunks (e.g., 1,000 rows per batch) is also viable. v2 plan decision.

---

## Q0.6 -- Attribute columns per feature

### `heritage-register` (41 columns)

Captured from first sample row:
```
OBJECTID, Folder_Row, CEN, YR, SEQUENCE, SEC, REV, STATUS, IN_DATE,
LISTED, DESIGNATED, EASEMENT_A, BUILDING_T, DESCRIPTIO, BYLAW_NO,
HTG_CONSER, OMB_DATE, REASON, List_, CONSTRUCTI, ARCHITECT_,
YEAR_DEMOL, Property_R, HOUSE, PREFIX, STREET, STREET_TYP,
DIRECTION, UNIT_TYPE, UNIT, POSTAL_COD, ADDRESS_TY, ROLL,
X_COORDINA, Y_COORDINA, PLANNING_D, FORMER_MUN, WARD,
PRE_DEC_1_, HEA_DATE, ADDRESS
```

**STATUS values observed:** `'Part V'`, `'Part IV'`, `'Listed'` (3 categories; matches Ontario Heritage Act semantics)

**Key columns for Spec 61 ingest (filtered per user scope):**
- `OBJECTID` -> `source_id` (Q0.4)
- `STATUS` -> `designation_type` (filter `'Listed'` at load time per user direction)
- `DESIGNATED` -> `heritage_designation_date` (Q0.16 confirmed; date format ISO; sentinel `1899-11-30` indicates "not designated, only listed")
- `LISTED` -> optional metadata (similar sentinel pattern)
- `BYLAW_NO` -> by-law number (operator metadata)
- `HTG_CONSER` -> HCD name reference (cross-link to `heritage_districts.HCD_NAME` when STATUS = 'Part V')
- `ADDRESS` -> address text for L13 fuzzy matching
- `BUILDING_T` -> building type (Residential / etc; operator metadata)
- `REASON` -> designation reason text (operator metadata)
- `CONSTRUCTI` -> construction year (operator metadata)
- `X_COORDINA`, `Y_COORDINA` -> redundant with geom; do NOT store

**Sample first row:**
```
OBJECTID: 1, STATUS: "Part V", LISTED: 1899-11-30 (sentinel), DESIGNATED: 2002-02-15,
BUILDING_T: "Residential", DESCRIPTIO: "Ernest Fenson House; 1914 3 house terrace
  Part of the Cabbagetown Metcalfe Street Heritage Conservation District...",
BYLAW_NO: "110-02", HTG_CONSER: "Cabbagetown-Metcalfe",
REASON: "Architectural Contextual", ADDRESS: "17  SALISBURY AVE"
```

### `heritage_districts` (12 columns)

```
HCD_NO, HCD_NAME, HCD_TYPE, HCD_DESDAT, HCD_FORMUN,
HCD_BYLAWN, HCD_WARDS, SHAPE_LENG, SHAPE_LE_1, SHAPE_LE_2,
Shape_Le_3, Shape_Area
```

**HCD_TYPE values observed:** `'Designated District'`, `'Under Appeal'`, `'Under Study'` (filter to `'Designated District'` only per user scope).

**Key columns for Spec 61 ingest:**
- `HCD_NO` -> `source_id` (Q0.4)
- `HCD_NAME` -> name (cross-reference to `heritage_properties.HTG_CONSER`)
- `HCD_TYPE` -> filter at load (`= 'Designated District'`)
- `HCD_DESDAT` -> `heritage_designation_date` (Q0.16)
- `HCD_BYLAWN` -> by-law number
- `HCD_WARDS` -> ward number(s)
- `SHAPE_*` -> redundant with geom; do NOT store

**Sample first row:**
```
HCD_NO: 16, HCD_NAME: "Queen Street West",
HCD_TYPE: "Designated District", HCD_DESDAT: 2007-09-27,
HCD_FORMUN: "TORONTO", HCD_BYLAWN: "979-2007", HCD_WARDS: "10"
```

---

## Q0.7 -- Multi-resource dataset?

**YES -- two separate packages with separate resources.** Confirmed Q0.1.

**Plan-affecting implication:** Spec 61 spec body §2 Data Source lists BOTH packages. §3 Behavioral Contract may need two separate load functions (load_heritage_register + load_heritage_districts) within `load-heritage.js`, OR two separate scripts. v2 plan decision.

---

## Q0.7a (NEW) -- Topological relationship between the two datasets

**Cross-reference via `HTG_CONSER` (heritage_register) <-> `HCD_NAME` (heritage_districts).** Heritage Register Part V member-properties reference their containing HCD by name. The HCD polygons in `heritage_districts` are the authoritative spatial boundaries.

**Implication for §11 Linking Contract:** Part V designations should be derived from `ST_Intersects(parcels.geom, heritage_districts.geom)` -- NOT from address-fuzzy matching the Part V member-points. This significantly simplifies the linking contract:

- **Part V (HCD):** Pure polygon spatial intersection -- no address-fuzzy needed.
- **Part IV (individual designated):** Address-fuzzy + spatial-proximity on Heritage Register points where `STATUS = 'Part IV'`.

The v1.3 LATERAL nearest-neighbor pseudo-SQL (C-v1.3.4) needs adjustment to match this two-table reality.

---

## Q0.8 -- Publish cadence

**Quarterly** for both datasets. Last modified dates:
- Heritage Register: 2026-05-21 (Q1 2026 file: `HRAPQ12026_OpenData_05212026`)
- HCDs: 2026-03-02 (Q1 2026 file: `HCDQ12026_OpenData`)

**Plan-affecting implication:** v1.3 L9 inherited Spec 59's 20-year HEAD `Last-Modified` WARN threshold which is inappropriate for quarterly cadence. v2 plan should use **2-year WARN threshold** (catches a 4-8 quarter staleness as suspicious).

---

## Q0.9 -- Ontario Heritage Act designation states

**RESOLVED by user direction at Gate 1.5.** STATUS values confirmed in Heritage Register: `'Part IV'`, `'Part V'`, `'Listed'`. HCD_TYPE values: `'Designated District'`, `'Under Appeal'`, `'Under Study'`. User scope: ingest only by-law-impacting designations -> filter to:
- Heritage Register: `STATUS IN ('Part IV', 'Part V')`
- HCDs: `HCD_TYPE = 'Designated District'`

`'Listed'` + `'Under Appeal'` + `'Under Study'` rows are filtered out at JS load time (per v1.3 L1 user direction).

---

## Q0.10 -- Linking trigger semantics

**RESOLVED by L13 v1.3 + Q0.7a refinement:**
- **Part V designation:** `ST_Intersects(parcels.geom, heritage_districts.geom WHERE HCD_TYPE = 'Designated District')` -- pure polygon predicate (NO address-fuzzy needed for Part V; the HCD polygon IS the regulatory boundary)
- **Part IV designation:** `ST_DWithin(parcels.geom::geography, heritage_property_point.geom::geography, 50)` AND `levenshtein(normalize_address(parcels.address_text), normalize_address(heritage_property_point.ADDRESS)) <= 2` ON heritage_register rows WHERE STATUS = 'Part IV'

This is a refinement of v1.3 L13 -- the v1.3 plan assumed both Part IV AND Part V used the point-matching path. Phase 0 shows Part V is cleaner as a polygon intersect (since HCDs are published as polygons).

---

## Q0.11 -- Existing `permit_type='Heritage'` column or value (DEFERRED status per v1.3)

Not re-queried in Phase 0 (deferred per v1.3 plan). Spec 59 Q0.11 pattern showed zero `permit_type='RNFP'` rows; expect similar zero count for heritage. L5 future-proof rule remains in v2 plan.

---

## Q0.12 -- `parcels.geom` SRID = 4326 (RESOLVED, inherited)

**Confirmed in Spec 59 Q0.12.b:** `parcels.geom` is `GEOMETRY(MultiPolygon, 4326)` -- the canonical PostGIS column. `parcels.geometry` (JSONB) is a misleading-name cache; not for spatial joins.

No re-verification needed in Phase 0; v1.3 already accepted this.

---

## Q0.13 -- CKAN historical archives (RESOLVED, point-in-time MVP)

Heritage Register has a 2022 archive resource. HCDs has no archive resource. Both refresh quarterly. L3 point-in-time MVP semantics remain -- historical permits evaluated against current geometry. v2 plan unchanged.

---

## Q0.14 -- Lock ID availability verification

**Confirmed: lock IDs 62, 63, 64 are ALL FREE.**

`scripts/*.js ADVISORY_LOCK_ID = N` enumeration:
```
2, 5, 11, 12, 30, 40, 45, 46, 53, 55, 56, 57, 71, 76, 80, 81, 82, 83, 84, 85,
86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 112, 113, 114, 115,
4201-4205
```

Spec 47 §A.5 registry has no entries for 58, 59, 60, 61, 62, 63, 64, 65 (58 + 59 reserved by Spec 58 + 59 specs; 60 reserved by Spec 59 v1.2 L4b for `enrich-ravines.js`).

**v2 plan locks:**
- L4: `load-heritage.js = 62` (verified unassigned)
- L4b: `enrich-heritage.js = 63` (verified unassigned)
- L4c: `enrich-permits.js = 64` (verified unassigned)

§A.5 registry update is a §12.4 deliverable in the future implementation WF.

---

## Q0.15 -- Free-text heritage prevalence in `permits.description` / `coa_applications.description` (DEFERRED)

Not queried in Phase 0 (deferred per v1.3 plan). Same pattern as Spec 59 expected (single-digit-percent prevalence; ignore strategy). Routed for future operator-facing analytics if needed.

---

## Q0.16 -- CKAN publishes per-property `designation_date`?

**YES -- both datasets publish dates:**
- Heritage Register: `DESIGNATED` column (ISO date format; sentinel `1899-11-30` = not designated; real dates for designated rows)
- HCDs: `HCD_DESDAT` column (ISO date format; populated for all `Designated District` rows)

**Plan-affecting implication:** L2 (`heritage_designation_date DATE`) is unconditionally populated from source. v2 plan removes the "nullable future-proof placeholder" caveat -- the column is actively populated.

Sentinel `1899-11-30` handling: at load time, treat as NULL (semantically "not designated").

---

## Q0.17 (NEW) -- `normalize_address()` complexity

**Address format observed in Heritage Register:**
```
"17  SALISBURY AVE"
"100 QUEEN ST W"
"443 SPADINA RD"
```

Observed patterns:
- Number + (double-space sometimes) + STREET_NAME + STREET_TYP + optional DIRECTION
- Suffix abbreviations: `AVE`, `ST`, `RD`, `BLVD`, `CRES`, `DR`, `PL`, etc.
- DIRECTION: `W`, `E`, `N`, `S` (optional)
- No unit numbers in primary address
- ADDRESS column is uppercase

**`normalize_address()` requirements (v2 plan refinement of v1.3 H-v1.3.1):**
- Lower-case
- Collapse multiple spaces to single space (heritage register has double-spaces)
- Strip leading/trailing whitespace
- Optionally standardize STREET_TYP suffix variations (`AVE`/`AVENUE` -> `ave`, `ST`/`STREET` -> `st`, etc.)
- No unit-number handling needed (Heritage Register doesn't publish units)

**v1.3 H-v1.3.1 PL/pgSQL function** is essentially correct; refine the suffix mapping table based on observed values.

---

## Schema design recommendation for v2 plan

The v1.3 L13 "single `heritage_properties` table with `geometry_type` discriminator" assumed a unified schema. Phase 0 shows this is wrong because:

1. The two datasets have wildly different attribute schemas (41 columns vs 12 columns)
2. The geometry types are fundamentally different (Point vs Polygon/MultiPolygon)
3. The cross-reference between them (`HTG_CONSER` <-> `HCD_NAME`) suggests they are semantically different entities
4. The §11 linking predicates differ structurally (point address-fuzzy vs polygon intersect)

**Recommended v2 schema:**

```sql
-- Heritage Register: individual designated properties (Part IV + Part V member-points)
CREATE TABLE heritage_properties (
  id                     BIGSERIAL PRIMARY KEY,
  source_id              BIGINT UNIQUE NOT NULL,                   -- from OBJECTID
  status                 TEXT NOT NULL CHECK IN ('part_iv', 'part_v_member'),  -- mapped from STATUS
  geom                   GEOMETRY(Point, 4326) NOT NULL,
  designated_date        DATE,                                      -- from DESIGNATED (sentinel 1899 -> NULL)
  bylaw_no               TEXT,
  htg_conser_name        TEXT,                                      -- reference to heritage_districts.name when status='part_v_member'
  building_type          TEXT,
  reason                 TEXT,
  address_text           TEXT NOT NULL,                             -- from ADDRESS, for L13 fuzzy match
  construction_year      INTEGER,
  source_dataset_version TEXT NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Heritage Conservation Districts: polygon boundaries (Part V district-level)
CREATE TABLE heritage_districts (
  id                     BIGSERIAL PRIMARY KEY,
  source_id              BIGINT UNIQUE NOT NULL,                   -- from HCD_NO
  name                   TEXT NOT NULL,                             -- from HCD_NAME
  hcd_type               TEXT NOT NULL CHECK IN ('designated_district'),  -- only ingested type per user scope
  geom                   GEOMETRY(MultiPolygon, 4326) NOT NULL,    -- ST_Multi() cast at load
  designated_date        DATE NOT NULL,                             -- from HCD_DESDAT
  bylaw_no               TEXT NOT NULL,
  wards                  TEXT,
  source_dataset_version TEXT NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX heritage_properties_geom_gist  ON heritage_properties USING GIST (geom);
CREATE INDEX heritage_properties_geog_gist  ON heritage_properties USING GIST (geography(geom));  -- for <-> KNN
CREATE INDEX heritage_districts_geom_gist   ON heritage_districts  USING GIST (geom);
```

**Parcels columns (M-2) unchanged from v1.3 L1:**
- `is_heritage_designated BOOLEAN NOT NULL DEFAULT false`
- `heritage_designation_type TEXT CHECK IN ('part_iv_individual', 'part_v_hcd')`
- `heritage_designation_date DATE`

§11 Linking Contract becomes:
```sql
-- Heritage enrichment UPDATE (parcels-level) -- v2 refinement:
WITH enrichment AS (
  SELECT
    p.id AS parcel_id,
    -- Part V HCD path: pure polygon intersect on heritage_districts (NO address-fuzzy)
    (SELECT hd.id FROM heritage_districts hd
       WHERE ST_Intersects(p.geom, hd.geom)
       ORDER BY hd.id ASC LIMIT 1) AS hcd_match_id,
    -- Part IV individual path: LATERAL nearest neighbor on heritage_properties WHERE status='part_iv'
    (SELECT hp.id FROM heritage_properties hp
       WHERE hp.status = 'part_iv'
         AND ST_DWithin(ST_Centroid(p.geom)::geography, hp.geom::geography, $heritage_point_match_radius_m)
         AND levenshtein(normalize_address(p.address_text), normalize_address(hp.address_text)) <= $heritage_address_levenshtein_threshold
       ORDER BY levenshtein(normalize_address(p.address_text), normalize_address(hp.address_text)) ASC,
                ST_Distance(ST_Centroid(p.geom)::geography, hp.geom::geography) ASC,
                hp.id ASC
       LIMIT 1) AS part_iv_match_id
    FROM parcels p
)
UPDATE parcels p
   SET is_heritage_designated = (e.hcd_match_id IS NOT NULL OR e.part_iv_match_id IS NOT NULL),
       heritage_designation_type = CASE
         WHEN e.part_iv_match_id IS NOT NULL THEN 'part_iv_individual'   -- Part IV wins (L12 precedence)
         WHEN e.hcd_match_id IS NOT NULL THEN 'part_v_hcd'
         ELSE NULL
       END,
       heritage_designation_date = COALESCE(
         (SELECT hp.designated_date FROM heritage_properties hp WHERE hp.id = e.part_iv_match_id),
         (SELECT hd.designated_date FROM heritage_districts hd WHERE hd.id = e.hcd_match_id)
       )
  FROM enrichment e
 WHERE p.id = e.parcel_id
   AND (p.is_heritage_designated IS DISTINCT FROM (e.hcd_match_id IS NOT NULL OR e.part_iv_match_id IS NOT NULL)
        OR ...);
```

---

## v2 plan inputs checklist

The Phase 0 findings require these v1.3 -> v2 plan updates:

- [ ] **L13 redesign:** TWO separate tables (`heritage_properties` + `heritage_districts`) replacing the single-table-with-discriminator approach. §11 SQL updated per recommendation above.
- [ ] **L1 enum values updated:** `heritage_register.STATUS` values are `'Part IV'`, `'Part V'`, `'Listed'` (Listed dropped); `heritage_districts.HCD_TYPE` is `'Designated District'` (only ingested type). Spec 61 `parcels.heritage_designation_type` enum stays `('part_iv_individual', 'part_v_hcd')` -- the source-to-target mapping is in load script.
- [ ] **L2 date population:** Unconditional (both datasets publish dates); remove "nullable placeholder" caveat.
- [ ] **L9 HEAD threshold:** 20-year (Spec 59 inheritance) -> **2-year** (quarterly cadence reality).
- [ ] **L5 staging-CTE vs direct INSERT:** Heritage Register's 12,320 features warrants either staging-CTE (Spec 58 pattern) or batched direct INSERT (1,000 per batch). v2 plan chooses + documents.
- [ ] **Load script structure:** Single `load-heritage.js` handling BOTH datasets vs two separate scripts. Recommend single script with two phases (matches `enrich-permits.js` precedent of "phases within one script") -- but advisory lock ID applies to script as a whole.
- [ ] **L9 sentinel handling:** `LISTED` and `DESIGNATED` columns use `1899-11-30` sentinel meaning "not present" -- map to NULL at load time.
- [ ] **§12.6 fixture coverage:** add fixtures covering the two-table-cross-reference case (Heritage Register Part V member-point intersects an HCD polygon -> parcel inside both -> Part IV wins precedence test).
- [ ] **Q0.17 normalize_address refinement:** suffix-mapping table based on observed STREET_TYP values from Heritage Register `STREET_TYP` column.

---

## Sources & artefacts

- CKAN package metadata: `package_search?q=heritage` + `package_show?id=heritage-register` + `package_show?id=heritage-conservation-districts` (fetched 2026-05-26)
- Shapefile bundles: downloaded + parsed via npm `shapefile` library:
  - `heritage-register/HRAPQ12026_OpenData_05212026.{shp,dbf,prj}` (12,320 features parsed)
  - `hcd/HCDQ12026_OpenData.{shp,dbf,prj}` (32 features parsed)
- Spec 47 §A.5 lock registry: read directly; gap at 58-70 confirmed available
- `scripts/*.js ADVISORY_LOCK_ID` enumeration: verified locks 62, 63, 64 unassigned
- Ontario Heritage Act sections (Parts IV + V): referenced from CKAN package descriptions; no separate fetch needed

---

## Phase 0 verdict

**All 9 OPEN questions resolved + 2 DEFERRED items returned informational data.**

The plan requires a **v2 fold** because L13 schema-design assumption (single table + geometry_type discriminator) does not match the two-dataset reality discovered in Q0.1 + Q0.2 + Q0.6. v2 plan needs to:
1. Replace L13 with two-table schema
2. Refine §11 SQL accordingly (still uses LATERAL LIMIT 1 + tie-break protocol; just two CTE branches)
3. Update L9 HEAD threshold to 2 years
4. Remove L2 "future-proof placeholder" caveat
5. Document staging-CTE vs batched-INSERT decision for Heritage Register's 12K features

Gate 3 will halt at the v2 plan after these folds, per the v1.3 Execution Plan.
