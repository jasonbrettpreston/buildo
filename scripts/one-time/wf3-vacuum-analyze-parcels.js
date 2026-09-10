#!/usr/bin/env node
/**
 * WF3 EP-D17 — one-off cloud `VACUUM (ANALYZE) parcels`, reclaiming the dead tuples
 * enrich_parcels' own pass-4 comps rewrite leaves behind, before migration 247's tuned
 * autovacuum params take over steady-state maintenance.
 *
 * SPEC LINK: docs/specs/00-architecture/115_scheduling.md §5 (the itemisation trigger)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §7 ladder / §7.5
 * SPEC LINK: .cursor/wf3_ep_d17_pass5_fullscan_checks_active_task.md (C5; Cloud
 *   remediation sequence step 3; Idempotency Lens table)
 *
 * WHY THIS EXISTS: 2026-09-10 cloud-measured (run 34506962436, pipeline_runs 4566/4588):
 * `parcels` dead_ratio 0.697 (1,346,759 dead tuples, 4,384 MB heap) right after
 * enrich_parcels' own pass-4 comps rewrite committed. Passes 1-4 share ONE transaction
 * whose xmin pinned the vacuum horizon for its ~93-minute duration, so no autovacuum
 * setting could reclaim anything DURING the run; the POST-COMMIT catch-up measured
 * ~49 minutes throttled at the default autovacuum_vacuum_cost_delay=2ms — exactly the
 * window the run's own 5 post checks (EP-D17's code fix, C1/C2/C2b) ran inside, one of
 * them alone costing ~35-40 minutes against the bloated heap vs 16-30s clean. This
 * one-off runs a single UNTHROTTLED manual VACUUM (default vacuum_cost_delay=0 for a
 * manual VACUUM, unlike the throttled autovacuum daemon) to reclaim the CURRENT backlog
 * once, before migration 247's tuned params (lower scale factors + cost_delay=0) take
 * over steady-state. Estimated 3-10 min (IO-bound on the 4,384 MB heap), against the
 * ~49 min the throttled autovacuum daemon took for the same volume.
 *
 * NOT `VACUUM (FULL)` — plain VACUUM does not shrink `relpages`/reclaim disk to the OS,
 * only marks space reusable; `FULL` needs ACCESS EXCLUSIVE + ~5 GB headroom and
 * `pg_repack` is not installed (measured). Filed as Ask 3 in the WF3 plan, a SEPARATE
 * operator decision with its own maintenance window — never run from this script.
 *
 * LOCK CLASS: plain `VACUUM (ANALYZE)` takes SHARE UPDATE EXCLUSIVE — safe against
 * concurrent reads and DML, blocks only DDL/another VACUUM. Still gated on NO in-flight
 * chain (same reasoning as wf3-prune-pass3-scope.js's own enrich_parcels lock probe):
 * competes for the same IO budget a live chain needs.
 *
 * Usage:  node -r dotenv/config scripts/one-time/wf3-vacuum-analyze-parcels.js [--confirm]
 *   (no flag = DRY RUN: prints n_live_tup/n_dead_tup/dead_ratio/heap size/reloptions,
 *   writes nothing)
 */
'use strict';

const pipeline = require('../lib/pipeline');

// §R2 — Spec 47 §A.5. Next-free from the post-Wave-7 sequential range: 125 was
// consumed by scripts/one-time/wf3-prune-pass3-scope.js (WF3 EP-D14) -> 126 next-free.
// Adopts the §R1-R12 skeleton by choice (same precedent that script itself cites:
// scripts/one-time/wf2-p13-null-legacy-cost-tail.js) — this is a one-off, not a chain step.
const ADVISORY_LOCK_ID = 126;

const TAG = '[wf3-vacuum-analyze-parcels]';

// enrich_parcels' own advisory lock (identity.lock: 65) — the OUTER, whole-step lock
// that spans passes 1-4's shared transaction AND pass 5's post_commit phase alike
// (scripts/lib/step/index.js's runWithPool holds it via pipeline.withAdvisoryLock for
// the whole step). A manual VACUUM competes for the same IO budget as a live chain, so
// this script refuses outright while enrich_parcels is running — the SAME two-signal
// check wf3-prune-pass3-scope.js uses (lock probe + a running pipeline_runs row), for
// the same reason: the probe alone could miss a run between COMMIT and its own final
// status='completed' UPDATE. The probe goes through pipeline.withAdvisoryLock itself
// (Spec 47 §5 — the footgun gate bans direct advisory-lock SQL in scripts; the
// single-key OUTER lock is the one that actually spans the run, never the two-key inner
// per-phase subkey).
const ENRICH_PARCELS_LOCK_ID = 65; // enrich-parcels.descriptor.json identity.lock

async function readParcelsStats(pool) {
  const { rows } = await pool.query(
    `SELECT n_live_tup::bigint AS live, n_dead_tup::bigint AS dead,
            pg_relation_size('parcels') AS heap_bytes,
            pg_total_relation_size('parcels') AS total_bytes
       FROM pg_stat_user_tables WHERE relname = 'parcels'`,
  );
  const r = rows[0];
  if (!r) return null;
  const live = Number(r.live) || 0;
  const dead = Number(r.dead) || 0;
  const { rows: relopRows } = await pool.query(
    `SELECT reloptions FROM pg_class WHERE relname = 'parcels'`,
  );
  return {
    n_live_tup: live,
    n_dead_tup: dead,
    dead_ratio: (live + dead) > 0 ? Math.round((dead / (live + dead)) * 10000) / 10000 : 0,
    heap_mb: Math.round(Number(r.heap_bytes) / 1024 / 1024),
    total_mb: Math.round(Number(r.total_bytes) / 1024 / 1024),
    reloptions: relopRows[0]?.reloptions ?? null,
  };
}

async function runVacuumAnalyzeParcels(pool, { confirm = false } = {}) {
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    const lockProbe = await pipeline.withAdvisoryLock(pool, ENRICH_PARCELS_LOCK_ID, async () => ({ probed: true }));
    if (!lockProbe.acquired) {
      throw new Error(`${TAG} REFUSED — enrich_parcels' own advisory lock (${ENRICH_PARCELS_LOCK_ID}) is held elsewhere (a live invocation). Re-run after the current enrich_parcels invocation finishes.`);
    }
    const runningRow = await pool.query(
      `SELECT id FROM pipeline_runs WHERE pipeline LIKE '%enrich_parcels' AND status = 'running' LIMIT 1`,
    );
    if (runningRow.rowCount) {
      throw new Error(`${TAG} REFUSED — pipeline_runs row ${runningRow.rows[0].id} shows an enrich_parcels invocation still 'running'. Re-run after it finishes.`);
    }

    const before = await readParcelsStats(pool);
    if (!before) {
      throw new Error(`${TAG} ABORT — parcels has no pg_stat_user_tables row (table missing or stats never collected).`);
    }

    pipeline.log.info(TAG, 'parcels stats before', before);

    if (!confirm) {
      pipeline.log.warn(TAG,
        `DRY RUN (no --confirm) — dead_ratio ${before.dead_ratio} (${before.n_dead_tup} dead / ${before.n_live_tup} live), heap ${before.heap_mb} MB. No VACUUM issued. Re-run with --confirm.`);
      pipeline.emitSummary({
        records_total: null, records_new: null, records_updated: null,
        records_meta: {
          confirmed: false,
          audit_table: {
            phase: 115, name: 'parcels one-off VACUUM (ANALYZE) — DRY RUN', verdict: 'PASS',
            rows: [
              { metric: 'parcels_dead_tuple_ratio_before', value: before.dead_ratio, threshold: null, status: 'INFO' },
              { metric: 'parcels_dead_tup_before', value: before.n_dead_tup, threshold: null, status: 'INFO' },
              { metric: 'parcels_heap_mb_before', value: before.heap_mb, threshold: null, status: 'INFO' },
            ],
          },
        },
      });
      return { confirmed: false, before, after: null };
    }

    // Plain VACUUM (not FULL) — SHARE UPDATE EXCLUSIVE, autocommit, cannot run inside a
    // transaction block (`pipeline.withAdvisoryLock`'s own callback runs on `pool`, not
    // a client with an open BEGIN — the same reasoning scripts/lib/step/plausibility.js's
    // runMaintenance relies on for its own in-step VACUUM). Unthrottled by default for a
    // manual invocation (vacuum_cost_delay applies to autovacuum's own throttle setting;
    // a manual VACUUM session can set its own, defaulted here to 0/unthrottled — the
    // whole point of running it manually instead of waiting for the daemon).
    const startedAt = Date.now();
    await pool.query('VACUUM (ANALYZE) parcels');
    const durationMs = Date.now() - startedAt;

    const after = await readParcelsStats(pool);
    pipeline.log.info(TAG, 'parcels stats after', { ...after, duration_ms: durationMs });

    pipeline.emitSummary({
      records_total: null, records_new: null, records_updated: null,
      records_meta: {
        confirmed: true, duration_ms: durationMs,
        audit_table: {
          phase: 115, name: 'parcels one-off VACUUM (ANALYZE)', verdict: 'PASS',
          rows: [
            { metric: 'parcels_dead_tuple_ratio_before', value: before.dead_ratio, threshold: null, status: 'INFO' },
            { metric: 'parcels_dead_tuple_ratio_after', value: after ? after.dead_ratio : null, threshold: null, status: 'INFO' },
            { metric: 'parcels_heap_mb_before', value: before.heap_mb, threshold: null, status: 'INFO' },
            { metric: 'parcels_heap_mb_after', value: after ? after.heap_mb : null, threshold: null, status: 'INFO' },
            { metric: 'vacuum_duration_ms', value: durationMs, threshold: null, status: 'INFO' },
          ],
        },
      },
    });

    // §R11 — read-only against pg_stat_user_tables/pg_class; the one write is the
    // VACUUM statement itself, which touches no declared application column.
    pipeline.emitMeta(
      { parcels: ['n_live_tup', 'n_dead_tup', 'reloptions'] },
      {},
    );

    return { confirmed: true, before, after, duration_ms: durationMs };
  });

  if (!lockResult.acquired) return null; // §R12 — SDK already emitted the SKIP summary
  return lockResult.result;
}

module.exports = { runVacuumAnalyzeParcels, ADVISORY_LOCK_ID, readParcelsStats };

// The require.main guard WRAPS pipeline.run — precedent wf3-prune-pass3-scope.js.
if (require.main === module) {
  const confirm = process.argv.includes('--confirm');
  pipeline.run('wf3-vacuum-analyze-parcels', async (pool) => {
    await runVacuumAnalyzeParcels(pool, { confirm });
  });
}
