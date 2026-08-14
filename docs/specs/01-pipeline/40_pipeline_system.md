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

Tables and NULL columns per script are declared in `manifest.json` under `telemetry_tables` and `telemetry_null_cols`. Vocabulary-coverage triples (the `cov_*` primitive — Spec 30 §3.2 / 48 §4.3) are declared under `telemetry_vocab_cols`: `{ "<label>": { dataTable, dataColumn, vocabTable, vocabColumn, dataFilter?, vocabFilter? } }`, where `<label>` matches `/^[a-z][a-z0-9_]*$/` and drives the `cov_<label>` metric name. The script reads its own entry and passes it to `pipeline.computeVocabCoverage(pool, spec)`.
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
   b. Check if step is disabled — a step is disabled for the current chain iff a row exists with `enabled = FALSE AND (chain_id IS NULL OR chain_id = <current_chain>)` (see §3.1.1)
   c. Check gate-skip (primary ingest had 0 new records → skip non-infra steps)
   d. Insert step-scoped `pipeline_runs` row (`{chain}:{step}`)
   f. Capture pre-telemetry (T1/T2/T4/T6)
   g. Spawn child process (`node` or `python3`) with `stdio: ['inherit', 'pipe', 'inherit']`
   h. Stream stdout, buffer `PIPELINE_SUMMARY:` and `PIPELINE_META:` lines
   i. On exit code 0: parse summary, capture post-telemetry, update step row to `completed`
   j. On exit code 1: update step row to `failed`, **stop chain** (no subsequent steps run)
5. Update chain `pipeline_runs` row with aggregate duration, status, verdicts

#### 3.1.1 Chain-Scoped Disable (H-W19, migration 095)

`pipeline_schedules` supports per-chain disable semantics. A row's `chain_id` column:

- `NULL` → **global disable** across every chain that references the step slug
- `'permits'` / `'coa'` / `'sources'` / `'entities'` → scoped to that chain only

The orchestrator's disabled-steps query is `SELECT pipeline FROM pipeline_schedules WHERE enabled = FALSE AND (chain_id IS NULL OR chain_id = $1)` with the current chain bound to `$1`. Uniqueness is enforced by the named index `idx_pipeline_schedules_scope ON (pipeline, COALESCE(chain_id, '__ALL__'))` so a pipeline can have one global row plus one row per chain. The admin UI currently writes only NULL rows (global); per-chain scoping is planned UI work.

### 3.1.2 Terminal Status Vocabulary _(NEW 2026-08-14 — Phase B B2 fold, `pipeline_runs.status`)_

Both step-scoped and chain-scoped `pipeline_runs` rows share one status vocabulary. A chain
row's terminal status is a ladder over its steps' outcomes (`run-chain.js`'s `chainStatus`
assignment), consumed by `check-chain-verdict.js`'s `OK_STATUSES` (green-class allowlist) and
`check-pipeline-freshness.js`'s `RAN_STATUSES` (ran-at-all allowlist):

| Status | Meaning | `OK_STATUSES` (verdict-green) | `RAN_STATUSES` (freshness) |
|---|---|---|---|
| `running` | In-flight, not yet terminal | — | — |
| `completed` | Every step ran, no WARN/FAIL step verdict, no budget-stop | ✓ | ✓ |
| `completed_with_warnings` | Every step ran, but a step verdict was WARN and/or the chain hit its soft time-budget stop (Spec 115 §2.2) | ✓ | ✓ |
| `completed_with_errors` | The chain finished without crashing, but a step's `audit_table` verdict was FAIL (C1, 2026-08-11 — non-halting-FAIL classification): the run completed, its DATA did not pass | ✗ | ✓ |
| `deferred_to_full` | **NEW (Phase B B2).** A gated step's PRE-TRANSACTION scope count exceeded its defer threshold; the chain stopped CLEANLY at that step's boundary — not a crash, not a data FAIL | ✓ (green + `::warning`) | ✓ |
| `failed` | A step threw or exited 1; the chain halted before its next step | ✗ | ✗ |
| `cancelled` | Operator-cancelled mid-run | ✗ | ✗ |

#### `deferred_to_full`

A **gated step** (today: `enrich_parcels`'s multi-pass engine, Spec 65 — the only step wired
to a defer threshold) computes its work scope from upfront-computable predicates BEFORE
opening its transaction (Spec 47 §8.7 — the PRE-TRANSACTION rule; an in-transaction defer
decision is disallowed by construction). If that scope exceeds the step's threshold
(`logic_variables.enrich_parcels_defer_threshold_rows`, default 50,000 — Spec 86 Control
Panel), the step does NONE of its normal work this run, emits a `records_meta.deferred`
marker (Spec 47 §8.7) with a `records_meta.step_completeness.deferred_at` STEP SLUG — the
manifest slug that deferred (e.g. `'enrich_parcels'`), not a timestamp despite the field name
(Spec 48 §3.9) — and exits 0. `run-chain.js` parses the marker, rewrites the step's own `pipeline_runs`
row to `deferred_to_full` (diverting the step loop's unconditional `'completed'` write), and
breaks the loop via its own state variable — **no downstream step gets a row this run** (a
deliberate divergence from the soft-budget stop, which leaves `'skipped'` rows for the
remainder of the manifest; the reader distinguishes "the chain chose to stop here" from "the
chain ran out of wall time mid-list" by this shape alone). The chain's own `pipeline_runs`
row terminalizes `deferred_to_full` too.

**Consumer classification, all four hops (Spec 40/47/48/115 compose here):**
1. `check-chain-verdict.js` — `deferred_to_full` sits **inside `OK_STATUSES`** (green) but
   the verdict step still emits a `::warning` GitHub annotation naming the deferring step
   and its `scope_count`/`threshold`/`ratio` — never silently green, never a red the
   operator has to chase down.
2. `check-pipeline-freshness.js` — `deferred_to_full` sits **inside `RAN_STATUSES`**: the
   chain attempted and made a scoped decision, which counts as "ran" for absence detection
   (Spec 115 §2.5). It does NOT mean the deferred step's DATA is fresh — see the streak rule
   below and Spec 115 §2.5's "a defer does not reset a step's work-age" note.
3. Admin renderers (`FreshnessTimeline.tsx`, `DataQualityDashboard.tsx`, `stats/route.ts` —
   Phase B B6 scope) render `deferred_to_full` as its own distinct status, never falling
   through to a generic/default style.
4. **Producer-completed gates never treat a `deferred_to_full` step row as satisfying "this
   step's data is current."** Any gate keyed on `status = 'completed'` (e.g.
   `source-version.js`'s tier gates) structurally excludes `deferred_to_full` — a step that
   deferred did NO enrichment work this run, so nothing downstream may treat its watermark
   as advanced.

**Escalation — the defer-streak rule (Spec 40/43).** Two CONSECUTIVE `deferred_to_full`
outcomes on the SAME step — keyed on `records_meta.step_completeness.deferred_at` being
present on the row, not on `status` alone, so a run that deferred a step AND separately
FAILed a different step's audit verdict (`completed_with_errors`, which outranks a defer on
the status ladder) still counts toward the streak (Spec 48 §3.9's `status ⟺ deferred_at`
tripwire is explicitly scoped to `OK_STATUSES` rows for this reason) — makes the verdict
step exit 1 with **"supervised force-full required"** instead of its usual
green/warning/red classification. This is the loop breaker: an unbounded string of clean
defers would otherwise never surface as an operator action item. See Spec 43 for the
chain-level lifecycle (first defer warns, second reds, the supervised force-full path) and
the quarterly `LINK_MASSING_FORCE_FULL=1` interaction.

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

### 3.5 Concurrency Guards (Advisory Lock Convention) — WF3-03

Two lock layers prevent compound corruption from concurrent runs (RC-W7).

**Per-script locks** (six scripts on the 80-86 marketplace tail today: 81/82/83/84/85/86; convention extends to any future per-script lock):
- Lock ID = the spec number that owns the script (e.g., `compute-trade-forecasts.js` uses `pg_try_advisory_lock(85)`).
- Acquired on a dedicated `pool.connect()` client held for the full run; **must not** use `pool.query` for acquire/release because session locks are bound to the backend that acquired them — `pool.query` checks out an ephemeral connection and the unlock would silently no-op (the bug 83-W5 documented).
- On lock-held, the script emits a `PIPELINE_SUMMARY` with `records_meta.skipped = true` and `records_meta.reason = 'advisory_lock_held_elsewhere'`, then exits 0.
- Release in nested `finally` with try/catch on the unlock query so an unlock failure doesn't mask the real error.

**Chain-level lock** (`run-chain.js`):
- Lock ID = `pg_try_advisory_lock(2, hashtext('chain_' || chain_id))` — the 2-arg form keeps chain locks in a distinct keyspace from per-script locks (1-arg form), so a `hashtext` collision with a spec number can never wedge a per-script lock. The leading `2` is a namespace marker.
- Same pinned-`pool.connect()` discipline as per-script locks.
- On lock-held, marks any pre-created `externalRunId` row as `cancelled` with a clear `error_message` (logged on failure, not silently swallowed), then exits 0.

The two layers compose: the chain lock serialises orchestrator entry; per-script locks serialise individual writes if a step is also triggered standalone (admin manual re-run). The reference implementation pattern lives in `scripts/classify-lifecycle-phase.js` — see the lock-acquisition block at the top of `pipeline.run('classify-lifecycle-phase', …)` and the symmetrical release inside the outer `finally`. Line numbers omitted intentionally so this spec doesn't drift when the implementation is edited.
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
  "telemetry_vocab_cols": {
    "trade_vocab": { "dataTable": "permit_trades", "dataColumn": "trade_id", "vocabTable": "trades", "vocabColumn": "id", "dataFilter": null, "vocabFilter": null }
  },
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
  "sources": ["assert_schema", "address_points", "geocode_permits", "parcels", "link_parcel_addresses", "compute_centroids", "link_parcels", "massing", "link_massing", "neighbourhoods", "link_neighbourhoods", "load_wsib", "link_wsib", "refresh_snapshot", "assert_data_bounds", "assert_engine_health"],
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
| `link_parcel_addresses` | `link-parcel-addresses.js` | parcel_address_points | sources |
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
- `src/components/FreshnessTimeline.tsx` — UI rendering (governed by Spec 33/35; derives chain step lists from this manifest per Spec 33 §7 / WF2 2026-06-11)
- Individual pipeline scripts (`load-*.js`, `classify-*.js`, etc.) — governed by their own specs

### Cross-Spec Dependencies
- **Consumed by:** All chain specs, all source specs, all step specs
- **Relies on:** `00_engineering_standards.md` §9 (Pipeline & Script Safety)

### Generated AI-operator references
- `docs/reference/logic-variables-registry.md` (`npm run logic-vars-docs`) — every `logic_variables` key → default/bounds/kind/consuming scripts (the config-loader / `logicVars` surface).
- `docs/reference/data-lineage-map.md` (`npm run lineage-docs`) — column → producing step → consuming steps, derived from `pipeline_runs.records_meta.pipeline_meta`.
</constraints>
