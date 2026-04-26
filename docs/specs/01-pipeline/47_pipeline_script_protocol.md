# Pipeline Script Protocol — New Step Authoring Standard

**Applies to:** Every new CommonJS script added to `scripts/` that runs as a step in any
pipeline chain (`permits`, `coa`, `sources`, `deep_scrapes`, `entities`).

**Derived from:** Systematic review of scripts 81-86 (`docs/reports/script_review_80_86/`),
adversarial + observability + spec-compliance review outputs, and `classify-lifecycle-phase.js`
as the reference implementation.

---

## 1. The Two Non-Negotiables

Before reading anything else, internalize these two rules. Every other section in this spec
elaborates on one of them.

1. **Never leave the DB in partial state.** Every multi-row mutation must be atomic.
   If the process crashes after line 1, the DB must be identical to before line 1.

2. **Never let an unknown value silently become a wrong value.** NaN is not 0.
   `undefined` is not a sensible default. Config missing a key is not a reason to produce
   corrupt output — it is a reason to stop and warn.

---

## 2. Required Skeleton

Every new pipeline script MUST follow this exact structure. Items marked **MANDATORY** cannot
be omitted. Items marked **IF APPLICABLE** may be omitted with a one-line comment explaining why.

```js
#!/usr/bin/env node
/**
 * [Script display name] — [one sentence describing what it computes/writes].
 *
 * [2-4 sentences: input tables, logic summary, output tables, incremental vs full.]
 *
 * SPEC LINK: docs/specs/[path to the canonical spec file for this feature]
 */
'use strict';

// §R1 — SDK imports (MANDATORY)
const pipeline = require('./lib/pipeline');
const { loadMarketplaceConfigs } = require('./lib/config-loader');
// ... additional lib imports

// §R2 — Advisory lock ID (MANDATORY — see §5)
const ADVISORY_LOCK_ID = [spec_number]; // e.g. 88 for spec 88_foo.md

// §R3 — Batch size constants (MANDATORY if doing batch writes — see §6)
const BATCH_SIZE = Math.floor(65535 / [column_count]); // §9.2 compliance

pipeline.run('[script-slug]', async (pool) => {

  // §R3.5 — Startup timestamp (MANDATORY — see §14)
  // Capture the DB clock once. All batch writes that set a timestamp column
  // MUST use RUN_AT as a parameter, never NOW() or new Date() in the loop.
  const { rows: [{ now: RUN_AT }] } = await pool.query('SELECT NOW() AS now');

  // §R4 — Config load + Zod validation (MANDATORY — see §4)
  const { logicVars, tradeConfigs } = await loadMarketplaceConfigs(pool, '[script-slug]');
  // Validate ALL keys consumed by this script:
  const config = validateConfig(logicVars); // see §4 — throws on bad values

  // §R5 — Startup guards (MANDATORY if any constant array is used in SQL — see §4.3)
  if (SOME_REQUIRED_ARRAY.length === 0) {
    throw new Error('[script-slug] SOME_REQUIRED_ARRAY is empty — refusing to run');
  }

  // §R6 — Advisory lock via SDK helper (MANDATORY — see §5)
  // pipeline.withAdvisoryLock uses pg_try_advisory_xact_lock (transaction-level).
  // The lock is released automatically when the transaction ends — no explicit unlock
  // call, no SIGTERM handler, no lockClient bookkeeping needed.
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {

    // §R7 — Data read (MANDATORY — see §6)
    // Use streamQuery for any table expected to return >10K rows.
    // Use pool.query ONLY for bounded queries (config tables, rollup queries).

    // §R8 — Computation (MANDATORY — pure functions from scripts/lib/ where possible)

    // §R9 — Atomic write (MANDATORY — see §7)
    // All DELETEs + UPSERTs that belong together MUST be in ONE withTransaction call.

    // §R10 — PIPELINE_SUMMARY with audit_table (MANDATORY — see §8)
    pipeline.emitSummary({
      records_total: ...,
      records_new: ...,
      records_updated: ...,
      records_meta: {
        // ... domain counters
        audit_table: buildAuditTable(...), // see §8
      },
    });

    // §R11 — PIPELINE_META (MANDATORY — see §8)
    pipeline.emitMeta(
      { [input_table]: ['col1', 'col2'] },
      { [output_table]: ['col1', 'col2'] },
    );

    // §R12 — CQA gate (IF APPLICABLE — throw to mark run as FAIL)
    if (unclassifiedCount > config.unclassified_threshold) {
      throw new Error(`BLOCKING: ${unclassifiedCount} exceed threshold`);
    }

  }); // withAdvisoryLock

  if (!lockResult.acquired) {
    // SDK already emitted PIPELINE_SUMMARY with skipped:true (skipEmit default).
    // If the script needs a richer SKIP payload (custom audit_table), pass
    // { skipEmit: false } to withAdvisoryLock and emit manually here.
    return;
  }

});
```

---

## 3. SPEC LINK Header

**MANDATORY.** The header comment MUST include:

```js
 * SPEC LINK: docs/specs/product/future/NN_feature_name.md
```

Rules:
- Point to the **spec file**, never a report or implementation document.
- The spec number in the link MUST match `ADVISORY_LOCK_ID` at `§R2`.
  **Exception — CQA assert scripts (`scripts/quality/`):** These use sequential IDs from the
  100+ block (102, 103, ...) regardless of their owning spec number, because they frequently
  govern multiple specs or have no single dedicated spec number. Their SPEC LINK points to
  the functional spec that defines their correctness contract. The canonical registry is in
  §A.5. The lock ID uniqueness rule from §5.2 still applies.
- If the spec does not yet exist, create it before committing the script.
- If the script is governed by multiple specs (e.g., produces data for spec 85 but is
  described in spec 86), list both:
  ```js
   * SPEC LINK: docs/specs/product/future/85_trade_forecast_engine.md (consumer)
   * SPEC LINK: docs/specs/product/future/86_control_panel.md (algorithm owner)
  ```

**Common failure mode caught in 81/82/84/85/86:** All six scripts pointed to
`docs/reports/lifecycle_phase_implementation.md` — a report, not a spec. The spec link rot
meant reviewers had no authoritative source to compare against, causing spec-vs-code drift to
go undetected for months (H-W26).

---

## 4. Config Loading & Validation

### 4.1 Two categories of constant — know which bucket a value belongs in

Before writing any constant, apply this decision rule:

```
Is an operator (without a code deploy) expected or permitted to change this value?
│
├── YES → "Business logic value" — belongs in the DB, loaded at runtime.
│         Examples: rates, multipliers, thresholds, windows, percentages,
│                   any value in a spec's logic_variables or trade_configurations table.
│         Rule: BOTH the JS pipeline path and the TS API path call loadMarketplaceConfigs
│               (or the TS equivalent). Never hardcode in any .js or .ts file.
│
└── NO  → "Structural constant" — belongs in scripts/lib/[feature]-shared.js.
          Examples: enum vocabularies (phase names, status strings), slug lists,
                    arrays used as SQL filters, advisory lock IDs, batch size formulas.
          Rule: If changing this value would require a spec update, a migration, AND
                updates to every consumer, it is structural. An admin flipping it via
                the Control Panel would break the system — so it must not be in the DB.
```

**The test:** Could an operator set this to an arbitrary value (e.g., 0, -1, a typo) via
the Admin Panel without causing a system-level failure that requires a code fix? If yes →
DB. If no → shared lib.

```js
// DB — operator-tunable, loaded at runtime by BOTH paths
const { logicVars, tradeConfigs } = await loadMarketplaceConfigs(pool, 'script-slug');
// logicVars.stall_threshold_days, logicVars.imminent_window_days, etc.

// Shared lib — structural, imported as a JS module constant
const { PHASE_ORDINAL, DEAD_STATUS_ARRAY, URGENCY_VALUES } = require('./lib/lifecycle-phase');
```

Never hardcode a business logic value as a `const` in a script body or in a shared lib file.
Any numeric rate, multiplier, threshold, window, or percentage that appears in a spec's
`logic_variables` or `trade_configurations` table MUST be loaded from the DB at startup.

### 4.2 Validate every key with Zod

After loading, validate ALL config keys consumed by the script before doing any computation:

```js
const { z } = require('zod');

const ConfigSchema = z.object({
  expired_threshold_days:  z.number().int().positive(),
  imminent_window_days:    z.number().int().positive(),
  stall_threshold_days:    z.number().int().positive(),
  // ... every key the script reads
});

function validateConfig(logicVars) {
  const result = ConfigSchema.safeParse(logicVars);
  if (!result.success) {
    throw new Error(
      `[script-slug] config validation failed: ${result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`
    );
  }
  return result.data;
}
```

**Why this matters (H-W11):** `compute-trade-forecasts.js` accessed `logicVars.expired_threshold_days`
directly. When the DB key was missing, it was `undefined`. `Math.abs(undefined)` is `NaN`.
`daysUntil <= NaN` is always `false` — so no permit ever classified as "expired", silently.
The chain ran, returned exit code 0, and produced wrong urgency for every permit in the
database. Zod would have thrown at startup with a clear message.

### 4.3 Startup guards for SQL arrays

If the script passes a constant array into a SQL `<> ALL($1::text[])` clause, validate it is
non-empty before running any queries:

```js
if (DEAD_STATUS_ARRAY.length === 0) {
  throw new Error('[script-slug] DEAD_STATUS_ARRAY is empty — refusing to run (vacuously true guard)');
}
```

**Why:** An empty array in `<> ALL(ARRAY[]::text[])` is vacuously true — every row matches,
so the WHERE clause is dropped silently. For a filter intended to *exclude* dead records, this
means every dead record is included. The script succeeds with wrong data.

### 4.4 NaN/finite guards on all numeric config reads

After Zod validation, any config value used in arithmetic MUST be guarded at the read site
if the arithmetic could produce NaN silently:

```js
// WRONG — if parseFloat returns NaN, every downstream calculation is wrong
const multiplier = parseFloat(row.multiplier_bid);

// RIGHT — guard at the read site, fallback with explicit warn
const multiplier = parseFloat(row.multiplier_bid);
if (!Number.isFinite(multiplier)) {
  pipeline.log.warn('[script-slug]', `Non-finite multiplier for ${row.trade_slug} — falling back to default`, { raw: row.multiplier_bid });
  // use a safe fallback from validated config
}
```

---

## 5. Advisory Lock

### 5.1 Every script MUST acquire a lock

No exceptions. Two concurrent runs of the same script (nightly chain + admin manual re-trigger)
produce race conditions on DELETE/UPSERT, double-fired alerts, and non-deterministic scores.

### 5.2 Lock ID convention

```
ADVISORY_LOCK_ID = spec number of the owning spec (e.g. 88 for spec 88_foo.md)
```

This makes lock IDs human-traceable in `pg_locks` and prevents silent collisions between
scripts. **Failure mode (83-W7):** `compute-cost-estimates.js` used lock ID 74 (wrong spec
number). Any script that legitimately uses lock 74 would silently contend with it.

### 5.3 Lock MUST be acquired via `pipeline.withAdvisoryLock()`

```js
// WRONG — session-level lock survives SIGKILL. A zombie connection holds the lock
// indefinitely, permanently blocking the pipeline until manual pg_advisory_unlock().
const lockClient = await pool.connect();
await lockClient.query('SELECT pg_try_advisory_lock($1)', [ADVISORY_LOCK_ID]);

// WRONG — pool.query checks out an ephemeral connection that can be reaped by the
// pool's idleTimeoutMillis during CPU-heavy phases (Failure mode 83-W5).
await pool.query('SELECT pg_try_advisory_lock($1)', [ADVISORY_LOCK_ID]);

// RIGHT — SDK helper uses pg_try_advisory_xact_lock (transaction-level).
// Lock auto-releases when the transaction ends — SIGKILL-safe.
const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
  // ... entire script body here
});
if (!lockResult.acquired) return; // SDK already emitted SKIP summary
```

**Failure mode (83-W5):** The old session-lock via `pool.query` was silently released mid-run when the pool's idle-timeout reaped the connection during CPU-bound work. Two instances ran simultaneously, each committing partial results.

### 5.4 Lock lifecycle is fully managed by the SDK helper

`pipeline.withAdvisoryLock()` handles all lock lifecycle concerns:

- Uses `BEGIN` + `pg_try_advisory_xact_lock($1)` inside a single dedicated client
- On lock-not-acquired: issues `ROLLBACK`, releases client, emits default SKIP summary (or skips emit if `{ skipEmit: false }`)
- On `fn()` success: issues `COMMIT` — this releases the xact_lock atomically
- On `fn()` error: issues `ROLLBACK` — lock released, error re-thrown, client released in `finally`
- On `pool.connect()` failure: error propagates, no client to release

No explicit `pg_advisory_unlock` call is ever needed or correct — you cannot manually unlock a transaction-level advisory lock; only `COMMIT`/`ROLLBACK` releases it.

### 5.5 Graceful Shutdown (SIGTERM) — not needed with xact_lock

**The old concern:** Session-level locks survived SIGKILL, so a `SIGTERM` handler was needed to call `pg_advisory_unlock` before `process.exit`. Installing a handler was MANDATORY under the old pattern.

**With xact_lock (current SDK):** When the process is killed:
- The OS closes the PostgreSQL backend connection
- PostgreSQL detects the backend died and rolls back any open transaction
- The transaction-level advisory lock is released as part of that rollback

No explicit SIGTERM handler is needed or should be installed. Installing one would create a race condition between the script's `process.exit` and the SDK's own `ROLLBACK`-on-close behavior.

**Do NOT add `process.on('SIGTERM', ...)` to new pipeline scripts.** The `compute-cost-estimates.infra.test.ts` adoption test asserts its absence.

---

## 6. Data Access Patterns

### 6.1 Startup timestamp — capture once, pass everywhere

The very first query in every script MUST capture a single run timestamp from the DB.
This timestamp is used for all batch UPDATEs and INSERTs that set a timestamp column,
and for all JS date arithmetic performed during the run. See §14 for the full rationale.

```js
pipeline.run('script-slug', async (pool) => {
  // FIRST query — before config load, before lock acquisition.
  // Captures the DB clock at cursor-open time. All subsequent
  // batches use this value so the run is internally consistent
  // regardless of wall-clock midnight crossings.
  const { rows: [{ now: RUN_AT }] } = await pool.query('SELECT NOW() AS now');
  // RUN_AT is a JS Date in UTC. Pass as $N to any SQL that sets computed_at,
  // classified_at, updated_at, etc.
  ...
```

### 6.2 Streaming for large tables

Any query expected to return more than 10K rows MUST use `pipeline.streamQuery`:

```js
// WRONG — loads 700K rows into Node heap in one shot
const result = await pool.query('SELECT ... FROM permits WHERE ...');
const rows = result.rows; // OOM at scale

// RIGHT — streams rows in chunks, flushes per batch
const batch = [];
for await (const row of pipeline.streamQuery(pool, 'SELECT ... FROM permits WHERE ...')) {
  batch.push(row);
  if (batch.length >= BATCH_SIZE) {
    await flushBatch(pool, batch);
    batch.length = 0;
  }
}
if (batch.length > 0) await flushBatch(pool, batch);
```

**Memory Leaks in "Safe" Streams:** Node's `pg-query-stream` pushes data as fast as Postgres can supply it. If your script's computation (or the batch UPSERT) takes longer than reading the rows, the rows buffer in Node's memory. The script will quietly consume 2GB+ of RAM and OOM-crash. You must ensure proper backpressure. If using a `for await` loop, ensure the DB read is actually pausing while the `flushBatch()` await resolves.

**Tables that always require streamQuery:** `permits`, `coa_applications`, `trade_forecasts`,
`permit_inspections` (raw), `tracked_projects`.

**Tables where `pool.query` is acceptable:** config tables (`logic_variables`,
`trade_configurations`), rollup/aggregate queries, post-run telemetry queries (bounded by
`LIMIT`).

### 6.3 Pagination parameter limit (§9.2)

Batch INSERT and UPDATE statements MUST be sized to stay under PostgreSQL's 65,535-parameter
limit:

```js
const COLUMN_COUNT = 7; // number of params per row in your INSERT
const BATCH_SIZE = Math.floor(65535 / COLUMN_COUNT); // = 9362
```

This constant MUST be defined at the top of the script, not hardcoded inline.

### 6.4 IS DISTINCT FROM on all write-guarded UPDATEs

Any UPDATE that is run incrementally (i.e., it may be re-run on rows that haven't changed)
MUST include an `IS DISTINCT FROM` guard to avoid phantom writes:

```sql
UPDATE permits p
   SET opportunity_score = v.score
  FROM (VALUES ...) AS v(permit_num, revision_num, score)
 WHERE p.permit_num = v.permit_num
   AND p.revision_num = v.revision_num
   AND p.opportunity_score IS DISTINCT FROM v.score  -- skip no-op writes
```

### 6.5 Idempotent writes (§9.3)

All INSERTs MUST be `ON CONFLICT DO UPDATE` (upsert) or `ON CONFLICT DO NOTHING`, never bare
INSERT. Re-running the script must produce the same DB state.

### 6.6 Complex Type Batching (PostGIS)

**The Reality:** When processing spatial data—like crunching geometries—batching becomes fragile. Standard primitive types (strings, ints) fail gracefully with Zod. Complex types do not. 
**The Impact:** A single invalid geometry, an unclosed polygon, or a mismatched SRID will cause Postgres to forcefully roll back the entire batch of 9,000+ rows. Finding the one bad geometry in that batch is a debugging nightmare.
**MANDATORY for Spatial Scripts:** Any pipeline step handling PostGIS data MUST implement a pre-validation step in JS before the batch hits the database.

### 6.7 Resumability and High-Water Marks

**The Reality:** Idempotency means you can safely rerun a failed script from the beginning.
**The Impact:** If a script takes 2 minutes to run, rerunning from scratch is fine. If a script takes 45 minutes to crunch 800K rows and crashes at minute 44, rerunning from scratch is incredibly expensive and frustrating.
**Guideline:** Don't mandate this for every script. Reserve it strictly for pipelines where the runtime exceeds your tolerance for wasted compute. For large jobs, implement high-water marks (e.g. `last_processed_id`).

---

## 7. Transaction Discipline

### 7.1 Atomicity rule

All mutations that belong to a single logical operation MUST commit together or not at all.
"Logical operation" means: if mutation B being committed without mutation A would leave the
DB in a state that breaks any downstream consumer, they belong in the same transaction.

**Failure pattern (H-W2):** `compute-trade-forecasts.js` did a stale-purge DELETE then
separate batch UPSERTs. A crash between them left no rows in the table. The next daily
forecast was computed against an empty table, silently producing zero-row output.

### 7.2 Use `pipeline.withTransaction` (never manual BEGIN/COMMIT)

```js
// WRONG — manual transaction management misses the nested-rollback guard
const client = await pool.connect();
await client.query('BEGIN');
// ... mutations ...
await client.query('COMMIT');

// RIGHT — SDK handles BEGIN, COMMIT, nested-try ROLLBACK, client release
await pipeline.withTransaction(pool, async (client) => {
  // ... all mutations in this logical unit ...
});
```

### 7.3 DELETE + UPSERT must be in the same withTransaction

```js
// WRONG — crash between DELETE and UPSERT = empty table
await pool.query('DELETE FROM trade_forecasts WHERE ...');
for (const batch of batches) {
  await pool.query('INSERT INTO trade_forecasts ... ON CONFLICT DO UPDATE ...');
}

// RIGHT — atomic: either both commit or neither does
await pipeline.withTransaction(pool, async (client) => {
  await client.query('DELETE FROM trade_forecasts WHERE ...');
  for (const batch of batches) {
    await client.query('INSERT INTO trade_forecasts ... ON CONFLICT DO UPDATE ...', params);
  }
});
```

### 7.4 No silent row-level catch inside a transaction

```js
// WRONG — swallows per-row errors; withTransaction COMMITs with missing rows
await pipeline.withTransaction(pool, async (client) => {
  for (const row of rows) {
    try {
      await client.query('INSERT ...', [row.id, row.value]);
    } catch (e) {
      failedCount++; // error swallowed — transaction commits anyway
    }
  }
});

// RIGHT — let the error propagate; withTransaction rolls back the whole batch
await pipeline.withTransaction(pool, async (client) => {
  for (const row of rows) {
    await client.query('INSERT ...', [row.id, row.value]); // throws → ROLLBACK
  }
});
```

If you need partial failure tolerance (skip bad rows, continue), handle it OUTSIDE the
transaction by pre-validating rows and moving invalid ones to a separate error counter
before entering `withTransaction`.

### 7.5 Never use Promise.all on the same pg client inside a transaction

Inside a `withTransaction` callback, every query MUST be `await`-ed sequentially. Do NOT
use `Promise.all([client.query(...), client.query(...)])` on the same `client` object.

```js
// WRONG — pg wire protocol is not multiplexed on a single connection.
// Promise.all fires both queries simultaneously on the same socket,
// causing packet interleaving, a protocol sync error, and an
// unrecoverable connection state that CANNOT be rolled back cleanly.
await pipeline.withTransaction(pool, async (client) => {
  await Promise.all([
    client.query('UPDATE permits SET ... WHERE ...', paramsA),
    client.query('UPDATE trade_forecasts SET ... WHERE ...', paramsB),
  ]);
});

// RIGHT — sequential awaits; the pg wire protocol delivers one
// request-response pair at a time per connection.
await pipeline.withTransaction(pool, async (client) => {
  await client.query('UPDATE permits SET ... WHERE ...', paramsA);
  await client.query('UPDATE trade_forecasts SET ... WHERE ...', paramsB);
});
```

If you genuinely need parallel DB writes, open separate pool connections (outside the
transaction) for each independent write path. But within a transaction, sequential is the
only safe pattern.

### 7.6 Batched multi-row VALUES (not N+1 single-row INSERTs)

```js
// WRONG — 10,000 single-row INSERTs = 10,000 round trips = slow
for (const row of rows) {
  await client.query('INSERT INTO tracked_projects (id, status) VALUES ($1, $2)', [row.id, row.status]);
}

// RIGHT — one statement per batch of BATCH_SIZE rows
const tuples = rows.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ');
const params = rows.flatMap(r => [r.id, r.status]);
await client.query(`INSERT INTO tracked_projects (id, status) VALUES ${tuples} ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status`, params);
```

### 7.6 Transient Database Errors (Deadlocks)

**The Reality:** Postgres `ON CONFLICT DO UPDATE` heavily utilizes row-level locks. If your API is writing to the same tables that the pipeline is batch-upserting, Postgres will occasionally detect a deadlock and kill one of the transactions.
**The Impact:** Your entire pipeline step crashes for a totally normal, expected database behavior.
**MANDATORY:** The SDK's `withTransaction` wrapper must catch error code `40P01` (deadlock detected) and automatically retry the transaction 2-3 times before failing the script. Ensure closures are idempotent.

### 7.7 Concurrent Promises in Transactions Ban

**MANDATORY:** Inside `pipeline.withTransaction`, you MUST NOT use `Promise.all` concurrently on the same `client`. The `pg` driver will interleave packets and permanently crash the database connection. Await sequentially.

---

## 8. Observability Requirements

### 8.1 PIPELINE_SUMMARY (MANDATORY)

Every script MUST call `pipeline.emitSummary(...)` exactly once, at the end of the successful
path. The three top-level fields are enforced:

| Field | Meaning | How to compute |
|-------|---------|----------------|
| `records_total` | Rows examined / processed this run | Input query row count |
| `records_new` | Rows inserted for the first time | Capture preRowCount BEFORE any DELETE; use `xmax = 0` from RETURNING if available |
| `records_updated` | Rows modified in place | Sum `result.rowCount` from each UPDATE call, NOT batch sizes |

**Failure mode (81-W5, 82-W6, 85-W6):** Three scripts emitted batch sizes or pre-delete
counts instead of actual `rowCount`. The admin dashboard showed 5,000 "updates" when 0 rows
actually changed — masking upstream failures.

### 8.2 audit_table in records_meta (MANDATORY)

Every script MUST include an `audit_table` in `records_meta`. The SDK auto-injects a stub
`{verdict:'PASS', rows:[]}` when `audit_table` is absent — causing the admin FreshnessTimeline
to show green regardless of actual state (H-W18).

```js
const auditRows = [
  // At minimum, include a count of key outputs and at least one threshold row
  { metric: 'records_processed',  value: totalCount,       threshold: null,    status: 'INFO' },
  { metric: 'records_with_errors', value: errorCount,      threshold: '== 0',  status: errorCount === 0 ? 'PASS' : 'WARN' },
  { metric: 'unclassified_count', value: unclassified,     threshold: '<= 100', status: unclassified <= 100 ? 'PASS' : 'FAIL' },
  // ... add domain-specific health metrics
];

pipeline.emitSummary({
  records_total: totalCount,
  records_new: newCount,
  records_updated: updatedCount,
  records_meta: {
    // ... domain counters (per-trade breakdowns, calibration method distribution, etc.)
    audit_table: {
      phase: [step_number_in_chain],  // integer for admin UI ordering
      name:  '[Human-readable script name]',
      verdict: auditRows.some(r => r.status === 'FAIL') ? 'FAIL'
             : auditRows.some(r => r.status === 'WARN') ? 'WARN'
             : 'PASS',
      rows: auditRows,
    },
  },
});
```

**Minimum audit_table rows for each script type:**

| Script type | Required rows |
|-------------|---------------|
| Classifier  | `records_dirty`, `records_updated`, `unclassified_count` (with threshold) |
| Score engine | `records_scored`, `records_unchanged`, `null_input_rate` (with threshold) |
| Forecast engine | `forecasts_computed`, `stale_purged`, `default_calibration_pct` (with threshold) |
| Cost model  | `cost_estimated`, `from_permit_pct`, `null_estimate_rate` (with threshold) |
| Alert delivery | `alerts_evaluated`, `alerts_delivered`, `delivery_errors` (with threshold) |
| Calibration | `phase_pairs_computed`, `pairs_above_threshold`, `negative_gap_count` (with threshold) |

### 8.3 PIPELINE_META (MANDATORY)

```js
pipeline.emitMeta(
  {
    input_table_1: ['col1', 'col2'],   // columns READ
    input_table_2: ['col1'],
  },
  {
    output_table_1: ['col1', 'col2'],  // columns WRITTEN
  },
);
```

This drives the DataFlowTile in the admin dashboard. Missing META means the "reads/writes"
badges show nothing and the "Live Meta" indicator stays dark.

### 8.4 Domain counters in records_meta

Beyond the mandatory audit_table, include counters that answer the 3am debugging question
"what happened on this run?":

- **Distribution breakdowns** — e.g., urgency distribution (`expired: 42, imminent: 300, ...`),
  phase distribution, calibration method distribution.
- **Anomaly counters** — e.g., `null_urgency_rows`, `unmapped_trades`, `integrity_flag_count`.
- **Skipped/fallback counts** — e.g., `invalid_date_skipped`, `default_median_used`.
- **NEVER embed unbounded arrays** — cap alert arrays, transition arrays, etc. at 200 items
  and include `_truncated: true` + `_total: N` when truncated (82-W12).

### 8.5 Structured logging during the run

Use `pipeline.log.info/warn/error` — never `console.log/warn/error` directly.

Progress log frequency: every 50 batches (or every ~5 seconds of wall time) for long-running
loops. Log at the start of each major phase:

```js
pipeline.log.info('[script-slug]', 'Phase 1: loading dirty rows...');
pipeline.log.info('[script-slug]', `Dirty rows: ${count.toLocaleString()}`);
// ... process ...
pipeline.log.info('[script-slug]', `Phase 1 complete: ${updated.toLocaleString()} updated`);
```

### 8.6 PII Leakage Ban in Metadata Logging

**The Reality:** Standardizing debug contexts via `pipeline.log.warn('Validation fail', { raw: row })` is a common quick-fix when triaging data issues. 
**The Impact:** If that pipeline runs over data containing contact information, `raw: row` leaks that PII permanently into centralized logging systems (Datadog/CloudWatch), causing major compliance breaches.
**MANDATORY:** Never log raw data rows. Explicitly pluck only the offending primary keys and non-PII values into an aggregate debug object.

### 8.6 PII logging guard — never log raw DB rows

When logging anomalies or debug context, extract only primary keys and the specific bad
value. Never pass the raw row object as log context.

```js
// WRONG — dumps the entire DB row into telemetry/logs.
// If the row contains homeowner names, phone numbers, or gate codes,
// this is a compliance violation. Even if the current DB has no PII,
// future schema changes can add PII without this rule being revisited.
pipeline.log.warn('[script-slug]', 'Non-finite multiplier', { raw: row });

// RIGHT — extract only what is needed to locate the problem.
// The operator can query the DB with the permit_num if they need more.
pipeline.log.warn('[script-slug]', 'Non-finite multiplier — using default', {
  permit_num: row.permit_num,
  revision_num: row.revision_num,
  trade_slug: row.trade_slug,
  bad_value: row.multiplier_bid,  // the specific bad field only
});
```

**Rule:** The log context object MUST contain only:
- Primary key columns (permit_num, revision_num, id, etc.)
- The specific field(s) causing the anomaly
- Computed scalars (counts, rates, thresholds)

It MUST NOT contain full row objects, address fields, entity name fields, or any field
whose PII status is unknown.

---

## 9. Dual Code Path (§7)

If the script implements logic that also exists in a TypeScript API module (scoring, cost
estimation, classification, urgency), the two paths MUST be kept in sync.

### 9.1 Declaration requirement

At the top of the script, add a `DUAL PATH NOTE` comment:

```js
/**
 * DUAL PATH NOTE: Core scoring logic here MUST stay in sync with
 * src/lib/scoring/scorer.ts. The canonical contract is in
 * docs/specs/product/future/81_opportunity_score_engine.md §3.
 * To verify sync: run `npm run test` — the parity test in
 * src/tests/scoring.logic.test.ts calls both paths with identical inputs.
 */
```

### 9.2 How to share values between the JS pipeline and the TS API

The dual-path problem has two sub-cases. They require different solutions.

#### 9.2a Business logic values (rates, multipliers, thresholds) — load from DB in BOTH paths

If the constant is operator-tunable (§4.1 bucket: DB), the solution is NOT to create a
shared JS file. Hardcoding it in a shared file makes it invisible to the Admin Panel — it
exists in the codebase only, requires a git commit to change, and defeats the entire purpose
of the Control Panel.

Instead, BOTH the JS pipeline and the TS API must independently load the value from the DB:

```js
// JS pipeline script (scripts/compute-cost-estimates.js)
const { logicVars, tradeConfigs } = await loadMarketplaceConfigs(pool, 'compute-cost-estimates');
const shellMultiplier = logicVars.commercial_shell_multiplier; // DB is the single source

// TS API module (src/lib/leads/cost-model.ts)
const { logicVars } = await loadMarketplaceConfigs(pool, 'cost-model');
const shellMultiplier = logicVars.commercial_shell_multiplier; // same DB key, same source
```

The DB `logic_variables` row is the single source of truth. There is no shared file.
Changing the multiplier happens once in the Admin Panel and is immediately live in both paths.

**The loophole this closes:** The old §9.2 instructed developers to put `BASE_RATES`,
`PREMIUM_TIERS`, and `COMMERCIAL_SHELL_MULTIPLIER` into `scripts/lib/cost-model-shared.js`.
Those values were then invisible to the Admin Panel — changing them required a git commit
and full deployment. An operator wanting to adjust base rates during a market shift had
no self-service path. More critically, the spec's §4.1 ban on hardcoded thresholds was
being silently bypassed by routing those constants through a shared lib instead of the DB.

#### 9.2b Structural constants (enums, phase names, slug lists) — shared lib is correct

If the constant is structural (§4.1 bucket: shared lib) — an enum vocabulary, a set of
phase names, a list of status strings used in SQL filters — then a shared lib file IS the
right home, because these values must NOT be in the DB:

```js
// scripts/lib/lifecycle-phase.js — shared by JS scripts AND required by TS modules
module.exports = {
  PHASE_ORDINAL: { P7a: 1, P7b: 2, ... P20: 20 },  // structural: defines system shape
  DEAD_STATUS_ARRAY: ['Cancelled', 'Revoked', ...], // structural: used in SQL filter
  URGENCY_VALUES: Object.freeze(['expired', 'overdue', 'delayed', 'imminent', 'upcoming', 'on_time']),
};
```

These are safe to hardcode because:
- An operator setting `PHASE_ORDINAL.P7a = 0` would break the classifier; the Admin Panel
  must not expose these.
- Changing them requires a spec update + migration + consumer audit anyway — a code deploy
  is the right gate.
- They define the system's semantic vocabulary, not its business tuning parameters.

**Decision summary for dual-path constants:**

| Value type | Example | Home | Shared how |
|------------|---------|------|-----------|
| Rate / multiplier / threshold / window | `base_rate_sfd`, `shell_multiplier`, `stall_threshold_days` | DB `logic_variables` | Both paths call `loadMarketplaceConfigs` independently |
| Trade allocation percentage | `plumbing: 0.12` | DB `trade_configurations` | Both paths query the DB |
| Enum vocabulary / phase names | `PHASE_ORDINAL`, `URGENCY_VALUES` | `scripts/lib/*.js` | JS requires, TS imports |
| SQL filter arrays | `DEAD_STATUS_ARRAY` | `scripts/lib/*.js` | JS requires, TS imports |
| Slug lists / seed data | `VALID_TRADE_SLUGS` | `scripts/lib/*.js` or DB seed | Both paths read from the same place |

### 9.3 Parity test requirement

For every dual-path function, add a parity test in `src/tests/[feature].logic.test.ts`:

```ts
it('JS and TS paths produce identical output for sample inputs', () => {
  const tsResult = computeCostEstimate(samplePermit);    // TS module
  const jsResult = jsCostEstimate(samplePermit);         // JS module (require'd)
  expect(jsResult.estimated_cost).toBe(tsResult.estimated_cost);
  expect(jsResult.cost_source).toBe(tsResult.cost_source);
});
```

This test acts as a tripwire — any future change to one path that isn't reflected in the other
will fail CI immediately.

---

## 10. Producer → Consumer Contracts

When a script writes data that another script reads, the contract MUST be declared in both
specs and in the code.

### 10.1 Declare the contract in the spec

Every spec that describes a script producing data for another script MUST include a
`## Producer / Consumer Contracts` section:

```markdown
## Producer / Consumer Contracts

### Outputs written
| Table | Key columns | Contract |
|-------|-------------|---------|
| `trade_forecasts` | `(permit_num, revision_num, trade_slug)` | `urgency` is one of: `expired / overdue / delayed / imminent / upcoming / on_time`. NULL is not a valid value. |

### Consumed by
| Script | Column(s) read | Expected values |
|--------|---------------|----------------|
| `compute-opportunity-scores.js` | `urgency` | Excludes `expired`; all other values scored |
| `update-tracked-projects.js` | `urgency`, `predicted_start` | Routes `imminent` + `expired` to alerts |
```

### 10.2 Shared enum vocabulary

Any enum written by one script and read by another MUST have a single source of truth:

```js
// scripts/lib/lifecycle-phase.js (or an appropriate shared lib)
const URGENCY_VALUES = Object.freeze(['expired', 'overdue', 'delayed', 'imminent', 'upcoming', 'on_time']);

module.exports = { URGENCY_VALUES };
```

Both producer and consumer import from this file. The spec documents every value and its
required downstream routing.

**Failure mode (H-W15):** `compute-trade-forecasts.js` emitted 6 urgency values. 
`update-tracked-projects.js` only handled 2 (`imminent`, `expired`). Four values were silently
ignored, including `overdue` (predicted start already passed) which arguably warrants the
most urgent CRM alert.

### 10.3 Verify downstream handling before shipping a new value

Before adding a new enum value or nullable field to a producer's output, explicitly audit
every consumer script for handling:

```
Checklist before adding enum value 'new_value' to urgency:
[ ] compute-opportunity-scores.js — does it handle 'new_value'?
[ ] update-tracked-projects.js   — does it handle 'new_value'?
[ ] any frontend component consuming urgency via API?
```

---

## 11. Pre-Flight Checks (Required at Script Startup)

Run these checks at the top of `pipeline.run(...)`, before acquiring the lock or making any
DB queries:

```js
// 1. Non-empty arrays used in SQL guards
if (DEAD_STATUS_ARRAY.length === 0) throw new Error('DEAD_STATUS_ARRAY empty');

// 2. Required environment variables
if (!process.env.PG_HOST) throw new Error('PG_HOST not set');
// (pool creation will fail anyway, but explicit error is clearer)

// 3. After config load: validate all keys
const config = validateConfig(logicVars); // Zod schema — throws on fail
```

---

## 12. Self-Review Checklist (Run Before Every Commit)

Walk each item against the actual diff (not the intended diff). If any item fails, fix it
before proceeding to WF6.

```
Concurrency
[ ] Advisory lock acquired on a DEDICATED client (pool.connect), not pool.query
[ ] Lock ID == spec number (e.g. spec 88 → ADVISORY_LOCK_ID = 88)
[ ] Lock released in try/finally → innermost finally always calls lockClient.release()
[ ] Skip path releases the lock client BEFORE return (not just in finally)
[ ] No Promise.all([client.query, client.query]) inside withTransaction on the same client

Config & Validation
[ ] Every logic_variables key consumed by this script has a Zod schema entry
[ ] Zod parse called BEFORE any computation or DB writes
[ ] No hardcoded numeric threshold that an operator might want to tune
[ ] All numeric config reads guarded with Number.isFinite (or enforced by Zod)
[ ] ZERO_IS_INVALID set in config-loader includes all keys where 0 is nonsensical

Atomicity
[ ] Every DELETE + UPSERT that belong together are inside ONE pipeline.withTransaction
[ ] No per-row try/catch inside a withTransaction block
[ ] No unbounded in-memory array (> 10K rows) — streams or bounded batches only
[ ] Batch size = Math.floor(65535 / column_count) — computed constant, not a magic number
[ ] No bare pool.query for mutations inside a logical operation — use withTransaction

Writes
[ ] All INSERTs use ON CONFLICT DO UPDATE or ON CONFLICT DO NOTHING (idempotent)
[ ] IS DISTINCT FROM guard on all write-guarded UPDATEs
[ ] records_updated = sum of result.rowCount from each UPDATE call, NOT batch sizes
[ ] records_new captures preRowCount BEFORE any DELETE (not after)
[ ] ROUND() applied before ::int cast on any PERCENTILE_CONT or float aggregate

Time & Date (§14)
[ ] RUN_AT captured with SELECT NOW() from DB at startup — not new Date() in the script
[ ] RUN_AT passed as $N parameter to all batch UPDATEs/INSERTs that set a timestamp
[ ] No NOW() / CURRENT_DATE / CURRENT_TIMESTAMP inside batch loops
[ ] All JS date arithmetic uses setUTCHours / getUTCDate — not local TZ methods
[ ] isNaN(date.getTime()) guard before every .toISOString() call on a DB-sourced date

NULL Safety (§15)
[ ] No bare NOT IN (subquery) or NOT IN ('value') where the column can be NULL
[ ] Every nullable column used in a condition has explicit IS NULL / IS NOT NULL handling
[ ] Every DISTINCT ON query has a stable tertiary tie-breaker in ORDER BY
[ ] Every LEFT JOIN column is explicitly checked for NULL before use in JS logic

Streams (§16)
[ ] Tables > 10K rows use pipeline.streamQuery, not pool.query
[ ] If script streams and writes back to same table with concurrent writers: updated_at guard added
[ ] If stale-snapshot guard is NOT needed: comment documents why (lock/only-writer/append-only)

Observability
[ ] pipeline.emitSummary called exactly once
[ ] audit_table built with at least one threshold row (not just INFO rows)
[ ] audit_table.verdict computed from row statuses (not hardcoded 'PASS')
[ ] pipeline.emitMeta lists every input and output table + columns
[ ] No unbounded array in records_meta (cap at 200 + _truncated + _total flags)
[ ] No raw DB row objects in pipeline.log calls — PKs + bad field only (§8.6)

Constants (§4.1 + §9.2)
[ ] Every rate, multiplier, threshold, window, and percentage is loaded from the DB — NOT hardcoded in the script body or in a scripts/lib/*.js file
[ ] Every structural constant (enum, phase name, status string, SQL filter array) is in a shared lib file — NOT in the DB
[ ] No business logic number appears as a bare `const` inside the script (e.g. const RATE = 3000)
[ ] No business logic number exists in a shared lib file that an operator would reasonably want to change without a code deploy
[ ] The TS API counterpart (if any) loads the same business logic values from the DB via loadMarketplaceConfigs — NOT by importing a shared JS file

Spec compliance
[ ] SPEC LINK header points to a spec file, not a report
[ ] SPEC LINK spec number matches ADVISORY_LOCK_ID
[ ] All enum values emitted by this script are handled by every downstream consumer
[ ] Dual-path note present if TS counterpart exists; parity test added or updated
[ ] All producer/consumer contracts documented in both specs
[ ] No hardcoded SQL string for an enum value that has a shared-lib constant

Migration (if this script ships a DB migration)
[ ] Migration file has both `-- UP` and `-- DOWN` blocks (validate-migrations.sh enforces)
[ ] `-- DOWN` block lists ALL columns/tables/indexes added in `-- UP` (not just the first)
[ ] Data migrations (INSERT/UPDATE/DELETE) documented as forward-only with manual reversal instructions
[ ] CREATE INDEX on large tables (permits, permit_trades, permit_parcels, wsib_registry, entities) uses CONCURRENTLY
[ ] No executable DROP TABLE / DROP COLUMN in migration body — use `-- ALLOW-DESTRUCTIVE` marker only when required
[ ] `node scripts/validate-migration.js migrations/NNN_name.sql` exits 0 before staging

Observer scripts (if this script is an Observer archetype — spec 30 §2.1)
[ ] External AI API call (DeepSeek, Gemini, etc.) wrapped in try/catch — API unavailable ≠ pipeline failure
[ ] API key environment variable checked with warn + skip (not process.exit) if absent
[ ] System catalog queries (pg_stat_statements, pg_stat_user_tables) wrapped in try/catch — extension absent ≠ pipeline failure
[ ] Observer reads only pipeline_runs and system catalogs — zero business table access
[ ] records_new and records_updated emitted as null (Observer null pattern — spec 48 §3.5)
[ ] New env vars surfaced in scripts/ai-env-check.mjs
```

---

## 13. Reference Implementation

`scripts/classify-lifecycle-phase.js` is the current gold standard. When uncertain about
how to implement any section of this protocol, read that file first.

Key patterns to study:

| Pattern | Line(s) in classify-lifecycle-phase.js |
|---------|----------------------------------------|
| Startup validation of shared arrays | L122-128 |
| Advisory lock on dedicated client | L161-193 |
| Lock skip path releasing client before return | L187-188 |
| `try { ... } finally { release }` outer structure | L195 + L782-798 |
| Incremental dirty-row watermark | L227-233 |
| SQL-side aggregation to avoid shipping raw join rows | L270-300 |
| Batched VALUES UPDATE (not N+1) | L40-69 |
| IS DISTINCT FROM guard in UPDATE | L64-67 |
| Per-batch withTransaction (phase + stamp atomic) | L404-456 |
| Time-bucket transition suppression (domain logic in constant) | L391-402 |
| audit_table construction with PASS/FAIL thresholds | L688-700 |
| emitSummary + audit_table | L724-745 |
| emitMeta with reads + writes | L747-773 |
| CQA throw (blocking gate) | L777-781 |
| Lock release in try/finally | L782-797 |

---

## 14. Time & Date Consistency — The Midnight Cross

The "Midnight Cross" is a class of bug where a pipeline script starts before midnight and
finishes after it. Because the script queries `NOW()` or calls `new Date()` inside a batch
loop, the first batches execute with one calendar date and the later batches execute with a
different one. Daily rollups, phase distribution snapshots, and chronological assertions all
split across the boundary — producing phantom duplicates, off-by-one day counts, and
impossible date sequences in the DB.

**Real examples from this codebase:**

- `compute-trade-forecasts.js` called `new Date()` inside the forecast-computation loop
  to derive `daysUntil`. A permit processed at 23:59 could classify as `upcoming` (7 days
  away) while the same permit processed at 00:01 classified as `imminent` (6 days away —
  over the threshold).
- `classify-lifecycle-phase.js` passes `now` captured at startup to every `classifyLifecyclePhase`
  call. This is the correct pattern.
- SQL `daysBetween` with `NOW()::date` (session-TZ) vs JS `Math.floor(ms / 86400)` (process-TZ)
  can disagree at day boundaries when pg session timezone ≠ Node process timezone
  (review_followups.md MED H6 — latent in any cloud deployment or DST change).

### 14.1 Single timestamp snapshot at startup (MANDATORY)

```js
pipeline.run('script-slug', async (pool) => {
  // MANDATORY: Capture NOW() once from the DB at the very start.
  // Using the DB timestamp (not JS Date) ensures the script and any
  // SQL it runs use the same clock source and the same TZ session.
  const { rows: [{ now: RUN_AT }] } = await pool.query('SELECT NOW() AS now');

  // RUN_AT is a JS Date object in UTC — safe to pass into SQL as $N
  // and to use in JS date arithmetic throughout the run.
  // NEVER call new Date() or NOW() inside batch loops.
});
```

**Why DB timestamp, not `new Date()`:** If the pg session timezone is ever set to something
other than UTC (a DBA config change, a cloud provider default), `NOW()` in SQL and
`new Date()` in Node will disagree at sub-second precision or across DST boundaries. A
single `SELECT NOW()` at startup pins both sides to the same source.

### 14.2 Pass RUN_AT as a SQL parameter — never use NOW() in loops

```js
// WRONG — NOW() is re-evaluated on every batch; crosses midnight differently
// for batch 1 vs batch 500.
for (const batch of batches) {
  await client.query(
    `UPDATE trade_forecasts SET computed_at = NOW() WHERE ...`,
    params,
  );
}

// RIGHT — RUN_AT was captured once at startup; every batch uses the same instant.
for (const batch of batches) {
  await client.query(
    `UPDATE trade_forecasts SET computed_at = $1 WHERE ...`,
    [RUN_AT, ...otherParams],
  );
}
```

The same rule applies to `CURRENT_DATE`, `CURRENT_TIMESTAMP`, and any SQL date expression
that depends on the current time. If the value can change between the first and last batch,
it must be captured at startup and passed as a parameter.

### 14.3 UTC everywhere — no local timezone math in JS

```js
// WRONG — setHours respects the Node process's local timezone.
// On a server configured to America/Toronto, midnight shifts by 5 hours.
const midnight = new Date(date);
midnight.setHours(0, 0, 0, 0);

// RIGHT — UTC midnight is unambiguous regardless of server TZ config.
const midnight = new Date(date);
midnight.setUTCHours(0, 0, 0, 0);
```

Day difference arithmetic in JS MUST use `Math.floor((b.getTime() - a.getTime()) / 86_400_000)`
with both dates normalized to UTC midnight. Never use string parsing (`.toISOString().slice(0,10)`)
to compare dates if sub-day precision matters.

### 14.4 Guard Invalid Date before any arithmetic

`new Date(undefined)`, `new Date(null)`, and `new Date('bad string')` all return an object
where `.getTime()` is `NaN`. Any arithmetic on NaN produces NaN. `.toISOString()` on an
Invalid Date throws `RangeError: Invalid time value`.

```js
// WRONG — no guard; crashes with RangeError mid-batch, partial state committed
const predictedStart = new Date(row.phase_started_at);
predictedStart.setUTCDate(predictedStart.getUTCDate() + medianDays);
await client.query('UPDATE ... SET predicted_start = $1', [predictedStart.toISOString()]);

// RIGHT — guard at the read site; skip + warn; batch continues cleanly
const anchorDate = new Date(row.phase_started_at);
if (isNaN(anchorDate.getTime())) {
  pipeline.log.warn('[script-slug]', 'Invalid phase_started_at — skipping forecast', {
    permit_num: row.permit_num,
    revision_num: row.revision_num,
    phase_started_at: row.phase_started_at,
  });
  skippedCount++;
  continue;
}
```

### 14.5 SQL numeric casting — ROUND before casting to int

`PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY gap_days)` returns a `float8`. Casting
directly to `int` with `::int` TRUNCATES (floors), not rounds. A median of 10.9 days
becomes 10. Over multi-phase forecast chains, the systematic 0.5-day downward bias
compounds — 4 phases × 0.5 day = 2 days early for every forecast.

```sql
-- WRONG — truncates: 10.9 → 10, 15.7 → 15
PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY gap_days)::int

-- RIGHT — rounds: 10.9 → 11, 15.7 → 16
ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY gap_days))::int
```

This rule applies to ANY float-to-int cast in pipeline SQL, not only PERCENTILE_CONT.
Always ask: "is truncation the intended semantic here, or should this be rounded?"

---

## 15. NULL Safety in SQL — The Three-Value Logic Trap

SQL uses three-valued logic: `TRUE`, `FALSE`, and `NULL` (unknown). Many common SQL
patterns silently exclude or include rows in unexpected ways when NULLs are present.

### 15.1 NOT IN with a nullable column or subquery

```sql
-- WRONG: if any row in the subquery has urgency IS NULL,
-- the entire NOT IN predicate returns NULL for every row — matching nothing.
-- This silently filters out all rows, not just the expired ones.
WHERE tf.urgency NOT IN ('expired')

-- RIGHT: explicit NULL handling at the call site
WHERE (tf.urgency IS NULL OR tf.urgency <> 'expired')
-- OR if NULLs should be excluded entirely:
WHERE tf.urgency IS NOT NULL AND tf.urgency <> 'expired'
```

### 15.2 Inequality comparisons with nullable columns

```sql
-- WRONG: col <> 'value' returns NULL (not TRUE) when col IS NULL.
-- Rows with NULL col are silently excluded from the result.
WHERE lifecycle_stalled <> true

-- RIGHT: treat NULL explicitly (NULL = unknown stall status = suppress)
WHERE lifecycle_stalled IS NOT TRUE   -- includes NULL rows (treat as not stalled)
-- OR
WHERE lifecycle_stalled = false        -- excludes NULL rows (unknown = skip)
-- Choose based on spec intent and document the choice with a comment.
```

**Failure mode (82-W11):** `update-tracked-projects.js` used `lifecycle_stalled !== true`
in JS. This is `false` for NULL in JS (since `null !== true`), but the SQL-side equivalent
`<> true` returns NULL for NULL rows. The JS and SQL paths had opposite NULL semantics.

### 15.3 DISTINCT ON requires a stable tie-breaker

`SELECT DISTINCT ON (col) ... ORDER BY col, date ASC` is non-deterministic when two rows
share the same `(col, date)` value. Postgres returns an arbitrary winner. The result
changes between runs, making calibration data flip-flop.

```sql
-- WRONG — non-deterministic when inspection_date ties
SELECT DISTINCT ON (permit_num) permit_num, stage_name
  FROM permit_inspections
 ORDER BY permit_num, inspection_date DESC

-- RIGHT — add a stable tertiary tie-breaker (stage_name or id)
SELECT DISTINCT ON (permit_num) permit_num, stage_name
  FROM permit_inspections
 ORDER BY permit_num, inspection_date DESC NULLS LAST, stage_name ASC
```

### 15.4 LEFT JOIN produces NULL for unmatched rows — always check

When a pipeline step LEFT JOINs to an optional table (e.g., trade_forecasts for a permit
that hasn't been forecast yet), every column from the right side is NULL for unmatched rows.
Before using any LEFT-joined column in a condition or calculation:

```js
// WRONG — treats missing forecast (urgency IS NULL) identically to
//          urgency = 'on_time'; lead never archives
if (row.urgency === 'expired') archiveLead(row);

// RIGHT — explicitly handle the NULL case
if (row.urgency === null) {
  // Permit has no forecast row — log + apply a defined policy
  pipeline.log.warn('[script-slug]', 'No forecast for tracked lead', { permit_num: row.permit_num });
  missingForecastCount++;
  continue; // or archive, depending on spec policy
}
if (row.urgency === 'expired') archiveLead(row);
```

---

## 16. Concurrency Safety in Stream Queries — The Stale Snapshot Trap

`pipeline.streamQuery` opens a PostgreSQL cursor. A cursor is a snapshot of the data at
the moment the cursor is opened. If the script takes 20+ minutes to stream through 800K
rows, the rows read in the final batches reflect the state of the DB from 20 minutes ago.

### 16.1 When this matters

The stale snapshot trap is a real risk when **all three** of these are true:

1. The script uses `streamQuery` on a large table (> 50K rows, runtime > 5 minutes).
2. The script writes back to the **same table** it is streaming.
3. A concurrent writer (API route, another pipeline step, user action) can modify rows
   in that table while the stream is running.

If all three apply, the UPSERT at the end of the stream can quietly overwrite a user's
change that happened during the stream.

### 16.2 The `updated_at` guard pattern

If the output table has an `updated_at` column, add a staleness check to the UPDATE:

```js
// Pass the cursor-open timestamp as a parameter
const { rows: [{ now: CURSOR_AT }] } = await pool.query('SELECT NOW() AS now');

// In the UPSERT: only overwrite if the DB row hasn't changed since we read it
await client.query(`
  INSERT INTO trade_forecasts (permit_num, revision_num, predicted_start, computed_at)
  VALUES ($1, $2, $3, $4)
  ON CONFLICT (permit_num, revision_num, trade_slug) DO UPDATE
    SET predicted_start = EXCLUDED.predicted_start,
        computed_at     = EXCLUDED.computed_at
   WHERE trade_forecasts.computed_at <= $4   -- only overwrite if our data is not older
`, [row.permit_num, row.revision_num, predictedStart, CURSOR_AT]);
```

### 16.3 When to skip the guard

The guard is unnecessary (and adds noise) when:
- The script is the ONLY writer to the output table (e.g., a nightly batch with no
  concurrent API writes to that table).
- The advisory lock prevents any concurrent script run.
- The output table is append-only (INSERT only, never UPDATE).

Document the decision either way with a comment:

```js
// NO STALE-SNAPSHOT GUARD needed here: advisory lock (ADVISORY_LOCK_ID = 85)
// prevents concurrent script runs, and no API route writes to trade_forecasts.
// The only race is a DBA manual UPDATE, which is acceptable.
```

---

## 17. Operating Boundaries

### Target Files
- `scripts/[new-script].js` — the new pipeline step
- `scripts/lib/[feature]-shared.js` — shared constants (if dual-path applies)
- `docs/specs/[path]/NN_feature_name.md` — spec must exist before script is committed

### Out-of-Scope Files
- `src/app/api/` — API routes are not pipeline scripts; this protocol does not govern them
- `src/lib/` TypeScript modules — governed by Frontend Mode / Backend Mode rules in CLAUDE.md
- Existing `scripts/*.js` files — this protocol governs NEW scripts; existing scripts are
  remediated via WF3 when bugs are found

### Cross-Spec Dependencies
- **Relies on:** `docs/specs/pipeline/40_pipeline_system.md` (pipeline_runs schema, SDK contracts)
- **Relies on:** `docs/specs/00_engineering_standards.md` §9 (pipeline & script safety)
- **Consumed by:** Any WF1 that adds a new pipeline step
- **Consumed by:** Any WF3 reviewing an existing script against the reference standard

---

## 18. FK Hardening Protocol — New Table Standard

Every new table that has a parent-child relationship with another table MUST follow this
protocol. Skipping FK constraints at creation time creates data quality debt that compounds
as the table grows — retroactively adding FKs requires an orphan audit + cleanup migration.

### 18.1 Declare FKs at table creation (the zero-debt rule)

When writing a `CREATE TABLE` migration, declare FK constraints **inline** if the parent
table already exists:

```sql
CREATE TABLE permit_products (
  permit_num    VARCHAR(30) NOT NULL,  -- match parent column type exactly
  revision_num  VARCHAR(10) NOT NULL,
  product_id    INTEGER NOT NULL REFERENCES product_groups(id),
  -- ...
  FOREIGN KEY (permit_num, revision_num) REFERENCES permits(permit_num, revision_num)
    ON DELETE CASCADE
);
```

**Column type must match the parent exactly.** A `VARCHAR(20)` FK referencing a `VARCHAR(30)`
parent is silently accepted at creation but blocks `FOREIGN KEY` enforcement. Verify types
in `information_schema.columns` before writing the constraint.

### 18.2 Cascade decision matrix

Apply this rule to every new FK — document the rationale in the migration file:

| Data category | ON DELETE behaviour | Examples |
|---|---|---|
| **Internal app data** — child is meaningless without the parent | `CASCADE` | `permit_trades`, `tracked_projects`, `cost_estimates`, `trade_forecasts`, `permit_products` |
| **Municipal / external source data** — preserve the child, lose the reference | `SET NULL` | `permits.neighbourhood_id`, `permit_history.sync_run_id`, `coa_applications.linked_permit_num` |
| **Safety-critical** — deletion of parent must be blocked while children exist | `RESTRICT` | Use sparingly; document in migration why orphan creation is structurally impossible |

**Default when uncertain:** `CASCADE`. It prevents orphan accumulation and is reversible
by restoring from backup. `SET NULL` requires the FK column to be nullable; verify before
choosing it.

### 18.3 Required child-side index

PostgreSQL scans the child table on every parent `DELETE` to enforce `ON DELETE CASCADE`
or `ON DELETE SET NULL`. Without an index on the child FK columns, each delete is a
full table scan.

**Rule:** Any FK on a child table with more than 10K rows MUST have a corresponding index
on the FK columns before the constraint is added.

```sql
-- Add the index BEFORE the FK constraint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_permit_history_sync_run
  ON permit_history(sync_run_id)
  WHERE sync_run_id IS NOT NULL;  -- partial index when nullable

-- Then add the constraint
ALTER TABLE permit_history
  ADD CONSTRAINT fk_permit_history_sync_runs
  FOREIGN KEY (sync_run_id) REFERENCES sync_runs(id)
  ON DELETE SET NULL
  NOT VALID;
ALTER TABLE permit_history VALIDATE CONSTRAINT fk_permit_history_sync_runs;
```

For empty or small tables (< 10K rows), non-CONCURRENTLY is acceptable.

### 18.4 NOT VALID + VALIDATE pattern for tables > 100K rows

Adding a FK constraint on a large table takes an `ACCESS EXCLUSIVE` lock that blocks all
reads and writes. The NOT VALID + VALIDATE pattern splits this into two phases:

1. `ADD CONSTRAINT ... NOT VALID` — instant (no table scan). Takes `SHARE ROW EXCLUSIVE`.
2. `VALIDATE CONSTRAINT` — scans the table, but only holds `ACCESS SHARE` (reads proceed).

```sql
-- Step 1: instant — marks new rows but defers the scan
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_permits_neighbourhoods'
  ) THEN
    ALTER TABLE permits
      ADD CONSTRAINT fk_permits_neighbourhoods
      FOREIGN KEY (neighbourhood_id)
      REFERENCES neighbourhoods(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END $$;

-- Step 2: scans under ACCESS SHARE only — safe in production
ALTER TABLE permits VALIDATE CONSTRAINT fk_permits_neighbourhoods;
```

The `DO $$...$$` idempotency guard is mandatory: if the migration runner crashes after
`ADD CONSTRAINT` but before `VALIDATE`, the next run must skip the ADD and go directly
to VALIDATE.

**Tables requiring NOT VALID + VALIDATE:** `permits` (237K+ rows), `permit_trades`
(1.2M+ rows), `permit_parcels` (228K+ rows), `parcel_buildings` (516K+ rows),
`building_footprints`, `wsib_registry`.

### 18.5 Pre-constraint orphan audit (mandatory for existing tables)

Before adding a FK to a table that has existing rows, run the orphan audit:

```sh
node scripts/quality/audit-fk-orphans.js
```

The output shows `Orphaned` counts per relationship. **Any non-zero orphan count blocks
the constraint addition** — PostgreSQL will reject `VALIDATE CONSTRAINT` if orphans exist.

**Clean orphans first:**

```sql
-- For ON DELETE SET NULL relationships: null out orphaned rows
UPDATE child_table
SET fk_col = NULL
WHERE fk_col IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM parent_table WHERE id = child_table.fk_col);

-- For ON DELETE CASCADE relationships: delete orphaned rows
DELETE FROM child_table
WHERE NOT EXISTS (
  SELECT 1 FROM parent_table p
  WHERE p.permit_num = child_table.permit_num
    AND p.revision_num = child_table.revision_num
);
```

### 18.6 Register the relationship in audit-fk-orphans.js

After adding the FK constraint, **move the relationship from Tier 2 to Tier 1** in the
`RELATIONSHIPS` array in `scripts/quality/audit-fk-orphans.js`. This keeps the audit
registry current so future runs report accurate tier classifications.

```js
// BEFORE (Tier 2 — no FK)
{ tier: 2, child: 'permits', parent: 'neighbourhoods', childCols: ['neighbourhood_id'],
  parentCols: ['id'], nullable: true },

// AFTER (Tier 1 — FK enforced)
{ tier: 1, child: 'permits', parent: 'neighbourhoods', childCols: ['neighbourhood_id'],
  parentCols: ['id'], nullable: true },
```

### 18.7 Adversarial review gate for FK migrations

FK migrations are high-risk: a wrong `ON DELETE` behaviour silently destroys data in
production without a visible error. **Every FK hardening migration MUST pass adversarial
review before execution:**

```sh
# Review the proposed SQL
node scripts/gemini-review.js review docs/reports/proposed_fk_migrations.md \
  --context docs/specs/00-architecture/01_database_schema.md
node scripts/deepseek-review.js review docs/reports/proposed_fk_migrations.md \
  --context docs/specs/00-architecture/01_database_schema.md

# Review the active task plan
node scripts/gemini-review.js plan
node scripts/deepseek-review.js plan
```

Output all four review responses before asking the user to confirm Phase B execution.
The independent Claude worktree agent runs AFTER migration execution, before commit (WF6).

### 18.8 Migration self-review checklist (FK-specific)

Add these items to the standard §12 self-review checklist for any migration that adds
FK constraints:

```
FK Hardening
[ ] Column types match exactly between child FK col and parent PK col (information_schema check)
[ ] ON DELETE behaviour documented with rationale in migration comment
[ ] Child-side index exists on FK cols before ADD CONSTRAINT (or table has < 10K rows)
[ ] DO $$...$$  idempotency guard wraps every ADD CONSTRAINT (conname check in pg_constraint)
[ ] NOT VALID + VALIDATE split used for any table > 100K rows
[ ] Orphan cleanup UPDATE/DELETE runs BEFORE the ADD CONSTRAINT step in the same migration
[ ] UPDATE orphan cleanup uses WHERE clause (validate-migration.js enforces)
[ ] DOWN block drops constraints in reverse order and notes any non-reversible type changes
[ ] RELATIONSHIPS entry in audit-fk-orphans.js updated from Tier 2 → Tier 1 after migration
[ ] db.test.ts added per §12.10: tests bad-FK insert rejection, CASCADE propagation,
    SET NULL propagation for each new constraint
[ ] Adversarial review (Gemini + DeepSeek) completed before npm run migrate
```

---

## Appendix A — Phase 3 WF3 Non-Migration Registry

This appendix documents scripts and constants that were considered for Phase 3 WF3
externalization or transaction-squash treatment but were explicitly decided against.
Future auditors MUST consult this appendix before filing new WF3s against these locations.

### A.1 Intentional Non-Migrations (Split-Transaction Exceptions)

#### X1 — `scripts/migrate.js` (lines 208–227)
**Pattern:** DDL `CREATE`/`ALTER`/`CREATE INDEX` statements followed immediately by an
`INSERT INTO schema_migrations` record.

**Why NOT wrapped in `withTransaction`:**
The apply-and-record block at lines 203–207 is intentionally atomic by a different mechanism:
`pg_try_advisory_lock(MIGRATE_LOCK_ID)` prevents concurrent runs, and each migration file is
applied in its own transaction so that a partial DDL crash does not poison later migrations.
Wrapping the DDL + schema_migrations INSERT in `withTransaction` would cause 40P01 retry to
re-run a partially-applied `CREATE INDEX CONCURRENTLY` or `ALTER TABLE`, which PostgreSQL
prohibits on active DDL. The current pattern (DDL in isolation, schema_migrations INSERT
immediately after) is the correct PostgreSQL migration idiom.

**Action:** Do NOT file WF3 against `scripts/migrate.js` for transaction squash.

#### X2 — `scripts/refresh-snapshot.js` (lines 16–160)
**Pattern:** Hand-rolled `BEGIN ... SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`
for snapshot-consistent dashboard reads.

**Why NOT migrated to `withTransaction`:**
`pipeline.withTransaction` defaults to `READ COMMITTED` isolation. The snapshot requires
`REPEATABLE READ` so that the entire dashboard query set sees a consistent DB state even
under concurrent writes. Replacing the hand-rolled block with `withTransaction` would silently
downgrade isolation and produce non-deterministic dashboard metrics.

**Future path:** A `pipeline.withReadSnapshot(pool, async (client) => {...})` helper should
wrap this pattern when a second REPEATABLE READ consumer appears. Until then, the hand-rolled
BEGIN/COMMIT block is the only instance and does not warrant extraction.

**Action:** Do NOT file WF3 against `scripts/refresh-snapshot.js` for transaction squash.
The hardcoded confidence thresholds *were* externalized (WF3-E17, commit `29b2ea8`).

---

### A.2 Tier 2 — Marginal Constants (Require Stakeholder Conversation Before WF3)

These constants passed fewer than 3 of the Phase 3 triage criteria (§ "Triage rule" in the
active plan). Do NOT externalize without a written stakeholder request naming the human role
that would tune the value.

| File | Location | Constant | Why Deferred |
|------|----------|----------|--------------|
| `quality/assert-engine-health.js` | lines 28–31 | `DEAD_TUPLE_RATIO`, `SEQ_SCAN_RATIO`, `SEQ_SCAN_MIN_ROWS`, `PING_PONG_RATIO` | Ops-tunable but not user-visible; no PM/RevOps stakeholder identified |
| `run-chain.js` | lines 180–181 | `BLOAT_WARN_THRESHOLD=0.30`, `BLOAT_ABORT_THRESHOLD=0.50` | Pre-flight bloat policy; tuning without engineering review could abort production chains silently |
| `load-parcels.js` | line 115 | `IRREGULARITY_THRESHOLD=0.95` | Affects geometric overrides; unclear stakeholder, no spec coverage |
| `purge-lead-views.js` | line 37 | `RETENTION_DAYS=90` | PIPEDA/legal compliance constant; requires legal sign-off before making user-tunable |

---

### A.3 Indefinite Deferral — Do NOT Externalize

These constants are implementation details or snapshot-calibrated engineering constants that
have no business stakeholder and no user-visible effect. Do NOT externalize regardless of
future requests; the pattern is intentional.

#### Throughput knobs (pure performance, not business logic)
- `BATCH_SIZE` — `classify-permits.js:17`, `extract-builders.js:97`
- `MAX_ITERATIONS` — `classify-permits.js:623`
- `DEDUP_FLUSH_SIZE` — `extract-builders.js:147`
- `MAX_RETRIES`, `RETRY_BASE_MS` — `load-coa.js`, `load-permits.js`, `poc-aic-scraper-v2.js`
- `SESSION_REFRESH_INTERVAL=200` — `poc-aic-scraper-v2.js:67` (WAF cadence; operational, not business)
- `load-wsib.js:153,167` batch/flush sizes

#### E11 — `LIFECYCLE_PHASE_BOUNDS` (`quality/assert-lifecycle-phase-distribution.js:60–67`)
17 distribution bands (min/max per phase) calibrated against a specific DB snapshot at the
time the assert script was written. These constants fail triage criterion 1: **no stakeholder
tunes these without first querying the current DB counts**. Making them user-tunable in the
Control Panel would require the tuner to re-run `SELECT lifecycle_phase, COUNT(*)` first,
which is an engineering task, not a product decision. The `UNCLASSIFIED_MAX=100` bound (E12)
was externalized (commit `ada56b1`) because it has a clear ops meaning independent of DB
counts. The other 17 bounds remain hardcoded.

**Action:** Do NOT file WF3 for `LIFECYCLE_PHASE_BOUNDS`. If the bounds become consistently
wrong as the DB grows, update them via a normal code commit with a PR comment explaining the
new snapshot calibration.

---

### A.4 — knip "Unused Exports" That Are Intentionally Kept

The dual-code-path discipline (§7) requires that types and constants mirrored between TS modules
and JS pipeline scripts remain `export`-ed in TS, even when no TS consumer imports them. This
surface serves as the authoritative schema for the JS side. Future knip runs will continue to
report these as unused; that is expected and documented here.

#### Component prop types
`*Props` interfaces (e.g., `LeadFeedProps`, `LeadMapPaneProps`) — public TS ergonomics surface
for component consumers. Keep exported even when no current TS file imports them directly.

#### API envelope and contract types
`ApiSuccess`, `ApiErrorBody`, `LeadApiError`, `LeadFeedRequest`, and related envelope types —
documented contract between server route handlers and client consumers. Keep exported.

#### Scope taxonomy types
`WorkType`, `ResidentialTagSlug`, `ScopeTag`, `UseType`, and all scope classification enums —
mirrored by `classify-permits.js` under the §7 dual-code-path rule. The JS pipeline script
must stay in sync with the TS definitions; the export is the canonical source.

#### Cost-model contract
`COMPLEXITY_SIGNALS`, `LIAR_GATE_THRESHOLD_DEFAULT`, `CostModelResult`, `TradeRate`,
`EstimateCostConfig` — documented dual-path surface for `scripts/compute-cost-estimates.js`
and `cost-model-shared.js`. Keep exported.

#### Shadcn UI re-exported primitives
Shadcn components that are re-exported from wrapper files for convenience (e.g., barrel
re-exports in `src/components/ui/`) — knip may flag these if the direct Shadcn path is used
at some call sites. Keep exported for consistency.

**Triage rule:** Before removing any of the above, confirm the export is NOT in the §7
dual-path surface by checking `scripts/` for the corresponding JS consumer. If there is none,
the export is a genuine candidate for deletion (not merely a knip false positive).

---

### A.5 — Bundle G Advisory Lock ID Registry

All 40 JS pipeline scripts have been retrofitted with `ADVISORY_LOCK_ID` + `pipeline.withAdvisoryLock`
as of Bundle G (April 2026). The registry below is the canonical source of truth for lock ID
assignments. The infra test `src/tests/pipeline-advisory-lock.infra.test.ts` enforces uniqueness
and registry-vs-code agreement.

**ID Assignment Rules (§R2):**
- Where a script's spec number is globally unique across all scripts, use the spec number as the ID.
- Where multiple scripts share a spec (e.g., 7 scripts under spec 28), sequential IDs from the
  87+ range are assigned to prevent false-skip on concurrent runs.
- Bundle A scripts (compliant pre-Bundle G) retain their spec-number IDs.

| Lock ID | Script | Wave | Writes Timestamps? |
|---------|--------|------|--------------------|
| **2** | `scripts/load-permits.js` | 4 — Load/Ingest | YES — `last_seen_at` |
| **5** | `scripts/geocode-permits.js` | 4 — Load/Ingest | YES — `geocoded_at` |
| **11** | `scripts/extract-builders.js` | 4 — Load/Ingest | YES — `last_seen_at` |
| **30** | `scripts/link-similar.js` | 2 — Link | YES — `scope_classified_at` |
| **40** | `scripts/refresh-snapshot.js` | 5 — Maintenance | NO — snapshot recording |
| **45** | `scripts/enrich-web-search.js` | 3 — Enrich | YES — `last_enriched_at` |
| **46** | `scripts/enrich-wsib.js` | 3 — Enrich | YES — `last_enriched_at` |
| **53** | `scripts/classify-inspection-status.js` | 1 — Classify | YES — `last_seen_at` |
| **55** | `scripts/load-parcels.js` | 4 — Load/Ingest | NO |
| **56** | `scripts/load-massing.js` | 4 — Load/Ingest | NO |
| **57** | `scripts/load-neighbourhoods.js` | 4 — Load/Ingest | NO |
| **71** | `scripts/compute-timing-calibration.js` | 5 — Maintenance | YES — `computed_at` |
| **80** | `scripts/reclassify-all.js` | 1 — Classify | YES — `scope_classified_at`, permit_trades, permit_products |
| **81** | `scripts/compute-opportunity-scores.js` | Bundle A | YES — `computed_at` |
| **82** | `scripts/update-tracked-projects.js` | Bundle A | YES — timestamps |
| **83** | `scripts/compute-cost-estimates.js` | Bundle A | YES — timestamps |
| **84** | `scripts/classify-lifecycle-phase.js` | Bundle A | YES — `lifecycle_classified_at` |
| **85** | `scripts/compute-trade-forecasts.js` | Bundle A | YES — `computed_at` |
| **86** | `scripts/compute-timing-calibration-v2.js` | Bundle A | YES — `computed_at` |
| **87** | `scripts/classify-scope.js` | 1 — Classify | YES — `scope_classified_at` |
| **88** | `scripts/classify-permits.js` | 1 — Classify | YES — `classified_at`, `trade_classified_at` |
| **89** | `scripts/classify-permit-phase.js` | 1 — Classify | YES — `last_seen_at` |
| **90** | `scripts/link-parcels.js` | 2 — Link | YES — `linked_at`, `parcel_linked_at` |
| **91** | `scripts/link-massing.js` | 2 — Link | YES — `linked_at` |
| **92** | `scripts/link-neighbourhoods.js` | 2 — Link | NO |
| **12** | `scripts/link-coa.js` | 2 — Link | YES — `last_seen_at` |
| **94** | `scripts/link-wsib.js` | 2 — Link | YES — `matched_at` |
| **95** | `scripts/load-coa.js` | 4 — Load/Ingest | YES — `first_seen_at`, `last_seen_at` |
| **96** | `scripts/load-address-points.js` | 4 — Load/Ingest | NO |
| **97** | `scripts/load-wsib.js` | 4 — Load/Ingest | YES — `last_seen_at` |
| **98** | `scripts/close-stale-permits.js` | 5 — Maintenance | NO — `NOW()` in WHERE only |
| **99** | `scripts/compute-centroids.js` | 5 — Maintenance | NO |
| **100** | `scripts/create-pre-permits.js` | 5 — Maintenance | YES — `last_seen_at` |
| **101** | `scripts/purge-lead-views.js` | 5 — Maintenance | NO — deletes only |
| **102** | `scripts/quality/assert-schema.js` | 6 — Quality | NO — read-only probe |
| **103** | `scripts/quality/assert-data-bounds.js` | 6 — Quality | NO — read-only probe |
| **104** | `scripts/quality/assert-engine-health.js` | 6 — Quality | NO — snapshot recording |
| **105** | `scripts/quality/assert-network-health.js` | 6 — Quality | NO — read-only probe |
| **106** | `scripts/quality/assert-staleness.js` | 6 — Quality | NO — read-only probe |
| **107** | `scripts/quality/assert-pre-permit-aging.js` | 6 — Quality | NO — read-only probe |
| **108** | `scripts/quality/assert-coa-freshness.js` | 6 — Quality | NO — read-only probe |
| **109** | `scripts/quality/assert-lifecycle-phase-distribution.js` | 6 — Quality | NO — read-only probe |
| **110** | `scripts/quality/assert-entity-tracing.js` | 6 — Quality | NO — read-only probe |
| **111** | `scripts/quality/assert-global-coverage.js` | 6 — Quality | NO — read-only probe |
| **112** | `scripts/backup-db.js` | 7 — Maintenance | NO — GCS write only, no DB tables |
| **113** | `scripts/observe-chain.js` | 7 — Maintenance | NO — reads pipeline_runs only, no writes |

**`RUN_AT` Snapshot Convention:**
Scripts that write timestamps (`Writes Timestamps? = YES`) capture a single `RUN_AT` timestamp
at the top of the locked scope via `const { rows: [{ now: RUN_AT }] } = await pool.query('SELECT NOW() AS now')`.
All `SET col = NOW()` / `VALUES (..., NOW())` write-path calls are replaced with `$N::timestamptz`
bound to `RUN_AT`. `NOW()` in `WHERE` clauses (read-side age filters) and `pipeline_runs`
bookkeeping are left as-is.

**Grep Verification (run periodically in CI):**
```sh
# Should return 0 results after Bundle G is complete
grep -rn "NOW()" scripts/*.js scripts/quality/*.js \
  | grep -v "WHERE\|pipeline_runs\|sync_runs\|SELECT NOW() AS now\|lib/pipeline\|run-chain\|local-cron\|migrate\|seed-coa\|reclassify-all\|> NOW()\|< NOW()\|>= NOW()\|<= NOW()\|EXTRACT.*NOW\|captured_at = NOW()\|created_at=NOW()"
```

---

## 15. `pipeline.getDbTimestamp(pool)` — Standardized Clock Capture

**Added:** Phase 7 / Bug Prevention Strategy implementation.

The `pipeline` SDK exports a convenience function that encapsulates the `SELECT NOW()` single-capture pattern:

```js
// In any pipeline script that needs a RUN_AT timestamp:
const RUN_AT = await pipeline.getDbTimestamp(pool);
// Equivalent to:
// const { rows: [{ now: RUN_AT }] } = await pool.query('SELECT NOW() AS now');
```

**Rules:**
1. Call `getDbTimestamp` **once** at the top of the `withAdvisoryLock` callback, before any loop or batch logic.
2. Pass `RUN_AT` as a `$N` parameter to all SQL writes that set a timestamp column — never call `getDbTimestamp` inside a loop.
3. `Date.now()` in scripts is only permitted for elapsed-time measurement (`const startMs = Date.now()`). Using `new Date()` for any timestamp written to the DB is banned by the ESLint Time Cop rule.

---

## 16. Phase 7 Lint Rules — "The Gauntlet"

**Added:** Phase 7 / Bug Prevention Strategy implementation.

The following rules are enforced in the pre-commit hook (`scripts/hooks/ast-grep-leads.sh`) and ESLint for all active pipeline scripts. Inert files (seeds, backfills, analysis scripts, SDK itself) are listed in `scripts/amnesty.json`.

### B1 — ACID Radar: Loop Query Ban
**Rule:** `pool.query()` or `client.query()` inside `for`, `for...of`, `for...in`, `.map()`, or `.forEach()` loops is forbidden. Every loop-query pattern is an N+1 that causes O(rows) round-trips to PostgreSQL.

**Enforcement:** AST-grep rule `loop-query.yml` (warning severity).

**Fix pattern:** Collect values into an array, then do a single `UNNEST`-based batch INSERT/UPDATE outside the loop.

**Suppression:** `// ast-grep-disable-next-line loop-query: <justification>` when the query inside the loop is genuinely bounded (e.g., ≤3 iterations for config lookups).

### B2 — ACID Radar: Bare Mutation Ban
**Rule:** Any `pool.query` containing `INSERT`, `UPDATE`, or `DELETE` must be lexically inside a `pipeline.withTransaction()` closure. Scripts with mutations but no `withTransaction` call are flagged.

**Enforcement:** Grep heuristic in `ast-grep-leads.sh` check 7.

**Exceptions:** Quality assertion scripts write to `pipeline_runs` as observation records (not data mutations). Logged in `scripts/amnesty.json`.

### B3 — Time Cop: new Date() Ban
**Rule:** `new Date()` in `scripts/` is banned when used to produce a timestamp written to the database. Use `pipeline.getDbTimestamp(pool)` instead.

**Enforcement:** ESLint `no-restricted-syntax` selector `NewExpression[callee.name='Date']`.

**Exception:** `Date.now()` for elapsed-time measurement (`const startMs = Date.now()`) is explicitly allowed.

### B4 — OOM Radar: Unbounded Push in Stream Ban
**Rule:** `.push()` into an outer-scope array inside a `for await` loop (streaming callback) without a subsequent batch-flush guard is banned. Unbounded accumulation causes OOM crashes as data grows.

**Enforcement:** AST-grep rule `unbounded-push-in-stream.yml` (warning severity).

**Fix pattern:** Check `if (batch.length >= BATCH_SIZE) { await flush(batch); batch = []; }` after every `.push()` in a streaming loop.

**Suppression:** `// ast-grep-disable-next-line unbounded-push-in-stream: bounded by <reason>` when the accumulation is provably bounded.

### B5 — Safe Integer: Raw parseInt/parseFloat Ban
**Rule:** Raw `parseInt()` and `parseFloat()` are banned in `scripts/` in favour of `safeParsePositiveInt(value, label)`, `safeParseFloat(value, label)`, and `safeParseIntOrNull(value)` from `scripts/lib/safe-math.js`. Raw parsing silently propagates `NaN` into DB writes.

**Enforcement:** ESLint `no-restricted-globals` + `no-restricted-properties` rules.

**Safe-math functions:**
- `safeParsePositiveInt(value, label)` — throws on NaN, Infinity, negative, or non-integer.
- `safeParseFloat(value, label)` — throws on NaN or Infinity.
- `safeParseIntOrNull(value)` — returns `null` for missing/null/undefined/NaN (for optional fields).

### Amnesty List
`scripts/amnesty.json` documents all files exempt from Phase 7 rules with a `reason` field per entry. Permanent entries (SDK, seeds, analysis tools) never need to comply. There are no temporary entries once Phase B mop-up is complete.

---

## §11. Counter Semantic Contract

Every call to `pipeline.emitSummary()` MUST satisfy this contract. Violations are a §10 Plan
Compliance failure that blocks the review gate.

### §11.1 — The Three Generic Counters

| Counter | Semantic | What it MUST represent |
|---------|----------|------------------------|
| `records_total` | Primary entity rows **evaluated** this run | The subject of the step — the entity being processed (permits, forecasts, cost_estimates, etc.). Used by the SDK to compute `sys_velocity_rows_sec`. MUST be a permit-scoped (or primary-entity-scoped) count, never a join-table row count. |
| `records_new` | Net-new rows **inserted** into the primary write target | INSERTs only. Zero for read-only and update-only steps. |
| `records_updated` | Existing rows that **changed** in the primary write target | Changes that passed an IS DISTINCT FROM guard. MUST match the same entity as `records_total`. Never include rows that were evaluated but unchanged, or rows in secondary write targets. |

### §11.2 — The Overflow Rule (Secondary Writes → audit_table)

Any metric that does not fit the primary-entity contract belongs in a named `audit_table` row, not
in a generic counter. Common overflow cases:

- **Join-table mutations** — e.g., `permit_trades` rows written by `classify-permits`. Goes in `audit_table` as `permit_trades_written`.
- **Companion propagations** — e.g., scope propagations in `classify-scope`. Goes in `audit_table` as `scope_propagations`.
- **Cleanup operations** — e.g., zombie coordinate resets in `geocode-permits`. Goes in `audit_table` as `zombies_cleaned`.
- **Failure/no-match counts** — e.g., unlinked permits in `link-neighbourhoods`. Goes in `audit_table` as `no_neighbourhood_match`. MUST NOT inflate `records_updated`.
- **Secondary entity types** — e.g., CoA application phase changes in `classify-lifecycle-phase`. Goes in `audit_table` as `coa_phase_changes`. MUST NOT be summed into permits counters.
- **Pre-run backlog sizes** — e.g., `before.to_geocode` in `geocode-permits`. Goes in `audit_table` as `backlog_remaining`. MUST NOT be used as `records_total`.

### §11.3 — Velocity Integrity

`sys_velocity_rows_sec` is auto-computed by the SDK as `records_total / (duration_ms / 1000)`.
This metric is only meaningful when `records_total` is the primary entity count. Scripts that pass
inflated totals (join-table rows, multi-source sums) produce artificially high velocity figures
that mislead the admin UI. Fix `records_total` first; velocity fixes itself.

### §11.4 — Traceability Requirement

Every step in the permit chain must allow an operator to answer: **"What happened to the N new
permits that entered in Step 2?"** This means:

1. Every step that processes new permits MUST report `records_new = N` (the same N) if it inserts a row for them in its write target.
2. Every step that only updates existing rows for new permits MUST have a named `audit_table` row (e.g., `new_permits_processed: N`) if the update is not already visible in `records_updated`.
3. Steps that skip a subset of permits (terminal, orphan, no-match) MUST report the skip count in a named `audit_table` row so the skip is traceable, not silent.
