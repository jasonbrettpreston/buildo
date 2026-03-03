# Spec 34 — Market Metrics Dashboard

## Goal
Dedicated `/admin/market-metrics` page showing business-level construction trends, lead volumes by trade, and geographic patterns — complementing the existing System Health admin page.

## Migration 034
Materialized view `mv_monthly_permit_stats` pre-aggregates monthly permit counts and construction value by `project_type`. Unique index on `(month, project_type)` enables `REFRESH MATERIALIZED VIEW CONCURRENTLY`.

## API — `GET /api/admin/market-metrics`
Single endpoint returning 6 sections via `Promise.all()`:

| Section | Source | Key columns |
|---------|--------|-------------|
| KPI row | `permits` direct | `issued_date`, `est_const_cost`, `builder_name` |
| Activity by type | `mv_monthly_permit_stats` | `month`, `project_type`, `permit_count`, `total_value` |
| Leads by trade | `permit_trades` + `trades` + `permits` | `trade_id`, `lead_score` |
| Residential vs commercial | `permits` direct | `scope_tags` |
| Scope tags breakdown | `permits` direct | `scope_tags` (unnested) |
| Neighbourhood wealth tiers | `permits` + `neighbourhoods` | `neighbourhood_id`, `est_const_cost`, `avg_household_income`, `scope_tags` |

### Response shape
See `MarketMetricsData` interface in the API route.

### Neighbourhood Wealth Tiers
Replaces the flat top-25 neighbourhood table with income-segmented analysis:

- **3 wealth tiers** based on `neighbourhoods.avg_household_income`:
  - High Income: $100K+ (`classifyIncome()` from `src/lib/neighbourhoods/summary.ts`)
  - Middle Income: $60K–$100K
  - Lower Income: <$60K
  - Neighbourhoods with null income are excluded (`unknown` tier skipped)
- **Residential-only** filter: `'residential' = ANY(scope_tags)`
- **YoY comparison**: current 30-day window vs same window one year ago (CURRENT_DATE - 395d to -365d)
- **Per-tier aggregates**: permit count, total value, YoY % change for each
- **Top 5 neighbourhoods** per tier ranked by permit count

Response shape: `WealthTierGroup[]` ordered high → middle → low, each containing:
- `tier`, `label`, `permit_count`, `total_value`, `permit_count_yoy`, `total_value_yoy`
- `top_neighbourhoods[]` with `name`, `permit_count`, `total_value`, `avg_income`

## Page — `/admin/market-metrics`
Client component with 6 visualization sections using custom SVG/div charts (no chart library). Follows `data-quality/page.tsx` layout pattern.

Section 6 displays 3 colour-coded wealth-tier cards (emerald/blue/amber) in a 3-column grid, each showing permit count and value KPIs with YoY trend arrows, plus a mini top-5 neighbourhood list.

## Shared Helpers — `src/lib/market-metrics/helpers.ts`
Pure utility functions and types extracted from the API route for testability (Next.js API routes cannot export non-handler functions). Contains: `formatCurrency()`, `mapPermitType()`, `trendPct()`, `PERMIT_TYPE_TO_TRADE`, `WealthTier` type, `TIER_LABELS`, `TIER_ORDER`.

## Tests — `market-metrics.logic.test.ts`
Validates migration file, formatting helpers, category grouping, trend calculation, and wealth-tier response shape (tier ordering, labels, threshold alignment with `classifyIncome()`).
