# Spec 62 — Toronto Centreline (Streets) (Ingest + Link)

**Spec version:** 1.1 (R3 SPEC fold applied; L10 lock re-baselined)
**Status:** Implemented — §8c load + §8d enrich + §8e propagate-to-permits/coa all shipped (2026-06).
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
| **L4** | `load-centreline.js` advisory lock = **63** (§5.2 exception; see §A.5 footnote — natural ID 62 pre-occupied by Spec 61's enrich-heritage; the original 65 guess collided with enrich-parcels, so the next free gap 63 is used. **Corrected 2026-06-23 from 65 to match canonical Spec 47 §A.5 registry + live code.**) |
| **L4b** | `enrich-centreline.js` advisory lock = **64** (§5.2 exception; see §A.5 footnote — sibling of load=63; the original 66 guess collided with enrich-permits. **Corrected 2026-06-23 from 66 to match canonical Spec 47 §A.5 registry + live code.**) |
| **L4c** | `enrich-permits.js` centreline step inherits parent lock = **66** (per Spec 61 L4c, no new lock for in-script step — `enrich-permits.js`'s own lock is 66. **Corrected 2026-06-23 from 64.**) |
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
| **L19** | `enrich-permits.js` centreline step = self-contained `applyCentrelineEnrichment(client, RUN_AT)` function inside parent lock 66 |
| **L20** | §A.5 registry update is explicit §5 + §12 deliverable; footnote-based §5.2 exception documentation below lock-63/64 entries (canonical home) |
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

+- Implemented (§8c) ----------------------------------------------+
| load-centreline.js (Spec 47 R1-R12 skeleton; advisory lock 63)    |
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

+- Implemented (§8d) ----------------------------------------------+
| enrich-centreline.js (Spec 47 R1-R12 skeleton; advisory lock 64)  |
|   - L23 empty-source guard at startup (3-tier)                    |
|   - Single UPDATE per §11 (8-CTE chain; ~5-15 min on 486K parcels)|
| Migration M-2 (separate from Spec 58/59/61):                      |
|   - ALTER parcels ADD COLUMN is_corner_lot, is_through_lot,       |
|     primary_frontage_street_name                                  |
| Spec 43 chain edit: enrich_centreline AFTER enrich_heritage slug  |
+--------------------------------------------------------------------+

+- Implemented (§8e) ----------------------------------------------+
| enrich-permits.js centreline step (advisory lock 66 inherits)     |
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

**[as-built ②, EC-D8]** Migration 174 also adds `centreline_dataset_version_when_enriched TEXT` (the lineage stamp the guard and the version-skip gate read), and migration 191 (Spec 65 Phase 3) adds `abuts_laneway BOOLEAN NOT NULL DEFAULT false`. `enrich_centreline` writes all FIVE columns.

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

**[as-built 2026-09-24, row 3.2 ②]** `scripts/load-centreline.js` is now the Spec 122
§5.1 frozen three-line shell (`pipeline.step(descriptor, compute)`) — it declares no
domain logic of its own. Behaviour lives in two places: `scripts/load-centreline.descriptor.json`
(what the step IS, declared as data — write target, checks, terminals, config,
deviations) and `scripts/lib/compute/load-centreline.js` (the pure domain logic:
the L25 classifier, F13 column guard, drift math, the frozen §9 producer block).
Acquisition, geometry validation and the class-C `staging_full_replace` write are
LIBRARY, shared by every converted step (`scripts/lib/step/{acquire,write,staleness}.js`
— acquire.js downloads/unzips/parses and runs the tier-1/tier-2 staleness gates,
write.js's `executeStagingReplace` is the class-C executor: one transaction that
stages the validated rows into a temp table, deletes the whole target, and
re-inserts from staging). The subsections below describe the PRE-CONVERSION
behaviour the conversion preserved byte-for-byte (Spec 121 §4.3 zero-behaviour-change);
each place where the converted shape diverges is called out inline with its `LC-D<n>`
id, and §12.3a below carries the as-built seed table.

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

const ADVISORY_LOCK_ID = 63;   // L4 — §5.2 exception per §A.5 footnote
const SPEC_VERSION = '1.1';    // L10 — [as-built 2026-09-24, row 3.2 ②] the as-built spec_version is likewise 1.1 (`descriptor.identity.spec_version`, frozen producer contract, never touched by the conversion)

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

**[as-built 2026-09-24, row 3.2 ②] LC-D1 — the loader implements ONLY L7.** The code
(verified against `scripts/load-centreline.js` at every ledger commit through
fff52b7a, and now the converted `centreline_count_drift_pct` declared check) carries
a single `pct <= load_centreline_count_drift_fail_pct` bound, scored `pre_write`,
both directions (a rise or a drop trips it the same way); the operator override
`CENTRELINE_ACCEPT_FEATURE_COUNT_DRIFT` never suppresses the FAIL row, it only
enables the write to proceed. L7b/L7c below are struck as **not implemented** —
operator ruling Q1 (2026-09-24, AP-D1 precedent) corrects this spec TO the code
rather than adding the checks in a conversion, since neither has a natural
per-row comparison under a full replace: L7c (mass-deletion) is indistinguishable
from L7 itself once every run deletes-and-reinserts the whole table, and L7b
(geometry-update %) has no per-row UPDATE to measure against in a staging-CTE
full-replace. Implementing either would be a BEHAVIOUR CHANGE inside a
zero-behaviour-change conversion (Spec 121 §4.3); if a genuine need for the finer
signal is identified, it is filed as a separate post-conversion feature, not folded
into this row's commit.

~~Per Spec 59 pattern:~~ *(superseded text, kept for record — never implemented for this step)*
- ~~L7 count-delta vs prior run: > 50% → FAIL (operator override flag `CENTRELINE_ACCEPT_FEATURE_COUNT_DRIFT=1`)~~ — implemented, see above (the 50% default is now the registered logic variable `load_centreline_count_drift_fail_pct`, seed 0.5).
- ~~L7b geometry-update %: > 50% → FAIL (override flag)~~ — **not implemented; struck, LC-D1.**
- ~~L7c mass-deletion %: > 50% → FAIL (override flag)~~ — **not implemented; struck, LC-D1.**

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

**[as-built 2026-09-24, row 3.2 ②]** LC-D2: neither a bad `CENTRELINE_ID` nor a
duplicate is FAIL in the code — both are declared WARN checks that emit PASS at 0
(the ravines Fold D precedent). The as-built table below replaces the superseded
rows in place (struck, kept for record).

| Case | Behavior |
|---|---|
| HEAD returns 4xx/5xx | Library `on_head_error: "warn_row"` — one WARN row + proceed to download with null validators (`scripts/lib/step/acquire.js`) |
| Download fails network | `failed_acquisition` terminal (`fail_error`); no write attempted, temp root cleaned |
| Zip malformed | `failed_acquisition` terminal, same as above |
| `CENTRELINE_ID` non-integer / NULL | **[as-built]** WARN `centreline_bad_centreline_id_count`; skipped; NOT counted toward L8 (`invalid_geometry_skipped` is a geometry-validity count, not a key-coercion count) — ~~WARN; skip feature; counted toward `invalid_geometry_skipped` (L8 threshold applies)~~ *(superseded, LC-D2)* |
| `CENTRELINE_ID` duplicate (within batch) | **[as-built]** WARN `centreline_duplicate_centreline_id_count`; keep-first dedupe, NOT a FAIL — ~~FAIL with clear error (D2 routed for JS-side pre-check enhancement)~~ *(superseded, LC-D2; Q1 corrects the spec to the code)* |
| All features dropped by L25 filter | L7 drift FAIL fires when a prior run exists (feature_count_filtered collapses to 0); F-C1 first-run FAIL (`f_c1_empty_temp_guard_fired_first_run`) fires on a first run with no prior — **not** the L8 geometry-skip threshold (L8 measures validity among the features that survived L25, and an empty post-L25 set has nothing for L8 to measure) |
| F-C1: temp empty on first run | FAIL with `f_c1_empty_temp_guard_fired_first_run` audit row (own id since c2a4, LC-D14 — separated from the subsequent-run arm below) |
| F-C1: temp empty on subsequent run | WARN `on_warn: "skip_write"` + preserve target (L15 dual-mode); `records_meta.centreline_load.features_inserted` pins `0` in that emitted row (LC-D14/LC-D5, fix ④b) |
| Concurrent run attempt | Advisory lock 63 blocks; `lock_held_elsewhere` terminal, row-derived SKIP summary |
| `parcels.geom` SRID mismatch | runtime assertion `Find_SRID('public','parcels','geom') = 4326`; FAIL if false |
| `toronto_centreline` table empty at enrich time | L23 enrich-side guard FAILs (3-tier check) |

### 3.10 Point-in-time semantics (L3)

Data represents a point-in-time snapshot per `source_dataset_version`. Daily-publish cadence means downstream enrichment reflects a 1-7 day window of source freshness (per L9). Admin UI MUST display `source_dataset_version` to communicate the snapshot date.

### 3.11 `enrich_centreline` version-skip gate (WF2 P11-1)

The §11 8-CTE join over 486K parcels is the sources chain's single biggest cost (~92 min). Because the producer's `source_dataset_version` is a content hash that moves only when the network changes, most runs re-derive an unchanged result. **[as-built ②, EC-D8]** Measured on the dev ledger (2026-06-10 … 09-29): 7 of 17 consecutive producer transitions changed the version — neither the DAILY of §2 nor "quarterly". The gate makes the recompute proportional to actual change:

- **Signal:** the producer `source_dataset_version` (from the last completed `sources:load_centreline` run) vs the version the LAST completed `sources:enrich_centreline` run recorded in its `records_meta.centreline_enrich.source_dataset_version` (a bare-run fallback reads the `centreline_source_dataset_version` audit row). The **run row**, never the per-parcel column (which carries a legit-NULL zero-intersection tail + strays).
- **Unchanged version → row-level scope:** only parcels whose `centreline_dataset_version_when_enriched` is NULL/stale are recomputed. The `load-parcels.js` #418 geometry-change fence (DEC-FENCE2) NULLs that stamp on any moved parcel, so the stale set is {new, moved, never-linked} — **[as-built ②]** except that an address-only edit never re-stales (EC-D3, declared limitation) — the only parcels whose corner/through/frontage/laneway can have changed. **Zero stale → full skip.** (In practice a permanent ~14.5K zero-intersection tail keeps every unchanged run in the *reduced* band rather than a true zero-skip — still seconds, not 92 min.)
- **Changed version (or no prior run) → full recompute** and re-stamp (the mode='full' path is unchanged).
- **Chain-safety (load-bearing):** the reduced and skip paths BOTH emit a `status='completed'` run row with a fresh `completed_at` (Observer-style PASS, `records_updated:0/N`, audit rows `enrich_centreline_mode` + `enrich_centreline_skip_reason`) — explicitly NOT the `withAdvisoryLock` lock-contention SKIP payload. `assertCentrelineEnriched` (enrich-permits §8e L24b/c) HALTs the daily permits/coa chain unless a *completed* enrich_centreline run post-dates the latest load-parcels AND coverage ≥ `centreline_propagation_coverage_min`; the skip preserves the stamps, so both hold.
- **Spec 48 §3.7 pre-ack:** enrich_centreline is now a *regularly-reduced* step — its `records_updated` will read 0/N (not ~472K) on unchanged runs; that is the designed steady state, not a regression.

> ~~**Filed (not done here):** the §11 magic numbers … logic_variables externalization remains a filed follow-up.~~ **CLOSED at batch-2 row 3.10 ②:** every §11 number is a `enrich_centreline_*` logic variable (see the As-built — batch-2 row 3.10 ② section).

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

### Target Files
<!-- generated:target-files -->
<!-- do not hand-edit: npm run target-files regenerates this block from the census owner_specs, the capture-step-golden derivation, the cross-step ledger and consumer-registry.json -->
- `load_centreline` — INGESTOR · converted · owner specs: 62
  - `scripts/load-centreline.js`
  - `scripts/load-centreline.descriptor.json`
  - `scripts/load-centreline.notes.json`
  - `scripts/lib/compute/load-centreline.js`
  - `src/tests/steps/load_centreline/config-literals.logic.test.ts`
  - `src/tests/steps/load_centreline/violations.test.ts`
  - data (descriptor): `toronto_centreline` writes (migrations/173_create_toronto_centreline.sql)
  - upstream: none
  - downstream: enrich_centreline
  - consumers: enrich_centreline (records_meta centreline_load) · load_centreline (records_meta centreline_load.features_updated)
- `enrich_centreline` — ENRICHER · converted · owner specs: 62
  - `scripts/enrich-centreline.js`
  - `scripts/enrich-centreline.descriptor.json`
  - `scripts/enrich-centreline.notes.json`
  - `scripts/lib/compute/enrich-centreline.js`
  - `src/tests/steps/enrich_centreline/violations.test.ts`
  - data (descriptor): `parcels` reads+writes (migrations/011_parcels.sql); `toronto_centreline` reads (migrations/173_create_toronto_centreline.sql)
  - upstream: load_centreline · parcels
  - downstream: none
  - consumers: enrich_centreline (records_meta centreline_enrich) · src/components/FreshnessTimeline.tsx (records_meta duration_ms) · src/lib/admin/funnel.ts (records_meta duration_ms)
<!-- /generated:target-files -->

- `scripts/lib/source-version.js` (**[as-built ②]** the tier-1/tier-2 skip-check gate + skip re-emit, called via the library's `scripts/lib/step/{staleness,acquire}.js`, not from the step body)
- `scripts/lib/config-loader.js` (**[as-built ②]** fleet lib; no longer used by load_centreline — config is `config.logic_variables` resolved through `ctx.config`, LC-D3)
- `scripts/lib/geometry-validator.js` (**[as-built ②]** not used by load_centreline — the library validator `write.validateGeometries` with `geometry_kind: "line"` performs the same ST_MakeValid/ST_CollectionExtract repair)
- `scripts/enrich-permits.js` (extended per L28; Spec 61 creates the file; Spec 62 appends `applyCentrelineEnrichment` function)
- `migrations/NNN_create_toronto_centreline.sql` (M-1: table + GIST index + `normalize_address_number()` + `address_match_status()`)
- `migrations/NNN_parcels_centreline_columns.sql` (M-2; SEPARATE from Spec 58/59/61 per L11)
- `migrations/NNN_permits_coa_centreline_columns.sql` (M-3)
- `scripts/lib/geometry-validator.js` (reuse from Spec 58/59/61 implementation if exists; create if first-to-land)
- `scripts/lib/safe-math.js` (existing per Spec 47 §16 B5)
- `docs/specs/01-pipeline/43_chain_sources.md` (edit: `load_centreline` AFTER `load_parcels`; `enrich_centreline` AFTER `enrich_heritage`)
- `docs/specs/01-pipeline/41_chain_permits.md` + `docs/specs/01-pipeline/42_chain_coa.md` (edits for centreline propagation step)
- `docs/specs/01-pipeline/47_pipeline_script_protocol.md` §A.5 (lock registry: add 63 + 64 + footnote per §5.2 exception).
- **`src/tests/pipeline-advisory-lock.infra.test.ts` (MANDATORY EDIT per F-S1 — R3 SPEC Independent CRIT-1, confidence 97):** add `'scripts/load-centreline.js': 63` AND `'scripts/enrich-centreline.js': 64` to the **hardcoded `LOCK_ID_REGISTRY` TypeScript constant**. The earlier "H-v1.3.8 safety check" wording assumed a regex-based parser of §A.5; that assumption is FACTUALLY WRONG — the test does NOT parse §A.5 at all. It uses an explicit `LOCK_ID_REGISTRY` constant and the test at line ~200 (`'registry covers every JS script in the manifest'`) WILL FAIL after `manifest.json` adds the two new scripts UNTIL `LOCK_ID_REGISTRY` is updated in the test file. This is a CI-failure-at-implementation bug; the implementing WF MUST edit this file in the same diff that adds the two scripts to `manifest.json`.
- `scripts/quality/assert-entity-tracing.js` (centreline_* fields to coverage grid)
- `scripts/manifest.json` (chain arrays updated)
- `scripts/seeds/logic_variables.json` (**[as-built ②]** 8 `load_centreline_*` keys per §12.3a — ~~5 keys~~ *(superseded, LC-D3)* — **[as-built C2, gate E]** +2: `load_centreline_round_scale`, `load_centreline_max_detail_keys`)
- `scripts/lib/units.js` (**[as-built C2]** read-only: `MS_PER_DAY` for the dataset-age WARN — Spec 124 §5 R-BA gate E closed answer #3)
- `scripts/lib/step/write.js` (**[as-built ③]** read-only here: `executeStagingReplace`, the class-C executor, INGESTOR prerequisite 0h)
- `scripts/lib/step/acquire.js` / `scripts/lib/step/staleness.js` / `scripts/lib/step/index.js` (**[as-built ③]** read-only here: shared INGESTOR runner — prerequisites 0p/0q/0r)
- `src/tests/load-centreline.{logic,infra}.test.ts`, `src/tests/enrich-centreline.{logic,infra}.test.ts`, `src/tests/db/migration-N-centreline.db.test.ts`
- `docs/runbook/source_centreline_first_deploy_validation.md` (NOT §3.7 ledger-writer spike per L21; 7-day post-deploy convergence pattern)

### Step-file notes
*Moved out of Target Files by the generated-Target-Files WF2 (2026-09-30): the step-owned files are listed by the generated block under Target Files; each note below is the annotation its bullet carried, verbatim.*
- `scripts/load-centreline.js` (**[as-built 2026-09-24, row 3.2 ②]** frozen shell, Spec 122 §5.1 — `pipeline.step(descriptor, compute)`; advisory lock 63; ~~NEW; Spec 47 R1-R12 skeleton~~ *(superseded — the R1-R12 skeleton is now library-owned, §3.1 as-built note)*)
- `scripts/load-centreline.descriptor.json` (**[as-built ②]** new — the step declared as data: write target, checks, terminals, config, deviations, limitations)
- `scripts/load-centreline.notes.json` (**[as-built ②]** new — the interpretation entries a reader walks to make sense of an audit table row)
- `scripts/lib/compute/load-centreline.js` (**[as-built ②]** new — the pure domain logic: L25 classifier, F13 column guard, drift math, dedupe, dataset-age staleness, the frozen §9 `buildLoadMeta` producer block)
- `src/tests/steps/load_centreline/violations.test.ts` (**[as-built ②]** new)
- `scripts/enrich-centreline.js` (NEW; sibling per L6; advisory lock 64)
- `src/tests/steps/load_centreline/config-literals.logic.test.ts` (**[as-built C2]** gate E literal locks)

### Out of scope

- Admin UI surface (sibling spec under `docs/specs/02-web-admin/`)
- Bitemporal `valid_from`/`valid_to` (L3 point-in-time MVP)
- Historical archive ingest (deferred)
- Address-point lookups (`BEGIN_ADDR_*` / `END_ADDR_*` columns NOT v1-ingested)
- One-way direction propagation to permits (`oneway_dir_code_desc` stored but not enriched onto parcels in v1)

### Cross-Spec Dependencies

| Spec | Dependency |
|---|---|
| Spec 43 | Chain orchestration; slug-based step placement; manifest array conventions |
| Spec 47 | §R1-R12 + §5.1 lock + §5.2 spec-number convention (§A.5 footnote exception for 63/64) + §6.4 IS DISTINCT FROM + §6.6 PostGIS pre-validation + §8.1/§8.2 audit cascade + §8.3 emitMeta + §A.5 lock registry + §B1 Loop Query Ban + §16 B5 safe-math |
| Spec 48 | §3.6 dual-pattern (§3.7 spike NOT applicable per L21) |
| Spec 58 | Pattern model — staging-CTE precedent for >2K features; reuse `geometry-validator.js` |
| Spec 59 | Pattern model — JS-side F-C1 guard precedent (L15 inherited verbatim) |
| Spec 61 | Pattern model — sibling-script (L6), `enrich-permits.js` file ownership (L28); LATERAL nearest-neighbor pattern (Spec 62 §11 doesn't use Levenshtein but inherits the LATERAL idiom) |
| Spec 41 | chain_permits edit for centreline propagation step |
| Spec 42 | chain_coa edit + CoA-to-parcels JOIN path (verify `lead_parcels` vs `permit_parcels`) |
- `scripts/load-permits.js` — referenced only for goal/context (§1 Goal); not modified by this spec.
- `scripts/load-parcels.js` — referenced only for the derived-column list (§L1) and row-level recompute scoping (§3.11 version-skip gate); not modified by this spec.
- `scripts/enrich-ravines.js` — referenced only for the 4-parcels-writer cross-WF serialization ordering (§L11); not modified by this spec.
- `scripts/enrich-heritage.js` — referenced only for chain-ordering context (`enrich_centreline` AFTER `enrich_heritage`, §L22); not modified by this spec.
- `scripts/link-parcels.js` — referenced only for the 4-parcels-writer cross-WF serialization ordering (§L11); not modified by this spec.
- `scripts/quality/assert-schema.js` (centreline CKAN URL + 40-column attribute schema check) — moved from Target Files: owned by another spec (census `owner_specs`), which now lists it in its generated block
- `scripts/quality/assert-data-bounds.js` (`toronto_centreline >= centreline_min_feature_count` lower bound; threshold from `logic_variables.json`) — moved from Target Files: owned by another spec (census `owner_specs`), which now lists it in its generated block
- `scripts/quality/assert-global-coverage.js` (`parcels.is_corner_lot` coverage threshold) — moved from Target Files: owned by another spec (census `owner_specs`), which now lists it in its generated block

---

### Out-of-Scope Files
- `scripts/enrich-parcels.js` — centreline enrichment lives in the sibling `scripts/enrich-centreline.js` instead, per the L6 sibling-script decision inherited from Spec 61 (§5 Cross-spec dependencies note).

## As-built — batch-2 row 3.2 ③ cutover (2026-09-27)

`load_centreline` converted onto Spec 122's frozen standard, COMPRESSED ①②③ form (R-PACE-1) — the INGESTOR archetype's **4th** member (`load_ravines` class B, `address_points` class A, `parcels` class A precede it) and the **FIRST write class C member** the corpus has ever exercised. Registered in `scripts/steps/_schema/converted.json` at ③ (the cutover commit — ② landed descriptor + compute + frozen shell). Descriptor: `scripts/load-centreline.descriptor.json`; compute: `scripts/lib/compute/load-centreline.js`; shell: `scripts/load-centreline.js` (the Spec 122 §5.1 frozen `pipeline.step(descriptor, compute)` form). Zero-behaviour conversion — every place the converted shape diverges from the pre-conversion behaviour is declared as a `deviations[]` entry or a `limitations[]` entry on the descriptor, never silently.

- **Write class C `staging_full_replace`** on `toronto_centreline`, key `source_id` (BIGINT), `geometry_kind: "line"`, `guard: "none"` (grandfathered — `scripts/steps/_schema/grandfathered.json` carries the entry: a whole-table replace has no per-row IS DISTINCT FROM predicate to guard on), `txn_scope: "step"`. Executor `write.js#executeStagingReplace` — ONE transaction carrying all four statements: `CREATE TEMP TABLE … (LIKE toronto_centreline INCLUDING DEFAULTS INCLUDING CONSTRAINTS)` (F-S11 — preserves UNIQUE(`source_id`) without copying the GIST index), the staged INSERT, the whole-table `DELETE`, then `INSERT … SELECT` back from the temp table; an empty carried set short-circuits **before** the DELETE (the executor's own empty-temp guard). `scripts/steps/_schema/write-class-disposition.json` class C's `declared_by` entry for `load_centreline` now carries the note "C exercised by a converted INGESTOR" — the class is no longer proven only by the enum port (Spec 124 §9's INGESTOR caveat retired for class C).
- **Acquisition via the INGESTOR runner** (`runIngestPhase`, `scripts/lib/step/acquire.js`): tier-1 HEAD validators (`Last-Modified` + `ETag`) and tier-2 content hash drive the skip; a tier-1/tier-2 match ends at a `skipped_source_validator`-class terminal (`status: completed`, the prior `centreline_load` block re-emitted). Download retries come from config (INGESTOR prerequisite **0q** — `network.retries_from_config` + `retry_backoff_from_config`), the HEAD-error posture is the declared `on_head_error: "warn_row"` (prerequisite **0r** — one WARN row, then proceed to download, never halt on a failed HEAD), and the shapeRecord reason tallies (`centreline_bad_centreline_id_count`, `centreline_null_geometry_count`, unknown-code / unknown-jurisdiction counts) are the declared successors of the legacy conditional pushes (prerequisite **0p**, the ravines Fold D precedent: every declared check also emits PASS at 0).
- **8 logic variables** (`config.logic_variables` on the descriptor, seeded in `scripts/seeds/logic_variables.json`): `load_centreline_dataset_age_warn_days`, `load_centreline_count_drift_fail_pct`, `load_centreline_invalid_geometry_fail_pct`, `load_centreline_download_timeout_ms`, `load_centreline_download_retries`, `load_centreline_download_retry_backoff_ms`, `load_centreline_round_scale`, `load_centreline_max_detail_keys`. All eight are `on_invalid: "fail"` (the six former `clamp` rows flipped at ③ per gate B closed answer #1; `config.js` already throws on a missing seed row, LM-D15, so only out-of-range VALUE handling changed). `MS_PER_DAY` is read from `scripts/lib/units.js` for the dataset-age WARN (Spec 124 §5 R-BA gate E closed answer #3). The F-C1 bound is an **emptiness invariant** (carried rows == 0) and is NEVER `sources_centreline_floor` — that floor is owned by `assert_data_bounds`, not this loader (the legacy fired F-C1 only at 0).
- **`checks[]`: 20 declared checks.** The FAIL / `pre_write` ones are `centreline_count_drift_pct` (L7 count-delta, FAIL, scored `when: "pre_write"` so a trip skips the write before the DELETE opens a transaction; `blocking: false` — the FAIL row exits 0 as today, PIN/DO-NOT-FIX), `centreline_geometry_skipped_pct` (L8 abort-before-write at >5% unrepairable geometry, `pre_write`, FAIL) and `f_c1_empty_temp_guard_fired_first_run` (the F-C1 first-run-empty FAIL arm, `pre_write`). The standing WARN is **LC-D13** — `centreline_dataset_age_days` against the 7-day `load_centreline_dataset_age_warn_days` bound: a daily-published source whose age can legitimately exceed 7 days reads as a standing WARN (R-H), never as a conversion defect.
- **Overrides:** `CENTRELINE_ACCEPT_FEATURE_COUNT_DRIFT` → `override.accept_anomaly` (LC-D7 — enables execution on a drift-flagged run, the FAIL row is STILL recorded on `centreline_count_drift_pct`, never suppressed — operator ruling A-5); `CENTRELINE_FORCE_RELOAD` → `override.force_run` (an ADDITIVE seat introduced at ② — absent from the legacy, `load_ravines`' `RAVINE_FORCE_RELOAD` precedent — declared as a deviation); `CENTRELINE_LOCAL_ZIP` **retired** (LC-D6/LC-D11 — an `R-AZ`-class local-file acquisition override; the fixture tier replaces it).
- **Producer contract `records_meta.centreline_load`** (spec_version `"1.1"`, **18 keys**, §9 frozen block) — the consumer `enrich_centreline` is now registered in `scripts/steps/_schema/consumer-registry.json` (gate D) as the reader of `load_centreline`'s `emits[].key`.
- **Defect ledger — disposition copied VERBATIM from the Ledger-status column of `docs/reports/2026-09-24-batch2-p3-2-load-centreline-assessment.md` §5.1** (never re-judged here; Spec 124 §5 R-BA gate I `DEFECT-ID-UNIQUENESS` requires the status cells to agree byte-for-byte):
  - **LC-D1** — Spec 62's L7b/L7c wording differed from the code; **Spec 62 corrected to the code at ②** (Q1, AP-D1 precedent), the two-arm FAIL filed as a separate feature. Ledger status: **OPEN · PIN** (carried, Spec 123 §3.1).
  - **LC-D2** — Spec 62's duplicate-id treatment differed from the code (the loader WARNs + `dedupeBySourceId` keeps the first); **Spec 62 corrected to the code at ②** (Q1), a dup-id FAIL filed as a separate feature. Ledger status: **OPEN · PIN** (carried, Spec 123 §3.1).
  - **LC-D3** — none of the row's proposed config keys were seeded then; every `*_from_config` seat resolved to its descriptor literal fallback. **PIN — carried**; seeds land at ②. Ledger status: **OPEN · PIN** (carried, Spec 123 §3.1).
  - **LC-D4** — no `staleness.on_prior_run_error` declaration existed in the corpus for this shape. **PIN — carried**; descriptor declares `staleness.on_prior_run_error:"warn_row"` (flips at ④a). Ledger status: **OPEN · PIN** (carried, Spec 123 §3.1).
  - **LC-D5** — no `recovery.interrupted` declaration existed for a class-C step. **PIN — carried**; descriptor declares `recovery.interrupted:"force_full_on_next_run"` (flips at ④b). Ledger status: **OPEN · PIN** (carried, Spec 123 §3.1).
  - **LC-D6** — `CENTRELINE_LOCAL_ZIP` retired by conversion. Ledger status: **CLOSED · declared deviation at ②**.
  - **LC-D7** — `CENTRELINE_ACCEPT_FEATURE_COUNT_DRIFT` carried as `override.accept_anomaly`. Ledger status: **CLOSED · declared deviation at ② (`override.accept_anomaly`)**.
  - **LC-D8** — single-member `MultiLineString` residue reachable; declared INFO/WARN check over the runner counter `geometry_collection_extracted` + PIN (Q2 — no library option exists). Ledger status: **OPEN · PIN** (carried, Spec 123 §3.1; Q2).
  - **LC-D9** — the converted runner's key-drop terminal differs from legacy (a renamed `CENTREL2` ends at L7/F-C1 `fail_check`, not `centreline_acquisition_error`); declared limitation at ②. Ledger status: **OPEN · PIN** (carried, Spec 123 §3.1).
  - **LC-D10** — F13 does not fire on the key path and `shapeRecord` sees only surviving features (the library seam, not a step defect). Ledger status: **OPEN · PIN** (carried, Spec 123 §3.1; Q2 family).
  - **LC-D11** — `CENTRELINE_LOCAL_ZIP` local-override path — the ledger's own anchor row for the retired override (LC-D6 is the disposition). Ledger status: **CLOSED · declared deviation at ②**.
  - **LC-D12** — `VALIDATION_CHUNK = 5000` — the whole 47K-row validation now runs in ONE library call, not 5000-row batches; declared limitation, measured at ②. Ledger status: **CLOSED · declared deviation at ②**.
  - **LC-D13** — the standing `centreline_dataset_age_days` INFO/WARN row against the 7-day threshold; preserved, never suppressed (R-H). Ledger status: **OPEN · PIN** (standing WARN, R-H).
  - **LC-D14 (④b)**, **LC-D16**, **LC-D18** are named in the descriptor's `limitations[]`: LC-D14 is the F-C1 WARN-preserve path pinning `features_inserted: 0` (flips at ④b); LC-D16 is corrected at c2e with NO divergence (a standalone run reads the SAME `sources:load_centreline` ledger name as an in-chain run — `ledgerPipelineName` falls back to the declared invocation chain); LC-D18 is the library terminal-selection gap (a genuine full load whose only WARNs are the two standing checks is mislabelled `loaded_preserved_empty_guard` — observability-only, no correctness impact — filed as a Spec 124 §7 rung (d) library prerequisite).
- **Operator rulings (2026-09-24, from assessment §5.1):** **Q1** — the spec is corrected to the CODE (LC-D1/LC-D2; the L7b/L7c/dup-id FAIL variance is filed as a separate feature, never folded into a zero-diff conversion). **Q2** — LC-D8 is a declared INFO/WARN check over the runner counter `geometry_collection_extracted` **plus a PIN** (no library option exists to do more). **Q3/0q** — `load_centreline_download_retries`/`_backoff_ms` are the NEW INGESTOR prerequisite-0q knobs (2 retries + 1 first attempt = the legacy 3 attempts, byte-equal; backoff 0 = the legacy's immediate re-attempt), closing the POST-B1-8 item.
- **Goldens** `docs/reports/golden/load_centreline/{pre,post}/`: `records_new` **47,320** on BOTH sides (and `features_inserted` = `features_deleted` = 47,320 on the as-built-C2 POST recapture). The full PRE↔POST comparison (byte-identical `table_state`/`invariants`/`verdict`/`records_total`/`records_new`/`records_updated`; the 18 `centreline_load` keys byte-identical except `features_deleted`'s documented inter-run coupling; the additive declared-check PASS rows and library-derived keys) is explained in the assessment §9.

## As-built — batch-2 row 3.10 ② enrich_centreline conversion (2026-10-01)

`enrich_centreline` converted onto Spec 122's frozen standard, COMPRESSED ①②③ form (R-PACE-1) — the ENRICHER archetype's
**4th** member (`enrich_parcels`, `enrich_ravines`, `enrich_heritage` precede it). Commit ② lands the code; captures and
the ③ cutover (`converted.json` registration) follow. Assessment: `docs/reports/2026-09-30-batch2-p3-10-enrich-centreline-assessment.md`.

- **Files.** `scripts/enrich-centreline.js` is the 7-statement frozen `pipeline.step()` shell (lock 64 kept as a source-text
  constant); `scripts/enrich-centreline.descriptor.json`; `scripts/enrich-centreline.notes.json`; `scripts/lib/compute/enrich-centreline.js`.
- **Write class N `set_based_join_update`** on `parcels`, 5 columns (`is_corner_lot`, `is_through_lot`,
  `primary_frontage_street_name`, `abuts_laneway`, `centreline_dataset_version_when_enriched`) behind the verbatim 5-disjunct
  `IS DISTINCT FROM` guard, `retract: "none"` (EC-D4 carried), executed through `ctx.joinUpdate` in ONE shared transaction.
- **§3.11 version-skip gate PORTED VERBATIM** (plan D1 = (a)): the `contract_read` hook `readCentrelineContract` keeps the four
  §9 HALTs and resolves `{sourceDatasetVersion, lastVersion, staleCount, mode}` with the legacy SQL in the legacy order; the
  pass runs the unscoped build (full), DROP + the stale-scoped build (incremental) or nothing (skip); `mode = ctx.full ? 'full' :
  contract.mode`, so `ENRICH_CENTRELINE_FORCE_FULL` and an interrupted prior run are full. One SQL builder replaces the
  `.replace()` surgery (EC-D7 / LC-4); at the seeded defaults its output is byte-equal to the legacy strings.
- **§11 numbers are logic variables** (19, all `on_invalid: "fail"`): `enrich_centreline_{unlinked_warn_pct 10,
  unlinked_fail_pct 40, name_coverage_warn_min_pct 90, intersection_null_warn_pct 50, address_null_warn_pct 10, proximity_m 20,
  abut_m 13, through_opposite_tol_deg 45, pair_cap 20, parallel_tol_deg 15, azimuth_sample_m 10, round_scale 10,
  heartbeat_minutes 5, lock_timeout_ms 1800000, phase_timeout_minutes 240}` + the D4 plausibility bounds
  `enrich_centreline_{corner,through}_share_plausible_{min,max}_pct` (8/14, 0.2/3). This supersedes §12.3a's never-seeded
  `centreline_unlinked_parcel_{warn,fail}_pct` / `centreline_parallel_azimuth_threshold_degrees` (EC-D8).
- **Audit table.** 19 checks serve every mode; full-only diagnostics are reported not-measured (INFO) on a reduced run
  (EC-D1 carried, ④a). L21 is `pct <= unlinked_warn` / warn `pct <= unlinked_fail`, severity FAIL — exactly 10.0 / 40.0 read
  one tier lower than the legacy `>=` (EC-D11, declared). One WARN invariant (corner ∨ through ⇒ frontage) and four WARN
  plausibility rows (corner / through share bands). Audit `phase` stays 64.
- **`records_meta.centreline_enrich`** is emitted mode-shaped exactly as before (full 15 keys / reduced 7 keys), plus the
  runner's `duration_ms` and `code_version`. Counters: `records_total` = the population the mode scanned, `records_new` = 0,
  `records_updated` = the join UPDATE's rowCount (the legacy emitted null/null/rowCount — explained diff).
- **Defect ledger** (`docs/reports/defect-ledger.md`): EC-D1 · EC-D2 · EC-D3 · EC-D4 · EC-D5 · EC-D9 carried (PIN); EC-D6 and
  EC-D11 declared deviations; EC-D7 retired by the builder; EC-D8 corrected in THIS spec (§2 additions, §3.11 cadence + the
  closed externalization note, §8h variable names, §9 keys, §11 5th disjunct, §12.2); **EC-D10** (the producer read sees only
  the chain-prefixed `completed` row) ported verbatim and PINNED as a known defect by operator ruling 2026-09-30 — its fix
  belongs to the descriptor-truth programme.

## As-built — batch-2 row 3.10 ③ enrich_centreline cutover (2026-10-04)

`[as-built 2026-10-04, row 3.10 ③]` CUTOVER (`npm run cutover -- --step=enrich_centreline`): `scripts/enrich-centreline.js` is
registered in `scripts/steps/_schema/converted.json` (26th converted step; its `pending[]` entry deleted in the same commit,
leaving `pending[]` empty) and the census row is RETAINED with `status: converted`, `converted_at: commit-3`, `batch: "pending"`
kept verbatim (Spec 124 R-K, R-AO). Archetype count corrected: it is the **6th** converted ENRICHER (census:
`enrich_parcels`, `geocode_permits`, `enrich_ravines`, `enrich_heritage`, `compute_parcel_cost_estimates` precede it) — the ②
section's "4th" counted only the parcel-enrichment siblings.

- **Seams live.** `inputs.reads.steps` declares `{step:"load_centreline", version_pin:"exact"}` and
  `{step:"parcels", version_pin:"gte"}`; both pairs are now converted-to-converted.
- **Consumer registry (gate D)** gains the generated producer rows for this step's emits: `enrich_centreline → enrich_centreline`
  (`records_meta centreline_enrich`, self-read by the §3.11 version-skip gate) and `enrich_centreline → src/lib/admin/funnel.ts`,
  `→ src/components/FreshnessTimeline.tsx` (`records_meta duration_ms`).
- **assert_schema probe lists** gain the 19 `enrich_centreline_*` logic variables (probe_presence +
  `declared_logic_variables_present.expect`), so the assert_schema POST goldens are recaptured with this commit.
- **`step_timeout` stays declared-not-wired.** The descriptor declares `execution.step_timeout "240m"` (plan D3);
  `manifest.scripts.enrich_centreline` carries no `step_timeout_minutes`, so the slug stays in
  `execution-budget-disposition.json` `step_timeout.pending` until a cloud run measures the step (Spec 124 R-AQ).
- **Programme item LC-4** (generated SQL, no string surgery) → BUILT: the one builder in
  `scripts/lib/compute/enrich-centreline.js` replaced the `.replace()` scoping (EC-D7).

## 6. License & Attribution

Toronto Open Data Licence v1.0 — attribution required. Citation: "Contains information licensed under the Open Government Licence — Toronto." Source: City of Toronto Geomatics Group.

---

## 7. Discovery report cross-reference

Phase 0 report at `docs/reports/wf1-spec62-architecture-discovery.md`. Resolved all 12 Q0.x questions (Q0.1-Q0.12). Key findings: 64,433 LineString features (~47K post-filter); EPSG:4326 native; CENTRELINE_ID stable upsert key; daily refresh cadence; bundled 40-column data dictionary; lock IDs 63/64 (the original 65/66 discovery-time guess later collided with enrich-parcels/enrich-permits — re-derived per Spec 47 §A.5).

---

## 8. Implementation plan (3-WF sequence; deferred)

### 8a — 3-WF sequence

See §1 diagram.

### 8b — WF1 (this spec) deliverables

**Zero code deliverables.** Spec only.

### 8c — Implemented: `load-centreline.js` + M-1 + chain edit

Detailed step-by-step recipe in **§12.1 + §12.3 + §12.4**.

### 8d — Implemented: `enrich-centreline.js` + M-2 + chain edit

Detailed recipe in **§12.2 + §12.3 + §12.4**.

### 8e — Implemented: `enrich-permits.js` centreline step + M-3

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
> **First-deploy convergence (per L21 — NOT §3.7 ledger-writer spike):** L21 thresholds (10% WARN / 40% FAIL on `parcels_with_zero_centreline_intersections`) are provisional. After first prod deploy, the chain producer runs daily for 7 consecutive days; if the metric stabilizes within ±2pp band, thresholds are confirmed. If wider variance, operator adjusts `enrich_centreline_unlinked_warn_pct` / `enrich_centreline_unlinked_fail_pct` in `logic_variables.json` (**[as-built ②, EC-D8]** — the `centreline_unlinked_parcel_*` names were never seeded).

---

## 9. Producer/Consumer Contract (frozen at spec_version 1.1)

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
    "source_dataset_version":                             "<producer version>",
    "mode":                                               "full",
    "parcels_updated":                                     0,
    "parcels_with_zero_centreline_intersections_count":    0,
    "parcels_with_zero_centreline_intersections_pct":      0.0,
    "parcels_is_corner_lot_true_count":                    0,
    "parcels_is_through_lot_true_count":                   0,
    "parcels_abuts_laneway_true_count":                    0,
    "parcels_primary_frontage_resolved_count":             0,
    "parcels_frontage_priority1_name_match_count":         0,
    "parcels_frontage_priority2_addrrange_match_count":    0,
    "parcels_frontage_priority3_nearest_segment_count":    0,
    "parcels_truncated_pair_count":                        0,
    "completed_at":                                        "<ISO timestamp>"
  }
}
```

**[as-built ②, EC-D8]** The block above is the FULL-mode shape (15 keys). An `incremental` or `skip` run emits the reduced shape `{spec_version, source_dataset_version, mode, skip_reason, parcels_recomputed, parcels_updated, completed_at}`; `source_dataset_version` is in BOTH (the version-skip gate reads it next run).

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

**[as-built 2026-09-24, row 3.2 ②]** `pipeline='source-centreline'` below is doc-rot:
the as-built ledger name is `sources:load_centreline` when running in-chain (the
`load_centreline` slug, `Spec 122 §4.1`) and — measured at c2e, LC-D16 corrected —
the SAME `sources:load_centreline` for a standalone run too (`ledgerPipelineName`
falls back to the declared `execution.invocation` chain even when `chainId` is
null, so there is no un-prefixed `load_centreline`-only ledger row to read).

1. `SELECT records_meta FROM pipeline_runs WHERE pipeline='source-centreline' AND status='completed' ORDER BY completed_at DESC LIMIT 1` — FAIL if no prior run *(superseded name; as-built: `pipeline='sources:load_centreline'`)*
2. `records_meta.centreline_load.spec_version` — FAIL if != "1.1"
3. `records_meta.centreline_load.features_inserted > 0` — FAIL if zero (no rows ingested means no data to enrich against)
4. `SELECT COUNT(*) FROM toronto_centreline > 0` — FAIL (data inconsistency from external truncation)
5. Read `source_dataset_version` and propagate into parcels for traceback

---

## 10. Cross-WF Tracing Convention

```
[Admin UI permit detail]                       shows "Corner Lot: Yes; Frontage: Daisy Ave; source v2026-05-25"
       ↓
[permits.is_corner_lot + is_through_lot + primary_frontage_street_name]
       ↓   written by enrich-permits.js centreline step (lock 66 inherits)
       ↓   propagated per L12: bool_or for booleans; permit-level NOT; smallest par.id tie-break
[parcels.is_corner_lot + is_through_lot + primary_frontage_street_name]
       ↓   written by enrich-centreline.js (lock 64)
       ↓   computed per §11 8-CTE chain (cross-product side + cosine parallel + NULL-safe nodes + base-name compare)
[toronto_centreline row]
       ↓   written by load-centreline.js (lock 63)
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
       abuts_laneway                = pe.new_abuts_laneway,   -- [as-built ②] #431-FU2 / Spec 65 Phase 3
       centreline_dataset_version_when_enriched = $1   -- §8d lineage stamp = producer source_dataset_version (§9 step-5)
  FROM parcel_enrichment pe
 WHERE p.id = pe.parcel_id
   AND (p.is_corner_lot                IS DISTINCT FROM pe.new_is_corner_lot
        OR p.is_through_lot            IS DISTINCT FROM pe.new_is_through_lot
        OR p.primary_frontage_street_name IS DISTINCT FROM pe.new_primary_frontage_street_name
        OR p.abuts_laneway             IS DISTINCT FROM pe.new_abuts_laneway   -- [as-built ②] 5th disjunct (EC-D8)
        OR p.centreline_dataset_version_when_enriched IS DISTINCT FROM $1);
```

### 11.0 Known Failure Modes (live validation, 2026-06-09)

- **Containment→proximity (FIXED, WF2).** The original §11 `JOIN ... ON ST_Intersects(p.geom, c.geom)` was geometrically wrong: street centerlines run down the middle of the road allowance, **~10 m off the lot polygons**, so the live §8d enrich matched only **255 / 486,530 parcels (0.05%)**. Corrected to a **20 m geography proximity** join (`ST_DWithin(p.geom::geography, c.geom::geography, 20)`, backed by `idx_toronto_centreline_geog_gist`, migration 175). Distance probe (1000 parcels): p50 9.9 m, p90 12.9 m, 97.1% within 20 m. Re-validated live: zero-intersection 99.95%→**3.0%**, **471,869 parcels enriched** (97%), frontage resolved 97% (P1 name 91%), 8.1 min. Frontage P3 changed from longest-intersection (always 0 under proximity) to **nearest segment**; corner/through pairs now require both base names NOT NULL (an unnamed laneway within radius is not "a different street").
- **Corner/through OVER-DETECTION (FIXED, WF3 #431).** The proximity model inflated the two booleans (live `is_corner_lot` **24%**, `is_through_lot` **16.7%** vs typical ~13% / <5%) because the 20 m radius reaches streets the parcel does not *abut*. A first attempt (corner node-proximity ≤18 m) only reached 17.8% — an adjacent lot still **shares** the intersection node. Corrected to an **"abuts BOTH streets" model**: corner = different-named streets that share a node **AND** the parcel is within `CENTRELINE_ABUT_M`=13 m of **both**; through = different-named **parallel, OPPOSITE-side** streets (interior-point `ST_PointOnSurface` azimuths, degenerate-guarded) **AND** abuts both. Re-validated live (2026-06-09): `is_corner_lot` 24%→**14.8%** (71,945), `is_through_lot` 16.7%→**11.3%** (54,873); frontage unchanged (P1 91%); ~11.4 min. Diagnostics: `scripts/analysis/wf3-centreline-postfix-diagnostic.js` (abut-distance distributions) + `wf3-through-sample.js`. Locked by `migration-174-centreline-enrich.db.test.ts` (CE-CORNER-ADJ / CE-ARTERIAL / CE-THRU / CE-THRU-SAME / CE-THRU-L) + the infra string contracts.
- **Laneways counted as a "street" (FIXED, WF3 #431-FU).** The abut-both model still counted NAMED laneways (e.g. "Ln W Abraham Welsh…") as a second frontage — a street + rear-lane lot is a *normal* lot (most downtown lots back onto a named lane), not a corner/through lot. Excluded `LOWER(feature_code_desc) = 'laneway'` (4,146 segments) from BOTH the corner and through pair populations (extends the WF2 *unnamed*-name guard to *named* lanes). Re-validated live: `is_through_lot` 11.3%→**0.98%** (4,764), `is_corner_lot` 14.8%→**11.2%** (54,478); frontage unchanged. Laneways remain loaded + valid for **frontage** resolution (P3) — a lane is a frontage fallback but not a corner/through "street." Locked by `CE-LANE-NAMED-CORNER` / `CE-LANE-THRU` fixtures + infra contract. Diagnostics: `scripts/analysis/wf3-laneway-scope.js`. **~~Deferred~~ DONE (#431-FU2, 2026-06-23, Spec 65 §7 AF-1):** `enrich-centreline.js` persists `parcels.abuts_laneway` = `bool_or(seg_is_lane)` (the SAME flag reused — the corner/through `NOT c1_is_lane AND NOT c2_is_lane` guards are byte-unchanged, regression-locked), propagated via `CENTRELINE_COLS`; gates laneway-suite eligibility in the max-build pass. Frontage P3 can still name a lane (#431-FU3, open).
- **`is_corner_lot` GROUND-TRUTH VALIDATION (2026-06-09).** Two independent cross-checks confirm 11.2% is correct, not just plausible. (1) *Aggregate:* 19,609 real street intersections (≥3 non-lane street-ends, ≥2 distinct names; 5,397 four-way+) ⇒ **2.78 corner lots per intersection** — inside the 4-way+T geometric ceiling (~13%). The old 24% implied 5.9/intersection, geometrically impossible. (2) *Per-parcel spot-check* (random 60: 30 flagged + 30 mid-block, verified by intersection-node distance + actual street-crossing point): mid-block **30/30 correct (0 false negatives)**; corner-flagged **29–30/30 genuine** (26 textbook + 4 confirmed at wider real intersections via the junction test; 1 borderline corner-adjacent). **Precision ≈97–100%, recall 100% in-sample.** Residual ~3%: the 13 m abut cap can occasionally reach the lot one-in from the corner at wide intersections. Scripts: `scripts/analysis/wf3-corner-{sanity,groundtruth,suspects}.js`.

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

- Spec 47 R1-R12 skeleton; `ADVISORY_LOCK_ID = 63`; slug = `source-centreline`
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

- Spec 47 R1-R12 skeleton; `ADVISORY_LOCK_ID = 64`
- L23 3-tier startup guard
- Single UPDATE per §11 (9-CTE chain after F-S7 added `parcel_segments_capped`)
- IS DISTINCT FROM guard on UPDATE WHERE (per L11)
- ~~Export `applyCentrelineEnrichment(client, RUN_AT)` self-contained function for `enrich-permits.js` reuse~~ **[as-built ②, EC-D8]** never built: enrich-permits propagates from the parcel columns (§11.1); the converted step exports the compute module (`scripts/lib/compute/enrich-centreline.js`)
- **F-S12:** single `pipeline.emitSummary` call at success-path end (Spec 47 §R10); MUST emit `records_meta.centreline_enrich` frozen block per §9 (enables `enrich-permits.js` L24 step (b) to verify successful enrich run, not just column existence)
- ~~**F-S9:** use `validateConfig(logicVars)` wrapper with `safeParse` per Spec 47 §4.2 (NOT `ConfigSchema.parse()`)~~ **[as-built ②, EC-D8]** never built in the legacy (every number was a literal); the converted step's 19 `enrich_centreline_*` variables are validated by the runner (`scripts/lib/step/config.js`, `on_invalid: "fail"`)

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

**[as-built 2026-09-24, row 3.2 ②] LC-D3 — corrected to the six REAL seeded names.**
None of the five keys in the table below (superseded, kept for record) was ever
seeded under these names — `centrelineMinFeatureCount` was never read by the loader
at all (MEASURED grep, zero call sites) and is KNOWINGLY RETIRED, not renamed: the
floor it would have carried already lives in `sources_centreline_floor`
(`assert-data-bounds.js`). `centrelineSkipCheckThresholdDays` is renamed
`load_centreline_dataset_age_warn_days` (same 7-day default). The as-built loader's
eight knobs, all registered `logic_variables[]` under `scripts/load-centreline.descriptor.json`
`config.logic_variables` and seeded in `scripts/seeds/logic_variables.json`:

```json
{
  "load_centreline_dataset_age_warn_days":       7,
  "load_centreline_count_drift_fail_pct":        0.5,
  "load_centreline_invalid_geometry_fail_pct":   0.05,
  "load_centreline_download_timeout_ms":         600000,
  "load_centreline_download_retries":            2,
  "load_centreline_download_retry_backoff_ms":   0,
  "load_centreline_round_scale":                 1000,
  "load_centreline_max_detail_keys":             50
}
```

**[as-built C2, gate E]** The two additions above are both verdict-neutral DISPLAY
knobs, yet still `on_invalid: fail` (gate B closed answer #1, ③ 2026-09-27 — an out-of-range admin value halts):
`load_centreline_round_scale` (default 1000, min 1, max 100000) sets the display
rounding of the drift/geometry-skipped ratio `detail`, and
`load_centreline_max_detail_keys` (default 50, min 1, max 1000) caps the
dropped-source-id list in the geometry-skipped row (LC-D15, ravines LR-D1) — the
pass/fail decision still reads the FULL skipped count, never the truncated list.

`load_centreline_download_retries`/`_backoff_ms` are NEW knobs (0q, INGESTOR
prerequisite): the legacy loader retried downloads 3 times with no configurable
backoff (`attempts = 3`, load-centreline.js:307) — 2 retries + 1 first attempt = 3,
byte-equal; backoff defaults to 0 (immediate retry), matching the legacy's own
unconditional immediate re-attempt.

~~```json
{
  "centreline_min_feature_count":                40000,
  "centreline_unlinked_parcel_warn_pct":         10,
  "centreline_unlinked_parcel_fail_pct":         40,
  "centreline_parallel_azimuth_threshold_degrees": 15,
  "centreline_skip_check_threshold_days":        7
}
```~~ *(superseded — none of these five names was ever seeded; see LC-D3 above. The
three `centreline_unlinked_parcel_{warn,fail}_pct` / `centreline_parallel_azimuth_threshold_degrees`
keys belong to the ENRICH-side step (`enrich-centreline.js` §11), not load_centreline
— MEASURED `grep scripts/seeds/logic_variables.json`: still unseeded under any name
as of 2026-09-24; out of scope for this conversion, which touches only the loader.)*

(`centreline_address_levenshtein_threshold` REMOVED per H-v1.3.6 — Spec 62 doesn't use Levenshtein.)

### §12.4 Spec 43 + 41 + 42 chain edits + §A.5 registry update

- **`chain_sources` (Spec 43):** `load_centreline` AFTER `load_parcels` slug; `enrich_centreline` AFTER `enrich_heritage` slug (or AFTER the latest existing enrich-* if 58/59/61 partial implementation per L22 contingency table)
- **`chain_permits` (Spec 41):** `applyCentrelineEnrichment` appended to existing `enrich-permits.js` (L28 ownership)
- **`chain_coa` (Spec 42):** symmetric for CoA
- **`manifest.json`:** 3 chain arrays updated with `source-centreline` + `enrich-centreline` slugs
- **Spec 47 §A.5 registry update (per F-S1 corrected text):**
  - Add 2 table rows: lock 63 (`load-centreline.js`) + lock 64 (`enrich-centreline.js`)
  - **Footnote immediately below the rows:** "Spec 62 uses lock IDs 63 + 64 instead of natural §5.2 ID 62 because 62 is occupied by enrich-heritage and the original 65/66 guess collides with enrich-parcels/enrich-permits. Per §5.2 next-free-gap exception, 63/64 are used. The `pipeline-advisory-lock.infra.test.ts` `LOCK_ID_REGISTRY` hardcoded constant MUST also be updated with the same two entries — see §5 Target Files (this is NOT optional; the registry-coverage test will fail without this edit)."

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
