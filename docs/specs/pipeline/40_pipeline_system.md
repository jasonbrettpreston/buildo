# Pipeline System Architecture

<requirements>
## 1. Goal & User Story
As a developer modifying any pipeline script, I need a single reference for the Pipeline SDK contract, chain orchestration model, manifest schema, telemetry protocol, and quality gate behavior — so I can make changes confidently without breaking upstream/downstream dependencies.
</requirements>

---

<architecture>
## 2. System Overview

### 2.1 Component Topology

```
manifest.json (chain definitions + script registry)
       │
       ▼
run-chain.js (orchestrator)
       │
       ├── pipeline.js SDK (pool, transactions, logging, telemetry)
       │
       ├── Step 1: assert_schema ──→ pipeline_runs row
       ├── Step 2: load-permits  ──→ pipeline_runs row + PIPELINE_SUMMARY
       ├── Step N: ...           ──→ pipeline_runs row + PIPELINE_SUMMARY
       │
       └── Chain pipeline_runs row (aggregates all step verdicts)
```

### 2.2 Pipeline SDK (`scripts/lib/pipeline.js`)

The mandatory infrastructure layer for all pipeline scripts. No script may instantiate its own `Pool`, write bare `console.error`, or call `process.exit()` inside a `pipeline.run()` callback.

| Export | Signature | Purpose |
|--------|-----------|---------|
| `run(name, fn)` | `(string, (Pool) => Promise<void>) => Promise<void>` | Lifecycle wrapper: pool → fn(pool) → pool.end(). Throws on error (no process.exit). |
| `createPool()` | `() => Pool` | PostgreSQL pool using `PG_*` env vars. Called internally by `run()`. |
| `withTransaction(pool, fn)` | `(Pool, (PoolClient) => Promise<T>) => Promise<T>` | BEGIN → fn → COMMIT. ROLLBACK on error (nested try-catch per §9.1). |
| `log.{info,warn,error}` | `(tag, msg, ctx?) => void` | Structured JSON logging to stdout/stderr. |
| `emitSummary(stats)` | `(SummaryPayload) => void` | Emits `PIPELINE_SUMMARY:{json}` to stdout. Auto-injects `sys_velocity_rows_sec`, `sys_duration_ms`. Accepts opt-in `telemetry_context` for `err_*`/`dq_*` rows (see `30_pipeline_architecture.md` §3). |
| `emitMeta(reads, writes, ext?)` | `(Record, Record, string[]?) => void` | Emits `PIPELINE_META:{json}` to stdout. |
| `progress(label, cur, total, startMs)` | `(string, number, number, number) => void` | Progress percentage + elapsed time + velocity (rows/s). |
| `streamQuery(pool, sql, params?, opts?)` | `async function*(Pool, string, any[], {batchSize?}) => AsyncGenerator<Row>` | Streaming cursor via `pg-query-stream`. Yields one row at a time, preventing OOM on large tables. |
| `classifyError(err)` | `(Error) => string` | Auto-categorize errors: network, timeout, parse, database, file_not_found, unknown (B23). |
| `checkQueueAge(pool, table, col, opts?)` | `(Pool, string, string, {where?, warnMinutes?, label?}) => Promise<{maxAgeMinutes, count}>` | Check oldest unprocessed item age. Warns if above threshold (B20). |
| `checkBounds(pool, table, bounds, label?)` | `(Pool, string, Record<string, {min?, max?}>, string?) => Promise<Array<{column, violations}>>` | Semantic bounds check on column values. Logs violations (B22). |
| `track(new, updated)` | `(number, number) => void` | Increment running record counters. |
| `captureTelemetry(pool, tables, nullCols?)` | `(Pool, string[], Record?) => Promise<Snapshot>` | T1/T2/T4/T6 pre-run state capture. |
| `diffTelemetry(pool, tables, pre)` | `(Pool, string[], Snapshot) => Promise<Diff>` | Post-run diff against pre-run snapshot. |
| `quoteIdent(name)` | `(string) => string` | Safe PostgreSQL identifier quoting. |
| `maxRowsPerInsert(cols)` | `(number) => number` | Max rows to stay under 65,535 param limit. |
| `isFullMode()` | `() => boolean` | Returns true if `--full` flag present. |
| `BATCH_SIZE` | `number` | Default batch size (1000). |

### 2.3 PIPELINE_SUMMARY Protocol

Every script emits exactly one summary line before exit:

```json
PIPELINE_SUMMARY:{"records_total":237000,"records_new":142,"records_updated":58,"records_meta":{"audit_table":{...}}}
```

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| `records_total` | number | Yes | Total records processed |
| `records_new` | number\|null | Yes | New records created. `null` = not applicable (CQA scripts). |
| `records_updated` | number\|null | Yes | Existing records modified. |
| `records_meta` | object\|null | No | Arbitrary metadata — audit tables, scraper telemetry, etc. |

### 2.4 PIPELINE_META Protocol

Documents the I/O contract of each script:

```json
PIPELINE_META:{"reads":{"permits":["permit_num","status"]},"writes":{"permit_trades":["trade_id","confidence"]},"external":["CKAN API"]}
```

### 2.5 Telemetry Tiers

Captured by `run-chain.js` before and after each step via the SDK:

| Tier | What | Source | Storage |
|------|------|--------|---------|
| T1 | Row count deltas per table | `SELECT count(*) FROM {table}` | `records_meta.telemetry.counts` |
| T2 | PostgreSQL mutation counters | `pg_stat_user_tables` (ins/upd/del) | `records_meta.telemetry.pg_stats` |
| T4 | NULL fill rate changes | `count(*) WHERE {col} IS NULL` | `records_meta.telemetry.null_fills` |
| T6 | Engine health (dead tuples, seq scans) | `pg_stat_user_tables` | `records_meta.telemetry.engine` |

Tables and NULL columns per script are declared in `manifest.json` under `telemetry_tables` and `telemetry_null_cols`.
</architecture>

---

<behavior>
## 3. Chain Orchestrator (`scripts/run-chain.js`)

### 3.1 Execution Model

```
node scripts/run-chain.js <chain_id> [run_id] [--force]
```

1. Reads chain definition from `manifest.json`
2. Inserts `pipeline_runs` row with `status='running'` for the chain
3. **Phase 0 Pre-Flight Health Gate:** Queries `pg_stat_user_tables` for all chain tables' dead tuple ratio. Emits Phase 0 `audit_table` with `sys_db_bloat_*` metrics. Stored in chain `records_meta.pre_flight_audit`.
4. For each step in sequence:
   a. Check for cancellation (`pipeline_runs.status = 'cancelled'`)
   b. Check if step is disabled (`pipeline_schedules.enabled = FALSE`)
   c. Check gate-skip (primary ingest had 0 new records → skip non-infra steps)
   d. Insert step-scoped `pipeline_runs` row (`{chain}:{step}`)
   f. Capture pre-telemetry (T1/T2/T4/T6)
   g. Spawn child process (`node` or `python3`) with `stdio: ['inherit', 'pipe', 'inherit']`
   h. Stream stdout, buffer `PIPELINE_SUMMARY:` and `PIPELINE_META:` lines
   i. On exit code 0: parse summary, capture post-telemetry, update step row to `completed`
   j. On exit code 1: update step row to `failed`, **stop chain** (no subsequent steps run)
5. Update chain `pipeline_runs` row with aggregate duration, status, verdicts

### 3.2 Gate-Skip Logic

The `chain_gates` manifest key maps chains to their primary ingest step:
```json
{ "permits": "permits", "coa": "coa" }
```

If the gate step's `records_new` is 0, downstream enrichment steps are skipped — but infrastructure steps (`assert_*`, `classify_*`, `refresh_snapshot`, `close_stale_permits`) always run because they check cumulative DB state, not just the latest batch.

### 3.3 Step Scoping

Steps are scoped to their chain in `pipeline_runs` via `{chain_id}:{step_slug}` (e.g., `permits:assert_schema`). This prevents status bleed when the same step (like `assert_data_bounds`) runs in multiple chains.

### 3.4 Child Process Environment

Each step receives:
- All parent env vars
- `PIPELINE_CHAIN={chain_id}` — lets scripts adjust behavior per chain
- Step-specific env from `manifest.scripts[slug].env`
- Chain-specific args from `manifest.scripts[slug].chain_args[chain_id]`
</behavior>

---

<schema>
## 4. Manifest Schema (`scripts/manifest.json`)

### 4.1 Script Entry

```json
{
  "file": "scripts/load-permits.js",
  "supports_full": false,
  "supports_dry_run": false,
  "telemetry_tables": ["permits"],
  "telemetry_null_cols": { "permits": ["latitude", "longitude"] },
  "env": { "SOME_FLAG": "1" },
  "chain_args": { "sources": ["--full"] },
  "deprecated": false,
  "coming_soon": false
}
```

### 4.2 Chain Definition

Ordered array of script slugs. Execution is strictly sequential, stop-on-failure:

```json
{
  "permits": ["assert_schema", "permits", "close_stale_permits", "classify_permit_phase", "classify_scope", "builders", "link_wsib", "geocode_permits", "link_parcels", "link_neighbourhoods", "link_massing", "link_similar", "classify_permits", "compute_cost_estimates", "compute_timing_calibration_v2", "link_coa", "create_pre_permits", "refresh_snapshot", "assert_data_bounds", "assert_engine_health", "classify_lifecycle_phase", "compute_trade_forecasts", "compute_opportunity_scores", "update_tracked_projects"],
  "coa": ["assert_schema", "coa", "assert_coa_freshness", "link_coa", "create_pre_permits", "assert_pre_permit_aging", "refresh_snapshot", "assert_data_bounds", "assert_engine_health", "classify_lifecycle_phase"],
  "sources": ["assert_schema", "address_points", "geocode_permits", "parcels", "compute_centroids", "link_parcels", "massing", "link_massing", "neighbourhoods", "link_neighbourhoods", "load_wsib", "link_wsib", "refresh_snapshot", "assert_data_bounds", "assert_engine_health"],
  "entities": ["enrich_wsib_builders", "enrich_named_builders"],
  "wsib": ["enrich_wsib_registry"],
  "deep_scrapes": ["inspections", "classify_inspection_status", "assert_network_health", "refresh_snapshot", "assert_data_bounds", "assert_engine_health", "assert_staleness"]
}
```

### 4.3 Current Script Registry (40 scripts)

| Slug | Script | Writes To | Chain(s) |
|------|--------|-----------|----------|
| `permits` | `load-permits.js` | permits | permits |
| `close_stale_permits` | `close-stale-permits.js` | permits | permits |
| `classify_permit_phase` | `classify-permit-phase.js` | permits | permits |
| `coa` | `load-coa.js` | coa_applications | coa |
| `builders` | `extract-builders.js` | entities | permits |
| `address_points` | `load-address-points.js` | address_points | sources |
| `parcels` | `load-parcels.js` | parcels | sources |
| `massing` | `load-massing.js` | building_footprints | sources |
| `neighbourhoods` | `load-neighbourhoods.js` | neighbourhoods | sources |
| `geocode_permits` | `geocode-permits.js` | permits | permits, sources |
| `link_parcels` | `link-parcels.js` | permit_parcels | permits, sources |
| `link_neighbourhoods` | `link-neighbourhoods.js` | permits | permits, sources |
| `link_massing` | `link-massing.js` | parcel_buildings | permits, sources |
| `link_coa` | `link-coa.js` | coa_applications | permits, coa |
| `link_wsib` | `link-wsib.js` | entities | permits, sources |
| `link_similar` | `link-similar.js` | permits | permits |
| `classify_scope` | `classify-scope.js` | permits | permits |
| `classify_permits` | `classify-permits.js` | permit_trades | permits |
| `classify_lifecycle_phase` | `classify-lifecycle-phase.js` | permits, coa_applications, permit_phase_transitions | permits, coa |
| `compute_cost_estimates` | `compute-cost-estimates.js` | cost_estimates | permits |
| `compute_timing_calibration` | `compute-timing-calibration.js` | timing_calibration | — (DEPRECATED; WF3 2026-04-13 removed from chain. Table will go stale until frontend migrates to phase_calibration) |
| `compute_timing_calibration_v2` | `compute-timing-calibration-v2.js` | phase_calibration | permits (feeds spec 85 flight tracker; sole calibration step) |
| `compute_trade_forecasts` | `compute-trade-forecasts.js` | trade_forecasts | permits |
| `compute_opportunity_scores` | `compute-opportunity-scores.js` | trade_forecasts (opportunity_score) | permits |
| `update_tracked_projects` | `update-tracked-projects.js` | tracked_projects, lead_analytics | permits |
| `compute_centroids` | `compute-centroids.js` | parcels | sources |
| `create_pre_permits` | `create-pre-permits.js` | — | permits, coa |
| `refresh_snapshot` | `refresh-snapshot.js` | data_quality_snapshots | all |
| `enrich_wsib_builders` | `enrich-web-search.js` | entities | entities |
| `enrich_named_builders` | `enrich-web-search.js` | entities | entities |
| `load_wsib` | `load-wsib.js` | wsib_registry | sources |
| `inspections` | `aic-orchestrator.py` | permit_inspections, permits | deep_scrapes |
| `classify_inspection_status` | `classify-inspection-status.js` | permits | deep_scrapes |
| `assert_schema` | `quality/assert-schema.js` | pipeline_runs | permits, coa, sources |
| `assert_data_bounds` | `quality/assert-data-bounds.js` | pipeline_runs | permits, coa, sources, deep_scrapes |
| `assert_engine_health` | `quality/assert-engine-health.js` | engine_health_snapshots | all |
| `assert_network_health` | `quality/assert-network-health.js` | — | deep_scrapes |
| `assert_staleness` | `quality/assert-staleness.js` | — | deep_scrapes |
| `assert_pre_permit_aging` | `quality/assert-pre-permit-aging.js` | — | coa |
| `assert_coa_freshness` | `quality/assert-coa-freshness.js` | — | coa |
</schema>

---

<quality>
## 5. Quality Gate Tiers

Quality scripts run as chain steps and enforce data integrity assertions:

| Tier | Script | When | What It Checks |
|------|--------|------|----------------|
| 1 | `assert-schema.js` | Pre-ingestion | CKAN metadata columns, CSV headers, GeoJSON keys, URL accessibility |
| 2 | `assert-data-bounds.js` | Post-ingestion | Cost outliers, null rates, referential integrity, duplicate PKs, row counts |
| 3 | `assert-engine-health.js` | Post-processing | Dead tuple ratio >10%, seq scan dominance >80%, update ping-pong >2x |
| 4 | `assert-staleness.js` | Post-scrape | Scrape freshness, consecutive empty detection |
| 5 | `assert-network-health.js` | Post-scrape | Proxy connectivity, WAF block detection |
| 6 | `assert-coa-freshness.js` | Post-CoA load | Days since last CoA record seen |
| 7 | `assert-pre-permit-aging.js` | Post-CoA processing | Expired pre-permits (approved+unlinked >18 months) |

Each quality script emits an `audit_table` in `records_meta` with per-metric PASS/WARN/FAIL verdicts. The chain orchestrator aggregates these into the chain-level `pipeline_runs` record.
</quality>

---

<testing>
## 6. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic:** `chain.logic.test.ts` (chain definitions, step ordering, gate logic), `pipeline-sdk.logic.test.ts` (SDK exports, emitSummary shape, script adoption compliance)
- **Infra:** `quality.infra.test.ts` (CQA script existence, Pipeline SDK pattern assertions)
<!-- TEST_INJECT_END -->
</testing>

---

<constraints>
## 7. Operating Boundaries

### Target Files
- `scripts/lib/pipeline.js` — Pipeline SDK
- `scripts/run-chain.js` — Chain orchestrator
- `scripts/manifest.json` — Pipeline manifest
- `scripts/quality/assert-*.js` — Quality gate scripts

### Out-of-Scope Files
- `src/app/api/admin/pipelines/` — API trigger routes (governed by Spec 26 admin)
- `src/components/FreshnessTimeline.tsx` — UI rendering (governed by Spec 28)
- Individual pipeline scripts (`load-*.js`, `classify-*.js`, etc.) — governed by their own specs

### Cross-Spec Dependencies
- **Consumed by:** All chain specs, all source specs, all step specs
- **Relies on:** `00_engineering_standards.md` §9 (Pipeline & Script Safety)
</constraints>
