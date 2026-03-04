# Spec 23 -- Analytics Dashboard

## 1. Goal & User Story
As a user, I want to see trends in permit activity, trade demand, and geographic hotspots so I can make better business decisions. The dashboard displays 6 chart types with a global date range selector, period comparison mode, and responsive layout gated to Pro/Enterprise plans.

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | None |
| Authenticated | Read (own data) |
| Admin | Read (all data) |

## 3. Behavioral Contract
- **Inputs:** Date range (presets: 7d, 30d, 90d, YTD, 1Y, custom), optional comparison toggle (previous period or same period last year), granularity override
- **Core Logic:**
  - Six aggregation queries run against `permits`, `permit_trades`, and `trades` tables -- see query builders in `src/lib/analytics/queries.ts`
  - Charts: permits over time (line), trade demand (horizontal bar), geographic heat map, avg cost by ward (choropleth), top builders (table, limit 25), permit status distribution (donut)
  - Granularity auto-selects: daily (<30d), weekly (30-180d), monthly (>180d); user can override
  - Period comparison computes absolute change, percentage change, and direction (up/down/flat)
  - Results cached in Redis (15-min TTL, keyed by endpoint + date range + params hash); invalidated on sync completion
- **Outputs:** Per-chart JSON arrays with period/count, trade/count, lat/lng/density, ward/avgCost, builder/permits/value, or status/count/percentage; optional comparison overlay and delta values
- **Edge Cases:**
  - Empty date range returns empty arrays, not errors; charts show "No permit data for this period"
  - Permits with null `est_cost`, `ward`, `latitude`, or `applicant` excluded from respective charts
  - Comparison period extending before earliest DB record shows partial data with note
  - Builder name matching is exact only (no fuzzy dedup)
  - Viewports below 768px stack charts vertically; heat map and choropleth require minimum 400px width

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic** (`analytics.logic.test.ts`): getPermitsByDateRange; getTradeDistribution; getCostByWard; getStatusDistribution; getTopBuilders; getPermitTrends
<!-- TEST_INJECT_END -->

## 5. Operating Boundaries

### Target Files (Modify / Create)
- `src/lib/analytics/queries.ts`
- `src/tests/analytics.logic.test.ts`

### Out-of-Scope Files (DO NOT TOUCH)
- **`src/lib/classification/`**: Governed by Spec 08. Do not modify classification engine.
- **`src/app/api/permits/`**: Governed by Spec 06. API is consumed, not modified.
- **`src/lib/auth/`**: Governed by Spec 13. Do not modify auth logic.

### Cross-Spec Dependencies
- Relies on **Spec 01 (Database Schema)**: Queries permits, trades, and builder tables.
- Relies on **Spec 06 (Data API)**: May consume existing API endpoints for data.
- Relies on **Spec 07 (Trade Taxonomy)**: Uses trade data for demand analysis.
- Relies on **Spec 13 (Auth)**: Analytics gated to Pro/Enterprise plans.
