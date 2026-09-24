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
| **Format** | CSV (~327 MB, GeoJSON polygon geometries, WGS84) |
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
| `lot_size_sqm` / `lot_size_sqft` | NUMERIC | **CSV `STATEDAREA`** via `parseStatedArea` (load-parcels.js) — the SOURCE-stated lot area, **not** derived from geometry (doc-rot corrected WF2 P12-A1: the loader has polygon area in hand but deliberately uses STATEDAREA). NULL = source-absent. | |
| `lot_size_source` | TEXT | provenance (WF2 P12-A1, mig 214): `'stated'` (STATEDAREA) \| `'geom_backfill'` (the ~8.9K source-NULL rows backfilled with `ROUND(ST_Area(geom::geography),2)` so the LIVE cost-model T1 FSI gate + fallback GFA no longer silently skip them; 6 invalid-geom rows remain NULL). Consumers reading mixed semantics must split on this column. | |

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

### Target Files
- `scripts/load-parcels.js` — this spec defines the parcels loader's contract (§2/§3); as of batch-2 row 3.7 (commit ③, 2026-09-24) it is the §5.1 frozen shell only (`module.exports = pipeline.step(descriptor, compute)`) — see "As-built" below.
- `scripts/load-parcels.descriptor.json` — the step's declared contract (Spec 122 §5.1).
- `scripts/load-parcels.notes.json` — the descriptor's prose sidecar.
- `scripts/lib/compute/load-parcels.js` — the step's compute (shaping, checks).
- `scripts/lib/parcels-csv-drift.js` — the CSV header/null-fraction drift detector, shared with `assert_schema` (`EXPECTED_PARCEL_COLUMNS`) — its `0.10` null-address literal is a `assert-schema.descriptor.json` `fingerprint_inputs` entry, so it is NOT touched by this conversion (Rule 3 externalizes the boundary as a config value on the compute side instead; see the descriptor's `null_address_pct` check).
- `scripts/lib/address-normalizers.js` — the shared JOIN-key normalizer, also consumed by Spec 54's loader.
- `scripts/lib/safe-math.js` — shared safe arithmetic helpers (area/frontage/depth math, irregularity ratio).
- `src/tests/steps/parcels/**` — the step's violations suite.
- `scripts/quality/assert-schema.js` — this spec pins `EXPECTED_PARCEL_COLUMNS` to its own frozen 4-column CSV set (§2).

### Cross-Spec Dependencies
- `scripts/enrich-parcels.js` — this spec is the parcels-schema SoT for enrichment-written columns but explicitly disclaims owning the write logic (§2: "NOT load-parcels").
- `scripts/compute-centroids.js` — downstream step that fills `centroid_lat`/`centroid_lng` when missing (§2/§3); its own contract lives elsewhere.
</constraints>

---

## As-built — batch-2 row 3.7 (2026-09-24)

`parcels` converted onto Spec 122's frozen step standard (Spec 123 §7, COMPRESSED ①②③ form per R-PACE-1 — the INGESTOR archetype's third member; `load_ravines` class B and `address_points` class A precede it). Descriptor: `scripts/load-parcels.descriptor.json`; compute: `scripts/lib/compute/load-parcels.js`; shell: `scripts/load-parcels.js` (the §5.1 frozen form). Zero-diff conversion — the write shape reproduces the legacy statement verbatim (below); the one behaviour correction (PostGIS-absent arm, below) is a declared, judged-consistent change, not a defect fix.

- **Write class A `guarded_upsert`** — DEFAULT codegen (plan D1 REVISED, operator ruling 2026-09-24: no compute-authored SQL for INGESTORs), reproducing the legacy `INSERT … ON CONFLICT (parcel_id) DO UPDATE … WHERE <9 disjuncts> IS DISTINCT FROM` statement via two DECLARED axes: `columns[].on_empty:"preserve"` on the five address-derived LEGACY columns (the `COALESCE(NULLIF(EXCLUDED.x,''), parcels.x)` preservation) and `outputs.invalidates[].set_null_on_change_of:"geometry"` on the three lineage stamps (`ravine_dataset_version_when_enriched`, `heritage_dataset_version_when_enriched`, `centreline_dataset_version_when_enriched` — the DEC-FENCE2 CASE arms). `retract: "none"`, no DELETE anywhere — the third class-A INGESTOR after `address_points`.
- **CSV acquisition** via the INGESTOR runner's CSV path: `data/property-boundaries-4326.csv`, GeoJSON `geometry` column (the "WKT" wording this spec's §2 previously used is corrected below — doc-rot, the CSV has been GeoJSON since before this conversion). MEASURED 2026-09-24: 498,479 rows read, 495,495 shaped (2,984 filtered by feature-type/expiry/unparsable geometry), peak RSS 511 MB / heapUsed 366 MB against a 4,288 MB default heap ceiling — safe at this dataset size, no streaming ingest seam required.
- **`execution.txn_scope: "step"`** (a declared deviation from the legacy's per-1,000-row batch `withTransaction` shape): one step-scoped transaction over the whole ~495K-row load, same atomicity-window widening as `address_points`.
- **4 logic variables**: `parcels_irregularity_threshold` (0.95), `parcels_skip_rate_max_pct` (10), `parcels_download_timeout_ms`, plus the pre-existing **shared** `sources_parcels_floor` (already consumed by `assert_data_bounds`; this step's `rows_read_floor` check reuses the SAME key via `checks[].limit_from_config`, Rule 3). `SQM_TO_SQFT`/`M_TO_FT` are unit-conversion physical constants, not tunables — declared in `notes.json`, no admin knob for physics.
- **`checks[]`:** `csv_header_drift`, `null_address_pct`, `skip_rate_pct`, `rows_read_floor`, `records_errors`, `geom_parse_failures`, `shaped_skipped`.
- **PR-D1 — declared, carried verbatim.** A failed batch is logged, `errors++`, and its rows DROPPED for the run (`execution.on_batch_error: "drop_batch"` names the legacy behaviour).
- **PR-D2 — declared, carried verbatim, structurally unsatisfiable as PASS.** `null_address_pct` reads ~100% WARN on every run — Toronto Open Data stripped `ADDRESS_NUMBER` from the CSV on 2026-05-20 (§2 CKAN strip event), so the check can never clear its own `<= 0.1%` bound. Carried as a declared `limitations[]` entry rather than retired, so a future reader keeps seeing the strip named. `review_followups.md:156` stays ACT (its own WF3).
- **PR-D3 — declared, carried verbatim.** CKAN coordinate jitter (`review_followups:3075`): published polygon vertices drift sub-metre between CKAN publishes with no version/etag change, so the guard's `geometry::jsonb IS DISTINCT FROM` disjunct fires on rows whose data did not meaningfully change — the DEC-FENCE2 stamps get NULLed (and the enrich-* steps recompute) for jitter-only rows. Byte-identity is per-run, not per-source-publish.
- **PR-D4 — declared, OUT OF SCOPE.** Centroid invalidation gap (`review_followups:3114`): `compute-centroids.js`'s derived centroid is not in the DEC-FENCE2 invalidate list, so a moved parcel keeps a stale centroid until `compute_centroids` is forced full. A `compute_centroids` defect, not a `parcels` one — named, not fixed here.
- **PR-D5 — declared, carried verbatim.** The load floor is declared twice with two different numbers: the loader's own `rows_read_floor` check WARNs below 450,000 while the registered `sources_parcels_floor` seed FAILs below 460,000. Unifying the number is a DATA-POLICY change Spec 123 §3.1 forbids folding into a zero-diff conversion — PINNED, not unified.
- **Departed-but-retained parcels (class-A non-retraction, declared limitation, not a defect).** Because the loader never retracts, a `parcel_id` can only vanish from `parcels` via a source-side change the class-A shape cannot express. MEASURED via the WF3 forced-change differential (`.cursor/wf3_validate_geometries_text_key_active_task.md` Step 5, 2026-09-24): **64 residual `parcel_id`s** appear in BOTH the converted arm and a real legacy-loader arm after a perturb/reload cycle — parcels whose CSV row is gone, retained with their last-seen values, identically in both loaders. Not a conversion regression.
- **The PostGIS-absent arm — a genuine, judged-consistent behaviour change.** The legacy script probed `pg_extension` for `postgis` and silently wrote `geometry` while leaving `geom` NULL when absent, with no audit row naming the divergence. The converted step has no equivalent runtime branch: DEFAULT codegen's `geom` column unconditionally renders `ST_GeomFromWKB`, and the descriptor's `guards.requires` already declares the `idx_parcels_geom_gist` index fail-loud on-missing — a PostGIS-less database now fails the guard BEFORE acquisition rather than silently degrading. Judged consistent with the guard's own declared fail-loud posture.
- **`validateGeometries` TEXT-key CRITICAL (found and fixed on the shared runner library, NOT a `parcels`-local defect).** `parcels` is the fleet's first `key_sql_type: "TEXT"` geometry-validated step; `scripts/lib/step/write.js`'s `validateGeometries` built its join `Map` with an unconditional `Number()` coercion on one side only, which is a no-op for the numeric-keyed steps converted before it (`load_ravines` BIGINT, `address_points` INTEGER — both round-trip as numbers) but a 100% join miss for a TEXT key. Fixed in `6457e713` on the shared library (one `String()` normalizer both sides, plus a `ValidationKeyMissError` throw on any residual miss); re-verified by the WF3 Step 5 forced-change differential above. Filed and closed in `review_followups.md` (2026-09-24 CRITICAL entry, closed with the fixing sha).

### CKAN "WKT" doc-rot corrected (2026-09-24)

§2 previously described the `geometry` CSV column as "WKT polygon geometries" in the Data Source table header. MEASURED (this conversion's assessment §1, and re-confirmed at ③): the column has been GeoJSON since before this conversion — `scripts/load-parcels.js`'s legacy parser and the converted `shapeRecord` both call `JSON.parse`/`ST_GeomFromGeoJSON`, never a WKT parser. The Data Source table's `geometry` row already correctly said "Required (GeoJSON)"; only the top-level `Format` row's "WKT polygon geometries" phrase was stale — corrected to "GeoJSON polygon geometries".
