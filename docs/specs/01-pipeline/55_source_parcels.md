# Source: Toronto Property Parcels

<requirements>
## 1. Goal & User Story
As the spatial linking foundation, this script ingests property lot polygon boundaries from Toronto Open Data — enabling the system to determine exactly which land parcel a building permit falls within, calculate lot sizes, and link permits to 3D massing volumes.

**Architecture change (2026-05-23, WF1 #parcel-address-bridge):** This dataset is no longer the canonical source of street-level addresses. Toronto Open Data stripped `ADDRESS_NUMBER`, `LINEAR_NAME_FULL`, `DATE_EFFECTIVE` from the Property Boundaries CSV on 2026-05-20. The 3 columns remain as LEGACY columns on the `parcels` table (preserved via COALESCE-UPSERT in `load-parcels.js`), but new address data is sourced from Spec 54 (Address Points) via the `parcel_address_points` spatial bridge.
</requirements>

---

<architecture>
## 2. Data Source

| Property | Value |
|----------|-------|
| **URL** | `ckan0.cf.opendata.inter.prod-toronto.ca/.../Property Boundaries - 4326.csv` |
| **Format** | CSV (~327 MB, WKT polygon geometries, WGS84) |
| **Schedule** | Quarterly (via `chain_sources`) |
| **Script** | `scripts/load-parcels.js` |
| **Lock** | 55 (§A.5) |

### CKAN strip event (2026-05-20)

The Toronto Open Data Property Boundaries CSV historically published 7 columns. On 2026-05-20 the publisher reduced this to 4:

| Column | Pre-strip | Post-strip | Status |
|--------|-----------|------------|--------|
| `PARCELID` | ✓ | ✓ | Required |
| `FEATURE_TYPE` | ✓ | ✓ | Required |
| `STATEDAREA` | ✓ | ✓ | Required |
| `geometry` | ✓ | ✓ | Required (GeoJSON) |
| `ADDRESS_NUMBER` | ✓ | — | **STRIPPED** — sourced via Spec 54 bridge |
| `LINEAR_NAME_FULL` | ✓ | — | **STRIPPED** — sourced via Spec 54 bridge |
| `DATE_EFFECTIVE` | ✓ | — | **STRIPPED** — sourced via Spec 54 bridge |

`scripts/lib/parcels-csv-drift.js` `REQUIRED_CSV_COLUMNS` is frozen at the 4 surviving columns. `scripts/quality/assert-schema.js` `EXPECTED_PARCEL_COLUMNS` matches.

### Target Table: `parcels`

| Column | Type | Source post-2026-05-20 | Notes |
|--------|------|------------------------|-------|
| `id` | SERIAL | n/a | PK |
| `parcel_id` | TEXT | CSV `PARCELID` | Toronto's identifier |
| `feature_type` | TEXT | CSV `FEATURE_TYPE` | |
| `geometry` | JSONB | CSV `geometry` | GeoJSON polygon |
| `geom` | GEOMETRY(*, 4326) | derived from `geometry` | Spatial index |
| `centroid_lat` / `centroid_lng` | NUMERIC | `compute-centroids.js` | |
| `address_number` | TEXT | **LEGACY** — pre-strip data preserved via COALESCE; new addresses via Spec 54 bridge | |
| `linear_name_full` | TEXT | **LEGACY** — same as above | |
| `addr_num_normalized` | TEXT | **LEGACY** — same as above; cross-table JOIN key with Spec 54 `address_points.addr_num_normalized` | Shared normalizer in `scripts/lib/address-normalizers.js` |
| `street_name_normalized` | TEXT | **LEGACY** — same as above; JOIN key with `address_points.linear_name_normalized` | |
| `street_type_normalized` | TEXT | **LEGACY** — same as above | |
| `date_effective` | DATE | **LEGACY** — same as above | |
| `stated_area_raw` | TEXT | CSV `STATEDAREA` | |
| `lot_size_sqm` / `lot_size_sqft` | NUMERIC | derived from `geometry` | |

**Enrichment-written columns (NOT load-parcels — listed here as the parcels-schema SoT):** zoning feed (Spec 65 §2, mig 165), max-build envelope (Spec 65 §4, mig 185), and the **existing-structure feed** (Spec 65 §5, mig 187): `existing_footprint_sqm`, `existing_stories`, `existing_height_m`, `existing_gfa_sqm`, `existing_width_m`, `existing_length_m`, `existing_structure_confidence` (TEXT high/low), `existing_other_structures_count`, `existing_other_structures_sqm`, `existing_greenspace_sqm` — derived by `enrich-parcels.js` from the PRIMARY linked building (Spec 56 massing) + lot; NULL where no building is linked. Propagated to permits + coa_applications (mig 188).

**PK:** `(id)` — auto-generated; `parcel_id` UNIQUE.
**Upsert:** `ON CONFLICT (parcel_id) DO UPDATE`. Day-1 critical safety (WF1 Phase 1 commit `2501aa0`): all 5 address-derived columns use `COALESCE(NULLIF(EXCLUDED.X, ''), parcels.X)` to preserve pre-strip values when EXCLUDED is empty. WHERE-clause NULLIF guards prevent spurious WAL writes on no-op updates.
</architecture>

---

<behavior>
## 3. Behavioral Contract

### Core Logic
1. Download 327 MB CSV from Toronto Open Data
2. Stream-parse with batched INSERTs to stay under memory limits
3. Parse WKT/GeoJSON polygons; compute lot area + irregularity ratio
4. Filter expired parcels (`date_expiry < today`)
5. Upsert to `parcels` table with COALESCE-preserve on LEGACY columns
6. Surface CSV column drift via `parcels_csv_schema_drift` audit row (WARN, not FAIL — assert-schema is the FAIL gate)

### Edge Cases
- 327 MB file size → streaming parser required (Spec 47 §9.5)
- Expired parcels → filtered out before insert
- Missing centroid → computed by downstream `compute-centroids.js` step
- CSV column drift (e.g., next CKAN strip) → captured by `parcels_csv_schema_drift` audit row + frozen `REQUIRED_CSV_COLUMNS`

### Observability (Spec 48 §3.6 row-derived cascade)
emitMeta reads — 5 surviving CSV columns: `PARCELID, FEATURE_TYPE, STATEDAREA, geometry, DATE_EXPIRY`. (The 3 STRIPPED columns are NOT in the reads-list — they no longer exist in the source.)
emitMeta writes — all `parcels` table columns including LEGACY 5 (still written on every UPSERT via COALESCE).
</behavior>

---

<constraints>
## 4. Operating Boundaries
- **Script:** `scripts/load-parcels.js`
- **Consumed by:** `link-parcels` Strategy 1b/2/3 (legacy parcels-table exact + name-only + spatial) — see Spec 41; `link-coa-to-parcels` legacy Tier 1a/1b fallback — see Spec 42
- **Cross-Spec Dependencies:** Spec 54 (Address Points — canonical address source via `parcel_address_points` bridge), Spec 47 §A.5 (lock 55)
- **Relies on:** `pipeline_system.md` (SDK), `scripts/lib/address-normalizers.js` (shared normalizer ensures JOIN-key consistency with Spec 54)
</constraints>
