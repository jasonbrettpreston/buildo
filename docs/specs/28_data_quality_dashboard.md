# Spec 28 -- Data Quality Dashboard

**Status:** Implemented
**Last Updated:** 2026-03-03
**Depends On:** `01_database_schema.md`, `04_sync_scheduler.md`, `08_trade_classification.md`, `11_builder_enrichment.md`, `12_coa_integration.md`, `26_admin.md`, `27_neighbourhood_profiles.md`
**Blocks:** None

---

## 1. User Story

> "As an admin, I want a Data Effectiveness Dashboard that shows how complete, accurate, and fresh our matched data is across all six matching processes — so I can identify coverage gaps and prioritise enrichment work."

**Acceptance Criteria:**
- Dashboard at `/admin/data-quality` accessible from admin nav
- Single composite Data Effectiveness Score (0-100) with colour-coded gauge
- Six coverage cards showing match rates for: trade classification, builder enrichment, parcel linking, neighbourhood coverage, geocoding, CoA linking
- Confidence distribution histograms for trade and CoA matching
- Data freshness timeline showing per-source staleness
- "Refresh Metrics" button to capture a snapshot on demand
- Snapshots persist daily for 30-day trend tracking
- Snapshot capture runs automatically after each daily sync

---

## 2. Technical Logic

### 2.1 Six Matching Processes Measured

| # | Process | Linking Method | Confidence Stored? |
|---|---------|---------------|-------------------|
| 1 | Trade Classification | 2-tier rules engine (Tier 1 permit rules + Tier 2 tag matrix with 58 keys + 16 aliases + work-field fallback) → `permit_trades`, split by residential vs commercial/mixed-use | Yes (0.0–1.0) |
| 2 | Builder Matching | Name normalization → `builders.name_normalized` | No (binary) |
| 3 | Parcel Linking | Address match → `permit_parcels` | Yes (0.60 / 0.95) |
| 4 | Neighbourhood Linking | Point-in-polygon → `permits.neighbourhood_id` | No (binary) |
| 5 | Geocoding | Google API → `permits.latitude/longitude` | No (binary) |
| 6 | CoA Linking | 3-strategy fallback → `coa_applications.linked_permit_num` | Yes (0.30–0.95) |

### 2.2 Snapshot Table

A daily snapshot table records all matching metrics for trend analysis. One row per day, upserted via `ON CONFLICT (snapshot_date) DO UPDATE`.

**Table:** `data_quality_snapshots` (Migration 015)

| Column Group | Columns |
|-------------|---------|
| Universe | `total_permits`, `active_permits` (status IN Issued, Under Review, Under Inspection) |
| Trade | `permits_with_trades`, `trade_matches_total`, `trade_avg_confidence`, `trade_tier1_count`, `trade_tier2_count`, `trade_tier3_count` |
| Builder | `permits_with_builder`, `builders_total`, `builders_enriched`, `builders_with_phone`, `builders_with_email`, `builders_with_website`, `builders_with_google`, `builders_with_wsib` |
| Parcel | `permits_with_parcel`, `parcel_exact_matches`, `parcel_name_matches`, `parcel_avg_confidence` |
| Neighbourhood | `permits_with_neighbourhood` |
| Geocoding | `permits_geocoded` |
| CoA | `coa_total`, `coa_linked`, `coa_avg_confidence`, `coa_high_confidence` (>=0.80), `coa_low_confidence` (<0.50) |
| Freshness | `permits_updated_24h`, `permits_updated_7d`, `permits_updated_30d`, `last_sync_at`, `last_sync_status` |

### 2.3 Data Effectiveness Score

Composite weighted average of six coverage percentages, clamped to 0–100:

| Metric | Weight | Calculation |
|--------|--------|-------------|
| Trade Coverage | 25% | `permits_with_trades / active_permits × 100` |
| Builder Enrichment | 20% | `builders_enriched / builders_total × 100` |
| Parcel Linking | 15% | `permits_with_parcel / active_permits × 100` |
| Neighbourhood Coverage | 15% | `permits_with_neighbourhood / active_permits × 100` |
| Geocoding | 15% | `permits_geocoded / active_permits × 100` |
| CoA Linking | 10% | `coa_linked / coa_total × 100` |

**Colour thresholds:** Green >= 80, Yellow 60-79, Orange 40-59, Red < 40.

**Edge cases:**
- `active_permits = 0` → score is `null` (N/A)
- `builders_total = 0` → builder enrichment contributes 0%
- `coa_total = 0` → CoA linking contributes 0%

### 2.4 Snapshot Capture

`captureDataQualitySnapshot()` runs 9 counting queries in parallel against the live database, then upserts one row into `data_quality_snapshots` for today's date.

**Counting queries:**
1. Permit counts: `COUNT(*)` total, `COUNT(*) FILTER (WHERE status IN (...))` active
2. Trade counts: `COUNT(DISTINCT (permit_num, revision_num))` from `permit_trades WHERE is_active = true`, plus `AVG(confidence)` and per-tier counts
3. Builder counts: `COUNT(*) FILTER (WHERE enriched_at IS NOT NULL)`, plus phone/email/website/google/wsib sub-counts
4. Permits with builder: `COUNT(*) FROM permits WHERE builder_name IS NOT NULL`
5. Parcel counts: `COUNT(DISTINCT (permit_num, revision_num))` from `permit_parcels`, exact vs name-only split
6. Neighbourhood count: `COUNT(*) FROM permits WHERE neighbourhood_id IS NOT NULL`
7. Geocoding count: `COUNT(*) FROM permits WHERE latitude IS NOT NULL AND longitude IS NOT NULL`
8. CoA counts: total, linked, avg confidence, high/low confidence splits
9. Freshness counts: last 24h / 7d / 30d based on `last_seen_at`
10. Last sync: latest `sync_runs` row for timestamp and status

**Trigger points:**
- Automatically after daily sync completes (Cloud Function `syncProcess`, non-fatal on error)
- Manually via `POST /api/quality/refresh`

### 2.5 API Endpoints

**`GET /api/quality`** — Returns latest snapshot + last 30 days of trends.

```typescript
{
  current: DataQualitySnapshot | null,
  trends: DataQualitySnapshot[],       // ordered by snapshot_date DESC, max 30
  lastUpdated: string | null            // ISO timestamp of latest snapshot
}
```

**`POST /api/quality/refresh`** — Triggers `captureDataQualitySnapshot()` on demand. Returns the captured snapshot.

```typescript
{
  snapshot: DataQualitySnapshot
}
```

### 2.6 Dashboard Layout — Hub-and-Spoke Data Source Diagram

**Section 1 — Data Source Relationships (circle diagram)**
Hub-and-spoke layout showing Building Permits as the central data source with SVG connector lines fanning out to dependent/enrichment sources. Each source is rendered as a `DataSourceCircle` with:
- Progress ring (SVG) showing accuracy %, colour-coded (green >= 80%, yellow >= 60%, red < 60%)
- Count / total, optional avg confidence
- Tier/detail breakdown rows
- Last updated timestamp, next scheduled run date
- "Update Now" button triggering `POST /api/admin/pipelines/{slug}`
- Relationship label on connector (e.g. "links to", "enriches", "classifies", "extracted from")

**Hub (hero, largest circle):**
- Building Permits — active/total, 24h/7d update counts

**Row 1 — Enrichment sources (4-column grid):**
1. Address Matching — geocoded permits, address points count
2. Lots (Parcels) — exact/name/spatial tier breakdown, avg confidence
3. 3D Massing — footprints, parcels with buildings
4. Neighbourhoods — total hoods, permits linked

**Row 2 — Derived/classification sources (5-column grid):**
5. CoA Linked — high/low confidence split, avg confidence
6. Builder Profiles — permits w/ builder, phone/email/website breakdown; indented Google Places + WSIB enrichment tiers
7. Scope Class — % of permits with a use-type tag; hardcoded tier list always shows three rows: Residential (count), Commercial (count), Mixed-Use (count)
8. Scope Tags — % of permits with at least 1 true architectural tag (excluding use-types); top 3 tags listed
9. Trades (Residential) — % of residential permits with ≥1 trade; Tier 1/2 counts
10. Trades (Commercial) — % of commercial+mixed-use permits with ≥1 trade; Tier 1/2 counts

Fetches both `/api/quality` (snapshot data) and `/api/admin/stats` (pipeline timestamps, address_points/massing/neighbourhood counts). Polls every 5s while any pipeline is running.

**Section 2 — Freshness & Sync Timeline (bottom)**
Freshness counters (24h/7d/30d), staleness warning (% of active permits not seen in 30+ days), data source timeline with coloured dots and relative timestamps.

### 2.7 Pipeline Chain Execution

The chain orchestrator (`scripts/run-chain.js`) enables end-to-end execution of pipeline sequences. Three chains are defined, each ending with `refresh_snapshot` to capture updated metrics:

**Chain Definitions:**

| Chain ID | API Slug | Steps | Description |
|----------|----------|-------|-------------|
| `permits` | `chain_permits` | 14 | Daily — full permits ingest through classification, enrichment, linking, and snapshot |
| `coa` | `chain_coa` | 4 | Daily — CoA ingest, linking, pre-permit creation, and snapshot |
| `sources` | `chain_sources` | 10 | Quarterly/Annual — reference data refresh (address points, parcels, massing, neighbourhoods) with re-linking and snapshot |

**Permits chain (14 steps):** permits → classify_scope_class → classify_scope_tags → classify_permits → builders → enrich_google → enrich_wsib → geocode_permits → link_parcels → link_neighbourhoods → link_massing → link_similar → link_coa → refresh_snapshot

**CoA chain (4 steps):** coa → link_coa → create_pre_permits → refresh_snapshot

**Sources chain (10 steps):** address_points → geocode_permits → parcels → compute_centroids → link_parcels → massing → link_massing → neighbourhoods → link_neighbourhoods → refresh_snapshot

**Orchestrator behaviour:**
- Accepts chain ID as CLI argument: `node scripts/run-chain.js permits`
- Inserts a parent `pipeline_runs` row for `chain_<id>` tracking overall status
- Executes steps sequentially; each step gets its own `pipeline_runs` row
- **Stop-on-failure:** if step N fails, the chain stops and records which step failed
- Parent chain row updated with `completed` or `failed` status and total duration
- API route timeout: 1 hour for chains (vs 10 minutes for individual pipelines)

**API integration:**
- `POST /api/admin/pipelines/chain_permits` — triggers full permits chain
- `POST /api/admin/pipelines/chain_coa` — triggers full CoA chain
- `POST /api/admin/pipelines/chain_sources` — triggers full sources chain
- Chain slug detection: when slug starts with `chain_`, the route passes the chain ID as an extra argument to `run-chain.js` and uses the extended 1-hour timeout

**Dashboard polling:**
- DataQualityDashboard polling (5s interval) auto-discovers any running pipeline steps from `pipeline_last_run`, including steps spawned by the chain orchestrator (not just user-triggered ones)

### 2.8 Trend Arrows on DataSourceCircle

Each enrichment-source `DataSourceCircle` displays a 30-day trend arrow computed from historical snapshots. The Building Permits hero card does **not** show a trend (active/total % is not a meaningful enrichment metric).

1. **`findSnapshotDaysAgo(trends, 30)`** — finds the snapshot closest to 30 days ago in the `trends` array. Requires a **minimum 7-day gap** — snapshots less than 7 days old are skipped to avoid comparing today's snapshot against itself (which always yields delta 0). Returns null if no qualifying snapshot exists.
2. **`trendDelta(currentPct, previousPct)`** — returns `current - previous` (positive = up, negative = down, null = no data)
3. Arrow is rendered inline below the accuracy percentage inside the progress ring:
   - Positive: green `▲ +X.X vs 30d`
   - Negative: red `▼ -X.X vs 30d`
   - Zero: gray `— 0.0 vs 30d` (flat, shown to confirm the feature is active)
   - Null: no indicator (insufficient historical data)

The "vs 30d" suffix clarifies that the comparison is against ~30 days ago.

**Utility functions** (in `src/lib/quality/types.ts`):
```typescript
findSnapshotDaysAgo(trends: DataQualitySnapshot[], daysAgo: number): DataQualitySnapshot | null
trendDelta(current: number, previous: number | null): number | null
```

### 2.9 Latest Record Dates

The dashboard displays the most recent record date for key data sources to verify data currency:

- **Building Permits:** `MAX(first_seen_at)` from `permits` table → shown as "Latest Record → Mar 3, 2026". Uses `first_seen_at` (ingestion timestamp) instead of `issued_date` because "Under Review" permits have `issued_date = NULL` — using `issued_date` would show a stale date from the last *approved* permit rather than the most recently ingested data.
- **CoA Applications:** `MAX(hearing_date)` from `coa_applications` table → shown as "Latest Record → Feb 28, 2026"

Added to `GET /api/admin/stats` response:
```typescript
newest_permit_date: string | null   // ISO date of most recent permit issued_date
newest_coa_date: string | null      // ISO date of most recent CoA hearing_date
```

The `DataSourceCircle` component accepts an optional `newestRecord` prop. When provided, a "Latest Record → {formatted date}" row appears between "Updated" and "Next" in the timestamps section. The date is shown as a formatted calendar date (e.g. "Feb 28, 2026") rather than relative time, so admins can immediately verify the data is current.

### 2.10 Live CKAN Fetching for Permits

The permit loader (`scripts/load-permits.js`) fetches live from the Toronto Open Data CKAN datastore API by default, ensuring the dashboard always reflects the most current data.

| Mode | Flag | Source | Behaviour |
|------|------|--------|-----------|
| **Live CKAN** (default) | none | `datastore_search` API | Paginated fetch (10K per page) from resource `6d0229af...` |
| **Local file** | `--file <path>` | JSON file on disk | Reads and parses the specified file |

- CKAN base URL: `ckan0.cf.opendata.inter.prod-toronto.ca`
- Resource ID: `6d0229af-bc54-46de-9c2b-26759b01dd05` (Active Building Permits)
- Pagination: 10,000 records per request via `limit` + `offset` params
- All existing `mapRecord`, `insertBatch`, dedup, and `sync_runs` logging unchanged
- `--file` flag accepts a path argument for offline/testing use

### 2.11 Incremental CoA Loading

The CoA loader (`scripts/load-coa.js`) supports two modes:

| Mode | Flag | Resources Fetched | Records |
|------|------|------------------|---------|
| **Incremental** (default) | none | Active only | Last 90 days via `datastore_search_sql` WHERE `HEARING_DATE >= cutoff` |
| **Full** | `--full` | Active + Closed | All records via paginated `datastore_search` |

- Incremental mode uses the CKAN SQL endpoint for efficient filtering
- Only the Active resource (`51fd09cd...`) is queried — the Closed resource doesn't receive new records
- Cutoff: 90 days before the current date
- All existing dedup, mapping, and upsert logic is unchanged
- Mode is logged at startup for operational visibility

---

## 3. Associated Files

| File | Purpose | Status |
|------|---------|--------|
| `migrations/015_data_quality_snapshots.sql` | Snapshot table DDL with UNIQUE(snapshot_date) | Implemented |
| `src/lib/quality/types.ts` | `DataQualitySnapshot`, `MatchingMetrics`, `CoverageRate`, `TrendPoint` interfaces; `calculateEffectivenessScore()`, `extractMetrics()`, `EFFECTIVENESS_WEIGHTS` | Implemented |
| `src/lib/quality/metrics.ts` | `captureDataQualitySnapshot()`, `getQualityData()`, 9 counting query functions | Implemented |
| `src/app/api/quality/route.ts` | `GET /api/quality` — latest snapshot + trends | Implemented |
| `src/app/api/quality/refresh/route.ts` | `POST /api/quality/refresh` — manual snapshot capture | Implemented |
| `src/app/admin/data-quality/page.tsx` | Dashboard page shell at `/admin/data-quality` | Implemented |
| `src/components/DataQualityDashboard.tsx` | Hub-and-spoke dashboard — fetches quality + admin stats, renders circle diagram + freshness | Implemented |
| `src/components/DataSourceCircle.tsx` | Reusable circle node with progress ring, tier breakdown, timestamps, Update Now button | Implemented |
| `src/components/FreshnessTimeline.tsx` | Data source staleness timeline + pipeline chain definitions | Implemented |
| `scripts/run-chain.js` | Sequential chain orchestrator — runs pipeline steps in order with tracking | Implemented |
| `src/tests/quality.logic.test.ts` | 35 tests — score calculations, metric extraction, shape validation, trendDelta, findSnapshotDaysAgo | Implemented |
| `src/tests/quality.infra.test.ts` | 20 tests — API response shape, schema constraints, validation | Implemented |
| `src/tests/chain.logic.test.ts` | 18 tests — chain definitions, slug extraction, file existence, completeness | Implemented |
| `src/tests/factories.ts` | `createMockDataQualitySnapshot()` factory function | Implemented |
| `functions/src/index.ts` | Snapshot capture added after sync (step 4, non-fatal) | Implemented |
| `src/app/admin/page.tsx` | "Data Quality" nav link added to admin page | Implemented |

---

## 4. Constraints & Edge Cases

- **Snapshot date uniqueness:** `UNIQUE(snapshot_date)` enforces one snapshot per day. Multiple captures on the same day overwrite (upsert).
- **Zero denominators:** When `active_permits = 0`, effectiveness score returns `null`. When `builders_total = 0` or `coa_total = 0`, those components contribute 0% to the score.
- **Coverage > 100%:** Theoretically possible if `permits_with_trades` exceeds `active_permits` (e.g., inactive permits still have trade matches). Score is clamped to 100.
- **Confidence histograms approximated:** Exact bucket distributions would require separate queries. Current implementation approximates from tier counts and high/low confidence splits stored in the snapshot.
- **Freshness ordering invariant:** `permits_updated_24h <= permits_updated_7d <= permits_updated_30d` must always hold.
- **Cloud Function non-fatal:** Snapshot capture failure after sync is logged as WARNING, not ERROR. The sync itself still succeeds.
- **No auth on quality endpoints:** Currently no admin role check on `/api/quality` or `/api/quality/refresh`. These endpoints are informational and non-destructive.

---

## 5. Data Schema

### data_quality_snapshots

```
id                          SERIAL          PRIMARY KEY
snapshot_date               DATE            NOT NULL, UNIQUE
total_permits               INTEGER         NOT NULL
active_permits              INTEGER         NOT NULL
permits_with_trades         INTEGER         NOT NULL
trade_matches_total         INTEGER         NOT NULL
trade_avg_confidence        NUMERIC(4,3)
trade_tier1_count           INTEGER         NOT NULL
trade_tier2_count           INTEGER         NOT NULL
trade_tier3_count           INTEGER         NOT NULL
permits_with_builder        INTEGER         NOT NULL
builders_total              INTEGER         NOT NULL
builders_enriched           INTEGER         NOT NULL
builders_with_phone         INTEGER         NOT NULL
builders_with_email         INTEGER         NOT NULL
builders_with_website       INTEGER         NOT NULL
builders_with_google        INTEGER         NOT NULL
builders_with_wsib          INTEGER         NOT NULL
permits_with_parcel         INTEGER         NOT NULL
parcel_exact_matches        INTEGER         NOT NULL
parcel_name_matches         INTEGER         NOT NULL
parcel_avg_confidence       NUMERIC(4,3)
permits_with_neighbourhood  INTEGER         NOT NULL
permits_geocoded            INTEGER         NOT NULL
coa_total                   INTEGER         NOT NULL
coa_linked                  INTEGER         NOT NULL
coa_avg_confidence          NUMERIC(4,3)
coa_high_confidence         INTEGER         NOT NULL
coa_low_confidence          INTEGER         NOT NULL
permits_updated_24h         INTEGER         NOT NULL
permits_updated_7d          INTEGER         NOT NULL
permits_updated_30d         INTEGER         NOT NULL
last_sync_at                TIMESTAMPTZ
last_sync_status            VARCHAR(20)
created_at                  TIMESTAMPTZ     DEFAULT NOW()
```

### TypeScript Interfaces

```typescript
interface DataQualitySnapshot {
  id: number;
  snapshot_date: string;
  total_permits: number;
  active_permits: number;
  // ... 31 metric fields ...
  created_at: string;
}

interface DataQualityResponse {
  current: DataQualitySnapshot | null;
  trends: DataQualitySnapshot[];
  lastUpdated: string | null;
}

interface CoverageRate {
  label: string;
  matched: number;
  total: number;
  percentage: number;
}

interface MatchingMetrics {
  tradeCoverage: CoverageRate;
  builderEnrichment: CoverageRate;
  parcelLinking: CoverageRate;
  neighbourhoodCoverage: CoverageRate;
  geocoding: CoverageRate;
  coaLinking: CoverageRate;
}

const EFFECTIVENESS_WEIGHTS = {
  tradeCoverage: 0.25,
  builderEnrichment: 0.20,
  parcelLinking: 0.15,
  neighbourhoodCoverage: 0.15,
  geocoding: 0.15,
  coaLinking: 0.10,
};
```

---

## 6. Integrations

| System | Direction | Detail |
|--------|-----------|--------|
| Database Schema (`01`) | Read | Queries `permits`, `permit_trades`, `builders`, `permit_parcels`, `coa_applications`, `sync_runs` tables |
| Sync Scheduler (`04`) | Trigger | Snapshot captured automatically after daily sync completes |
| Trade Classification (`08`) | Read | `permit_trades` coverage, tier counts, confidence |
| Builder Enrichment (`11`) | Read | `builders` enrichment status and contact completeness |
| CoA Integration (`12`) | Read | `coa_applications` linking coverage and confidence |
| Neighbourhood Profiles (`27`) | Read | `permits.neighbourhood_id` coverage |
| Admin Panel (`26`) | Navigation | Dashboard linked from admin page nav |
| Cloud Functions | Trigger | `syncProcess` calls `captureDataQualitySnapshot()` after sync |

---

## 7. Triad Test Criteria

### A. Logic Layer (`quality.logic.test.ts` — 35 tests)

| ID | Test | Assertion |
|----|------|-----------|
| L01 | Effectiveness score returns 0-100 for valid data | Score is >= 0 and <= 100 |
| L02 | Score returns null when active_permits = 0 | Returns null, not 0 |
| L03 | Score returns 100 when all coverage is complete | All matched = all total → 100 |
| L04 | Score returns 0 when no matches exist | All matched = 0 → 0 |
| L05 | Score handles zero builders_total | Builder contributes 0%, no division error |
| L06 | Score handles zero coa_total | CoA contributes 0%, no division error |
| L07 | Weights sum to 1.0 | Sum of all 6 weights = 1.0 |
| L08 | Trade coverage has highest weight (25%) | `EFFECTIVENESS_WEIGHTS.tradeCoverage === 0.25` |
| L09 | CoA linking has lowest weight (10%) | `EFFECTIVENESS_WEIGHTS.coaLinking === 0.10` |
| L10 | Higher trade coverage produces higher score | snapshot(trades=9000) > snapshot(trades=1000) |
| L11 | Score capped at 100 for over-coverage | Even if matched > total, score <= 100 |
| L12 | Trade coverage percentage correct | 873/1000 → 87.3% |
| L13 | Builder enrichment percentage correct | 150/200 → 75% |
| L14 | Parcel linking percentage correct | 800/1000 → 80% |
| L15 | Neighbourhood coverage percentage correct | 900/1000 → 90% |
| L16 | Geocoding percentage correct | 950/1000 → 95% |
| L17 | CoA linking percentage correct | 350/500 → 70% |
| L18 | Zero denominators return 0% | active_permits=0 → all percentages = 0 |
| L19 | All metrics have correct labels | 6 labels verified |
| L20 | Percentages rounded to one decimal | 1/3 → 33.3 not 33.333... |
| L21 | Factory creates all required fields | All snapshot fields present |
| L22 | snapshot_date is valid date string | Parseable by Date constructor |
| L23 | Confidence values in range 0-1 | All *_avg_confidence fields validated |
| L24 | active_permits <= total_permits | Invariant holds |
| L25 | Tier counts are non-negative | tier1, tier2, tier3 >= 0 |
| L26 | coa_high + coa_low <= coa_linked | Confidence splits don't exceed total |
| L27 | Freshness counts in order: 24h <= 7d <= 30d | Monotonic increase |
| L28 | last_sync_status is valid enum | running, completed, or failed |
| L29 | trendDelta returns positive when current > previous | 85.5 - 80.0 = 5.5 |
| L30 | trendDelta returns negative when current < previous | 72.3 - 80.0 = -7.7 |
| L31 | trendDelta returns null when previous is null | No previous data available |
| L32 | trendDelta returns 0 when values are equal | 50.0 - 50.0 = 0 |
| L33 | findSnapshotDaysAgo returns closest snapshot (min 7d gap) | Picks snapshot nearest to target, skipping recent |
| L34 | findSnapshotDaysAgo returns null for empty array | Empty trends array → null |
| L35 | findSnapshotDaysAgo returns null when only recent snapshots | Snapshots < 7 days old skipped → null |
| L36 | findSnapshotDaysAgo returns snapshot at least 7 days old | Skips 2-day-old, returns 10-day-old |

### B. UI Layer

| Test Case | Verification |
|-----------|-------------|
| Score gauge renders with colour | Green >= 80, Yellow 60-79, Orange 40-59, Red < 40 |
| Score gauge shows N/A when null | Displayed when active_permits = 0 |
| Coverage cards render all 6 | Trade, Builder, Parcel, Neighbourhood, Geocoding, CoA |
| Progress bars reflect percentage | Width proportional to coverage |
| Sparklines render with 2+ data points | SVG polyline visible |
| Confidence histograms render | 5 bars per histogram |
| Freshness counters show 24h/7d/30d | Three counter values displayed |
| Staleness warning appears | Shows when >0% permits not seen in 30d |
| Refresh button triggers POST | Calls `/api/quality/refresh` and reloads |
| Loading state shows while fetching | "Loading..." message visible |
| Empty state shows when no snapshots | Message with refresh prompt |
| DataSourceCircle renders up arrow for positive trend | Green ▲ +X.X vs 30d |
| DataSourceCircle renders down arrow for negative trend | Red ▼ -X.X vs 30d |
| DataSourceCircle renders flat indicator when trend is 0 | Gray — 0.0 vs 30d |
| DataSourceCircle hides arrow when trend is null | No arrow element rendered |
| DataSourceCircle shows "vs 30d" comparison period label | Period suffix present |
| DataSourceCircle renders latest record with "Latest Record" label | Formatted date shown |
| DataSourceCircle shows formatted date (not relative time) | formatShortDate used |
| DataSourceCircle hides latest record when null | No "Latest Record" row rendered |

### C. Infra Layer (`quality.infra.test.ts` — 20 tests)

| ID | Test | Assertion |
|----|------|-----------|
| I01 | Response shape validates | `current`, `trends`, `lastUpdated` fields present |
| I02 | Trends is an array | `Array.isArray(trends)` |
| I03 | Current can be null | Valid when no snapshots exist |
| I04 | Snapshot has all 35 fields | Shape validation against required field list |
| I05 | 35 required fields counted | Explicit count check |
| I06 | Same date upserts (UNIQUE constraint) | `snapshot_date` is the upsert key |
| I07 | Different dates create separate rows | Distinct dates = distinct rows |
| I08 | Confidence values valid (0-1 or null) | Accepts 0, 0.5, 1, null; rejects 1.5, -0.1 |
| I09 | Coverage matched <= total (with tolerance) | No wildly impossible ratios |
| I10 | Zero total requires zero matched | `total=0` → `matched=0` |
| I11 | Negative values rejected | matched < 0 or total < 0 fails |
| I12 | Freshness ordering valid | 24h <= 7d <= 30d |
| I13 | Invalid freshness ordering rejected | 24h > 7d fails |
| I14 | Negative freshness rejected | Any count < 0 fails |
| I15 | Valid sync statuses accepted | running, completed, failed, null |
| I16 | Invalid sync status rejected | 'cancelled', '' fail |
| I17 | Table name is data_quality_snapshots | String check |
| I18 | UNIQUE on snapshot_date | Constraint documented |
| I19 | 6 matching process columns exist | permits_with_trades through coa_linked |
| I20 | Migration 015 DDL expectations | Table and constraint names verified |

---

## Operating Boundaries

### Target Files (Modify / Create)
- `src/lib/quality/metrics.ts`
- `src/lib/quality/types.ts`
- `src/app/api/quality/route.ts`
- `src/app/api/quality/refresh/route.ts`
- `src/app/admin/data-quality/page.tsx`
- `src/components/DataQualityDashboard.tsx`
- `src/components/DataSourceCircle.tsx`
- `src/components/FreshnessTimeline.tsx`
- `scripts/refresh-snapshot.js`
- `src/tests/quality.logic.test.ts`
- `src/tests/quality.infra.test.ts`

### Out-of-Scope Files (DO NOT TOUCH)
- **`src/lib/classification/classifier.ts`**: Governed by Spec 08. Quality measures classification but does not modify it.
- **`src/lib/sync/ingest.ts`**: Governed by Spec 02. Quality measures sync but does not modify it.
- **`src/lib/builders/enrichment.ts`**: Governed by Spec 11. Quality measures enrichment but does not modify it.

### Cross-Spec Dependencies
- Relies on **Spec 01 (Database Schema)**: Uses `data_quality_snapshots` table.
- Relies on **Spec 26 (Admin)**: Quality dashboard linked from admin navigation.
- Measures all data linking specs: Spec 08 (trades), Spec 11 (builders), Spec 29 (parcels), Spec 27 (neighbourhoods), Spec 05 (geocoding), Spec 12 (CoA).
