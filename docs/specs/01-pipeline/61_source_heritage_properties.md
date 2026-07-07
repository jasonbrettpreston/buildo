# Spec 61 -- Toronto Heritage Properties (Ingest + Link)

**Spec version:** 1.1 (locked per L10)
**Status:** Implemented — §8c `load-heritage.js` (`169f22a`, advisory lock **61**) + §8d `enrich-heritage.js` (`e299d26`, advisory lock **62**) + §8e enrich-permits heritage propagation (`32d94fe`) + #426 register re-key (`78748a3`) + #428 Spec 49 rows (`a8ac7d5`) all SHIPPED. Remaining: §8f admin UI. **The shipped Part IV/V match is CONTAINMENT (`ST_Intersects`), NOT the spec's original `ST_DWithin`+radius — see the §11.1 IMPLEMENTED note + review_followups #424.**
**Authored:** 2026-05-26 after 3-pass adversarial PLAN review cadence (R1 + R2 + R3) + user-direction Gate 1.5 + Phase 0 architecture discovery + v2 fold; **v1.1 fold:** R3 SPEC review (Gemini + DeepSeek + Independent) -- 4 CRIT + 5 HIGH folded; ~14 MED routed to `review_followups.md`
**Phase 0 discovery:** `docs/reports/wf1-spec61-architecture-discovery.md`

## v1.0 -> v1.1 fold log (R3 SPEC: 4 CRIT + 5 HIGH + 14 MED)

- **C-v1.1.1 (3-way convergent: Gemini + DeepSeek + Independent CRIT-1, confidence 100):** §11.2 propagation SQL was syntactically invalid -- `bool_or(...) OVER ()` window function nested inside CASE inside GROUP BY CTE. PostgreSQL would reject. v1.1 rewrites §11.2 with a 3-CTE chain (per_permit_state -> per_permit_winner -> per_permit_date) so each level has a single aggregation context.
- **C-v1.1.2 (Independent CRIT-2):** §11.1 IS DISTINCT FROM clause duplicated correlated sub-SELECTs on every re-run row, causing O(N) extra DB roundtrips. v1.1 materializes `new_designation_date` as `new_date` column in the `enrichment` CTE so the WHERE clause references `e.new_date` directly.
- **C-v1.1.3 (Independent CRIT-3):** §9 Consumer protocol step 3 said "if BOTH = 0, FAIL" -- but if only one of the two datasets returns 0 features, the guard silently passes. v1.1 changes to per-table FAIL: each table independently checked; per-table FAIL message for operator triage.
- **C-v1.1.4 (Gemini CRIT + DeepSeek HIGH):** §11.1 performance concern -- noted; mitigated by the C-v1.1.2 IS DISTINCT FROM materialization fix. The LATERAL ST_DWithin pre-filter via GIST already cuts candidates to ~0-3 per parcel; the bottleneck was the re-evaluated correlated subqueries in WHERE, now eliminated. Incremental-only enrichment (Gemini's suggestion) deferred to future-WF optimization since it requires diff-tracking of heritage_properties changes between runs.
- **H-v1.1.1 (Gemini HIGH + Independent HIGH-1, confidence 95):** L27 `normalize_address()` only handled `avenue`->`ave` + `street`->`st`. Phase 0 Q0.17 observed 7 suffix types. v1.1 expands the function to handle `avenue/ave`, `street/st`, `road/rd`, `boulevard/blvd`, `crescent/cres`, `drive/dr`, `place/pl`, `court/crt` (8 suffix mappings).
- **H-v1.1.2 (Independent HIGH-2):** §3.4 L25 filter used strict `===` on CKAN STATUS values. v1.1 mandates case-insensitive comparison via `.toLowerCase()` normalization + WARN audit row for any unrecognized STATUS / HCD_TYPE value (preserves robustness against CKAN normalization changes).
- **H-v1.1.3 (Independent HIGH-3):** §9 frozen `records_meta` block used `polygons_inserted/updated/deleted` counter names for BOTH datasets, despite Heritage Register being Points. v1.1 renames to `features_inserted/updated/deleted` (consistent with Spec 47 §11 records_total/new/updated convention).
- **H-v1.1.4 (Independent HIGH-4):** §12.4 + L22 didn't specify ordering between enrich_zoning, enrich_ravines, enrich_heritage. v1.1 spells out the full chain segment: `link_parcels` -> `enrich_zoning` (Spec 58) -> `enrich_ravines` (Spec 59) -> `enrich_heritage` (Spec 61) -> assert_data_bounds.
- **H-v1.1.5 (Independent HIGH-7):** §5 listed `scripts/lib/geometry-validator.js` as "reuse from Spec 58/59" -- but Spec 58/59 are spec-only; the file doesn't exist yet. v1.1 adds explicit dependency-risk note: "if Spec 58/59 implementation hasn't landed when Spec 61 implementation begins, this file must be created here."

### Gemini's L5 challenge + DeepSeek's Levenshtein-2 challenge (RECORDED, NOT FOLDED)

- **Gemini HIGH on L5:** Geometry-only authority should be FAIL not WARN on disagreement. Locked user decision (Gate 1.5 + "designations rarely change" rationale) stands; documented in fold log for transparency.
- **DeepSeek HIGH on Levenshtein-2:** "123 MAIN ST" vs "123 MAIN ST E" = distance 2 but different addresses. v1.1 keeps Levenshtein-2 as recommended default (per user Gate 1.5); operator can tune via `heritage_address_levenshtein_threshold` in logic_variables.json. Documented as future-empirical-calibration item routed to `review_followups.md`.

### 14 MEDIUMs routed to `docs/reports/review_followups.md` rows 380+

D1. §3.7 ON CONFLICT UPDATE missing some columns from IS DISTINCT FROM guard -- phantom updates risk (Gemini MEDIUM)
D2. M-1 DOWN should query pg_depend before drops (Gemini MEDIUM)
D3. §11.1 Part V HCD tie-break `hd.id ASC` arbitrary -- could be largest ST_Area(ST_Intersection) (Gemini MEDIUM)
D4. heritage_district_id FK suggestion for heritage_properties part_v_member rows (Gemini NIT)
D5. §11.1 redundant date lookups in IS DISTINCT FROM (covered partly by C-v1.1.2 fix; remaining: join in FROM for ergonomics; Gemini LOW)
D6. Skip-check ETag unreliable on CKAN (DeepSeek MEDIUM)
D7. L23 spec_version exact-match brittle for future version bumps (DeepSeek MEDIUM)
D8. L12 designation_date tie-break should prefer winning-type-driven row (DeepSeek MEDIUM)
D9. Part V points in heritage_properties are dead data (only Part IV path uses them) (DeepSeek NIT)
D10. Levenshtein threshold not Zod-validated >= 0 (DeepSeek NIT)
D11. heritage_districts.designated_date NOT NULL fragile (Independent M-1)
D12. §3.7 Phase B IS DISTINCT FROM guard columns not named (Independent M-2)
D13. §12.5 `>= 8000` threshold derivation undocumented (Independent M-4)
D14. L26 batched-INSERT JS looping logic + transaction wrapping not specified (Independent M-5)
D15. §9 emitMeta lists parcels.lead_id -- verify against actual parcels schema (Independent M-7)
D16. Test fixtures missing for Part V-only + ST_Multi single-polygon + HCD designated_date NOT NULL (DeepSeek + Independent)
D17. Levenshtein-2 too permissive for "123 MAIN ST" vs "123 MAIN ST E" -- empirical Phase 0+ refinement (DeepSeek HIGH downgraded)
D18. §8e Spec 58 F-H7 verbatim reference not independently locked (Independent M-6)

---

## Cumulative design decisions (locked through v2 after Phase 0)

| ID | Decision |
|---|---|
| **L1** | TWO source enums + ONE target enum. Source: `heritage_register.STATUS IN ('Part IV', 'Part V')` + `heritage_districts.HCD_TYPE = 'Designated District'`. Target: `parcels.heritage_designation_type TEXT CHECK IN ('part_iv_individual', 'part_v_hcd')`. Listed + Under Appeal + Under Study rows filtered OUT at JS load. |
| **L2** | `heritage_designation_date DATE` -- unconditionally populated from `heritage_register.DESIGNATED` or `heritage_districts.HCD_DESDAT`. Sentinel `1899-11-30` mapped to NULL. |
| **L3** | Point-in-time MVP semantics; `source_dataset_version` UI display mandated. |
| **L4** | `load-heritage.js` advisory lock = **61** (SHIPPED: lock = spec number, mirroring load-ravines=59 / load-zoning=58. The spec's original **62** was superseded at implementation — DEC-A in `load-heritage.js:33`). |
| **L4b** | `enrich-heritage.js` advisory lock = **62** (SHIPPED: sibling of load-heritage=61. The spec's original **63** was superseded — DEC-A in `enrich-heritage.js:26`). |
| **L4c** | `enrich-permits.js` heritage step advisory lock = **64** (the enrich-permits script's own lock; shipped §8e propagation). |
| **L5** | Geometry-derived `is_heritage_designated` is authoritative. Disagreement with future `permit_type='Heritage'` -> WARN audit row; the boolean is ALWAYS derived from geometry. Rationale (user 2026-05-26): "designations rarely change." |
| **L6** | Sibling script `enrich-heritage.js` (NOT shared `enrich-parcels.js`). 3rd parcels-writer after Spec 58 zoning + Spec 59 ravine. |
| **L7/L7b/L7c** | Three drift signals -- count-delta / geometry-update / mass-deletion -- 50% threshold + override flag per Spec 59. |
| **L8** | 5% invalid-geometry threshold; abort-before-DELETE. |
| **L9** | HEAD `Last-Modified` + ETag + content-hash skip-check; **2-year** WARN threshold (quarterly cadence per Phase 0 Q0.8). |
| **L10** | `spec_version: 1.1` lock (bumped from 1.0 in R3 SPEC fold; consumer protocol pins on 1.1). |
| **L11** | Cross-WF serialization: SEPARATE migration files per spec; `IS DISTINCT FROM` UPDATE guards; slug-based Spec 43 chain step placement. |
| **L12** | Heritage = boolean (`is_heritage_designated`). Multi-parcel propagation: `bool_or(par.is_heritage_designated)`. For `heritage_designation_type`: deterministic precedence via per-type bool_or CASE expression -- Part IV wins over Part V HCD. Applies symmetrically to BOTH permits AND coa_applications. |
| **L13** | **TWO-table schema** (per Phase 0 P0-1): `heritage_properties` (Points from Heritage Register; Part IV + Part V member-of-HCD points) + `heritage_districts` (**29 designated HCD Polygons live**; the spec's original "32" was pre-load estimate). §11 SQL split into two branches — SHIPPED as containment: Part V via `ST_Intersects(parcels.geom, heritage_districts.geom)`; **Part IV also via `ST_Intersects(parcels.geom, heritage_properties.geom)`** — the parcel that CONTAINS the point (NOT the spec's original `ST_DWithin`+Levenshtein, which over-matched 4×; levenshtein is now only a tiebreak when a parcel contains >1 Part IV point). See §11.1 IMPLEMENTED note + review_followups #424. |
| **L14** | Empty-source guard on load: zero-feature first-run = FAIL; zero-feature subsequent-run = WARN (F-C1 preserves prior table). |
| **L15** | F-C1 empty-set DELETE guard in JS layer (NOT PL/pgSQL DO) per Spec 59. |
| **L16** | Batched VALUES+UNNEST geometry validation per Spec 59 (Spec 47 §B1 Loop Query Ban compliance). |
| **L17** | `pipeline.emitMeta` two-argument table-keyed-map signature per Spec 47 §8.3. |
| **L18** | Cross-run `records_meta` read pattern for enrich consumer per Spec 59 L18. |
| **L19** | `enrich-permits.js` heritage step is a self-contained function `applyHeritageEnrichment(client, RUN_AT)` -- runs inside enrich-permits.js parent lock 64. |
| **L20** | Lock ID assignments final: 62/63/64 verified unassigned in §A.5 + `scripts/*.js`. §A.5 registry update is §12.4 deliverable. |
| **L21** | Unlinked-heritage-point audit row `heritage_points_no_parcel_match` with WARN >5% / FAIL >20% thresholds in `logic_variables.json` (Phase 0 may empirically refine). |
| **L22** | Chain step ordering per chain (per v1.3 C-v1.3.2 correction): within `chain_sources`: `load_parcels` -> `load_heritage` -> ... -> `enrich_heritage` -> assert steps. Within `chain_permits`/`chain_coa`: `link_*` -> `enrich_*_propagate_heritage`. Cross-chain dependency `chain_sources` -> `chain_permits`/`chain_coa` (orchestrator-level, already enforced). |
| **L23** | `enrich-heritage.js` empty-source guard: (a) prior successful `source-heritage` run exists per `pipeline_runs`; (b) `records_meta.heritage_load.feature_count > 0` (closes the v1.2 stale-data loophole); (c) `SELECT COUNT(*) FROM heritage_properties` matches prior. |
| **L24** | `enrich-permits.js` heritage step has information_schema startup check verifying `parcels.is_heritage_designated` + `parcels.heritage_designation_type` columns exist. |
| **L25** | Load filter rules: `heritage_register.STATUS = 'Listed'` -> drop; `heritage_districts.HCD_TYPE IN ('Under Appeal', 'Under Study')` -> drop. Only by-law-impacting per user scope. |
| **L26** | Heritage Register load uses **batched direct INSERT in 1,000-row chunks** (12,320 features × ~3 params = ~37K params; well under 65,535 limit). HCDs use single-batch direct INSERT (32 features). No staging-CTE. |
| **L27** | `normalize_address()` PL/pgSQL function: lowercase + collapse multi-space + strip whitespace + standardize STREET_TYP suffixes (`AVE`<->`AVENUE`, `ST`<->`STREET`, `RD`<->`ROAD`, etc.). No unit-number handling (Heritage Register doesn't publish units). Defined in M-1. |

**Compliance:** Spec 43 (chain orchestration) + Spec 47 (R1-R12 script protocol) + Spec 48 (§3.6 dual-pattern + §3.7 first-deploy spike).

---

## 1. Goal & User Story

**Goal:** Ingest Toronto's two Heritage CKAN datasets (Heritage Register + Heritage Conservation Districts) and link each `permits` row + `coa_applications` row to it via parcels spatial join, so admin permit/CoA detail panels can display: `is_heritage_designated BOOLEAN` + `heritage_designation_type` (Part IV / Part V HCD) + `heritage_designation_date DATE`.

**User story (operator):** "When I open a permit or CoA detail page, I want to immediately see whether the property is by-law-impacting heritage (Part IV individual designation or within a Part V HCD), what kind, and when it was designated -- without consulting Toronto's external Heritage Register."

### 3-WF data flow

```
+-------------------------------------------------------------------+
| WF1 = Spec 61 (this spec) -- spec-only; no code                   |
+-------------------------------------------------------------------+

+- SHIPPED (§8c, 169f22a) -----------------------------------------+
| load-heritage.js (advisory lock 61 — shipped; spec's 62 stale)    |
|   - Loads heritage_register (12,320 Points; Part IV + Part V)     |
|   - Loads heritage_districts (32 Polygon/MultiPolygon)            |
|   - Filters Listed + Under Appeal/Study at JS load time           |
| migration M-1 (Spec 47 §A.5 registry update)                      |
|   - CREATE EXTENSION fuzzystrmatch                                |
|   - CREATE FUNCTION normalize_address(TEXT)                       |
|   - CREATE TABLE heritage_properties (12-col Points table)        |
|   - CREATE TABLE heritage_districts (10-col Polygon table)        |
| chain_sources edit: load_heritage AFTER load_parcels              |
+--------------------------------------------------------------------+

+- SHIPPED (§8d, e299d26) -----------------------------------------+
| enrich-heritage.js (advisory lock 62 — shipped; spec's 63 stale)  |
|   - L23 empty-source guard at startup                             |
|   - Single UPDATE per §11 (LATERAL LIMIT 1 with tie-break)        |
| migration M-2 (separate from Spec 58 zoning + Spec 59 ravine)     |
|   - ALTER parcels ADD 3 heritage columns                          |
| chain_sources edit: enrich_heritage AFTER link_parcels            |
+--------------------------------------------------------------------+

+- SHIPPED (§8e, 32d94fe) -----------------------------------------+
| enrich-permits.js heritage step (advisory lock 64)                 |
|   - Self-contained applyHeritageEnrichment(client, RUN_AT) fn     |
|   - L24 information_schema startup check                          |
|   - L12 multi-parcel propagation: bool_or + Part IV-wins precedence|
| migration M-3 (separate from Spec 58 + 59)                        |
|   - ALTER permits + coa_applications ADD 3 heritage columns        |
| chain_permits + chain_coa edits                                   |
+--------------------------------------------------------------------+

+- Future sibling spec (§8f, NOT this WF) -------------------------+
| Admin UI display: is_heritage_designated + designation_type       |
|                   + designation_date + source_dataset_version     |
+--------------------------------------------------------------------+
```

---

## 2. Data Source

| Field | Value |
|---|---|
| **Heritage Register CKAN package** | `heritage-register` (`e41da515-5ad1-4bc3-85ea-18ec9e55cd33`) |
| Active resource | `108b1080-d048-439f-a9e8-e8d6cd81bddb` (Shapefile, 1.6 MB, last-modified 2026-05-21) |
| Direct URL | `https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/e41da515-5ad1-4bc3-85ea-18ec9e55cd33/resource/108b1080-d048-439f-a9e8-e8d6cd81bddb/download/heritage_register_address_points_wgs84.zip` |
| Geometry | POINT (12,320 features) |
| Projection | EPSG:4326 (WGS84) native |
| **HCD CKAN package** | `heritage-conservation-districts` (`37a3c911-0813-4e87-90ed-3b9fa6156a63`) |
| Active resource | `8e6b9347-63a8-4dac-91fb-a6491a8c1e5a` (Shapefile, 90 KB, last-modified 2026-03-02) |
| Direct URL | `https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/37a3c911-0813-4e87-90ed-3b9fa6156a63/resource/8e6b9347-63a8-4dac-91fb-a6491a8c1e5a/download/heritageconservationdistrict.zip` |
| Geometry | Polygon + MultiPolygon (32 features; `ST_Multi()` cast required) |
| Projection | EPSG:4326 (WGS84) native |
| **Refresh cadence** | Quarterly (both datasets) |
| **Regulatory authority** | Ontario Heritage Act, Parts IV (individual property designation) + V (Heritage Conservation Districts) |
| **Pipeline category** | Datasources chain (sibling to Spec 58 zoning + Spec 59 ravine) |
| **Licence** | Toronto Open Data Licence v1.0 -- attribution required |

### Target tables

```sql
-- M-1: Heritage Register points (filtered to Part IV + Part V at JS load)
CREATE TABLE heritage_properties (
  id                     BIGSERIAL PRIMARY KEY,
  source_id              BIGINT UNIQUE NOT NULL,            -- from Folder_Row (#426: the Q2 2026 CKAN refresh dropped OBJECTID; Folder_Row is the new stable unique key)
  status                 TEXT NOT NULL CHECK (status IN ('part_iv', 'part_v_member')),
  geom                   GEOMETRY(Point, 4326) NOT NULL,
  designated_date        DATE,                               -- from DESIGNATED (sentinel 1899-11-30 -> NULL)
  bylaw_no               TEXT,
  htg_conser_name        TEXT,                               -- from HTG_CONSER; references heritage_districts.name when status='part_v_member'
  building_type          TEXT,                               -- from BUILDING_T
  reason                 TEXT,                               -- from REASON
  address_text           TEXT NOT NULL,                      -- from ADDRESS; used for L13 fuzzy match
  construction_year      INTEGER,                            -- from CONSTRUCTI
  source_dataset_version TEXT NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX heritage_properties_geom_gist ON heritage_properties USING GIST (geom);
CREATE INDEX heritage_properties_geog_gist ON heritage_properties USING GIST (geography(geom));   -- for <-> KNN per L13
CREATE INDEX heritage_properties_status_idx ON heritage_properties (status);

-- M-1: Heritage Conservation Districts polygons (filtered to 'Designated District' at JS load)
CREATE TABLE heritage_districts (
  id                     BIGSERIAL PRIMARY KEY,
  source_id              BIGINT UNIQUE NOT NULL,            -- from HCD_NO
  name                   TEXT NOT NULL,                      -- from HCD_NAME
  hcd_type               TEXT NOT NULL CHECK (hcd_type = 'designated_district'),
  geom                   GEOMETRY(MultiPolygon, 4326) NOT NULL,
  designated_date        DATE NOT NULL,                      -- from HCD_DESDAT
  bylaw_no               TEXT NOT NULL,                      -- from HCD_BYLAWN
  wards                  TEXT,                               -- from HCD_WARDS
  source_dataset_version TEXT NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX heritage_districts_geom_gist ON heritage_districts USING GIST (geom);
```

### Parcels additions (§8d M-2; SEPARATE migration file per L11)

```sql
ALTER TABLE parcels
  ADD COLUMN is_heritage_designated      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN heritage_designation_type   TEXT CHECK (heritage_designation_type IS NULL OR heritage_designation_type IN ('part_iv_individual', 'part_v_hcd')),
  ADD COLUMN heritage_designation_date   DATE;
```

### Permits + CoA additions (§8e M-3)

```sql
ALTER TABLE permits
  ADD COLUMN is_heritage_designated      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN heritage_designation_type   TEXT CHECK (heritage_designation_type IS NULL OR heritage_designation_type IN ('part_iv_individual', 'part_v_hcd')),
  ADD COLUMN heritage_designation_date   DATE;

ALTER TABLE coa_applications
  ADD COLUMN is_heritage_designated      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN heritage_designation_type   TEXT CHECK (heritage_designation_type IS NULL OR heritage_designation_type IN ('part_iv_individual', 'part_v_hcd')),
  ADD COLUMN heritage_designation_date   DATE;
```

---

## 3. Behavioral Contract (`load-heritage.js`)

### 3.1 Spec 47 §R1-R12 skeleton (mandatory)

```js
#!/usr/bin/env node
/**
 * Load Toronto Heritage Properties (Heritage Register + HCDs).
 * SPEC LINK: docs/specs/01-pipeline/61_source_heritage_properties.md
 */
'use strict';

const pipeline = require('./lib/pipeline');
const { loadMarketplaceConfigs } = require('./lib/config-loader');
const { z } = require('zod');

const ADVISORY_LOCK_ID = 61;   // L4 (SHIPPED: lock = spec number; spec's original 62 superseded)
const SPEC_VERSION = '1.1';    // L10 (shipped as 1.1; consumer protocol pins on 1.1)

const ConfigSchema = z.object({
  heritageSkipCheckThresholdYears:        z.number().default(2),    // L9
  heritageAcceptFeatureCountDriftPct:     z.number().default(0.50), // L7
  heritageInvalidGeometryFailPct:         z.number().default(0.05), // L8
  heritagePointMatchRadiusM:              z.number().default(50),   // L13
  heritageAddressLevenshteinThreshold:    z.number().int().default(2), // L13
  heritageUnlinkedPointWarnPct:           z.number().default(0.05), // L21
  heritageUnlinkedPointFailPct:           z.number().default(0.20), // L21
});

pipeline.run('source-heritage', async (pool) => {
  const { logicVars } = await loadMarketplaceConfigs(pool, 'source-heritage');
  const config = ConfigSchema.parse(logicVars);

  return await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    const RUN_AT = await pipeline.getDbTimestamp(pool);              // §R3.5 captured inside lock callback

    // Two phases within single advisory lock:
    //   3.2 Phase A: load Heritage Register (12,320 Points, batched 1000-row INSERT per L26)
    //   3.3 Phase B: load HCDs (32 Polygons, single-batch INSERT)
    // §R10 emitSummary + §R11 emitMeta called LAST inside this callback

    // Steps below: §3.2-§3.11 detail.
  });
});
```

### 3.2 Step 0a -- HEAD `Last-Modified` + ETag + content-hash skip-check (L9; 2-year threshold per Phase 0 P0-3)

For each of the two CKAN resources, HEAD the URL and compare validators against prior successful run's cached values. Skip if all unchanged. WARN if missing OR older than 2 years.

### 3.3 Step 0b -- Download + unzip + parse

Both Shapefile bundles downloaded via `node-fetch`; unzipped via `node-stream-zip`; parsed via npm `shapefile` library. Tempdir cleanup mandatory via `{ unsafeCleanup: true }` or `try/finally fs.rm`.

### 3.4 Step 1 -- JS-side load filter (L25) [H-v1.1.2 case-insensitive fold]

**Case-insensitive comparison** (per H-v1.1.2 fold -- CKAN may normalize case differently across revisions):

```js
const statusNorm = (feature.properties.STATUS || '').toLowerCase().trim();
if (statusNorm === 'listed') continue;                                    // drop Listed
if (!['part iv', 'part v'].includes(statusNorm)) {
  pipeline.emitWarn(`unknown STATUS value '${feature.properties.STATUS}' on Folder_Row=${feature.properties.Folder_Row}; skipping`); // #426: OBJECTID dropped in Q2 2026
  invalidStatusCount++;
  continue;
}

const hcdTypeNorm = (feature.properties.HCD_TYPE || '').toLowerCase().trim();
if (hcdTypeNorm !== 'designated district') continue;                      // drop Under Appeal / Under Study
```

Map source `STATUS` to target `status`:
- `'Part IV'` (case-insensitive) -> `'part_iv'`
- `'Part V'`  (case-insensitive) -> `'part_v_member'`

Map source `DESIGNATED` sentinel `1899-11-30` -> NULL (per L2 + Phase 0 Q0.16).

Unknown STATUS or HCD_TYPE values emit `unknown_status_count` / `unknown_hcd_type_count` audit rows (WARN status).

### 3.5 Step 2 -- Batched geometry validation (L16, Spec 47 §B1)

Single round-trip per phase using `VALUES + UNNEST` (Spec 59 §3.5 pattern). For Heritage Register Points, classify ST_GeometryType results; reject anything not Point. For HCDs, accept Polygon + MultiPolygon (apply `ST_Multi()`). L8 abort-before-transaction if invalid_geometry_skipped/N > 5%.

### 3.6 Step 3 -- Feature-count drift (L7) + mass-deletion drift (L7c) + geometry-update drift (L7b)

All three drift signals per Spec 59 pattern. Override flag `HERITAGE_ACCEPT_FEATURE_COUNT_DRIFT=1` + `HERITAGE_ACCEPT_MASS_DELETE=1`.

#### 3.6.1 Register re-key DEPLOY RUNBOOK (one-time, #426)

The Heritage Register source_id re-key (#426, shipped `78748a3`) is a natural-key change on
`heritage_properties`. On the deploy that re-keys the register, the loader's mass-deletion drift
guard WILL trip (nearly every row is deleted-and-reinserted under the new key), so it must be run
with the accept flag AND a manual backup:

```
# 1. Back up heritage_properties BEFORE the re-key load (the drift guard's DELETE is not rolled back)
pg_dump -h <host> -U <user> -d buildo -t heritage_properties \
  > backups/heritage_properties_pre_rekey_$(date +%Y%m%d).sql

# 2. Run the load with the mass-delete override (one-time — do NOT leave it set)
HERITAGE_ACCEPT_MASS_DELETE=1 node scripts/run-chain.js sources   # or the standalone load-heritage step
```

This is a one-time operation for the re-key deploy only; the flag must NOT be left in the standing
cron env (it would suppress a genuine catastrophic-delete signal on future quarterly loads).

### 3.7 Step 4 -- Batched direct INSERT (L26)

```sql
-- Phase A: Heritage Register (12,320 features, batched 1000-row chunks)
INSERT INTO heritage_properties (source_id, status, geom, designated_date, bylaw_no, htg_conser_name, building_type, reason, address_text, construction_year, source_dataset_version, updated_at)
VALUES (...), (...), ... (1000 rows per chunk)
ON CONFLICT (source_id) DO UPDATE
  SET status                 = EXCLUDED.status,
      geom                   = EXCLUDED.geom,
      designated_date        = EXCLUDED.designated_date,
      bylaw_no               = EXCLUDED.bylaw_no,
      htg_conser_name        = EXCLUDED.htg_conser_name,
      building_type          = EXCLUDED.building_type,
      reason                 = EXCLUDED.reason,
      address_text           = EXCLUDED.address_text,
      construction_year      = EXCLUDED.construction_year,
      source_dataset_version = EXCLUDED.source_dataset_version,
      updated_at             = EXCLUDED.updated_at
  WHERE heritage_properties.geom            IS DISTINCT FROM EXCLUDED.geom
     OR heritage_properties.status          IS DISTINCT FROM EXCLUDED.status
     OR heritage_properties.designated_date IS DISTINCT FROM EXCLUDED.designated_date
     OR heritage_properties.address_text    IS DISTINCT FROM EXCLUDED.address_text
     OR heritage_properties.source_dataset_version IS DISTINCT FROM EXCLUDED.source_dataset_version;

-- Phase B: HCDs (32 features, single batch)
INSERT INTO heritage_districts (source_id, name, hcd_type, geom, designated_date, bylaw_no, wards, source_dataset_version, updated_at)
VALUES ...
ON CONFLICT (source_id) DO UPDATE SET ... WHERE ... IS DISTINCT FROM ...;
```

### 3.8 Step 5 -- Bounded DELETE with F-C1 empty-set guard in JS layer (L15)

JS-side guard (not PL/pgSQL DO block). Per Spec 59 v1.2 L15 pattern.

### 3.9 Step 6 -- Cache validators for next-run skip check (L9)

Write per-resource `last_modified`, `etag`, `content_hash` into `records_meta.heritage_load.{heritage_register,heritage_districts}.*`.

### 3.10 Edge cases

| Case | Behavior |
|---|---|
| HEAD returns 4xx/5xx | FAIL; do not proceed |
| Download fails | FAIL; pipeline_run rollback |
| Zip malformed | FAIL; abort before transaction |
| `OBJECTID`/`HCD_NO` non-integer or missing | WARN; skip feature; counted toward `invalid_geometry_skipped` |
| All features invalid | L8 fires; FAIL + abort BEFORE entering withTransaction |
| Concurrent run attempt | Advisory lock 62 blocks |
| `heritage_register` empty at first run | L14 FAIL |
| `heritage_register` empty after prior successful run | F-C1 guard preserves prior table; emit WARN |

### 3.11 Point-in-time semantics & historical-permit warning (L3)

> Data represents a point-in-time snapshot per the CKAN `source_dataset_version`. Historical permits are evaluated against current geometry. Admin UI MUST display `source_dataset_version` alongside the flag.

---

## 4. Testing Mandate (Spec 47 §6 + Spec 48 §3.6 + §3.7 compliance)

### 4.1 Unit tests -- `src/tests/load-heritage.logic.test.ts`

- OBJECTID + HCD_NO integer coercion
- Drift math (L7 + L7b + L7c)
- F-C1 guard logic (L15)
- DESIGNATED sentinel `1899-11-30` -> NULL mapping
- ST_MakeValid classifier accepts Point + Polygon + MultiPolygon; rejects others
- L12 multi-parcel precedence calculation (Part IV > Part V HCD via per-type bool_or)
- L25 load filter rules: Listed dropped, Under Appeal/Study dropped
- L27 `normalize_address()` round-trip (verify suffix mapping)

### 4.2 Integration tests -- `src/tests/load-heritage.infra.test.ts`

- First-run happy path: empty table + fixture -> all features inserted
- Idempotent re-run: no changes -> `polygons_inserted=0`, `polygons_updated=0`
- Skip-check trigger via cached validators
- ETag fallback skip-check
- L7 drift FAIL + override-proceeds-but-verdict-FAIL
- L8 FAIL pre-existing data preserved (row count unchanged from pre-test)
- L25 Listed filter: fixture with mixed STATUS values -> only Part IV + Part V loaded
- L14 empty-source guard: first-run-empty -> FAIL; subsequent-run-empty -> WARN
- Advisory lock 62 contention

### 4.3 Enrich-side tests -- `src/tests/enrich-heritage.infra.test.ts`

- L23 empty-source guard: 3-tier (no prior run / zero feature_count / external truncation)
- §11 LATERAL LIMIT 1 + tie-break: 3 Part IV points equidistant -> Levenshtein -> spatial -> hp.id cascade
- Part V HCD pure ST_Intersects (no fuzzy match needed)
- L12 Part IV-wins precedence: parcel intersects HCD polygon AND matches Part IV point -> result is `part_iv_individual`
- IS DISTINCT FROM guard prevents phantom updates on re-runs

### 4.4 DB schema tests -- `src/tests/db/migration-N-heritage.db.test.ts`

- Both tables exist with all indexes (GIST planar + GIST geography on heritage_properties; GIST on heritage_districts)
- `fuzzystrmatch` extension installed
- `normalize_address()` function exists + correct behavior
- Parcels + permits + coa_applications additions
- M-1/M-2/M-3 DOWN migrations: heritage_properties/heritage_districts dropped CASCADE; **fuzzystrmatch NOT dropped**

### 4.5 Spec 48 §3.6 dual-pattern + §3.7 first-deploy spike

`records_meta.heritage_load` block matches frozen contract; first-deploy spike runbook validates pre-deploy fixture matches post-deploy live counts.

---

## 5. Operating Boundaries

### Target Files (future implementation WFs)

- `scripts/load-heritage.js` (NEW; Spec 47 skeleton; advisory lock 62)
- `scripts/enrich-heritage.js` (NEW; sibling per L6; advisory lock 63)
- `scripts/enrich-permits.js` (NEW or extended; heritage step inside; advisory lock 64)
- `migrations/NNN_create_heritage_tables.sql` (M-1: extension + function + 2 tables + indexes)
- `migrations/NNN_parcels_heritage_columns.sql` (M-2; SEPARATE from Spec 58 + 59 migrations per L11)
- `migrations/NNN_permits_coa_heritage_columns.sql` (M-3)
- `scripts/lib/geometry-validator.js` (reuse from Spec 58/59 implementation). **v1.1 H-v1.1.5 dependency-risk note:** Spec 58/59 are spec-only as of 2026-05-26; this file does NOT exist yet. If Spec 58/59 implementation has NOT landed when Spec 61 implementation begins, the implementing WF MUST author `scripts/lib/geometry-validator.js` here (mirror Spec 59 §3.5 pattern) so it can be reused by Spec 58/59 implementing WFs later.
- `scripts/lib/safe-math.js` (existing per Spec 47 §16 B5)
- `docs/specs/01-pipeline/43_chain_sources.md` (edit: load_heritage AFTER load_parcels; enrich_heritage AFTER link_parcels)
- `docs/specs/01-pipeline/41_chain_permits.md` + `docs/specs/01-pipeline/42_chain_coa.md` (edits for heritage propagation step)
- `docs/specs/01-pipeline/47_pipeline_script_protocol.md` §A.5 (lock registry: add 62, 63, 64)
- `scripts/quality/assert-schema.js` (heritage CKAN URL reachability + OBJECTID/HCD_NO attribute + STATUS/HCD_TYPE allowed values)
- `scripts/quality/assert-data-bounds.js` (heritage_properties row count >= 8000 lower bound; heritage_districts >= 20)
- `scripts/quality/assert-entity-tracing.js` (heritage_* fields to coverage grid)
- `scripts/quality/assert-global-coverage.js` (parcels.is_heritage_designated coverage row)
- `scripts/manifest.json` (3 chain arrays updated)
- `scripts/seeds/logic_variables.json` (7 heritage_* keys per §12.3a)
- `src/tests/load-heritage.{logic,infra}.test.ts`, `src/tests/enrich-heritage.{logic,infra}.test.ts`, `src/tests/db/migration-N-heritage.db.test.ts`
- `docs/runbook/source_heritage_first_deploy_spike.md` (Spec 48 §3.7)

### Out of scope

- Admin UI surface (sibling spec under `docs/specs/02-web-admin/`)
- Bitemporal `valid_from`/`valid_to` (L3 point-in-time MVP)
- Federal/provincial heritage registers (Spec 61 = Toronto municipal only)
- Listed properties + Under Appeal/Study HCDs (L25 filter)

### Cross-spec dependencies

| Spec | Dependency |
|---|---|
| Spec 43 | Chain orchestration; slug-based placement; manifest array conventions |
| Spec 47 | §R1-R12 skeleton; §5.1 advisory lock per script; §6.1 RUN_AT inside lock; §6.4 IS DISTINCT FROM guard; §6.6 PostGIS pre-validation; §8.1/§8.2 audit cascade (FAIL>WARN>PASS); §8.3 two-arg emitMeta; §10/§11 counter contract; §A.5 lock registry update; §B1 Loop Query Ban; §16 B5 safe-math |
| Spec 48 | §3.6 dual-pattern; §3.7 first-deploy spike runbook |
| Spec 58 | Pattern model; L11 cross-WF serialization; reuse `scripts/lib/geometry-validator.js` |
| Spec 59 | Pattern model; SQL inheritance for LATERAL `<->` + JS-side F-C1 + batched VALUES+UNNEST validation |
| Spec 41 | chain_permits edit for heritage propagation step |
| Spec 42 | chain_coa edit + CoA-to-parcels JOIN path (verify `lead_parcels` vs `permit_parcels`) |

---

## 6. License & Attribution

Toronto Open Data Licence v1.0 -- attribution required. Citation: "Contains information licensed under the Open Government Licence -- Toronto." Regulatory authority: **Ontario Heritage Act**, Parts IV (individual property designation, s.29) + V (Heritage Conservation Districts, s.41).

---

## 7. Discovery report cross-reference

Phase 0 report at `docs/reports/wf1-spec61-architecture-discovery.md`. Resolved all 9 OPEN questions (Q0.1-Q0.8 + Q0.14 + Q0.16 + Q0.17). Key findings: 2-table schema (vs single-table-with-discriminator); quarterly cadence (vs Spec 59's 10-20yr); Heritage Register STATUS values confirm Part IV/Part V/Listed; HCDs schema is structurally different; locks 62/63/64 verified unassigned.

---

## 8. Implementation plan (3-WF sequence; deferred)

### 8a -- 3-WF sequence

See §1 ASCII diagram.

### 8b -- WF1 (this spec) deliverables

**Zero code deliverables.** Spec only.

### 8c -- SHIPPED (`169f22a`): `load-heritage.js` (lock 61) + M-1 + chain edit

Detailed step-by-step recipe in **§12.1 + §12.3 + §12.4** below.

### 8d -- SHIPPED (`e299d26`): `enrich-heritage.js` (lock 62) + M-2 + chain edit

Detailed recipe in **§12.2 + §12.3 + §12.4**. **Implemented with CONTAINMENT (`ST_Intersects`) for both Part IV and Part V — see §11.1 IMPLEMENTED note.**

### 8e -- SHIPPED (`32d94fe`): `enrich-permits.js` heritage step + M-3

**CoA JOIN path (Spec 58 F-H7 verbatim):**
> WF MUST verify CoA-to-parcel join table exists. If `lead_parcels` mirror active (Spec 42 mig 143-144), use it. Otherwise `permit_parcels` via `linked_permit_num`. Both missing -> FAIL.

**Multi-parcel rule (L12):**
> `permits.is_heritage_designated = bool_or(parcels.is_heritage_designated)` across linked parcels.
> `permits.heritage_designation_type` per-type bool_or precedence: Part IV wins over Part V HCD.
> `permits.heritage_designation_date` from the winning designation row.
> Applies symmetrically to `coa_applications`.

### 8f -- Future sibling spec: admin UI

Out of pipeline scope. New spec under `02-web-admin/`. Surfaces: `is_heritage_designated` boolean badge; `heritage_designation_type` text ("Part IV individual" / "Part V HCD"); `heritage_designation_date` formatted; `source_dataset_version` per L3.

### 8g -- End-to-end success criterion

> A known Heritage Register Part IV property displays `is_heritage_designated = true`, `heritage_designation_type = 'part_iv_individual'`, valid `heritage_designation_date` in admin permit-detail. A parcel within a Part V HCD polygon displays `is_heritage_designated = true`, `heritage_designation_type = 'part_v_hcd'`. A non-heritage parcel shows `is_heritage_designated = false`.

### 8h -- Future-analytics audit note

> Listed (non-designated) properties are intentionally dropped (per user scope: "by-law-impacting only"). If future analytics need surface a "candidate-for-designation" advisory flag, a new spec extends with an `is_heritage_listed` boolean column. The current schema does not preserve Listed data.

---

## 9. Producer/Consumer Contract (frozen at spec_version 1.1)

> **IMPLEMENTED — producer/consumer slug names:** the spec's `'source-heritage'` slug shipped as the
> chain-scoped **`sources:load_heritage`** (producer, recorded in `pipeline_runs.pipeline`) and
> **`sources:enrich_heritage`** (the §8d consumer), per `enrich-heritage.js:27-28` (DEC-C). Read
> every `'source-heritage'` literal below as its chain-scoped `sources:load_heritage` equivalent.

### `pipeline.emitSummary` (Spec 47 §R10 + §11.1)

```js
pipeline.emitSummary({
  records_total:   feature_count_combined,                // sum of both phases
  records_new:     polygons_inserted_combined,
  records_updated: polygons_updated_combined,
  records_meta: {
    audit_table: { phase: 60, name: 'Heritage Properties', verdict: <FAIL>WARN>PASS>, rows: [...] },
    heritage_load: { /* see frozen block below */ }
  }
});
```

### `pipeline.emitMeta` (Spec 47 §R11 + §8.3 two-argument)

**load-heritage.js:**
```js
pipeline.emitMeta(
  { 'ckan:heritage-register-wgs84': [], 'ckan:heritage-conservation-districts': [] },
  { heritage_properties: ['source_id', 'status', 'geom', 'designated_date', 'bylaw_no', 'htg_conser_name', 'building_type', 'reason', 'address_text', 'construction_year', 'source_dataset_version', 'created_at', 'updated_at'],
    heritage_districts:  ['source_id', 'name', 'hcd_type', 'geom', 'designated_date', 'bylaw_no', 'wards', 'source_dataset_version', 'created_at', 'updated_at'] }
);
```

**enrich-heritage.js:**
```js
pipeline.emitMeta(
  { heritage_properties: ['geom', 'status', 'address_text', 'designated_date'],
    heritage_districts:  ['geom', 'designated_date'],
    parcels:             ['geom'] },
  { parcels: ['is_heritage_designated', 'heritage_designation_type', 'heritage_designation_date'] }
);
```

**enrich-permits.js heritage step:**
```js
pipeline.emitMeta(
  { parcels: ['is_heritage_designated', 'heritage_designation_type', 'heritage_designation_date', 'lead_id'], permits: ['lead_id'] },
  { permits: ['is_heritage_designated', 'heritage_designation_type', 'heritage_designation_date'] }
);
// symmetric for coa_applications
```

### `records_meta.heritage_load` (frozen)

```json
{
  "heritage_load": {
    "spec_version": "1.1",
    "heritage_register": {
      "source_dataset_version": "<MD5 hex of zip>",
      "last_modified": "<HTTP Last-Modified>",
      "etag": "<ETag or null>",
      "content_hash": "<MD5 hex>",
      "feature_count": 0,
      "filtered_out_listed": 0,
      "unknown_status_count": 0,
      "features_inserted": 0,
      "features_updated": 0,
      "features_deleted": 0,
      "invalid_geometry_skipped": 0,
      "drift_check_passed": true,
      "delete_skipped_empty_guard": false
    },
    "heritage_districts": {
      "source_dataset_version": "<MD5 hex of zip>",
      "last_modified": "<HTTP Last-Modified>",
      "etag": "<ETag or null>",
      "content_hash": "<MD5 hex>",
      "feature_count": 0,
      "filtered_out_appeal_study": 0,
      "unknown_hcd_type_count": 0,
      "features_inserted": 0,
      "features_updated": 0,
      "features_deleted": 0,
      "invalid_geometry_skipped": 0,
      "drift_check_passed": true,
      "delete_skipped_empty_guard": false
    },
    "geometry_update_pct": 0.0,
    "mass_delete_pct": 0.0
  }
}
```

**v1.1 fold H-v1.1.3:** counter names `polygons_*` -> `features_*` (Heritage Register is Points; HCDs are Polygons; uniform naming).

### Consumer read protocol (`enrich-heritage.js` -- L23) [v1.1 fold C-v1.1.3: per-table guards]

1. Read `pipeline_runs WHERE pipeline='source-heritage' AND status='completed' ORDER BY completed_at DESC LIMIT 1` -- FAIL if no prior run.
2. From that row, read `records_meta.heritage_load.spec_version` -- FAIL if `!= '1.1'`.
3. **Per-table feature_count check (v1.1 C-v1.1.3 fold):** read `records_meta.heritage_load.heritage_register.feature_count` AND `records_meta.heritage_load.heritage_districts.feature_count` separately:
   - If `heritage_register.feature_count = 0` -> FAIL with message `"heritage_register dataset ingested zero features; refusing to enrich"`.
   - If `heritage_districts.feature_count = 0` -> FAIL with message `"heritage_districts dataset ingested zero features; refusing to enrich"`.
   - Failure cause distinct per dataset so operator triage knows which CKAN package failed.
4. `SELECT COUNT(*) FROM heritage_properties` AND `SELECT COUNT(*) FROM heritage_districts` -- per-table FAIL if either is 0 (data inconsistency from external truncation).
5. Validate per-table `drift_check_passed = true`; read `source_dataset_version` from each table for `parcels.heritage_dataset_version_when_enriched` propagation.

### Audit table rows

| Row name | Source | Threshold | Verdict |
|---|---|---|---|
| `heritage_register_feature_count` | Phase A feature_count | informational | INFO |
| `heritage_districts_feature_count` | Phase B feature_count | informational | INFO |
| `heritage_filtered_listed_pct` | filtered_out_listed/raw | informational | INFO |
| `heritage_geometry_skipped_pct` | invalid_geometry_skipped/total | `> 0.05` (L8) | FAIL |
| `heritage_count_drift_pct` | count_delta_pct | `> 0.50` (L7) | FAIL (override doesn't suppress) |
| `heritage_mass_delete_pct` | mass_delete_pct | `> 0.50` (L7c) | FAIL (override doesn't suppress) |
| `heritage_geometry_update_pct` | geometry_update_pct | `> 0.50` (L7b) | WARN |
| `heritage_dataset_age_years` | derived from last_modified | `> 2` (L9) | WARN |
| `heritage_points_no_parcel_match` | unlinked Part IV points | `> 0.05` WARN / `> 0.20` FAIL (L21) | WARN/FAIL |
| `permit_type_heritage_disagreement` | L5 disagreement | non-zero | WARN |

---

## 10. Cross-WF Tracing Convention

```
[Admin UI permit detail]              shows "Heritage: Yes (Part IV) -- designated 1997-12-08; source v2026-05-21"
       v
[permits.is_heritage_designated + heritage_designation_type + heritage_designation_date]
       v   written by enrich-permits.js heritage step (advisory lock 64)
       v   propagated per L12 (bool_or + Part IV-wins precedence + symmetric to coa_applications)
[parcels.is_heritage_designated + heritage_designation_type + heritage_designation_date + heritage_dataset_version_when_enriched]
       v   written by enrich-heritage.js (advisory lock 62 — shipped)
       v   computed per §11 CONTAINMENT: Part V via ST_Intersects(parcel, heritage_districts); Part IV via ST_Intersects(parcel, heritage_properties WHERE status='part_iv') — the parcel that CONTAINS the point; levenshtein tiebreak only
[heritage_properties row + heritage_districts row]
       v   written by load-heritage.js (advisory lock 61 — shipped)
       v   source_id == CKAN Folder_Row (Heritage Register, #426) or HCD_NO (HCDs)
[Heritage Register CKAN dataset + HCDs CKAN dataset]
       v   regulated by
[Ontario Heritage Act Part IV (s.29) + Part V (s.41)]
```

**Disagreement protocol (L5):** if future `permit_type='Heritage'` AND geometry-derived `is_heritage_designated = false`, `enrich-permits.js` emits `permit_type_heritage_disagreement` WARN. Geometry remains authoritative; boolean is NOT flipped.

---

## 11. Linking Contract

### 11.1 Parcel-level enrichment SQL (L13 two-table; tie-break protocol; L12 Part IV precedence)

> **IMPLEMENTED (supersedes the design SQL below) — CONTAINMENT, not radius (review_followups #424, `e299d26`):**
> The shipped `enrich-heritage.js` matches **Part IV by `ST_Intersects(parcel.geom, heritage_point.geom)`** — the
> parcel that physically CONTAINS the register point — NOT `ST_DWithin(50m)` + Levenshtein. The radius match
> over-matched ~4× (tagged ~4 neighbouring parcels per point: 6,217 parcels vs 1,549 source points), so containment
> is used for precision. `levenshtein` survives only as a **tiebreak** when a single parcel contains >1 Part IV point.
> Consequence: ~10% of Part IV points fall outside any parcel and are legitimately unmatched, surfaced as the
> `heritage_points_no_parcel_match` audit row (thresholds calibrated **0.15 WARN / 0.30 FAIL** above that ~10%
> containment baseline). `heritage_point_match_radius_m` is therefore **NOT consumed** by the shipped code (dead
> config — see §12.3a note). `enrich-heritage.js` also stamps `parcels.heritage_dataset_version_when_enriched`
> (`register|hcd` source_dataset_version pair) as lineage. The design SQL below is retained for the original
> tie-break rationale; the `ST_DWithin`+`levenshtein <= $2` Part IV predicate is the ONLY part superseded.

```sql
-- enrich-heritage.js UPDATE; runs after L23 empty-source guard passes.
-- v1.1 fold C-v1.1.2: enrichment CTE materializes new_in_heritage + new_type + new_date so
-- the WHERE clause references e.* columns directly without re-evaluating correlated subqueries.
WITH enrichment AS (
  SELECT
    p.id AS parcel_id,
    -- Part V HCD: pure polygon spatial intersect (no address-fuzzy)
    (SELECT hd.id FROM heritage_districts hd
       WHERE ST_Intersects(p.geom, hd.geom)
       ORDER BY hd.id ASC LIMIT 1) AS hcd_match_id,
    -- Part IV individual: LATERAL nearest-neighbor with tie-break
    (SELECT hp.id FROM heritage_properties hp
       WHERE hp.status = 'part_iv'
         AND ST_DWithin(ST_Centroid(p.geom)::geography, hp.geom::geography, $1)
         AND levenshtein(normalize_address(p.address_text), normalize_address(hp.address_text)) <= $2
       ORDER BY levenshtein(normalize_address(p.address_text), normalize_address(hp.address_text)) ASC,
                ST_Distance(ST_Centroid(p.geom)::geography, hp.geom::geography) ASC,
                hp.id ASC
       LIMIT 1) AS part_iv_match_id
    FROM parcels p
),
enrichment_materialized AS (
  SELECT
    e.parcel_id,
    e.hcd_match_id,
    e.part_iv_match_id,
    (e.hcd_match_id IS NOT NULL OR e.part_iv_match_id IS NOT NULL) AS new_in_heritage,
    CASE
      WHEN e.part_iv_match_id IS NOT NULL THEN 'part_iv_individual'        -- L12: Part IV wins
      WHEN e.hcd_match_id IS NOT NULL THEN 'part_v_hcd'
      ELSE NULL
    END AS new_designation_type,
    COALESCE(
      (SELECT hp.designated_date FROM heritage_properties hp WHERE hp.id = e.part_iv_match_id),
      (SELECT hd.designated_date FROM heritage_districts hd WHERE hd.id = e.hcd_match_id)
    ) AS new_designation_date
  FROM enrichment e
)
UPDATE parcels p
   SET is_heritage_designated     = em.new_in_heritage,
       heritage_designation_type  = em.new_designation_type,
       heritage_designation_date  = em.new_designation_date
  FROM enrichment_materialized em
 WHERE p.id = em.parcel_id
   AND (p.is_heritage_designated     IS DISTINCT FROM em.new_in_heritage
        OR p.heritage_designation_type IS DISTINCT FROM em.new_designation_type
        OR p.heritage_designation_date IS DISTINCT FROM em.new_designation_date);
```

Notes:
- `parcels.geom` is the canonical PostGIS column (Spec 59 Q0.12.b).
- Part V path: pure polygon `ST_Intersects` -- no address-fuzzy needed (the HCD polygon IS the regulatory boundary).
- Part IV path: address-fuzzy + spatial-proximity ONLY against `status='part_iv'` rows.
- L23 startup guard ensures both tables are non-empty before this query runs.
- L11 IS DISTINCT FROM guard prevents phantom updates on re-runs.
- **IMPLEMENTED:** the shipped Part IV predicate is `ST_Intersects` containment, so it takes only ONE parameter — `$1` = `heritage_address_levenshtein_threshold` (default 2, tiebreak-only). `heritage_point_match_radius_m` is a RETIRED/dead config (the original `$1` radius param) — not consumed by `enrich-heritage.js`.

### 11.2 Permit / CoA propagation (L12 + symmetric)

```sql
-- enrich-permits.js heritage step (symmetric for CoA).
-- v1.1 fold C-v1.1.1: 3-CTE chain replaces invalid bool_or(...) OVER () inside CASE inside GROUP BY.
-- Each CTE level has a single aggregation context; the winning designation_type is computed once,
-- then the date is looked up from any parcel matching that type via a correlated subquery.

WITH per_permit_state AS (
  -- Step A: aggregate per-permit booleans across linked parcels.
  SELECT
    p.id      AS permit_id,
    p.lead_id AS lead_id,
    COALESCE(bool_or(par.is_heritage_designated), false) AS new_in_heritage,
    bool_or(par.heritage_designation_type = 'part_iv_individual') AS has_part_iv,
    bool_or(par.heritage_designation_type = 'part_v_hcd')         AS has_part_v_hcd
    FROM permits p
    LEFT JOIN parcels par ON par.lead_id = p.lead_id
GROUP BY p.id, p.lead_id
),
per_permit_winner AS (
  -- Step B: resolve the winning designation_type per L12 precedence.
  SELECT
    permit_id,
    lead_id,
    new_in_heritage,
    CASE
      WHEN has_part_iv     THEN 'part_iv_individual'   -- L12: Part IV wins
      WHEN has_part_v_hcd  THEN 'part_v_hcd'
      ELSE NULL
    END AS new_designation_type
  FROM per_permit_state
),
per_permit_date AS (
  -- Step C: pick a deterministic designation_date from a parcel that has the winning type.
  -- Tie-break: smallest par.id ASC (see D8 in fold log for future enhancement).
  SELECT
    w.permit_id,
    w.new_in_heritage,
    w.new_designation_type,
    (SELECT par.heritage_designation_date
       FROM parcels par
      WHERE par.lead_id = w.lead_id
        AND par.heritage_designation_type IS NOT DISTINCT FROM w.new_designation_type
      ORDER BY par.id ASC
      LIMIT 1) AS new_designation_date
  FROM per_permit_winner w
)
UPDATE permits p
   SET is_heritage_designated    = ppd.new_in_heritage,
       heritage_designation_type = ppd.new_designation_type,
       heritage_designation_date = ppd.new_designation_date
  FROM per_permit_date ppd
 WHERE p.id = ppd.permit_id
   AND (p.is_heritage_designated    IS DISTINCT FROM ppd.new_in_heritage
        OR p.heritage_designation_type IS DISTINCT FROM ppd.new_designation_type
        OR p.heritage_designation_date IS DISTINCT FROM ppd.new_designation_date);
```

Same UPDATE structure for `coa_applications` (via `lead_parcels` mirror or `permit_parcels.linked_permit_num` per §8e verification).

### 11.3 Source-of-truth precedence (L5)

Geometry-derived `is_heritage_designated` is authoritative. Future `permit_type='Heritage'` is corroborating only. Disagreement -> WARN audit row; boolean is NEVER flipped to match declared.

### 11.4 What this contract intentionally does NOT define

- Listed (non-designated) heritage advisory flag -- L25 + user scope drop Listed at ingest.
- Cross-jurisdictional heritage (federal/provincial registers) -- out of scope.
- HCD sub-classification (e.g., "Cabbagetown-Metcalfe" vs "Queen Street West" by HCD name) -- operator-debug only; not in the binary regulatory flag.

---

## 12. Detailed Implementation Guide

**§12 is an implementation-guidance outline (DDL + manifest edits + pseudo-SQL + cross-references) per user direction Gate 1.5. NOT verbatim code skeletons.**

### §12.1 `load-heritage.js` guidance

- Spec 47 §R1-R12 skeleton; `ADVISORY_LOCK_ID = 62`; slug = `source-heritage`
- Zod config schema with 7 keys (per §12.3a)
- Two-phase loading inside single advisory lock:
  - Phase A: Heritage Register (12,320 Points, batched 1000-row direct INSERT per L26, JS filter Listed per L25)
  - Phase B: HCDs (32 Polygons, single batch, JS filter Under Appeal + Under Study per L25, ST_Multi() cast)
- Step 2 batched validation via VALUES+UNNEST handles both Point + Polygon
- §R10 emitSummary + §R11 emitMeta (two-argument signature per L17 + §9)
- DESIGNATED + HCD_DESDAT sentinel `1899-11-30` -> NULL mapping at JS layer

### §12.2 `enrich-heritage.js` guidance

- Spec 47 §R1-R12 skeleton; `ADVISORY_LOCK_ID = 63`
- L23 startup guard (3-tier check per §9 Consumer protocol)
- Single UPDATE per §11.1 LATERAL LIMIT 1 with tie-break
- IS DISTINCT FROM guard on UPDATE WHERE (per L11)
- Export `applyHeritageEnrichment(client, RUN_AT)` self-contained function for enrich-permits.js reuse (L19)

### §12.3 Migration files (UP + DOWN)

**M-1 UP:**
```sql
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;   -- for levenshtein()

-- L27 normalize_address function (v1.1 H-v1.1.1: 8 suffix mappings, all from Phase 0 Q0.17)
CREATE OR REPLACE FUNCTION normalize_address(addr TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT TRIM(
    REGEXP_REPLACE(  -- final pass: collapse whitespace
      REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(
      REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(
        LOWER(COALESCE(addr, '')),
        '\bavenue\b',    'ave',  'g'),  -- AVE / AVENUE
        '\bstreet\b',    'st',   'g'),  -- ST / STREET
        '\broad\b',      'rd',   'g'),  -- RD / ROAD
        '\bboulevard\b', 'blvd', 'g'),  -- BLVD / BOULEVARD
        '\bcrescent\b',  'cres', 'g'),  -- CRES / CRESCENT
        '\bdrive\b',     'dr',   'g'),  -- DR / DRIVE
        '\bplace\b',     'pl',   'g'),  -- PL / PLACE
        '\bcourt\b',     'crt',  'g'),  -- CRT / COURT
      '\s+', ' ', 'g')
  );
$$;
-- Coverage rationale (Phase 0 Q0.17): handles 8 most-common Toronto street suffixes observed in
-- Heritage Register STREET_TYP column. Does NOT handle unit suffixes (Heritage Register doesn't
-- publish units per Q0.17). Future-empirical Phase 0+ refinement may add: BAY/QUAY/HEIGHTS/MEWS
-- if observed in expanded sampling.

-- heritage_properties + heritage_districts tables + indexes (DDL above)
```

**M-1 DOWN:**
```sql
DROP TABLE IF EXISTS heritage_properties CASCADE;
DROP TABLE IF EXISTS heritage_districts CASCADE;
DROP FUNCTION IF EXISTS normalize_address(TEXT);
-- DO NOT DROP EXTENSION fuzzystrmatch (may be used by other code paths -- WSIB matching per Spec 46)
```

**M-2 UP:** `ALTER TABLE parcels ADD COLUMN ...` (3 columns per §2)
**M-2 DOWN:** `ALTER TABLE parcels DROP COLUMN ...`

**M-3 UP:** Same 3 columns on `permits` AND `coa_applications`
**M-3 DOWN:** Symmetric DROP COLUMN

### §12.3a `logic_variables.json` seed entries (Spec 47 §4.1)

```json
{
  "heritage_point_match_radius_m":           50,
  "_note_radius_retired":                     "DEAD CONFIG — the shipped enrich-heritage.js uses ST_Intersects containment for Part IV (review_followups #424); this radius is NOT consumed. Retained only for historical/rollback reference.",
  "heritage_address_levenshtein_threshold":  2,
  "heritage_accept_feature_count_drift_pct": 0.50,
  "heritage_invalid_geometry_fail_pct":      0.05,
  "heritage_skip_check_threshold_years":     2,
  "heritage_unlinked_point_warn_pct":        0.05,
  "heritage_unlinked_point_fail_pct":        0.20
}
```

### §12.4 Spec 43 + 41 + 42 chain edits

- **`chain_sources` (Spec 43):** insert `load_heritage` AFTER `load_parcels` slug.
  **`enrich_heritage` chain ordering (v1.1 H-v1.1.4 fold):** the full chain segment is:
  `link_parcels` -> `enrich_zoning` (Spec 58) -> `enrich_ravines` (Spec 59) -> `enrich_heritage` (Spec 61) -> `assert_data_bounds`
  Implementing WF inserts `enrich_heritage` at this exact ordinal:
  - If `enrich_zoning` AND `enrich_ravines` already present in chain: `enrich_heritage` AFTER `enrich_ravines`
  - If only `enrich_zoning` present: `enrich_heritage` AFTER `enrich_zoning` (and `enrich_ravines` will be inserted at v1.1's position when Spec 59 is implemented)
  - If only `enrich_ravines` present: `enrich_heritage` AFTER `enrich_ravines`
  - If neither present: `enrich_heritage` AFTER `link_parcels` (and the prior steps insert later at their respective ordinals)
  The slug-based ordering is robust to the implementation order of Specs 58/59/60.
- **`chain_permits` (Spec 41):** insert heritage propagation step into existing `enrich_permits` slug (or new step AFTER `link_parcels`)
- **`chain_coa` (Spec 42):** insert heritage propagation step into CoA enrichment slug
- **`manifest.json`:** 3 chain arrays updated with new slugs + read/write columns
- **Spec 47 §A.5 registry update:** add 3 rows -- `load-heritage.js` (62), `enrich-heritage.js` (63), `enrich-permits.js` (64)

### §12.5 Quality script edits

- `assert-schema.js`: 2 CKAN URLs reachability + OBJECTID + HCD_NO attribute + STATUS/HCD_TYPE allowed values
- `assert-data-bounds.js`: `heritage_properties` count >= 8000; `heritage_districts` count >= 20
- `assert-entity-tracing.js`: heritage_* fields to coverage grid
- `assert-global-coverage.js`: `parcels.is_heritage_designated` coverage threshold row

### §12.6 Test fixture templates

- Polygon-only HCD fixture (mini HCD set, 2-3 districts)
- Point-only Heritage Register fixture (mixed STATUS: Listed/Part IV/Part V; tests L25 filter)
- Mixed-designation parcel fixture: intersects HCD polygon AND matches Part IV point -> L12 Part IV-wins test
- Multi-parcel permit fixture: spans Part IV parcel + Part V HCD parcel -> L12 propagation test
- Invalid-geometry fixture: L8 >5% FAIL + abort-before-transaction
- L13 tie-break fixture: 3 Part IV points equidistant from one parcel -> Levenshtein -> spatial -> hp.id cascade
- L23 enrich-side empty-source guard fixture (3-tier)
- L24 information_schema guard fixture (heritage columns missing on parcels)
- DESIGNATED sentinel fixture: row with `DESIGNATED = 1899-11-30` -> verify NULL in target

### §12.7 First-deploy spike runbook (Spec 48 §3.7)

- Pre-deploy: dry-run on local Postgres with `BUILDO_TEST_DB=1`
- Phase 0 baseline counts captured: 12,320 + 32 (filtered: drop Listed + drop Under Appeal/Study)
- Post-deploy: SELECT counts vs baseline; bound violations -> roll back
- Validate `permit_type_heritage_disagreement` audit row is 0 (no existing permit_type='Heritage' rows expected per L5 future-proof rationale)

### §12.8 Operator playbook -- named audit_table rows

(Per §9 audit table -- 10 named rows including `heritage_register_feature_count`, `heritage_districts_feature_count`, `heritage_filtered_listed_pct`, `heritage_geometry_skipped_pct`, `heritage_count_drift_pct`, `heritage_mass_delete_pct`, `heritage_geometry_update_pct`, `heritage_dataset_age_years`, `heritage_points_no_parcel_match`, `permit_type_heritage_disagreement`.)

### §12.9 Cross-WF tracing diagram

(Per §10 -- single backward trace from admin UI through permit + parcels + heritage_properties/heritage_districts + CKAN datasets to Ontario Heritage Act.)

---

*End of Spec 61 v1.0.*
