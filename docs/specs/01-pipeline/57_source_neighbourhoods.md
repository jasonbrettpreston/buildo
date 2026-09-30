# Source: Toronto Neighbourhoods

<requirements>
## 1. Goal & User Story
As the geographic aggregation layer, this script ingests 158 Toronto neighbourhood boundary polygons and Census income profiles — enabling the system to assign permits to neighbourhoods and render neighbourhood-level market analytics.
</requirements>

---

<architecture>
## 2. Data Source

| Property | Value |
|----------|-------|
| **Boundaries** | `ckan0.cf.opendata.inter.prod-toronto.ca/.../neighbourhoods-4326.geojson` — GeoJSON primary (`format:"geojson"`, `key_property:"AREA_SHORT_CODE"`, CRS84 ≡ EPSG:4326, `on_head_error:"warn_row"`) `[as-built 2026-09-28, row 3.8 ②]` |
| **Profiles** | `ckan0.cf.opendata.inter.prod-toronto.ca/.../nbhd_2021_census_profile_full_158model.xlsx` — XLSX lookup (`role:"lookup"`, `format:"xlsx"`, `on_head_error:"warn_row"`) `[as-built 2026-09-28, row 3.8 ②]` |
| **Format** | GeoJSON primary (`format:"geojson"`) + XLSX lookup (`role:"lookup"`, `format:"xlsx"`, Spec 122a §A16) `[as-built 2026-09-28, row 3.8 ②]` |
| **Schedule** | Annual (via `chain_sources`, step 17) |
| **Script** | `scripts/load-neighbourhoods.js` (Spec 122 §5.1 frozen shell) + `scripts/load-neighbourhoods.descriptor.json` + `scripts/lib/compute/load-neighbourhoods.js` `[as-built 2026-09-28, row 3.8 ②]` |

### Target Table: `neighbourhoods`
| Column | Type | Notes |
|--------|------|-------|
| `id` | SERIAL | **Internal PK** — auto-incremented surrogate. FK targets across the codebase reference this column (e.g. `permits.neighbourhood_id` → `neighbourhoods.id` per migration 109 `fk_permits_neighbourhoods`). |
| `neighbourhood_id` | INTEGER | UNIQUE NOT NULL — natural city open-data identifier. Used as the upsert key by `load-neighbourhoods.js`. NOT the FK target. |
| `name` | TEXT | Neighbourhood name |
| `geometry` | JSONB | GeoJSON polygon/multipolygon |
| `geom` | GEOMETRY(Geometry, 4326) | PostGIS column (parallel to JSONB) — derived by the library geometry validator (`geometry_kind:"polygon"`, `geometry_repair:"none"`, `bind:"wkb_geometry"`) `[as-built 2026-09-28, row 3.8 ②]`. superseded: "PostGIS column" |
| `avg_household_income` | INTEGER | From Census XLSX (lookup; `Math.round`ed on both paths, Fold CF-5) `[as-built 2026-09-28, row 3.8 ②]`. superseded: "NUMERIC" |
| `median_household_income` | INTEGER | From Census XLSX (lookup; `Math.round`ed on both paths, Fold CF-5) `[as-built 2026-09-28, row 3.8 ②]`. superseded: "NUMERIC" |
| `avg_individual_income` | INTEGER | From Census XLSX (lookup; `Math.round`ed on both paths, Fold CF-5) `[as-built 2026-09-28, row 3.8 ②]` |
| `low_income_pct` | NUMERIC(5,2) | From Census XLSX — NOT rounded in JS (the cast rounds on both paths, Fold CF-5) `[as-built 2026-09-28, row 3.8 ②]` |
| `tenure_owner_pct` | NUMERIC(5,2) | From Census XLSX — owner share of the owner+renter total (÷0 ⇒ absent) `[as-built 2026-09-28, row 3.8 ②]` |
| `tenure_renter_pct` | NUMERIC(5,2) | From Census XLSX — renter share of the owner+renter total (÷0 ⇒ absent) `[as-built 2026-09-28, row 3.8 ②]` |
| `period_of_construction` | VARCHAR | From Census XLSX — dominant construction era (`PERIOD_MAP`, max-count first-wins) `[as-built 2026-09-28, row 3.8 ②]` |
| `couples_pct` | NUMERIC(5,2) | From Census XLSX — share of couple + lone-parent family totals `[as-built 2026-09-28, row 3.8 ②]` |
| `lone_parent_pct` | NUMERIC(5,2) | From Census XLSX — share of couple + lone-parent family totals `[as-built 2026-09-28, row 3.8 ②]` |
| `married_pct` | NUMERIC(5,2) | From Census XLSX — married-or-common-law share of the marital-status total `[as-built 2026-09-28, row 3.8 ②]` |
| `university_degree_pct` | NUMERIC(5,2) | From Census XLSX — bachelor-or-above share of the education total `[as-built 2026-09-28, row 3.8 ②]` |
| `immigrant_pct` | NUMERIC(5,2) | From Census XLSX — immigrant share of the private-household status total `[as-built 2026-09-28, row 3.8 ②]` |
| `visible_minority_pct` | NUMERIC(5,2) | From Census XLSX — visible-minority share of the private-household total `[as-built 2026-09-28, row 3.8 ②]` |
| `english_knowledge_pct` | NUMERIC(5,2) | From Census XLSX — English-only share of the official-language total `[as-built 2026-09-28, row 3.8 ②]` |
| `census_year` | INTEGER | DB default `2021` — NEVER written by the loader (`written:"db_default"`) `[as-built 2026-09-28, row 3.8 ②]` |
| `top_mother_tongue` | TEXT | NEVER written by the loader (undeclared in `outputs.writes[0]`, INCIDENTAL — 0/158 non-null) `[as-built 2026-09-28, row 3.8 ②]` |
| `created_at` | TIMESTAMPTZ | DB default — NEVER written by the loader (`written:"db_default"`; live rows all 2026-02-20) `[as-built 2026-09-28, row 3.8 ②]` |

**There is NO `population` column** — the legacy loader never wrote one and the table has none (N-D15). `[as-built 2026-09-28, row 3.8 ②]`

**Internal PK:** `(id)` (SERIAL surrogate — universal `id SERIAL PK` convention shared with `parcels`, `permit_parcels`, `parcel_buildings`, etc.)
**Natural identity:** `(neighbourhood_id)` UNIQUE — the city open-data integer the load script keys on.
**Upsert:** ONE class-A guarded upsert — `ON CONFLICT (neighbourhood_id) DO UPDATE` guarded `IS DISTINCT FROM` over `name`, `geometry`, `geom` and the 14 census columns (the merged boundary guard + the folded census SETs, N-D2; `geom` added by the N-D20 ruling at ③); the 14 census columns declare `on_empty:"preserve_null"`, so a source-omitted cell keeps the stored value. Uses the UNIQUE constraint, NOT the SERIAL PK. `[as-built 2026-09-28, row 3.8 ②]` superseded: "with `IS DISTINCT FROM` on geometry"

> **JOIN guidance (WF3 2026-05-08):** queries that consume `permits` MUST join via `n.id = p.neighbourhood_id` because `permits.neighbourhood_id` is a FK to the SERIAL `neighbourhoods.id` per migration 109 step 4. Joining via `n.neighbourhood_id = p.neighbourhood_id` silently miss-matches every row (both columns are INTEGER; PG never errors). Truth-rooted reference shapes: `src/lib/leads/lead-detail-query.ts`, `src/lib/leads/lead-inspect-query.ts`, `src/app/api/permits/[id]/route.ts`. Repaired sites in commit `09e8828`: `get-lead-feed.ts`, `compute-cost-estimates.js`, `market-metrics/queries.ts`. Regression-locked by `src/tests/neighbourhoods-fk-join.infra.test.ts` (Layer 1) and `src/tests/db/neighbourhoods-fk-join.db.test.ts` (Layer 2 live-DB).
</architecture>

---

<behavior>
## 3. Behavioral Contract

### Core Logic
`[as-built 2026-09-28, row 3.8 ②]` Runner phases (N-D5/N-D19, N-D1/N-D9): (1) acquire BOTH externals — HEAD per external (`on_head_error:"warn_row"` ⇒ a WARN `head_error` row and proceed), download, content hash; there is NO staleness gate and NO local cache (`cache:"none"`); (2) `buildLookup` pivots the census sheet ONCE (31 characteristic rows matched on the 2021 profile); (3) `shapeRecord` joins each feature to its census row — key `AREA_SHORT_CODE`, name `AREA_NAME ‖ AREA_LONG_CODE`, else the feature is skipped `missing_name`; (4) dedupe by `neighbourhood_id` + geometry validation (`geometry_kind:"polygon"`, `geometry_repair:"none"` — a non-polygon is `skipped_unsupported_type`); (5) the pre-write refusal gate (§ "Pre-write refusals"); (6) ONE step-scoped guarded upsert (the INSERT binds `geom` too — N-D1); (7) checks + verdict (derived from the check rows, never a parallel boolean — N-D11); (8) `VACUUM ANALYZE` ONLY when the dead-tuple ratio exceeds `neighbourhoods_dead_tuple_ratio_warn_max` (N-D9).
superseded: "1. Fetch GeoJSON boundary file (158 neighbourhoods) 2. Parse each Feature, extract neighbourhood_id from properties 3. Upsert boundary polygons (both JSONB `geometry` and PostGIS `geom`) 4. Fetch Census XLSX profile, parse income characteristics 5. Map Census rows to neighbourhood_id, update income/population columns"

`[as-built 2026-09-28, row 3.8 ③]` CUTOVER: `scripts/load-neighbourhoods.js` is registered in `scripts/steps/_schema/converted.json` (23rd converted step, INGESTOR 6/9, class A); `neighbourhoods -> link_neighbourhoods` is now a live seam pair (both converted). The guard also names `geom` (N-D20: a geom drifted from its geometry derivation is rewritten). Cloud prerequisite: seed the neighbourhoods logic variables (`scripts/seeds/apply-logic-variables.js`) before the first cloud sources run (LM-D15: a missing row throws).

### Pre-write refusals
Each of these is a **FAIL scored BEFORE the write** (`checks[].when:"pre_write"` + `order_guarantee.anchor:"Pre-write refusals"`), so **no transaction opens** and `neighbourhoods` — the FK target of `permits` (`ON DELETE SET NULL`) and of the neighbourhood norms tables (`build_norms` CASCADE, `storey_norms` no-action) — is left untouched, exactly as legacy's abort did. `[as-built 2026-09-28, row 3.8 ②]`
- `bad_key_count` — a feature whose `AREA_SHORT_CODE` is absent, empty or `0` (N-D6; `viol == 0`).
- `duplicate_key_count` — two features sharing an `AREA_SHORT_CODE` (N-D7; legacy aborted with Postgres' `cannot affect row a second time`; `viol == 0`).
- `null_geometry_count` — a feature with a null geometry (N-D17; legacy `ST_GeomFromGeoJSON('null')` threw; the converted parser skips and counts instead; `viol == 0`).
A NON-NUMERIC key still throws at acquisition (`/positive integer/`, legacy halt) — it is not a scored refusal.

### Edge Cases
- Neighbourhood count < 158 → `boundaries_loaded` FAIL, bound by the SHARED `sources_neighbourhoods_floor` variable (default 158, the SAME key `assert_data_bounds` and `link_neighbourhoods` declare) `[as-built 2026-09-28, row 3.8 ②]`. superseded: "Neighbourhood count < 158 → data quality assertion catches this"
- Census characteristic rows relabelled → `census_rows_matched` drops (INFO, never gates; ④ F2 adds a WARN floor `neighbourhoods_census_rows_matched_min` — N-D10) `[as-built 2026-09-28, row 3.8 ②]`. superseded: "Census XLSX format changes → column mapping may need update"
- Non-polygon geometry → `skipped_unsupported_type` (`geometry_kind:"polygon"`, unrepaired; exposure 0 — 158/158 MultiPolygon, N-D13) `[as-built 2026-09-28, row 3.8 ②]`. superseded: "MultiPolygon vs Polygon → both handled via Turf.js"
</behavior>

---

<constraints>
## 4. Operating Boundaries
- **Script:** `scripts/load-neighbourhoods.js`
- **Consumed by:** `chain_sources.md` (step 17), `link_neighbourhoods` (point-in-polygon)
- **Relies on:** `pipeline_system.md` (SDK)

### Target Files
<!-- generated:target-files -->
<!-- do not hand-edit: npm run target-files regenerates this block from the census owner_specs, the capture-step-golden derivation, the cross-step ledger and consumer-registry.json -->
- `neighbourhoods` — INGESTOR · converted · owner specs: 57
  - `scripts/load-neighbourhoods.js`
  - `scripts/load-neighbourhoods.descriptor.json`
  - `scripts/load-neighbourhoods.notes.json`
  - `scripts/lib/compute/load-neighbourhoods.js`
  - `src/tests/steps/neighbourhoods/violations.test.ts`
  - data: `neighbourhoods` writes (migrations/013_neighbourhoods.sql)
  - upstream: none
  - downstream: enrich_parcels · link_neighbourhoods
  - consumers: src/components/FreshnessTimeline.tsx (records_meta audit_table)
<!-- /generated:target-files -->
- `src/lib/leads/lead-detail-query.ts` — implementation file this spec already names in its body; declared explicitly 2026-09-14 (was only reaching the system map through the generator's whole-document fallback scan, which an explicit Target Files list suppresses)
- `src/lib/leads/lead-inspect-query.ts` — implementation file this spec already names in its body; declared explicitly 2026-09-14 (was only reaching the system map through the generator's whole-document fallback scan, which an explicit Target Files list suppresses)
- `src/app/api/permits/[id]/route.ts` — implementation file this spec already names in its body; declared explicitly 2026-09-14 (was only reaching the system map through the generator's whole-document fallback scan, which an explicit Target Files list suppresses)
- `scripts/analysis/neighbourhoods-cohort-differential.js` — batch-2 row 3.8 R-AS forced-change cohort differential (Spec 124 R-AS): derives + commits the I/N/G/C/Q key-shift cohort (no pre-existing row is ever deleted — every row is FK-referenced by `id`) and runs the pre/post proof through `capture-step-golden.js`, restore-always (WF2 row 3.8 ①).
- Tests this spec governs beyond its generated step suites (Amendment 6 of the generated-Target-Files WF2: the block's step tests switched off the system map's whole-spec test fallback, so these are now named here): `src/tests/neighbourhoods-fk-join.infra.test.ts`, `src/tests/db/neighbourhoods-fk-join.db.test.ts`

### Step-file notes
*Moved out of Target Files by the generated-Target-Files WF2 (2026-09-30): the step-owned files are listed by the generated block under Target Files; each note below is the annotation its bullet carried, verbatim.*
- `scripts/load-neighbourhoods.js` — this spec defines the neighbourhoods loader's contract (§2/§3). `[as-built 2026-09-28, row 3.8 ②]` Spec 122 §5.1 frozen shell, lock 57.
- `scripts/load-neighbourhoods.descriptor.json` — the step declared as data (class A `guarded_upsert`, the two externals, the 14 `preserve_null` census columns, the three `pre_write` refusals, maintenance). `[as-built 2026-09-28, row 3.8 ②]`
- `scripts/load-neighbourhoods.notes.json` — the prose sidecar the descriptor's `interpretation` points at (8 entries). `[as-built 2026-09-28, row 3.8 ②]`
- `scripts/lib/compute/load-neighbourhoods.js` — the domain logic only (`coerceKey`, `shapeRecord`, `buildLookup`, `dedupeBySourceId`, the checks in descriptor order). `[as-built 2026-09-28, row 3.8 ②]`

### Cross-Spec Dependencies
- `scripts/load-permits.js` — referenced only for the `n.id = p.neighbourhood_id` JOIN guidance (§2); this spec does not define its contract.
- `scripts/load-parcels.js` — referenced only for the shared `id SERIAL` PK convention (§2); this spec does not define its contract.
- `scripts/link-neighbourhoods.js` — downstream consumer of `neighbourhoods` via point-in-polygon matching (§4 Consumed by); its own contract lives in its step spec.
- `scripts/compute-cost-estimates.js` — referenced only for the same JOIN guidance (§2); this spec does not define its contract.
- `scripts/analysis/capture-step-golden.js` — spawned by the cohort differential to run this step and hash `neighbourhoods`; its contract lives in Spec 122 §5.3, not here.
- `src/features/leads/lib/get-lead-feed.ts` — a repaired JOIN site (§2, commit `09e8828`) that reads neighbourhood `name`/income via `n.id = p.neighbourhood_id`; its own contract lives elsewhere. `[as-built 2026-09-28, row 3.8 ②]`
- `src/lib/market-metrics/queries.ts` — a repaired JOIN site (§2, commit `09e8828`) that reads neighbourhood `name`/income via `n.id = p.neighbourhood_id`; its own contract lives elsewhere. `[as-built 2026-09-28, row 3.8 ②]`
- `scripts/lib/step/` — the step library the runner uses to execute this descriptor (acquisition, geometry validator + guarded upsert, ingest runner, invariants + maintenance); Spec 122 owns its contract. `[as-built 2026-09-28, row 3.8 ②]`
</constraints>
