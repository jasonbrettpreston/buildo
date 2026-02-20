# 23 - Analytics Dashboard

**Status:** Planned
**Last Updated:** 2026-02-14
**Depends On:** `01_database_schema.md`, `06_data_api.md`, `07_trade_taxonomy.md`, `13_auth.md`
**Blocks:** None

---

## 1. User Story

> "As a user, I want to see trends in permit activity, trade demand, and geographic hotspots so I can make better business decisions."

**Acceptance Criteria:**
- Dashboard displays 6 chart types: permits over time (line), trade demand (bar), geographic heat map, average cost by ward (choropleth), top builders (table), permit status distribution (pie)
- Date range selector allows custom time windows and preset ranges (7d, 30d, 90d, YTD, 1Y)
- Period comparison mode shows current period vs previous period side-by-side
- All charts respond to the global date range selector
- Charts are responsive and readable on tablet and desktop viewports
- Analytics features are gated to Pro and Enterprise subscription plans

---

## 2. Technical Logic

### Chart Specifications

#### Chart 1: Permits Issued Over Time (Line)
```
Query: SELECT DATE_TRUNC('week', issued_date) AS week, COUNT(*) AS permit_count
       FROM permits
       WHERE issued_date BETWEEN $start AND $end
       GROUP BY week ORDER BY week
Display: Line chart with X = week, Y = count
Comparison mode: Overlay previous period as dashed line
```

#### Chart 2: Trade Demand Breakdown (Horizontal Bar)
```
Query: SELECT t.name, t.color, COUNT(pt.permit_id) AS demand
       FROM permit_trades pt
       JOIN trades t ON t.id = pt.trade_id
       JOIN permits p ON p.id = pt.permit_id
       WHERE p.issued_date BETWEEN $start AND $end
       GROUP BY t.id, t.name, t.color
       ORDER BY demand DESC
Display: Horizontal bar chart, bars colored by trade color
Max bars: 20 (all trades)
```

#### Chart 3: Geographic Heat Map
```
Query: SELECT latitude, longitude, COUNT(*) AS density
       FROM permits
       WHERE issued_date BETWEEN $start AND $end
         AND latitude IS NOT NULL
       GROUP BY latitude, longitude
Display: Map centered on Toronto (43.6532, -79.3832) with heat overlay
Library: Mapbox GL JS or Leaflet with heatmap plugin
Zoom: Default zoom level 11, user-adjustable
```

#### Chart 4: Average Cost by Ward (Choropleth)
```
Query: SELECT ward, AVG(est_cost) AS avg_cost, COUNT(*) AS permit_count
       FROM permits
       WHERE issued_date BETWEEN $start AND $end
         AND est_cost IS NOT NULL AND ward IS NOT NULL
       GROUP BY ward
Display: Toronto ward boundary polygons, colored by avg_cost gradient
Color scale: Light yellow (low) to deep red (high)
Tooltip: Ward name, average cost, permit count
```

#### Chart 5: Top Builders by Permit Count (Table)
```
Query: SELECT applicant AS builder, COUNT(*) AS permit_count,
              SUM(est_cost) AS total_value, AVG(est_cost) AS avg_value
       FROM permits
       WHERE issued_date BETWEEN $start AND $end
         AND applicant IS NOT NULL
       GROUP BY applicant
       ORDER BY permit_count DESC
       LIMIT 25
Display: Sortable table with columns: Rank, Builder Name, Permits, Total Value, Avg Value
Sorting: Client-side sort on any column
```

#### Chart 6: Permit Status Distribution (Pie/Donut)
```
Query: SELECT status, COUNT(*) AS count
       FROM permits
       WHERE issued_date BETWEEN $start AND $end
       GROUP BY status
Display: Donut chart with status labels and percentages
Colors: Mapped per status (e.g., 'Issued' = green, 'Under Review' = amber)
```

### Date Range Selector

```typescript
interface DateRange {
  start: Date;
  end: Date;
  preset: '7d' | '30d' | '90d' | 'ytd' | '1y' | 'custom';
}

// Preset calculations (relative to today)
'7d':  { start: today - 7 days, end: today }
'30d': { start: today - 30 days, end: today }
'90d': { start: today - 90 days, end: today }
'ytd': { start: Jan 1 of current year, end: today }
'1y':  { start: today - 365 days, end: today }
'custom': { start: user-selected, end: user-selected }
```

### Period Comparison

```
comparePeriods(currentRange, comparisonType):
  'previous_period': shift range backward by its own length
    e.g., current = Feb 1-28 -> comparison = Jan 1-31
  'same_period_last_year': shift range backward by 1 year
    e.g., current = Feb 2026 -> comparison = Feb 2025

  Returns: { current: AggregatedData, comparison: AggregatedData, deltas: DeltaData }

  DeltaData includes:
    - Absolute change (current - previous)
    - Percentage change ((current - previous) / previous * 100)
    - Direction: 'up' | 'down' | 'flat'
```

### API Endpoints

```
GET /api/analytics/permits-over-time?start=&end=&granularity=week|month
GET /api/analytics/trade-demand?start=&end=
GET /api/analytics/geographic?start=&end=
GET /api/analytics/cost-by-ward?start=&end=
GET /api/analytics/top-builders?start=&end=&limit=25
GET /api/analytics/status-distribution?start=&end=
GET /api/analytics/summary?start=&end=&compare=previous_period|last_year
```

### Caching Strategy

- Analytics queries are expensive aggregations over up to 237K rows
- Cache results in Redis with TTL of 15 minutes
- Cache key: `analytics:{endpoint}:{start}:{end}:{params_hash}`
- Cache invalidated on new sync completion (publish cache-bust event)
- Stale-while-revalidate: serve cached data while refreshing in background

---

## 3. Associated Files

| File | Purpose | Status |
|------|---------|--------|
| `src/app/analytics/page.tsx` | Analytics dashboard page layout | Planned |
| `src/components/analytics/DateRangeSelector.tsx` | Date range picker with presets | Planned |
| `src/components/analytics/PermitsOverTime.tsx` | Line chart component | Planned |
| `src/components/analytics/TradeDemand.tsx` | Horizontal bar chart component | Planned |
| `src/components/analytics/GeographicHeatMap.tsx` | Map with heat overlay | Planned |
| `src/components/analytics/CostByWard.tsx` | Choropleth map component | Planned |
| `src/components/analytics/TopBuilders.tsx` | Sortable table component | Planned |
| `src/components/analytics/StatusDistribution.tsx` | Donut chart component | Planned |
| `src/components/analytics/PeriodComparison.tsx` | Comparison toggle and delta display | Planned |
| `src/app/api/analytics/[chart]/route.ts` | Analytics aggregation API endpoints | Planned |
| `src/lib/analytics/queries.ts` | PostgreSQL aggregation query builders | Planned |
| `src/lib/analytics/cache.ts` | Redis caching layer for analytics | Planned |

---

## 4. Constraints & Edge Cases

- **Large dataset performance:** Aggregation queries run against 237K+ permit rows. All queries must use appropriate indexes and complete within 2 seconds. Consider materialized views for the most expensive aggregations.
- **Empty date range:** If no permits exist in the selected date range, charts display empty states with a message ("No permit data for this period") rather than broken visuals.
- **Missing data fields:** Permits with null `est_cost`, `ward`, `latitude`, or `applicant` are excluded from the respective charts. Chart tooltips indicate the count of excluded records.
- **Ward boundary data:** Choropleth requires GeoJSON boundary data for Toronto's 25 wards. This is a static asset (~500KB) loaded once and cached client-side.
- **Comparison period overflow:** If comparison period extends before the earliest permit in the database, show partial data with a note ("Comparison data limited - records begin {date}").
- **Timezone consistency:** All date range calculations use America/Toronto timezone. The date range selector displays local dates, but API calls use ISO 8601 UTC timestamps.
- **Chart responsiveness:** On viewports below 768px, charts stack vertically in a single column. Heat map and choropleth require minimum 400px width to be usable.
- **Granularity auto-selection:** For date ranges < 30 days, use daily granularity. For 30-180 days, use weekly. For > 180 days, use monthly. User can override.
- **Builder name normalization:** The `applicant` field may contain variations of the same builder name. Top builders table groups exact matches only; fuzzy matching is out of scope for this spec.

---

## 5. Data Schema

### No New Tables

Analytics queries run against existing tables: `permits`, `permit_trades`, `trades`. No new database tables are required.

### API Response Interfaces

```typescript
interface PermitsOverTimeResponse {
  data: { period: string; count: number }[];
  comparison?: { period: string; count: number }[];
  granularity: 'day' | 'week' | 'month';
}

interface TradeDemandResponse {
  data: { tradeSlug: string; tradeName: string; color: string; count: number }[];
}

interface GeographicResponse {
  data: { lat: number; lng: number; density: number }[];
}

interface CostByWardResponse {
  data: { ward: number; wardName: string; avgCost: number; permitCount: number }[];
}

interface TopBuildersResponse {
  data: { rank: number; builder: string; permitCount: number; totalValue: number; avgValue: number }[];
}

interface StatusDistributionResponse {
  data: { status: string; count: number; percentage: number }[];
}

interface SummaryResponse {
  current: { totalPermits: number; totalValue: number; avgValue: number; topTrade: string };
  comparison?: { totalPermits: number; totalValue: number; avgValue: number; topTrade: string };
  deltas?: { permits: DeltaValue; value: DeltaValue; avgValue: DeltaValue };
}

interface DeltaValue {
  absolute: number;
  percentage: number;
  direction: 'up' | 'down' | 'flat';
}
```

---

## 6. Integrations

| System | Direction | Purpose |
|--------|-----------|---------|
| Database Schema (`01`) | Upstream | Permits table is the primary data source for all aggregations |
| Permit Data API (`06`) | Reference | Shares query patterns and database connection pool |
| Trade Taxonomy (`07`) | Reference | Trade names and colors for the demand breakdown chart |
| Geocoding (`05`) | Upstream | Provides lat/lng coordinates for heat map |
| Authentication (`13`) | Reference | User identity for access control |
| Subscription (`25`) | Reference | Pro/Enterprise plan required for analytics access |
| Sync Pipeline (`02`) | Event | Cache invalidation triggered on sync completion |
| Map View (`20`) | Reference | Shares map rendering components and ward boundary GeoJSON |
| Redis | External | Caching layer for expensive aggregation queries |

---

## 7. Triad Test Criteria

### A. Logic Layer

| Test Case | Input | Expected Output |
|-----------|-------|-----------------|
| Permits over time weekly | Date range: 30 days | Array of ~4 weekly buckets with correct counts |
| Permits over time monthly | Date range: 365 days | Array of 12 monthly buckets |
| Trade demand ordering | Date range with mixed trades | Trades sorted by count DESC |
| Trade demand colors | All 20 trades present | Each trade has its correct hex color from taxonomy |
| Cost by ward avg | 3 permits in ward 10: $100K, $200K, $300K | Ward 10 avg = $200K |
| Cost by ward null exclusion | 5 permits, 2 with null est_cost | Only 3 permits included in average |
| Top builders limit | 100 distinct builders | Only top 25 returned |
| Status distribution percentages | 100 permits: 60 Issued, 30 Review, 10 Other | 60%, 30%, 10% |
| Period comparison delta | Current: 150 permits, Previous: 100 | Delta: +50, +50%, direction: 'up' |
| Period comparison flat | Current: 100, Previous: 100 | Delta: 0, 0%, direction: 'flat' |
| Date range preset '30d' | Today = Feb 14 | Start: Jan 15, End: Feb 14 |
| Date range preset 'ytd' | Today = Feb 14, 2026 | Start: Jan 1 2026, End: Feb 14 2026 |
| Empty range handling | Date range with 0 permits | Empty arrays returned, no errors |
| Granularity auto-select | Range = 15 days | Granularity = 'day' |
| Granularity auto-select | Range = 60 days | Granularity = 'week' |
| Granularity auto-select | Range = 200 days | Granularity = 'month' |

### B. UI Layer

| Test Case | Verification |
|-----------|-------------|
| Dashboard layout | All 6 charts render in a responsive grid layout |
| Date range picker | Preset buttons and custom date inputs work correctly |
| Line chart rendering | Permits over time displays with correct axes and data points |
| Bar chart rendering | Trade demand bars are correctly colored and ordered |
| Heat map rendering | Map centers on Toronto, heat overlay reflects permit density |
| Choropleth rendering | Ward polygons colored by cost gradient with functional tooltips |
| Table sorting | Top builders table sorts by any column on header click |
| Donut chart rendering | Status segments display with labels and percentages |
| Comparison toggle | Toggling comparison adds overlay line / comparison data |
| Delta indicators | Up/down arrows with green/red coloring for positive/negative changes |
| Empty state | Charts show "No data for this period" when date range has no permits |
| Responsive stacking | Below 768px, charts stack into single column layout |
| Loading states | Skeleton loaders display while chart data is fetching |

### C. Infra Layer

| Test Case | Verification |
|-----------|-------------|
| Aggregation query performance | All 6 queries complete within 2s against 237K row dataset |
| Index usage | EXPLAIN ANALYZE confirms index scans on issued_date, ward, trade_id |
| Redis cache hit | Second request for same date range returns cached data (< 50ms) |
| Redis cache miss | First request computes fresh data and stores in cache |
| Cache TTL expiry | Cached data expires after 15 minutes |
| Cache invalidation | New sync completion clears relevant analytics cache keys |
| API authentication | Unauthenticated requests to /api/analytics/* return 401 |
| Plan gating | Free plan users receive 403 with upgrade message |
| Ward GeoJSON loading | Static ward boundary file loads correctly (< 500KB) |
| Concurrent requests | Multiple simultaneous analytics requests do not cause connection pool exhaustion |
