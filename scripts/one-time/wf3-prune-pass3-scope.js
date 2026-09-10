#!/usr/bin/env node
/**
 * WF3 EP-D14 — one-off cloud DELETE of enrich_parcels_pass3_scope's own current contents,
 * before mig 246 (the parcel_id index) is applied and before the next --full enrich_parcels
 * dispatch.
 *
 * SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md P3A.1 (D4' recovery bound)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md 3.0b (scope hand-off ledger)
 * SPEC LINK: .cursor/wf3_ep_d14_pass5_recovery_scan_active_task.md (Ask 1 ruling; Cloud step 3)
 *
 * WHY THIS EXISTS: 2026-09-09 cloud-measured (run 34400284685, pipeline_runs 4560):
 * enrich_parcels_pass3_scope held 2,210,745 rows / 439,130 unconsumed from a legacy run whose
 * pass 5 was killed (EP-D13). Ask 1's ruling: under --full (the only live cloud invocation),
 * the unconsumed rows are STALE, not pending recovery, once their producing run is
 * terminal-failed and the next run is --full — F6-corrected (output panel, same day): a
 * pending row is either no longer eligible (the NEXT --full run's own hand-off INSERT will
 * not even re-spool it) or still eligible (that SAME next run's own stream recomputes it
 * itself); neither case needs this stale row's own recovery.
 * Pruning them here (rather than leaving them for EP-D14's own set-based stamp to drain) makes
 * BOTH mig 246's index build and the next run's own EP-D10 prune trivially cheap (~0 rows) —
 * worst case if this ruling is wrong: one redundant --full recompute, which the next run
 * performs anyway. This script deletes the table's ENTIRE current contents (both the
 * already-consumed AND the unconsumed rows) — the next --full run regenerates fresh scope
 * rows from its own hand-off INSERT regardless, so nothing here is load-bearing to preserve.
 *
 * NEVER TRUNCATE (validate-migration.js Rule 1's own spirit — this is not a migration, but the
 * same reasoning applies): DELETE is transactional, backed up, and count-asserted; TRUNCATE is
 * not.
 *
 * ATOMICITY: REPEATABLE READ gives the backup and the DELETE ONE snapshot, so the backup
 * provably contains exactly the rows removed — the same pattern as
 * scripts/backfill/backfill-smeared-enriched-status.js.
 *
 * RESTORE (per run — substitute the dated/timed table printed by that run):
 *   INSERT INTO enrich_parcels_pass3_scope SELECT * FROM _backup_pass3_scope_<YYYYMMDD>_<HHMMSS>;
 * ⚠ F10 (output panel, 2026-09-09) — this restore is valid ONLY before the NEXT --full
 *   enrich_parcels run. Once that run has executed, its own hand-off INSERT has already
 *   spooled a fresh (run_id, parcel_id) row per eligible parcel — restoring the OLD backup
 *   on top would re-introduce stale, already-superseded scope rows under a run_id that no
 *   longer means anything, not recover lost state.
 *
 * Usage:  node -r dotenv/config scripts/one-time/wf3-prune-pass3-scope.js [--confirm]
 *   (no flag = DRY RUN: prints total / unconsumed / distinct run_id, writes nothing)
 */
'use strict';

const pipeline = require('../lib/pipeline');

// §R2 — Spec 47 §A.5. Next-free from the post-Wave-7 sequential free range (113 observe-chain,
// 114 backfill-realtor, 115 link-parcel-addresses, 116 reserved one-time, 117
// compute-parcel-cost-estimates, ..., 123 dispatch-notifications, 124 reconcile-runs -> 125
// next-free). Adopts the §R1-R12 skeleton BY CHOICE (precedent:
// scripts/one-time/wf2-p13-null-legacy-cost-tail.js) — this is a one-off, not a chain step.
const ADVISORY_LOCK_ID = 125;

const TAG = '[wf3-prune-pass3-scope]';

// F3 (output panel, 2026-09-09) — enrich_parcels' own advisory lock (identity.lock: 65) +
// inner two-key subkey (scripts/lib/step/index.js ENRICH_INNER_LOCK_SUBKEY = 1). This
// script must never delete `enrich_parcels_pass3_scope` rows a CURRENTLY-RUNNING
// enrich_parcels invocation just spooled for itself — under REPEATABLE READ the backup
// snapshot and the DELETE would remove that run's own freshly-inserted, still-unconsumed
// scope rows out from under it.
const ENRICH_PARCELS_LOCK_ID = 65; // enrich-parcels.descriptor.json identity.lock — the OUTER, whole-step lock

function backupTableName(runAt) {
  // `runAt` is ALREADY a `Date` (pipeline.getDbTimestamp's pg-driver-parsed `NOW()` result) —
  // no `new Date(...)` re-wrap needed (and `new Date()` is banned in pipeline scripts, §47
  // §R3.5, argument-agnostic by design — "Time Cop").
  // F7 (output panel, 2026-09-09) — <YYYYMMDD>_<HHMMSS>, not date-only: this is a manual,
  // human-triggered one-off that could genuinely run twice inside the same UTC day (e.g. a
  // dry-run then a --confirm run minutes apart, or a repeat cloud stall the same day) —
  // date-only would collide on the SECOND same-day run and fail the whole prune (CREATE
  // TABLE without IF NOT EXISTS), unlike backfill-smeared-enriched-status's own
  // date-only stamp, whose own header states its collision is EXPECTED/desired
  // (deliberately once-per-day). This script has no such once-per-day intent.
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${runAt.getUTCFullYear()}${pad(runAt.getUTCMonth() + 1)}${pad(runAt.getUTCDate())}_${pad(runAt.getUTCHours())}${pad(runAt.getUTCMinutes())}${pad(runAt.getUTCSeconds())}`;
  return `_backup_pass3_scope_${stamp}`;
}

async function runPrune(pool, { confirm = false } = {}) {
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    const RUN_AT = await pipeline.getDbTimestamp(pool); // §R3.5 — DB clock, never new Date()
    const backupTable = backupTableName(RUN_AT);

    // F3 (output panel, 2026-09-09; orchestrator fold at landing 2026-09-10) — refuse
    // OUTRIGHT while enrich_parcels is running, BOTH ways: (a) an acquire-and-release probe
    // on the step's OUTER advisory lock (identity.lock 65, single-key) — `runWithPool` holds
    // it via `pipeline.withAdvisoryLock` for the WHOLE step, shared-txn phases AND
    // post_commit alike, so any live invocation makes this probe read `acquired:false`. The
    // probe goes through `pipeline.withAdvisoryLock` itself (Spec 47 §5 — the footgun gate
    // bans direct advisory-lock SQL in scripts, and the one-key outer lock is the one that
    // actually spans the run; a raw two-key (65,1) probe would have matched only the inner
    // per-phase lock); (b) a `pipeline_runs` row assert, as a second, independent signal
    // (the lock probe alone could miss a run between COMMIT and its own final
    // `status='completed'` UPDATE). Neither replaces the other.
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

    const { rows: totals } = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE consumed_at IS NULL)::int AS unconsumed,
              COUNT(DISTINCT run_id)::int AS distinct_run_ids
         FROM enrich_parcels_pass3_scope`,
    );
    const { total, unconsumed, distinct_run_ids: distinctRunIds } = totals[0];

    pipeline.log.info(TAG, 'Scope computed at run time', { total, unconsumed, distinct_run_ids: distinctRunIds });

    // Early idempotent return — precedent wf2-p13:56-61 / backfill-smeared-enriched-status.
    // Nothing to back up, nothing to delete, no empty dated table left behind.
    if (total === 0) {
      pipeline.log.info(TAG, 'Nothing to prune — already empty');
      pipeline.emitSummary({
        records_total: 0, records_new: 0, records_updated: 0,
        records_meta: {
          confirmed: confirm, backup_table: null,
          audit_table: {
            phase: 78, name: 'enrich_parcels_pass3_scope one-off prune', verdict: 'PASS',
            rows: [{ metric: 'pass3_scope_rows_evaluated', value: 0, threshold: null, status: 'INFO' }],
          },
        },
      });
      return { total: 0, pruned: 0, backupTable: null, confirmed: confirm };
    }

    if (!confirm) {
      pipeline.log.warn(TAG,
        `DRY RUN (no --confirm) — ${total} rows (${unconsumed} unconsumed, ${distinctRunIds} distinct run_id) WOULD be pruned. No writes. Re-run with --confirm.`);
      pipeline.emitSummary({
        records_total: total, records_new: 0, records_updated: 0,
        records_meta: {
          confirmed: false, backup_table: null,
          audit_table: {
            phase: 78, name: 'enrich_parcels_pass3_scope one-off prune (DRY RUN)', verdict: 'PASS',
            rows: [
              { metric: 'pass3_scope_rows_evaluated', value: total, threshold: null, status: 'INFO' },
              { metric: 'pass3_scope_unconsumed_evaluated', value: unconsumed, threshold: null, status: 'INFO' },
              { metric: 'rows_pruned', value: 0, threshold: null, status: 'INFO' },
            ],
          },
        },
      });
      return { total, pruned: 0, backupTable: null, confirmed: false };
    }

    const pruned = await pipeline.withTransaction(pool, async (client) => {
      // ATOMICITY — see header. REPEATABLE READ gives the backup and the DELETE ONE
      // snapshot, so the backup provably contains exactly the rows removed.
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');

      // Backup FIRST — a destructive DELETE with no rollback path is not acceptable
      // (same Gemini P9 ruling backfill-smeared-enriched-status.js cites). Dated name:
      // this script may run more than once (e.g. a repeat cloud stall).
      const backup = await client.query(
        `CREATE TABLE ${backupTable} AS SELECT * FROM enrich_parcels_pass3_scope`,
      );

      // The WHOLE table's current contents — see header rationale (Ask 1 ruling: under
      // --full the pending set is stale-by-construction once its producing run is
      // terminal-failed; the next --full run regenerates fresh scope rows regardless).
      // DELETE, never TRUNCATE (Rule 1's own spirit) — transactional, backed up, count-asserted.
      const del = await client.query('DELETE FROM enrich_parcels_pass3_scope');

      // The backup is the ONLY rollback. If it does not contain exactly what we deleted,
      // fail LOUDLY rather than leave unrecoverable rows behind.
      if (backup.rowCount !== del.rowCount) {
        throw new Error(
          `${TAG} ABORT — backup/delete row mismatch: backed up ${backup.rowCount}, deleted ${del.rowCount}. Transaction rolled back.`,
        );
      }
      return del.rowCount;
    });

    pipeline.log.info(TAG, 'Pruned', {
      pruned, backup_table: backupTable,
      // F10 (output panel) — the caveat travels WITH the printed SQL, not only in the
      // source header an operator copy-pasting from the log will never see.
      restore: `INSERT INTO enrich_parcels_pass3_scope SELECT * FROM ${backupTable}; -- valid ONLY before the NEXT --full enrich_parcels run`,
    });

    // §11 counter semantics (Spec 47 §11): records_total = primary entity rows EVALUATED;
    // records_updated is N/A for a pure DELETE (no row survives to be "updated") — reported
    // as records_new: 0, records_updated: 0, with the real count in the audit_table (§11.2
    // overflow rule — a destructive-cleanup count, not a primary-entity mutation count).
    pipeline.emitSummary({
      records_total: total, records_new: 0, records_updated: 0,
      records_meta: {
        confirmed: true, backup_table: backupTable,
        audit_table: {
          phase: 78, name: 'enrich_parcels_pass3_scope one-off prune', verdict: 'PASS',
          rows: [
            { metric: 'pass3_scope_rows_evaluated', value: total, threshold: null, status: 'INFO' },
            { metric: 'pass3_scope_unconsumed_evaluated', value: unconsumed, threshold: null, status: 'INFO' },
            { metric: 'rows_pruned', value: pruned, threshold: null, status: 'INFO' },
          ],
        },
      },
    });

    // §R11 — declare every column read/written (the backup SELECT's columns included).
    pipeline.emitMeta(
      { enrich_parcels_pass3_scope: ['run_id', 'parcel_id', 'consumed_at', 'created_at'] },
      { enrich_parcels_pass3_scope: ['run_id', 'parcel_id', 'consumed_at', 'created_at'] },
    );

    return { total, pruned, backupTable, confirmed: true };
  });

  if (!lockResult.acquired) return null; // §R12 — SDK already emitted the SKIP summary
  return lockResult.result;
}

module.exports = { runPrune, ADVISORY_LOCK_ID, backupTableName };

// The require.main guard WRAPS pipeline.run — precedent backfill-smeared-enriched-status.js.
if (require.main === module) {
  const confirm = process.argv.includes('--confirm');
  pipeline.run('wf3-prune-pass3-scope', async (pool) => {
    await runPrune(pool, { confirm });
  });
}
