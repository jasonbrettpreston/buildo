# Source: Toronto Address Points (PRIMARY canonical address table)

<requirements>
## 1. Goal & User Story
As the **canonical** source of street-level addresses for permit + CoA matching, this script ingests ~525K master address point records from Toronto Open Data — providing precise lat/lng coordinates, normalized JOIN keys, and address-class metadata used by the spatial bridge to link permits, CoAs, and parcels.

**Role change (2026-05-23, WF1 #parcel-address-bridge):** Promoted from "geocoding fallback" to **primary address-of-record** after Toronto Open Data stripped `ADDRESS_NUMBER`, `LINEAR_NAME_FULL`, `DATE_EFFECTIVE` from the Property Boundaries CSV on 2026-05-20. `parcels.addr_num_normalized` and `parcels.street_name_normalized` retain pre-strip values via COALESCE-preserve UPSERT in `load-parcels.js`, but new addresses are sourced exclusively from this dataset.
</requirements>

---

<architecture>
## 2. Data Source

| Property | Value |
|----------|-------|
| **URL** | `ckan0.cf.opendata.inter.prod-toronto.ca/.../address-points-4326.csv` |
| **Format** | CSV (~525K rows, WGS84 coordinates + 10 new fields per WF1 #parcel-address-bridge Phase 2b) |
| **Schedule** | Quarterly (via `chain_sources`) |
| **Script** | `scripts/load-address-points.js` |
| **Lock** | 96 (§A.5) |

### Target Table: `address_points` (post mig 162, WF1 Phase 1 commit `2501aa0`)

| Column | Type | Notes |
|--------|------|-------|
| `address_point_id` | INTEGER | PK |
| `latitude` | NUMERIC | WGS84 |
| `longitude` | NUMERIC | WGS84 |
| `address_number` | TEXT | NEW — raw `ADDRESS_NUMBER` from CSV |
| `linear_name_full` | TEXT | NEW — raw `LINEAR_NAME_FULL` (e.g., "Davenport Rd") |
| `address_full` | TEXT | NEW — pre-formatted full address |
| `lo_num` | INTEGER | NEW — low end of address range (nullable) |
| `hi_num` | INTEGER | NEW — high end of address range (nullable) |
| `maint_stage` | TEXT | NEW — `REGULAR` / `PRELIMINARY` / `RETIRED`. Filter to REGULAR. |
| `address_status` | TEXT | NEW — `CURRENT` / `RETIRED` / `PENDING`. Filter to CURRENT. |
| `address_class_desc` | TEXT | NEW — `Structure` / `Structure Entrance` / `Land`. Used by link-parcels Strategy 1a + link-coa-to-parcels Tier 1a disambiguation hierarchy (PI-6 option b). |
| `class_family_desc` | TEXT | NEW — coarser class grouping. |
| `place_name` | TEXT | NEW — POI name when present. |
| `addr_num_normalized` | TEXT | DERIVED — leading-zero-stripped uppercase `address_number`. Cross-table JOIN key. |
| `linear_name_normalized` | TEXT | DERIVED — uppercase street-name component of `linear_name_full` (street_type stripped). Cross-table JOIN key. |
| `geom` | GEOMETRY(Point, 4326) | NEW — derived from `(longitude, latitude)` via `ST_SetSRID(ST_MakePoint(lng, lat), 4326)`. Used by the `parcel_address_points` bridge (mig 162). |

**PK:** `(address_point_id)`
**Upsert:** `ON CONFLICT (address_point_id) DO UPDATE` with `COALESCE(NULLIF(EXCLUDED.X, ''), address_points.X)` on the 10 source + 2 normalized columns. lat/lng use bare assignment (skip-guard at row-parse stage prevents NULL coords from reaching UPSERT). `geom` computed in-SQL on every UPSERT.
**Indexes:** GIST partial on `geom WHERE geom IS NOT NULL`; btree partials on `addr_num_normalized` + `linear_name_normalized WHERE … IS NOT NULL` (mig 162).

### Bridge: `parcel_address_points` (mig 162, populated by `link-parcel-addresses.js` Phase 2c)

| Column | Type | Notes |
|--------|------|-------|
| `parcel_id` | INTEGER | FK → `parcels.id` ON DELETE CASCADE |
| `address_point_id` | INTEGER | FK → `address_points.address_point_id` ON DELETE CASCADE |
| `computed_at` | TIMESTAMPTZ | DEFAULT NOW(); RUN_AT-bound write from `link-parcel-addresses.js` |

**PK:** `(parcel_id, address_point_id)` — covers parcel_id prefix lookups; one reverse btree index on `address_point_id`.
**Populated by:** `link-parcel-addresses.js` (lock 115, sources chain) via batched `ST_Within(ap.geom, p.geom)` PK-ordered parcel batches.
</architecture>

---

<behavior>
## 3. Behavioral Contract

### Core Logic (load-address-points.js)
1. Download CSV from Toronto Open Data
2. Stream-parse rows; first record's keys captured for drift detection (`address_points_csv_schema_drift` audit row)
3. Per-row normalization via `scripts/lib/address-normalizers.js` (shared with `load-parcels.js` to guarantee cross-loader JOIN-key consistency)
4. Batch UPSERT (BATCH_SIZE=1000, 15 bind params per row + computed `geom`)
5. COALESCE-preserve all 10 source + 2 normalized columns against future CKAN strip events

### Disambiguation hierarchy (consumed by Strategy 1a / Tier 1a — WF1 plan v4 fold H5)
1. `address_class_desc`: Structure (1) > Structure Entrance (2) > Land (3) > other (4)
2. `ST_Area(p.geom::geography) ASC` — narrower parcel wins cross-parcel ties (fold C2: `::geography` cast yields square meters; raw `ST_Area` on `GEOMETRY(*, 4326)` returns square *degrees*)
3. `address_point_id ASC` — stable deterministic final tiebreaker

### Edge Cases
- Coordinate system mismatch → CSV is pre-projected to WGS84 (EPSG:4326)
- Duplicate `address_point_id` within batch → idempotent via `ON CONFLICT DO UPDATE`
- `MAINT_STAGE` / `ADDRESS_STATUS` NULL → treated as REGULAR/CURRENT (NULL fallback for pre-Phase-2b imports)
- Mid-file CSV column drift → captured by `address_points_csv_schema_drift` audit row (WARN, not FAIL)
- `address_number` null fraction ≥ 10% → `address_points_null_address_number_pct` WARN (defense-in-depth against next CKAN strip)

### Observability (Spec 48 §3.6 row-derived cascade)
emitMeta reads — 14 CSV columns: `ADDRESS_POINT_ID, ADDRESS_NUMBER, LINEAR_NAME_FULL, ADDRESS_FULL, LO_NUM, HI_NUM, MAINT_STAGE, ADDRESS_STATUS, ADDRESS_CLASS_DESC, CLASS_FAMILY_DESC, PLACE_NAME, LATITUDE, LONGITUDE, geometry`.
emitMeta writes — 16 persisted columns including derived `addr_num_normalized`, `linear_name_normalized`, `geom`.
</behavior>

---

<constraints>
## 4. Operating Boundaries
- **Scripts:** `scripts/load-address-points.js` (loader), `scripts/one-time/backfill-address-points-geom.js` (one-time geom backfill, lock 116 — see Phase 2a commit `4758f2d`), `scripts/link-parcel-addresses.js` (spatial bridge populator, lock 115 — see Phase 2c commit `d44b445`)
- **Consumed by:** `link-parcels` Strategy 1a (commit `1ba020b`), `link-coa-to-parcels` Tier 1a bridge path (commit `986409e`), `geocode-permits` (address lookup)
- **Cross-Spec Dependencies:** Spec 55 (parcels — bridge target), Spec 41 (chain_permits — Strategy 1a consumer), Spec 42 (chain_coa — Tier 1a consumer), Spec 47 §A.5 (locks 96/115/116)
- **Relies on:** `pipeline_system.md` (SDK), `pipeline_observability.md` §3.6 (audit_table)
</constraints>
