# Spec 62 — Toronto Centreline (Streets) (Ingest + Link)

**Spec version:** 1.1 (R3 SPEC fold applied; L10 lock re-baselined)
**Status:** Authored (WF1 Genesis — spec-only deliverable; implementation deferred per §8b)
**Authored:** 2026-05-26 after Phase-0-FIRST architecture discovery + 3-pass adversarial PLAN review cadence (R1 + R2 + R3 over Gemini + DeepSeek + Independent reviewers; 75 findings folded). Folded again 2026-05-26 after R3 SPEC review on v1.0 authored body: 5 CRIT + 7 HIGH applied; 1 CRIT (NOT NULL DEFAULT false — cross-spec architectural) + 2 HIGH (centroid-as-frontage proxy, file-ownership coupling) + 8 MED routed to `docs/reports/review_followups.md`.
**Phase 0 discovery:** `docs/reports/wf1-spec62-architecture-discovery.md`

### v1.1 R3 SPEC fold log

| Fix ID | Source | Severity | Change |
|---|---|---|---|
| F-S1 | Independent CRIT-1 (conf 97) | CRIT | §A.5 footnote claim "regex-based tolerant" is FALSE — `pipeline-advisory-lock.infra.test.ts` uses a HARDCODED `LOCK_ID_REGISTRY` constant. §5 Target Files now mandates explicit `LOCK_ID_REGISTRY` edit. §12.4 footnote text corrected. |
| F-S2 | Independent CRIT-2 (conf 92) | CRIT | `normalize_address_number` body fix: `ELSE trim(m[2])` → `ELSE m[2]` (preserves " 1/2" leading space per §4.1 contract). |
| F-S3 | Gemini CRIT-2 + DeepSeek CRIT (convergent) | CRIT | `parcel_frontage` side-detection direction-dependency — consecutive segments digitized opposite directions flip L/R. Fix: side-agnostic try-both. |
| F-S4 | Gemini CRIT-2 | CRIT | `parcel_frontage` ignored parcel's own street name. Fix: new Priority 1 = `parcels.street_name_normalized` ≈ `linear_name`. |
| F-S5 | Gemini CRIT-3 | CRIT | L24 inter-script guard insufficient — only checked column existence. Fix: add `pipeline_runs` "enrich-centreline ran after load-parcels" check + ≥95% coverage threshold. |
| F-S6 | Gemini HIGH | HIGH | L12 corner-XOR-through mutual exclusivity removed — both booleans now independent. |
| F-S7 | DeepSeek HIGH | HIGH | `parcel_pairs` Cartesian explosion guard — per-parcel segment cap (LATERAL with `LIMIT 20`) per L25 cap. |
| F-S8 | DeepSeek HIGH | HIGH | `parcel_parallel_pairs` azimuth diff wrap — `LEAST(ABS(diff), 2*PI() - ABS(diff))`. |
| F-S9 | Independent HIGH-1 | HIGH | `ConfigSchema.parse` → `validateConfig` wrapper using `safeParse` per Spec 47 §4.2. |
| F-S10 | Independent HIGH-2 | HIGH | L25 filter applies `.toLowerCase()` to `FEATURE36` + `JURISDI37` before Set membership. |
| F-S11 | Independent HIGH-3 | HIGH | `INCLUDING ALL` → `INCLUDING DEFAULTS INCLUDING CONSTRAINTS` on temp table (avoid wasted GIST index build). |
| F-S12 | Independent HIGH-4 | HIGH | New `records_meta.centreline_enrich` frozen block + §12.2 emitSummary bullet. |
| **DEFER** | Gemini CRIT-1 | CRIT | `BOOLEAN NOT NULL DEFAULT false` semantics — same pattern across Specs 58/59/61. Cross-spec architectural concern; routed to follow-ups. |
| **DEFER** | Gemini HIGH | HIGH | Centroid-as-frontage proxy fails for L/U/panhandle lots — requires longest-shared-boundary rewrite. Routed. |
| **DEFER** | Gemini HIGH | HIGH | L28 file-ownership coupling (Spec 62 appends to Spec 61's file). Routed. |
| **DEFER** | 4× MED | MED | Test coverage gaps (NULL/"Rear 10"; all-NULL `address_match_status`; L7b/L7c drift rows); cosmetic indent in §11.1; WAL upsert pattern; L21 7-day convergence stigma. Routed. |

---

## Cumulative design decisions (locked through v1.3 final plan)

| ID | Decision |
|---|---|
| **L1** | THREE derived columns on `parcels`: `is_corner_lot BOOLEAN NOT NULL DEFAULT false` + `is_through_lot BOOLEAN NOT NULL DEFAULT false` + `primary_frontage_street_name TEXT` (nullable; "address-side only" semantic). Permits + CoA propagate same 3 columns via lead_id join (L12) |
| **L2** | `toronto_centreline` table — 18-column schema with `linear_name` (base) AND `linear_name_full` (with suffix); TEXT-typed address-range columns (handles "10A", "12 1/2" suffixes). **Mandatory `CREATE INDEX toronto_centreline_geom_gist ON toronto_centreline USING GIST (geom)`** — required for §11 ST_Intersects on 486K parcels × 47K segments |
| **L3** | Point-in-time MVP semantics; `source_dataset_version` UI display |
| **L4** | `load-centreline.js` advisory lock = **65** (§5.2 exception; see §A.5 footnote for rationale — natural ID 62 pre-occupied by Spec 61) |
| **L4b** | `enrich-centreline.js` advisory lock = **66** (§5.2 exception; see §A.5 footnote) |
| **L4c** | `enrich-permits.js` centreline step inherits parent lock = **64** (per Spec 61 L4c, no new lock for in-script step) |
| **L5** | Geometry-derived `is_corner_lot` + `is_through_lot` + `primary_frontage_street_name` are authoritative |
| **L6** | Sibling script `enrich-centreline.js` (NOT shared `enrich-parcels.js`); **4th parcels-writer** after Spec 58/59/61 |
| **L7/L7b/L7c** | Three drift signals (count-delta / geometry-update / mass-deletion); 50% threshold + override flag pattern per Spec 59 |
| **L8** | 5% invalid-geometry threshold; abort-before-DELETE |
| **L9** | HEAD `Last-Modified` + ETag + content-hash skip-check; **7-day** WARN threshold (daily-publish cadence; HEAD-fail proceeds to download per Spec 61 D6 fallback decision tree) |
| **L10** | `spec_version: 1.1` lock (re-baselined after R3 SPEC fold; v1.0 was contract-incomplete on side-detection + parcel-street-name + LOCK_ID_REGISTRY edit) |
| **L11** | Cross-WF serialization (4 parcels-writers). Chain ordering: `link_parcels` → `enrich_zoning` (Spec 58) → `enrich_ravines` (Spec 59) → `enrich_heritage` (Spec 61) → `enrich_centreline` (Spec 62) → `enrich_permits` (cross-chain) |
| **L12** | Multi-parcel propagation: `is_corner_lot = bool_or(par.is_corner_lot)`; **`is_through_lot = bool_or(par.is_through_lot)` (NO mutual-exclusivity carve-out per F-S6 / R3 SPEC Gemini HIGH — large consolidated lots can legitimately be both corner AND through);** `primary_frontage_street_name` = smallest `par.id` tie-break (known limitation D3; future improvement queued). Symmetric permits + CoA |
| **L13** | **§11 SQL block (this spec) is authoritative.** Corner-lot via 2D cross-product side detection + cosine-based parallel check + NULL-safe intersection node IS NOT DISTINCT FROM + at-least-one-non-NULL guard + base-name `linear_name` (not `linear_name_full`) for divided-road false-positive prevention. **Per F-S3 + F-S4:** frontage CTE uses `parcels.street_name_normalized` Priority 1, side-agnostic L+R address-range try-both Priority 2, longest-intersection Priority 3, centreline_id ASC final tie-break |
| **L14** | Empty-source guard on `enrich-centreline.js` per Spec 61 L23 pattern (3-tier: prior run + `features_inserted > 0` + `COUNT(*) > 0`) |
| **L15** | **F-C1 JS-side guard** with dual-mode: first-run-empty = FAIL; subsequent-run-empty = WARN+preserve (matches Spec 59 + Spec 61 precedent). Audit row via `pipeline.recordAuditRow` NOT `emitSummary` (pipeline runner is sole emitSummary caller for failed runs) |
| **L16** | Batched VALUES+UNNEST geometry validation per Spec 47 §B1; 5,000-row chunks |
| **L17** | `pipeline.emitMeta` two-argument table-keyed-map signature per Spec 47 §8.3 (all 3 scripts: load, enrich, permits-propagate) |
| **L18** | Cross-run `records_meta` read pattern for enrich consumer per Spec 61 L18 |
| **L19** | `enrich-permits.js` centreline step = self-contained `applyCentrelineEnrichment(client, RUN_AT)` function inside parent lock 64 |
| **L20** | §A.5 registry update is explicit §5 + §12 deliverable; footnote-based §5.2 exception documentation below lock-65/66 entries (canonical home) |
| **L21** | Unlinked-parcels audit row `parcels_with_zero_centreline_intersections`; thresholds in `logic_variables.json` (NOT §3.7 ledger-writer spike — spatial enrichment uses 7-day post-deploy convergence pattern) |
| **L22** | Chain step ordering: `chain_sources` inserts `load_centreline` AFTER `load_parcels`; `enrich_centreline` AFTER `enrich_heritage` |
| **L23** | `enrich-centreline.js` empty-source guard: (a) prior successful run; (b) `records_meta.centreline_load.features_inserted > 0`; (c) `SELECT COUNT(*) FROM toronto_centreline > 0` |
| **L24** | `enrich-permits.js` centreline step startup guard (per F-S5 R3 SPEC Gemini CRIT-3) — THREE checks: (a) `information_schema` confirms `parcels.is_corner_lot`, `parcels.is_through_lot`, `parcels.primary_frontage_street_name` exist; (b) `pipeline_runs` shows a successful `enrich-centreline` run with `completed_at` AFTER the most recent successful `load-parcels` run; (c) `SELECT COUNT(*) FROM parcels WHERE is_corner_lot IS NOT FALSE OR is_through_lot IS NOT FALSE OR primary_frontage_street_name IS NOT NULL` returns ≥ 95% of intersecting-parcel population (CRIT-5 follow-up will recast this in NULL-semantics terms; for v1.1 we accept the false-but-zero-update heuristic) |
| **L25** | Feature-type filter (JS load-time): INCLUDE 12 street-class FEATURE_CODE_DESC values. EXCLUDE non-street. UNKNOWN → sentinel `feature_code_desc = 'unknown_operator_review'` + WARN audit. Jurisdiction: INCLUDE CITY OF TORONTO + PROVINCE + PRIVATE; EXCLUDE FEDERAL; UNKNOWN included + WARN. **Per F-S10:** both Set membership checks normalize via `.toLowerCase()` and store ALL Set entries in lowercase. Hardens against CKAN case-refresh (Spec 61 H-v1.1.2 precedent) |
| **L26** | Staging-table CTE (full-replace semantics; 47K features ≫ Spec 61 batched-INSERT threshold). F-C1 JS-side dual-mode guard per L15. **Per F-S11:** temp table uses `LIKE toronto_centreline INCLUDING DEFAULTS INCLUDING CONSTRAINTS` (NOT `INCLUDING ALL`) — preserves UNIQUE on `source_id` for duplicate detection without copying the GIST index |
| **L27** | `normalize_address_number(addr TEXT) RETURNS TABLE(numeric_part INT, suffix TEXT)` + `address_match_status(parcel_addr_text, parity, lo_num, hi_num) RETURNS BOOLEAN`. Both defined in M-1. Suffixes stripped for arithmetic; NULL parity → skip parity check (range-only match). **Per F-S2:** suffix preserves leading whitespace ("12 1/2" → suffix=" 1/2"); body uses `ELSE m[2]` not `ELSE trim(m[2])` |
| **L28** | **`enrich-permits.js` file ownership: Spec 61 implementing WF.** Spec 62 implementing WF appends `applyCentrelineEnrichment` to the existing file. If Spec 61 hasn't shipped, Spec 62 WF creates the file with both stubs. (Routed for cross-spec architectural revisit — R3 SPEC Gemini HIGH "file-ownership coupling.") |
| **L29** | (R3 SPEC F-S4) `parcel_frontage` Priority 1 = case-insensitive equality between `parcels.street_name_normalized` and `c.linear_name` (base name). If parcel has NULL `street_name_normalized` OR no centreline match by name, fall through to Priority 2 (address-range try-both). The implementing WF MUST verify `parcels.street_name_normalized` populated for ≥ 90% of parcels (Spec 011 column) before relying on Priority 1; otherwise log + degrade to Priority 2/3 |
| **L30** | (R3 SPEC F-S7) `parcel_pairs` self-join Cartesian explosion guard: rewrite Step 4 to use a LATERAL with `LIMIT 20` to cap pairs at C(20, 2) = 190 per parcel (handles 99.9th-percentile parcel-segment intersection counts; large commercial lots truncated for through/corner detection — this is the "approximation accepted" v1.1 trade-off; lots with > 20 segments are extremely rare and approximating their corner/through state is acceptable) |
| **L31** | (R3 SPEC F-S8) `parcel_parallel_pairs` azimuth diff wrap: `LEAST(ABS(diff), 2*PI() - ABS(diff))` before `cos()` to handle the 0°/360° wraparound boundary safely. Mathematically cos(diff) ≡ cos(2π - diff) so this is a defensive correctness preservation |

**Compliance:** Spec 43 (chain) + Spec 47 (R1-R12 + §A.5 + §B1 + §8.3) + Spec 48 (§3.6 + §3.7 — though L21 explicitly does NOT apply §3.7 spike runbook pattern; it's spatial enrichment not ledger-writer).

---

## 1. Goal & User Story

**Goal:** Ingest Toronto's Centreline (TCL) street-network LineString dataset and link each `permits` row + `coa_applications` row via parcels spatial join to derive 3 enrichment fields:
- `is_corner_lot` — does the parcel touch ≥ 2 different street centerlines sharing an intersection?
- `is_through_lot` — does the parcel have frontage on 2 different streets with parallel geometry (no shared intersection)?
- `primary_frontage_street_name` — the address-side street name (the segment whose address range contains the parcel's civic address number)

so admin permit/CoA detail panels display this context for lead-context awareness.

**User story (operator):** "When I open a permit or CoA detail page, I want to see whether the property is a corner lot or through lot and which street provides the primary address frontage — context that affects setbacks, frontage permits, and street-work planning."

### 3-WF data flow

```
+-------------------------------------------------------------------+
| WF1 = Spec 62 (this spec) -- spec-only; no code                   |
+-------------------------------------------------------------------+

+- Future WF (§8c) ------------------------------------------------+
| load-centreline.js (Spec 47 R1-R12 skeleton; advisory lock 65)    |
|   - Downloads + parses 117 MB zip (64K LineStrings)               |
|   - JS-side L25 filter: 12 street-class + jurisdictions; UNKNOWN  |
|     -> sentinel; FEDERAL excluded                                 |
|   - Net ingest: ~47K street-class segments                        |
|   - Staging-table CTE full-replace per L26                        |
|   - F-C1 JS-side dual-mode guard per L15                          |
| Migration M-1:                                                    |
|   - CREATE FUNCTION normalize_address_number(TEXT) ...            |
|   - CREATE FUNCTION address_match_status(TEXT,TEXT,TEXT,TEXT) ... |
|   - CREATE TABLE toronto_centreline (18 cols)                     |
|   - CREATE INDEX toronto_centreline_geom_gist (GIST)              |
| Spec 43 chain edit: load_centreline AFTER load_parcels slug       |
+--------------------------------------------------------------------+

+- Future WF (§8d) ------------------------------------------------+
| enrich-centreline.js (Spec 47 R1-R12 skeleton; advisory lock 66)  |
|   - L23 empty-source guard at startup (3-tier)                    |
|   - Single UPDATE per §11 (8-CTE chain; ~5-15 min on 486K parcels)|
| Migration M-2 (separate from Spec 58/59/61):                      |
|   - ALTER parcels ADD COLUMN is_corner_lot, is_through_lot,       |
|     primary_frontage_street_name                                  |
| Spec 43 chain edit: enrich_centreline AFTER enrich_heritage slug  |
+--------------------------------------------------------------------+

+- Future WF (§8e) ------------------------------------------------+
| enrich-permits.js centreline step (advisory lock 64 inherits)     |
|   - Self-contained applyCentrelineEnrichment(client, RUN_AT) fn   |
|   - L24 information_schema startup check                          |
|   - L12 multi-parcel propagation: bool_or + permit-level NOT      |
| Migration M-3:                                                    |
|   - ALTER permits + coa_applications ADD COLUMN is_corner_lot,    |
|     is_through_lot, primary_frontage_street_name                  |
+--------------------------------------------------------------------+

+- Future sibling spec (§8f, NOT this WF) -------------------------+
| Admin UI display: is_corner_lot / is_through_lot /                |
|                   primary_frontage_street_name + source_version  |
+--------------------------------------------------------------------+
```

---

## 2. Data Source

| Field | Value |
|---|---|
| **CKAN package** | `toronto-centreline-tcl` (`1d079757-377b-4564-82df-eb5638583bfb`) |
| Active resource | `d86bdca4-ab2c-470d-80fb-34647ea0e87f` (Shapefile, 117.8 MB zip, last-modified 2026-05-25) |
| Direct URL | `https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/1d079757-377b-4564-82df-eb5638583bfb/resource/d86bdca4-ab2c-470d-80fb-34647ea0e87f/download/centreline-version-2-4326.zip` |
| Geometry | LineString uniform (64,433 features raw; ~47K after L25 filter) |
| Projection | EPSG:4326 (WGS84) native |
| Refresh cadence | **DAILY** |
| Datastore active | false (download + parse zip) |
| Regulatory authority | City of Toronto Geomatics Group |
| Pipeline category | Datasources chain (sibling to Spec 58/59/61) |
| Licence | Toronto Open Data Licence v1.0 |

### Target table

```sql
-- M-1: toronto_centreline (street-class LineStrings only after L25 filter)
CREATE TABLE toronto_centreline (
  id                       BIGSERIAL PRIMARY KEY,
  source_id                BIGINT UNIQUE NOT NULL,             -- from CENTRELINE_ID
  geom                     GEOMETRY(LineString, 4326) NOT NULL,
  linear_name_full         TEXT,                                -- "Daisy Ave"
  linear_name              TEXT,                                -- "Daisy" — base name, used for divided-road comparison per L13/C-v1.3.7
  linear_name_type         TEXT,                                -- "Ave"
  linear_name_dir          TEXT,                                -- "N" / "S" / NULL
  feature_code_desc        TEXT NOT NULL,                       -- "Local" / "Major Arterial" / "unknown_operator_review" sentinel
  jurisdiction             TEXT NOT NULL,                       -- "CITY OF TORONTO" / "PROVINCE" / "PRIVATE" / "UNKNOWN"
  from_intersection_id     BIGINT,                              -- graph topology start node
  to_intersection_id       BIGINT,                              -- graph topology end node
  lo_num_l                 TEXT,                                -- "29" left side range min (TEXT to handle "10A" suffix)
  hi_num_l                 TEXT,                                -- "39"
  lo_num_r                 TEXT,                                -- "32"
  hi_num_r                 TEXT,                                -- "50"
  parity_l                 TEXT,                                -- 'O' / 'E' / NULL (left side parity)
  parity_r                 TEXT,                                -- 'O' / 'E' / NULL (right side parity)
  oneway_dir_code_desc     TEXT,                                -- "Not One-Way" / "One-Way Northbound"
  source_dataset_version   TEXT NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- MANDATORY: GIST spatial index (required for §11 ST_Intersects on 486K × 47K)
CREATE INDEX toronto_centreline_geom_gist ON toronto_centreline USING GIST (geom);
```

### Parcels additions (§8d M-2; SEPARATE from Spec 58/59/61 per L11)

```sql
ALTER TABLE parcels
  ADD COLUMN is_corner_lot                 BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN is_through_lot                BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN primary_frontage_street_name  TEXT;
```

### Permits + CoA additions (§8e M-3)

```sql
ALTER TABLE permits
  ADD COLUMN is_corner_lot                 BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN is_through_lot                BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN primary_frontage_street_name  TEXT;

ALTER TABLE coa_applications
  ADD COLUMN is_corner_lot                 BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN is_through_lot                BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN primary_frontage_street_name  TEXT;
```

---

## 3. Behavioral Contract (`load-centreline.js`)

### 3.1 Spec 47 §R1-R12 skeleton (mandatory)

```js
#!/usr/bin/env node
/**
 * Load Toronto Centreline (street network LineStrings).
 * SPEC LINK: docs/specs/01-pipeline/62_source_centreline.md
 */
'use strict';

const pipeline = require('./lib/pipeline');
const { loadMarketplaceConfigs } = require('./lib/config-loader');
const { z } = require('zod');

const ADVISORY_LOCK_ID = 65;   // L4 — §5.2 exception per §A.5 footnote
const SPEC_VERSION = '1.0';    // L10

const ConfigSchema = z.object({
  centrelineSkipCheckThresholdDays:          z.number().default(7),      // L9
  centrelineAcceptFeatureCountDriftPct:      z.number().default(0.50),   // L7
  centrelineInvalidGeometryFailPct:          z.number().default(0.05),   // L8
  centrelineMinFeatureCount:                 z.number().default(40000),  // L21 assert-data-bounds
  centrelineUnlinkedParcelWarnPct:           z.number().default(10),     // L21
  centrelineUnlinkedParcelFailPct:           z.number().default(40),     // L21
  centrelineParallelAzimuthThresholdDegrees: z.number().default(15),     // L13 / §11 SQL
});

function validateConfig(logicVars) {
  // F-S9 (R3 SPEC Independent HIGH-1) — Spec 47 §4.2 mandates safeParse wrapper, not .parse()
  const result = ConfigSchema.safeParse(logicVars);
  if (!result.success) {
    throw new Error(`[source-centreline] config validation failed: ${result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  return result.data;
}

pipeline.run('source-centreline', async (pool) => {
  const { logicVars } = await loadMarketplaceConfigs(pool, 'source-centreline');
  const config = validateConfig(logicVars);

  return await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    const RUN_AT = await pipeline.getDbTimestamp(pool);   // §R3.5 captured inside lock

    // §3.2  Step 0a — HEAD skip-check (L9 7-day threshold; HEAD-fail proceeds; ETag + content-hash fallback)
    // §3.3  Step 0b — Download + unzip + parse 64K LineStrings via npm shapefile
    // §3.4  Step 1  — JS-side L25 filter (street-class FEATURE_CODE_DESC + jurisdiction; UNKNOWN → sentinel)
    // §3.5  Step 2  — Batched VALUES+UNNEST geometry validation (L16; 5K-row chunks)
    // §3.6  Step 3  — L7/L7b/L7c drift signals (count-delta / geometry-update / mass-deletion)
    // §3.7  Step 4  — Staging-table CTE full-replace pattern per L26
    //                F-C1 JS-side guard BEFORE entering pipeline.withTransaction per L15
    // §3.8  Step 5  — pipeline.emitSummary + pipeline.emitMeta (§R10/§R11) — single call from success path
  });
});
```

### 3.2 Step 0a — HEAD `Last-Modified` + ETag + content-hash skip-check (L9)

Per Spec 61 D6 lesson + Spec 61 L9 decision tree:

1. HEAD request succeeds → compare `Last-Modified` + `ETag` against prior successful run's cached values. Match → `verdict='SKIP'`.
2. HEAD succeeds but `Last-Modified` AND `ETag` BOTH missing (CDN-stripped headers) → fall back to content-hash (GET file, MD5, compare to `last_known_content_hash`). Match → skip.
3. HEAD request fails (network/5xx) → emit WARN audit row + proceed to download (do NOT skip on failure).
4. `Last-Modified` older than **7 days** (L9 staleness threshold; daily-publish cadence) → emit WARN audit row + proceed (defensive).

### 3.3 Step 0b — Download + unzip + parse

1. Download 117.8 MB zip from CKAN URL (HTTPS); cache validators (`Last-Modified`, `ETag`, content-hash) for next-run skip-check
2. Unzip; the bundle includes `Centreline - Version 2 fields.csv` data dictionary (40-column logical-name mapping)
3. Parse all features via npm `shapefile` library; raw count = 64,433

### 3.4 Step 1 — JS-side L25 feature-type + jurisdiction filter

For each parsed feature, classify per the v1.3 L25 lists. **Per F-S10 (R3 SPEC Independent HIGH-2): all Set entries are lowercase + both CKAN field values normalized via `.toLowerCase()` before membership check** (hardens against CKAN case-refresh per Spec 61 H-v1.1.2 precedent):

```js
const STREET_CLASS_INCLUDE = new Set([
  'local', 'collector', 'major arterial', 'minor arterial',
  'laneway', 'expressway', 'expressway ramp',
  'major arterial ramp', 'collector ramp', 'other ramp',
  'access road', 'busway'
]);

const STREET_CLASS_EXCLUDE = new Set([
  'trail', 'river', 'hydro line', 'major railway', 'minor railway',
  'walkway', 'major shoreline', 'minor shoreline (land locked)',
  'creek/tributary', 'ferry route', 'geostatistical line',
  'pending', 'other'
]);

const featureCode = (feature.FEATURE36 || '').toLowerCase();
const jurisdiction = (feature.JURISDI37 || '').toLowerCase();

if (STREET_CLASS_EXCLUDE.has(featureCode)) continue;          // drop non-street
if (!STREET_CLASS_INCLUDE.has(featureCode)) {
  // Unknown — load with sentinel + WARN
  feature.feature_code_desc_normalized = 'unknown_operator_review';
  unknownFeatureCodeCount++;
}

if (jurisdiction === 'federal') continue;                     // drop federal-jurisdiction segments
if (jurisdiction === 'unknown') unknownJurisdictionCount++;   // include + WARN
```

Net ingest: ~47K street-class segments.

### 3.5 Step 2 — Batched geometry validation (L16, Spec 47 §B1)

5K-row chunks via VALUES+UNNEST per Spec 61 §3.5 pattern. Validate `ST_IsValid`; if invalid → `ST_MakeValid`; if result NOT LineString → skip + WARN.

L8 abort-before-DELETE: if invalid_geometry_skipped / total > 5%, FAIL audit row + return without entering withTransaction.

### 3.6 Step 3 — L7/L7b/L7c drift signals

Per Spec 59 pattern:
- L7 count-delta vs prior run: > 50% → FAIL (operator override flag `CENTRELINE_ACCEPT_FEATURE_COUNT_DRIFT=1`)
- L7b geometry-update %: > 50% → FAIL (override flag)
- L7c mass-deletion %: > 50% → FAIL (override flag)

### 3.7 Step 4 — Staging-table CTE pattern (L26)

47K features ≫ Spec 61's batched-direct-INSERT scale. Spec 58-style staging:

```sql
-- Inside pipeline.withTransaction (after F-C1 JS-side guard per L15 confirms temp non-empty):
-- F-S11 (R3 SPEC Independent HIGH-3): INCLUDING DEFAULTS INCLUDING CONSTRAINTS — NOT INCLUDING ALL.
-- Preserves UNIQUE(source_id) for duplicate detection inside the temp stage
-- without copying the GIST spatial index (which would burn 0.5-2s building a useless index).
CREATE TEMP TABLE temp_centreline (LIKE toronto_centreline INCLUDING DEFAULTS INCLUDING CONSTRAINTS) ON COMMIT DROP;
-- 10 batches × 5000 rows via INSERT INTO temp_centreline VALUES (...)

-- F-C1 dual-mode (L15 / H-v1.3.2): zero-temp on subsequent run → preserve target; on first run → FAIL.
-- (Check happens in JS BEFORE this transaction begins.)

DELETE FROM toronto_centreline;                                   -- full-replace
INSERT INTO toronto_centreline SELECT * FROM temp_centreline;    -- atomic-in-tx
```

### 3.8 Step 5 — emitSummary + emitMeta (§R10/§R11)

Single `pipeline.emitSummary` call at the END of the successful path (per Spec 47 §R2 canonical pattern). Pipeline runner is the sole emitSummary caller; F-C1 guard uses `pipeline.recordAuditRow` (per L15 / C-v1.3.5).

### 3.9 Edge cases

| Case | Behavior |
|---|---|
| HEAD returns 4xx/5xx | WARN + proceed to download |
| Download fails network | FAIL; pipeline_run rollback |
| Zip malformed | FAIL; abort before transaction |
| `CENTRELINE_ID` non-integer / NULL | WARN; skip feature; counted toward `invalid_geometry_skipped` (L8 threshold applies) |
| `CENTRELINE_ID` duplicate (within batch) | FAIL with clear error (D2 routed for JS-side pre-check enhancement) |
| All features dropped by L25 filter | L8 threshold fires; abort before transaction |
| F-C1: temp empty on first run | FAIL with `f_c1_empty_temp_guard_fired` audit row |
| F-C1: temp empty on subsequent run | WARN + preserve target (L15 dual-mode) |
| Concurrent run attempt | Advisory lock 65 blocks |
| `parcels.geom` SRID mismatch | runtime assertion `Find_SRID('public','parcels','geom') = 4326`; FAIL if false |
| `toronto_centreline` table empty at enrich time | L23 enrich-side guard FAILs (3-tier check) |

### 3.10 Point-in-time semantics (L3)

Data represents a point-in-time snapshot per `source_dataset_version`. Daily-publish cadence means downstream enrichment reflects a 1-7 day window of source freshness (per L9). Admin UI MUST display `source_dataset_version` to communicate the snapshot date.

---

## 4. Testing Mandate (Spec 47 §6 + Spec 48 §3.6 compliance)

### 4.1 Unit tests — `src/tests/load-centreline.logic.test.ts`

- `CENTRELINE_ID` → `source_id` integer coercion
- L25 filter classifier (street vs non-street vs unknown sentinel)
- Drift math L7/L7b/L7c
- F-C1 JS-side guard dual-mode (first-run vs subsequent-run zero-temp)
- `normalize_address_number` parses "10A" → (10, "A"), "12" → (12, NULL), "12 1/2" → (12, " 1/2")
- `ST_MakeValid` classifier (accept LineString; reject other types)
- SPEC LINK header in every test file

### 4.2 Integration tests — `src/tests/load-centreline.infra.test.ts`

| Test | Setup | Assertion |
|---|---|---|
| First-run happy path | Empty table + fixture zip with 3 valid street LineStrings + 2 non-street segments + 1 UNKNOWN feature_code | 3 street-class inserted; 1 sentinel inserted; 2 non-street dropped; `unknown_feature_code_count=1` audit row |
| Idempotent re-run | Same state | Staging-CTE full-replace; row counts match; `delete_skipped_empty_guard=false` |
| Skip-check trigger | Cached validators match HEAD | verdict=`SKIP`; no DB writes |
| L7 drift FAIL + override | Prior=800, current=100; override flag unset | verdict=FAIL; with override → executes + CRITICAL WARN |
| L8 FAIL pre-existing data preserved | Pre-populated table + fixture with 100 features 10 invalid | verdict=FAIL; table row count unchanged from pre-test |
| **L15 F-C1 first-run empty** | No prior `source-centreline` run + zero-feature fixture | verdict=FAIL; `f_c1_empty_temp_guard_fired` audit row |
| **L15 F-C1 subsequent-run empty** | Prior successful run exists + zero-feature fixture | verdict=WARN; existing table preserved; `delete_skipped_empty_guard=true` |
| Advisory lock contention | Concurrent run attempt | Second blocks; first completes |

### 4.3 Enrich-side tests — `src/tests/enrich-centreline.infra.test.ts`

| Test | Assertion |
|---|---|
| L23 3-tier empty-source guard | Each tier (no prior run / zero features_inserted / zero table count) → FAIL with distinct error |
| §11 corner-lot detection (2 segments, different streets, shared intersection node) | parcel `is_corner_lot=true` |
| §11 corner-lot NULL-NULL intersection guard | 2 segments with all-NULL intersection IDs → `is_corner_lot=false` (per C-v1.3.6) |
| §11 divided-road false-positive prevention | 2 segments "Main St N" + "Main St S" (same `linear_name='Main'`) → `is_corner_lot=false` (per C-v1.3.7) |
| §11 through-lot (parallel segments, different streets) | `is_through_lot=true` |
| §11 single-segment interior lot | `is_corner_lot=false`; `is_through_lot=false`; non-NULL `primary_frontage_street_name` |
| §11 short-segment azimuth fallback | Segment <1m → fallback endpoint azimuth applied |
| §11 frontage address-range match (parity O + LO_NUM 29 + HI_NUM 39) | Parcel address "33" → matches L side; `primary_frontage_street_name='Daisy Ave'` |
| §11 frontage NULL-parity policy | NULL `parity_l` → range-only check; address in range still matches (per H-v1.3.3) |
| §11 IS DISTINCT FROM idempotent re-run | Re-running with no source changes → 0 rows updated (no phantom writes) |

### 4.4 DB schema tests — `src/tests/db/migration-N-centreline.db.test.ts`

| Test | Assertion |
|---|---|
| `toronto_centreline` table exists with GIST index | `idx_toronto_centreline_geom_gist` present |
| Column types | `source_id BIGINT UNIQUE NOT NULL`; `geom GEOMETRY(LineString, 4326) NOT NULL`; `lo_num_l TEXT` (not INT — handles suffixes per H-v1.1.1) |
| `normalize_address_number()` function exists + behavior | Parses suffix variants correctly |
| `address_match_status()` function exists + behavior | All branches (parity_match, range_match, NULL_parity_skip) |
| Parcels additions (M-2) | All 3 columns present with NOT NULL DEFAULT false (booleans) + nullable TEXT (frontage_street_name) |
| M-1/M-2/M-3 DOWN migrations | Table + columns dropped cleanly |

### 4.5 Spec 48 §3.6 dual-pattern compliance

`records_meta.centreline_load` block matches frozen contract (§9 below). NOTE: L21 explicitly does NOT apply §3.7 ledger-writer spike runbook — spatial enrichment uses 7-day post-deploy convergence pattern documented in §8h.

---

## 5. Operating Boundaries

### Target Files (future implementation WFs)

- `scripts/load-centreline.js` (NEW; Spec 47 R1-R12 skeleton; advisory lock 65)
- `scripts/enrich-centreline.js` (NEW; sibling per L6; advisory lock 66)
- `scripts/enrich-permits.js` (extended per L28; Spec 61 creates the file; Spec 62 appends `applyCentrelineEnrichment` function)
- `migrations/NNN_create_toronto_centreline.sql` (M-1: table + GIST index + `normalize_address_number()` + `address_match_status()`)
- `migrations/NNN_parcels_centreline_columns.sql` (M-2; SEPARATE from Spec 58/59/61 per L11)
- `migrations/NNN_permits_coa_centreline_columns.sql` (M-3)
- `scripts/lib/geometry-validator.js` (reuse from Spec 58/59/61 implementation if exists; create if first-to-land)
- `scripts/lib/safe-math.js` (existing per Spec 47 §16 B5)
- `docs/specs/01-pipeline/43_chain_sources.md` (edit: `load_centreline` AFTER `load_parcels`; `enrich_centreline` AFTER `enrich_heritage`)
- `docs/specs/01-pipeline/41_chain_permits.md` + `docs/specs/01-pipeline/42_chain_coa.md` (edits for centreline propagation step)
- `docs/specs/01-pipeline/47_pipeline_script_protocol.md` §A.5 (lock registry: add 65 + 66 + footnote per §5.2 exception).
- **`src/tests/pipeline-advisory-lock.infra.test.ts` (MANDATORY EDIT per F-S1 — R3 SPEC Independent CRIT-1, confidence 97):** add `'scripts/load-centreline.js': 65` AND `'scripts/enrich-centreline.js': 66` to the **hardcoded `LOCK_ID_REGISTRY` TypeScript constant**. The earlier "H-v1.3.8 safety check" wording assumed a regex-based parser of §A.5; that assumption is FACTUALLY WRONG — the test does NOT parse §A.5 at all. It uses an explicit `LOCK_ID_REGISTRY` constant and the test at line ~200 (`'registry covers every JS script in the manifest'`) WILL FAIL after `manifest.json` adds the two new scripts UNTIL `LOCK_ID_REGISTRY` is updated in the test file. This is a CI-failure-at-implementation bug; the implementing WF MUST edit this file in the same diff that adds the two scripts to `manifest.json`.
- `scripts/quality/assert-schema.js` (centreline CKAN URL + 40-column attribute schema check)
- `scripts/quality/assert-data-bounds.js` (`toronto_centreline >= centreline_min_feature_count` lower bound; threshold from `logic_variables.json`)
- `scripts/quality/assert-entity-tracing.js` (centreline_* fields to coverage grid)
- `scripts/quality/assert-global-coverage.js` (`parcels.is_corner_lot` coverage threshold)
- `scripts/manifest.json` (chain arrays updated)
- `scripts/seeds/logic_variables.json` (5 keys per §12.3a)
- `src/tests/load-centreline.{logic,infra}.test.ts`, `src/tests/enrich-centreline.{logic,infra}.test.ts`, `src/tests/db/migration-N-centreline.db.test.ts`
- `docs/runbook/source_centreline_first_deploy_validation.md` (NOT §3.7 ledger-writer spike per L21; 7-day post-deploy convergence pattern)

### Out of scope

- Admin UI surface (sibling spec under `docs/specs/02-web-admin/`)
- Bitemporal `valid_from`/`valid_to` (L3 point-in-time MVP)
- Historical archive ingest (deferred)
- Address-point lookups (`BEGIN_ADDR_*` / `END_ADDR_*` columns NOT v1-ingested)
- One-way direction propagation to permits (`oneway_dir_code_desc` stored but not enriched onto parcels in v1)

### Cross-spec dependencies

| Spec | Dependency |
|---|---|
| Spec 43 | Chain orchestration; slug-based step placement; manifest array conventions |
| Spec 47 | §R1-R12 + §5.1 lock + §5.2 spec-number convention (§A.5 footnote exception for 65/66) + §6.4 IS DISTINCT FROM + §6.6 PostGIS pre-validation + §8.1/§8.2 audit cascade + §8.3 emitMeta + §A.5 lock registry + §B1 Loop Query Ban + §16 B5 safe-math |
| Spec 48 | §3.6 dual-pattern (§3.7 spike NOT applicable per L21) |
| Spec 58 | Pattern model — staging-CTE precedent for >2K features; reuse `geometry-validator.js` |
| Spec 59 | Pattern model — JS-side F-C1 guard precedent (L15 inherited verbatim) |
| Spec 61 | Pattern model — sibling-script (L6), `enrich-permits.js` file ownership (L28); LATERAL nearest-neighbor pattern (Spec 62 §11 doesn't use Levenshtein but inherits the LATERAL idiom) |
| Spec 41 | chain_permits edit for centreline propagation step |
| Spec 42 | chain_coa edit + CoA-to-parcels JOIN path (verify `lead_parcels` vs `permit_parcels`) |

---

## 6. License & Attribution

Toronto Open Data Licence v1.0 — attribution required. Citation: "Contains information licensed under the Open Government Licence — Toronto." Source: City of Toronto Geomatics Group.

---

## 7. Discovery report cross-reference

Phase 0 report at `docs/reports/wf1-spec62-architecture-discovery.md`. Resolved all 12 Q0.x questions (Q0.1-Q0.12). Key findings: 64,433 LineString features (~47K post-filter); EPSG:4326 native; CENTRELINE_ID stable upsert key; daily refresh cadence; bundled 40-column data dictionary; lock IDs 65/66 verified unassigned.

---

## 8. Implementation plan (3-WF sequence; deferred)

### 8a — 3-WF sequence

See §1 diagram.

### 8b — WF1 (this spec) deliverables

**Zero code deliverables.** Spec only.

### 8c — Future WF: `load-centreline.js` + M-1 + chain edit

Detailed step-by-step recipe in **§12.1 + §12.3 + §12.4**.

### 8d — Future WF: `enrich-centreline.js` + M-2 + chain edit

Detailed recipe in **§12.2 + §12.3 + §12.4**.

### 8e — Future WF: `enrich-permits.js` centreline step + M-3

**CoA JOIN path (per Spec 58 F-H7 + Spec 61 §8e verbatim):**
> WF implementing §8e MUST verify which CoA-to-parcel join table exists in current schema BEFORE committing to a JOIN plan. If `lead_parcels` mirror is still active (Spec 42 mig 143-144), use it. Otherwise `permit_parcels` via `linked_permit_num`. Both missing → FAIL.

**Multi-parcel rule (L12):** `bool_or` for booleans; permit-level NOT for through-lot precedence; smallest par.id tie-break for frontage_street_name (D3 known limitation).

### 8f — Future sibling spec: admin UI

Out of pipeline scope. Surfaces `is_corner_lot` + `is_through_lot` + `primary_frontage_street_name` + `source_dataset_version` per L3.

### 8g — End-to-end success criterion

> A known-corner-lot parcel (verified via Toronto map data) displays `is_corner_lot=true` + a `primary_frontage_street_name` matching the parcel's civic-address street in admin permit-detail. A through-lot parcel displays `is_through_lot=true`. A landlocked parcel displays both booleans false + NULL frontage.

### 8h — Future-analytics audit note + first-deploy convergence

> Spec 62 v1 captures 3 enrichment fields. If future analytics needs secondary frontage (corner-lot's other street side), separate cross-street width, or one-way direction propagation, a new spec extends. Current schema does NOT support those.
>
> **First-deploy convergence (per L21 — NOT §3.7 ledger-writer spike):** L21 thresholds (10% WARN / 40% FAIL on `parcels_with_zero_centreline_intersections`) are provisional. After first prod deploy, the chain producer runs daily for 7 consecutive days; if the metric stabilizes within ±2pp band, thresholds are confirmed. If wider variance, operator adjusts `centreline_unlinked_parcel_warn_pct` / `centreline_unlinked_parcel_fail_pct` in `logic_variables.json`.

---

## 9. Producer/Consumer Contract (frozen at spec_version 1.0)

### `pipeline.emitSummary` (Spec 47 §R10)

```js
pipeline.emitSummary({
  records_total:   feature_count_after_filter,
  records_new:     features_inserted,
  records_updated: 0,                                      // staging-CTE = full replace; never UPDATE
  records_meta: {
    audit_table: { phase: 62, name: 'Toronto Centreline', verdict: <FAIL>WARN>PASS>, rows: [...] },
    centreline_load: { /* frozen block below */ }
  }
});
```

### `pipeline.emitMeta` (Spec 47 §R11 + §8.3 two-arg)

**load-centreline.js:**
```js
pipeline.emitMeta(
  { 'ckan:toronto-centreline-tcl-shp': [] },
  { toronto_centreline: ['source_id', 'geom', 'linear_name_full', 'linear_name', 'linear_name_type', 'linear_name_dir', 'feature_code_desc', 'jurisdiction', 'from_intersection_id', 'to_intersection_id', 'lo_num_l', 'hi_num_l', 'lo_num_r', 'hi_num_r', 'parity_l', 'parity_r', 'oneway_dir_code_desc', 'source_dataset_version', 'created_at', 'updated_at'] }
);
```

**enrich-centreline.js:**
```js
pipeline.emitMeta(
  { toronto_centreline: ['geom', 'linear_name', 'linear_name_full', 'from_intersection_id', 'to_intersection_id', 'lo_num_l', 'hi_num_l', 'lo_num_r', 'hi_num_r', 'parity_l', 'parity_r'],
    parcels:            ['geom', 'address_number'] },
  { parcels: ['is_corner_lot', 'is_through_lot', 'primary_frontage_street_name'] }
);
```

**enrich-permits.js centreline step:**
```js
pipeline.emitMeta(
  { parcels: ['is_corner_lot', 'is_through_lot', 'primary_frontage_street_name', 'lead_id'], permits: ['lead_id'] },
  { permits: ['is_corner_lot', 'is_through_lot', 'primary_frontage_street_name'] }
);
// Symmetric for coa_applications per §8e CoA JOIN verification
```

### `records_meta.centreline_load` (frozen)

```json
{
  "centreline_load": {
    "spec_version":           "1.1",
    "source_dataset_version": "<MD5 hex>",
    "last_modified":          "<HTTP Last-Modified>",
    "etag":                   "<ETag or null>",
    "content_hash":           "<MD5 hex>",
    "feature_count_raw":      0,
    "feature_count_filtered": 0,
    "filtered_out_non_street": 0,
    "filtered_out_federal":   0,
    "unknown_feature_code_count":  0,
    "unknown_jurisdiction_count":  0,
    "features_inserted":      0,
    "features_updated":       0,
    "features_deleted":       0,
    "invalid_geometry_skipped": 0,
    "delete_skipped_empty_guard": false,
    "f_c1_empty_temp_guard_fired": false,
    "drift_check_passed":     true
  }
}
```

### `records_meta.centreline_enrich` (frozen — F-S12 R3 SPEC Independent HIGH-4)

```json
{
  "centreline_enrich": {
    "spec_version":                                       "1.1",
    "parcels_updated":                                     0,
    "parcels_with_zero_centreline_intersections_count":    0,
    "parcels_with_zero_centreline_intersections_pct":      0.0,
    "parcels_is_corner_lot_true_count":                    0,
    "parcels_is_through_lot_true_count":                   0,
    "parcels_primary_frontage_resolved_count":             0,
    "parcels_frontage_priority1_name_match_count":         0,
    "parcels_frontage_priority2_addrrange_match_count":    0,
    "parcels_frontage_priority3_nearest_segment_count":    0,
    "parcels_truncated_pair_count":                        0,
    "completed_at":                                        "<ISO timestamp>"
  }
}
```

This frozen block enables `enrich-permits.js` L24 startup check (b) to verify the enrich step actually ran successfully (vs F-S5 / R3 SPEC Gemini CRIT-3 — column existence alone is insufficient).

### Audit table rows (Spec 47 §8.1/§8.2 dual-pattern)

| Row name | Source | Threshold | Verdict |
|---|---|---|---|
| `centreline_feature_count_raw` | parse | informational | INFO |
| `centreline_feature_count_filtered` | post-L25 | informational | INFO |
| `centreline_filtered_listed_pct` | filter_dropped/raw | informational | INFO |
| `centreline_unknown_feature_code_count` | sentinel count | > 0 | WARN |
| `centreline_unknown_jurisdiction_count` | sentinel count | > 0 | WARN |
| `centreline_geometry_skipped_pct` | invalid/total | `> 0.05` (L8) | FAIL |
| `centreline_count_drift_pct` | delta | `> 0.50` (L7) | FAIL (override available) |
| `centreline_geometry_update_pct` | update/prior | `> 0.50` (L7b) | FAIL (override available) |
| `centreline_mass_delete_pct` | delete/prior | `> 0.50` (L7c) | FAIL (override available) |
| `centreline_dataset_age_days` | derived | `> 7` (L9) | WARN |
| `f_c1_empty_temp_guard_fired` | guard | first-run=FAIL, subsequent=WARN | per L15 dual-mode |
| `parcels_with_zero_centreline_intersections_pct` | enrich result | per logic_variables thresholds | WARN/FAIL |

### Consumer read protocol (`enrich-centreline.js` — L14 + L23)

1. `SELECT records_meta FROM pipeline_runs WHERE pipeline='source-centreline' AND status='completed' ORDER BY completed_at DESC LIMIT 1` — FAIL if no prior run
2. `records_meta.centreline_load.spec_version` — FAIL if != "1.0"
3. `records_meta.centreline_load.features_inserted > 0` — FAIL if zero (no rows ingested means no data to enrich against)
4. `SELECT COUNT(*) FROM toronto_centreline > 0` — FAIL (data inconsistency from external truncation)
5. Read `source_dataset_version` and propagate into parcels for traceback

---

## 10. Cross-WF Tracing Convention

```
[Admin UI permit detail]                       shows "Corner Lot: Yes; Frontage: Daisy Ave; source v2026-05-25"
       ↓
[permits.is_corner_lot + is_through_lot + primary_frontage_street_name]
       ↓   written by enrich-permits.js centreline step (lock 64 inherits)
       ↓   propagated per L12: bool_or for booleans; permit-level NOT; smallest par.id tie-break
[parcels.is_corner_lot + is_through_lot + primary_frontage_street_name]
       ↓   written by enrich-centreline.js (lock 66)
       ↓   computed per §11 8-CTE chain (cross-product side + cosine parallel + NULL-safe nodes + base-name compare)
[toronto_centreline row]
       ↓   written by load-centreline.js (lock 65)
       ↓   source_id == CKAN CENTRELINE_ID
[CKAN toronto-centreline-tcl dataset]
       ↓   maintained by
[City of Toronto Geomatics Group]
```

---

## 11. Linking Contract

**Authoritative pseudo-SQL (8-CTE chain assembled from all R1/R2/R3 fold lessons):**

```sql
-- enrich-centreline.js UPDATE (parcels-level).
-- All CTEs anchor to parcel_ids_intersecting base so every parcel that
-- intersects ANY centreline segment appears in the final UPDATE.
-- v1.3 R3 fold log: 75 findings folded; this SQL block is the authoritative skeleton.

WITH

-- Step 1: All parcel × centreline intersections (uses toronto_centreline_geom_gist).
-- F-S4: hoist parcels.street_name_normalized into the base row for parcel_frontage Priority 1.
parcel_segments AS (
  SELECT
    p.id                                 AS parcel_id,
    p.geom                               AS parcel_geom,
    ST_Centroid(p.geom)                  AS parcel_centroid,
    p.address_number                     AS parcel_addr_text,
    p.street_name_normalized             AS parcel_street_norm,  -- F-S4 Priority 1 anchor (Spec 011 column)
    c.id                                 AS centreline_id,
    c.geom                               AS seg_geom,
    c.linear_name                        AS seg_name_base,       -- base name (no dir/type) per L13/C-v1.3.7
    c.linear_name_full                   AS seg_name_full,
    c.from_intersection_id               AS from_node,
    c.to_intersection_id                 AS to_node,
    c.lo_num_l, c.hi_num_l, c.parity_l,
    c.lo_num_r, c.hi_num_r, c.parity_r,
    (LOWER(c.feature_code_desc) = 'laneway') AS seg_is_lane   -- #431-FU: laneway flag for corner/through exclusion
  FROM parcels p
  JOIN toronto_centreline c
    -- WF2 (2026-06-09 live-validation correction): PROXIMITY, not containment. Street centerlines
    -- run down the middle of the road allowance, ~10 m off the lot polygons, so ST_Intersects
    -- matched only 0.05% of parcels live. Distance probe (1000 parcels): p50 9.9 m, p90 12.9 m,
    -- 97.1% within 20 m. Requires idx_toronto_centreline_geog_gist (geography GIST, migration 175).
    ON ST_DWithin(p.geom::geography, c.geom::geography, 20)
  WHERE p.geom IS NOT NULL AND ST_IsValid(p.geom)
),

-- Step 2: Base CTE — every parcel that intersects at least one centreline.
parcel_ids_intersecting AS (
  SELECT DISTINCT parcel_id FROM parcel_segments
),

-- Step 3: Per-parcel COUNT(DISTINCT) BEFORE self-join (C-v1.2.3 + H-v1.3.4).
parcel_counts AS (
  SELECT parcel_id,
         COUNT(DISTINCT centreline_id) AS intersected_segment_count
  FROM parcel_segments
  GROUP BY parcel_id
),

-- Step 4: Per-parcel segment pairs (INNER JOIN per H-v1.2.7; canonical pair ordering).
-- F-S7 (R3 SPEC DeepSeek HIGH): Cartesian-explosion guard. For commercial / irregular
-- parcels with 100+ intersected segments the C(N,2) self-join produces millions of rows
-- aggregate. We cap each parcel's segment population at 20 via row_number() filtering
-- BEFORE the self-join. This yields at most C(20,2) = 190 pairs per parcel.
-- Trade-off: parcels with > 20 segments will have an approximate (truncated) corner/
-- through classification. This affects < 0.1% of parcels in practice (industrial /
-- mega-lots). Tracked via records_meta.centreline_enrich.parcels_truncated_pair_count.
parcel_segments_capped AS (
  SELECT *
  FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY parcel_id ORDER BY centreline_id) AS rn
    FROM parcel_segments
  ) s
  WHERE rn <= 20    -- L30 cap; logic_variables.centreline_max_segments_per_parcel future-tunable
),

parcel_pairs AS (
  SELECT
    ps1.parcel_id,
    ps1.centreline_id AS c1_id,    ps2.centreline_id AS c2_id,
    ps1.seg_geom      AS c1_geom,  ps2.seg_geom      AS c2_geom,
    ps1.seg_name_base AS c1_name,  ps2.seg_name_base AS c2_name,
    ps1.from_node     AS c1_from,  ps1.to_node       AS c1_to,
    ps2.from_node     AS c2_from,  ps2.to_node       AS c2_to,
    ps1.parcel_centroid             AS centroid,
    -- WF3 (#431) corner/through PRECISION: the "abuts BOTH streets" cap + the through opposite-sides interior point.
    ST_PointOnSurface(ps1.parcel_geom) AS pos,                                   -- guaranteed-interior point (concave/L/U lots)
    ST_Distance(ps1.parcel_geom::geography, ps1.seg_geom::geography) AS c1_dist, -- parcel↔c1 (geography)
    ST_Distance(ps1.parcel_geom::geography, ps2.seg_geom::geography) AS c2_dist, -- parcel↔c2 (geography)
    ps1.seg_is_lane AS c1_is_lane, ps2.seg_is_lane AS c2_is_lane                 -- #431-FU: laneway exclusion
    -- seg_is_lane = (LOWER(c.feature_code_desc) = 'laneway') in parcel_segments. A laneway is loaded (valid
    -- frontage fallback) but is NOT a "street" for corner/through — a lot fronting a street with a rear lane
    -- is a normal lot. (Live #431-FU: through 11.3%→0.98%, corner 14.8%→11.2%.)
  FROM parcel_segments_capped ps1
  INNER JOIN parcel_segments_capped ps2 ON ps1.parcel_id = ps2.parcel_id
  WHERE ps1.centreline_id < ps2.centreline_id        -- canonical ordering
),

-- Step 5: Corner-lot detection — different NAMED streets that SHARE A NODE (they intersect) AND the parcel
--         ABUTS BOTH (each ≤ CENTRELINE_ABUT_M=13). WF3 #431: node-share alone over-flagged adjacent lots
--         (they share the intersection node but the cross street is ~18-20 m away). Abut-both is a pure
--         geography distance — no from/to_node ↔ Start/EndPoint endpoint assumption (digitization-immune).
parcel_corner_pairs AS (
  SELECT parcel_id,
         bool_or(
           c1_name IS DISTINCT FROM c2_name                                  -- base name compare per C-v1.3.7
           AND c1_name IS NOT NULL AND c2_name IS NOT NULL                   -- WF2 DEC-C: an unnamed laneway within the
                                                                             -- proximity radius is NOT "a different street"
           AND (
             c1_from IS NOT DISTINCT FROM c2_from
             OR c1_from IS NOT DISTINCT FROM c2_to
             OR c1_to   IS NOT DISTINCT FROM c2_from
             OR c1_to   IS NOT DISTINCT FROM c2_to
           )
           AND (                                                               -- at-least-one-non-NULL per C-v1.3.6
             c1_from IS NOT NULL OR c1_to IS NOT NULL
             OR c2_from IS NOT NULL OR c2_to IS NOT NULL
           )
           AND c1_dist <= 13 AND c2_dist <= 13                                 -- WF3 #431: parcel ABUTS BOTH streets
           AND NOT c1_is_lane AND NOT c2_is_lane                               -- #431-FU: laneway ≠ street
         ) AS has_corner_pair
  FROM parcel_pairs
  GROUP BY parcel_id
),

-- Step 6: Through-lot detection (different streets + parallel azimuth; cosine equivalence per H-v1.3.1;
--         closest-point + relative-fraction offset per C-v1.3.2; short-segment fallback).
-- F-S8 (R3 SPEC DeepSeek HIGH): wrap diff with LEAST(ABS(diff), 2π - ABS(diff)) before cos()
-- to defensively handle the 0°/360° boundary. Mathematically cos(diff) ≡ cos(2π - diff)
-- but the abs(cos(...)) > cos(radians(15)) idiom is safer with normalized diff.
parcel_parallel_pairs AS (
  SELECT parcel_id,
         bool_or(
           c1_name IS DISTINCT FROM c2_name                                  -- base name compare
           AND c1_name IS NOT NULL AND c2_name IS NOT NULL                   -- WF2 DEC-C: exclude unnamed laneways
           AND abs(cos(LEAST(
             abs(
               COALESCE(
                 ST_Azimuth(
                   ST_ClosestPoint(c1_geom, centroid),
                   ST_LineInterpolatePoint(c1_geom, LEAST(
                     ST_LineLocatePoint(c1_geom, ST_ClosestPoint(c1_geom, centroid))
                     + 10.0 / GREATEST(ST_Length(c1_geom::geography), 1.0),
                     1.0))
                 ),
                 ST_Azimuth(ST_StartPoint(c1_geom), ST_EndPoint(c1_geom))    -- short-segment fallback
               )
               -
               COALESCE(
                 ST_Azimuth(
                   ST_ClosestPoint(c2_geom, centroid),
                   ST_LineInterpolatePoint(c2_geom, LEAST(
                     ST_LineLocatePoint(c2_geom, ST_ClosestPoint(c2_geom, centroid))
                     + 10.0 / GREATEST(ST_Length(c2_geom::geography), 1.0),
                     1.0))
                 ),
                 ST_Azimuth(ST_StartPoint(c2_geom), ST_EndPoint(c2_geom))
               )
             ),
             2 * pi() - abs(
               COALESCE(
                 ST_Azimuth(
                   ST_ClosestPoint(c1_geom, centroid),
                   ST_LineInterpolatePoint(c1_geom, LEAST(
                     ST_LineLocatePoint(c1_geom, ST_ClosestPoint(c1_geom, centroid))
                     + 10.0 / GREATEST(ST_Length(c1_geom::geography), 1.0),
                     1.0))
                 ),
                 ST_Azimuth(ST_StartPoint(c1_geom), ST_EndPoint(c1_geom))
               )
               -
               COALESCE(
                 ST_Azimuth(
                   ST_ClosestPoint(c2_geom, centroid),
                   ST_LineInterpolatePoint(c2_geom, LEAST(
                     ST_LineLocatePoint(c2_geom, ST_ClosestPoint(c2_geom, centroid))
                     + 10.0 / GREATEST(ST_Length(c2_geom::geography), 1.0),
                     1.0))
                 ),
                 ST_Azimuth(ST_StartPoint(c2_geom), ST_EndPoint(c2_geom))
               )
             )
           ))) > cos(radians(15))                                            -- cosine threshold per H-v1.3.1
           -- WF3 #431: the two parallel streets must be on OPPOSITE sides of the parcel (front + back),
           -- bearings from the interior point `pos` to each segment differ by ~180° (gap > 135° = pi-radians(45)).
           -- Degenerate guard: pos ON a segment ⇒ ST_Azimuth throws ⇒ CASE→NULL ⇒ bool_or ignores it.
           AND LEAST(
                 abs((CASE WHEN ST_Distance(pos, ST_ClosestPoint(c1_geom, pos)) > 0 THEN ST_Azimuth(pos, ST_ClosestPoint(c1_geom, pos)) END)
                   - (CASE WHEN ST_Distance(pos, ST_ClosestPoint(c2_geom, pos)) > 0 THEN ST_Azimuth(pos, ST_ClosestPoint(c2_geom, pos)) END)),
                 2 * pi() - abs((CASE WHEN ST_Distance(pos, ST_ClosestPoint(c1_geom, pos)) > 0 THEN ST_Azimuth(pos, ST_ClosestPoint(c1_geom, pos)) END)
                   - (CASE WHEN ST_Distance(pos, ST_ClosestPoint(c2_geom, pos)) > 0 THEN ST_Azimuth(pos, ST_ClosestPoint(c2_geom, pos)) END))
               ) > pi() - radians(45)
           AND c1_dist <= 13 AND c2_dist <= 13                                -- WF3 #431: parcel ABUTS BOTH streets
           AND NOT c1_is_lane AND NOT c2_is_lane                              -- #431-FU: a rear laneway is not a 2nd frontage
         ) AS has_parallel_different_street_pair
  FROM parcel_pairs
  GROUP BY parcel_id
),

-- Step 7: Frontage detection — F-S3 + F-S4 (R3 SPEC).
--   Priority 1 (NEW): parcel.street_name_normalized ≈ centreline.linear_name (base name).
--                     Anchors to the parcel's own civic address; immune to digitization-direction
--                     and centroid-on-irregular-lot pathologies. Gemini CRIT-2 + DeepSeek CRIT.
--   Priority 2: side-agnostic L+R address-range match (TRY BOTH SIDES — no longer keyed on
--               cross-product side detection because consecutive segments of the same street
--               can be digitized in opposite directions, flipping L/R per DeepSeek CRIT).
--   Priority 3: NEAREST segment (WF2: under the proximity join the segment does not overlap the
--               lot, so ST_Length(ST_Intersection)=0 — P3 is min ST_Distance::geography ASC).
--   Tie-break: smallest centreline_id ASC.
parcel_frontage AS (
  SELECT DISTINCT ON (parcel_id)
    parcel_id,
    seg_name_full AS primary_frontage_street_name,
    -- diagnostic columns surfaced for records_meta.centreline_enrich tallies (F-S12):
    name_match_p1,
    addr_match_p2
  FROM (
    SELECT
      ps.parcel_id,
      ps.centreline_id,
      ps.seg_name_full,
      ST_Distance(ps.parcel_geom::geography, ps.seg_geom::geography) AS dist_m,  -- WF2: nearest, not longest-intersection
      -- F-S4 Priority 1: case-insensitive base-name equality
      (ps.parcel_street_norm IS NOT NULL
        AND ps.seg_name_base IS NOT NULL
        AND LOWER(ps.parcel_street_norm) = LOWER(ps.seg_name_base)) AS name_match_p1,
      -- F-S3 Priority 2: side-agnostic L+R try-both
      (address_match_status(ps.parcel_addr_text, ps.parity_l, ps.lo_num_l, ps.hi_num_l)
        OR address_match_status(ps.parcel_addr_text, ps.parity_r, ps.lo_num_r, ps.hi_num_r)
      ) AS addr_match_p2
    FROM parcel_segments ps
  ) sided
  ORDER BY parcel_id,
           -- Priority 1: street-name match wins (immune to digitization direction + lot shape)
           CASE WHEN name_match_p1 THEN 0 ELSE 1 END,
           -- Priority 2: address-range hit on EITHER side (try-both per F-S3)
           CASE WHEN addr_match_p2 THEN 0 ELSE 1 END,
           -- Priority 3: nearest segment (WF2 — longest-intersection is 0 under proximity)
           dist_m ASC,
           -- Final tie-break: smallest centreline_id (deterministic)
           centreline_id ASC
),

-- Step 8: Combine + materialize all 3 derived columns.
-- COALESCE wraps (C-v1.2.1) ensure NOT NULL semantics.
-- LEFT JOIN against base CTE ensures every intersecting parcel reaches UPDATE (C-v1.3.4).
parcel_enrichment AS (
  SELECT
    pii.parcel_id,
    COALESCE(pc.intersected_segment_count, 0)            AS seg_count,
    COALESCE(pcp.has_corner_pair, false)                 AS new_is_corner_lot,
    -- F-S6 (R3 SPEC Gemini HIGH): corner AND through can both be true (large consolidated lots).
    -- Removed the `AND NOT has_corner_pair` carve-out — booleans are now independent.
    (
      COALESCE(pc.intersected_segment_count, 0) >= 2
      AND COALESCE(ppp.has_parallel_different_street_pair, false)
    )                                                     AS new_is_through_lot,
    pf.primary_frontage_street_name                       AS new_primary_frontage_street_name
  FROM parcel_ids_intersecting pii
  LEFT JOIN parcel_counts        pc   USING (parcel_id)
  LEFT JOIN parcel_corner_pairs   pcp USING (parcel_id)
  LEFT JOIN parcel_parallel_pairs ppp USING (parcel_id)
  LEFT JOIN parcel_frontage       pf  USING (parcel_id)
)

UPDATE parcels p
   SET is_corner_lot                = pe.new_is_corner_lot,
       is_through_lot               = pe.new_is_through_lot,
       primary_frontage_street_name = pe.new_primary_frontage_street_name,
       centreline_dataset_version_when_enriched = $1   -- §8d lineage stamp = producer source_dataset_version (§9 step-5)
  FROM parcel_enrichment pe
 WHERE p.id = pe.parcel_id
   AND (p.is_corner_lot                IS DISTINCT FROM pe.new_is_corner_lot
        OR p.is_through_lot            IS DISTINCT FROM pe.new_is_through_lot
        OR p.primary_frontage_street_name IS DISTINCT FROM pe.new_primary_frontage_street_name
        OR p.centreline_dataset_version_when_enriched IS DISTINCT FROM $1);
```

### 11.0 Known Failure Modes (live validation, 2026-06-09)

- **Containment→proximity (FIXED, WF2).** The original §11 `JOIN ... ON ST_Intersects(p.geom, c.geom)` was geometrically wrong: street centerlines run down the middle of the road allowance, **~10 m off the lot polygons**, so the live §8d enrich matched only **255 / 486,530 parcels (0.05%)**. Corrected to a **20 m geography proximity** join (`ST_DWithin(p.geom::geography, c.geom::geography, 20)`, backed by `idx_toronto_centreline_geog_gist`, migration 175). Distance probe (1000 parcels): p50 9.9 m, p90 12.9 m, 97.1% within 20 m. Re-validated live: zero-intersection 99.95%→**3.0%**, **471,869 parcels enriched** (97%), frontage resolved 97% (P1 name 91%), 8.1 min. Frontage P3 changed from longest-intersection (always 0 under proximity) to **nearest segment**; corner/through pairs now require both base names NOT NULL (an unnamed laneway within radius is not "a different street").
- **Corner/through OVER-DETECTION (FIXED, WF3 #431).** The proximity model inflated the two booleans (live `is_corner_lot` **24%**, `is_through_lot` **16.7%** vs typical ~13% / <5%) because the 20 m radius reaches streets the parcel does not *abut*. A first attempt (corner node-proximity ≤18 m) only reached 17.8% — an adjacent lot still **shares** the intersection node. Corrected to an **"abuts BOTH streets" model**: corner = different-named streets that share a node **AND** the parcel is within `CENTRELINE_ABUT_M`=13 m of **both**; through = different-named **parallel, OPPOSITE-side** streets (interior-point `ST_PointOnSurface` azimuths, degenerate-guarded) **AND** abuts both. Re-validated live (2026-06-09): `is_corner_lot` 24%→**14.8%** (71,945), `is_through_lot` 16.7%→**11.3%** (54,873); frontage unchanged (P1 91%); ~11.4 min. Diagnostics: `scripts/analysis/wf3-centreline-postfix-diagnostic.js` (abut-distance distributions) + `wf3-through-sample.js`. Locked by `migration-174-centreline-enrich.db.test.ts` (CE-CORNER-ADJ / CE-ARTERIAL / CE-THRU / CE-THRU-SAME / CE-THRU-L) + the infra string contracts.
- **Laneways counted as a "street" (FIXED, WF3 #431-FU).** The abut-both model still counted NAMED laneways (e.g. "Ln W Abraham Welsh…") as a second frontage — a street + rear-lane lot is a *normal* lot (most downtown lots back onto a named lane), not a corner/through lot. Excluded `LOWER(feature_code_desc) = 'laneway'` (4,146 segments) from BOTH the corner and through pair populations (extends the WF2 *unnamed*-name guard to *named* lanes). Re-validated live: `is_through_lot` 11.3%→**0.98%** (4,764), `is_corner_lot` 14.8%→**11.2%** (54,478); frontage unchanged. Laneways remain loaded + valid for **frontage** resolution (P3) — a lane is a frontage fallback but not a corner/through "street." Locked by `CE-LANE-NAMED-CORNER` / `CE-LANE-THRU` fixtures + infra contract. Diagnostics: `scripts/analysis/wf3-laneway-scope.js`. **Deferred:** `parcels.abuts_laneway` (laneway-suite / laneway-house development signal) → its own WF1 (#431-FU2); frontage P3 can still name a lane (#431-FU3).

### 11.1 Permit/CoA propagation SQL (3-CTE chain per Spec 61 §11.2 pattern + L12)

```sql
-- enrich-permits.js centreline step (symmetric for CoA).
-- Multi-parcel propagation: bool_or for booleans; permit-level NOT for through-lot per L12.

WITH per_permit_state AS (
  SELECT
    p.id AS permit_id, p.lead_id,
    COALESCE(bool_or(par.is_corner_lot), false)  AS new_is_corner_lot,
    COALESCE(bool_or(par.is_through_lot), false) AS has_through_parcel
    FROM permits p
    LEFT JOIN parcels par ON par.lead_id = p.lead_id
GROUP BY p.id, p.lead_id
),

per_permit_winner AS (
  SELECT
    permit_id, lead_id,
    new_is_corner_lot,
    -- F-S6 (R3 SPEC Gemini HIGH): L12 mutual-exclusivity carve-out removed.
    -- A multi-parcel permit can legitimately be both corner AND through (consolidated lots);
    -- corner no longer suppresses through at the permit level.
    has_through_parcel AS new_is_through_lot
  FROM per_permit_state
),

per_permit_frontage AS (
  SELECT
    w.permit_id,
    w.new_is_corner_lot,
    w.new_is_through_lot,
    -- L12 tie-break: smallest par.id ASC (D3 known limitation; future improvement queued)
    (SELECT par.primary_frontage_street_name
       FROM parcels par
      WHERE par.lead_id = w.lead_id
        AND par.primary_frontage_street_name IS NOT NULL
      ORDER BY par.id ASC LIMIT 1) AS new_primary_frontage_street_name
  FROM per_permit_winner w
)

UPDATE permits p
   SET is_corner_lot                = ppf.new_is_corner_lot,
       is_through_lot               = ppf.new_is_through_lot,
       primary_frontage_street_name = ppf.new_primary_frontage_street_name
  FROM per_permit_frontage ppf
 WHERE p.id = ppf.permit_id
   AND (p.is_corner_lot                IS DISTINCT FROM ppf.new_is_corner_lot
        OR p.is_through_lot            IS DISTINCT FROM ppf.new_is_through_lot
        OR p.primary_frontage_street_name IS DISTINCT FROM ppf.new_primary_frontage_street_name);
```

### 11.2 Source-of-truth precedence (L5)

Geometry-derived is authoritative. No declared override (no `permit_type='Corner Lot'` legacy data; the corner-lot status is geometry-pure).

### 11.3 What this contract intentionally does NOT define

- Secondary frontage (corner-lot's "other street") — not stored in v1
- Cross-street one-way direction propagation — not stored in v1
- Address-point lookups (`BEGIN_ADDR_*` / `END_ADDR_*` columns) — not v1-used
- Per-parcel frontage length (number of metres of frontage on each street) — not v1-used

---

## 12. Detailed Implementation Guide

**§12 is implementation guidance outline (DDL + manifest edits + pseudo-SQL + cross-references) per Spec 61 user-direction precedent — NOT verbatim code skeletons.**

### §12.1 `load-centreline.js` guidance

- Spec 47 R1-R12 skeleton; `ADVISORY_LOCK_ID = 65`; slug = `source-centreline`
- Zod config schema with 7 keys (per §12.3a)
- **F-S9:** wrap config validation in `validateConfig(logicVars)` calling `safeParse` per Spec 47 §4.2 (NOT raw `ConfigSchema.parse()`)
- HEAD skip-check per §3.2 (7-day threshold; HEAD-fail proceeds; ETag + content-hash fallback)
- Download + parse: 117 MB zip → 64K LineStrings via npm `shapefile`
- L25 JS-side filter: 12 street-class INCLUDE; UNKNOWN → sentinel; FEDERAL excluded
- Batched VALUES+UNNEST validation per L16 (5K-row chunks)
- L7/L7b/L7c drift signals + override flags
- L8 abort-before-DELETE if invalid >5%
- L15 F-C1 JS-side dual-mode guard BEFORE `pipeline.withTransaction`
- Staging-CTE full-replace per L26 (inside withTransaction: CREATE TEMP TABLE + 10× batched INSERT + DELETE target + INSERT FROM TEMP)
- `pipeline.recordAuditRow` for guards (NOT emitSummary); single `pipeline.emitSummary` at success-path end (Spec 47 §R10)
- `pipeline.emitMeta` two-arg per L17 (concrete signature in §9)

### §12.2 `enrich-centreline.js` guidance

- Spec 47 R1-R12 skeleton; `ADVISORY_LOCK_ID = 66`
- L23 3-tier startup guard
- Single UPDATE per §11 (9-CTE chain after F-S7 added `parcel_segments_capped`)
- IS DISTINCT FROM guard on UPDATE WHERE (per L11)
- Export `applyCentrelineEnrichment(client, RUN_AT)` self-contained function for `enrich-permits.js` reuse
- **F-S12:** single `pipeline.emitSummary` call at success-path end (Spec 47 §R10); MUST emit `records_meta.centreline_enrich` frozen block per §9 (enables `enrich-permits.js` L24 step (b) to verify successful enrich run, not just column existence)
- **F-S9:** use `validateConfig(logicVars)` wrapper with `safeParse` per Spec 47 §4.2 (NOT `ConfigSchema.parse()`)

### §12.3 Migration files (UP + DOWN)

**M-1 UP:**
```sql
-- normalize_address_number helper (per L27)
CREATE OR REPLACE FUNCTION normalize_address_number(addr TEXT)
RETURNS TABLE(numeric_part INT, suffix TEXT)
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  m TEXT[];
BEGIN
  IF addr IS NULL OR length(trim(addr)) = 0 THEN
    RETURN QUERY SELECT NULL::INT, NULL::TEXT;
    RETURN;
  END IF;
  -- Match leading digits + optional alphabetic/space-fraction suffix
  m := regexp_match(trim(addr), '^([0-9]+)(.*)$');
  IF m IS NULL THEN
    RETURN QUERY SELECT NULL::INT, NULL::TEXT;
  ELSE
    -- F-S2 (R3 SPEC Independent CRIT-2): suffix preserved WITHOUT trim — "12 1/2" → " 1/2"
    -- per L27 contract + §4.1 unit test. Trimming dropped the disambiguating leading space.
    RETURN QUERY SELECT m[1]::INT,
                        CASE WHEN length(trim(m[2])) = 0 THEN NULL ELSE m[2] END;
  END IF;
END;
$$;

-- address_match_status helper (per L27 + H-v1.2.4 explicit body + H-v1.3.3 NULL-parity policy)
CREATE OR REPLACE FUNCTION address_match_status(
  parcel_addr_text TEXT,
  parity TEXT,                    -- 'O' | 'E' | NULL
  lo_num_text TEXT,
  hi_num_text TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  parcel_num INT;
  lo_num INT;
  hi_num INT;
BEGIN
  SELECT (normalize_address_number(parcel_addr_text)).numeric_part INTO parcel_num;
  SELECT (normalize_address_number(lo_num_text)).numeric_part INTO lo_num;
  SELECT (normalize_address_number(hi_num_text)).numeric_part INTO hi_num;

  IF parcel_num IS NULL OR lo_num IS NULL OR hi_num IS NULL THEN
    RETURN FALSE;
  END IF;

  -- NULL parity → skip parity check, range-only match (H-v1.3.3 policy)
  IF parity IS NOT NULL THEN
    IF parity = 'O' AND parcel_num % 2 = 0 THEN RETURN FALSE; END IF;
    IF parity = 'E' AND parcel_num % 2 = 1 THEN RETURN FALSE; END IF;
  END IF;

  RETURN parcel_num BETWEEN lo_num AND hi_num;
END;
$$;

-- toronto_centreline table + GIST index (per §2)
CREATE TABLE toronto_centreline ( ... );  -- 18 columns per §2 DDL
CREATE INDEX toronto_centreline_geom_gist ON toronto_centreline USING GIST (geom);
```

**M-1 DOWN:**
```sql
DROP TABLE IF EXISTS toronto_centreline CASCADE;
DROP FUNCTION IF EXISTS address_match_status(TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS normalize_address_number(TEXT);
-- No EXTENSION drops (none added by Spec 62)
```

**M-2 UP:** `ALTER TABLE parcels ADD COLUMN ...` (3 columns per §2).
**M-2 DOWN:** `ALTER TABLE parcels DROP COLUMN ...`

**M-3 UP/DOWN:** Symmetric on permits + coa_applications.

### §12.3a `logic_variables.json` seed entries (Spec 47 §4.1)

```json
{
  "centreline_min_feature_count":                40000,
  "centreline_unlinked_parcel_warn_pct":         10,
  "centreline_unlinked_parcel_fail_pct":         40,
  "centreline_parallel_azimuth_threshold_degrees": 15,
  "centreline_skip_check_threshold_days":        7
}
```

(`centreline_address_levenshtein_threshold` REMOVED per H-v1.3.6 — Spec 62 doesn't use Levenshtein.)

### §12.4 Spec 43 + 41 + 42 chain edits + §A.5 registry update

- **`chain_sources` (Spec 43):** `load_centreline` AFTER `load_parcels` slug; `enrich_centreline` AFTER `enrich_heritage` slug (or AFTER the latest existing enrich-* if 58/59/61 partial implementation per L22 contingency table)
- **`chain_permits` (Spec 41):** `applyCentrelineEnrichment` appended to existing `enrich-permits.js` (L28 ownership)
- **`chain_coa` (Spec 42):** symmetric for CoA
- **`manifest.json`:** 3 chain arrays updated with `source-centreline` + `enrich-centreline` slugs
- **Spec 47 §A.5 registry update (per F-S1 corrected text):**
  - Add 2 table rows: lock 65 (`load-centreline.js`) + lock 66 (`enrich-centreline.js`)
  - **Footnote immediately below the rows:** "Spec 62 uses lock IDs 65 + 66 instead of natural §5.2 ID 62 because Spec 61 pre-occupied 62/63. Per §5.2 exception protocol, next-available gap (65/66) is used. The `pipeline-advisory-lock.infra.test.ts` `LOCK_ID_REGISTRY` hardcoded constant MUST also be updated with the same two entries — see §5 Target Files (this is NOT optional; the registry-coverage test will fail without this edit)."

### §12.5 Quality script edits

- `assert-schema.js`: CKAN URL reachability + 40-column attribute schema check + FEATURE_CODE_DESC + JURISDICTION allowed values
- `assert-data-bounds.js`: `toronto_centreline >= centreline_min_feature_count` (threshold from `logic_variables.json` per Spec 47 §4.1)
- `assert-entity-tracing.js`: centreline_* fields added to coverage grid
- `assert-global-coverage.js`: `parcels.is_corner_lot` coverage threshold row

### §12.6 Test fixture templates (per R2 D8 + R3 MED-R3-2)

Required fixtures for §4 Testing Mandate:
- Single-segment interior lot (no corner, no through)
- Corner lot: 2 segments different streets sharing intersection
- Through lot: 2 parallel segments different streets, no shared intersection
- **Divided-road false-positive prevention:** "Main St N" + "Main St S" (same `linear_name='Main'`) → NOT corner (C-v1.3.7)
- **NULL-NULL intersection guard:** 2 segments with all-NULL intersection IDs → NOT corner (C-v1.3.6)
- Short-segment azimuth fallback: segment <1m → endpoint-azimuth used
- Address-suffix match: parcel "10A" matches range "10..20" parity 'E'
- NULL-parity match: parcel "33" matches range "29-39" with NULL parity (range-only check per H-v1.3.3)
- Frontage L-side vs R-side via cross-product

### §12.7 First-deploy convergence validation (NOT §3.7 ledger-writer spike)

- Pre-deploy: dry-run `enrich-centreline.js` against local Postgres with `BUILDO_TEST_DB=1`
- Post-deploy: 7-day daily convergence pattern; if `parcels_with_zero_centreline_intersections_pct` stabilizes within ±2pp band, confirm thresholds; else operator adjusts `logic_variables.json`
- Runbook captures expected first-deploy spike shape (per Spec 48 §3.6 dual-pattern)

### §12.8 Operator playbook — named audit_table rows

(Per §9 audit table — 12 named rows including `centreline_feature_count_raw`, `centreline_feature_count_filtered`, `centreline_unknown_feature_code_count`, `centreline_geometry_skipped_pct`, `centreline_count_drift_pct`, `centreline_geometry_update_pct`, `centreline_mass_delete_pct`, `centreline_dataset_age_days`, `f_c1_empty_temp_guard_fired`, `parcels_with_zero_centreline_intersections_pct`.)

### §12.9 Cross-WF tracing diagram

(Per §10 — single backward trace from admin UI through permit + parcels + toronto_centreline + CKAN to City of Toronto Geomatics Group.)

---

*End of Spec 62 v1.1.*
