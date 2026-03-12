# Active Task: Engine Health & Volume Volatility
**Status:** Implementation Complete — Ready for WF6
**Workflow:** WF1 — New Feature Genesis
**Rollback Anchor:** `657e47f7` (657e47f7f6b474efe3f2721ea325fc61e695a096)

## Context
* **Goal:** Add engine-level health monitoring (dead tuples, index usage, seq-scan ratio) and volume volatility spike detection to the Data Quality Dashboard. This extends the existing CQA framework with a "Tier 3" engine health layer — capturing PostgreSQL maintenance health and detecting update ping-pong patterns that indicate script inefficiency.
* **Target Spec:** `docs/specs/28_data_quality_dashboard.md` (extends existing CQA tiers)
* **Key Files:**
  - `scripts/lib/pipeline.js` — extend `captureTelemetry`/`diffTelemetry` with engine stats
  - `scripts/quality/assert-engine-health.js` — NEW CQA Tier 3 validation script
  - `src/lib/quality/types.ts` — add `EngineHealthAnomaly` type + detection logic
  - `src/app/api/quality/route.ts` — return engine health data
  - `src/lib/quality/metrics.ts` — capture engine stats in snapshots
  - `scripts/manifest.json` — register `assert_engine_health` step
  - `src/lib/admin/funnel.ts` — add step description

## Technical Implementation
* **New/Modified Components:** None (backend + dashboard integration only, rendered in existing `TelemetrySection` / health banner)
* **Data Hooks/Libs:**
  - `src/lib/quality/types.ts` — `EngineHealthAnomaly`, `detectEngineHealthIssues()`, extended `computeSystemHealth()`
  - `scripts/quality/assert-engine-health.js` — standalone CQA Tier 3 script using Pipeline SDK
  - `scripts/lib/pipeline.js` — extend telemetry to capture `n_dead_tup`, `n_live_tup`, `seq_scan`, `idx_scan`
* **Database Impact:** YES — migration `051_engine_health_snapshots.sql` adds `engine_health_snapshots` table for historical tracking of dead tuple ratios and index usage per table.

## Standards Compliance
* **Try-Catch Boundary:** `GET /api/quality` already has overarching try-catch; new engine health query will be wrapped in its own inner try-catch (non-fatal if table doesn't exist yet).
* **Unhappy Path Tests:** Test for: `engine_health_snapshots` table missing (graceful skip), zero rows in `pg_stat_user_tables` (empty result), dead tuple ratio above threshold (anomaly flagged), all-sequential-scans table (anomaly flagged).
* **logError Mandate:** Any new catch blocks in API route will use `logError(tag, err, context)`.
* **Mobile-First:** N/A — no new UI components; data surfaces through existing dashboard components.

## Execution Plan
- [ ] **Contract Definition:** Define `EngineHealthSnapshot` and `EngineHealthAnomaly` TypeScript interfaces. Define response shape extension for `GET /api/quality`.
- [ ] **Spec & Registry Sync:** Update `docs/specs/28_data_quality_dashboard.md` with Tier 3 CQA section. Add `assert_engine_health` to `scripts/manifest.json`. Run `npm run system-map`.
- [ ] **Schema Evolution:** Write `migrations/051_engine_health_snapshots.sql` (UP + DOWN). Table: `engine_health_snapshots(id, table_name, snapshot_date, n_live_tup, n_dead_tup, dead_ratio, seq_scan, idx_scan, seq_ratio, captured_at)`. Run `npm run migrate`, `npm run db:generate`. Update factories.
- [ ] **Test Scaffolding:** Add engine health tests to `src/tests/quality.logic.test.ts` and `src/tests/quality.infra.test.ts`.
- [ ] **Red Light:** Run `npm run test`. Must see failing tests.
- [ ] **Implementation:**
  - Extend `captureTelemetry`/`diffTelemetry` in `scripts/lib/pipeline.js` to include `n_dead_tup`, `n_live_tup`, `seq_scan`, `idx_scan` (T6 engine stats).
  - Create `scripts/quality/assert-engine-health.js` — queries `pg_stat_user_tables` for all telemetry tables, flags: dead tuple ratio > 10%, seq scan ratio > 80% (on tables with > 10K rows), update ping-pong (n_tup_upd > 2× n_tup_ins in last run).
  - Add `EngineHealthAnomaly` type and `detectEngineHealthIssues()` to `src/lib/quality/types.ts`.
  - Extend `GET /api/quality` to query engine health and include in response.
  - Register in `scripts/manifest.json` chains (after `assert_data_bounds`).
  - Add `STEP_DESCRIPTIONS` entry in `src/lib/admin/funnel.ts`.
- [ ] **Auth Boundary & Secrets:** `/api/quality` is already admin-guarded. No new routes. No secrets exposed.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass.
