# Spec 34 -- Market Metrics Dashboard

## 1. Goal & User Story
As an admin, I want a dedicated market metrics page showing business-level construction trends, lead volumes by trade, and geographic patterns so I can understand market dynamics and complement the system health admin view.

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | None |
| Authenticated | None |
| Admin | Read |

## 3. Behavioral Contract
- **Inputs:** Admin navigates to `/admin/market-metrics`. Data sourced from permits, permit_trades, trades, neighbourhoods tables, and `mv_monthly_permit_stats` materialized view.
- **Core Logic:**
  - `GET /api/admin/market-metrics` returns 6 sections via `Promise.all()`: KPI row (from permits direct), activity by project type (from materialized view), leads by trade (from permit_trades + trades + permits), residential vs commercial split (from scope_tags), scope tags breakdown (unnested scope_tags), neighbourhood wealth tiers (permits + neighbourhoods with income segmentation).
  - Materialized view `mv_monthly_permit_stats` (migration 034) pre-aggregates monthly permit counts and construction value by project_type. Unique index on `(month, project_type)` enables concurrent refresh.
  - Neighbourhood wealth tiers replace flat top-25 table: 3 tiers based on `avg_household_income` from neighbourhoods table (high $100K+, middle $60-100K, lower <$60K, null excluded). Uses `classifyIncome()` from `src/lib/neighbourhoods/summary.ts`. Residential-only filter via scope_tags. YoY comparison: current 30-day window vs same window one year ago. Per-tier: permit count, total value, YoY % change, top 5 neighbourhoods by permit count.
  - Response shape defined by `MarketMetricsData` interface in the API route. Wealth tiers ordered high -> middle -> low as `WealthTierGroup[]`.
  - Shared helpers extracted to `src/lib/market-metrics/helpers.ts` for testability: `formatCurrency()`, `mapPermitType()`, `trendPct()`, `PERMIT_TYPE_TO_TRADE`, `WealthTier` type, `TIER_LABELS`, `TIER_ORDER`.
  - Page is a client component with 6 visualization sections using custom SVG/div charts (no chart library). Section 6 displays 3 colour-coded wealth-tier cards (emerald/blue/amber) in a 3-column grid with YoY trend arrows and mini top-5 neighbourhood lists.
- **Outputs:** Rendered dashboard with KPI row, activity chart, trade leads table, residential/commercial split, scope breakdown, and wealth-tier cards with YoY trends.
- **Edge Cases:**
  - Neighbourhoods with null income excluded from wealth tier analysis.
  - YoY comparison returns null change when no data exists for prior year window.
  - Empty permit set produces zero counts (no division errors in trendPct).

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic** (`market-metrics.logic.test.ts`): Migration 034 — mv_monthly_permit_stats; API route exports; formatCurrency; mapPermitType; PERMIT_TYPE_TO_TRADE; trendPct; MarketMetrics response shape
<!-- TEST_INJECT_END -->

## 5. Operating Boundaries

### Target Files (Modify / Create)
- `src/app/admin/market-metrics/page.tsx`
- `src/app/api/admin/market-metrics/route.ts`
- `src/lib/market-metrics/helpers.ts`
- `migrations/034_mv_monthly_permit_stats.sql`
- `migrations/037_trade_by_usetype.sql`
- `src/tests/market-metrics.logic.test.ts`

### Out-of-Scope Files (DO NOT TOUCH)
- **`src/lib/classification/`**: Governed by Spec 08. Do not modify classification engine.
- **`src/lib/quality/`**: Governed by Spec 28. Quality dashboard is a separate spec.
- **`src/lib/neighbourhoods/summary.ts`**: Governed by Spec 27. Neighbourhood data is consumed, not modified.

### Cross-Spec Dependencies
- Relies on **Spec 01 (Database Schema)**: Queries permits, trades, and neighbourhood tables.
- Relies on **Spec 26 (Admin)**: Market metrics linked from admin navigation.
- Relies on **Spec 27 (Neighbourhood Profiles)**: Uses neighbourhood income tiers for wealth analysis.
- Relies on **Spec 30 (Scope Classification)**: Uses scope tags for project type breakdown.
