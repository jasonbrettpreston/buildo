# Active Task: WF2 — Pipeline SDK Hardening (Phase 1 Step 1)
**Status:** Planning
**Workflow:** WF2 — Feature Enhancement
**Rollback Anchor:** `7e45ee2`

## Context
* **Goal:** Harden `scripts/lib/pipeline.js` and `scripts/run-chain.js` with 3 force-multiplier capabilities that unlock Priority 1 script fixes in the next step.
* **Target Spec:** `docs/specs/pipeline/40_pipeline_system.md`
* **Key Files:** `scripts/lib/pipeline.js`, `scripts/run-chain.js`, `src/tests/pipeline-sdk.logic.test.ts`, `src/tests/chain.logic.test.ts`

## Technical Implementation

### Feature 1: `pipeline.streamQuery()` — Streaming query helper (B4)
**Problem:** 6 scripts (compute-centroids, enrich-wsib, link-massing, load-massing, load-parcels, load-wsib) load entire result sets into V8 memory via `pool.query()`, risking OOM on large tables.

**Implementation:**
* Install `pg-query-stream` as a dependency
* Add `streamQuery(pool, sql, params)` to pipeline SDK that returns an async iterable
* Scripts can then `for await (const row of pipeline.streamQuery(pool, sql))` instead of `const { rows } = await pool.query(sql)`
* The SDK handles cursor cleanup in a finally block

```js
async function* streamQuery(pool, sql, params = [], options = {}) {
  const QueryStream = require('pg-query-stream');
  const client = await pool.connect();
  try {
    const qs = new QueryStream(sql, params, { batchSize: options.batchSize || 100 });
    const stream = client.query(qs);
    for await (const row of stream) {
      yield row;
    }
  } finally {
    client.release();
  }
}
```

### Feature 2: Velocity tracking in `progress()` (B19)
**Problem:** No visibility into pipeline throughput degradation over time.

**Implementation:**
* Enhance `progress()` to compute and log rows/sec
* Add `_velocityWindow` array tracking last 5 progress checkpoints
* Log velocity and velocity delta (acceleration/deceleration) in progress output
* No breaking changes — existing callers get velocity for free

```js
function progress(label, current, total, startMs) {
  const elapsed = (Date.now() - startMs) / 1000;
  const pct = total > 0 ? ((current / total) * 100).toFixed(1) : '0.0';
  const velocity = elapsed > 0 ? Math.round(current / elapsed) : 0;
  console.log(`  [${label}] ${current.toLocaleString()} / ${total.toLocaleString()} (${pct}%) — ${elapsed.toFixed(1)}s — ${velocity} rows/s`);
}
```

### Feature 3: Pre-flight bloat gate in `run-chain.js` (B24/B25)
**Problem:** Heavy mutation chains can compound dead tuples if autovacuum hasn't caught up.

**Implementation:**
* Before each mutator step, query `pg_stat_user_tables` for `n_dead_tup` / `(n_live_tup + n_dead_tup)` ratio on the target tables
* If dead_ratio > 0.20 (20%), log a warning but continue
* If dead_ratio > 0.50 (50%), abort the chain with a clear error message
* Uses `captureTelemetry()` already in the SDK — just needs a gate check added
* Target tables derived from manifest.json `scripts[slug].writes` if available

## Database Impact
NO

## Standards Compliance
* **Try-Catch Boundary:** `streamQuery` has try/finally for client cleanup. `run-chain.js` gate errors are logged via pipeline SDK.
* **Unhappy Path Tests:** Stream error handling, empty result stream, bloat gate threshold tests
* **logError Mandate:** N/A — pipeline SDK logging (not API route)
* **Mobile-First:** N/A — backend infrastructure

## Execution Plan
- [ ] **State Verification:** SDK already has captureTelemetry with dead_ratio. progress() exists but lacks velocity. pg-query-stream not installed.
- [ ] **Contract Definition:** N/A — SDK internal, no API route
- [ ] **Spec Update:** Update `docs/specs/pipeline/40_pipeline_system.md` with new SDK exports. Run `npm run system-map`.
- [ ] **Schema Evolution:** N/A — no DB changes
- [ ] **Guardrail Test:** Add tests for streamQuery (mock), velocity progress output, bloat gate threshold logic
- [ ] **Red Light:** Verify new tests fail
- [ ] **Implementation:**
  - [ ] `npm install pg-query-stream` 
  - [ ] Add `streamQuery()` to pipeline.js + export
  - [ ] Enhance `progress()` with velocity (rows/s)
  - [ ] Add bloat gate to run-chain.js (before each step, check dead_ratio)
  - [ ] Update spec with new SDK exports
- [ ] **UI Regression Check:** N/A — backend only
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6
