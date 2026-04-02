# Pipeline Architecture v2.0 — SDK-First, Infrastructure-Defended

<requirements>
## 1. Goal & User Story

As a developer modifying any pipeline script, I need a single reference for the architectural invariants, enforcement mechanisms, and observability standards — so I can write correct, observable, infrastructure-safe code without memorizing a 25-point checklist.

This spec governs the **philosophy and policy** of the pipeline. For the **SDK mechanics** (exports, protocols, chain orchestration), see `docs/specs/pipeline/40_pipeline_system.md`.
</requirements>

---

<architecture>
## 2. Core Philosophy

This pipeline ingests, mutates, and links chaotic, external municipal data. Because the upstream data is highly entropic, our internal pipeline must be highly rigid.

We operate on an **SDK-First, Infrastructure-Defended** paradigm:

| Principle | Meaning |
|-----------|---------|
| **Guardrails over Guidelines** | If an anti-pattern is bad, it is blocked by the CI/CD linter — not documented in a wiki nobody reads |
| **The Paved Road** | `scripts/lib/pipeline.js` is the only approved way to connect to the database, run transactions, and emit telemetry |
| **Health-Aware Execution** | Scripts do not have the right to run if the database is struggling. The orchestrator (`run-chain.js`) makes the final call via the Pre-Flight Bloat Gate |
| **Append, Don't Replace** | The SDK auto-injects telemetry into audit_table payloads without touching developer-defined metrics |

### 2.1 Script Archetypes

Every pipeline script belongs to exactly one archetype. The archetype determines which rules and metrics apply.

| Archetype | Purpose | Scripts | Exempt From |
|-----------|---------|---------|-------------|
| **Observers** | Read-only admin/orchestration — do not mutate business data | ai-env-check, audit_all_specs, generate-db-docs, generate-system-map, harvest-tests, local-cron, migrate, refresh-snapshot, run-chain, task-init | Mutation, pagination, spatial, deep metrics rules |
| **Scrapers** | Reach out to external networks (AIC portal, CKAN, Google, Serper) | aic-orchestrator, aic-scraper-nodriver, enrich-web-search, geocode-permits, poc-aic-scraper-v2, spike-nodriver | Pagination, spatial rules |
| **Ingestors** | Load raw data from external files/APIs into initial DB tables | load-address-points, load-coa, load-massing, load-neighbourhoods, load-parcels, load-permits, load-wsib, seed-coa, seed-parcels, seed-trades | Spatial rules |
| **Mutators** | Read existing tables, apply business logic, update/link records | classify-*, close-stale-permits, compute-centroids, create-pre-permits, enrich-wsib, extract-builders, link-*, reclassify-all | None — all rules apply |

### 2.2 Architectural Invariants

Any Pull Request violating these invariants is automatically rejected by the `pipeline-lint` CI workflow.

#### Banned: OFFSET Pagination
- **Why:** Database state shifts during batch runs. `OFFSET` guarantees silent row skipping or double-processing.
- **Standard:** Keyset pagination: `WHERE (permit_num, revision_num) > ($1, $2) ORDER BY permit_num, revision_num LIMIT $3`
- **Enforced by:** Test suite (source-level assertions on SQL queries)

#### Banned: Manual Database Pools
- **Why:** Orphaned connections, V8 memory overflows, unhandled promise crashes.
- **Standard:** `pipeline.createPool()` via the SDK. For large result sets, use `pipeline.streamQuery()`.
- **Enforced by:** ESLint `no-restricted-syntax` — bans `new Pool()` and `new pg.Pool()` in `scripts/**`

#### Banned: process.exit() in Pipeline Scripts
- **Why:** Bypasses SDK lifecycle, prevents pool cleanup, breaks chain orchestrator error handling.
- **Standard:** Let `pipeline.run()` handle lifecycle. Throw errors to signal failure.
- **Enforced by:** ESLint `no-restricted-syntax`

#### Banned: Synchronous Drivers in Python
- **Why:** `psycopg2` blocks the asyncio event loop, causing network deadlocks during web scraping.
- **Standard:** Use `asyncpg` for all async Python scripts.
- **Enforced by:** Ruff `flake8-tidy-imports` ban in `ruff.toml`

#### Banned: Bare Exceptions in Python
- **Why:** Swallows WAF blocks, timeouts, and parse errors — makes debugging impossible.
- **Standard:** Catch specific exception types. Build error taxonomy.
- **Enforced by:** Ruff `BLE` (blind-except) and `TRY` (tryceratops) rule sets
</architecture>

---

<behavior>
## 3. Deep Observability & Telemetry

### 3.1 Auto-Injected Metrics (Free on Day 1)

The SDK's `emitSummary()` automatically appends these rows to every script's `audit_table.rows`:

| Metric | Source | Description |
|--------|--------|-------------|
| `sys_velocity_rows_sec` | `records_total / elapsed` | Pipeline throughput — alerts on >50% drop from 7-day average |
| `sys_duration_ms` | `Date.now() - _runStartMs` | Wall-clock execution time |

These require **zero script changes** — the SDK computes them from data already passed to `emitSummary()`.

### 3.2 Opt-In Metrics (via `telemetry_context`)

Scripts can pass an optional `telemetry_context` object to `emitSummary()` for deeper tracking:

```
pipeline.emitSummary({
  records_total: 500,
  records_meta: { audit_table: { ... } },
  telemetry_context: {
    error_taxonomy: { waf_blocks: 3, timeouts: 0, parse_failures: 1 },
    data_quality: { issued_date: { nulls: 50, total: 500 } },
  },
});
```

The SDK auto-injects prefixed rows:

| Prefix | Category | Example | Status Logic |
|--------|----------|---------|-------------|
| `err_` | Error Taxonomy | `err_waf_blocks: 3` | WARN if > 0, PASS if 0 |
| `dq_` | Data Quality | `dq_null_rate_issued_date: 10.0%` | FAIL if >= 50%, PASS otherwise |

### 3.3 Namespace Protection

All auto-injected metrics use strict prefixes (`sys_`, `err_`, `dq_`) to prevent collision with developer-defined metrics. A developer's `{ metric: "total_errors" }` safely coexists with the SDK's `{ metric: "err_timeouts" }`.

### 3.4 NULL Rate Tracking

17 scripts declare `telemetry_null_cols` in `scripts/manifest.json`. The SDK's `captureTelemetry()`/`diffTelemetry()` system tracks NULL fill rates before and after each run.

Key tracked columns: `issued_date`, `description`, `builder_name`, `latitude`, `longitude`, `centroid_lat`, `centroid_lng`, `neighbourhood_id`, `scope_classified_at`, `trade_classified_at`, `phone`, `email`, `website`.
</behavior>

---

<behavior>
## 4. Infrastructure Defense

### 4.1 Pre-Flight Bloat Gate (B24/B25)

**Phase 0 is the sole bloat defense.** Before any steps run, `run-chain.js` queries `pg_stat_user_tables` for the dead tuple ratio on all chain tables.

| Dead Ratio | Action | Dashboard |
|------------|--------|-----------|
| < 30% | PASS — continue | Green |
| 30-50% | WARN — continue with warning | Amber |
| > 50% | ABORT — halt chain, create FAIL row | Red |

On ABORT, the chain's `pipeline_runs` row is updated with `status: 'failed'`, a descriptive `error_message`, and a `pre_flight_audit` with FAIL verdict and `sys_db_bloat_*` metrics. The dashboard shows a red indicator with bloat drill-down.

**Why no per-step gate:** Normal pipeline upserts (237K+ rows) generate 50-99% dead tuples within the run. This is expected PostgreSQL MVCC behavior — autovacuum handles it between runs. A per-step gate would falsely abort every chain after its first mutation step.

### 4.2 PostGIS Dual-Path (B10/B11/B12)

Spatial scripts (link-massing, link-neighbourhoods, link-parcels, compute-centroids) detect PostGIS availability at runtime:

- **PostGIS available (production):** Use `ST_Contains()`, `ST_Centroid()`, `ST_DWithin()` with GiST indexes for O(log n) spatial queries
- **PostGIS unavailable (local dev):** Fall back to JavaScript spatial math (Turf.js, ray-casting, haversine)

This ensures scripts work in all environments while leveraging native spatial indexing in production.

### 4.3 Streaming Memory Safety (B4)

Scripts processing large result sets must use `pipeline.streamQuery()` instead of `pool.query()`. The async generator yields one row at a time via `pg-query-stream`, preventing V8 OOM on tables with 100K+ rows.

The stream cursor is destroyed in a `finally` block to prevent PostgreSQL cursor leaks on early consumer exit.
</behavior>

---

<behavior>
## 5. CI/CD Enforcement

### 5.1 Pipeline Lint Workflow

`.github/workflows/pipeline-lint.yml` triggers on PRs to `main` that touch `scripts/**`:

| Job | Tool | What It Catches |
|-----|------|----------------|
| `boy-scout` | `enforce-boy-scout.sh` | Developer touched grandfathered script without fixing violations |
| `eslint` | `npx eslint scripts/` | `new Pool()`, `new pg.Pool()`, `process.exit()`, empty catch blocks |
| `ruff` | `ruff check scripts/*.py` | `psycopg2` import, bare `except:`, exception hygiene |

### 5.2 Grandfather Policy

When V2 was enacted, 9 legacy scripts were grandfathered in `scripts/.grandfather.txt`:

- `audit_all_specs.mjs`, `generate-db-docs.mjs`, `local-cron.js`, `poc-aic-scraper-v2.js`
- `quality/assert-data-bounds.js`, `quality/assert-engine-health.js`, `quality/assert-schema.js`
- `run-chain.js`, `task-init.mjs`

**Boy Scout Rule:** If you edit a grandfathered file for any reason, you must fix its lint warnings and remove it from the grandfather list in the same PR. CI enforces this programmatically.

The list is expected to reach zero through normal sprint work without requiring dedicated refactoring sprints.

### 5.3 Chaos Regression Suite

19 permanent automated tests guard every defense layer:

| Suite | Tests | What Breaks the Build |
|-------|-------|----------------------|
| Test A: Linter Guard | 8 | Someone removes Pool ban, process.exit ban, psycopg2 ban, or weakens grandfather enforcement |
| Test B: Pre-Flight Gate | 5 | Someone removes bloat gate, thresholds, or Phase 0 audit |
| Test C: Telemetry Intercept | 5 | Someone breaks auto-injection, namespace isolation, or append-don't-replace |
| Test D: Memory Squeeze | 4 | Someone removes streamQuery, breaks cursor cleanup, or reverts streaming |
</behavior>

---

<testing>
## 6. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic:** `pipeline-sdk.logic.test.ts` — SDK exports, emitSummary auto-injection, classifyError, streamQuery, chaos regression suite (229 tests)
- **Logic:** `chain.logic.test.ts` — chain orchestration, bloat gate, Phase 0 Pre-Flight, step verdicts (153 tests)
- **Logic:** `inspections.logic.test.ts` — classify-inspection-status SQL correctness (95 tests)
- **Infra:** `quality.infra.test.ts` — CQA script registration, engine health detection (72 tests)
<!-- TEST_INJECT_END -->
</testing>

---

<constraints>
## 7. Operating Boundaries

### Target Files
- `scripts/lib/pipeline.js` — the SDK (single source of truth for pool, transactions, telemetry)
- `scripts/run-chain.js` — the orchestrator (chain execution, bloat gate, step tracking)
- `scripts/manifest.json` — script registry (chains, telemetry declarations)
- `eslint.config.mjs` — pipeline lint rules
- `ruff.toml` — Python lint rules
- `.github/workflows/pipeline-lint.yml` — CI enforcement
- `scripts/.grandfather.txt` — legacy exemption list
- `scripts/enforce-boy-scout.sh` — Boy Scout Rule enforcer

### Out-of-Scope Files
- `src/app/api/` — API routes have their own error handling standards (§2.2 of engineering_standards.md)
- `functions/` — Cloud Functions have separate deployment lifecycle

### Cross-Spec Dependencies
- **Relies on:** `00_engineering_standards.md` (§9 pipeline standards)
- **Extended by:** `40_pipeline_system.md` (SDK mechanics, protocol details)
- **Consumed by:** All chain specs (`41-46`), all source specs (`50-57`), shared steps (`60`)
</constraints>
