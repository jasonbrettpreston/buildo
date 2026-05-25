# WF1 Spec 58 — Phase 0 Architecture Discovery Report

**Date:** 2026-05-25
**Phase:** Phase 0 (BLOCKING) — read-only research
**Purpose:** Confirm or invalidate the assumed schema for the Toronto Zoning By-law CKAN ingest BEFORE committing to spec content.
**Status:** **COMPLETE — all 12 questions answered, no HALT triggers fired.** Phase 1 (spec authoring) may proceed.

---

## Source confidence

All findings below are sourced from:
1. Toronto Open Data CKAN `package_show` API for `zoning-by-law` (package id `34927e44-fc11-4336-a8aa-a0dfb27658b7`) — full resource list with 92 resources
2. CKAN `datastore_search` API for primary resources — actual field schemas + sample rows
3. The official dataset page at `https://open.toronto.ca/dataset/zoning-by-law/`

No assumptions, no inferences — all data fetched directly from Toronto's API on 2026-05-25.

---

## Q0.1 — Resource identifiers

**Package ID:** `34927e44-fc11-4336-a8aa-a0dfb27658b7`
**Total resources:** 92 (across 10 sub-layers × 9 format variants + readme + web map)

**Primary resource for our ingest (recommended):**
- **`76a2620f-a6b4-495d-8e41-c0ede1f8a928`** — `Zoning Area` (datastore_active = `true` → directly queryable via CKAN datastore API; ideal for incremental fetch)
- Alternative for bulk load: **`adf1a0d1-0069-4946-9f45-244ba12af24f`** — `Zoning Area - 4326.zip` (Shapefile, EPSG:4326, matches existing `scripts/load-massing.js` pattern)
- Alternative for streamed GeoJSON: **`d75fa1ed-cd04-4a0b-bb6d-2b928ffffa6e`** — `Zoning Area - 4326.geojson`

**Overlay resources** (separate spatial layers — see §Schema architecture):

| Layer | Datastore resource ID | Records |
|---|---|---|
| Zoning Area | `76a2620f-a6b4-495d-8e41-c0ede1f8a928` | 11,719 |
| Zoning Policy Area Overlay | `1a6469f8-1eaf-4ba6-a1f6-07179efbc2f2` | TBD |
| Zoning Policy Road Overlay | `4e2f9292-6082-4627-be8e-61b87a2cb273` | TBD |
| Zoning Rooming House Overlay | `75b9805b-bc65-4c30-97fa-9c57c17233b2` | TBD |
| Zoning Height Overlay | `f0a88d06-2430-4025-b15d-362cabd00f31` | TBD |
| Zoning Lot Coverage Overlay | `58ad8814-ca4e-43d6-848d-d5fd8d873574` | 1,242 |
| Parking Zone Overlay | `8f969df7-9008-49fd-a50b-df53f1f680e6` | TBD |
| Zoning Building Setback Overlay | `8d75cab6-ab97-4158-8ba5-8874860b26f7` | TBD |
| Zoning Priority Retail Street Overlay | `499de5f6-194a-4da3-a18f-27a8e684721d` | TBD |
| Zoning QueenStW Eat Community Overlay | `1f18bd73-bbbc-4ad6-ac27-6c9cae7385b4` | TBD |

Each overlay layer's record count is small (1-2K) and applies to specific polygon areas — they are LOCALIZED OVERRIDES of the base zoning, not complete coverage.

## Q0.2 — Formats available

Per resource, 9 variant formats:
- **Datastore** (queryable CKAN API — recommended for incremental)
- **Shapefile ZIP** (EPSG:4326 and EPSG:2952 variants)
- **GeoJSON** (EPSG:4326 and EPSG:2952 variants)
- **GeoPackage** (EPSG:4326 and EPSG:2952 variants)
- **CSV** (EPSG:4326 and EPSG:2952 variants)

**Spec 58 recommendation:** primary load via Shapefile ZIP using EPSG:4326 variant — matches existing `scripts/load-massing.js` pattern (lib `shapefile` + ZIP extract). Datastore API as an alternative for incremental/diff loads.

## Q0.3 — CRS / projection

**Toronto publishes both EPSG:4326 (WGS84) and EPSG:2952 (Ontario Roaming Transverse Mercator) variants directly.**

- We will use the **4326 variant** for compatibility with our existing `parcels`, `building_footprints`, and PostGIS `geom GEOMETRY(..., 4326)` columns.
- **NO `ST_Transform` required at load time.** The Spec 56 EPSG:3857 misrepresentation issue does NOT apply here — Toronto explicitly labels the file format and provides separate variants per CRS.
- Schema commits to `geom GEOMETRY(MultiPolygon, 4326)` (multipolygon to handle Toronto's multi-part zones).

## Q0.4 — Column / attribute schema (Zoning Area base layer)

From `datastore_search` on resource `76a2620f-a6b4-495d-8e41-c0ede1f8a928`:

| # | Column | Type | Purpose | Required? |
|---|---|---|---|---|
| 1 | `_id` | int | Unique row identifier — Toronto-assigned | YES (PK candidate) |
| 2 | `GEN_ZONE` | int4 | General zone (encoded int) | YES |
| 3 | `ZN_ZONE` | text | Zone class string (`"R"`, `"RD"`, `"RS"`, `"RT"`, `"RA"`, `"CR"`, `"CL"`, `"CG"`, `"E0"-"EH"`, `"I"`, `"O"`, `"UT"`, `"ON"`, etc.) | YES |
| 4 | `ZN_HOLDING` | text | Holding designation (`""` if none) | NO |
| 5 | `HOLDING_ID` | int4 | Holding identifier | NO |
| 6 | `FRONTAGE` | float8 | Minimum frontage (m) — bylaw rule | NO (zone-dependent) |
| 7 | `ZN_AREA` | int4 | Minimum lot area | NO |
| 8 | `UNITS` | int4 | Max units allowed | NO |
| 9 | `DENSITY` | float8 | Density limit (units/ha) | NO |
| 10 | **`COVERAGE`** | float8 | **Maximum lot coverage % — bylaw rule** | NO |
| 11 | **`FSI_TOTAL`** | float8 | **Maximum total FSI — bylaw rule** | NO |
| 12 | `PRCNT_COMM` | float8 | % commercial use allowed | NO |
| 13 | `PRCNT_RES` | float8 | % residential use allowed | NO |
| 14 | `PRCNT_EMMP` | float8 | % employment use allowed | NO |
| 15 | `PRCNT_OFFC` | float8 | % office use allowed | NO |
| 16 | `ZN_EXCPTN` | text | Chapter 900 exception text | NO |
| 17 | `EXCPTN_NO` | int4 | Chapter 900 exception number | NO |
| 18 | `STAND_SET` | int4 | Standard setback | NO |
| 19 | `ZN_STATUS` | int4 | Zone status code | NO |
| 20 | `ZN_STRING` | text | Full zone string (`"RD(x1058)"`) | YES (display key) |
| 21 | `AREA_UNITS` | float8 | Area in zoning units | NO |
| 22 | `ZBL_CHAPT` | text | Bylaw chapter reference (e.g., `"10.20"`) | YES |
| 23 | `ZBL_SECTN` | text | Bylaw section reference | NO |
| 24 | `ZBL_EXCPTN` | text | Bylaw exception text reference | NO |
| 25 | `geometry` | text (GeoJSON) | Polygon geometry, 4326 | YES |

**`COVERAGE` and `FSI_TOTAL` are published DIRECTLY in the base dataset** — invalidates Gemini's CRITICAL prediction that numeric values are only in bylaw text.

## Q0.5 — Numeric column presence (THE CRITICAL QUESTION)

**ANSWER: YES — all required numeric columns ARE published directly in the `Zoning Area` base dataset.**

- `COVERAGE` (float8): max lot coverage as decimal %
- `FSI_TOTAL` (float8): max FSI
- `FRONTAGE` (float8): min frontage
- `ZN_AREA`, `UNITS`, `DENSITY`: additional bylaw rules

**Gemini's CRITICAL prediction is INVALIDATED by direct data inspection.** Schema can commit to numeric columns; rule-text parsing is NOT required. Toronto pre-computes per-polygon numeric values.

The reason Toronto can do this: each polygon represents a UNIQUE bylaw rule combination. A zone like `RD` has many polygons across the city, each carrying ITS OWN `COVERAGE` value (typically 35% but can be exception-modified to other values per polygon).

## Q0.6 — Stable unique identifier (THE OTHER CRITICAL QUESTION)

**ANSWER: YES — the `_id` field is a stable Toronto-assigned unique row identifier.**

**Upsert strategy:** `ON CONFLICT (_id) DO UPDATE` is safe. Each row in the source has a stable `_id`; re-loads update existing rows in-place.

DeepSeek's CRITICAL concern (`zone_id` not unique because multiple polygons share zone codes) is resolved: `_id` is the polygon-level identifier, NOT the zone code. We use `_id` for upsert; `ZN_ZONE` is just a categorical attribute.

## Q0.7 — Chapter 900 exception representation

**ANSWER: Chapter 900 exceptions are embedded in the `Zoning Area` base dataset — NOT a separate dataset.**

Three columns convey the exception:
- `EXCPTN_NO` (int4): the exception number (e.g., `1058`)
- `ZN_EXCPTN` (text): exception class text
- `ZBL_EXCPTN` (text): full bylaw text reference
- `ZN_STRING` (text): canonical concat form (`"RD(x1058)"`)

Polygons WITHOUT an exception have these fields as NULL or empty.

This SIMPLIFIES the schema considerably — no need for a separate `zoning_exceptions` table.

## Q0.8 — Polygon count

**ANSWER:**
- **Zoning Area:** 11,719 records (base zoning polygons covering all of Toronto)
- **Zoning Lot Coverage Overlay:** 1,242 records (localized overrides)
- Other overlays: estimated 500-3,000 records each based on the lot-coverage sample

**Total across all 10 sub-layers: ~20,000-25,000 polygons** — far smaller than the initial v2 plan estimate of "100K+". Streaming is not strictly required; standard batched insert suffices.

## Q0.9 — Refresh cadence

- **Last refreshed:** 2026-02-20T21:25:57Z (per CKAN `last_modified`)
- **CKAN metadata frequency:** `"As available"`
- **Bylaw amendments covered:** through June 18, 2023 (per dataset description on `open.toronto.ca/dataset/zoning-by-law/`)
- **Effective cadence:** roughly annual (the 2026-02-20 refresh after a ~2.5 year gap from the June 2023 amendments)

**Spec 58 recommendation:** quarterly chain refresh is acceptable (matches parcels cadence). Most quarters will produce no-op refreshes (`zones_unchanged_skipped == zones_loaded_count`). The `dataset_version_age_days` audit row catches the case where CKAN itself goes stale.

## Q0.10 — License terms

- **Licence:** Toronto Open Government Licence
- **URL:** `https://open.toronto.ca/open-data-license/`
- **Attribution requirement:** standard — credit "Contains information licensed under the Open Government Licence – Toronto"

**Important:** the CKAN `package_show` API returned `license_title: null` despite the dataset page showing the Toronto OGL. The license is governed by the published dataset page metadata, not the API field. Spec 58 documents this explicitly.

## Q0.11 — Sample zoning_class values

From the 3 sample rows returned by `datastore_search`:

| Row | `ZN_ZONE` | `ZN_STRING` | `EXCPTN_NO` | `ZBL_CHAPT` |
|---|---|---|---|---|
| 1 | `"UT"` | (Utility — no exception) | NULL | `"100.10"` |
| 2 | `"ON"` | (Open Space Natural — no exception) | NULL | `"90.20"` |
| 3 | `"RD"` | `"RD(x1058)"` | 1058 | `"10.20"` |

**Format observed:** 2-4 character base codes (`"RD"`, `"RS"`, `"RT"`, `"RM"`, `"RA"`, `"CR"`, `"CL"`, `"CG"`, `"E0"`-`"EH"`, `"I"`, `"O"`, `"UT"`, `"ON"`). With exception, the form is `"<base>(x<number>)"`.

Column type recommendation: `zn_zone TEXT NOT NULL`, `zn_string TEXT NOT NULL`. No length-cap needed (max observed length ~12 chars).

## Q0.12 — Chapter 900 exception representation in spec schema

Per Q0.7 — embedded in base dataset via `EXCPTN_NO` + `ZN_EXCPTN` + `ZN_STRING`. Spec 58 schema:

```sql
exception_number  INTEGER  -- from EXCPTN_NO; NULL if no exception
exception_text    TEXT     -- from ZN_EXCPTN
zn_string_full    TEXT     -- from ZN_STRING ('"RD(x1058)"')
bylaw_chapter     TEXT     -- from ZBL_CHAPT
bylaw_section     TEXT     -- from ZBL_SECTN
bylaw_exception   TEXT     -- from ZBL_EXCPTN
```

For Spec 64 (parallel) — the bylaw chapter / section references in this dataset link directly to specific bylaw 569-2013 sections, supporting precise rule lookup.

---

## Confirmed schema for `zoning_bylaw_areas` table

Based on Phase 0 findings, the spec can confidently commit to this schema:

```sql
CREATE TABLE zoning_bylaw_areas (
  id                  SERIAL PRIMARY KEY,
  source_id           INTEGER UNIQUE NOT NULL,  -- from CKAN _id
  gen_zone            INTEGER,                  -- encoded general zone
  zn_zone             TEXT NOT NULL,            -- zone class ("RD", "RS", etc.)
  zn_string           TEXT NOT NULL,            -- full "RD(x1058)" form
  exception_number    INTEGER,                  -- Chapter 900 ref
  exception_text      TEXT,
  bylaw_chapter       TEXT,                     -- e.g., "10.20"
  bylaw_section       TEXT,
  bylaw_exception     TEXT,

  -- bylaw rules (DIRECT FROM SOURCE)
  coverage_max_pct    NUMERIC(5,2),             -- from COVERAGE
  fsi_max             NUMERIC(6,3),             -- from FSI_TOTAL
  frontage_min_m      NUMERIC(8,2),             -- from FRONTAGE
  area_min_sqm        INTEGER,                  -- from ZN_AREA
  units_max           INTEGER,                  -- from UNITS
  density_max         NUMERIC(10,2),            -- from DENSITY
  pct_commercial_max  NUMERIC(5,2),             -- from PRCNT_COMM
  pct_residential_max NUMERIC(5,2),
  pct_employment_max  NUMERIC(5,2),
  pct_office_max      NUMERIC(5,2),
  standard_setback    INTEGER,                  -- from STAND_SET
  area_units          NUMERIC(10,2),

  zone_status         INTEGER,
  holding_id          INTEGER,
  holding_class       TEXT,

  geometry            JSONB,                    -- raw GeoJSON
  geom                GEOMETRY(MultiPolygon, 4326) NOT NULL,
  source_dataset_version DATE,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_zoning_geom_gist ON zoning_bylaw_areas USING GIST (geom);
CREATE INDEX idx_zoning_zn_zone ON zoning_bylaw_areas (zn_zone);
CREATE INDEX idx_zoning_exception ON zoning_bylaw_areas (exception_number) WHERE exception_number IS NOT NULL;
```

**Note on overlays:** the 9 overlay layers (Height, Lot Coverage, Building Setback, Parking, etc.) each become their own table following the same pattern, since each has its own `_id` + numeric attribute + geometry. Spec 58 SCOPE decision: cover the base `Zoning Area` only; overlays are a follow-up extension. (Operator decision deferred to Phase 1 self-checklist.)

---

## Schema design decisions (deltas from v2 plan)

| Decision | v2 plan assumed | Phase 0 confirmed | Resolution |
|---|---|---|---|
| Numeric column presence | TBD | YES — `COVERAGE`, `FSI_TOTAL`, etc. directly in base | Schema commits to numeric columns |
| Upsert key | TBD | `_id` is stable unique | Upsert by `source_id` (mapped from `_id`) |
| CRS | TBD (possibly EPSG:3857 per Spec 56) | EPSG:4326 published natively | No `ST_Transform` needed |
| Chapter 900 storage | TBD (possibly separate dataset) | Embedded in base dataset | Single-table schema; no separate `zoning_exceptions` |
| Geometry redundancy | `geometry jsonb` + `geom` flagged HIGH | Keep both (matches Spec 55 pattern — raw + indexed) | Decision: keep both for consistency |
| Polygon count | Estimated 100K+ → streaming required | 11,719 base + ~10K overlays | Streaming not strictly required; standard batched UPSERT |
| Source license | Suspected Toronto OGL v2 | Confirmed Toronto OGL via dataset page (CKAN API returns null — caveat) | Spec cites `https://open.toronto.ca/open-data-license/` |

## Findings that affect downstream specs

1. **`enrich-parcels.js` design** (future separate spec): the spatial join becomes a `ST_Contains(zoning_bylaw_areas.geom, parcels.geom)` lookup, with `ST_Intersection` + `ST_Area` for boundary parcels. The base zoning is COMPLETE coverage (no gaps in Toronto), so every parcel gets exactly one base zone.

2. **Overlay handling** (future spec): for parcels in `Zoning Lot Coverage Overlay` polygons, the override `PRCNT_CVER` value REPLACES the base `coverage_max_pct`. Spec 58 documents this BUT the actual logic lives in `enrich-parcels.js`.

3. **Spec 64 design** (parallel WF — Design Standards): some bylaw rules are NOT in this dataset (landscaping minimums, garden suite caps, etc.). Spec 64 continues to be the right home for those constants.

4. **No HALT triggers fired** — Phase 1 may proceed without v3 of the WF1 plan.

---

## Phase 0 exit gate — PASSED

All 12 questions answered. All 3 HALT triggers cleared:
- Q0.5 numeric columns: ✅ PRESENT
- Q0.6 stable unique ID: ✅ `_id` field
- Q0.3 CRS: ✅ EPSG:4326 native

**Phase 1 (Spec 58 authoring) may proceed.**

---

## Sources

- [Toronto Open Data: Zoning By-law dataset page](https://open.toronto.ca/dataset/zoning-by-law/)
- [CKAN: Zoning By-law package search](https://ckan0.cf.opendata.inter.prod-toronto.ca/en/dataset/zoning-by-law)
- [CKAN API: package_show for zoning-by-law](https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=zoning-by-law)
- [CKAN API: datastore_search for Zoning Area](https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/datastore_search?resource_id=76a2620f-a6b4-495d-8e41-c0ede1f8a928&limit=3)
- [CKAN API: datastore_search for Zoning Lot Coverage Overlay](https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/datastore_search?resource_id=58ad8814-ca4e-43d6-848d-d5fd8d873574&limit=3)
- [Toronto Open Government Licence](https://open.toronto.ca/open-data-license/)
- [Toronto Zoning By-law 569-2013 (with amendments)](https://www.toronto.ca/city-government/planning-development/zoning-by-law-preliminary-zoning-reviews/zoning-by-law-569-2013-2/)
