#!/usr/bin/env node
/**
 * One-time backfill: populate coa_applications.structure_type (dwelling-use archetype,
 * Spec 83 §3.A matrix vocabulary) by running classifyStructureType over EVERY
 * description-bearing CoA.
 *
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.6.D (structure_type = description classifier)
 *            docs/specs/01-pipeline/83_lead_cost_model.md §3.A (structure_type vocabulary contract)
 *
 * Why this exists: structure_type is a NEW classify-coa-scope output. The incremental
 * classify cursor (`scope_classified_at < last_seen_at`) will NOT re-touch the ~29K CoAs
 * already classified before structure_type existed, so the column stays NULL for the
 * backlog. This sweeps the whole corpus ONCE; going forward classify-coa-scope maintains it.
 *
 * Operational characteristics:
 *   - FULL id-cursor sweep over all description-bearing CoAs — NOT a `structure_type IS NULL`
 *     predicate. ~48% of descriptions legitimately resolve to NULL (no archetype signal);
 *     a predicate-cursor would re-process those rows forever. The sweep classifies each row
 *     exactly once per invocation and advances the monotonic id cursor regardless of outcome.
 *   - Idempotent: the per-batch UPDATE is `IS DISTINCT FROM`-guarded, so a re-run writes 0
 *     rows (resolved rows already match; null-resolving rows stay NULL).
 *   - Batched (5K) by id cursor — per-batch lock stays small (mig-162 / footprint-geom
 *     precedent: a 33K-row sweep shouldn't hold one long txn lock).
 *   - Advisory lock 119 — single instance at a time.
 *
 * Usage: node -r dotenv/config scripts/one-time/backfill-coa-structure-type.js
 */
'use strict';

const pipeline = require('../lib/pipeline');
const { classifyStructureType } = require('../lib/coa-scope-classifier');

const TAG = '[backfill-coa-structure-type]';
const ADVISORY_LOCK_ID = 119;
const BATCH_SIZE = 5000;

const SWEEP_PREDICATE = `lead_id IS NOT NULL AND description IS NOT NULL AND description <> ''`;

pipeline.run('backfill-coa-structure-type', async (pool) => {
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    const t0 = Date.now();

    const { rows: preRows } = await pool.query(
      `SELECT COUNT(*) AS total FROM coa_applications WHERE ${SWEEP_PREDICATE}`,
    );
    const sweepTotal = Number(preRows[0].total) || 0;
    pipeline.log.info(TAG, `Sweeping ${sweepTotal.toLocaleString()} description-bearing CoAs`);

    let totalResolved = 0; // classified to a non-null archetype
    let totalNull = 0;     // classified to null (no archetype signal — left NULL)
    let totalWritten = 0;  // rowCount sum (changed rows only)
    let iteration = 0;
    let errors = 0;
    let lastId = 0;

    while (true) {
      iteration++;
      try {
        const { rows: batch } = await pool.query(
          `SELECT id, description FROM coa_applications
            WHERE id > $1 AND ${SWEEP_PREDICATE}
            ORDER BY id ASC
            LIMIT $2`,
          [lastId, BATCH_SIZE],
        );
        if (batch.length === 0) {
          pipeline.log.info(TAG, `Sweep complete after ${iteration - 1} batch(es)`);
          break;
        }

        const ids = [];
        const sts = [];
        for (const r of batch) {
          const st = classifyStructureType(String(r.description));
          ids.push(r.id);
          sts.push(st); // null or archetype string — pg driver serializes null → SQL NULL
          if (st !== null) totalResolved++; else totalNull++;
          if (r.id > lastId) lastId = r.id;
        }

        // IS DISTINCT FROM guard → re-run is a no-op; only changed rows written.
        const res = await pipeline.withTransaction(pool, async (client) =>
          client.query(
            `UPDATE coa_applications ca
                SET structure_type = v.structure_type
               FROM unnest($1::bigint[], $2::text[]) AS v(id, structure_type)
              WHERE ca.id = v.id
                AND ca.structure_type IS DISTINCT FROM v.structure_type`,
            [ids, sts],
          ),
        );
        totalWritten += res.rowCount ?? 0;

        pipeline.log.info(
          TAG,
          `Batch ${iteration}: ${ids.length} swept (resolved ${totalResolved.toLocaleString()}, written ${totalWritten.toLocaleString()}, cursor id=${lastId})`,
        );
      } catch (err) {
        errors++;
        pipeline.log.error(TAG, err, { iteration });
        break;
      }
    }

    const elapsedMs = Date.now() - t0;
    const resolvedPct = sweepTotal > 0 ? (totalResolved / sweepTotal) * 100 : 0;

    const auditRows = [
      { metric: 'swept_total', value: sweepTotal, threshold: null, status: 'INFO' },
      { metric: 'structure_type_resolved', value: totalResolved, threshold: null, status: 'INFO' },
      { metric: 'resolved_pct', value: resolvedPct.toFixed(1) + '%', threshold: null, status: 'INFO' },
      { metric: 'classified_null', value: totalNull, threshold: null, status: 'INFO' },
      { metric: 'rows_written', value: totalWritten, threshold: null, status: 'INFO' },
      { metric: 'errors', value: errors, threshold: '== 0', status: errors === 0 ? 'PASS' : 'FAIL' },
      { metric: 'sys_duration_ms', value: elapsedMs, threshold: null, status: 'INFO' },
    ];
    const verdict = auditRows.some((r) => r.status === 'FAIL') ? 'FAIL'
                  : auditRows.some((r) => r.status === 'WARN') ? 'WARN' : 'PASS';

    pipeline.log.info(
      TAG,
      `Done. Resolved ${totalResolved.toLocaleString()}/${sweepTotal.toLocaleString()} (${resolvedPct.toFixed(1)}%), wrote ${totalWritten.toLocaleString()} in ${elapsedMs}ms.`,
    );

    pipeline.emitSummary({
      records_total: sweepTotal,
      records_new: 0,
      records_updated: totalWritten,
      records_meta: {
        duration_ms: elapsedMs,
        structure_type_resolved: totalResolved,
        classified_null: totalNull,
        rows_written: totalWritten,
        audit_table: { phase: 42, name: 'CoA structure_type backfill', verdict, rows: auditRows },
      },
    });
    pipeline.emitMeta(
      { coa_applications: ['id', 'lead_id', 'description', 'structure_type'] },
      { coa_applications: ['structure_type'] },
    );
  });

  if (!lockResult.acquired) return;
});
