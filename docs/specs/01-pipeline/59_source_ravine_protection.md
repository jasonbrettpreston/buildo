# Spec 59 — Toronto Ravine and Natural Feature Protection (Ingest + Link)

**Spec version:** 1.2 (locked per L10)
**Status:** Authored (WF1 Genesis — spec-only deliverable; implementation deferred per §8b)
**Authored:** 2026-05-25 (v1.0 → v1.1 R2 fold: 5 CRIT + 12 HIGH + 14 DEFERs; v1.1 → v1.2 R2.5 regression-check fold: 4 CRIT + 8 HIGH + 5 additional DEFERs — R2.5 caught 2 bugs introduced by R2 folds + 2 pre-existing gaps the R2 round missed)
**Phase 0 discovery:** `docs/reports/wf1-spec59-architecture-discovery.md`

---

## Cumulative design decisions (locked through v1.1)

| ID | Decision |
|---|---|
| **L1** | `is_in_ravine_protection_area BOOLEAN NOT NULL DEFAULT false` — single regulatorily-authoritative flag answering "does Chapter 658 apply?" |
| **L2** | `ravine_distance_m DOUBLE PRECISION` — centroid-to-nearest-ravine signed distance via `ST_Distance(::geography)`. **Returns 0** when centroid is inside any ravine polygon (PostGIS native semantics); **negative** when parcel intersects at least one ravine; **positive** when parcel is outside all ravines. The `is_in_ravine_protection_area` boolean is the regulatorily authoritative flag — `ravine_distance_m = 0` is an unambiguous "centroid is inside" signal, not an error. *(R2 Independent CRIT-1 fold: dropped "always non-zero" claim.)* |
| **L3** | Point-in-time MVP semantics; spec §3 mandates a historical-permit warning + `source_dataset_version` UI display |
| **L4** | Advisory lock ID = **59** for `load-ravines.js` (verified unassigned across `scripts/*.js` at Phase 0) |
| **L4b** | Advisory lock ID = **60** for `enrich-ravines.js`. *(R2 DeepSeek CRIT-2 fold: Spec 47 §5.1 mandates a distinct lock per script even when chain-ordered; 60 confirmed unassigned.)* |
| **L5** | Geometry-derived `is_in_ravine_protection_area` is **authoritative**; `permit_type='RNFP'` (currently zero rows) is corroborating only; disagreement → operator triage WARN audit row |
| **L6** | Sibling script `enrich-ravines.js` (NOT a step in a shared `enrich-parcels.js`) — independent deployability per Gemini R1 HIGH-2 + cross-WF isolation |
| **L7** | OBJECTID count-drift detection: `>50%` feature-count delta vs prior successful run → CRITICAL WARN + `RAVINE_ACCEPT_FEATURE_COUNT_DRIFT=1` operator override required. When the override is set, execution proceeds but the audit row retains `status='FAIL'` — the run's overall verdict will be `FAIL` per Spec 47 §8.2 cascade. Operator acknowledgment of the FAIL is expected before chain promotion. *(R2 Independent HIGH-3 fold.)* |
| **L7b** | Geometry-update drift (complementary to L7): on non-first run, if `polygons_updated / prior_feature_count > 50%`, emit WARN audit row (full Esri-side reload after 10–20yr cadence is expected, not a failure) |
| **L8** | Invalid-geometry threshold: `>5%` of features skipped → audit FAIL + **do not enter `pipeline.withTransaction`** (geometry validation runs in JS before any DB writes — no transaction state can dangle). *(R2 Independent HIGH-2 fold: rephrased "abort transaction" → "do not enter transaction.")* |
| **L9** | HEAD `Last-Modified` is the primary change signal with **ETag/content-hash fallback** for CDN-induced header stripping; 20-year WARN threshold; cache `last_modified` + `etag` + `content_hash` in `records_meta.ravine_load`. After download, re-validate by comparing the download response's `Last-Modified`/`ETag` against the HEAD response — if they differ, treat the download as authoritative and overwrite the cached value. *(R2 Gemini HIGH-2 + DeepSeek HIGH-2 race condition folds.)* |
| **L10** | `spec_version: 1.2` lock for all downstream implementation WFs |
| **L11** | Cross-WF serialization with Spec 58 zoning enrichment: SEPARATE migration files for ravine vs zoning parcel columns; `IS DISTINCT FROM` guard on UPDATE; chain step placement per §8 |
| **L12 (NEW v1.1)** | §11.2 multi-parcel rule: `ravine_distance_m = MIN(ABS(par.ravine_distance_m)) × CASE WHEN bool_or(par.is_in_ravine_protection_area) THEN -1 ELSE 1 END`. Matches the prose "closest parcel is authoritative." *(R2 Independent CRIT-2 fold.)* |
| **L13 (NEW v1.1, corrected v1.2)** | §11.1 SQL uses `LEFT JOIN LATERAL (... ORDER BY ST_Centroid(p.geom)::geography <-> r.geom::geography LIMIT 1) nearest`. **Both sides cast to geography** so the `<->` operator binds to the geography operator class and uses `ravines_geog_gist`. Without the casts, `<->` uses the planar `ravines_geom_gist` and the geography distance metric inside the subquery cannot be used for index-driven sort. M-1 creates BOTH indexes: planar GIST for `ST_Intersects` (boolean predicate) + geography GIST for `<->` nearest-neighbor (signed-distance sort). *(R2 DeepSeek CRIT-3 fold; v1.2 R2.5 CRIT-1 fold across all 3 reviewers: corrected the index-attribution claim.)* |
| **L14 (NEW v1.1)** | Empty-ravines guard on enrich: `enrich-ravines.js` checks `SELECT COUNT(*) FROM ravines` at startup; if 0, emit FAIL and abort (do not write NULLs over existing parcels enrichment). Defense-in-depth against the F-C1 catastrophe class on the enrich side. Cites Spec 47 §6.2 (data read pattern), not §4.3 (which is JS-side array-emptiness only). *(R2 Gemini CRIT-1 fold; v1.2 R2.5 Independent HIGH-3 cite correction.)* |
| **L7c (NEW v1.2)** | Mass-deletion drift detection: on a non-first run, if `polygons_deleted / prior_feature_count > 0.50` → CRITICAL WARN audit row + require operator override flag `RAVINE_ACCEPT_MASS_DELETE=1` to consider the run successful. Catches the full-Esri-reload case where feature count is unchanged but all OBJECTIDs are new → L7 count-delta sees 0% change while every row is silently replaced. *(R2.5 Gemini HIGH-1 fold.)* |
| **L15 (NEW v1.2)** | F-C1 empty-set guard runs in the **JS layer**, not in a PL/pgSQL `DO` block. PL/pgSQL DO blocks cannot accept query parameters (`$1`), so the v1.1 SQL would crash at runtime. JS-side guard: `if (loadedSourceIds.length === 0) { delete_skipped_empty_guard = true; } else { client.query('DELETE FROM ravines WHERE source_id <> ALL($1::BIGINT[])', [loadedSourceIds]); }`. *(R2.5 DeepSeek CRIT-2 fold.)* |
| **L16 (NEW v1.2)** | Geometry validation runs as a **single batched query** using `VALUES + UNNEST`, not 854 individual `SELECT ST_IsValid(...)` calls. Spec 47 §B1 Loop Query Ban applies. The batched query runs ONCE before entering `pipeline.withTransaction`. *(R2.5 DeepSeek HIGH-4 fold.)* |
| **L17 (NEW v1.2)** | `pipeline.emitMeta` MUST use the two-argument table-keyed-map signature per Spec 47 §8.3: `emitMeta({ tableName: ['col1','col2'] }, { tableName: ['col1','col2'] })`. The v1.1 single-arg flat-string-array form was incorrect and would have left the admin DataFlowTile Live Meta indicator dark. *(R2.5 Independent CRIT-1 fold.)* |
| **L18 (NEW v1.2)** | Cross-run `records_meta` read pattern for `enrich-ravines.js` consumer protocol: `SELECT records_meta FROM pipeline_runs WHERE pipeline = 'source-ravines' AND status = 'completed' ORDER BY completed_at DESC LIMIT 1`. Specified explicitly so implementation WF does not invent its own pattern. *(R2.5 Independent CRIT-3 fold.)* |
| **L19 (NEW v1.2)** | `enrich-permits.js` ravine step (§8e) MUST acquire an advisory lock per Spec 47 §5.1. Either the parent enrich-permits.js script's existing lock, or a new lock ID assigned by the implementing WF. Spec 59 mandates the requirement, not the ID. *(R2.5 Gemini HIGH-2 fold: third instance of this finding class — Spec 47 §5.1 is the answer.)* |

Folds dissolved by Phase 0 (carried forward as no-ops): per-layer transactions; staging-table CTE; buffer-distance constants; multi-layer Producer/Consumer keys.

---

## 1. Goal & User Story

**Goal:** Ingest Toronto's published Ravine and Natural Feature Protection Area polygon dataset (Toronto Municipal Code Chapter 658) and link each `permits` row + `coa_applications` row to it via parcel spatial join, so admin permit/CoA detail panels can display two enrichment fields: **`is_in_ravine_protection_area`** (boolean) + **`ravine_distance_m`** (signed metres, where 0 means centroid is inside).

**User story (operator):** "When I open a permit or CoA detail page, I want to immediately see whether the property is within the Chapter 658 Protection Area, and (if not) how close it is, so I can flag Ravine and Natural Feature Protection permit triage without consulting an external map."

### 3-WF sequence to reach the end objective

```
┌─────────────────────────────────────────────────────────────────────────┐
│ WF1 = Spec 59 (this spec) — spec-only; no code                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─ Future WF (§8c) ───────────────────────────────────────────────────────┐
│ load-ravines.js (Spec 47 skeleton; advisory lock 59 per L4) +           │
│ migration M-1: CREATE TABLE ravines + GIST indexes (planar + geography  │
│   per L13) + Spec 43 chain edit: `load_ravines` step AFTER `parcels`    │
│   slug + assert-schema.js edit + assert-data-bounds.js edit + manifest  │
│                                                                         │
│ Output: ravines table (6 cols, ~854 rows, 2 GIST indexes)               │
└─────────────────────────────────────────────────────────────────────────┘

┌─ Future WF (§8d) ───────────────────────────────────────────────────────┐
│ enrich-ravines.js (Spec 47 skeleton; advisory lock 60 per L4b) +        │
│ migration M-2: ALTER TABLE parcels ADD                                  │
│   is_in_ravine_protection_area BOOLEAN NOT NULL DEFAULT false,          │
│   ravine_distance_m DOUBLE PRECISION,                                   │
│   ravine_dataset_version_when_enriched TEXT                             │
│ + Spec 43 chain edit: `enrich_ravines` step AFTER `link_parcels` slug   │
│                                                                         │
│ Serialization (L11): M-2 is a SEPARATE migration file from              │
│ Spec 58's future parcels-zoning columns migration. IS DISTINCT FROM     │
│ guard on UPDATE prevents dead-tuple bloat on re-runs.                   │
└─────────────────────────────────────────────────────────────────────────┘

┌─ Future WF (§8e) ───────────────────────────────────────────────────────┐
│ enrich-permits.js ravine step + CoA enrichment step                     │
│ + migration M-3: ALTER TABLE permits + coa_applications ADD             │
│   is_in_ravine_protection_area BOOLEAN NOT NULL DEFAULT false,          │
│   ravine_distance_m DOUBLE PRECISION                                    │
│                                                                         │
│ JOIN path: see §8e (verify lead_parcels mirror; else permit_parcels)    │
│ Multi-parcel rule per L12: MIN(ABS(distance)) × sign(bool_or)           │
└─────────────────────────────────────────────────────────────────────────┘

┌─ Future sibling spec (§8f, NOT this WF) ────────────────────────────────┐
│ Admin UI display of the 2 fields on permit + CoA detail panels          │
│ + display source_dataset_version (per L3 historical-permit warning)     │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Data Source

| Field | Value |
|---|---|
| CKAN package | `ravine-natural-feature-protection-area` |
| Resource ID | `bb81bb0f-f88a-4f3e-bca7-a328154ba31b` |
| Resource name | `ravine-natural-feature-protection-area-wgs84` |
| Format | Shapefile (zipped); `datastore_active = false` (must download + parse) |
| File size | 4.49 MB |
| Direct download URL | `https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/ravine-natural-feature-protection-area/resource/bb81bb0f-f88a-4f3e-bca7-a328154ba31b/download/ravine-natural-feature-protection-area-wgs84.zip` |
| Projection | EPSG:4326 (WGS84) native; no ST_Transform required |
| Feature count | 854 polygons (per Phase 0 parse) |
| Geometry types | `Polygon` + `MultiPolygon` mixed → `ST_Multi()` cast |
| Attribute columns | `OBJECTID` (integer) — sole attribute; dataset is purely geometric |
| Publish cadence | "As available; refreshed every 10–20 years. Currency: May 2018" |
| Regulatory authority | Toronto Municipal Code **Chapter 658** (Ravine and Natural Feature Protection By-law) |
| Pipeline category | Datasources chain (annual-cadence-or-slower; sibling to Spec 58 zoning) |
| Licence | Toronto Open Data Licence v1.0 — attribution required |

**Target table** *(updated v1.1: `BIGINT` source_id + `updated_at` lineage column + geography GIST index per L13; Gemini HIGH-1 + MED-1 folds)*:

```sql
CREATE TABLE ravines (
  id                     BIGSERIAL PRIMARY KEY,
  source_id              BIGINT UNIQUE NOT NULL,             -- from CKAN OBJECTID (L7 drift-monitored); BIGINT defends against future ID range expansion
  geom                   GEOMETRY(MultiPolygon, 4326) NOT NULL,
  source_dataset_version TEXT NOT NULL,                       -- ETag/Last-Modified hash; surfaces to UI per L3
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()   -- v1.1: row-level lineage (Gemini HIGH-1 fold)
);

-- Planar GIST for ST_Intersects (boolean flag)
CREATE INDEX ravines_geom_gist ON ravines USING GIST (geom);

-- Geography GIST for <-> nearest-neighbor on signed distance (L13)
CREATE INDEX ravines_geog_gist ON ravines USING GIST (geography(geom));
```

**Parcels schema additions (§8d future migration M-2)** *(v1.1: + `ravine_dataset_version_when_enriched` for data lineage per Gemini LOW-1)*:

```sql
ALTER TABLE parcels
  ADD COLUMN is_in_ravine_protection_area BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN ravine_distance_m DOUBLE PRECISION,
  ADD COLUMN ravine_dataset_version_when_enriched TEXT;
```

**Permits + CoA schema additions (§8e future migration M-3):**

```sql
ALTER TABLE permits
  ADD COLUMN is_in_ravine_protection_area BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN ravine_distance_m DOUBLE PRECISION;

ALTER TABLE coa_applications
  ADD COLUMN is_in_ravine_protection_area BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN ravine_distance_m DOUBLE PRECISION;
```

---

## 3. Behavioral Contract (`load-ravines.js`)

### 3.1 Spec 47 §R1–R12 skeleton (mandatory)

```js
#!/usr/bin/env node
/**
 * Load Toronto Ravine and Natural Feature Protection Area polygons.
 * SPEC LINK: docs/specs/01-pipeline/59_source_ravine_protection.md
 */
'use strict';

const pipeline = require('./lib/pipeline');
const { loadMarketplaceConfigs } = require('./lib/config-loader');
const { z } = require('zod');

const ADVISORY_LOCK_ID = 59;   // L4
const SPEC_VERSION = '1.2';    // L10

const ConfigSchema = z.object({
  ravineSkipCheckThresholdYears: z.number().default(20),  // L9
  ravineDriftFeatureCountPct: z.number().default(0.50),   // L7
  ravineDriftGeometryUpdatePct: z.number().default(0.50), // L7b
  ravineInvalidGeometryFailPct: z.number().default(0.05), // L8
});

pipeline.run('source-ravines', async (pool) => {
  // §R5 — startup guard (no required env vars for this script)

  const { logicVars } = await loadMarketplaceConfigs(pool, 'source-ravines');
  const config = ConfigSchema.parse(logicVars);

  // §R6 — advisory lock (transaction-level, auto-released)
  return await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    // §R3.5 — DB clock, not new Date(); captured INSIDE the lock callback per Spec 47 §6.1
    const RUN_AT = await pipeline.getDbTimestamp(pool);                       // v1.2: concrete code line, not comment (R2.5 Independent HIGH-1 fold)

    // §3.2 Step 0a — HEAD skip-check (L9): cache validator comparison; SKIP/FAIL/proceed.
    // §3.3 Step 0b — Download + unzip + parse (npm shapefile lib).
    // §3.4 Step 1 — L7 feature-count drift detection (FAIL unless RAVINE_ACCEPT_FEATURE_COUNT_DRIFT=1).
    // §3.5 Step 2 — BATCHED geometry validation in JS (L16; one SQL call via VALUES+UNNEST);
    //              L8 threshold check BEFORE entering pipeline.withTransaction.
    // §3.6 Step 3 — Inside withTransaction: direct INSERT + ON CONFLICT upsert.
    // §3.7 Step 4 — L7b geometry-update drift WARN (post-upsert, non-first-run only).
    // §3.8 Step 5 — JS-LAYER F-C1 empty-set guard (L15); DELETE only if loadedSourceIds.length > 0.
    //              L7c mass-deletion drift CRITICAL WARN (post-DELETE, non-first-run; override flag).
    // §3.9 Step 6 — Cache last_modified + etag + content_hash for next-run skip-check.

    // §R10 emitSummary + §R11 emitMeta (mandatory; called LAST inside this callback per Spec 47 §R2 canonical pattern)
    // Concrete signatures in §9 below.
  });
});
```

### 3.2 Step 0a — HEAD `Last-Modified` + ETag + content-hash skip-check (L9)

1. Issue HTTP HEAD against the CKAN resource URL.
2. Compare response's `Last-Modified`, `ETag`, and any cache validator headers against `records_meta.ravine_load.{last_modified,etag}` from the most recent successful `pipeline_runs` row.
3. **Decision tree:**
   - **All cache validators present AND match prior run** → SKIP entire load. Emit `verdict: 'SKIP'`, `records_total=null`, `records_meta.ravine_load.skipped_reason = 'unchanged_validators'`.
   - **Any validator differs from prior run** → proceed with full load (the new validator values are captured at step 6 after download).
   - **`Last-Modified` AND `ETag` both MISSING (CDN-stripped headers)** → emit WARN row "no cache validators present"; STILL proceed with full load; rely on content-hash comparison post-download.
   - **`Last-Modified` older than 20 years (L9 staleness threshold)** → emit WARN row "dataset appears deprecated"; STILL proceed with full load.
   - **First run (no prior successful run)** → proceed with full load.
4. **HEAD failure (4xx/5xx) → emit FAIL** *(R2 Gemini LOW-2 fold)* — do NOT proceed; subsequent GET will likely fail for the same reason, so failing early avoids wasted lock acquisition + tempdir setup.

### 3.3 Step 0b — Download + unzip + parse (with temp file cleanup)

1. Download the 4.49 MB zip via a modern HTTP client (`node-fetch` or `axios` — handles redirects, errors, streaming robustly). Recommended over low-level Node `https`. *(R2 Gemini NIT-1 fold.)*
2. Unzip via `node-stream-zip` (cross-platform) — production environment is not Windows. PowerShell `Expand-Archive` is NOT acceptable.
3. **Temp file cleanup mandate** *(R2 DeepSeek HIGH-4 fold):* use the `tmp` npm package with `{ unsafeCleanup: true }` OR explicit `try/finally` block with `fs.rm(tempDir, { recursive: true, force: true })`. Crashes (SIGTERM, OOM, uncaught exceptions) must not leak files into the OS tempdir.
4. Parse the `*.shp` + `*.dbf` via npm `shapefile` library — **scan the zip contents for any `*.shp` file** rather than hardcoding `RAVINE_BYLAW_WGS84.shp` (CKAN may rename internal filenames on refresh). *(DEFER from R2 Independent MED-4; v1.1 promoted to required.)*
5. Capture `Last-Modified`, `ETag`, and compute MD5 content hash of the downloaded zip for comparison with HEAD response — if they differ, the download is authoritative (HEAD/GET race per L9). Cache all three at step 6.

### 3.4 Step 1 — Feature-count drift detection (L7)

1. After parse, count features (`N_loaded`).
2. Read `prior_feature_count` from the most recent successful run's `records_meta.ravine_load.feature_count`. If first run, treat as `N_loaded` (no drift on first run).
3. Compute `count_delta_pct = |N_loaded - prior_feature_count| / prior_feature_count`.
4. **Decision tree:**
   - `count_delta_pct > 0.50` (L7 threshold) AND `process.env.RAVINE_ACCEPT_FEATURE_COUNT_DRIFT !== '1'` → emit CRITICAL row + return `verdict: 'FAIL'`, do not proceed.
   - Override flag set → emit CRITICAL audit row (status remains `FAIL` per L7; the override enables execution, not verdict suppression — operator-facing behavior documented per R2 Independent HIGH-3 fold); proceed to step 2.
   - Otherwise → proceed silently.

### 3.5 Step 2 — Geometry validation (BATCHED — L16 Spec 47 §B1 compliance)

Runs in JS BEFORE entering `withTransaction` per L8. **All 854 features validated in a SINGLE SQL round-trip** via `VALUES + UNNEST` — Spec 47 §B1 Loop Query Ban forbids 854 individual `SELECT ST_IsValid(...)` calls.

```sql
-- Single round-trip; arrays passed as parameters: $1 = BIGINT[] source_ids; $2 = TEXT[] geojson strings.
WITH input AS (
  SELECT s.source_id, ST_GeomFromGeoJSON(g.geojson) AS geom
    FROM unnest($1::BIGINT[]) WITH ORDINALITY AS s(source_id, ord)
    JOIN unnest($2::TEXT[])   WITH ORDINALITY AS g(geojson, ord)   ON s.ord = g.ord
),
validated AS (
  SELECT
    source_id,
    ST_GeometryType(repaired) AS repaired_type,
    -- ST_CollectionExtract rescues polygon members from GeometryCollection results;
    -- when ST_MakeValid returns a Polygon/MultiPolygon directly, ST_CollectionExtract is a no-op.
    ST_Multi(COALESCE(ST_CollectionExtract(repaired, 3), repaired)) AS geom_final,
    is_valid_original
  FROM (
    SELECT source_id,
           ST_IsValid(geom) AS is_valid_original,
           ST_MakeValid(geom) AS repaired
      FROM input
  ) s
)
SELECT source_id,
       CASE
         WHEN repaired_type IN ('ST_Polygon','ST_MultiPolygon') THEN 'accepted'
         WHEN repaired_type = 'ST_GeometryCollection' AND ST_NumGeometries(geom_final) > 0 THEN 'collection_extracted'
         WHEN geom_final IS NULL THEN 'skipped_null'
         ELSE 'skipped_unsupported_type'
       END AS status,
       ST_AsBinary(geom_final) AS geom_wkb,                  -- pass to upsert as bytea
       is_valid_original
  FROM validated;
```

JS layer iterates the single result set and classifies per row:
- `status = 'accepted'` → increment `invalid_geometry_repaired` if `is_valid_original=false`; carry geom to upsert.
- `status = 'collection_extracted'` → increment both `invalid_geometry_repaired` + `geometry_collection_extracted`; carry geom.
- `status = 'skipped_null'` or `'skipped_unsupported_type'` → increment `invalid_geometry_skipped`; emit per-row WARN audit entry with `source_id`; do NOT carry to upsert.

**L8 threshold check (in JS, BEFORE entering withTransaction):** if `invalid_geometry_skipped / N_loaded > 0.05`, emit FAIL audit row, set `verdict: 'FAIL'`, and `return` without opening a transaction. No DB writes can dangle.

**Round-trip integrity check** *(formerly §3.5 step 1)*: the batched query's `ST_AsBinary(geom_final)` output is parsed back into a Postgres geometry at upsert-time via `ST_GeomFromWKB($N, 4326)`. Equivalence verified once at first-deploy via Spec 48 §3.7 spike runbook test (`ST_AsText(pre) = ST_AsText(post)` on a fixture sample).

### 3.6 Step 3 — Direct INSERT pattern (single transaction per §R9)

854 features < the staging-CTE threshold (2000) → direct INSERT in a single `pipeline.withTransaction`. Geometry was already validated + extracted into WKB by §3.5; the upsert binds geometries via `ST_GeomFromWKB($N, 4326)`.

```sql
-- Pseudo-SQL inside withTransaction; values batched per row.
-- v1.2: geometry was already validated by §3.5 batched query; binding via WKB is faster than re-parsing GeoJSON.
INSERT INTO ravines (source_id, geom, source_dataset_version, updated_at)
VALUES ($1, ST_GeomFromWKB($2, 4326), $3, $4),                 -- geom_wkb already ST_Multi'd in §3.5
       ($5, ST_GeomFromWKB($6, 4326), $7, $8),
       ...
ON CONFLICT (source_id) DO UPDATE
  SET geom                   = EXCLUDED.geom,
      source_dataset_version = EXCLUDED.source_dataset_version,
      updated_at             = EXCLUDED.updated_at                -- v1.1: refresh lineage on update
  WHERE ravines.geom                   IS DISTINCT FROM EXCLUDED.geom
     OR ravines.source_dataset_version IS DISTINCT FROM EXCLUDED.source_dataset_version;
```

Pass `$4 = $8 = … = RUN_AT` (the DB clock captured inside the lock callback per §3.1).

**Capture counters** from the upsert:
- `polygons_inserted` (rows where ON CONFLICT did NOT fire)
- `polygons_updated` (rows where ON CONFLICT fired AND IS DISTINCT FROM evaluated true)

### 3.7 Step 4 — L7b geometry-update drift detection

Post-upsert, compute `geometry_update_pct = polygons_updated / prior_feature_count`. On a non-first run, if `geometry_update_pct > 0.50` (L7b) → emit WARN audit row (NOT FAIL — full Esri-side reload after a 10–20yr cadence is expected behavior; operator awareness only).

### 3.8 Step 5 — Bounded DELETE with F-C1 empty-set guard (L15 JS-layer)

**F-C1 definition (inline):** the DELETE executes ONLY IF the set of `source_id` values from the parsed dataset is non-empty. This guard prevents the catastrophic `WHERE source_id NOT IN (empty-set)` predicate from evaluating vacuously true and deleting all `ravines` rows.

**L15 fold (R2.5 DeepSeek CRIT-2):** the guard runs in the **JS layer**, not in a PL/pgSQL `DO` block. DO blocks cannot accept query parameters (`$1`) — the v1.1 SQL would have crashed at runtime.

```js
// Inside the pipeline.withTransaction callback, after the upsert completes.
// loadedSourceIds: BIGINT[] from §3.5 (validated rows only).
let polygonsDeleted = 0;
let deleteSkippedEmptyGuard = false;

if (!Array.isArray(loadedSourceIds) || loadedSourceIds.length === 0) {
  // F-C1 guard fires: suppress DELETE.
  deleteSkippedEmptyGuard = true;
  pipeline.log.warn('[ravines]', 'F-C1 empty-set guard: DELETE suppressed');
} else {
  const result = await client.query(
    'DELETE FROM ravines WHERE source_id <> ALL($1::BIGINT[])',
    [loadedSourceIds]
  );
  polygonsDeleted = result.rowCount;
}
```

Both `polygonsDeleted` and `deleteSkippedEmptyGuard` populate `records_meta.ravine_load` per §9 (the H-v4.1.5 sentinel from v1.1 is preserved, just emitted from JS instead of via the broken PL/pgSQL `set_config` path).

### 3.8b Step 5b — Mass-deletion drift detection (L7c NEW v1.2)

After §3.8, compute `mass_delete_pct = polygonsDeleted / prior_feature_count`. On a non-first run:

- `mass_delete_pct > 0.50` (L7c threshold) AND `process.env.RAVINE_ACCEPT_MASS_DELETE !== '1'` → emit CRITICAL WARN audit row + return `verdict: 'FAIL'`. Catches the full-Esri-reload scenario where feature count stayed constant but every OBJECTID rotated — L7 (count-delta) sees 0% change while every row is silently replaced; without L7c the run would report success while the entire table churned.
- Override flag set → emit CRITICAL audit row (status remains FAIL per L7c; override enables execution, not verdict suppression — same operator-facing pattern as L7); transaction commits.
- Otherwise → proceed silently.

The mass-deletion override is intentionally distinct from L7's `RAVINE_ACCEPT_FEATURE_COUNT_DRIFT` — an operator may want to accept the rare full-reload (set L7c override) but still treat any genuine feature-count drift as a signal worth investigating (leave L7 override unset).

### 3.9 Step 6 — Cache validators for next-run skip check

Write the HEAD response's `Last-Modified`, `ETag`, and the downloaded zip's content-hash into `records_meta.ravine_load.{last_modified, etag, content_hash}` so the NEXT run's Step 0a can compare against any of them. Cross-validator caching defends against CDN inconsistencies (L9).

### 3.10 Edge cases

| Case | Behavior |
|---|---|
| HEAD returns 4xx/5xx | Emit FAIL; do not proceed (per L9 + R2 Gemini LOW-2 fold) |
| Download fails (network) | Emit FAIL; do not partially write; pipeline_run rollback |
| Zip is empty / corrupt | Emit FAIL ("malformed source"); abort before transaction |
| `OBJECTID` non-integer or missing | Emit WARN ("CKAN schema drift"); skip that feature; counted toward `invalid_geometry_skipped` (L8 applies) |
| All 854 features invalid (catastrophic) | L8 fires; FAIL + abort BEFORE entering withTransaction; **zero rows touched** (production re-run preserves prior state) |
| Concurrent run attempt | Advisory lock 59 blocks |
| `parcels.geom` SRID mismatch (defense in depth) | `enrich-ravines.js` runtime assertion `Find_SRID('public','parcels','geom') = 4326`; if false, FAIL with operator message |
| **`ravines` table empty at enrich time** *(v1.1 L14)* | `enrich-ravines.js` startup assertion `SELECT COUNT(*) FROM ravines > 0`; if false → FAIL, do not run UPDATE (would NULL out all parcels' enrichment) |

### 3.11 Point-in-time semantics & historical-permit warning (L3)

> Data represents a **point-in-time snapshot** per the CKAN `source_dataset_version` field. Historical permits issued before the snapshot date are evaluated against the *current* geometry — a permit from 2015 will be flagged using the 2018 ravine boundary, which may differ from the 2015 boundary in effect at issue time. Admin UI **MUST** display `source_dataset_version` (or a derived human-readable date) alongside the `is_in_ravine_protection_area` flag to communicate this temporal limitation. Bitemporal extension deferred to a future spec; no historical archives exposed by CKAN per Phase 0 Q0.13.

---

## 4. Testing Mandate (Spec 47 §6 + §10 compliance)

### 4.1 Unit tests (pure functions, no DB / FS) — `src/tests/load-ravines.logic.test.ts`

| Test | Function | Assertion |
|---|---|---|
| OBJECTID → source_id coerce | parsing helper | Integer values pass; non-integer logs warn + skips |
| Drift math (L7) | `computeCountDeltaPct(loaded, prior)` | Returns 0 first run; correct delta otherwise |
| Drift math (L7b) | `computeGeometryUpdatePct(updated, prior)` | Returns 0 first run; correct ratio |
| F-C1 guard logic | `shouldSkipDelete(sourceIds)` | true for empty array; false otherwise |
| ST_MakeValid classifier | `classifyValidatorResult(type, extractedPolygons)` | accepts Polygon/MultiPolygon; rescues GeometryCollection containing polygons; rejects NULL/unsupported (R2 Independent LOW-3) |
| Multi-parcel rule (L12) | `mergeSignedDistances(arr)` | MIN(ABS) × sign(any_inside) — verified against the all-inside / all-outside / mixed cases (R2 Independent CRIT-2 fold test) |

SPEC LINK header in every test file.

### 4.2 Integration tests (filesystem + Postgres fixture, per Spec 48 §3.7) — `src/tests/load-ravines.infra.test.ts`

| Test | Setup | Assertion |
|---|---|---|
| First-run happy path | Empty table; fixture zip with 3 valid polys | All 3 inserted; expected `records_meta.ravine_load` block |
| Idempotent re-run | First-run state; same fixture | `polygons_inserted=0, polygons_updated=0`; `delete_skipped_empty_guard=false` |
| Skip-check (L9) trigger | Stored validators match HEAD | Run returns verdict=`SKIP`; no DB writes |
| Skip-check ETag fallback | `Last-Modified` missing; `ETag` matches | Skip fires on ETag alone |
| L7 drift FAIL | Prior 800; current 100 (87% drop) | verdict=FAIL; no upsert |
| L7 override behavior | Same scenario + `RAVINE_ACCEPT_FEATURE_COUNT_DRIFT=1` | Execution proceeds; audit row status=FAIL; **run verdict=FAIL** (override doesn't suppress; R2 Independent HIGH-3) |
| L7b WARN | Prior=854, current=854, 500 updated | verdict=PASS; WARN row `geometry_update_pct=0.585` |
| L8 FAIL pre-existing data preserved | **Pre-populated** `ravines` table (854 rows) + fixture with 100 features 10 invalid | verdict=FAIL; **`ravines` row count UNCHANGED from pre-test** (R2 Independent MED-5 fold — not "zero rows after run") |
| L8 FAIL empty pre-state | Empty table + same bad fixture | verdict=FAIL; zero rows in ravines table |
| GeometryCollection rescue | Fixture with 1 valid Polygon, 1 GeometryCollection containing polygons | Both accepted; `geometry_collection_extracted=1` |
| F-C1 empty-set guard | Mocked empty load (corner case) | DELETE suppressed; `delete_skipped_empty_guard=true` |
| Advisory lock contention | Concurrent run attempt | Second blocks; first completes; second proceeds |
| **L14 empty-ravines guard (enrich)** | enrich-ravines.js runs against empty `ravines` table | FAIL at startup; **no UPDATE issued; existing parcels enrichment columns preserved** |

### 4.3 DB schema tests — `src/tests/db/migration-N-ravines.db.test.ts`

| Test | Assertion |
|---|---|
| `ravines` table exists with **both** GIST indexes | `idx_ravines_geom_gist` (planar) + `idx_ravines_geog_gist` (geography) per L13 |
| Column types | `source_id BIGINT UNIQUE NOT NULL`; `geom GEOMETRY(MultiPolygon, 4326) NOT NULL`; `updated_at TIMESTAMPTZ NOT NULL` |
| `parcels` additions (M-2) | three new columns including `ravine_dataset_version_when_enriched TEXT` |
| Migration rollback (DOWN) | Tables/columns dropped cleanly; no orphan indexes |

### 4.4 Spec 47 §6.6 PostGIS pre-validation tests

Validate that `ST_IsValid` + `ST_MakeValid` + `ST_CollectionExtract` are invoked BEFORE upsert; fixture with deliberately broken polygon (self-intersection) → repaired counter increments; fixture with GeometryCollection → extracted counter increments.

---

## 5. Operating Boundaries

### Target files (future implementation WFs — NOT this WF)

- `scripts/load-ravines.js` (NEW — Spec 47 skeleton; advisory lock 59)
- `scripts/enrich-ravines.js` (NEW — sibling per L6; advisory lock 60 per L4b)
- `migrations/NNN_create_ravines_table.sql` (NEW — M-1; planar + geography GIST per L13)
- `migrations/NNN_parcels_ravine_columns.sql` (NEW — M-2; SEPARATE from Spec 58's zoning columns migration per L11; includes `ravine_dataset_version_when_enriched`)
- `migrations/NNN_permits_coa_ravine_columns.sql` (NEW — M-3)
- `docs/specs/01-pipeline/43_chain_sources.md` (edit — add `load_ravines` step after `parcels` slug; `enrich_ravines` after `link_parcels` slug)
- `scripts/quality/assert-schema.js` (edit — validate CKAN URL + OBJECTID attribute)
- `scripts/quality/assert-data-bounds.js` (edit — add `ravines` row-count bounds, e.g., `>= 500` lower bound to catch catastrophic load failure) *(R2 Independent HIGH-4 fold)*
- `scripts/lib/geometry-validator.js` (NEW or reuse from Spec 58 implementation — shared ST_MakeValid + ST_CollectionExtract helper) *(R2 Independent HIGH-4 fold)*
- `scripts/lib/safe-math.js` (existing — required per Spec 47 §16 B5; banned raw parseInt/parseFloat) *(R2 Independent HIGH-4 fold)*
- `scripts/manifest.json` (edit — add `source-ravines` + `enrich-ravines` slugs with read/write columns)
- `src/tests/load-ravines.{logic,infra}.test.ts`, `src/tests/enrich-ravines.{logic,infra}.test.ts`, `src/tests/db/migration-N-ravines.db.test.ts`
- `docs/runbook/source_ravines_first_deploy_spike.md` (NEW per Spec 48 §3.7)

### Out-of-scope

- Admin UI surface for displaying the 2 fields — sibling spec under `docs/specs/02-web-admin/`
- Bitemporal/historical compliance — deferred per L3
- Ravine-core vs Regulated Area distinction (would require a new spec — see §8h)
- Per-feature attribute metadata (CKAN has only `OBJECTID`)

### Cross-spec dependencies

| Spec | Dependency |
|---|---|
| Spec 47 | §R1–R12 skeleton; §5.1 advisory lock per script; §6.1 RUN_AT inside lock callback; §6.4 IS DISTINCT FROM guard; §6.6 PostGIS pre-validation; §8.1/§8.2 audit_table cascade (FAIL > WARN > PASS); §10/§11 counter contract; §16 B5 safe-math import |
| Spec 48 | §3.6 dual-pattern audit cascade; §3.7 first-deploy spike runbook |
| Spec 58 | Pattern model; L11 cross-WF serialization; potential reuse of `scripts/lib/geometry-validator.js` |
| Spec 43 | Chain step placement (§8c/§8d) |
| Spec 42 | CoA JOIN path for §8e |

---

## 6. License & Attribution

Toronto Open Data Licence v1.0 — attribution required. Citation: "Contains information licensed under the Open Government Licence – Toronto." Regulatory authority: **Toronto Municipal Code Chapter 658**.

---

## 7. Discovery report cross-reference

Phase 0 report at `docs/reports/wf1-spec59-architecture-discovery.md`. Key findings:
- 7 v1.1-plan folds dissolved by Phase 0 (count corrected in v3→v4 fold log; v4.1 carried through to v1.0 spec; preserved in v1.1).
- Canonical parcels column = `parcels.geom` (Q0.12.b — `parcels.geometry` is a JSONB cache, NOT PostGIS).

---

## 8. Implementation plan (3-WF sequence; deferred)

### 8a — 3-WF sequence diagram

See §1. Datasources-pipeline placement (annual-cadence-or-slower; sibling to Spec 58 zoning).

### 8b — WF1 (this spec) deliverables

**Zero code deliverables.** Spec only.

### 8c — Future WF: `load-ravines.js` + table migration + chain edit

| Deliverable | Detail |
|---|---|
| `scripts/load-ravines.js` | Spec 47 §R1-R12 skeleton; behavioral contract §3; slug = `source-ravines`; advisory lock 59 (L4) |
| Migration M-1 | `CREATE TABLE ravines` (BIGINT source_id, updated_at column) + `idx_ravines_geom_gist` (planar) + `idx_ravines_geog_gist` (geography, mandatory per L13) |
| Spec 43 chain edit | Insert `load_ravines` step AFTER `parcels` slug in `chain_sources` (slug-based placement; not numeric — robust to insertions per R2 Independent MED-6) |
| `scripts/quality/assert-schema.js` edit | Validate CKAN URL reachability + `OBJECTID` attribute presence |
| `scripts/quality/assert-data-bounds.js` edit | `ravines` row count `>= 500` lower bound (catastrophic load failure detection) |
| `scripts/manifest.json` edit | Add `source-ravines` with read_columns=[] (CKAN external), write_columns=[`ravines.*`] |
| Tests | `src/tests/load-ravines.logic.test.ts` + `src/tests/load-ravines.infra.test.ts` + `src/tests/db/migration-N-ravines.db.test.ts` |
| Runbook | `docs/runbook/source_ravines_first_deploy_spike.md` per Spec 48 §3.7 |

### 8d — Future WF: `enrich-ravines.js` sibling script + parcels migration + chain edit

| Deliverable | Detail |
|---|---|
| `scripts/enrich-ravines.js` | Spec 47 skeleton; sibling per L6; advisory lock 60 (L4b). L14 empty-ravines guard at startup. Reads `ravines` + `parcels`; writes `parcels.is_in_ravine_protection_area`, `parcels.ravine_distance_m`, `parcels.ravine_dataset_version_when_enriched`. `IS DISTINCT FROM` guard on UPDATE per L11. SQL uses LATERAL `<->` nearest-neighbor per §11.1. |
| Migration M-2 | `ALTER TABLE parcels ADD COLUMN is_in_ravine_protection_area BOOLEAN NOT NULL DEFAULT false, ADD COLUMN ravine_distance_m DOUBLE PRECISION, ADD COLUMN ravine_dataset_version_when_enriched TEXT`. **SEPARATE from Spec 58's future parcels-zoning migration** per L11. |
| Spec 43 chain edit | Insert `enrich_ravines` step AFTER `link_parcels` slug in chain (slug-based) |
| Tests | `src/tests/enrich-ravines.{logic,infra}.test.ts` + db test for M-2 |

#### L6 trade-off table (sibling vs shared module)

| Concern | Sibling `enrich-ravines.js` (CHOSEN) | Shared `enrich-parcels.js` (REJECTED) |
|---|---|---|
| Blast radius | Failure in ravine processing does NOT block zoning enrichment | Failure in zoning blocks ravine refreshes |
| Independent deployability | Each ships/schedules/rolls back independently | Coupled — both must be tested + deployed together |
| Migration coupling | Separate migrations per L11; either can land first | Single migration; ordering risk |
| Performance | Two passes over `parcels` (both GIST-indexed; <1 minute each with L13 LATERAL) | One pass; minor edge |
| Decision | **Isolation > minor performance gain** per Gemini R1 HIGH-2 |  |

### 8e — Future WF: `enrich-permits.js` ravine step + CoA enrichment + migration

**Concurrency control (L19 — Spec 47 §5.1 mandate, R2.5 Gemini HIGH-2 fold):** the WF implementing §8e MUST acquire an advisory lock for the ravine step. Either reuse the parent `enrich-permits.js` script's existing lock or assign a new ID. Without a lock, concurrent enrich runs (nightly chain + manual retrigger) race on the UPDATE producing non-deterministic outputs and double-fired audit alerts. Spec 59 mandates the requirement; the lock ID is assigned by the implementing WF.

**CoA JOIN path (Spec 58 F-H7 verbatim):**

> The WF implementing §8e MUST verify which CoA-to-parcel join table exists in current schema BEFORE committing to a JOIN plan. If `lead_parcels` mirror table is still active (Spec 42 mig 143-144), use it. Otherwise use `permit_parcels` via `linked_permit_num`. Verification: `SELECT 1 FROM information_schema.tables WHERE table_name = 'lead_parcels' LIMIT 1`; missing table → fall back; both missing → FAIL.

**Multi-parcel rule (L12):**

> `permits.is_in_ravine_protection_area = bool_or(parcels.is_in_ravine_protection_area)` across linked parcels.
>
> `permits.ravine_distance_m = MIN(ABS(parcels.ravine_distance_m)) × CASE WHEN bool_or(parcels.is_in_ravine_protection_area) THEN -1 ELSE 1 END` — the CLOSEST parcel is authoritative (matches operator-triage prose). For two parcels at -10 and -200 (both inside), result is -10 (closest to boundary). For two parcels at +10 and +200 (both outside), result is +10.

### 8f — Future sibling spec: admin UI display

Out of pipeline scope. New spec under `docs/specs/02-web-admin/`. Surfaces:
- `is_in_ravine_protection_area` boolean (badge/chip) on permit + CoA detail panels
- `ravine_distance_m` signed metres (formatted: "0m (inside)", "12m outside", "-50m (inside, centroid 50m deep)")
- `source_dataset_version` per L3

### 8g — End-to-end success criterion

> A known-ravine-adjacent permit row displays `is_in_ravine_protection_area = true` AND `ravine_distance_m ≤ 0` in admin permit-detail; AND a known-non-ravine permit row displays `is_in_ravine_protection_area = false` with positive `ravine_distance_m`.

### 8h — Future-analytics audit note

> Spec 60 was considered (separate centerline data source to distinguish "in_ravine" from "in_regulated_area") but dropped in v4 — the regulatory analysis confirmed both states fall under the same Chapter 658 permit regime. The boolean+distance schema does NOT support a ravine-core vs buffer distinction. If a future analytics need requires that distinction, a new spec is required.

---

## 9. Producer/Consumer Contract (frozen at spec_version 1.2)

### `pipeline.emitSummary` mapping (Spec 47 §R10 + §11.1)

```js
pipeline.emitSummary({
  records_total:   feature_count,        // primary entity = ravine polygons
  records_new:     polygons_inserted,
  records_updated: polygons_updated,
  records_meta: {
    audit_table: {
      phase: 59,
      name: 'Ravine + Natural Feature Protection',
      verdict: <FAIL > WARN > PASS cascade per Spec 47 §8.2>,
      rows: [<see audit-table rows below>]
    },
    ravine_load: { /* see block below */ }
  }
});
```

### `pipeline.emitMeta` contract (Spec 47 §R11 + §8.3 two-argument table-keyed-map signature — L17 fold)

**load-ravines.js:**
```js
pipeline.emitMeta(
  { 'ckan:ravine-natural-feature-protection-area-wgs84': [] },                      // inputs (external CKAN resource; no columns listed for external sources)
  { ravines: ['source_id', 'geom', 'source_dataset_version', 'created_at', 'updated_at'] },  // outputs
);
```

**enrich-ravines.js (§8d):**
```js
pipeline.emitMeta(
  { ravines: ['geom'], parcels: ['geom', 'lead_id'] },                                                                              // inputs
  { parcels: ['is_in_ravine_protection_area', 'ravine_distance_m', 'ravine_dataset_version_when_enriched'] },                       // outputs
);
```

**enrich-permits.js ravine step (§8e):**
```js
pipeline.emitMeta(
  { parcels: ['is_in_ravine_protection_area', 'ravine_distance_m', 'lead_id'], permits: ['lead_id'] },                              // inputs
  { permits: ['is_in_ravine_protection_area', 'ravine_distance_m'] },                                                                // outputs
);
// Symmetric CoA call with coa_applications target, JOIN path per §8e verification.
```

The two-argument table-keyed-map signature feeds the admin DataFlowTile read/write badges. v1.1 used a wrong single-arg flat-string-array form which would have left the Live Meta indicator dark (Independent CRIT-1 R2.5 fold).

### `records_meta.ravine_load` block (frozen schema)

```json
{
  "ravine_load": {
    "spec_version": "1.2",
    "source_dataset_version": "<MD5 hex of downloaded zip, OR ETag if download MD5 unavailable, OR SHA1 of Last-Modified>",
    "last_modified": "<HTTP Last-Modified header value>",
    "etag": "<HTTP ETag header value, or null>",
    "content_hash": "<MD5 of downloaded zip, hex string>",
    "feature_count": 854,
    "polygons_inserted": 0,
    "polygons_updated": 0,
    "polygons_deleted": 0,
    "delete_skipped_empty_guard": false,
    "mass_delete_pct": 0.0,
    "invalid_geometry_repaired": 0,
    "invalid_geometry_skipped": 0,
    "geometry_collection_extracted": 0,
    "drift_check_passed": true,
    "mass_delete_check_passed": true,
    "geometry_update_pct": 0.0,
    "skipped_reason": null
  }
}
```

### Verdict cascade (Spec 47 §8.2)

The overall audit verdict is computed as: `FAIL > WARN > PASS`. Any row with `status='FAIL'` (e.g., L7 even with operator override) makes the overall verdict `FAIL`. WARN-only runs are PASS-with-warnings. *(R2 Gemini NIT-2 fold: explicit cascade documentation.)*

### Audit table rows emitted

| Row name | Source metric | Threshold | Verdict |
|---|---|---|---|
| `ravine_feature_count` | `feature_count` | Informational | INFO |
| `ravine_geometry_repaired_pct` | `invalid_geometry_repaired / feature_count` | Informational | INFO |
| `ravine_geometry_collection_extracted` | `geometry_collection_extracted` | Informational | INFO (NEW v1.1) |
| `ravine_geometry_skipped_pct` | `invalid_geometry_skipped / feature_count` | `> 0.05` (L8) | FAIL |
| `ravine_count_drift_pct` | `count_delta_pct` | `> 0.50` (L7) | FAIL (override doesn't suppress) |
| `ravine_mass_delete_pct` *(NEW v1.2)* | `mass_delete_pct` | `> 0.50` (L7c) on non-first run | FAIL (override `RAVINE_ACCEPT_MASS_DELETE=1` enables execution but does NOT suppress FAIL verdict) |
| `ravine_geometry_update_pct` | `geometry_update_pct` | `> 0.50` (L7b) on non-first run | WARN |
| `ravine_dataset_age_years` | derived from `last_modified` | `> 20` (L9) | WARN |
| `ravine_load_skipped` | from `skipped_reason` | non-NULL | INFO |

### Consumer read protocol (`enrich-ravines.js` MUST follow)

**Cross-run read pattern (L18 fold — R2.5 Independent CRIT-3):** the consumer reads load-script metadata via:

```sql
SELECT records_meta
  FROM pipeline_runs
 WHERE pipeline = 'source-ravines'
   AND status   = 'completed'
 ORDER BY completed_at DESC
 LIMIT 1;
```

This is the canonical pattern for any consumer reading another script's `records_meta`. If no successful run exists, FAIL with "no prior source-ravines successful run; enrichment cannot proceed without a versioned source dataset."

**Validation steps (run in order):**

1. **Spec version pin:** Read `records_meta.ravine_load.spec_version`. If `!== "1.2"` → FAIL "spec version mismatch — abort to prevent contract violation."
2. **`delete_skipped_empty_guard` defense-in-depth:** if `true`, FAIL — the load did not orphan-prune (empty parsed dataset suppressed DELETE), so the `ravines` table may contain stale orphans. In normal operation this is unreachable because zero parsed features would trigger L7 (count-delta) FAIL first, but defense-in-depth against pipeline_runs tracking edge cases (R2.5 Independent HIGH-4 fold).
3. **`drift_check_passed` + `mass_delete_check_passed` + invalid-geometry threshold (defense-in-depth — R2.5 Independent HIGH-4 reconciliation):** validate all three. NOTE: a load run with any of these = false would normally have `status='failed'` (not `'completed'`), so this query would not have returned that row. These checks fire only in pipeline_runs tracking edge cases (manual status overrides, partial-write states). Keep them as belt-and-suspenders.
4. **L14 empty-ravines startup guard:** `SELECT COUNT(*) FROM ravines` — if 0, FAIL "ravines table empty; aborting to prevent NULL-write across all parcels." Cites Spec 47 §6.2 (data read pattern) for the runtime data-presence check pattern, not §4.3 (which is JS-side array-emptiness — R2.5 Independent HIGH-3 cite correction).
5. **Read `source_dataset_version`** and pass it to the UPDATE so each parcel's `ravine_dataset_version_when_enriched` column is populated with the load run's version string.

---

## 10. Cross-WF Tracing Convention

```
[Admin UI permit detail]
   ↓ shows is_in_ravine_protection_area=true + ravine_distance_m=-23.4 + dataset_version (per L3)
[permits.is_in_ravine_protection_area, permits.ravine_distance_m]    ← written by enrich-permits.js (§8e)
   ↓ propagated via L12 (MIN-ABS × sign) over lead_id-linked parcels
[parcels.is_in_ravine_protection_area, parcels.ravine_distance_m]    ← written by enrich-ravines.js (§8d, L6)
   ↓ computed via L13 LATERAL <-> nearest-neighbor
[ravines row(s) intersecting / nearest by source_id]                 ← written by load-ravines.js (§8c)
   ↓ source_id == CKAN OBJECTID
[CKAN dataset]                                                       ← package ravine-natural-feature-protection-area
   ↓ regulated by
[Toronto Municipal Code Chapter 658]                                 ← legal authority
```

**Disagreement protocol (L5):** if `permit_type='RNFP'` ever appears AND geometry-derived `is_in_ravine_protection_area=false`, `enrich-permits.js` emits a `permit_type_geometry_disagreement` WARN with the offending `permit_num`. Geometry remains authoritative until operator action.

---

## 11. Linking Contract

### 11.1 Parcel-level predicate (L13 — LATERAL nearest-neighbor)

```sql
-- enrich-ravines.js UPDATE; runs after L14 empty-ravines guard passes.
WITH enrichment AS (
  SELECT
    p.id AS parcel_id,
    EXISTS (
      SELECT 1 FROM ravines r
       WHERE ST_Intersects(p.geom, r.geom)
    ) AS new_in_ravine,
    (
      -- L13 LATERAL <-> nearest-neighbor — uses ravines_geog_gist index.
      -- Returns the distance to the nearest ravine polygon.
      SELECT ST_Distance(
               ST_Centroid(p.geom)::geography,
               nearest.geom::geography
             ) * CASE
                   WHEN EXISTS (SELECT 1 FROM ravines r2 WHERE ST_Intersects(p.geom, r2.geom)) THEN -1
                   ELSE 1
                 END
        FROM (
          SELECT r.geom
            FROM ravines r
        ORDER BY ST_Centroid(p.geom)::geography <-> r.geom::geography    -- v1.2: both sides cast to geography so <-> binds to the geography operator class and uses ravines_geog_gist for index-driven sort (R2.5 CRIT-1 — 3-reviewer convergent fold). Without the casts, <-> binds to the geometry operator class and uses the planar GIST instead, defeating the geography index.
           LIMIT 1
        ) AS nearest
    ) AS new_distance_m
    FROM parcels p
)
UPDATE parcels p
   SET is_in_ravine_protection_area         = e.new_in_ravine,
       ravine_distance_m                    = e.new_distance_m,
       ravine_dataset_version_when_enriched = $1                       -- L3 data lineage; $1 = source_dataset_version from records_meta
  FROM enrichment e
 WHERE p.id = e.parcel_id
   AND (p.is_in_ravine_protection_area IS DISTINCT FROM e.new_in_ravine
        OR p.ravine_distance_m            IS DISTINCT FROM e.new_distance_m
        OR p.ravine_dataset_version_when_enriched IS DISTINCT FROM $1);
```

Notes:
- `parcels.geom` is the verified canonical PostGIS column (Q0.12.b). `parcels.geometry` is JSONB and MUST NOT be used.
- **L13 corrected v1.2:** `<->` with both operands cast to `::geography` binds to the geography operator class and uses `ravines_geog_gist`. Both indexes are required: planar GIST for `ST_Intersects` (boolean predicate), geography GIST for `<->` nearest-neighbor (signed-distance sort).
- **L2 semantics:** `ST_Distance(point, polygon)::geography` returns 0 when the point is inside the polygon (PostGIS native semantic). Combined with the `* -1` sign for intersecting parcels, intersecting parcels get `ravine_distance_m = 0` (or rarely `-0.0` if the centroid sits exactly on a boundary — operationally equivalent; `-0.0 = 0.0` for IS DISTINCT FROM, so no phantom-write risk on re-runs). The boolean flag is the regulatorily authoritative answer; distance is operator-debug.
- **L14 guard:** the LATERAL subquery returns NULL if `ravines` is empty (`LIMIT 1` finds nothing). L14 startup guard ABORTS before this query runs, so the NULL case is unreachable in production.

### 11.2 Permit / CoA-level propagation (L12 — closest-parcel semantic)

```sql
-- Inside enrich-permits.js ravine step (symmetric for CoA per §8e JOIN-path verification).
WITH propagation AS (
  SELECT
    p.id AS permit_id,
    COALESCE(bool_or(par.is_in_ravine_protection_area), false) AS new_in_ravine,
    MIN(ABS(par.ravine_distance_m)) *
      CASE WHEN bool_or(par.is_in_ravine_protection_area) THEN -1 ELSE 1 END AS new_distance_m
    FROM permits p
    LEFT JOIN parcels par ON par.lead_id = p.lead_id    -- or permit_parcels.linked_permit_num per §8e verification
GROUP BY p.id
)
UPDATE permits p
   SET is_in_ravine_protection_area = prop.new_in_ravine,
       ravine_distance_m            = prop.new_distance_m
  FROM propagation prop
 WHERE p.id = prop.permit_id
   AND (p.is_in_ravine_protection_area IS DISTINCT FROM prop.new_in_ravine
        OR p.ravine_distance_m            IS DISTINCT FROM prop.new_distance_m);
```

Semantics per L12:
- Boolean: any linked parcel inside → `true`.
- Distance: `MIN(ABS)` then attach sign from `bool_or`. For two inside parcels at -10/-200, ABS is 10/200, MIN is 10, sign is negative → result -10 (closest-to-boundary, still inside). For two outside parcels at +10/+200, result +10 (closest). Mixed (-50, +200) → ABS 50/200, MIN 50, sign negative (any-inside) → -50.
- `COALESCE(bool_or(...), false)` defends against zero-parcel permits (orphan permits): boolean = false. Distance = `MIN(ABS(NULL))` = NULL × +1 = NULL. **Orphan permits intentionally get `ravine_distance_m = NULL`** (distinct from `0` which means "centroid inside a ravine"); admin UI should display "no parcel link" rather than treating NULL as zero (R2.5 Independent MEDIUM-2 fold — orphan handling now explicit).
- **Mixed-sign edge case (R2.5 Independent HIGH-2):** when a permit has BOTH inside and outside parcels and the OUTSIDE parcel is closest-to-boundary (e.g., `{-200 inside, +10 outside}`), MIN(ABS)=10 from the outside parcel but `bool_or`=true → result `-10`. This conveys "inside, 10m from boundary" while the 10m magnitude actually came from an outside parcel. **This is intentional:** the boolean flag is the regulatorily authoritative answer (the permit IS in the ravine protection area); the distance is operator-debug "how close to a boundary" — `MIN(ABS)` always picks the smallest absolute value regardless of sign. Operators reviewing `ravine_distance_m=-10` for a multi-parcel permit should consult per-parcel data via the audit trace. Future hardening (deferred) could decompose into `min_inside_depth_m` + `min_outside_distance_m` if this proves operator-confusing.

### 11.3 Source-of-truth precedence (L5)

Geometry-derived is authoritative. If `permits.permit_type = 'RNFP'` ever appears (currently zero rows) AND geometry says `false` → emit WARN audit row; do NOT auto-flip. Operator triages.

### 11.4 What this contract intentionally does NOT define

- Ravine-core vs Regulated Area sub-classification (would require separate centerline dataset; explicitly out of scope per §8h)
- Adjacency/advisory flag (Chapter 658 either applies or doesn't — adjacency has no regulatory meaning)
- Edge-to-boundary distance (chose centroid-to-nearest-ravine for stability + meaningful "depth" semantics; PostGIS `ST_Distance(point, polygon) = 0` for inside is acceptable per L2)

---

*End of Spec 59 v1.1.*
