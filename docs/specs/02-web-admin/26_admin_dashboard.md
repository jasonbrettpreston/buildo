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

### 3.4 Engine Health (`GET /api/quality`)
- **Inputs:** none. `/api/quality` is classified **`public`** — unauthenticated (`src/lib/auth/route-guard.ts`, locked by `middleware.logic.test.ts` / `api.infra.test.ts`). The dashboard fetches it on load.
- **Core Logic:**
  - The route reads `pg_stat_user_tables` **live, on every request**, over a **curated 11-table list** (`permits`, `entities`, `coa_applications`, `parcels`, `address_points`, `building_footprints`, `neighbourhoods`, `permit_trades`, `permit_parcels`, `parcel_buildings`, `wsib_registry`). Both properties are deliberate, not inherited accident:
    - **Liveness is load-bearing.** `assert_engine_health` writes `engine_health_snapshots` per *chain run*, and the observed cadence is **not daily** — `snapshot_date` values measured 2026-09-15 were 2026-09-14, 2026-08-24, 2026-08-01, 2026-07-17. Serving the dashboard from that table would silently age the panel by up to three weeks.
    - **Scope is a disclosure decision.** The step discovers all 87 `public` tables. Publishing that set from an unauthenticated route would expose row counts for `admin_backup_codes`, `admin_audit_log`, `subscribe_nonces`, `stripe_webhook_events`, `profiles`, `user_profiles` and `device_tokens`. Widening 11 → 87 is therefore **blocked on an auth/disclosure ruling for `/api/quality`**, filed in `docs/reports/review_followups.md`.
  - **What POST-B1-2 retired is the second THRESHOLD source, not the query.** Every threshold applied here now comes from the same 7 `engine_health_*` `logic_variables` rows `assert_engine_health` reads through `ctx.config`, resolved by a targeted `SELECT variable_key, variable_value FROM logic_variables WHERE variable_key = ANY($1)`. `loadAllConfigs()` is deliberately not used — a public handler must not pull the whole tuning table into memory (§4.3 projected fields). All 7 are admin-tunable through the Control Panel's **"Data Quality Thresholds"** group (`logic-variable-groups.json`). Before this, the admin carried its own `ENGINE_HEALTH_THRESHOLDS` literals and had drifted: its ping-pong ceiling was still `2` while the seeded `engine_health_ping_pong_ratio_warn_max` had been `10` since `8c9e64d7` (2026-03-21), and it had no `engine_health_dead_tuple_min_rows` at all.
  - **Predicate parity.** `detectEngineHealthIssues` (`src/lib/quality/types.ts`) applies exactly the two predicates `scripts/lib/compute/assert-engine-health.js` `buildTableResults` applies: dead-tuple ratio above `engine_health_dead_tuple_ratio_warn_max` on tables with at least `engine_health_dead_tuple_min_rows` live rows, and seq-scan ratio above `engine_health_seq_scan_ratio_warn_max` on tables with at least `engine_health_seq_scan_min_rows` live rows. Both ratios are recomputed **unrounded** from the integer counters — the 4-decimal `dead_ratio`/`seq_ratio` fields are display values, and comparing them would put admin and pipeline on opposite sides of a threshold in a ~5e-5 band. Anomalies reach the user as `health.warnings` via `computeSystemHealth`, i.e. the dashboard's health banner, not a table.
  - **`update_ping_pong` is RETIRED from the admin** (POST-B1-2 Q2a). It was driven by a `pgStats` argument the production call site never supplied, so it had never fired. The check still runs every chain run inside `assert_engine_health` against `engine_health_ping_pong_ratio_warn_max`. The `'update_ping_pong'` member of `EngineHealthAnomaly['type']` is retained as shared vocabulary.
  - **No staleness field.** The read is live, so there is nothing to declare as-of. `engine_health_snapshots` is not a dependency of this surface.
- **Outputs:** `engineHealth: EngineHealthEntry[]`, `engineHealthAnomalies: EngineHealthAnomaly[]` (`EngineHealthPayload`). No field was added, removed, renamed or narrowed by POST-B1-2.
- **Edge Cases:** no rows / unreadable `pg_stat_user_tables` → inner catch + `logError('[api/quality]', err, { phase: 'engine_health' })`, `engineHealth: []`, the rest of the quality payload still returned 200 · a missing or non-numeric `engine_health_*` row → the Zod boundary rejects it, the seeded module default (`ENGINE_HEALTH_DEFAULTS`) is used, and the fallback is `logError`-ed per key — never silently swallowed, never coerced to `NaN` · `logic_variables` itself unavailable → all 7 defaults, one `logError`.
- **Locks:** `quality.infra.test.ts` "Engine health has ONE threshold source (POST-B1-2)" (source-text + both-direction defaults-vs-seed) **and** "GET /api/quality — engine health uses the logic_variables threshold (POST-B1-2, behavioural)", which drives the real handler with a stubbed pool and asserts the emitted `threshold` is the stubbed row's value, not the module default; `docs/specs/_contracts.json` `engine_health` + `contracts.infra.test.ts` pin the seed ↔ TS-default literals (§11 Cross-Layer Contracts).

</behavior>

---

<testing>
## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **UI:** `admin.ui.test.tsx` (273 tests — sync status, HealthCards, pipeline triggers, toggles, FreshnessTimeline, funnel accordion, Run All safeguards, mobile viewport)
- **UI:** `FreshnessTimeline.ui.test.tsx` (11 tests — ColumnarAuditTable multi-schema rowKey: Global Coverage schema, Score Engine schema, unknown schema, metric=0/null/empty edge cases, mixed-schema uniqueness, source-shape guards)
- **Logic:** `analytics.logic.test.ts` (getPermitsByDateRange, getTradeDistribution, getCostByWard, getStatusDistribution, getTopBuilders, getPermitTrends)
- **Logic:** `market-metrics.logic.test.ts` (materialized view, formatCurrency, mapPermitType, trendPct, wealth tiers)
- **Infra:** `quality.infra.test.ts` (§3.4 engine health — response shape, snapshot-table schema, and the POST-B1-2 "ONE threshold source" lock: admin defaults ≡ seeded `engine_health_*` defaults, route reads `engine_health_snapshots`, step still owns discovery)
- **Logic:** `quality.logic.test.ts` (§3.4 `detectEngineHealthIssues` — dead-tuple/seq-scan checks, injected thresholds, min-rows floor, `update_ping_pong` retirement)
- **Infra:** `contracts.infra.test.ts` (§3.4 `engine_health` cross-layer contract — seed JSON ↔ `ENGINE_HEALTH_DEFAULTS`)
<!-- TEST_INJECT_END -->
</testing>

---

<constraints>
## 5. Operating Boundaries

### Target Files
- `src/app/admin/page.tsx`, `src/app/admin/market-metrics/page.tsx`
- `src/app/api/admin/stats/route.ts`, `src/app/api/admin/pipelines/[slug]/route.ts`
- `src/app/api/admin/market-metrics/route.ts`
- `src/app/api/quality/route.ts` (§3.4 engine health — public route, Expo consumers: none)
- `src/lib/quality/types.ts` (§3.4 `ENGINE_HEALTH_DEFAULTS`, `detectEngineHealthIssues`, `EngineHealthPayload`)
- `src/lib/admin/helpers.ts`, `src/lib/admin/types.ts`, `src/lib/admin/funnel.ts`
- `src/lib/analytics/queries.ts`, `src/lib/market-metrics/helpers.ts`
- `src/components/DataQualityDashboard.tsx`, `src/components/FreshnessTimeline.tsx`

### Out-of-Scope Files
- `scripts/run-chain.js` — governed by `40_pipeline_system.md`
- `src/lib/classification/` — governed by classification specs
- `src/lib/quality/` **except `types.ts`** — the snapshot/trend metrics logic (`metrics.ts` and friends) stays out of scope; POST-B1-2 moved `types.ts` into Target Files above because §3.4's engine-health contract lives there
- `scripts/quality/assert-engine-health.js`, `scripts/lib/compute/assert-engine-health.js`, their descriptor and golden captures — the §3.4 PRODUCER, governed by `01-pipeline/41_chain_permits.md` + Spec 124. This spec describes only the READ.
- `scripts/seeds/logic_variables.json` `engine_health_*` values — the seeded defaults are correct and are the step's, not the admin's, to change.
- `engine_health_snapshots` (migration 051) — written by `assert_engine_health`, deliberately NOT read by this surface (§3.4). Retiring or repointing that table is governed by `01-pipeline/49_data_completeness_profiling.md`, not here.

### Cross-Spec Dependencies
- **Relies on:** `13_authentication.md` (admin access control), `01_database_schema.md` (pipeline_runs table)
- **Relies on:** `40_pipeline_system.md` (chain orchestrator, manifest)
- **Relies on:** `01-pipeline/41_chain_permits.md` §"Engine health" + `01-pipeline/124_step_standard_policy.md` **R-AE** — `assert_engine_health` is the sibling implementation of §3.4's checks and the co-owner of the 7 `engine_health_*` logic variables. §3.4 shares its THRESHOLDS and its predicates; it does not consume its write.
- **Extended by:** `76_lead_feed_health_dashboard.md` (lead feed observability, test feed tool — shares `src/app/admin/page.tsx`)
</constraints>
