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
  // pg_try_advisory_lock returns true/false immediately. If another
  // instance holds the lock we emit a no-op summary and exit 0 so the
  // chain step still shows PASS — the already-running instance will
  // finish whatever work is dirty.
  const { rows: lockRows } = await pool.query(
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
    return;
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
  //   3. Load inspection rollups (94K rows) and build a Map<permit_num,
  //      { latest_passed_stage, latest_inspection_date, has_passed }>
  //   4. Classify each dirty permit in JS using the two Maps

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

  // Build inspection rollup map in one pass across permit_inspections
  pipeline.log.info('[classify-lifecycle-phase]', 'Building inspection rollup map...');
  const inspResult = await pool.query(
    `SELECT permit_num, stage_name, status, inspection_date
       FROM permit_inspections`,
  );
  const inspByPermit = new Map();
  for (const row of inspResult.rows) {
    let agg = inspByPermit.get(row.permit_num);
    if (!agg) {
      agg = {
        latest_passed_stage: null,
        latest_passed_date: null,
        latest_inspection_date: null,
        has_passed_inspection: false,
      };
      inspByPermit.set(row.permit_num, agg);
    }
    const d = row.inspection_date ? new Date(row.inspection_date) : null;
    if (d && (!agg.latest_inspection_date || d > agg.latest_inspection_date)) {
      agg.latest_inspection_date = d;
    }
    if (row.status === 'Passed') {
      agg.has_passed_inspection = true;
      if (d && (!agg.latest_passed_date || d > agg.latest_passed_date)) {
        agg.latest_passed_date = d;
        agg.latest_passed_stage = row.stage_name;
      }
    }
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

  // Unclassified count — excludes rows in dead-state set because those
  // legitimately have NULL phase. The "bad" NULL is one where a permit
  // has a non-dead status but fell through every branch. That's what
  // the ≤ 100 threshold protects against.
  //
  // Note `TRIM(status) <> ''`: the JS classifier's `normalizeStatus`
  // trims whitespace-only statuses to null BEFORE checking the dead
  // set, so whitespace-only rows get phase=null but should be excluded
  // from the unclassified count (they are legitimately unclassifiable).
  // Bare `status <> ''` would count `'  '` as unclassified and diverge
  // from `assert-lifecycle-phase-distribution.js` which uses TRIM.
  // See independent review Defect 2.
  const { rows: unclassifiedRows } = await pool.query(
    `SELECT COUNT(*)::int AS n
       FROM permits
      WHERE lifecycle_phase IS NULL
        AND status NOT IN (
          'Cancelled','Revoked','Permit Revoked','Refused','Refusal Notice',
          'Application Withdrawn','Abandoned','Not Accepted','Work Suspended',
          'VIOLATION','Order Issued','Tenant Notice Period','Follow-up Required'
        )
        AND status IS NOT NULL
        AND TRIM(status) <> ''`,
  );
  const unclassifiedCount = unclassifiedRows[0].n;

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
          AND status NOT IN (
            'Cancelled','Revoked','Permit Revoked','Refused','Refusal Notice',
            'Application Withdrawn','Abandoned','Not Accepted','Work Suspended',
            'VIOLATION','Order Issued','Tenant Notice Period','Follow-up Required'
          )
          AND status IS NOT NULL
          AND TRIM(status) <> ''
        GROUP BY status
        ORDER BY n DESC
        LIMIT 20`,
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
    // Always release the advisory lock so a crashed/errored run
    // doesn't block the next chain run. pg_advisory_unlock is
    // idempotent — safe to call even if we weren't the holder.
    try {
      await pool.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID]);
    } catch (unlockErr) {
      pipeline.log.warn(
        '[classify-lifecycle-phase]',
        'Failed to release advisory lock — it will expire when the session ends.',
        { err: unlockErr instanceof Error ? unlockErr.message : String(unlockErr) },
      );
    }
  }
});
