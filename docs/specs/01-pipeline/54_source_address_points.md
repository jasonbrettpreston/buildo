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
| `latitude` | NUMERIC | WGS84 — DERIVED from the CSV `geometry` GeoJSON column (loader primary path), falling back to the `LATITUDE` column only if `geometry` is absent. |
| `longitude` | NUMERIC | WGS84 — DERIVED from the CSV `geometry` column (see `latitude`). |
| `address_number` | TEXT | NEW — raw `ADDRESS_NUMBER` from CSV |
| `linear_name_full` | TEXT | NEW — raw `LINEAR_NAME_FULL` (e.g., "Davenport Rd") |
| `address_full` | TEXT | NEW — pre-formatted full address |
| `lo_num` | INTEGER | NEW — low end of address range (nullable) |
| `hi_num` | INTEGER | NEW — high end of address range (nullable) |
| `maint_stage` | TEXT | NEW — stored as-is, no filter; the loader ingests every row of the CSV (measured 2026-09-23: 525,436 CSV rows → all carried). Observed production values: `REGULAR` (98.5%, 517K rows) / `RESERVED` (1.5%, 7.7K rows) — a data observation only; consumers filter on this column if they need to. *Corrected 2026-09-24 (AP-D1, operator ruling): spec narrated a filter the loader never had.* |
| `address_status` | TEXT | NEW — stored as-is, no filter. Observed production value: `None` for 100% of rows (525K). Plan v4 originally assumed CURRENT/RETIRED/PENDING per the Toronto Open Data field catalog, but the actual CSV publishes literal `None` for every row. *Corrected 2026-09-24 (AP-D1, operator ruling): spec narrated a filter the loader never had.* |
| `address_class_desc` | TEXT | NEW — `Structure` / `Structure Entrance` / `Land`. Used by link-parcels Strategy 1a + link-coa-to-parcels Tier 1a disambiguation hierarchy (PI-6 option b). |
| `class_family_desc` | TEXT | NEW — coarser class grouping. |
| `place_name` | TEXT | NEW — POI name when present. |
| `addr_num_normalized` | TEXT | DERIVED — leading-zero-stripped uppercase `address_number`. Cross-table JOIN key. |
| `linear_name_normalized` | TEXT | DERIVED — uppercase street-name component of `linear_name_full` (street_type stripped). Cross-table JOIN key. |
| `geom` | GEOMETRY(Point, 4326) | NEW — `ST_SetSRID(ST_MakePoint(lng, lat), 4326)` where `(lng, lat)` come from the CSV **`geometry`** GeoJSON column (loader primary, `load-address-points.js:285-301`), or `LATITUDE`/`LONGITUDE` columns as fallback (`:304`). **The CSV's coordinate source is `geometry`, NOT lat/lng columns** — assert-schema + the loader drift check require `geometry` OR (`LATITUDE` AND `LONGITUDE`) per the coordinate-source contract (WF3 2026-05-30). Used by the `parcel_address_points` bridge (mig 162). |

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
- `MAINT_STAGE` / `ADDRESS_STATUS` NULL → stored as NULL; no filter or fallback substitution is applied at load time. *Corrected 2026-09-24 (AP-D1, operator ruling): spec narrated a filter the loader never had.*
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

### Target Files
- `scripts/load-address-points.js` — this spec defines the address points loader's contract (§2/§3); as of batch-2 row 3.1 (commit 9, 2026-09-24) it is the §5.1 frozen shell only (`module.exports = pipeline.step(descriptor, compute)`) — see "As-built" below.
- `scripts/load-address-points.descriptor.json` — the step's declared contract (Spec 122 §5.1).
- `scripts/load-address-points.notes.json` — the descriptor's prose sidecar.
- `scripts/lib/compute/load-address-points.js` — the step's compute (shaping, checks, `validatorCounterDelta`).
- `scripts/lib/address-points-csv-drift.js` — the CSV header/null-fraction drift detector, shared with `assert_schema` (`hasCoordinateSource`) and the ONLY `fingerprint_inputs` entry of `assert-schema.descriptor.json`; previously unregistered anywhere in the system map (registry gap closed at commit 9).
- `src/tests/steps/address_points/**` — the step's violations suite.
- `scripts/link-parcel-addresses.js` — this spec defines the `parcel_address_points` bridge populator's contract (§2 Bridge table).

### Cross-Spec Dependencies
- `scripts/load-parcels.js` — `parcels` is the bridge target Spec 55 owns; this spec only consumes it as the join side (§2 Role change note).
</constraints>

---

## As-built — batch-2 row 3.1 (2026-09-24)

`address_points` converted onto Spec 122's frozen step standard (Spec 123 §7, FULL nine-commit form — the INGESTOR archetype's second member; `load_ravines` was the first, class B). Descriptor: `scripts/load-address-points.descriptor.json`; compute: `scripts/lib/compute/load-address-points.js`; shell: `scripts/load-address-points.js` (the 9-line §5.1 frozen form). Zero-diff conversion except AP-D4 (below), which the converted step delivers as a declared fix.

- **Write class A `guarded_upsert`.** ONE statement — `INSERT … ON CONFLICT (address_point_id) DO UPDATE … WHERE <15 cols> IS DISTINCT FROM` — and no DELETE anywhere. `retract: "none"`, `idempotent_rerun: "zero_writes"`. This is the first class-A INGESTOR in the fleet (`load_ravines` is class B `upsert_scoped_departure_delete`).
- **`geometry_kind: "point"`** (Spec 122 §5.1 RE-FREEZE #14) — the validator's point arm collapses a single-member `ST_CollectionExtract(repaired,1)` back to its Point (a Point column rejects a MultiPoint) and falls through to `skipped_unsupported_type` for a genuine multi-point extract; never `ST_Multi`.
- **CSV acquisition** via the INGESTOR runner's CSV path (RE-FREEZE #13, prerequisite 0b): `inputs.reads.externals[0].format: "csv"`, whole-array hand-off. MEASURED 2026-09-23: 525,436 rows, ~175 MiB source, peak RSS 1531 MB against a 4288 MB default heap ceiling — safe at this dataset size, so no streaming ingest seam was required.
- **`execution.txn_scope: "step"`** (a declared **deviation** from the pre-conversion per-1,000-row batch transaction shape): the library wraps all insert batches in ONE step-scoped transaction. Success runs remain byte-identical; a mid-run failure no longer leaves partially-committed batches (an atomicity-window widening, Fold B3, not triggering Ask O2 — the single-transaction duration/WAL for ~525K rows measured within budget).
- **`process.argv[2]` local-path override retired** per Spec 124 R-AZ — the frozen shell reads no argv; the fixture tier replaces the debug affordance.
- **4 logic variables** (`config.logic_variables[]`, seeded in `scripts/seeds/logic_variables.json`): `address_points_skip_rate_max_pct`, `address_points_null_address_number_max_pct`, `address_points_download_timeout_ms`, plus the pre-existing **shared** `sources_address_points_floor` (already consumed by `assert_data_bounds`; this step's `rows_read_floor` check reuses the SAME key via `checks[].limit_from_config` rather than minting a second one, Rule 3). **Three progress/display-cadence variables declared in the folded commit 6+7 diff were RETIRED at commit 9** (`address_points_progress_bytes_window`, `address_points_progress_row_modulo`, `address_points_expected_total_rows`) — `step-validate`'s §1.2a P4 conformance check caught them as dead declarations: the legacy per-row streaming progress loop they governed has no analogue under the INGESTOR runner's whole-array CSV acquisition path (prerequisite 0b), which logs one summary line instead of per-byte/per-row progress. See the descriptor's own `deviations[]` entry.
- **`checks[]`:** `csv_header_drift`, `null_address_number_pct`, `skip_rate_pct`, `rows_read_floor`, `geom_parse_failures` (AP-D2, below), `shaped_skipped`.
- **AP-D1 — CLOSED by spec correction (2026-09-24).** §3 previously narrated a `maint_stage = REGULAR` filter and an `address_status ∈ {NULL, CURRENT, NONE}` acceptance set that the loader never had — every source row inserts (measured: `grep maint_stage/address_status scripts/load-address-points.js` ⇒ INSERT column references only, zero WHERE clauses). Operator ruling 2026-09-24: the loader's unfiltered ingest is the intended behaviour; Spec 54 §2/§3 corrected to state the actual (unfiltered) contract rather than the aspirational filter. No loader change. *Corrected 2026-09-24 (AP-D1, operator ruling): spec narrated a filter the loader never had.*
- **AP-D2 — declared, carried verbatim.** The silent `try { JSON.parse(geomRaw) } catch { /* fall through */ }` (comment-only catch) is unchanged; a `geom_parse_failures` check now COUNTS it as a declared INFO row instead of leaving it invisible.
- **AP-D3 — declared, carried verbatim.** A failed batch is logged, `errors++`, and its rows DROPPED for the run; `execution.on_batch_error: "drop_batch"` names the behaviour instead of leaving it undeclared.
- **AP-D4 — DEFECT, fixed inline (not pinned).** The legacy loader is non-idempotent: measured 2026-09-23, an intervening legacy run re-updates the SAME 8,199 rows on every run without the values settling (e.g. address_point_id 9085880's `class_family_desc` stays stale at "Land, Structure, Structure Entrance" against the CSV's current "Land, Land Entrance"; 553334's stored geometry matches neither the CSV point nor the 7-dp LAT/LON fallback). Spec 54 asserts the loader upserts the CURRENT source values, so the legacy churn CONTRADICTS its own spec and has no stable golden to pin against. The converted step writes the CSV's current values and converges (a second run: `records_updated: 0`, proven by the standalone golden). The legacy root cause (why its guarded UPDATE rewrites without settling) is filed for the post-cutover ledger, not chased here. See `docs/reports/2026-09-23-batch2-p3-1-address-points-assessment.md` "Differential RULING".
- **Ordering guarantee (Rule 11, disclosed limitation):** Spec 43 rows 4 and 9 imply "`address_points` loads before `geocode_permits` / `link_parcel_addresses` consume it." Because this is a class-A loader (never retracts), a `geo_id` can only "vanish" downstream via a source-side change — the class-A shape cannot express a retraction, which is a known, disclosed limitation rather than a defect.

### Post-conversion fixes (2026-09-24)
- **AP-D7 — CLOSED. Legacy empty/NULL-value preservation restored.** The commit-9 conversion's default codegen silently dropped the legacy `COALESCE(NULLIF(EXCLUDED.<col>, ''), address_points.<col>)` preservation on the 10 TEXT columns (address_number, linear_name_full, address_full, maint_stage, address_status, address_class_desc, class_family_desc, place_name, addr_num_normalized, linear_name_normalized) and the NULL-form `COALESCE(EXCLUDED.<col>, address_points.<col>)` on lo_num/hi_num — 12 columns total (`git show 120b2b99:scripts/load-address-points.js:192-243`). Restored via the declared `columns[].on_empty: "preserve"`/`"preserve_null"` axis (Spec 122 RE-FREEZE #19), never per-step compute SQL. `latitude`/`longitude`/`geom` deliberately stay bare (legacy fence: wrapping them would suppress legitimate coordinate moves). Live impact measured 2026-09-24: 0 rows change on the current CSV (every CSV-empty cell is already stored NULL) — the defect was latent, firing only on the next upstream column strip. Locked in `src/tests/steps/address_points/post-conversion-fixes.logic.test.ts` (L1-L4) and `src/tests/step-library.logic.test.ts` T3 (now load_ravines-only).
- **AP-D8 — CLOSED. `null_address_number_pct` re-pointed to live counters.** The check read `ctx.acquired.attempted_address_number_rows` / `null_address_number_rows`, which no runner ever populated, so it always short-circuited to `violations: 0` (silent permanent PASS) — the legacy loader's documented null-address WARN had disappeared from the converted audit. Re-pointed to the generic INGESTOR prerequisite 0o counters (`acquired.rows_shaped` / `acquired.column_nulls.address_number`), the same precedent used for `parcels`' `null_address_pct` (`657221ea`). Severity stays WARN. Locked in `post-conversion-fixes.logic.test.ts` L5a-d and `violations.test.ts:440-450`.
