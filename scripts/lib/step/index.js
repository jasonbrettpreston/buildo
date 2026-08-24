/**
 * `pipeline.step(descriptor, compute)` — S2-min.
 *
 * THE MINIMAL LIBRARY THE `assert_schema` PILOT NEEDS, and deliberately nothing
 * more. Spec 122 R4 makes S2 a vertical slice that GROWS per pilot; the growth
 * waves are named at the bottom of this header so a missing behaviour reads as
 * scheduled rather than forgotten.
 *
 * ⚠️ IT IS A FACTORY (claim #86). `require`ing a step file opens no pool and
 * issues no query. Construction does exactly one thing: AJV-validate the
 * descriptor and THROW (Spec 122 §4.2 — that throw IS the loader property).
 * Everything that touches a socket lives behind `.run()`.
 *
 * What S2-min owns, from Spec 122 §4.3's list:
 *   1. descriptor validation, at construction, before compute exists       (§4.2)
 *   2. the ledger row — opened at start, finalized in a `finally`;
 *      `crashed` NEVER written in-process (see ledger.js)                  (§4.1 ①㉝)
 *   3. the verdict — row-derived, once, here; never a parallel boolean     (§7.1)
 *   4. the txn-scoped advisory lock on `identity.lock`                     (§4.1 ②)
 *   5. `records_meta` / `PIPELINE_META`, both derived FROM the descriptor  (§4.1 ㉙)
 *   6. per-chain check selection from `checks[].chains`                    (§1.7)
 *   7. the `database` guard — floor + `current_database()`                 (§4.1 ③④)
 *
 * ⚠️ RECONCILE (A3) IS NOT IMPLEMENTED AND NOTHING HERE ASSUMES IT RAN.
 * The Step-0 reconcile that reaps stale `running` rows to `crashed` is a
 * `reconcile` step at the head of `manifest.chains.sources` (Spec 122 §7.4), not
 * a library concern. This file reads no prior-run state, waits on no reaper, and
 * behaves identically whether or not a previous run left a row stranded — the
 * ledger open is an unconditional INSERT, never an upsert over a prior row.
 *
 * GROWTH WAVES (Spec 122 §S2, R4) — deferred here, each with its pilot:
 *   · generated write SQL from `write_discipline`            → INGESTOR pilot
 *   · staleness/gating axes + the run-ledger gate            → INGESTOR/ENRICHER
 *   · invalidation + counters scoped by `writes.key`         → LINK/MATCHER
 *   · quarantine / checkpoint / partial_fill                 → BACKFILL
 *   · publish pointer / WAP                                  → RECORDER
 *   · scope-defer                                            → ENRICHER
 *   · ledger-row consolidation out of run-chain (claim #39)  → run-chain wave
 *   · `pct` / `pop` / `ratio` limit forms                    → validator wave
 *
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §4, §7
 * SPEC LINK: docs/specs/01-pipeline/120_pipeline_step_runner.md §4.1
 * SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §R6, §R10, §R11
 */
'use strict';

const pipeline = require('../pipeline');
const { assertDbTarget } = require('../resolve-db');
const { validateDescriptor } = require('./validate');
const { buildAuditTable, deriveVerdict } = require('./verdict');
const { RUN_STATUS, ownsLedgerRow, openLedgerRow, finalizeLedgerRow } = require('./ledger');

/** `PIPELINE_META` reads/writes/externals, derived from the descriptor — never hand-maintained. */
function deriveMeta(descriptor) {
  const reads = {};
  const tables = (descriptor.inputs && descriptor.inputs.reads && descriptor.inputs.reads.tables) || [];
  for (const t of tables) reads[t.table] = t.columns || [];
  const writes = {};
  if (descriptor.outputs && descriptor.outputs !== 'none') {
    for (const w of descriptor.outputs.writes) writes[w.table] = w.columns.map((c) => c.name);
  }
  const externals = (descriptor.inputs && descriptor.inputs.reads && descriptor.inputs.reads.externals) || [];
  return { reads, writes, external: externals.map((e) => e.id) };
}

/**
 * §4.1 ③④ — the P0 defect class, applied at the step. "A step pointed at a
 * 222-migration database REFUSES." Delegates wholesale to P0's one resolver.
 */
async function assertDatabaseTarget(pool, descriptor) {
  const db = descriptor.database;
  if (!db || db.class === 'none') return;
  await assertDbTarget(pool, {
    label: descriptor.identity.name,
    minMigration: db.min_migration === 'none' ? null : db.min_migration,
    expectDatabase: db.assert_current_database === 'none' ? undefined : db.assert_current_database,
    description: `${descriptor.identity.name} (descriptor.database)`,
    logger: {
      log: (msg) => pipeline.log.info(`[${descriptor.identity.name}]`, msg),
      warn: (msg) => pipeline.log.warn(`[${descriptor.identity.name}]`, msg),
    },
  });
}

/** Counters: `counters: "none"` means the step declares it counts nothing (§1.10, normative for ASSERT). */
function deriveCounters(descriptor, computeResult) {
  if (!descriptor.counters || descriptor.counters === 'none') {
    return { records_total: null, records_new: null, records_updated: null };
  }
  const c = (computeResult && computeResult.counters) || {};
  return {
    records_total: c.records_total ?? null,
    records_new: c.records_new ?? null,
    records_updated: c.records_updated ?? null,
  };
}

/** The SKIP terminal's records_meta — verdict row-derived like every other path (no hardcoded 'PASS'). */
function skipRecordsMeta(descriptor, reason) {
  const rows = [
    { metric: 'status', value: 'SKIPPED', threshold: null, status: 'INFO' },
    { metric: 'reason', value: reason, threshold: null, status: 'INFO' },
  ];
  return {
    skipped: true,
    reason,
    audit_table: {
      phase: 0,
      name: descriptor.identity.display_name,
      verdict: deriveVerdict(rows),
      rows,
    },
  };
}

async function runWithPool(runnable, pool, ctx) {
  const descriptor = runnable.descriptor;
  const slug = descriptor.identity.name;
  const chainId = ctx.chainId !== undefined ? ctx.chainId : (process.env.PIPELINE_CHAIN || null);
  const startMs = Date.now();
  const owns = ownsLedgerRow(chainId);

  let runId = null;
  let status = RUN_STATUS.FAILED;
  let recordsMeta = null;
  let counters = { records_total: null, records_new: null, records_updated: null };
  let errorMessage = null;

  try {
    await assertDatabaseTarget(pool, descriptor);
    if (owns) runId = await openLedgerRow(pool, slug);

    // §4.1 ② — txn-scoped advisory lock on identity.lock. `skipEmit: false`
    // because the SKIP summary is the library's to emit: the SDK's built-in one
    // carries no audit_table, which is what makes a contention skip land as
    // verdict UNKNOWN today instead of a row-derived verdict.
    const lockResult = await pipeline.withAdvisoryLock(pool, descriptor.identity.lock, async () => {
      const observations = Object.create(null);
      const declared = new Set(descriptor.checks.map((c) => c.id));
      const stepCtx = {
        pool,
        chainId,
        // The lock's fencing token (Spec 120 §4.1 ②). S2-min CARRIES it and
        // records it; REFUSING a lower run_id needs the holder column that
        // arrives with the S4 state tables, so it is not claimed here.
        runId,
        descriptor,
        log: pipeline.log,
        report(checkId, observation) {
          if (!declared.has(checkId)) {
            throw new Error(`[${slug}] compute reported check "${checkId}", which the descriptor does not declare`);
          }
          observations[checkId] = observation;
        },
      };

      const computeResult = await runnable.compute(stepCtx);
      if (computeResult && computeResult.observations) Object.assign(observations, computeResult.observations);

      const built = buildAuditTable(descriptor, chainId, observations);
      counters = deriveCounters(descriptor, computeResult);
      recordsMeta = {
        ...(computeResult && computeResult.records_meta ? computeResult.records_meta : {}),
        checks_passed: built.errors.length === 0 ? 'all' : undefined,
        checks_failed: built.errors.length,
        errors: built.errors.length > 0 ? built.errors : undefined,
        audit_table: built.audit_table,
      };
      status = built.audit_table.verdict === 'FAIL'
        ? RUN_STATUS.FAILED
        : built.audit_table.verdict === 'WARN'
          ? RUN_STATUS.COMPLETED_WITH_WARNINGS
          : RUN_STATUS.COMPLETED;

      pipeline.emitSummary({ ...counters, records_meta: recordsMeta });
      const meta = deriveMeta(descriptor);
      pipeline.emitMeta(meta.reads, meta.writes, meta.external);

      // Thrown INSIDE the lock, AFTER the emit: the audit rows are already on
      // stdout, and the enclosing transaction rolls back — the Write-Audit-
      // Publish shape (§7.2), and the behaviour assert-schema.js:567 has today.
      if (built.blockingFailures.length > 0) {
        errorMessage = `blocking checks failed: ${built.blockingFailures.join(', ')}`;
        throw new Error(`[${slug}] ${errorMessage}`);
      }
    }, { skipEmit: false });

    if (!lockResult.acquired) {
      status = RUN_STATUS.SELF_SKIPPED;
      recordsMeta = skipRecordsMeta(descriptor, 'advisory_lock_held_elsewhere');
      pipeline.emitSummary({ records_total: null, records_new: null, records_updated: null, records_meta: recordsMeta });
    }
    return { status, recordsMeta, runId, acquired: lockResult.acquired };
  } catch (err) {
    // ⚠️ DECLARED AUDIT GAP, S2-min. A compute that throws BEFORE any
    // `ctx.report()` emits ZERO audit rows — the failure survives only as the
    // ledger row's `error_message`. Today `assert-schema.js:318-443` avoids this
    // by wrapping EACH source fetch in its own try/catch, so one unreachable
    // archive reddens one row instead of erasing the whole table.
    //
    // That per-check granularity is a PROPERTY OF THE COMPUTE, not of the
    // library, and every conversion must preserve it at PH-0: a compute that
    // lets a fetch escape to the top level trades nine audit rows for one error
    // string. Library-side protection — running each check in its own boundary
    // and synthesizing an errored observation — is the validator growth wave,
    // where `on_check_error` becomes the runner's to apply rather than the
    // compute's to honour. Pinned by a test so it cannot regress unnoticed.
    //
    // `failed`, never `crashed`: this code ran and reached a verdict.
    status = RUN_STATUS.FAILED;
    errorMessage = errorMessage || (err && err.message ? err.message : String(err));
    throw err;
  } finally {
    if (owns) {
      await finalizeLedgerRow(pool, runId, {
        slug,
        status,
        durationMs: Date.now() - startMs,
        errorMessage,
        recordsMeta,
        recordsTotal: counters.records_total,
        recordsNew: counters.records_new,
        recordsUpdated: counters.records_updated,
      });
    }
  }
}

/**
 * Auto-run when the step file IS the process entry point.
 *
 * The frozen file shape (Spec 122 §5.1) permits no executable statement beyond
 * the `pipeline.step()` call, so `node scripts/<slug>.js` needs a trigger the
 * step file cannot spell. `require.main.exports === runnable` is the exact
 * discriminator claim #86 draws: a file being REQUIRED is not `require.main`,
 * so requiring still opens no pool. The check is deferred to `nextTick` because
 * `module.exports` is only assigned after this factory returns.
 */
function scheduleAutoRun(runnable) {
  process.nextTick(() => {
    if (!require.main || require.main.exports !== runnable) return;
    runnable.run().catch((err) => {
      pipeline.log.error(`[${runnable.descriptor.identity.name}]`, err, { phase: 'fatal' });
      process.exitCode = 1;
    });
  });
}

/**
 * @param {object} descriptor - validated against step.schema.json, or this throws
 * @param {(ctx: object) => Promise<object|void>} compute
 * @returns {{descriptor: object, compute: Function, run: (ctx?: object) => Promise<object>}}
 */
function step(descriptor, compute) {
  validateDescriptor(descriptor);
  if (typeof compute !== 'function') {
    throw new Error(`pipeline.step: compute for "${descriptor.identity.name}" must be a function (got ${typeof compute})`);
  }
  const runnable = {
    descriptor,
    compute,
    /**
     * @param {{pool?: import('pg').Pool, chainId?: string|null}} [ctx]
     */
    run(ctx = {}) {
      if (ctx.pool) return runWithPool(runnable, ctx.pool, ctx);
      return pipeline.run(descriptor.identity.name, (pool) => runWithPool(runnable, pool, ctx));
    },
  };
  scheduleAutoRun(runnable);
  return runnable;
}

module.exports = { step, deriveMeta, deriveCounters, skipRecordsMeta, assertDatabaseTarget };
