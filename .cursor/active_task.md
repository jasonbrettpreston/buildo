# Active Task: Stream B — Raw DB Transparency Dashboard
**Status:** Planning

## Context
* **Goal:** Rewrite the pipeline dashboard to render raw DB values directly from `pipeline_runs`, eliminating interpreted/hardcoded dashboard logic. Implement DB transparency features T1–T5: pre/post row counts (T1), pg_stat diffs (T2), live DB state bar (T3), NULL fill audits (T4), and historical sparklines (T5). This eliminates bugs #1, #2, #3, #8, #9 from the WF5 audit.
* **Target Spec:** `docs/specs/28_data_quality_dashboard.md` (primary), `docs/specs/37_pipeline_system.md` (secondary)
* **Rollback Anchor:** `2b15e29`
* **Key Files:**
  - `scripts/lib/pipeline.js` — Add pre/post telemetry hooks for T1, T2, T4
  - `scripts/run-chain.js` — Inject telemetry capture around step execution
  - `src/components/FreshnessTimeline.tsx` — Simplify `getStatusDot()`, add T3 live counts, T5 sparklines
  - `src/components/funnel/FunnelPanels.tsx` — Upgrade DataFlowTile with T1/T2/T4 inline metrics
  - `src/app/api/admin/stats/route.ts` — Return T3 live counts
  - `src/app/api/admin/pipelines/history/route.ts` — NEW: T5 historical runs endpoint
  - `src/lib/admin/funnel.ts` — Add telemetry types
  - `src/tests/quality.ui.test.tsx` — UI tests for new components
  - `src/tests/quality.infra.test.ts` — API shape tests for new endpoint
  - `src/tests/pipeline-sdk.logic.test.ts` — Telemetry function tests

## Technical Implementation

### Phase 1: Database Telemetry (T1, T2, T4)
**Pipeline SDK changes (`scripts/lib/pipeline.js`):**
- New `captureTelemetry(pool, tables)` — captures pre-run state:
  - T1: `SELECT count(*) FROM <table>` for each target table
  - T2: `SELECT n_tup_ins, n_tup_upd, n_tup_del FROM pg_stat_user_tables WHERE relname = $1`
  - T4: `SELECT count(*) FILTER (WHERE <col> IS NULL) FROM <table>` for configured enrichment columns
- New `diffTelemetry(pool, tables, preTelemetry)` — captures post-run state, computes deltas
- Returns `{ counts: { table: { before, after, delta } }, pg_stats: { table: { ins, upd, del } }, null_fills: { table: { col: { before, after, filled } } } }`

**Chain orchestrator changes (`scripts/run-chain.js`):**
- Before each step: call `captureTelemetry()` with step's write tables (from `STEP_DESCRIPTIONS` or `PIPELINE_META`)
- After each step: call `diffTelemetry()` in a `finally` block, merge into `records_meta.telemetry`
- **On step failure:** `diffTelemetry()` still runs — partial telemetry (e.g., "5,000 rows inserted before crash") is invaluable debugging context. The telemetry is stored even when step status is `failed`.
- Store in existing `records_meta` JSONB (no new column needed — `records_meta` already exists)

**Why records_meta, not a new `metrics` column:** The `records_meta` JSONB column (migration 041) already stores per-run metadata. Adding telemetry as a nested key (`records_meta.telemetry`) avoids a migration and keeps the schema stable. The Gemini reference suggested a separate `metrics` column, but collocating in `records_meta` is simpler and already has API plumbing.

### Phase 2: Simplify getStatusDot() (Bugs #1, #2, #3, #8, #9)
**Current:** 7 status states with freshness math, stale detection, and exemption logic.
**New:** Direct 1:1 mapping from DB `status` field:
- `running` → blue (with flash animation)
- `completed` → green
- `failed` → red
- `skipped` → gray
- `cancelled` → gray
- `pending` (chain step not yet started) → neutral/empty
- Never run → empty
- Freshness labels (Fresh/Recent/Aging/Overdue) move to a separate inline badge based on `last_run_at`, decoupled from the status dot color.
- **Stale detection removed** — the raw `records_new`/`records_updated` values are shown directly on the tile; users see the numbers and decide for themselves.

### Phase 3: Live DB State (T3)
**API changes (`/api/admin/stats`):**
- Add `live_table_counts` to response: `{ permits: N, builders: N, coa_applications: N, parcels: N, ... }`
- Uses `pg_class.reltuples` for fast approximate counts (no `SELECT count(*)` on large tables)

**UI changes (`FreshnessTimeline.tsx`):**
- New `LiveStateBar` section at top of each chain showing target table row counts
- Format: `permits 239K | builders 48K | parcels 487K`
- Polls with existing `/api/admin/pipelines/status` cycle (no new polling)

### Phase 4: Historical Sparklines (T5)
**New API route (`/api/admin/pipelines/history/route.ts`):**
- `GET /api/admin/pipelines/history?slug=load_permits&limit=10`
- Returns last N runs: `[{ started_at, duration_ms, records_total, records_new, status }]`
- Guarded by admin middleware (same as other `/api/admin/` routes)

**UI changes:**
- New `Sparkline` SVG component (inline, ~40px × 16px)
- Renders duration trend line (last 10 runs) next to pipeline name
- Green dots = completed, red dots = failed
- No external charting library — pure SVG path

### Phase 5: Upgraded DataFlowTile (T1, T2, T4 rendering)
**FunnelPanels.tsx DataFlowTile upgrade:**
- Below reads/writes schema, add "Last Run Telemetry" section:
  - T1: `permits: 47,100 → 47,192 (+92)` with green/red delta coloring
  - T2: `Ins: 80 | Upd: 12 | Del: 0` badges (green/blue/red)
  - T4: `geometry: 15% null → 2% null (260 filled)` with fill-rate progress bar
- Only shown when `records_meta.telemetry` exists (progressive enhancement)

* **New/Modified Components:** `FreshnessTimeline.tsx` (major), `FunnelPanels.tsx` (major), `Sparkline` (new inline SVG, in FunnelPanels), `LiveStateBar` (new section in FreshnessTimeline)
* **Data Hooks/Libs:** `scripts/lib/pipeline.js` (telemetry), `scripts/run-chain.js` (hooks), `src/lib/admin/funnel.ts` (types)
* **Database Impact:** NO — reuses existing `records_meta` JSONB column. No new migration needed.

## Standards Compliance (Full Inline — all 00_engineering_standards.md sections)

### §1.1 Mobile-First UI Mandate
- **Status:** APPLICABLE — new UI components (LiveStateBar, Sparkline, telemetry section).
- **Plan:** Base classes = mobile (stacked, full-width). `md:` = desktop (inline, side-by-side). Sparklines hidden on mobile (too small for touch). LiveStateBar wraps to 2 rows on narrow screens.

### §1.2 Component Isolation
- **Status:** APPLICABLE — Sparkline is a self-contained SVG component. LiveStateBar is a section within FreshnessTimeline, not a standalone component.

### §2.1 The "Unhappy Path" Test Mandate
- **Status:** APPLICABLE — new API route `/api/admin/pipelines/history`.
- **Plan:** Test 400 (missing slug param), empty array for unknown slug, 500 (DB error).

### §2.2 The Try-Catch Boundary Rule
- **Status:** APPLICABLE — new API route.
- **Plan:** Overarching try-catch with `logError('pipeline-history', err, { slug })`.

### §2.3 Assumption Documentation
- **Status:** APPLICABLE — `pg_class.reltuples` is approximate. Document that T3 counts are estimates, not exact.

### §3.1 Zero-Downtime Migration Pattern
- **Status:** NOT APPLICABLE — no schema changes. Reusing `records_meta` JSONB.

### §3.2 Migration Rollback Safety
- **Status:** NOT APPLICABLE — no migrations.

### §3.3 Pagination Enforcement
- **Status:** APPLICABLE — `/api/admin/pipelines/history` uses `limit` param (default 10, max 50).

### §4.1 Route Guarding
- **Status:** APPLICABLE — new route under `/api/admin/` prefix (already guarded by middleware).

### §4.2 Parameterization
- **Status:** APPLICABLE — history query uses `$1` parameterized slug, `$2` limit.

### §5.1 Typed Factories Only
- **Status:** NOT APPLICABLE — no new DB models. Telemetry is JSONB within existing `pipeline_runs`.

### §5.2 Test File Pattern
- **Status:** APPLICABLE:
  - `quality.ui.test.tsx` — Sparkline rendering, LiveStateBar rendering, telemetry section rendering, getStatusDot simplification
  - `quality.infra.test.ts` — `/api/admin/pipelines/history` shape, error cases
  - `pipeline-sdk.logic.test.ts` — telemetry capture/diff functions

### §5.3 Red-Green Test Cycle
- **Status:** APPLICABLE — write failing tests for new getStatusDot, Sparkline, history API before implementation.

### §5.4 Test Data Seeding
- **Status:** NOT APPLICABLE — mock data for UI tests, no DB seeding needed.

### §6.1 logError Mandate
- **Status:** APPLICABLE — new API route catch block must use `logError`.

### §7.1 Classification Sync Rule
- **Status:** NOT APPLICABLE — not touching classification logic.

### §7.2 Scope Classification Sync
- **Status:** NOT APPLICABLE.

### §8.1 API Route Export Rule
- **Status:** APPLICABLE — new route exports only `GET` handler.

### §8.2 TypeScript Target Gotchas
- **Status:** NOT APPLICABLE — no edge cases.

### §9.1 Transaction Boundaries
- **Status:** NOT APPLICABLE — telemetry capture is read-only (SELECT count, pg_stat queries).

### §9.2 PostgreSQL Parameter Limit
- **Status:** NOT APPLICABLE — no batch inserts.

### §9.3 Idempotent Scripts
- **Status:** PRESERVED — telemetry is observational, doesn't affect pipeline logic.

### §9.4 Pipeline SDK Mandate
- **Status:** APPLICABLE — new `captureTelemetry` / `diffTelemetry` added to SDK.

### §9.5 Streaming Ingestion
- **Status:** NOT APPLICABLE — no external API ingestion.

### §9.6 Pipeline Manifest
- **Status:** NOT AFFECTED — no new scripts.

### §9.7 Pipeline Observability
- **Status:** ENHANCED — telemetry hooks add deeper observability without modifying OTel tracing.

## §10 Plan Compliance Checklist

### If Database Impact = YES:
⬜ N/A — Database Impact is NO. Reusing existing `records_meta` JSONB column.

### If API Route Created/Modified:
- ✅ Request/Response TypeScript interface defined BEFORE implementation — `PipelineHistoryResponse` type
- ✅ Overarching try-catch with `logError(tag, err, context)` (§2.2, §6.1)
- ✅ Unhappy-path test cases listed: 400 (missing slug), empty array for unknown slug, 500 (DB error) (§2.1)
- ✅ Route guarded in `src/middleware.ts` — `/api/admin/` prefix already guarded (§4.1)
- ✅ No `.env` secrets exposed to client components

### If UI Component Created/Modified:
- ✅ Mobile-first layout: base classes = mobile, `md:`/`lg:` = desktop (§1.1) — Sparkline hidden on mobile, LiveStateBar wraps, telemetry section stacks
- ✅ Touch targets ≥ 44px (§1.1) — no new interactive elements below 44px
- ✅ 375px viewport test in test plan — quality.ui.test.tsx will test narrow viewport

### If Shared Logic Touched (classification, scoring, scope):
⬜ N/A — Not touching classification, scoring, or scope logic.

### If Pipeline Script Created/Modified:
- ✅ Uses Pipeline SDK: telemetry functions added to `scripts/lib/pipeline.js` (§9.4)
- ⬜ Streaming ingestion N/A — telemetry is read-only COUNT/pg_stat queries (§9.5)

## Execution Plan

- [ ] **State Verification:** Confirm current `getStatusDot()` behavior, `records_meta` structure, existing FreshnessTimeline rendering. Identify all bugs (#1, #2, #3, #8, #9) in current code.
- [ ] **Contract Definition:** Define `PipelineHistoryResponse` TypeScript interface. Define `TelemetrySnapshot` type for `records_meta.telemetry`.
- [ ] **Spec Update:** Update `docs/specs/28_data_quality_dashboard.md`:
  - Add §DB Transparency Features (T1–T5) section
  - Document `getStatusDot()` simplification
  - Document telemetry JSONB structure in `records_meta`
  - Update `docs/specs/37_pipeline_system.md`:
    - §3.1 SDK exports table: add `captureTelemetry(pool, tables)`, `diffTelemetry(pool, tables, pre)`
    - §3.5 or new §3.8: document telemetry protocol (pre/post capture, finally-block guarantee, JSONB structure)
  - Run `npm run system-map`.
- [ ] **Schema Evolution:** N/A — no migration needed.
- [ ] **Guardrail Test:** Add tests:
  1. `quality.ui.test.tsx`: simplified `getStatusDot()` returns correct colors for all DB statuses, Sparkline renders SVG path from run data, LiveStateBar renders table counts, telemetry section renders T1/T2/T4 deltas, 375px viewport
  2. `quality.infra.test.ts`: `/api/admin/pipelines/history` returns correct shape, 400 on missing slug, empty array for unknown slug
  3. `pipeline-sdk.logic.test.ts`: `captureTelemetry()` returns counts/pg_stats, `diffTelemetry()` computes correct deltas
- [ ] **Red Light:** Run tests — new tests MUST fail.
- [ ] **Implementation:**
  1. **Pipeline SDK telemetry** (`scripts/lib/pipeline.js`): Add `captureTelemetry()`, `diffTelemetry()`, export both
  2. **Chain orchestrator** (`scripts/run-chain.js`): Wrap step execution with pre/post telemetry, store in `records_meta.telemetry`
  3. **History API** (`src/app/api/admin/pipelines/history/route.ts`): New GET endpoint returning last N runs
  4. **Stats API** (`src/app/api/admin/stats/route.ts`): Add `live_table_counts` using `pg_class.reltuples`
  5. **Simplify getStatusDot()** (`src/components/FreshnessTimeline.tsx`): Direct DB status → color map, remove stale detection, add freshness badge
  6. **LiveStateBar** (`src/components/FreshnessTimeline.tsx`): Render table counts at chain header
  7. **Sparkline** (`src/components/funnel/FunnelPanels.tsx`): Inline SVG component for duration trend
  8. **DataFlowTile upgrade** (`src/components/funnel/FunnelPanels.tsx`): Add T1/T2/T4 telemetry rendering below schema
  9. **Spec updates** (`docs/specs/28_data_quality_dashboard.md` + `docs/specs/37_pipeline_system.md`)
- [ ] **UI Regression Check:** `npx vitest run src/tests/quality.ui.test.tsx src/tests/ui.test.tsx`
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass.
  Output visible execution summary using ✅/⬜ for every step above. → WF6.
