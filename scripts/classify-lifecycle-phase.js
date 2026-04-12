#!/usr/bin/env node
/**
 * Classify Lifecycle Phase — Strangler Fig V1 classifier.
 *
 * Reads dirty rows from `permits` and `coa_applications`, applies the
 * pure function in scripts/lib/lifecycle-phase.js, and writes the
 * computed `lifecycle_phase` + `lifecycle_stalled` + `lifecycle_classified_at`
 * back to the DB via `IS DISTINCT FROM`-guarded UPDATEs.
 *
 * Runs as a standalone pipeline_runs entry. Triggered by:
 *   - `scripts/trigger-lifecycle-sync.js` (final step of permits + CoA chains)
 *   - Manual CLI: `node scripts/classify-lifecycle-phase.js`
 *
 * Incremental: only re-classifies rows where
 *   `lifecycle_classified_at IS NULL OR last_seen_at > lifecycle_classified_at`.
 * First-run backfill processes all ~237K permits + ~33K CoAs in one pass.
 * Typical incremental runs process ~5K-15K rows in 2-5 seconds.
 *
 * SPEC LINK: docs/reports/lifecycle_phase_implementation.md §2.3
 */
'use strict';

const pipeline = require('./lib/pipeline');
const {
  classifyLifecyclePhase,
  classifyCoaPhase,
  DEAD_STATUS_ARRAY,
  NORMALIZED_DEAD_DECISIONS_ARRAY,
} = require('./lib/lifecycle-phase');

// ─────────────────────────────────────────────────────────────────
// Batch UPDATE SQL builders — batched via VALUES clause to avoid
// 65535-parameter PG limit. Batch size 500 × 4 params = 2000 params
// per UPDATE, well under the limit.
// ─────────────────────────────────────────────────────────────────

const PERMIT_BATCH_SIZE = 500;
const COA_BATCH_SIZE = 1000;

function buildPermitUpdateSQL(batchSize) {
  const tuples = [];
  for (let i = 0; i < batchSize; i++) {
    const base = i * 4;
    tuples.push(
      `($${base + 1}::varchar, $${base + 2}::varchar, $${base + 3}::varchar, $${base + 4}::boolean)`,
    );
  }
  return `
    UPDATE permits p
       SET lifecycle_phase = v.phase,
           lifecycle_stalled = v.stalled,
           lifecycle_classified_at = NOW()
      FROM (VALUES ${tuples.join(', ')}) AS v(permit_num, revision_num, phase, stalled)
     WHERE p.permit_num = v.permit_num
       AND p.revision_num = v.revision_num
       AND (p.lifecycle_phase IS DISTINCT FROM v.phase
            OR p.lifecycle_stalled IS DISTINCT FROM v.stalled)
  `;
}

function buildCoaUpdateSQL(batchSize) {
  const tuples = [];
  for (let i = 0; i < batchSize; i++) {
    const base = i * 2;
    tuples.push(`($${base + 1}::int, $${base + 2}::varchar)`);
  }
  return `
    UPDATE coa_applications ca
       SET lifecycle_phase = v.phase,
           lifecycle_classified_at = NOW()
      FROM (VALUES ${tuples.join(', ')}) AS v(id, phase)
     WHERE ca.id = v.id
       AND ca.lifecycle_phase IS DISTINCT FROM v.phase
  `;
}

function flattenPermitBatch(rows) {
  const out = [];
  for (const r of rows) {
    out.push(r.permit_num, r.revision_num, r.phase, r.stalled);
  }
  return out;
}

function flattenCoaBatch(rows) {
  const out = [];
  for (const r of rows) {
    out.push(r.id, r.phase);
  }
  return out;
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────
// Main run
// ─────────────────────────────────────────────────────────────────

// Startup validation — `<> ALL(ARRAY[]::text[])` is vacuously true
// in Postgres, which would silently zero-out the unclassified count.
if (DEAD_STATUS_ARRAY.length === 0) {
  throw new Error('DEAD_STATUS_ARRAY is empty — refusing to run');
}
if (NORMALIZED_DEAD_DECISIONS_ARRAY.length === 0) {
  throw new Error('NORMALIZED_DEAD_DECISIONS_ARRAY is empty — refusing to run');
}

// Advisory lock ID — must be stable across runs so two classifier
// instances contend for the same lock. Chosen as the migration number
// (085) to keep the ID human-traceable to the feature that added it.
// See adversarial review C1: without this, two chains finishing close
// in time would each fire the classifier and race on the UPDATE set.
const ADVISORY_LOCK_ID = 85;

pipeline.run('classify-lifecycle-phase', async (pool) => {
  const now = new Date();

  // ═══════════════════════════════════════════════════════════
  // Concurrency guard — single-threaded classifier
  // ═══════════════════════════════════════════════════════════
  //
  // CRITICAL: We must hold the advisory lock on a DEDICATED client
  // (pool.connect), NOT via pool.query. pool.query checks out an
  // ephemeral connection, runs the query, and immediately returns it
  // to the pool. During the 20-60s CPU-bound Map-building phase where
  // no SQL queries execute, the pool's default idleTimeoutMillis (10s)
  // can reap that connection — silently releasing the lock mid-run.
  // A dedicated client stays checked out (not idle in the pool) for
  // the full run duration. See WF3 Bug #1.
  const lockClient = await pool.connect();
  try {
    const { rows: lockRows } = await lockClient.query(
      'SELECT pg_try_advisory_lock($1) AS got',
      [ADVISORY_LOCK_ID],
    );
    if (!lockRows[0].got) {
      pipeline.log.info(
        '[classify-lifecycle-phase]',
        `Advisory lock ${ADVISORY_LOCK_ID} already held by another classifier instance — skipping this run.`,
      );
      pipeline.emitSummary({
        records_total: 0,
        records_new: 0,
        records_updated: 0,
        records_meta: {
          skipped: true,
          reason: 'advisory_lock_held_elsewhere',
          advisory_lock_id: ADVISORY_LOCK_ID,
        },
      });
      pipeline.emitMeta({}, {});
      // CRITICAL: release the lockClient BEFORE returning. Without
      // this, the return escapes before the outer try/finally where
      // lockClient.release() lives, leaking one pool connection on
      // every skipped run. Found by independent review, Item 1.
      lockClient.release();
      return;
    }
  } catch (lockErr) {
    lockClient.release();
    throw lockErr;
  }

  try {
  // ═══════════════════════════════════════════════════════════
  // Phase 1: classify dirty permit rows
  // ═══════════════════════════════════════════════════════════
  //
  // We AVOID correlated subqueries in the dirty-permit query because
  // `is_orphan` previously used split_part() on both sides of an
  // equality, which defeats index usage and produces O(n²) behaviour
  // across 243K permits (→ multi-hour classifier run).
  //
  // Instead we do three O(n) passes:
  //   1. Load the minimal dirty-permit columns (partial index covers this)
  //   2. Load BLD/CMB permit_nums and build Map<prefix, Set<permit_num>>
  //      for in-memory orphan detection
  //   3. Load inspection rollups via SQL aggregation (Postgres returns
  //      ~10K pre-aggregated rows, not the full 94K raw table)
  //   4. Classify each dirty permit in JS using the two Maps
  //
  // WATERMARK RACE NOTE (WF3 Bug #5, document only):
  // Between the dirty-SELECT and the per-batch UPDATE that writes
  // lifecycle_classified_at = NOW(), a concurrent writer (e.g.,
  // load-permits.js or link-coa.js) can bump a permit's last_seen_at.
  // The classifier sees stale data for that row but stamps it with a
  // classified_at AFTER the concurrent writer's last_seen_at, so the
  // row won't appear dirty on the NEXT run — meaning the stale
  // classification sticks until another pipeline step bumps
  // last_seen_at again. This is the accepted best-effort incremental
  // trade-off: the next daily chain run will re-classify with fresh
  // data. No code fix needed — the alternative (SELECT FOR UPDATE)
  // would block the entire permits pipeline for ~170s.

  pipeline.log.info('[classify-lifecycle-phase]', 'Querying dirty permits...');
  const permitsResult = await pool.query(
    `SELECT permit_num, revision_num, status, enriched_status, issued_date, last_seen_at
       FROM permits
      WHERE lifecycle_classified_at IS NULL
         OR last_seen_at > lifecycle_classified_at`,
  );
  const dirtyPermits = permitsResult.rows;
  pipeline.log.info(
    '[classify-lifecycle-phase]',
    `Dirty permits: ${dirtyPermits.length.toLocaleString()}`,
  );

  // Build orphan-detection map: prefix ("YY NNNNNNN") → Set of permit_nums
  // for permits whose third token is BLD or CMB. A dirty permit is an
  // orphan iff no OTHER permit with the same prefix is in the set.
  pipeline.log.info('[classify-lifecycle-phase]', 'Building BLD/CMB prefix map...');
  const bldCmbResult = await pool.query(
    `SELECT permit_num FROM permits
      WHERE split_part(permit_num, ' ', 3) IN ('BLD','CMB')`,
  );
  const bldCmbByPrefix = new Map();
  for (const row of bldCmbResult.rows) {
    const parts = row.permit_num.split(' ');
    if (parts.length < 3) continue;
    const prefix = `${parts[0]} ${parts[1]}`;
    let set = bldCmbByPrefix.get(prefix);
    if (!set) {
      set = new Set();
      bldCmbByPrefix.set(prefix, set);
    }
    set.add(row.permit_num);
  }
  pipeline.log.info(
    '[classify-lifecycle-phase]',
    `BLD/CMB prefixes tracked: ${bldCmbByPrefix.size.toLocaleString()}`,
  );

  // Build inspection rollup map — SQL-side aggregation so Node receives
  // ~10K rows (one per permit with inspections) instead of the full 94K+
  // raw permit_inspections table. Postgres is faster at this than JS, and
  // the approach avoids shipping 94K rows over the wire and building a
  // manual rollup in a for-loop. See WF3 Bug #2.
  pipeline.log.info('[classify-lifecycle-phase]', 'Building inspection rollup map...');
  const inspResult = await pool.query(
    `WITH latest_passed AS (
       SELECT DISTINCT ON (permit_num) permit_num, stage_name
         FROM permit_inspections
        WHERE status = 'Passed'
        ORDER BY permit_num, inspection_date DESC NULLS LAST, stage_name
     ),
     rollup AS (
       SELECT permit_num,
              MAX(inspection_date) AS latest_inspection_date,
              BOOL_OR(status = 'Passed') AS has_passed_inspection
         FROM permit_inspections
        GROUP BY permit_num
     )
     SELECT r.permit_num,
            lp.stage_name AS latest_passed_stage,
            r.latest_inspection_date,
            r.has_passed_inspection
       FROM rollup r
       LEFT JOIN latest_passed lp USING (permit_num)`,
  );
  const inspByPermit = new Map();
  for (const row of inspResult.rows) {
    inspByPermit.set(row.permit_num, {
      latest_passed_stage: row.latest_passed_stage,
      latest_inspection_date: row.latest_inspection_date
        ? new Date(row.latest_inspection_date) : null,
      has_passed_inspection: row.has_passed_inspection,
    });
  }
  pipeline.log.info(
    '[classify-lifecycle-phase]',
    `Inspection rollups built for ${inspByPermit.size.toLocaleString()} permits`,
  );

  // Apply pure function to every dirty row — all lookups are O(1)
  const EMPTY_INSP = {
    latest_passed_stage: null,
    latest_inspection_date: null,
    has_passed_inspection: false,
  };
  const permitUpdates = dirtyPermits.map((row) => {
    const parts = row.permit_num.split(' ');
    let is_orphan = true;
    if (parts.length >= 3) {
      const prefix = `${parts[0]} ${parts[1]}`;
      const siblings = bldCmbByPrefix.get(prefix);
      if (siblings) {
        // Orphan iff no OTHER permit_num in the set — matches the
        // original SQL semantics (s.permit_num <> p.permit_num).
        for (const pn of siblings) {
          if (pn !== row.permit_num) {
            is_orphan = false;
            break;
          }
        }
      }
    }
    const insp = inspByPermit.get(row.permit_num) || EMPTY_INSP;
    const result = classifyLifecyclePhase({
      status: row.status,
      enriched_status: row.enriched_status,
      issued_date: row.issued_date,
      is_orphan,
      latest_passed_stage: insp.latest_passed_stage,
      latest_inspection_date: insp.latest_inspection_date,
      has_passed_inspection: insp.has_passed_inspection,
      now,
    });
    return {
      permit_num: row.permit_num,
      revision_num: row.revision_num,
      phase: result.phase,
      stalled: result.stalled,
    };
  });

  let permitsUpdated = 0;
  if (permitUpdates.length > 0) {
    // Per-batch small transactions — each batch commits independently.
    //
    // Design notes (adversarial review C2 + independent Defect 1):
    //   • The prior version wrapped all 484 batches in ONE transaction,
    //     holding row-level locks on every dirty permit for ~130s during
    //     the first-run backfill. That blocked concurrent writers.
    //   • It also ran the `classified_at` stamp for unchanged rows
    //     OUTSIDE the transaction, creating a consistency gap where a
    //     crash after phase-commit but before stamp-commit would leave
    //     the "unchanged rows" bucket unable to drain on future runs.
    //   • Fix: each batch's phase UPDATE + per-batch stamp UPDATE run
    //     together inside a single small withTransaction. Locks are
    //     released between batches (concurrent writers can interleave),
    //     and phase+stamp always commit atomically per batch.
    const batches = chunkArray(permitUpdates, PERMIT_BATCH_SIZE);
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const sql = buildPermitUpdateSQL(batch.length);
      const params = flattenPermitBatch(batch);
      const batchPnums = batch.map((r) => r.permit_num);
      const batchRnums = batch.map((r) => r.revision_num);

      await pipeline.withTransaction(pool, async (client) => {
        // (a) Phase/stalled UPDATE — IS DISTINCT FROM guards skip
        // rows whose values are already correct, avoiding write
        // amplification. result.rowCount counts only actually-changed
        // rows, which is the metric operators care about.
        const result = await client.query(sql, params);
        permitsUpdated += result.rowCount || 0;

        // (b) Stamp classified_at for every row in this batch that is
        // still dirty (last_seen_at > classified_at). This covers both
        // (i) rows just updated by (a) — redundant, idempotent — and
        // (ii) rows (a) skipped because phase was already correct.
        // Running under the same transaction means operators never see
        // a "phase updated but stamp missing" state.
        await client.query(
          `UPDATE permits
              SET lifecycle_classified_at = NOW()
            FROM unnest($1::text[], $2::text[]) AS t(permit_num, revision_num)
           WHERE permits.permit_num = t.permit_num
             AND permits.revision_num = t.revision_num
             AND (permits.lifecycle_classified_at IS NULL
                  OR permits.last_seen_at > permits.lifecycle_classified_at)`,
          [batchPnums, batchRnums],
        );
      });

      // Progress log every 50 batches
      if ((i + 1) % 50 === 0 || i === batches.length - 1) {
        pipeline.log.info(
          '[classify-lifecycle-phase]',
          `Permits batch ${i + 1}/${batches.length} (${permitsUpdated.toLocaleString()} updated so far)`,
        );
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Phase 2: classify dirty CoA rows
  // ═══════════════════════════════════════════════════════════
  pipeline.log.info('[classify-lifecycle-phase]', 'Querying dirty CoAs...');
  const coaResult = await pool.query(
    `SELECT id, decision, linked_permit_num, status, last_seen_at
       FROM coa_applications
      WHERE lifecycle_classified_at IS NULL
         OR last_seen_at > lifecycle_classified_at`,
  );
  const dirtyCoAs = coaResult.rows;
  pipeline.log.info(
    '[classify-lifecycle-phase]',
    `Dirty CoAs: ${dirtyCoAs.length.toLocaleString()}`,
  );

  const coaUpdates = dirtyCoAs.map((row) => {
    const result = classifyCoaPhase({
      decision: row.decision,
      linked_permit_num: row.linked_permit_num,
      status: row.status,
    });
    return { id: row.id, phase: result.phase };
  });

  let coasUpdated = 0;
  if (coaUpdates.length > 0) {
    // Per-batch small transactions — same design as the permit path.
    // Phase UPDATE + per-batch classified_at stamp run under a single
    // withTransaction so partial commits are impossible.
    const batches = chunkArray(coaUpdates, COA_BATCH_SIZE);
    for (const batch of batches) {
      const sql = buildCoaUpdateSQL(batch.length);
      const params = flattenCoaBatch(batch);
      const batchIds = batch.map((r) => r.id);

      await pipeline.withTransaction(pool, async (client) => {
        const result = await client.query(sql, params);
        coasUpdated += result.rowCount || 0;

        await client.query(
          `UPDATE coa_applications
              SET lifecycle_classified_at = NOW()
            WHERE id = ANY($1::int[])
              AND (lifecycle_classified_at IS NULL
                   OR last_seen_at > lifecycle_classified_at)`,
          [batchIds],
        );
      });
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Phase 3: distribution telemetry + blocking unclassified check
  // ═══════════════════════════════════════════════════════════
  const { rows: distRows } = await pool.query(
    `SELECT lifecycle_phase, COUNT(*)::int AS n
       FROM permits
      GROUP BY lifecycle_phase
      ORDER BY lifecycle_phase NULLS LAST`,
  );
  const phaseDistribution = {};
  for (const r of distRows) {
    phaseDistribution[r.lifecycle_phase === null ? 'null' : r.lifecycle_phase] = r.n;
  }

  const { rows: coaDistRows } = await pool.query(
    `SELECT lifecycle_phase, COUNT(*)::int AS n
       FROM coa_applications
      GROUP BY lifecycle_phase`,
  );
  const coaDistribution = {};
  for (const r of coaDistRows) {
    coaDistribution[r.lifecycle_phase === null ? 'null' : r.lifecycle_phase] = r.n;
  }

  const { rows: stalledRows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM permits WHERE lifecycle_stalled = true`,
  );
  const stalledCount = stalledRows[0].n;

  // Unclassified count — uses DEAD_STATUS_ARRAY from the shared lib
  // (single source of truth) instead of hardcoding 13 statuses inline.
  // See WF3 Bug #4 (drift risk from 3 independent copies).
  //
  // Note `TRIM(status) <> ''`: the JS classifier's `normalizeStatus`
  // trims whitespace-only statuses to null BEFORE checking the dead
  // set, so whitespace-only rows get phase=null but should be excluded
  // from the unclassified count. See independent review Defect 2.
  const { rows: unclPermitRows } = await pool.query(
    `SELECT COUNT(*)::int AS n
       FROM permits
      WHERE lifecycle_phase IS NULL
        AND status <> ALL($1::text[])
        AND status IS NOT NULL
        AND TRIM(status) <> ''`,
    [DEAD_STATUS_ARRAY],
  );
  // WF3 Bug #3: also check CoA unclassified count. The CoA classifier
  // can silently leave rows with NULL phase if the decision-matching
  // logic breaks. Dead CoA decisions are excluded via the shared
  // NORMALIZED_DEAD_DECISIONS_ARRAY.
  const { rows: unclCoaRows } = await pool.query(
    `SELECT COUNT(*)::int AS n
       FROM coa_applications
      WHERE lifecycle_phase IS NULL
        AND linked_permit_num IS NULL
        AND lower(trim(regexp_replace(COALESCE(decision,''), '\\s+', ' ', 'g')))
            <> ALL($1::text[])
        AND decision IS NOT NULL
        AND TRIM(decision) <> ''`,
    [NORMALIZED_DEAD_DECISIONS_ARRAY],
  );
  const unclassifiedCount = unclPermitRows[0].n + unclCoaRows[0].n;

  // Build audit_table rows for the admin dashboard
  const auditRows = [
    { metric: 'permits_dirty', value: dirtyPermits.length, threshold: null, status: 'INFO' },
    { metric: 'permits_updated', value: permitsUpdated, threshold: null, status: 'INFO' },
    { metric: 'coas_dirty', value: dirtyCoAs.length, threshold: null, status: 'INFO' },
    { metric: 'coas_updated', value: coasUpdated, threshold: null, status: 'INFO' },
    { metric: 'stalled_count', value: stalledCount, threshold: null, status: 'INFO' },
    {
      metric: 'unclassified_count',
      value: unclassifiedCount,
      threshold: '<= 100',
      status: unclassifiedCount <= 100 ? 'PASS' : 'FAIL',
    },
  ];

  // Log unclassified details if the threshold failed so operators can
  // see which statuses are missing from the decision tree.
  if (unclassifiedCount > 100) {
    const { rows: unclassifiedByStatus } = await pool.query(
      `SELECT status, COUNT(*)::int AS n
         FROM permits
        WHERE lifecycle_phase IS NULL
          AND status <> ALL($1::text[])
          AND status IS NOT NULL
          AND TRIM(status) <> ''
        GROUP BY status
        ORDER BY n DESC
        LIMIT 20`,
      [DEAD_STATUS_ARRAY],
    );
    pipeline.log.warn(
      '[classify-lifecycle-phase]',
      `BLOCKING: unclassified count ${unclassifiedCount} > 100. Top unhandled statuses:`,
      { unclassifiedByStatus },
    );
  }

  pipeline.emitSummary({
    records_total: dirtyPermits.length + dirtyCoAs.length,
    records_new: 0,
    records_updated: permitsUpdated + coasUpdated,
    records_meta: {
      permits_updated: permitsUpdated,
      coas_updated: coasUpdated,
      phase_distribution: phaseDistribution,
      coa_distribution: coaDistribution,
      stalled_count: stalledCount,
      unclassified_count: unclassifiedCount,
      audit_table: {
        phase: 21, // visual ordering in admin dashboard, after assert_engine_health
        name: 'Classify Lifecycle Phase',
        verdict: unclassifiedCount <= 100 ? 'PASS' : 'FAIL',
        rows: auditRows,
      },
    },
  });

  pipeline.emitMeta(
    {
      permits: [
        'permit_num',
        'revision_num',
        'status',
        'enriched_status',
        'issued_date',
        'last_seen_at',
        'lifecycle_classified_at',
      ],
      permit_inspections: ['permit_num', 'stage_name', 'status', 'inspection_date'],
      coa_applications: [
        'id',
        'decision',
        'linked_permit_num',
        'status',
        'last_seen_at',
        'lifecycle_classified_at',
      ],
    },
    {
      permits: ['lifecycle_phase', 'lifecycle_stalled', 'lifecycle_classified_at'],
      coa_applications: ['lifecycle_phase', 'lifecycle_classified_at'],
    },
  );

  // If unclassified threshold breached, emit a non-zero error so the
  // pipeline_runs row shows as FAIL. This is how the CQA gate operates.
  if (unclassifiedCount > 100) {
    throw new Error(
      `BLOCKING: ${unclassifiedCount} unclassified permits exceed threshold of 100. See log for top unhandled statuses.`,
    );
  }
  } finally {
    // Release advisory lock on the SAME dedicated client that acquired
    // it, then return the client to the pool. The lock is session-level
    // so releasing on a different connection would be a no-op.
    try {
      await lockClient.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID]);
    } catch (unlockErr) {
      pipeline.log.warn(
        '[classify-lifecycle-phase]',
        'Failed to release advisory lock — it will expire when the session ends.',
        { err: unlockErr instanceof Error ? unlockErr.message : String(unlockErr) },
      );
    } finally {
      lockClient.release();
    }
  }
});
