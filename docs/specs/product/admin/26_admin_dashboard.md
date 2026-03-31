# Admin Dashboard

<requirements>
## 1. Goal & User Story
As an admin, I want a unified dashboard to monitor pipeline health, trigger runs, view analytics queries, and explore market metrics — so I can keep all data sources fresh and understand business trends from one place.
</requirements>

---

<security>
## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | None |
| Authenticated | None |
| Admin | Full |
</security>

---

<behavior>
## 3. Behavioral Contract

### 3.1 Pipeline Dashboard (`/admin`)
- **Inputs:** Admin navigates to `/admin`; clicks "Update Now" on any pipeline; toggles pipeline steps on/off.
- **Core Logic:**
  - Hierarchical Data Health Overview: permits (hero) → builders (derived) → 4 enrichment sources (grid) → CoA (standalone)
  - 32 pipeline slugs supported (28 individual + 4 chain orchestrators). Chains use 1-hour timeout; individual scripts use 10-minute timeout.
  - "Update Now" triggers `POST /api/admin/pipelines/{slug}`, polls `GET /api/admin/stats` every 5s until complete.
  - Pipeline toggle: `PATCH /api/admin/pipelines/schedules { pipeline, enabled }` updates `pipeline_schedules` (migration 047). Disabled steps skipped by `run-chain.js`.
  - FreshnessTimeline with accordion drill-downs: DataFlowTile (reads/writes), All Time (baseline/intersection/yield), Last Run (status/duration/records).
  - "Run All" disabled when chain is running, `comingSoon`, or all toggleable steps disabled.
- **Outputs:** Live health status, pipeline trigger acknowledgement, polling-updated timestamps.
- **Edge Cases:** Concurrent trigger → force-cancels existing 'running' rows. Missing script file → 500 from trigger route.

### 3.2 Analytics Queries (`/admin` — inline charts)
- **Inputs:** Date range (7d/30d/90d/YTD/1Y/custom), optional period comparison toggle.
- **Core Logic:**
  - 6 aggregation queries via `src/lib/analytics/queries.ts`: permits over time (line), trade demand (bar), geographic heat map, avg cost by ward, top builders (table), permit status distribution (donut).
  - Granularity auto-selects: daily (<30d), weekly (30-180d), monthly (>180d).
  - Results cached in Redis (15-min TTL). Period comparison computes absolute change + direction.
- **Outputs:** Per-chart JSON arrays. Viewports <768px stack vertically.
- **Edge Cases:** Empty date range → empty arrays, not errors. Null cost/ward/lat excluded from respective charts.

### 3.3 Market Metrics (`/admin/market-metrics`)
- **Inputs:** Admin navigates to `/admin/market-metrics`. Data from permits, permit_trades, trades, neighbourhoods, `mv_monthly_permit_stats` materialized view (migration 034).
- **Core Logic:**
  - `GET /api/admin/market-metrics` returns 6 sections: KPI row, activity by project type, leads by trade, residential/commercial split, scope tags breakdown, neighbourhood wealth tiers.
  - Wealth tiers: high ($100K+), middle ($60-100K), lower (<$60K) based on `avg_household_income`. YoY comparison: current 30-day window vs same window last year.
  - Helpers in `src/lib/market-metrics/helpers.ts`: `formatCurrency()`, `mapPermitType()`, `trendPct()`.
- **Outputs:** 6-section dashboard with KPI row, charts, wealth-tier cards with YoY trends.
- **Edge Cases:** Null income neighbourhoods excluded. No prior year data → null YoY change.
</behavior>

---

<testing>
## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **UI:** `admin.ui.test.tsx` (273 tests — sync status, HealthCards, pipeline triggers, toggles, FreshnessTimeline, funnel accordion, Run All safeguards, mobile viewport)
- **Logic:** `analytics.logic.test.ts` (getPermitsByDateRange, getTradeDistribution, getCostByWard, getStatusDistribution, getTopBuilders, getPermitTrends)
- **Logic:** `market-metrics.logic.test.ts` (materialized view, formatCurrency, mapPermitType, trendPct, wealth tiers)
<!-- TEST_INJECT_END -->
</testing>

---

<constraints>
## 5. Operating Boundaries

### Target Files
- `src/app/admin/page.tsx`, `src/app/admin/market-metrics/page.tsx`
- `src/app/api/admin/stats/route.ts`, `src/app/api/admin/pipelines/[slug]/route.ts`
- `src/app/api/admin/market-metrics/route.ts`
- `src/lib/admin/helpers.ts`, `src/lib/admin/types.ts`, `src/lib/admin/funnel.ts`
- `src/lib/analytics/queries.ts`, `src/lib/market-metrics/helpers.ts`
- `src/components/DataQualityDashboard.tsx`, `src/components/FreshnessTimeline.tsx`

### Out-of-Scope Files
- `scripts/run-chain.js` — governed by `40_pipeline_system.md`
- `src/lib/classification/` — governed by classification specs
- `src/lib/quality/` — data quality logic

### Cross-Spec Dependencies
- **Relies on:** `13_authentication.md` (admin access control), `01_database_schema.md` (pipeline_runs table)
- **Relies on:** `40_pipeline_system.md` (chain orchestrator, manifest)
</constraints>
