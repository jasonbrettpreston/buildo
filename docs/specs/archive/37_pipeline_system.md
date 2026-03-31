# Spec 37 -- Pipeline System

## 1. Goal & User Story
As a developer modifying any pipeline script, I need a single reference document that describes the Pipeline SDK contract, chain orchestration model, quality gate behavior, scheduling rules, and data flow topology — so I can make changes confidently without breaking upstream/downstream dependencies.

This is a **reference spec** (no UI). It codifies how the pipeline system is supposed to work, not how it currently works. `26_admin.md` cross-references this spec for backend behavior. `00_engineering_standards.md` §9 cross-references this for the rules.

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | N/A (backend infrastructure) |
| Authenticated | N/A |
| Admin | Pipeline triggers via admin dashboard (Spec 26) |

---

## 3. Architecture — Pipeline SDK

### 3.1 SDK Location & Contract
**File:** `scripts/lib/pipeline.js`

The Pipeline SDK is the mandatory infrastructure layer for all pipeline scripts (`scripts/*.js`). No script may instantiate its own `Pool`, write bare `console.error`, or call `process.exit()` outside the SDK lifecycle.

**Exports:**

| Export | Purpose |
|--------|---------|
| `createPool()` | PostgreSQL pool using `PG_*` env vars. Called internally by `run()`. |
| `run(name, fn)` | Lifecycle wrapper: creates pool → executes `fn(pool)` → logs duration → `pool.end()` → `process.exit(1)` on error. |
| `withTransaction(pool, fn)` | `BEGIN` → `fn(client)` → `COMMIT`. On error: `ROLLBACK` (with nested try-catch per §9.1) → re-throw. Always releases client. |
| `log.{info,warn,error}(tag, msg, ctx?)` | Structured JSON logging to stdout/stderr. Replaces bare `console.*`. |
| `emitSummary(stats)` | Emits `PIPELINE_SUMMARY:{json}` to stdout. Fields: `records_total`, `records_new`, `records_updated`, `records_meta?`. |
| `emitMeta(reads, writes, external?)` | Emits `PIPELINE_META:{json}` to stdout. Documents table I/O per script. |
| `progress(label, current, total, startMs)` | Logs progress percentage + elapsed time. Emits OTel span event if tracing active. |
| `BATCH_SIZE` | Default batch size constant (1000). |
| `maxRowsPerInsert(cols)` | Calculates max rows to stay under PostgreSQL 65,535 param limit. |
| `isFullMode()` | Returns `true` if `--full` argv flag present. |
| `track(recordsNew, recordsUpdated)` | Increment running record counters. Call as your script processes records. |
| `getTracked()` | Returns `{ records_new, records_updated }` — current tracked counter values. |
| `track.reset()` | Reset counters to zero. Called internally by `run()` at start. |

### 3.2 Lifecycle: `pipeline.run()`
```
pipeline.run('script-name', async (pool) => { ... })
```

1. Creates pool via `createPool()`
2. Starts OTel root span `pipeline.run.{name}` (no-op if tracing disabled)
3. Executes `fn(pool)` inside try-catch
4. On success: logs completion time, sets span OK
5. On error: logs structured error, sets span ERROR, calls `process.exit(1)`
6. Finally: ends span, closes pool

**Contract:** Scripts MUST NOT call `process.exit()` directly — the SDK handles all exit codes. Scripts MUST call `emitSummary()` before returning from the `run()` callback. Scripts MUST report actual `records_new` / `records_updated` counts — hardcoding `0` when work was done is a spec violation. Use `pipeline.track()` to accumulate counts during processing, or pass the final count variable directly to `emitSummary()`.

### 3.3 Transaction Contract: `withTransaction()`
```
await pipeline.withTransaction(pool, async (client) => { ... })
```

- Acquires client from pool
- Executes `BEGIN` → `fn(client)` → `COMMIT`
- On error: `ROLLBACK` wrapped in nested try-catch (§9.1) → re-throw
- Always releases client in `finally`
- Instrumented with OTel span `pipeline.transaction`

**When to use:** All multi-row write operations. Single reads do not require transactions.

### 3.4 Structured Logging
All pipeline log output is JSON-structured:
```json
{"level":"INFO","tag":"[load-permits]","msg":"Loaded 237412 permits"}
{"level":"ERROR","tag":"[load-permits]","msg":"Connection refused","stack":"..."}
```

Scripts MUST use `pipeline.log.{info,warn,error}()` — never bare `console.error()` or `console.log()` for error reporting.

### 3.5 Protocol: PIPELINE_SUMMARY
Emitted once per script execution, before `run()` returns:
```
PIPELINE_SUMMARY:{"records_total":237412,"records_new":142,"records_updated":89,"records_meta":{...}}
```

Parsed by `run-chain.js` and stored in `pipeline_runs` table columns: `records_total`, `records_new`, `records_updated`, `records_meta` (JSONB).

**`records_new: null` convention:** CQA scripts and read-only scripts that do not create or update data rows MUST emit `records_new: null` (not `0`). This signals "not applicable" to the dashboard's `getStatusDot()` function, which skips stale detection when `records_new` is null. Scripts that perform work MUST report actual counts — hardcoding `records_new: 0` when work was done is a spec violation.

### 3.6 Protocol: PIPELINE_META
Emitted once per script execution, documents I/O schema:
```
PIPELINE_META:{"reads":{"permits":["permit_num","status"]},"writes":{"permit_trades":["permit_num","trade_slug"]},"external":["CKAN API"]}
```

Parsed by `run-chain.js` and merged into `records_meta.pipeline_meta`. Rendered by `DataFlowTile` in the admin dashboard with "Live Meta" badge.

### 3.7 Telemetry: `captureTelemetry()` / `diffTelemetry()`
Pre/post-run database state capture for transparent pipeline observability. Stored in `records_meta.telemetry` (JSONB, migration 041).

**Exports:**

| Export | Purpose |
|--------|---------|
| `captureTelemetry(pool, tables, nullCols?)` | Captures pre-run snapshot: row counts, `pg_stat_user_tables` counters (ins/upd/del), NULL counts for specified columns. |
| `diffTelemetry(pool, tables, pre)` | Captures post-run state and computes deltas against `pre` snapshot. Returns `{ counts, pg_stats, null_fills }`. |
| `quoteIdent(name)` | Validates and double-quotes SQL identifiers. Prevents SQL injection for dynamic table/column names. |

**Telemetry tiers:**
- **T1 (Row counts):** `SELECT count(*)` before/after for each table. Delta = rows added.
- **T2 (pg_stat diffs):** `pg_stat_user_tables.n_tup_{ins,upd,del}` before/after. Shows actual DML operations.
- **T4 (NULL fills):** Counts NULLs in specified enrichment columns before/after. Delta = enrichment progress.

**Manifest config:** Each step in `manifest.json` declares:
- `telemetry_tables`: Array of table names to monitor (e.g., `["permits"]`)
- `telemetry_null_cols`: Object mapping table → columns (e.g., `{ "permits": ["latitude", "longitude"] }`)

**Chain orchestrator integration:**
- Before each step: `captureTelemetry()` using manifest config
- After success: `diffTelemetry()` → merged into `records_meta.telemetry`
- After failure: `diffTelemetry()` still runs in catch block for partial-data debugging

---

## 4. Chain Orchestration

### 4.1 Orchestrator: `scripts/run-chain.js`
Runs a sequence of pipeline steps in order. Stops on first failure (fail-fast). Each step is a child process spawned via `execFileSync`.

**Usage:** `node scripts/run-chain.js <chain_id> [external_run_id]`

### 4.2 Chain Definitions (from `scripts/manifest.json`)
The manifest is the single source of truth (§9.6) for all pipeline metadata.

| Chain | Steps | Trigger | Schedule |
|-------|-------|---------|----------|
| `permits` | 14 steps: assert_schema → permits → classify_scope → classify_permits → builders → link_wsib → geocode_permits → link_parcels → link_neighbourhoods → link_massing → link_similar → link_coa → refresh_snapshot → assert_data_bounds | Daily | 6 AM ET weekdays |
| `coa` | 6 steps: assert_schema → coa → link_coa → create_pre_permits → refresh_snapshot → assert_data_bounds | Daily | 7 AM ET weekdays |
| `sources` | 14 steps: assert_schema → address_points → geocode_permits → parcels → compute_centroids → link_parcels → massing → link_massing → neighbourhoods → link_neighbourhoods → load_wsib → link_wsib → refresh_snapshot → assert_data_bounds | Quarterly | 8 AM ET, 1st of Jan/Apr/Jul/Oct |
| `entities` | 2 steps: enrich_wsib_builders → enrich_named_builders | Daily | 3 AM ET daily |
| `deep_scrapes` | 2 steps: inspections → coa_documents | — | Coming soon (not yet wired) |

### 4.3 Execution Model
1. **Sequential execution:** Steps run one at a time via `execFileSync`. No parallel step execution within a chain.
2. **Step tracking:** Each step gets its own `pipeline_runs` row scoped as `{chain}:{step}` (e.g., `permits:classify_scope`).
3. **Parent tracking:** The chain itself has a `pipeline_runs` row as `chain_{id}` (e.g., `chain_permits`).
4. **External run ID:** When triggered from the admin API, the API pre-creates the `pipeline_runs` row and passes its ID as `argv[3]`. This avoids duplicate inserts and ensures the UI can poll immediately.
5. **Stdout parsing:** After each step, the orchestrator parses `PIPELINE_SUMMARY:` and `PIPELINE_META:` lines from stdout and stores them in the step's `pipeline_runs` row.
6. **Timeouts:** Chains use 1-hour timeout; individual pipeline triggers use 10-minute timeout (enforced by the API trigger route, not the orchestrator).

### 4.4 Chain Gates
Defined in `manifest.chain_gates`. A gate step that produces zero new + zero updated records causes the chain to abort early (downstream steps are skipped).

| Chain | Gate Step | Behavior |
|-------|-----------|----------|
| `permits` | `permits` | If no new/updated permits, skip classification, linking, snapshot |
| `coa` | `coa` | If no new/updated CoA applications, skip linking, pre-permits |

### 4.5 Disabled Steps
Each step can be toggled via `pipeline_schedules.enabled` (migration 047). At chain start, the orchestrator queries all disabled slugs and skips them (logged as `status = 'skipped'`).

**Non-toggleable steps:** `assert_schema`, `assert_data_bounds`, `refresh_snapshot` — these always run.

### 4.6 Cancellation
Between steps, the orchestrator checks the chain's `pipeline_runs.status`. If set to `'cancelled'` (via admin UI), the chain stops before the next step. The chain's final status is written as `'cancelled'` (not `'failed'`) to distinguish user-initiated cancellation from step execution failures.

### 4.7 Environment Variables Passed to Steps
| Variable | Set When | Purpose |
|----------|----------|---------|
| `PIPELINE_CHAIN` | Always | The chain ID (e.g., `permits`). Scripts use this to scope their behavior. |
| `ENRICH_WSIB_ONLY=1` | `enrich_wsib_builders` step | Limits web search to WSIB-linked builders only. |
| `ENRICH_UNMATCHED_ONLY=1` | `enrich_named_builders` step | Limits web search to unmatched builders only. |

**Argv flags:**
- `--full` passed to `link_massing` in the `sources` chain (full rescan needed after massing reload).

---

## 5. Quality Gates — CQA (Continuous Quality Assurance)

### 5.1 Tier 1: Pre-Ingestion Schema Validation (`assert_schema`)
**File:** `scripts/quality/assert-schema.js`

Runs as the **first step** of every chain (permits, coa, sources). Validates that upstream data sources still have the expected schema before any data is loaded.

**Checks by chain context:**

| Chain | Checks |
|-------|--------|
| `permits` | CKAN permits resource: 11 expected columns + EST_CONST_COST type coercion sample |
| `coa` | CKAN CoA active resource: 6 expected columns |
| `sources` | Address Points CSV headers (2 cols), Parcels CSV headers (7 cols), Massing ZIP URL accessibility (HEAD request), Neighbourhoods GeoJSON property keys (ID property) |

**Failure behavior:**
- Standalone (`node assert-schema.js`): exits with code 1 on failure
- In chain (`PIPELINE_CHAIN` set): logs warnings but does **not** block the chain. This prevents CKAN flakiness from stopping all data loading.

**Output:** `PIPELINE_SUMMARY` with `records_meta` containing `checks_passed`, `checks_failed`, `errors`.

### 5.2 Tier 2: Post-Ingestion Data Bounds Validation (`assert_data_bounds`)
**File:** `scripts/quality/assert-data-bounds.js`

Runs as the **last step** of every chain. Validates data integrity in the local database after ingestion completes.

**Checks by chain context:**

| Scope | Checks |
|-------|--------|
| Permits | Cost bounds ($100–$500M), null rates (description <5%, builder_name <20%, status =0%), orphaned permit_trades, orphaned permit_parcels, duplicate PKs |
| CoA | Orphaned `linked_permit_num` references |
| Sources | Table non-empty checks (address_points, parcels, building_footprints, neighbourhoods ≥158), duplicate PK checks, lot_size_sqm bounds, max_height_m bounds |
| WSIB | Registry non-empty, legal_name non-null, G-class requirement, numeric NAICS codes, orphaned entity links |

**Severity levels:**
- **Errors** (exit 1): Orphaned FKs, duplicate PKs, empty tables, missing required fields
- **Warnings** (non-fatal): Cost outliers, null rate thresholds, lot/height bounds

**Output:** `PIPELINE_SUMMARY` with `records_meta` containing `checks_passed`, `checks_failed`, `checks_warned`, error/warning lists.

---

## 6. Scheduling — Local Cron

### 6.1 Cron Worker: `scripts/local-cron.js`
A long-running Node.js process that schedules pipeline chains using `node-cron`.

**Schedule definitions:**

| Chain | Cron Expression | Timezone | Notes |
|-------|----------------|----------|-------|
| `permits` | `0 6 * * 1-5` | America/Toronto | 6 AM ET weekdays |
| `coa` | `0 7 * * 1-5` | America/Toronto | 7 AM ET, staggered 1h after permits |
| `sources` | `0 8 1 1,4,7,10 *` | America/Toronto | 8 AM ET, 1st of quarter months |
| `entities` | `0 3 * * *` | America/Toronto | 3 AM ET daily |

### 6.2 Concurrency Guard
Before spawning a chain, the cron worker queries `pipeline_runs` for any running chain. If a chain is already executing, the scheduled run is skipped (logged, not queued).

### 6.3 Execution
Spawns `node scripts/run-chain.js {chainId}` via `child_process.execFile`. The cron worker does not use the admin API — it invokes the chain directly.

### 6.4 Graceful Shutdown
Handles `SIGINT`/`SIGTERM` to stop all cron tasks and close the DB pool cleanly.

---

## 7. Data Flow Topology

### 7.1 Script → Table Map
Each script declares its reads and writes via `PIPELINE_META`. The canonical mapping:

| Script | Reads | Writes | External |
|--------|-------|--------|----------|
| `load-permits` | — | `permits` | CKAN API |
| `load-coa` | — | `coa_applications` | CKAN API |
| `extract-builders` | `permits` | `builders` | — |
| `load-address-points` | — | `address_points` | CKAN CSV |
| `load-parcels` | — | `parcels` | CKAN CSV |
| `load-massing` | — | `building_footprints` | CKAN ZIP |
| `load-neighbourhoods` | — | `neighbourhoods` | CKAN GeoJSON |
| `load-wsib` | — | `wsib_registry` | WSIB CSV |
| `geocode-permits` | `permits`, `address_points` | `permits` (lat/lon) | — |
| `link-parcels` | `permits`, `parcels` | `permit_parcels` | — |
| `link-neighbourhoods` | `permits`, `neighbourhoods` | `permits` (neighbourhood_id) | — |
| `link-massing` | `permits`, `parcels`, `building_footprints` | `permits` (massing cols) | — |
| `link-wsib` | `builders`, `wsib_registry` | `wsib_registry` (linked_entity_id) | — |
| `link-coa` | `permits`, `coa_applications` | `coa_applications` (linked cols) | — |
| `link-similar` | `permits` | `similar_permits` | — |
| `classify-scope` | `permits` | `permits` (scope_class, scope_tags) | — |
| `classify-permits` | `permits` | `permit_trades` | — |
| `create-pre-permits` | `coa_applications` | `permits` (pre-permit rows) | — |
| `compute-centroids` | `parcels` | `parcels` (centroid cols) | — |
| `refresh-snapshot` | `permits`, `permit_trades`, `coa_applications`, `builders`, enrichment tables | `quality_snapshots` | — |
| `enrich-web-search` | `builders`/`wsib_registry` | `entities` | Serper API |
| `assert-schema` | — | `pipeline_runs` | CKAN API |
| `assert-data-bounds` | All data tables | `pipeline_runs` | — |

### 7.2 Dependency Graph
```
External Sources → Loaders → Linkers/Classifiers → Snapshot → Quality Gate
     ↓                ↓              ↓                  ↓           ↓
  CKAN API      permits table   permit_trades     quality_    pipeline_runs
  WSIB CSV      coa_applications  permit_parcels   snapshots   (Tier 2 checks)
  Serper API    address_points    similar_permits
                parcels
                building_footprints
                neighbourhoods
                wsib_registry
```

---

## 8. Observability — OpenTelemetry (Opt-In)

### 8.1 Tracing Bootstrap: `scripts/lib/tracing.js`
Provides `getTracer()`, `SpanStatusCode`, and no-op stubs. Tracing activates only when `@opentelemetry/api` is installed and an SDK is registered.

### 8.2 Span Hierarchy
```
pipeline.run.{name}           (root span — full script execution)
  └─ pipeline.transaction     (per withTransaction() call)
       └─ pipeline.progress   (events per progress tick)
```

### 8.3 Attributes
- `pipeline.name`, `pipeline.duration_ms`, `pipeline.status` (on root span)
- `db.system=postgresql` (on transaction spans)

### 8.4 Activation
1. Install: `npm install @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http`
2. Set: `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`
3. Run any pipeline script — spans export automatically

---

## 9. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic** (`pipeline-sdk.logic.test.ts`): SDK exports, structured logging, summary/meta emission, transaction contract, batch utilities, full-mode detection, manifest validation, chain definitions, script file existence
- **Logic** (`chain.logic.test.ts`): Chain orchestration, step sequencing, disabled step handling, gate behavior, cancellation, external run ID, scoped slug format, PIPELINE_CHAIN env var
- **Logic** (`quality.logic.test.ts`): Schema drift detection, data bounds checks, severity classification, records_meta output shape
- **Infra** (`enrichment.infra.test.ts`): Web search pipeline integration, WSIB linking
<!-- TEST_INJECT_END -->

## 10. Mobile & Responsive Behavior
- **Mobile Layout:** N/A — backend infrastructure, no UI.
- **Touch Targets:** N/A
- **Breakpoints Used:** N/A

## 11. Operating Boundaries

### Target Files (Modify / Create)
- `scripts/lib/pipeline.js` — Pipeline SDK
- `scripts/lib/tracing.js` — OTel bootstrap
- `scripts/run-chain.js` — Chain orchestrator
- `scripts/local-cron.js` — Cron worker
- `scripts/manifest.json` — Pipeline manifest (§9.6)
- `scripts/quality/assert-schema.js` — CQA Tier 1
- `scripts/quality/assert-data-bounds.js` — CQA Tier 2
- All `scripts/*.js` pipeline scripts (SDK consumers)

### Out-of-Scope Files (DO NOT TOUCH)
- **`src/lib/classification/classifier.ts`**: Governed by Spec 08. Pipeline scripts call the JS-side equivalent.
- **`src/components/FreshnessTimeline.tsx`**: Governed by Spec 26 (Admin). UI rendering of pipeline data.
- **`src/lib/quality/`**: Governed by Spec 28 (Data Quality Dashboard). Consumes pipeline data.

### Cross-Spec Dependencies
- **Spec 01 (Database Schema):** `pipeline_runs`, `pipeline_schedules` tables
- **Spec 02 (Data Ingestion):** Loader scripts implement the ingestion contract
- **Spec 26 (Admin Panel):** Admin dashboard triggers chains and renders pipeline status
- **Spec 28 (Data Quality Dashboard):** Quality snapshots and health metrics consume pipeline output
- **00_engineering_standards.md §9:** Pipeline & Script Safety rules that this spec implements
