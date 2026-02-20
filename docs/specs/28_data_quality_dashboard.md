# Spec 28 -- Data Quality Dashboard

**Status:** In Progress
**Last Updated:** 2026-02-20
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
| 1 | Trade Classification | 3-tier rules engine → `permit_trades` | Yes (0.0–1.0) |
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

### 2.6 Dashboard Layout

**Section A — Overall Health Score (top banner)**
Circular gauge with score (0-100), colour-coded. Sparkline showing score over last 30 days. Permit universe counts below.

**Section B — Coverage Matrix (3×2 card grid)**
Each card shows: title, progress bar with percentage, matched/total count, optional avg confidence, optional detail rows, optional sub-bars (builder enrichment breakdown), sparkline trend.

Cards:
1. Trade Classification — coverage %, avg confidence, tier 1/2/3 breakdown
2. Builder Enrichment — enriched %, phone/email/website/Google/WSIB sub-bars
3. Parcel Linking — coverage %, exact vs name-only split, avg confidence
4. Neighbourhood — coverage %
5. Geocoding — coverage %
6. CoA Linking — linked %, high/low confidence split, avg confidence

**Section C — Confidence Distribution Charts (2 histograms)**
Trade confidence histogram (5 buckets: 0.5-0.6 through 0.9-1.0) and CoA confidence histogram (5 buckets: 0.3-0.5 through 0.8-1.0). Approximated from tier counts and confidence splits in the snapshot.

**Section D — Freshness & Sync Timeline (bottom)**
Freshness counters (24h/7d/30d), staleness warning (% of active permits not seen in 30+ days), data source timeline with coloured dots and relative timestamps.

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
| `src/components/DataQualityDashboard.tsx` | Main dashboard component (score gauge, coverage grid, histograms, freshness) | Implemented |
| `src/components/CoverageCard.tsx` | Reusable coverage card with progress bar, sparkline, sub-bars | Implemented |
| `src/components/ConfidenceHistogram.tsx` | Bar chart for confidence distribution | Implemented |
| `src/components/FreshnessTimeline.tsx` | Data source staleness timeline | Implemented |
| `src/tests/quality.logic.test.ts` | 28 tests — score calculations, metric extraction, shape validation | Implemented |
| `src/tests/quality.infra.test.ts` | 20 tests — API response shape, schema constraints, validation | Implemented |
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

### A. Logic Layer (`quality.logic.test.ts` — 28 tests)

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
